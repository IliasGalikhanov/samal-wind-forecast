package app

import (
	"bytes"
	"encoding/csv"
	"encoding/json"
	"mime/multipart"
	"net/http/httptest"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
	"time"
)

// Opt in: exercises the actual Python model with original measurements, isolated
// from the user's database. The last real day is imported as new measurements.
func TestUploadRealDataPipeline(t *testing.T) {
	if os.Getenv("SAMAL_INTEGRATION") != "1" {
		t.Skip("set SAMAL_INTEGRATION=1 to run the real model")
	}
	project, err := filepath.Abs("../..")
	if err != nil {
		t.Fatal(err)
	}
	python := filepath.Join(project, ".venv", "Scripts", "python.exe")
	if runtime.GOOS != "windows" {
		python = filepath.Join(project, ".venv", "bin", "python")
	}
	root := t.TempDir()
	if err := os.MkdirAll(filepath.Join(root, "ml"), 0755); err != nil {
		t.Fatal(err)
	}
	worker, err := os.ReadFile(filepath.Join(project, "ml", "worker.py"))
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(root, "ml", "worker.py"), worker, 0644); err != nil {
		t.Fatal(err)
	}
	a, err := newFixtureApp(root, python)
	if err != nil {
		t.Fatal(err)
	}
	defer a.Close()
	// This integration specifically covers the offline path and its stale-data fallback.
	if _, err = a.db.Exec("INSERT INTO settings(key,value) VALUES('weather',?)", `{"enabled":false,"timezone":"Asia/Almaty","origin_mode":"dataset","auto_refresh":false}`); err != nil {
		t.Fatal(err)
	}
	var newMeasurements []byte
	for turbine := 1; turbine <= 2; turbine++ {
		source, err := os.ReadFile(filepath.Join(project, "data", "raw", []string{"", "turbine 1.csv", "turbine 2.csv"}[turbine]))
		if err != nil {
			t.Fatal(err)
		}
		rows, err := csv.NewReader(bytes.NewReader(source)).ReadAll()
		if err != nil {
			t.Fatal(err)
		}
		var past, fresh bytes.Buffer
		p, f := csv.NewWriter(&past), csv.NewWriter(&fresh)
		_ = p.Write(rows[0])
		_ = f.Write(rows[0])
		for _, row := range rows[1:] {
			if strings.HasPrefix(row[1], "2026-01-31") {
				_ = f.Write(row)
			} else {
				_ = p.Write(row)
			}
		}
		p.Flush()
		f.Flush()
		if _, err := a.importFile(turbine, "past.csv", past.Bytes()); err != nil {
			t.Fatal(err)
		}
		if turbine == 1 {
			newMeasurements = fresh.Bytes()
		}
	}
	var body bytes.Buffer
	multipartWriter := multipart.NewWriter(&body)
	part, err := multipartWriter.CreateFormFile("file", "real-new-day.csv")
	if err != nil {
		t.Fatal(err)
	}
	_, _ = part.Write(newMeasurements)
	_ = multipartWriter.WriteField("turbine_id", "1")
	_ = multipartWriter.WriteField("auto_run", "true")
	_ = multipartWriter.Close()
	request := httptest.NewRequest("POST", "/api/imports", &body)
	request.Header.Set("Content-Type", multipartWriter.FormDataContentType())
	response := httptest.NewRecorder()
	a.Handler().ServeHTTP(response, request)
	if response.Code != 201 {
		t.Fatalf("upload failed: %d %s", response.Code, response.Body.String())
	}
	var imported ImportResult
	if err := json.Unmarshal(response.Body.Bytes(), &imported); err != nil {
		t.Fatal(err)
	}
	if imported.Added != 144 || imported.RunID == "" {
		t.Fatalf("missing automatic run: %+v", imported)
	}
	t.Logf("Imported %d real measurements; automatic run %s", imported.Added, imported.RunID)
	deadline := time.Now().Add(12 * time.Minute)
	lastStep := ""
	for time.Now().Before(deadline) {
		run, err := a.getRun(imported.RunID)
		if err != nil {
			t.Fatal(err)
		}
		if run.Step != lastStep {
			t.Log(run.Step)
			lastStep = run.Step
		}
		if run.Status == "failed" {
			t.Fatal(run.Error)
		}
		if run.Status == "completed" {
			var result struct {
				Forecasts []forecast `json:"forecasts"`
				Warnings  []string   `json:"warnings"`
			}
			if err := json.Unmarshal(run.Result, &result); err != nil {
				t.Fatal(err)
			}
			if len(result.Forecasts) != 96 {
				t.Fatalf("expected 96 forecasts, got %d", len(result.Forecasts))
			}
			for _, p := range result.Forecasts {
				if p.Prediction < 0 || p.Prediction > 1 {
					t.Fatal("out of range prediction")
				}
				if p.TurbineID == 2 && p.Model != "seasonal" {
					t.Fatal("stale turbine must use seasonal fallback")
				}
			}
			if len(result.Warnings) < 3 {
				t.Fatal("missing stale-data warning")
			}
			return
		}
		time.Sleep(1 * time.Second)
	}
	t.Fatal("automatic run timed out")
}
