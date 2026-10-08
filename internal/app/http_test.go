package app

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestRoutesAndEmptyState(t *testing.T) {
	a, err := newFixtureApp(t.TempDir(), "unused")
	if err != nil {
		t.Fatal(err)
	}
	defer a.Close()
	handler := a.Handler()
	for _, tc := range []struct {
		method, path, body string
		status             int
	}{{"GET", "/api/health", "", 200}, {"GET", "/api/overview", "", 200}, {"GET", "/api/history?turbine=1", "", 200}, {"GET", "/api/history?turbine=9", "", 400}, {"GET", "/api/unknown", "", 404}, {"POST", "/api/runs", `{"horizon":48}`, 409}} {
		response := httptest.NewRecorder()
		handler.ServeHTTP(response, httptest.NewRequest(tc.method, tc.path, strings.NewReader(tc.body)))
		if response.Code != tc.status {
			t.Fatalf("%s: expected %d got %d: %s", tc.path, tc.status, response.Code, response.Body.String())
		}
		if !json.Valid(response.Body.Bytes()) {
			t.Fatalf("%s: invalid JSON", tc.path)
		}
	}
}
func TestEvaluateOnlyCompleteNewHours(t *testing.T) {
	a, err := newFixtureApp(t.TempDir(), "unused")
	if err != nil {
		t.Fatal(err)
	}
	defer a.Close()
	lines := [][]string{}
	for _, stamp := range []string{"00:00:00", "00:10:00", "00:20:00", "00:30:00", "00:40:00", "00:50:00", "01:00:00"} {
		lines = append(lines, []string{"1", "2026-02-01 " + stamp, "5", "0.6", "10"})
	}
	if _, err = a.importFile(1, "new.csv", csvBody(lines...)); err != nil {
		t.Fatal(err)
	}
	result := a.evaluate(Run{Result: json.RawMessage(`{"forecasts":[{"time":"2026-02-01 00:00:00","turbine_id":1,"prediction":0.4},{"time":"2026-02-01 01:00:00","turbine_id":1,"prediction":0.4}]}`)}).(map[string]any)
	if result["matched"] != 1 {
		t.Fatalf("expected 1 complete matching hour: %v", result)
	}
	if mae := result["mae"].(float64); mae < .199 || mae > .201 {
		t.Fatalf("incorrect MAE: %v", mae)
	}
}
func TestRejectCrossSitePost(t *testing.T) {
	a, err := newFixtureApp(t.TempDir(), "unused")
	if err != nil {
		t.Fatal(err)
	}
	defer a.Close()
	request := httptest.NewRequest("POST", "/api/runs", strings.NewReader(`{"horizon":48}`))
	request.Header.Set("Sec-Fetch-Site", "cross-site")
	response := httptest.NewRecorder()
	a.Handler().ServeHTTP(response, request)
	if response.Code != http.StatusForbidden {
		t.Fatal(response.Code)
	}
}
