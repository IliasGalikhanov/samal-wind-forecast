package app

import (
	"crypto/sha256"
	"encoding/csv"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"math"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"
)

var headers = []string{"ID", "Статистическое время", "Средняя скорость ветра(m/s)", "Нормализованная активная мощность", "Средняя температура окружающей среды(°C)"}

type Observation struct {
	Time                     string
	Wind, Power, Temperature float64
}
type ImportResult struct {
	ID         string `json:"id"`
	TurbineID  int    `json:"turbine_id"`
	Name       string `json:"name"`
	Created    string `json:"created"`
	Rows       int    `json:"rows"`
	Added      int    `json:"added"`
	Duplicates int    `json:"duplicates"`
	SHA        string `json:"sha256"`
	RunID      string `json:"run_id,omitempty"`
}

func parseCSV(reader io.Reader) ([]Observation, error) {
	return parseMappedCSV(reader, ImportOptions{}, Turbine{SampleMinutes: 10})
}

func parseMappedCSV(reader io.Reader, options ImportOptions, station Turbine) ([]Observation, error) {
	r := csv.NewReader(reader)
	r.Comma = options.separator()
	r.TrimLeadingSpace = true
	head, err := r.Read()
	if err != nil {
		return nil, fmt.Errorf("Не удалось прочитать CSV: %w", err)
	}
	columns, err := options.indices(head)
	if err != nil {
		return nil, err
	}
	divisor, err := options.divisor(station)
	if err != nil {
		return nil, err
	}
	out := []Observation{}
	seen := map[string]Observation{}
	for line := 2; ; line++ {
		row, err := r.Read()
		if errors.Is(err, io.EOF) {
			break
		}
		if err != nil {
			return nil, fmt.Errorf("Строка %d: %w", line, err)
		}
		t, err := time.Parse("2006-01-02 15:04:05", strings.TrimSpace(row[columns[0]]))
		if err != nil {
			return nil, fmt.Errorf("Строка %d: время должно быть в формате ГГГГ-ММ-ДД ЧЧ:ММ:СС", line)
		}
		if t.Minute()%station.SampleMinutes != 0 || t.Second() != 0 {
			return nil, fmt.Errorf("Строка %d: ожидается шаг времени %d минут", line, station.SampleMinutes)
		}
		values := [3]float64{}
		for i := range values {
			v, e := strconv.ParseFloat(strings.ReplaceAll(strings.TrimSpace(row[columns[i+1]]), ",", "."), 64)
			if e != nil || math.IsNaN(v) || math.IsInf(v, 0) {
				return nil, fmt.Errorf("Строка %d: некорректное число в колонке %d", line, columns[i+1]+1)
			}
			values[i] = v
		}
		values[1] /= divisor
		if values[0] < 0 || values[0] > 100 {
			return nil, fmt.Errorf("Строка %d: скорость ветра вне диапазона 0–100 м/с", line)
		}
		if values[1] < 0 || values[1] > 1 {
			return nil, fmt.Errorf("Строка %d: нормализованная мощность должна быть от 0 до 1", line)
		}
		if values[2] < -100 || values[2] > 100 {
			return nil, fmt.Errorf("Строка %d: температура вне диапазона −100…100 °C", line)
		}
		obs := Observation{t.Format("2006-01-02 15:04:05"), values[0], values[1], values[2]}
		if previous, ok := seen[obs.Time]; ok && previous != obs {
			return nil, fmt.Errorf("Строка %d: разные значения для времени %s", line, obs.Time)
		}
		seen[obs.Time] = obs
		out = append(out, obs)
		if len(out) > 1000000 {
			return nil, errors.New("Файл превышает ограничение в 1 000 000 строк")
		}
	}
	if len(out) == 0 {
		return nil, errors.New("В файле нет измерений")
	}
	return out, nil
}

func (a *App) importFile(turbine int, name string, data []byte, choices ...ImportOptions) (ImportResult, error) {
	result := ImportResult{ID: id(), TurbineID: turbine, Name: filepath.Base(name), Created: now()}
	station, err := a.turbine(turbine)
	if err != nil {
		return result, err
	}
	options := ImportOptions{}
	if len(choices) > 0 {
		options = choices[0]
	}
	observations, err := parseMappedCSV(strings.NewReader(string(data)), options, station)
	if err != nil {
		return result, err
	}
	result.Rows = len(observations)
	hash := sha256.Sum256(data)
	result.SHA = hex.EncodeToString(hash[:])
	tx, err := a.db.Begin()
	if err != nil {
		return result, err
	}
	defer tx.Rollback()
	insert, err := tx.Prepare("INSERT OR IGNORE INTO observations(turbine_id,time,wind,power,temperature) VALUES(?,?,?,?,?)")
	if err != nil {
		return result, err
	}
	defer insert.Close()
	for _, o := range observations {
		r, err := insert.Exec(turbine, o.Time, o.Wind, o.Power, o.Temperature)
		if err != nil {
			return result, err
		}
		n, err := r.RowsAffected()
		if err != nil {
			return result, err
		}
		if n == 0 {
			var w, p, t float64
			if err := tx.QueryRow("SELECT wind,power,temperature FROM observations WHERE turbine_id=? AND time=?", turbine, o.Time).Scan(&w, &p, &t); err != nil {
				return result, err
			}
			if w != o.Wind || p != o.Power || t != o.Temperature {
				return result, fmt.Errorf("Значения за %s отличаются от сохранённых. Импорт отменён; проверьте файл и выбранную турбину", o.Time)
			}
			result.Duplicates++
		} else {
			result.Added++
		}
	}
	_, err = tx.Exec("INSERT INTO imports VALUES(?,?,?,?,?,?,?,?)", result.ID, turbine, result.Name, result.Created, result.Rows, result.Added, result.Duplicates, result.SHA)
	if err != nil {
		return result, err
	}
	path := filepath.Join(a.root, "runtime", "uploads", result.ID+".csv")
	if err = os.WriteFile(path, data, 0644); err != nil {
		return result, err
	}
	if err = tx.Commit(); err != nil {
		_ = os.Remove(path)
		return result, err
	}
	return result, nil
}

func (a *App) Seed(dir string) error {
	if _, err := a.db.Exec(exampleTurbines); err != nil {
		return err
	}
	for turbine := 1; turbine <= 2; turbine++ {
		var count int
		if err := a.db.QueryRow("SELECT count(*) FROM observations WHERE turbine_id=?", turbine).Scan(&count); err != nil {
			return err
		}
		if count > 0 {
			continue
		}
		files, err := filepath.Glob(filepath.Join(dir, fmt.Sprintf("*turbine %d.csv", turbine)))
		if err != nil {
			return err
		}
		if len(files) != 1 {
			return fmt.Errorf("Ожидался один CSV для турбины %d в %s", turbine, dir)
		}
		data, err := os.ReadFile(files[0])
		if err != nil {
			return err
		}
		if _, err = a.importFile(turbine, filepath.Base(files[0]), data); err != nil {
			return err
		}
	}
	return nil
}
