package app

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sync"
	"time"

	_ "modernc.org/sqlite"
)

type App struct {
	db            *sql.DB
	root, python  string
	demo          bool
	work          sync.Mutex
	life          sync.WaitGroup
	activeMu      sync.Mutex
	activeID      string
	activeCancel  context.CancelFunc
	weatherCancel context.CancelFunc
	weatherLife   sync.WaitGroup
	exportsMu     sync.Mutex
	exports       map[string]downloadExport
}
type Turbine struct {
	ID            int     `json:"id"`
	Name          string  `json:"name"`
	Latitude      float64 `json:"latitude"`
	Longitude     float64 `json:"longitude"`
	SampleMinutes int     `json:"sample_minutes"`
	RatedKW       float64 `json:"rated_kw"`
	Rows          int     `json:"rows"`
	First         string  `json:"first"`
	Last          string  `json:"last"`
	Missing       int     `json:"missing"`
	Coverage      float64 `json:"coverage"`
	Power         float64 `json:"power"`
	Wind          float64 `json:"wind"`
	Temperature   float64 `json:"temperature"`
}
type Run struct {
	ID         string          `json:"id"`
	Status     string          `json:"status"`
	Created    string          `json:"created"`
	Trigger    string          `json:"trigger"`
	Horizon    int             `json:"horizon"`
	Origin     string          `json:"origin"`
	Step       string          `json:"step"`
	Error      string          `json:"error"`
	Result     json.RawMessage `json:"result,omitempty"`
	Events     []Event         `json:"events,omitempty"`
	Evaluation any             `json:"evaluation,omitempty"`
	Request    *RunRequest     `json:"request,omitempty"`
}
type Event struct {
	At      string `json:"at"`
	Message string `json:"message"`
}
type Hour struct {
	Time        string   `json:"time"`
	Power       *float64 `json:"power"`
	Wind        *float64 `json:"wind"`
	Temperature *float64 `json:"temperature"`
	Samples     int      `json:"samples"`
}

const schema = `
PRAGMA journal_mode=WAL;
PRAGMA busy_timeout=5000;
PRAGMA foreign_keys=ON;
CREATE TABLE IF NOT EXISTS turbines(id INTEGER PRIMARY KEY,name TEXT NOT NULL,latitude REAL NOT NULL,longitude REAL NOT NULL);
CREATE TABLE IF NOT EXISTS imports(id TEXT PRIMARY KEY,turbine_id INTEGER NOT NULL REFERENCES turbines(id),name TEXT NOT NULL,created TEXT NOT NULL,rows INTEGER NOT NULL,added INTEGER NOT NULL,duplicates INTEGER NOT NULL,sha256 TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS observations(turbine_id INTEGER NOT NULL REFERENCES turbines(id),time TEXT NOT NULL,wind REAL NOT NULL,power REAL NOT NULL,temperature REAL NOT NULL,PRIMARY KEY(turbine_id,time));
CREATE TABLE IF NOT EXISTS runs(id TEXT PRIMARY KEY,status TEXT NOT NULL,created TEXT NOT NULL,trigger TEXT NOT NULL,horizon INTEGER NOT NULL,origin TEXT NOT NULL,step TEXT NOT NULL,error TEXT NOT NULL DEFAULT '',result TEXT,events TEXT NOT NULL DEFAULT '[]');
CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY,value TEXT NOT NULL);
`

func New(root, python string) (*App, error) {
	for _, d := range []string{"runtime", "runtime/uploads", "runtime/runs"} {
		if err := os.MkdirAll(filepath.Join(root, d), 0755); err != nil {
			return nil, err
		}
	}
	db, err := sql.Open("sqlite", filepath.Join(root, "runtime", "energy.db"))
	if err != nil {
		return nil, err
	}
	db.SetMaxOpenConns(1)
	if _, err = db.Exec(schema); err != nil {
		db.Close()
		return nil, err
	}
	if err = migrateTurbines(db); err != nil {
		db.Close()
		return nil, err
	}
	demo := os.Getenv("SAMAL_DEMO") == "1"
	var source string
	_ = db.QueryRow("SELECT value FROM settings WHERE key='data_source'").Scan(&source)
	var count int
	if err = db.QueryRow("SELECT count(*) FROM observations").Scan(&count); err != nil {
		db.Close()
		return nil, err
	}
	if (source == "synthetic" && !demo) || (demo && source != "synthetic" && count > 0) {
		db.Close()
		return nil, fmt.Errorf("Демонстрация и пользовательские данные требуют отдельных баз; используйте Docker-сервис demo")
	}
	if demo {
		if _, err = db.Exec("INSERT INTO settings(key,value) VALUES('data_source','synthetic') ON CONFLICT(key) DO UPDATE SET value=excluded.value"); err != nil {
			db.Close()
			return nil, err
		}
	}
	_, err = db.Exec("UPDATE runs SET status='failed',step='Расчёт прерван',error='Приложение было остановлено. Запустите расчёт ещё раз.' WHERE status='running'")
	if err != nil {
		db.Close()
		return nil, err
	}
	a := &App{db: db, root: root, python: python, demo: demo}
	a.startWeatherLoop()
	return a, nil
}
func (a *App) Close() {
	if a.weatherCancel != nil {
		a.weatherCancel()
	}
	a.weatherLife.Wait()
	a.activeMu.Lock()
	if a.activeCancel != nil {
		a.activeCancel()
	}
	a.activeMu.Unlock()
	a.life.Wait()
	_ = a.db.Close()
}
func now() string { return time.Now().UTC().Format(time.RFC3339) }
func id() string  { return fmt.Sprintf("%d", time.Now().UnixNano()) }

func (a *App) turbines() ([]Turbine, error) {
	rows, err := a.db.Query(`SELECT t.id,t.name,t.latitude,t.longitude,t.sample_minutes,t.rated_kw,count(o.time),coalesce(min(o.time),''),coalesce(max(o.time),'') FROM turbines t LEFT JOIN observations o ON t.id=o.turbine_id GROUP BY t.id ORDER BY t.id`)
	if err != nil {
		return nil, err
	}
	result := []Turbine{}
	for rows.Next() {
		var t Turbine
		if err := rows.Scan(&t.ID, &t.Name, &t.Latitude, &t.Longitude, &t.SampleMinutes, &t.RatedKW, &t.Rows, &t.First, &t.Last); err != nil {
			rows.Close()
			return nil, err
		}
		result = append(result, t)
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		return nil, err
	}
	for i := range result {
		t := &result[i]
		if t.Rows == 0 {
			continue
		}
		first, _ := time.Parse("2006-01-02 15:04:05", t.First)
		last, _ := time.Parse("2006-01-02 15:04:05", t.Last)
		expected := int(last.Sub(first).Minutes()/float64(t.SampleMinutes)) + 1
		t.Missing = expected - t.Rows
		t.Coverage = 100 * float64(t.Rows) / float64(expected)
		if err := a.db.QueryRow(`SELECT power,wind,temperature FROM observations WHERE turbine_id=? ORDER BY time DESC LIMIT 1`, t.ID).Scan(&t.Power, &t.Wind, &t.Temperature); err != nil {
			return nil, err
		}
	}
	return result, nil
}
func (a *App) hours(turbine int, days int) ([]Hour, error) {
	station, err := a.turbine(turbine)
	if err != nil {
		return nil, err
	}
	var latest sql.NullString
	if err := a.db.QueryRow("SELECT max(time) FROM observations WHERE turbine_id=?", turbine).Scan(&latest); err != nil {
		return nil, err
	}
	if !latest.Valid {
		return []Hour{}, nil
	}
	last, _ := time.Parse("2006-01-02 15:04:05", latest.String)
	start := last.Truncate(time.Hour).Add(-time.Duration(days*24-1) * time.Hour)
	rows, err := a.db.Query(`SELECT substr(time,1,13)||':00:00',avg(power),avg(wind),avg(temperature),count(*) FROM observations WHERE turbine_id=? AND time>=? GROUP BY substr(time,1,13) ORDER BY time`, turbine, start.Format("2006-01-02 15:04:05"))
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	found := map[string]Hour{}
	for rows.Next() {
		var h Hour
		if err := rows.Scan(&h.Time, &h.Power, &h.Wind, &h.Temperature, &h.Samples); err != nil {
			return nil, err
		}
		if h.Samples != 60/station.SampleMinutes {
			h.Power = nil
			h.Wind = nil
			h.Temperature = nil
		}
		found[h.Time] = h
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	output := []Hour{}
	for t := start; !t.After(last.Truncate(time.Hour)); t = t.Add(time.Hour) {
		key := t.Format("2006-01-02 15:04:05")
		h, ok := found[key]
		if !ok {
			h = Hour{Time: key}
		}
		output = append(output, h)
	}
	return output, nil
}
func (a *App) runs(withResults bool) ([]Run, error) {
	query := "SELECT id,status,created,trigger,horizon,origin,step,error,coalesce(result,'null'),events FROM runs ORDER BY created DESC, id DESC"
	rows, err := a.db.Query(query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Run{}
	for rows.Next() {
		var r Run
		var result, events string
		if err := rows.Scan(&r.ID, &r.Status, &r.Created, &r.Trigger, &r.Horizon, &r.Origin, &r.Step, &r.Error, &result, &events); err != nil {
			return nil, err
		}
		if withResults {
			r.Result = json.RawMessage(result)
		}
		_ = json.Unmarshal([]byte(events), &r.Events)
		out = append(out, r)
	}
	return out, rows.Err()
}
func (a *App) getRun(key string) (Run, error) {
	var r Run
	var result, events string
	err := a.db.QueryRow("SELECT id,status,created,trigger,horizon,origin,step,error,coalesce(result,'null'),events FROM runs WHERE id=?", key).Scan(&r.ID, &r.Status, &r.Created, &r.Trigger, &r.Horizon, &r.Origin, &r.Step, &r.Error, &result, &events)
	r.Result = json.RawMessage(result)
	_ = json.Unmarshal([]byte(events), &r.Events)
	if data, e := os.ReadFile(filepath.Join(a.root, "runtime", "runs", key, "request.json")); e == nil {
		_ = json.Unmarshal(data, &r.Request)
	}
	return r, err
}
