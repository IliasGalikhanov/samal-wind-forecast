package app

import (
	"archive/zip"
	"bytes"
	"context"
	"crypto/sha256"
	"io"
	"mime/multipart"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
)

func TestRealDataBackupRoundTrip(t *testing.T) {
	if os.Getenv("SAMAL_BACKUP_INTEGRATION") != "1" {
		t.Skip("set SAMAL_BACKUP_INTEGRATION=1")
	}
	project, err := filepath.Abs("../..")
	if err != nil {
		t.Fatal(err)
	}
	a, err := newFixtureApp(t.TempDir(), "unused")
	if err != nil {
		t.Fatal(err)
	}
	defer a.Close()
	if err = a.Seed(filepath.Join(project, "data", "raw")); err != nil {
		t.Fatal(err)
	}
	before := filepath.Join(a.root, "runtime", "before.csv")
	if err = a.snapshot(before); err != nil {
		t.Fatal(err)
	}
	response := httptest.NewRecorder()
	a.Handler().ServeHTTP(response, httptest.NewRequest("GET", "/api/backup", nil))
	if response.Code != 200 {
		t.Fatal(response.Code, response.Body.String())
	}
	archive := filepath.Join(a.root, "runtime", "archive.zip")
	if err = os.WriteFile(archive, response.Body.Bytes(), 0644); err != nil {
		t.Fatal(err)
	}
	stage := filepath.Join(a.root, "runtime", "verify")
	os.MkdirAll(stage, 0755)
	info, err := unpackBackup(archive, stage)
	if err != nil || info.Observations != 291859 || info.Imports != 2 {
		t.Fatal(info, err)
	}
	if err = a.restoreState(stage); err != nil {
		t.Fatal(err)
	}
	after := filepath.Join(a.root, "runtime", "after.csv")
	if err = a.snapshot(after); err != nil {
		t.Fatal(err)
	}
	b, _ := os.ReadFile(before)
	c, _ := os.ReadFile(after)
	if sha256.Sum256(b) != sha256.Sum256(c) {
		t.Fatal("restoration changed measurements")
	}
	t.Logf("Verified all %d observations, ZIP %d bytes, matching SHA-256", info.Observations, response.Body.Len())
}

func TestPreviewCountsWithoutWriting(t *testing.T) {
	a, err := newFixtureApp(t.TempDir(), "unused")
	if err != nil {
		t.Fatal(err)
	}
	defer a.Close()
	first := []string{"1", "2026-01-01 00:00:00", "6", ".4", "10"}
	if _, err = a.importFile(1, "first.csv", csvBody(first)); err != nil {
		t.Fatal(err)
	}
	fresh := []string{"2", "2026-01-01 00:10:00", "6", ".5", "10"}
	p, err := a.previewData(1, csvBody(first, fresh, fresh))
	if err != nil {
		t.Fatal(err)
	}
	if p.Rows != 3 || p.Added != 1 || p.Duplicates != 2 || p.Conflicts != 0 {
		t.Fatalf("wrong preview %+v", p)
	}
	conflict := []string{"1", "2026-01-01 00:00:00", "6", ".9", "10"}
	p, err = a.previewData(1, csvBody(conflict))
	if err != nil || p.Conflicts != 1 {
		t.Fatalf("missing conflict %+v %v", p, err)
	}
	var count int
	a.db.QueryRow("SELECT count(*) FROM observations").Scan(&count)
	if count != 1 {
		t.Fatal("preview changed observations")
	}
	a.db.QueryRow("SELECT count(*) FROM imports").Scan(&count)
	if count != 1 {
		t.Fatal("preview created import")
	}
}

func TestBackupRestoreAndRecovery(t *testing.T) {
	a, err := newFixtureApp(t.TempDir(), "unused")
	if err != nil {
		t.Fatal(err)
	}
	defer a.Close()
	first, err := a.importFile(1, "original.csv", csvBody([]string{"1", "2026-01-01 00:00:00", "6", ".4", "10"}))
	if err != nil {
		t.Fatal(err)
	}
	if _, err = a.db.Exec("INSERT INTO runs(id,status,created,trigger,horizon,origin,step) VALUES('123','cancelled',?,'manual',48,'2026-01-01 01:00:00','cancelled')", now()); err != nil {
		t.Fatal(err)
	}
	runDir := filepath.Join(a.root, "runtime", "runs", "123")
	os.MkdirAll(runDir, 0755)
	os.WriteFile(filepath.Join(runDir, "model.cbm"), []byte("model artifact"), 0644)
	archive := filepath.Join(a.root, "runtime", "test.zip")
	if err = a.makeBackup(archive); err != nil {
		t.Fatal(err)
	}
	zipped, err := os.ReadFile(archive)
	if err != nil {
		t.Fatal(err)
	}
	if _, err = a.importFile(2, "new.csv", csvBody([]string{"2", "2026-01-01 00:10:00", "7", ".5", "11"})); err != nil {
		t.Fatal(err)
	}
	call := func(path string, confirm bool) *httptest.ResponseRecorder {
		var body bytes.Buffer
		m := multipart.NewWriter(&body)
		p, _ := m.CreateFormFile("file", "backup.zip")
		p.Write(zipped)
		if confirm {
			m.WriteField("confirm", "restore")
		}
		m.Close()
		req := httptest.NewRequest("POST", path, &body)
		req.Header.Set("Content-Type", m.FormDataContentType())
		response := httptest.NewRecorder()
		a.Handler().ServeHTTP(response, req)
		return response
	}
	response := call("/api/backup/preview", false)
	if response.Code != 200 {
		t.Fatal(response.Code, response.Body.String())
	}
	response = call("/api/backup/restore", false)
	if response.Code != 400 {
		t.Fatal("restore accepted without confirmation")
	}
	for i := 0; i < 2; i++ {
		response = call("/api/backup/restore", true)
		if response.Code != 200 {
			t.Fatal(response.Code, response.Body.String())
		}
	}
	var count int
	a.db.QueryRow("SELECT count(*) FROM observations").Scan(&count)
	if count != 1 {
		t.Fatalf("restore has %d rows", count)
	}
	if _, err = os.Stat(filepath.Join(a.root, "runtime", "uploads", first.ID+".csv")); err != nil {
		t.Fatal("original file not restored", err)
	}
	content, err := os.ReadFile(filepath.Join(runDir, "model.cbm"))
	if err != nil || string(content) != "model artifact" {
		t.Fatal("model not restored")
	}
	stage := filepath.Join(a.root, "runtime", "inspect")
	os.MkdirAll(stage, 0755)
	info, err := unpackBackup(filepath.Join(a.root, "runtime", "recovery.zip"), stage)
	if err != nil || info.Observations != 1 {
		t.Fatal("recovery not readable", err, info)
	}
}
func TestBackupRejectsTraversal(t *testing.T) {
	path := filepath.Join(t.TempDir(), "bad.zip")
	f, _ := os.Create(path)
	z := zip.NewWriter(f)
	entry, _ := z.Create("../escape.txt")
	io.WriteString(entry, "bad")
	z.Close()
	f.Close()
	if _, err := unpackBackup(path, t.TempDir()); err == nil {
		t.Fatal("accepted traversal")
	}
}
func TestRestoreRollsBackDatabaseOnFileFailure(t *testing.T) {
	a, err := newFixtureApp(t.TempDir(), "unused")
	if err != nil {
		t.Fatal(err)
	}
	defer a.Close()
	a.importFile(1, "first.csv", csvBody([]string{"1", "2026-01-01 00:00:00", "6", ".4", "10"}))
	archive := filepath.Join(a.root, "runtime", "test.zip")
	if err = a.makeBackup(archive); err != nil {
		t.Fatal(err)
	}
	a.importFile(2, "second.csv", csvBody([]string{"2", "2026-01-01 00:10:00", "6", ".4", "10"}))
	stage := filepath.Join(a.root, "runtime", "stage")
	os.MkdirAll(stage, 0755)
	if _, err = unpackBackup(archive, stage); err != nil {
		t.Fatal(err)
	}
	// A missing staged directory forces the file swap to fail after the first rename.
	os.Remove(filepath.Join(stage, "runs"))
	if err = a.restoreState(stage); err == nil {
		t.Fatal("expected restore failure")
	}
	var count int
	a.db.QueryRow("SELECT count(*) FROM observations").Scan(&count)
	if count != 2 {
		t.Fatal("failed restore changed data")
	}
	files, _ := os.ReadDir(filepath.Join(a.root, "runtime", "uploads"))
	if len(files) != 2 {
		t.Fatal("failed restore lost originals")
	}
}
func TestCancelledRunNeverPublishesResult(t *testing.T) {
	a, err := newFixtureApp(t.TempDir(), "unused")
	if err != nil {
		t.Fatal(err)
	}
	defer a.Close()
	_, err = a.db.Exec("INSERT INTO runs(id,status,created,trigger,horizon,origin,step) VALUES('456','running',?,'manual',48,'2026-01-01 01:00:00','pending')", now())
	if err != nil {
		t.Fatal(err)
	}
	ctx, cancel := context.WithCancel(context.Background())
	a.activeID = "456"
	a.activeCancel = cancel
	response := httptest.NewRecorder()
	a.Handler().ServeHTTP(response, httptest.NewRequest("POST", "/api/runs/456/cancel", nil))
	if response.Code != 202 {
		t.Fatal(response.Body.String())
	}
	a.execute(ctx, Run{ID: "456", Horizon: 48, Origin: "2026-01-01 01:00:00"})
	run, err := a.getRun("456")
	if err != nil || run.Status != "cancelled" || string(run.Result) != "null" {
		t.Fatal("cancel published result", run, err)
	}
}
