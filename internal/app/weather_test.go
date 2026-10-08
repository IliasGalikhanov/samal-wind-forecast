package app

import (
	"encoding/json"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestWeatherSettingsAndArchiveRoundTrip(t *testing.T) {
	a, err := newFixtureApp(t.TempDir(), "unused")
	if err != nil {
		t.Fatal(err)
	}
	defer a.Close()
	settings := `{"enabled":true,"timezone":"UTC","origin_mode":"dataset","auto_refresh":false}`
	r := httptest.NewRecorder()
	a.Handler().ServeHTTP(r, httptest.NewRequest("POST", "/api/weather/settings", strings.NewReader(settings)))
	if r.Code != 200 || a.weatherSettings().Timezone != "UTC" {
		t.Fatal(r.Code, r.Body.String())
	}
	if err = os.MkdirAll(filepath.Join(a.root, "runtime", "runs", "123"), 0755); err != nil {
		t.Fatal(err)
	}
	for _, name := range []string{"weather.json", "weather-live.json", "weather-training.csv", "weather-forecast.json", "replay.csv", "catboost_weather.cbm", "request.json"} {
		if err = os.WriteFile(filepath.Join(a.root, "runtime", "runs", "123", name), []byte("{}"), 0644); err != nil {
			t.Fatal(err)
		}
	}
	archive := filepath.Join(t.TempDir(), "backup.zip")
	if err = a.makeBackup(archive); err != nil {
		t.Fatal(err)
	}
	stage := t.TempDir()
	if _, err = unpackBackup(archive, stage); err != nil {
		t.Fatal(err)
	}
	other, err := newFixtureApp(t.TempDir(), "unused")
	if err != nil {
		t.Fatal(err)
	}
	defer other.Close()
	if err = other.restoreState(stage); err != nil {
		t.Fatal(err)
	}
	if other.weatherSettings().Timezone != "UTC" || other.weatherSettings().AutoRefresh {
		t.Fatal("settings not restored")
	}
	if _, err = os.Stat(filepath.Join(other.root, "runtime", "runs", "123", "weather-training.csv")); err != nil {
		t.Fatal(err)
	}
}

func TestWeatherSettingsRejectInvalidTimezone(t *testing.T) {
	a, err := newFixtureApp(t.TempDir(), "unused")
	if err != nil {
		t.Fatal(err)
	}
	defer a.Close()
	r := httptest.NewRecorder()
	a.Handler().ServeHTTP(r, httptest.NewRequest("POST", "/api/weather/settings", strings.NewReader(`{"enabled":true,"timezone":"invented","origin_mode":"dataset"}`)))
	if r.Code != 400 {
		t.Fatal(r.Code)
	}
	if a.weatherSettings().Timezone != "Asia/Almaty" {
		t.Fatal("invalid settings persisted")
	}
}

func TestRequestReplayPersistsForRetry(t *testing.T) {
	a, err := newFixtureApp(t.TempDir(), "unused")
	if err != nil {
		t.Fatal(err)
	}
	defer a.Close()
	_, err = a.db.Exec("INSERT INTO runs(id,status,created,trigger,horizon,origin,step) VALUES('123','failed','2026-01-01','manual',48,'2026-02-01 00:00:00','failed')")
	if err != nil {
		t.Fatal(err)
	}
	dir := filepath.Join(a.root, "runtime", "runs", "123")
	if err = os.MkdirAll(dir, 0755); err != nil {
		t.Fatal(err)
	}
	request := RunRequest{Horizon: 48, Origin: "2026-02-01T00:00", ReplayDays: 28}
	data, _ := json.Marshal(request)
	if err = os.WriteFile(filepath.Join(dir, "request.json"), data, 0644); err != nil {
		t.Fatal(err)
	}
	run, err := a.getRun("123")
	if err != nil || run.Request == nil || run.Request.ReplayDays != 28 {
		t.Fatal(run, err)
	}
}
