package app

import (
	"encoding/json"
	"fmt"
	"testing"
)

func TestPublicationRejectsPartialDuplicateAndInvalidPower(t *testing.T) {
	run := Run{Origin: "2026-10-03 00:00:00", Horizon: 24}
	turbines := []Turbine{{ID: 1, Rows: 100}, {ID: 2, Rows: 100}}
	for _, invalid := range []string{"", "missing", "duplicate", "null", "range", "origin"} {
		t.Run(invalid, func(t *testing.T) {
			rows := []map[string]any{}
			for tid := 1; tid <= 2; tid++ {
				for hour := 0; hour < 24; hour++ {
					rows = append(rows, map[string]any{"turbine_id": tid, "time": fmt.Sprintf("2026-10-03 %02d:00:00", hour), "prediction": .5})
				}
			}
			origin := run.Origin
			switch invalid {
			case "missing":
				rows = rows[:47]
			case "duplicate":
				rows[47] = rows[0]
			case "null":
				rows[0]["prediction"] = nil
			case "range":
				rows[0]["prediction"] = 1.1
			case "origin":
				origin = "2026-01-01 00:00:00"
			}
			data, _ := json.Marshal(map[string]any{"origin": origin, "horizon": 24, "forecasts": rows})
			err := validateResult(data, run, turbines)
			if (err != nil) != (invalid != "") {
				t.Fatal(invalid, err)
			}
		})
	}
}

func TestNewInstallationDefaultsToLive(t *testing.T) {
	s := defaultWeatherSettings()
	if s.OriginMode != "live" || !s.Enabled || s.Timezone != "Asia/Almaty" {
		t.Fatal(s)
	}
}
