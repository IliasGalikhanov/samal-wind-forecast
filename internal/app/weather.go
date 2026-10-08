package app

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"time"
	_ "time/tzdata"
)

type WeatherSettings struct {
	Enabled     bool   `json:"enabled"`
	Timezone    string `json:"timezone"`
	OriginMode  string `json:"origin_mode"`
	AutoRefresh bool   `json:"auto_refresh"`
}

func defaultWeatherSettings() WeatherSettings {
	return WeatherSettings{Enabled: true, Timezone: "Asia/Almaty", OriginMode: "live", AutoRefresh: true}
}

func (a *App) weatherSettings() WeatherSettings {
	settings := defaultWeatherSettings()
	var value string
	if a.db.QueryRow("SELECT value FROM settings WHERE key='weather'").Scan(&value) == nil {
		_ = json.Unmarshal([]byte(value), &settings)
	}
	if a.demo {
		settings.Enabled = true
	}
	return settings
}

func validWeatherSettings(s WeatherSettings) bool {
	_, err := time.LoadLocation(s.Timezone)
	return s.Timezone != "" && s.Timezone != "Local" && err == nil && (s.OriginMode == "dataset" || s.OriginMode == "live") && (s.Enabled || s.OriginMode == "dataset")
}

func (a *App) getWeatherSettings(w http.ResponseWriter, r *http.Request) {
	respond(w, 200, a.weatherSettings())
}

func (a *App) updateWeatherSettings(w http.ResponseWriter, r *http.Request) {
	var settings WeatherSettings
	if json.NewDecoder(io.LimitReader(r.Body, 8192)).Decode(&settings) != nil || !validWeatherSettings(settings) {
		problem(w, 400, errors.New("Некорректные настройки погоды или часового пояса"))
		return
	}
	if a.demo {
		settings.Enabled = true
	}
	if !a.work.TryLock() {
		problem(w, 409, errors.New("Дождитесь завершения текущего расчёта или импорта"))
		return
	}
	defer a.work.Unlock()
	if settings.Timezone != a.weatherSettings().Timezone {
		var count int
		if err := a.db.QueryRow("SELECT count(*) FROM observations").Scan(&count); err != nil {
			problem(w, 500, err)
			return
		}
		if count > 0 {
			problem(w, 409, errors.New("Часовой пояс зафиксирован после импорта. Приведите следующие CSV к текущему часовому поясу станции"))
			return
		}
	}
	data, _ := json.Marshal(settings)
	if _, err := a.db.Exec("INSERT INTO settings(key,value) VALUES('weather',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value", string(data)); err != nil {
		problem(w, 500, err)
		return
	}
	respond(w, 200, settings)
}

func (a *App) weatherConfig(folder string, settings WeatherSettings) error {
	stations, err := a.turbines()
	if err != nil {
		return err
	}
	coordinates := make([]map[string]any, 0, len(stations))
	for _, station := range stations {
		coordinates = append(coordinates, map[string]any{"id": station.ID, "latitude": station.Latitude, "longitude": station.Longitude})
	}
	data, err := json.Marshal(map[string]any{"timezone": settings.Timezone, "mode": settings.OriginMode, "cache": filepath.Join(a.root, "runtime", "weather-cache"), "models": filepath.Join(a.root, "runtime", "models"), "stations": coordinates, "synthetic": a.demo})
	if err != nil {
		return err
	}
	return os.WriteFile(filepath.Join(folder, "weather-config.json"), data, 0644)
}

// The live mode is a user-selected setting. Historical runs remain tied to the
// uploaded dataset; importing new observations already triggers the same cycle.
func (a *App) startWeatherLoop() {
	ctx, cancel := context.WithCancel(context.Background())
	a.weatherCancel = cancel
	a.weatherLife.Add(1)
	go func() {
		defer a.weatherLife.Done()
		ticker := time.NewTicker(time.Minute)
		defer ticker.Stop()
		var attempted time.Time
		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
			}
			s := a.weatherSettings()
			if !s.Enabled || !s.AutoRefresh || s.OriginMode != "live" || time.Since(attempted) < time.Hour {
				continue
			}
			var created string
			zone, _ := time.LoadLocation(s.Timezone)
			recentOrigin := time.Now().In(zone).Add(-6 * time.Hour).Format("2006-01-02 15:04:05")
			_ = a.db.QueryRow("SELECT created FROM runs WHERE status='completed' AND (trigger='weather_update' OR origin>=?) ORDER BY created DESC LIMIT 1", recentOrigin).Scan(&created)
			last, _ := time.Parse(time.RFC3339, created)
			if time.Since(last) < 6*time.Hour {
				continue
			}
			if ctx.Err() != nil {
				return
			}
			attempted = time.Now()
			_, _ = a.start(RunRequest{Horizon: 48, Mode: "live"}, "weather_update")
		}
	}()
}

func (a *App) exportWeatherArtifact(w http.ResponseWriter, r *http.Request) {
	run, err := a.getRun(r.PathValue("id"))
	if err != nil || run.Status != "completed" {
		problem(w, 404, errors.New("Готовый прогноз не найден"))
		return
	}
	name := r.PathValue("artifact")
	if name != "replay.csv" && name != "weather.json" && name != "weather-forecast.json" {
		problem(w, 404, errors.New("Файл не найден"))
		return
	}
	path := filepath.Join(a.root, "runtime", "runs", run.ID, name)
	if _, err = os.Stat(path); err != nil {
		problem(w, 404, errors.New("Файл не найден"))
		return
	}
	w.Header().Set("Content-Disposition", `attachment; filename="samal-`+name+`"`)
	http.ServeFile(w, r, path)
}
