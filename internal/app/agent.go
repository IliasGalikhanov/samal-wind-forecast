package app

import (
	"bufio"
	"bytes"
	"context"
	"encoding/csv"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"time"
)

type RunRequest struct {
	Mode         string `json:"mode,omitempty"`
	Horizon      int    `json:"horizon"`
	Origin       string `json:"origin"`
	ReplayDays   int    `json:"replay_days,omitempty"`
	ForceRetrain bool   `json:"force_retrain,omitempty"`
}

func (a *App) start(req RunRequest, trigger string) (Run, error) {
	if !a.work.TryLock() {
		return Run{}, errors.New("Уже выполняется импорт или расчёт. Дождитесь завершения")
	}
	return a.startLocked(req, trigger)
}

// startLocked either transfers the work lock to the worker or releases it on error.
func (a *App) startLocked(req RunRequest, trigger string) (Run, error) {
	fail := func(err error) (Run, error) { a.work.Unlock(); return Run{}, err }
	if req.Horizon != 24 && req.Horizon != 48 {
		return fail(errors.New("Горизонт должен быть 24 или 48 часов"))
	}
	settings := a.weatherSettings()
	if req.Mode != "" && req.Mode != "live" && req.Mode != "dataset" {
		return fail(errors.New("Неизвестный режим прогноза"))
	}
	if req.Mode != "" {
		settings.OriginMode = req.Mode
	} else if req.Origin != "" || req.ReplayDays > 1 {
		settings.OriginMode = "dataset"
	}
	if settings.OriginMode == "live" && !settings.Enabled {
		return fail(errors.New("Для текущего прогноза включите получение погоды в настройках"))
	}
	req.Mode = settings.OriginMode
	if req.ReplayDays == 0 {
		req.ReplayDays = 1
	}
	if req.ReplayDays < 1 || req.ReplayDays > 31 || (!settings.Enabled && req.ReplayDays > 1) {
		return fail(errors.New("Повторные прогнозы требуют погоды и периода от 1 до 31 дня"))
	}
	if req.Mode == "live" && req.ReplayDays != 1 {
		return fail(errors.New("Ежедневный повтор доступен только в историческом режиме"))
	}
	var last string
	err := a.db.QueryRow("SELECT coalesce(max(time),'') FROM observations").Scan(&last)
	if err != nil {
		return fail(err)
	}
	if last == "" {
		return fail(errors.New("Сначала загрузите измерения"))
	}
	lastTime, _ := time.Parse("2006-01-02 15:04:05", last)
	base := lastTime.Truncate(time.Hour).Add(time.Hour)
	origin := base
	if settings.Enabled && settings.OriginMode == "live" && req.Origin == "" {
		zone, _ := time.LoadLocation(settings.Timezone)
		local := time.Now().In(zone).Truncate(time.Hour).Add(time.Hour)
		origin, _ = time.Parse("2006-01-02 15:04:05", local.Format("2006-01-02 15:04:05"))
		if origin.Before(base) {
			return fail(errors.New("Загруженные измерения находятся в будущем относительно выбранного часового пояса"))
		}
	}
	if req.Origin != "" {
		origin, err = time.Parse("2006-01-02T15:04", req.Origin)
		if err != nil || origin.Minute() != 0 {
			return fail(errors.New("Укажите начало прогноза с точностью до целого часа"))
		}
		zone, _ := time.LoadLocation(settings.Timezone)
		maximum := base.AddDate(0, 0, 90)
		if settings.Enabled {
			local := time.Now().In(zone).Add(48 * time.Hour)
			maximum, _ = time.Parse("2006-01-02 15:04:05", local.Format("2006-01-02 15:04:05"))
		}
		if origin.Before(base) || origin.After(maximum) {
			return fail(errors.New("Начало прогноза должно быть после последних измерений и в доступном погодном горизонте"))
		}
	}
	if req.Mode == "live" {
		zone, _ := time.LoadLocation(settings.Timezone)
		nowLocal, _ := time.Parse("2006-01-02 15:04:05", time.Now().In(zone).Format("2006-01-02 15:04:05"))
		if origin.Before(nowLocal.Truncate(time.Hour)) || origin.After(nowLocal.Add(48*time.Hour)) {
			return fail(errors.New("Текущий прогноз должен начинаться в ближайшие 48 часов"))
		}
	}
	req.Origin = origin.Format("2006-01-02T15:04")
	if req.ReplayDays > 1 {
		zone, _ := time.LoadLocation(settings.Timezone)
		localNow, _ := time.Parse("2006-01-02 15:04:05", time.Now().In(zone).Format("2006-01-02 15:04:05"))
		if origin.AddDate(0, 0, req.ReplayDays-1).After(localNow) {
			return fail(errors.New("Все моменты ежедневных повторных прогнозов должны находиться в прошлом"))
		}
	}
	run := Run{ID: id(), Status: "running", Created: now(), Trigger: trigger, Horizon: req.Horizon, Origin: origin.Format("2006-01-02 15:04:05"), Step: "Подготовка снимка данных", Events: []Event{}}
	_, err = a.db.Exec("INSERT INTO runs(id,status,created,trigger,horizon,origin,step) VALUES(?,?,?,?,?,?,?)", run.ID, run.Status, run.Created, run.Trigger, run.Horizon, run.Origin, run.Step)
	if err != nil {
		return fail(err)
	}
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Minute)
	a.activeMu.Lock()
	a.activeID, a.activeCancel = run.ID, cancel
	a.activeMu.Unlock()
	a.life.Add(1)
	go func() {
		defer a.life.Done()
		defer a.work.Unlock()
		defer cancel()
		defer func() { a.activeMu.Lock(); a.activeID, a.activeCancel = "", nil; a.activeMu.Unlock() }()
		a.executeRequest(ctx, run, req, settings)
	}()
	return run, nil
}
func (a *App) event(runID, message string) {
	r, err := a.getRun(runID)
	if err != nil {
		return
	}
	r.Events = append(r.Events, Event{At: now(), Message: message})
	events, _ := json.Marshal(r.Events)
	_, _ = a.db.Exec("UPDATE runs SET step=?,events=? WHERE id=?", message, string(events), runID)
}
func (a *App) fail(runID string, err error) {
	a.event(runID, "Расчёт остановлен")
	_, _ = a.db.Exec("UPDATE runs SET status='failed',error=? WHERE id=?", err.Error(), runID)
}
func (a *App) snapshot(path string) error {
	f, err := os.Create(path)
	if err != nil {
		return err
	}
	defer f.Close()
	writer := csv.NewWriter(f)
	if err = writer.Write([]string{"turbine_id", "time", "wind", "power", "temperature", "sample_minutes"}); err != nil {
		return err
	}
	rows, err := a.db.Query("SELECT o.turbine_id,o.time,o.wind,o.power,o.temperature,t.sample_minutes FROM observations o JOIN turbines t ON t.id=o.turbine_id ORDER BY o.turbine_id,o.time")
	if err != nil {
		return err
	}
	defer rows.Close()
	for rows.Next() {
		var turbine, minutes int
		var t string
		var w, p, temp float64
		if err = rows.Scan(&turbine, &t, &w, &p, &temp, &minutes); err != nil {
			return err
		}
		if err = writer.Write([]string{strconv.Itoa(turbine), t, strconv.FormatFloat(w, 'g', -1, 64), strconv.FormatFloat(p, 'g', -1, 64), strconv.FormatFloat(temp, 'g', -1, 64), strconv.Itoa(minutes)}); err != nil {
			return err
		}
	}
	writer.Flush()
	if err = rows.Err(); err != nil {
		return err
	}
	return writer.Error()
}
func (a *App) execute(ctx context.Context, run Run) {
	a.executeRequest(ctx, run, RunRequest{Horizon: run.Horizon, Origin: run.Origin, ReplayDays: 1}, WeatherSettings{Enabled: false})
}
func (a *App) executeRequest(ctx context.Context, run Run, request RunRequest, settings WeatherSettings) {
	defer func() {
		if errors.Is(ctx.Err(), context.Canceled) {
			a.event(run.ID, "Расчёт отменён пользователем")
			_, _ = a.db.Exec("UPDATE runs SET status='cancelled',error='' WHERE id=? AND status!='completed'", run.ID)
		}
	}()
	folder := filepath.Join(a.root, "runtime", "runs", run.ID)
	if err := os.MkdirAll(folder, 0755); err != nil {
		a.fail(run.ID, err)
		return
	}
	requestData, _ := json.Marshal(request)
	if err := os.WriteFile(filepath.Join(folder, "request.json"), requestData, 0644); err != nil {
		a.fail(run.ID, err)
		return
	}
	a.event(run.ID, "Создана версия входных данных")
	input := filepath.Join(folder, "input.csv")
	if err := a.snapshot(input); err != nil {
		a.fail(run.ID, err)
		return
	}
	if ctx.Err() != nil {
		return
	}
	worker := "worker.py"
	args := []string{"--input", input, "--output", filepath.Join(folder, "result.json"), "--horizon", strconv.Itoa(run.Horizon), "--origin", run.Origin}
	if settings.Enabled {
		if err := a.weatherConfig(folder, settings); err != nil {
			a.fail(run.ID, err)
			return
		}
		worker = "weather_worker.py"
		args = append(args, "--config", filepath.Join(folder, "weather-config.json"), "--replay-days", strconv.Itoa(request.ReplayDays))
		if request.ForceRetrain {
			args = append(args, "--force-retrain")
		}
	}
	cmd := exec.CommandContext(ctx, a.python, append([]string{filepath.Join(a.root, "ml", worker)}, args...)...)
	cmd.Dir = a.root
	cmd.Env = append(os.Environ(), "PYTHONUTF8=1", "PYTHONIOENCODING=utf-8")
	var stderr bytes.Buffer
	cmd.Stderr = &stderr
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		a.fail(run.ID, err)
		return
	}
	if err = cmd.Start(); err != nil {
		a.fail(run.ID, fmt.Errorf("Не удалось запустить Python. Выполните setup.ps1: %w", err))
		return
	}
	scan := bufio.NewScanner(stdout)
	scan.Buffer(make([]byte, 4096), 1024*1024)
	for scan.Scan() {
		var event struct {
			Message string `json:"message"`
		}
		if json.Unmarshal(scan.Bytes(), &event) == nil && event.Message != "" {
			a.event(run.ID, event.Message)
		}
	}
	scanErr := scan.Err()
	err = cmd.Wait()
	_ = os.WriteFile(filepath.Join(folder, "worker.log"), stderr.Bytes(), 0644)
	if err != nil || scanErr != nil {
		message := strings.TrimSpace(stderr.String())
		if len(message) > 1800 {
			message = message[len(message)-1800:]
		}
		if message == "" {
			message = fmt.Sprintf("%v", err)
		}
		if ctx.Err() != nil {
			message = "Расчёт превысил лимит 30 минут"
		}
		a.fail(run.ID, errors.New(message))
		return
	}
	result, err := os.ReadFile(filepath.Join(folder, "result.json"))
	if err != nil || !json.Valid(result) {
		a.fail(run.ID, errors.New("Модель не вернула корректный результат"))
		return
	}
	stations, err := a.turbines()
	if err == nil {
		err = validateResult(result, run, stations)
	}
	if err != nil {
		a.fail(run.ID, err)
		return
	}
	a.activeMu.Lock()
	defer a.activeMu.Unlock()
	if ctx.Err() != nil {
		return
	}
	a.event(run.ID, "Прогноз проверен и сохранён")
	_, err = a.db.Exec("UPDATE runs SET status='completed',result=? WHERE id=?", string(result), run.ID)
	if err != nil {
		a.fail(run.ID, err)
	}
}
