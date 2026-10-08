package app

import (
	"bytes"
	"encoding/json"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestServerExportsPreserveContent(t *testing.T) {
	a, err := newFixtureApp(t.TempDir(), "unused")
	if err != nil {
		t.Fatal(err)
	}
	defer a.Close()
	for _, tc := range []struct{ name, content string }{
		{"samal-preferences.json", `{"format":"samal-preferences","version":1,"preferences":{"language":"kk","theme":"dark"}}`},
		{"samal-comparison.csv", "time,turbine_id,run_a,run_b,power_a,power_b,difference_b_minus_a\r\n2026-02-01 00:00:00,1,123,456,0.2,0.3,0.1"},
	} {
		body, _ := json.Marshal(map[string]string{"name": tc.name, "content": tc.content})
		response := httptest.NewRecorder()
		a.Handler().ServeHTTP(response, httptest.NewRequest("POST", "/api/exports", bytes.NewReader(body)))
		if response.Code != 201 {
			t.Fatal(response.Code, response.Body.String())
		}
		var result map[string]string
		json.Unmarshal(response.Body.Bytes(), &result)
		response = httptest.NewRecorder()
		a.Handler().ServeHTTP(response, httptest.NewRequest("GET", result["url"], nil))
		if response.Code != 200 || response.Body.String() != tc.content || !strings.Contains(response.Header().Get("Content-Disposition"), tc.name) {
			t.Fatal("incorrect download", response.Body.String())
		}
	}
	response := httptest.NewRecorder()
	a.Handler().ServeHTTP(response, httptest.NewRequest("POST", "/api/exports", strings.NewReader(`{"name":"../escape.exe","content":"x"}`)))
	if response.Code != 400 {
		t.Fatal("accepted arbitrary export name")
	}
}
