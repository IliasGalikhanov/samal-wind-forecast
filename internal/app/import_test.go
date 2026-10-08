package app

import (
	"encoding/csv"
	"strings"
	"testing"
)

func csvBody(lines ...[]string) []byte {
	var s strings.Builder
	w := csv.NewWriter(&s)
	_ = w.Write(headers)
	for _, line := range lines {
		_ = w.Write(line)
	}
	w.Flush()
	return []byte(s.String())
}
func TestImportAtomicAndIdempotent(t *testing.T) {
	a, err := newFixtureApp(t.TempDir(), "unused")
	if err != nil {
		t.Fatal(err)
	}
	defer a.Close()
	first := []string{"1", "2026-01-01 0:00:00", "6", "0.4", "10"}
	data := csvBody(first)
	r, err := a.importFile(1, "first.csv", data)
	if err != nil || r.Added != 1 {
		t.Fatalf("first import: %+v %v", r, err)
	}
	r, err = a.importFile(1, "again.csv", data)
	if err != nil || r.Added != 0 || r.Duplicates != 1 {
		t.Fatalf("idempotency: %+v %v", r, err)
	}
	newRow := []string{"2", "2026-01-01 0:10:00", "7", "0.5", "10"}
	conflict := []string{"3", "2026-01-01 0:00:00", "6", "0.9", "10"}
	if _, err = a.importFile(1, "conflict.csv", csvBody(newRow, conflict)); err == nil {
		t.Fatal("expected conflict")
	}
	var count int
	_ = a.db.QueryRow("SELECT count(*) FROM observations").Scan(&count)
	if count != 1 {
		t.Fatalf("partial import leaked: %d rows", count)
	}
	r, err = a.importFile(2, "other-turbine.csv", data)
	if err != nil || r.Added != 1 {
		t.Fatalf("turbine identity: %v", err)
	}
}
func TestRejectInvalidMeasurements(t *testing.T) {
	for _, values := range [][]string{{"1", "2026-01-01 00:00:00", "NaN", ".5", "10"}, {"1", "2026-01-01 00:00:00", "5", "1.1", "10"}, {"1", "2026-01-01 00:05:00", "5", ".5", "10"}} {
		if _, err := parseCSV(strings.NewReader(string(csvBody(values)))); err == nil {
			t.Fatalf("accepted invalid input: %v", values)
		}
	}
}
func TestHoursPreserveGaps(t *testing.T) {
	a, err := newFixtureApp(t.TempDir(), "unused")
	if err != nil {
		t.Fatal(err)
	}
	defer a.Close()
	lines := [][]string{}
	for _, stamp := range []string{"00:00:00", "00:10:00", "00:20:00", "00:30:00", "00:40:00", "00:50:00", "02:00:00"} {
		lines = append(lines, []string{"1", "2026-01-01 " + stamp, "5", "0.6", "10"})
	}
	if _, err = a.importFile(1, "hours.csv", csvBody(lines...)); err != nil {
		t.Fatal(err)
	}
	hours, err := a.hours(1, 1)
	if err != nil {
		t.Fatal(err)
	}
	end := hours[len(hours)-3:]
	if end[0].Power == nil || end[1].Power != nil || end[2].Power != nil {
		t.Fatalf("incomplete hours must remain missing: %+v", end)
	}
}
