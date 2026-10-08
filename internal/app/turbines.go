package app

import (
	"database/sql"
	"encoding/json"
	"errors"
	"io"
	"math"
	"net/http"
	"strings"
)

const exampleTurbines = `INSERT OR IGNORE INTO turbines(id,name,latitude,longitude) VALUES(1,'Турбина 1',43.645150,78.535604),(2,'Турбина 2',43.643198,78.538828)`

func migrateTurbines(db *sql.DB) error {
	for _, column := range []struct{ name, definition string }{
		{"sample_minutes", "INTEGER NOT NULL DEFAULT 10"},
		{"rated_kw", "REAL NOT NULL DEFAULT 0"},
	} {
		var count int
		if err := db.QueryRow("SELECT count(*) FROM pragma_table_info('turbines') WHERE name=?", column.name).Scan(&count); err != nil {
			return err
		}
		if count == 0 {
			if _, err := db.Exec("ALTER TABLE turbines ADD COLUMN " + column.name + " " + column.definition); err != nil {
				return err
			}
		}
	}
	return nil
}

func (a *App) turbine(id int) (Turbine, error) {
	var t Turbine
	err := a.db.QueryRow("SELECT id,name,latitude,longitude,sample_minutes,rated_kw,(SELECT count(*) FROM observations WHERE turbine_id=t.id) FROM turbines t WHERE id=?", id).Scan(&t.ID, &t.Name, &t.Latitude, &t.Longitude, &t.SampleMinutes, &t.RatedKW, &t.Rows)
	if err == sql.ErrNoRows {
		err = errors.New("Сначала добавьте турбину в настройках станции")
	}
	return t, err
}

func validTurbine(t Turbine) bool {
	return len(t.Name) > 0 && len(t.Name) <= 200 && t.ID >= 0 &&
		!math.IsNaN(t.Latitude) && !math.IsInf(t.Latitude, 0) && t.Latitude >= -90 && t.Latitude <= 90 &&
		!math.IsNaN(t.Longitude) && !math.IsInf(t.Longitude, 0) && t.Longitude >= -180 && t.Longitude <= 180 &&
		!math.IsNaN(t.RatedKW) && !math.IsInf(t.RatedKW, 0) && t.RatedKW >= 0 && t.RatedKW <= 1000000 &&
		(t.SampleMinutes == 5 || t.SampleMinutes == 10 || t.SampleMinutes == 15 || t.SampleMinutes == 20 || t.SampleMinutes == 30 || t.SampleMinutes == 60)
}

func (a *App) saveTurbine(w http.ResponseWriter, r *http.Request) {
	var t Turbine
	if json.NewDecoder(io.LimitReader(r.Body, 8192)).Decode(&t) != nil {
		problem(w, 400, errors.New("Некорректные параметры турбины"))
		return
	}
	t.Name = strings.TrimSpace(t.Name)
	if !validTurbine(t) {
		problem(w, 422, errors.New("Проверьте название, координаты, интервал измерений и номинальную мощность"))
		return
	}
	if !a.work.TryLock() {
		problem(w, 409, errors.New("Дождитесь завершения текущего расчёта или импорта"))
		return
	}
	defer a.work.Unlock()
	if t.ID > 0 {
		previous, err := a.turbine(t.ID)
		if err != nil {
			problem(w, 404, err)
			return
		}
		if previous.Rows > 0 && (t.SampleMinutes != previous.SampleMinutes || t.RatedKW != previous.RatedKW) {
			problem(w, 409, errors.New("После импорта интервал и номинальная мощность зафиксированы. Для данных с другими параметрами добавьте новую турбину"))
			return
		}
		if _, err = a.db.Exec("UPDATE turbines SET name=?,latitude=?,longitude=?,sample_minutes=?,rated_kw=? WHERE id=?", t.Name, t.Latitude, t.Longitude, t.SampleMinutes, t.RatedKW, t.ID); err != nil {
			problem(w, 500, err)
			return
		}
	} else {
		result, err := a.db.Exec("INSERT INTO turbines(name,latitude,longitude,sample_minutes,rated_kw) VALUES(?,?,?,?,?)", t.Name, t.Latitude, t.Longitude, t.SampleMinutes, t.RatedKW)
		if err != nil {
			problem(w, 500, err)
			return
		}
		key, _ := result.LastInsertId()
		t.ID = int(key)
	}
	respond(w, 200, t)
}
