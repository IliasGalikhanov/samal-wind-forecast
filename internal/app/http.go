package app

import (
	"database/sql"
	"encoding/csv"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"math"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"
)

func respond(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(value)
}
func problem(w http.ResponseWriter, status int, err error) {
	respond(w, status, map[string]string{"error": err.Error()})
}
func (a *App) Handler() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /api/health", func(w http.ResponseWriter, r *http.Request) {
		respond(w, 200, map[string]string{"status": "ok", "name": "SAMAL"})
	})
	mux.HandleFunc("GET /api/overview", a.overview)
	mux.HandleFunc("POST /api/turbines", a.saveTurbine)
	mux.HandleFunc("POST /api/imports/columns", a.importColumns)
	mux.HandleFunc("GET /api/weather/settings", a.getWeatherSettings)
	mux.HandleFunc("POST /api/weather/settings", a.updateWeatherSettings)
	mux.HandleFunc("GET /api/runs/{id}/artifacts/{artifact}", a.exportWeatherArtifact)
	mux.HandleFunc("GET /api/history", a.history)
	mux.HandleFunc("GET /api/imports", a.imports)
	mux.HandleFunc("POST /api/imports", a.upload)
	mux.HandleFunc("POST /api/imports/preview", a.previewImport)
	mux.HandleFunc("GET /api/backup", a.downloadBackup)
	mux.HandleFunc("POST /api/backup/preview", a.previewBackup)
	mux.HandleFunc("POST /api/backup/restore", a.restoreBackup)
	mux.HandleFunc("GET /api/backup/recovery", a.downloadRecovery)
	mux.HandleFunc("GET /api/backup/status", func(w http.ResponseWriter, r *http.Request) {
		_, err := os.Stat(filepath.Join(a.root, "runtime", "recovery.zip"))
		respond(w, 200, map[string]bool{"recovery_available": err == nil})
	})
	mux.HandleFunc("POST /api/runs/{id}/cancel", a.cancelRun)
	mux.HandleFunc("GET /api/template", a.template)
	mux.HandleFunc("POST /api/exports", a.prepareExport)
	mux.HandleFunc("GET /api/exports/{id}", a.serveExport)
	mux.HandleFunc("GET /api/runs", func(w http.ResponseWriter, r *http.Request) {
		runs, err := a.runs(false)
		if err != nil {
			problem(w, 500, err)
			return
		}
		respond(w, 200, runs)
	})
	mux.HandleFunc("POST /api/runs", func(w http.ResponseWriter, r *http.Request) {
		var req RunRequest
		if err := json.NewDecoder(io.LimitReader(r.Body, 8192)).Decode(&req); err != nil {
			problem(w, 400, errors.New("Некорректные параметры расчёта"))
			return
		}
		run, err := a.start(req, "manual")
		if err != nil {
			problem(w, 409, err)
			return
		}
		respond(w, 202, run)
	})
	mux.HandleFunc("GET /api/runs/{id}", a.run)
	mux.HandleFunc("GET /api/runs/{id}/export", a.export)
	mux.HandleFunc("/api/", func(w http.ResponseWriter, r *http.Request) {
		problem(w, 404, errors.New("Метод API не найден"))
	})
	dist := filepath.Join(a.root, "frontend", "dist")
	files := http.FileServer(http.Dir(dist))
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet && r.Method != http.MethodHead {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}
		path := filepath.Clean(r.URL.Path)
		if strings.Contains(path, "..") {
			http.NotFound(w, r)
			return
		}
		if info, err := os.Stat(filepath.Join(dist, path)); err == nil && !info.IsDir() {
			files.ServeHTTP(w, r)
			return
		}
		if _, err := os.Stat(filepath.Join(dist, "index.html")); err != nil {
			http.Error(w, "Build the frontend: npm run build", 503)
			return
		}
		http.ServeFile(w, r, filepath.Join(dist, "index.html"))
	})
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("X-Frame-Options", "DENY")
		w.Header().Set("Referrer-Policy", "same-origin")
		if strings.HasPrefix(r.URL.Path, "/api/") {
			w.Header().Set("Cache-Control", "no-store")
		}
		if r.Method == "POST" {
			if a.demo && (strings.HasPrefix(r.URL.Path, "/api/turbines") || strings.HasPrefix(r.URL.Path, "/api/imports") || strings.HasPrefix(r.URL.Path, "/api/backup/")) {
				problem(w, 403, errors.New("Деморежим использует только синтетические данные. Для импорта запустите обычное приложение на порту 8080"))
				return
			}
			if r.Header.Get("Sec-Fetch-Site") == "cross-site" {
				problem(w, 403, errors.New("Межсайтовый запрос отклонён"))
				return
			}
		}
		mux.ServeHTTP(w, r)
	})
}
func (a *App) overview(w http.ResponseWriter, r *http.Request) {
	turbines, err := a.turbines()
	if err != nil {
		problem(w, 500, err)
		return
	}
	runs, err := a.runs(false)
	if err != nil {
		problem(w, 500, err)
		return
	}
	var latest any
	var key string
	err = a.db.QueryRow("SELECT id FROM runs WHERE status='completed' ORDER BY created DESC LIMIT 1").Scan(&key)
	if err == nil {
		var completed Run
		completed, err = a.getRun(key)
		if err != nil {
			problem(w, 500, err)
			return
		}
		completed.Evaluation = a.evaluate(completed)
		latest = completed
	} else if err != sql.ErrNoRows {
		problem(w, 500, err)
		return
	}
	settings := a.weatherSettings()
	respond(w, 200, map[string]any{"demo": a.demo, "turbines": turbines, "runs": runs, "latest_run": latest, "timezone": settings.Timezone, "timestamp_convention": "interval_start_assumed", "unit": "normalized_power", "external_weather": settings.Enabled, "weather_settings": settings})
}
func (a *App) history(w http.ResponseWriter, r *http.Request) {
	turbine, _ := strconv.Atoi(r.URL.Query().Get("turbine"))
	days, _ := strconv.Atoi(r.URL.Query().Get("days"))
	if _, err := a.turbine(turbine); err != nil {
		problem(w, 400, errors.New("Некорректная турбина"))
		return
	}
	if days < 1 {
		days = 7
	}
	if days > 90 {
		days = 90
	}
	hours, err := a.hours(turbine, days)
	if err != nil {
		problem(w, 500, err)
		return
	}
	respond(w, 200, hours)
}
func (a *App) imports(w http.ResponseWriter, r *http.Request) {
	rows, err := a.db.Query("SELECT id,turbine_id,name,created,rows,added,duplicates,sha256 FROM imports ORDER BY created DESC, id DESC")
	if err != nil {
		problem(w, 500, err)
		return
	}
	defer rows.Close()
	out := []ImportResult{}
	for rows.Next() {
		var i ImportResult
		if err := rows.Scan(&i.ID, &i.TurbineID, &i.Name, &i.Created, &i.Rows, &i.Added, &i.Duplicates, &i.SHA); err != nil {
			problem(w, 500, err)
			return
		}
		out = append(out, i)
	}
	if err := rows.Err(); err != nil {
		problem(w, 500, err)
		return
	}
	respond(w, 200, out)
}
func (a *App) upload(w http.ResponseWriter, r *http.Request) {
	r.Body = http.MaxBytesReader(w, r.Body, 50<<20)
	if err := r.ParseMultipartForm(8 << 20); err != nil {
		problem(w, 400, errors.New("Не удалось прочитать загрузку. Максимальный размер — 50 МБ"))
		return
	}
	if r.MultipartForm != nil {
		defer r.MultipartForm.RemoveAll()
	}
	turbine, _ := strconv.Atoi(r.FormValue("turbine_id"))
	file, header, err := r.FormFile("file")
	if err != nil {
		problem(w, 400, errors.New("Выберите CSV-файл"))
		return
	}
	defer file.Close()
	if !strings.EqualFold(filepath.Ext(header.Filename), ".csv") {
		problem(w, 400, errors.New("Поддерживается только CSV"))
		return
	}
	data, err := io.ReadAll(file)
	if err != nil {
		problem(w, 400, err)
		return
	}
	if !a.work.TryLock() {
		problem(w, 409, errors.New("Дождитесь завершения текущего расчёта или импорта"))
		return
	}
	options, err := readImportOptions(r)
	if err != nil {
		a.work.Unlock()
		problem(w, 422, err)
		return
	}
	result, err := a.importFile(turbine, header.Filename, data, options)
	if err != nil {
		a.work.Unlock()
		problem(w, 422, err)
		return
	}
	if result.Added > 0 && r.FormValue("auto_run") != "false" {
		horizon, _ := strconv.Atoi(r.FormValue("horizon"))
		if horizon != 24 {
			horizon = 48
		}
		run, err := a.startLocked(RunRequest{Horizon: horizon}, "import")
		if err == nil {
			result.RunID = run.ID
		}
	} else {
		a.work.Unlock()
	}
	respond(w, 201, result)
}
func (a *App) template(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "text/csv; charset=utf-8")
	w.Header().Set("Content-Disposition", `attachment; filename="turbine-template.csv"`)
	_, _ = w.Write([]byte{0xef, 0xbb, 0xbf})
	writer := csv.NewWriter(w)
	_ = writer.Write(headers)
	writer.Flush()
}
func (a *App) run(w http.ResponseWriter, r *http.Request) {
	run, err := a.getRun(r.PathValue("id"))
	if err != nil {
		problem(w, 404, errors.New("Расчёт не найден"))
		return
	}
	if run.Status == "completed" {
		run.Evaluation = a.evaluate(run)
	}
	respond(w, 200, run)
}

type forecast struct {
	Time       string  `json:"time"`
	TurbineID  int     `json:"turbine_id"`
	Prediction float64 `json:"prediction"`
	Model      string  `json:"model"`
}

func (a *App) evaluate(run Run) any {
	var result struct {
		Forecasts []forecast `json:"forecasts"`
	}
	if json.Unmarshal(run.Result, &result) != nil {
		return nil
	}
	count := 0
	absolute, squared := 0., 0.
	for _, p := range result.Forecasts {
		var actual sql.NullFloat64
		var samples int
		start, parseErr := time.Parse("2006-01-02 15:04:05", p.Time)
		if parseErr != nil {
			continue
		}
		err := a.db.QueryRow("SELECT avg(power),count(*) FROM observations WHERE turbine_id=? AND time>=? AND time<?", p.TurbineID, p.Time, start.Add(time.Hour).Format("2006-01-02 15:04:05")).Scan(&actual, &samples)
		station, stationErr := a.turbine(p.TurbineID)
		if err == nil && stationErr == nil && samples == 60/station.SampleMinutes && actual.Valid {
			d := actual.Float64 - p.Prediction
			absolute += math.Abs(d)
			squared += d * d
			count++
		}
	}
	out := map[string]any{"matched": count, "total": len(result.Forecasts), "mae": nil, "rmse": nil}
	if count > 0 {
		out["mae"] = absolute / float64(count)
		out["rmse"] = math.Sqrt(squared / float64(count))
	}
	return out
}
func (a *App) export(w http.ResponseWriter, r *http.Request) {
	run, err := a.getRun(r.PathValue("id"))
	if err != nil || run.Status != "completed" {
		problem(w, 404, errors.New("Готовый прогноз не найден"))
		return
	}
	var result struct {
		Forecasts  []forecast `json:"forecasts"`
		DataSource string     `json:"data_source"`
	}
	if err = json.Unmarshal(run.Result, &result); err != nil {
		problem(w, 500, err)
		return
	}
	w.Header().Set("Content-Type", "text/csv; charset=utf-8")
	w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename="samal-forecast-%s.csv"`, run.ID))
	writer := csv.NewWriter(w)
	if result.DataSource == "" {
		result.DataSource = "user_import"
	}
	_ = writer.Write([]string{"run_id", "issued_at", "forecast_origin_local", "turbine_id", "target_time_local", "normalized_power", "model", "data_source"})
	for _, p := range result.Forecasts {
		_ = writer.Write([]string{run.ID, run.Created, run.Origin, strconv.Itoa(p.TurbineID), p.Time, strconv.FormatFloat(p.Prediction, 'f', 6, 64), p.Model, result.DataSource})
	}
	writer.Flush()
}
