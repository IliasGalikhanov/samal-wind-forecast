package app

import (
	"encoding/json"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func stationRequest(a *App, body string) *httptest.ResponseRecorder {
	r := httptest.NewRecorder()
	a.Handler().ServeHTTP(r, httptest.NewRequest("POST", "/api/turbines", strings.NewReader(body)))
	return r
}

func TestUserStationImportAndRestore(t *testing.T) {
	a, err := New(t.TempDir(), "unused")
	if err != nil {
		t.Fatal(err)
	}
	defer a.Close()
	stations, err := a.turbines()
	if err != nil || len(stations) != 0 {
		t.Fatalf("new install must start empty: %v %v", stations, err)
	}
	for _, name := range []string{"North", "South", "Offshore"} {
		response := stationRequest(a, `{"name":"`+name+`","latitude":-33.9,"longitude":18.4,"sample_minutes":30,"rated_kw":2000}`)
		if response.Code != 200 {
			t.Fatal(response.Body.String())
		}
	}
	source := []byte("Date;Output;Speed;Temp;Unused\n2025-01-01 00:00:00;1;8,5;20;ignore\n2025-01-01 00:30:00;0,5;7;19;ignore\n2025-01-01 01:00:00;0;6;18;ignore\n")
	options := ImportOptions{Delimiter: ";", Time: "Date", Power: "Output", Wind: "Speed", Temperature: "Temp", PowerUnit: "mw"}
	preview, err := a.previewData(3, source, options)
	if err != nil || preview.Added != 3 || preview.Samples[0].Power != .5 {
		t.Fatalf("mapped preview: %+v %v", preview, err)
	}
	imported, err := a.importFile(3, "user.csv", source, options)
	if err != nil || imported.Added != 3 {
		t.Fatalf("mapped import: %+v %v", imported, err)
	}
	hours, err := a.hours(3, 1)
	if err != nil {
		t.Fatal(err)
	}
	if hours[len(hours)-2].Power == nil || *hours[len(hours)-2].Power != .375 || hours[len(hours)-1].Power != nil {
		t.Fatal("complete 30-minute hour or gap incorrectly aggregated")
	}
	repeated, err := a.importFile(3, "repeat.csv", source, options)
	if err != nil || repeated.Duplicates != 3 {
		t.Fatal("mapped import must be idempotent", err)
	}
	updated := stationRequest(a, `{"id":3,"name":"Renamed","latitude":-34,"longitude":19,"sample_minutes":30,"rated_kw":2000}`)
	if updated.Code != 200 {
		t.Fatal(updated.Body.String())
	}
	invalid := stationRequest(a, `{"id":3,"name":"Renamed","latitude":-34,"longitude":19,"sample_minutes":10,"rated_kw":2000}`)
	if invalid.Code != 409 {
		t.Fatal("sampling interval changed under observations")
	}
	folder := t.TempDir()
	if err = a.weatherConfig(folder, a.weatherSettings()); err != nil {
		t.Fatal(err)
	}
	config, _ := os.ReadFile(filepath.Join(folder, "weather-config.json"))
	var decoded struct{ Stations []Turbine }
	if json.Unmarshal(config, &decoded) != nil || len(decoded.Stations) != 3 || decoded.Stations[2].Latitude != -34 {
		t.Fatal("user coordinates missing from ML config", string(config))
	}
	before := filepath.Join(t.TempDir(), "before.csv")
	if err = a.snapshot(before); err != nil {
		t.Fatal(err)
	}
	snapshot, _ := os.ReadFile(before)
	if !strings.Contains(string(snapshot), "sample_minutes") || !strings.Contains(string(snapshot), ",30") {
		t.Fatal("sampling interval missing from ML snapshot")
	}
	archive := filepath.Join(t.TempDir(), "backup.zip")
	if err = a.makeBackup(archive); err != nil {
		t.Fatal(err)
	}
	other, err := New(t.TempDir(), "unused")
	if err != nil {
		t.Fatal(err)
	}
	defer other.Close()
	stage := t.TempDir()
	if _, err = unpackBackup(archive, stage); err != nil {
		t.Fatal(err)
	}
	if err = other.restoreState(stage); err != nil {
		t.Fatal(err)
	}
	restored, err := other.turbine(3)
	if err != nil || restored.Rows != 3 || restored.RatedKW != 2000 || restored.SampleMinutes != 30 || restored.Latitude != -34 {
		t.Fatalf("catalog was not restored: %+v %v", restored, err)
	}
	if _, err = other.db.Exec("PRAGMA foreign_key_check"); err != nil {
		t.Fatal(err)
	}
}

func TestStationValidationAndUnits(t *testing.T) {
	a, err := New(t.TempDir(), "unused")
	if err != nil {
		t.Fatal(err)
	}
	defer a.Close()
	for _, body := range []string{`{"name":"","latitude":0,"longitude":0,"sample_minutes":10}`, `{"name":"X","latitude":91,"longitude":0,"sample_minutes":10}`, `{"name":"X","latitude":0,"longitude":181,"sample_minutes":10}`, `{"name":"X","latitude":0,"longitude":0,"sample_minutes":7}`} {
		if stationRequest(a, body).Code != 422 {
			t.Fatal("invalid station accepted", body)
		}
	}
	for _, unit := range []string{"kw", "mw", "unknown"} {
		if _, err := (ImportOptions{PowerUnit: unit}).divisor(Turbine{}); err == nil {
			t.Fatal("unit without capacity accepted", unit)
		}
	}
	source := "time,power,wind,temperature\n2025-01-01 00:00:00,25,6,20\n"
	observations, err := parseMappedCSV(strings.NewReader(source), ImportOptions{PowerUnit: "percent"}, Turbine{SampleMinutes: 60})
	if err != nil || observations[0].Power != .25 {
		t.Fatal("percentage normalization failed", err)
	}
	if _, err = parseMappedCSV(strings.NewReader(source), ImportOptions{Power: "wind", Wind: "wind"}, Turbine{SampleMinutes: 60}); err == nil {
		t.Fatal("same column used twice")
	}
	if !validWeatherSettings(WeatherSettings{Enabled: true, Timezone: "Africa/Johannesburg", OriginMode: "live"}) || validWeatherSettings(WeatherSettings{Enabled: true, Timezone: "Not/AZone", OriginMode: "live"}) {
		t.Fatal("IANA timezone validation")
	}
}

func TestLegacyTurbineMigrationAndBackup(t *testing.T) {
	a, err := newFixtureApp(t.TempDir(), "unused")
	if err != nil {
		t.Fatal(err)
	}
	defer a.Close()
	if _, err = a.db.Exec("ALTER TABLE turbines DROP COLUMN sample_minutes; ALTER TABLE turbines DROP COLUMN rated_kw"); err != nil {
		t.Fatal(err)
	}
	archive := filepath.Join(t.TempDir(), "legacy.zip")
	if err = a.makeBackup(archive); err != nil {
		t.Fatal(err)
	}
	if err = migrateTurbines(a.db); err != nil {
		t.Fatal(err)
	}
	station, err := a.turbine(1)
	if err != nil || station.SampleMinutes != 10 || station.RatedKW != 0 {
		t.Fatal("legacy migration", err)
	}
	stage := t.TempDir()
	if _, err = unpackBackup(archive, stage); err != nil {
		t.Fatal(err)
	}
	if err = a.restoreState(stage); err != nil {
		t.Fatal(err)
	}
	station, err = a.turbine(2)
	if err != nil || station.SampleMinutes != 10 {
		t.Fatal("legacy backup defaults", err)
	}
}
