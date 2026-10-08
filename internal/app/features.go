package app

import (
	"database/sql"
	"errors"
	"io"
	"net/http"
	"strconv"
	"strings"
)

func (a *App) cancelRun(w http.ResponseWriter, r *http.Request) {
	a.activeMu.Lock()
	defer a.activeMu.Unlock()
	run, err := a.getRun(r.PathValue("id"))
	if err != nil {
		problem(w, 404, errors.New("Расчёт не найден"))
		return
	}
	if run.Status != "running" || a.activeID != run.ID || a.activeCancel == nil {
		problem(w, 409, errors.New("Расчёт уже завершён"))
		return
	}
	a.activeCancel()
	respond(w, 202, map[string]string{"status": "cancelling"})
}

type PreviewRow struct {
	Time        string  `json:"time"`
	Wind        float64 `json:"wind"`
	Power       float64 `json:"power"`
	Temperature float64 `json:"temperature"`
	Status      string  `json:"status"`
}
type ImportPreview struct {
	Rows          int          `json:"rows"`
	Added         int          `json:"added"`
	Duplicates    int          `json:"duplicates"`
	Conflicts     int          `json:"conflicts"`
	First         string       `json:"first"`
	Last          string       `json:"last"`
	Samples       []PreviewRow `json:"samples"`
	ConflictTimes []string     `json:"conflict_times"`
}

func (a *App) previewData(turbine int, data []byte, choices ...ImportOptions) (ImportPreview, error) {
	out := ImportPreview{Samples: []PreviewRow{}, ConflictTimes: []string{}}
	station, err := a.turbine(turbine)
	if err != nil {
		return out, err
	}
	options := ImportOptions{}
	if len(choices) > 0 {
		options = choices[0]
	}
	observations, err := parseMappedCSV(strings.NewReader(string(data)), options, station)
	if err != nil {
		return out, err
	}
	// A single read transaction makes the entire preview internally consistent.
	tx, err := a.db.Begin()
	if err != nil {
		return out, err
	}
	defer tx.Rollback()
	lookup, err := tx.Prepare("SELECT wind,power,temperature FROM observations WHERE turbine_id=? AND time=?")
	if err != nil {
		return out, err
	}
	defer lookup.Close()
	seen := map[string]bool{}
	for _, o := range observations {
		out.Rows++
		if out.First == "" || o.Time < out.First {
			out.First = o.Time
		}
		if o.Time > out.Last {
			out.Last = o.Time
		}
		status := "new"
		var w, p, t float64
		err := lookup.QueryRow(turbine, o.Time).Scan(&w, &p, &t)
		if err != nil && err != sql.ErrNoRows {
			return out, err
		}
		if err == nil && (w != o.Wind || p != o.Power || t != o.Temperature) {
			status = "conflict"
			out.Conflicts++
			if len(out.ConflictTimes) < 10 {
				out.ConflictTimes = append(out.ConflictTimes, o.Time)
			}
		} else if err == nil || seen[o.Time] {
			status = "duplicate"
			out.Duplicates++
		} else {
			out.Added++
		}
		seen[o.Time] = true
		if len(out.Samples) < 5 {
			out.Samples = append(out.Samples, PreviewRow{o.Time, o.Wind, o.Power, o.Temperature, status})
		}
	}
	return out, nil
}
func (a *App) previewImport(w http.ResponseWriter, r *http.Request) {
	r.Body = http.MaxBytesReader(w, r.Body, 50<<20)
	if err := r.ParseMultipartForm(8 << 20); err != nil {
		problem(w, 400, errors.New("Не удалось прочитать загрузку. Максимальный размер — 50 МБ"))
		return
	}
	if r.MultipartForm != nil {
		defer r.MultipartForm.RemoveAll()
	}
	f, _, err := r.FormFile("file")
	if err != nil {
		problem(w, 400, errors.New("Выберите CSV-файл"))
		return
	}
	defer f.Close()
	data, err := io.ReadAll(f)
	if err != nil {
		problem(w, 400, err)
		return
	}
	turbine, _ := strconv.Atoi(r.FormValue("turbine_id"))
	options, err := readImportOptions(r)
	if err != nil {
		problem(w, 422, err)
		return
	}
	out, err := a.previewData(turbine, data, options)
	if err != nil {
		problem(w, 422, err)
		return
	}
	respond(w, 200, out)
}
