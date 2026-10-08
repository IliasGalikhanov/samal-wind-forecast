package app

import (
	"encoding/json"
	"errors"
	"time"
)

// Independently check the Python result before making it visible as completed.
func validateResult(data []byte, run Run, turbines []Turbine) error {
	var result struct {
		Origin    string `json:"origin"`
		Horizon   int    `json:"horizon"`
		Forecasts []struct {
			Time       string   `json:"time"`
			TurbineID  int      `json:"turbine_id"`
			Prediction *float64 `json:"prediction"`
		} `json:"forecasts"`
	}
	bad := errors.New("Модель вернула неполный или некорректный прогноз; результат не опубликован")
	if json.Unmarshal(data, &result) != nil || result.Origin != run.Origin || result.Horizon != run.Horizon {
		return bad
	}
	origin, err := time.Parse("2006-01-02 15:04:05", run.Origin)
	if err != nil {
		return bad
	}
	type key struct {
		turbine int
		stamp   string
	}
	expected := make(map[key]bool)
	for _, turbine := range turbines {
		if turbine.Rows == 0 {
			continue
		}
		for hour := 0; hour < run.Horizon; hour++ {
			expected[key{turbine.ID, origin.Add(time.Duration(hour) * time.Hour).Format("2006-01-02 15:04:05")}] = true
		}
	}
	if len(expected) == 0 || len(result.Forecasts) != len(expected) {
		return bad
	}
	for _, row := range result.Forecasts {
		k := key{row.TurbineID, row.Time}
		if !expected[k] || row.Prediction == nil || *row.Prediction < 0 || *row.Prediction > 1 {
			return bad
		}
		delete(expected, k)
	}
	return nil
}
