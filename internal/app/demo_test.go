package app

import (
	"net/http/httptest"
	"testing"
)

func TestDemoIsolation(t *testing.T) {
	t.Setenv("SAMAL_DEMO", "1")
	root := t.TempDir()
	a, err := newFixtureApp(root, "unused")
	if err != nil {
		t.Fatal(err)
	}
	if !a.demo || !a.weatherSettings().Enabled {
		t.Fatal("demo needs synthetic weather")
	}
	for _, route := range []string{"/api/imports", "/api/imports/preview", "/api/backup/restore"} {
		r := httptest.NewRecorder()
		a.Handler().ServeHTTP(r, httptest.NewRequest("POST", route, nil))
		if r.Code != 403 {
			t.Fatalf("%s: %d", route, r.Code)
		}
	}
	archive := t.TempDir() + "/demo.zip"
	if err = a.makeBackup(archive); err != nil {
		t.Fatal(err)
	}
	a.Close()
	t.Setenv("SAMAL_DEMO", "")
	if other, err := newFixtureApp(root, "unused"); err == nil {
		other.Close()
		t.Fatal("demo database opened as real")
	}
	normal, err := newFixtureApp(t.TempDir(), "unused")
	if err != nil {
		t.Fatal(err)
	}
	defer normal.Close()
	stage := t.TempDir()
	if _, err := unpackBackup(archive, stage); err != nil {
		t.Fatal(err)
	}
	if err := normal.restoreState(stage); err == nil {
		t.Fatal("synthetic backup restored as real")
	}
}

func TestPrivateDatabaseCannotBecomeDemo(t *testing.T) {
	t.Setenv("SAMAL_DEMO", "")
	root := t.TempDir()
	a, err := newFixtureApp(root, "unused")
	if err != nil {
		t.Fatal(err)
	}
	_, err = a.db.Exec("INSERT INTO observations VALUES(1,'2025-01-01 00:00:00',8,0.3,10)")
	if err != nil {
		t.Fatal(err)
	}
	a.Close()
	t.Setenv("SAMAL_DEMO", "1")
	if other, err := newFixtureApp(root, "unused"); err == nil {
		other.Close()
		t.Fatal("private database opened as demo")
	}
}
