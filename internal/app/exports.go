package app

import (
	"encoding/csv"
	"encoding/json"
	"errors"
	"net/http"
	"strings"
	"time"
)

type downloadExport struct {
	Name, Content, Type string
	Expires             time.Time
}

func (a *App) prepareExport(w http.ResponseWriter, r *http.Request) {
	r.Body = http.MaxBytesReader(w, r.Body, 128<<10)
	var req struct {
		Name    string `json:"name"`
		Content string `json:"content"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		problem(w, 400, errors.New("Некорректный экспорт"))
		return
	}
	mime := "application/json; charset=utf-8"
	switch req.Name {
	case "samal-preferences.json":
		var payload struct {
			Format      string         `json:"format"`
			Version     int            `json:"version"`
			Preferences map[string]any `json:"preferences"`
		}
		if json.Unmarshal([]byte(req.Content), &payload) != nil || payload.Format != "samal-preferences" || payload.Version != 1 || payload.Preferences == nil {
			problem(w, 422, errors.New("Некорректный файл настроек SAMAL"))
			return
		}
	case "samal-comparison.csv":
		rows, err := csv.NewReader(strings.NewReader(req.Content)).ReadAll()
		if err != nil || len(rows) < 2 || len(rows) > 49 || strings.Join(rows[0], ",") != "time,turbine_id,run_a,run_b,power_a,power_b,difference_b_minus_a" {
			problem(w, 422, errors.New("Некорректные данные сравнения"))
			return
		}
		mime = "text/csv; charset=utf-8"
	default:
		problem(w, 400, errors.New("Неизвестный формат экспорта"))
		return
	}
	a.exportsMu.Lock()
	defer a.exportsMu.Unlock()
	if a.exports == nil {
		a.exports = map[string]downloadExport{}
	}
	for key, value := range a.exports {
		if time.Now().After(value.Expires) {
			delete(a.exports, key)
		}
	}
	if len(a.exports) >= 32 {
		var oldest string
		for key, value := range a.exports {
			if oldest == "" || value.Expires.Before(a.exports[oldest].Expires) {
				oldest = key
			}
		}
		delete(a.exports, oldest)
	}
	key := id()
	a.exports[key] = downloadExport{req.Name, req.Content, mime, time.Now().Add(10 * time.Minute)}
	respond(w, 201, map[string]string{"url": "/api/exports/" + key})
}
func (a *App) serveExport(w http.ResponseWriter, r *http.Request) {
	a.exportsMu.Lock()
	file, ok := a.exports[r.PathValue("id")]
	a.exportsMu.Unlock()
	if !ok || time.Now().After(file.Expires) {
		problem(w, 404, errors.New("Файл экспорта устарел. Создайте его ещё раз"))
		return
	}
	w.Header().Set("Content-Type", file.Type)
	w.Header().Set("Content-Disposition", `attachment; filename="`+file.Name+`"`)
	w.Write([]byte(file.Content))
}
