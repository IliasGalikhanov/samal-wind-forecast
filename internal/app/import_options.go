package app

import (
	"encoding/csv"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
	"unicode/utf8"
)

type ImportOptions struct {
	Delimiter   string `json:"delimiter"`
	Time        string `json:"time"`
	Wind        string `json:"wind"`
	Power       string `json:"power"`
	Temperature string `json:"temperature"`
	PowerUnit   string `json:"power_unit"`
}

func readImportOptions(r *http.Request) (ImportOptions, error) {
	var o ImportOptions
	value := r.FormValue("options")
	if len(value) > 8192 || (value != "" && json.Unmarshal([]byte(value), &o) != nil) {
		return o, errors.New("Некорректное сопоставление столбцов")
	}
	if o.Delimiter != "" && o.Delimiter != "," && o.Delimiter != ";" && o.Delimiter != "\t" {
		return o, errors.New("Выберите разделитель CSV: запятая, точка с запятой или табуляция")
	}
	return o, nil
}
func (o ImportOptions) separator() rune {
	if o.Delimiter == "" {
		return ','
	}
	return []rune(o.Delimiter)[0]
}
func (o ImportOptions) divisor(t Turbine) (float64, error) {
	switch o.PowerUnit {
	case "", "normalized":
		return 1, nil
	case "percent":
		return 100, nil
	case "kw", "mw":
		if t.RatedKW <= 0 {
			return 0, errors.New("Для мощности в кВт или МВт укажите номинальную мощность турбины до импорта")
		}
		if o.PowerUnit == "mw" {
			return t.RatedKW / 1000, nil
		}
		return t.RatedKW, nil
	default:
		return 0, errors.New("Неизвестные единицы мощности")
	}
}

func cleanHeaders(head []string) error {
	seen := map[string]bool{}
	for i := range head {
		head[i] = strings.TrimSpace(strings.TrimPrefix(head[i], "\ufeff"))
		if !utf8.ValidString(head[i]) || head[i] == "" || seen[head[i]] {
			return errors.New("CSV должен быть в UTF-8 с непустыми уникальными заголовками")
		}
		seen[head[i]] = true
	}
	return nil
}
func (o ImportOptions) indices(head []string) ([4]int, error) {
	indices := [4]int{}
	if err := cleanHeaders(head); err != nil {
		return indices, err
	}
	names := []string{o.Time, o.Wind, o.Power, o.Temperature}
	aliases := [][]string{{headers[1], "time", "timestamp"}, {headers[2], "wind", "wind_speed"}, {headers[3], "power", "normalized_power"}, {headers[4], "temperature", "temp"}}
	used := map[int]bool{}
	for i, name := range names {
		index := -1
		for j, column := range head {
			match := column == name
			if name == "" {
				for _, alias := range aliases[i] {
					match = match || strings.EqualFold(column, alias)
				}
			}
			if match {
				if index >= 0 {
					return indices, errors.New("Неоднозначные столбцы: задайте сопоставление вручную")
				}
				index = j
			}
		}
		if index < 0 || used[index] {
			return indices, fmt.Errorf("Выберите отдельный столбец: %s", aliases[i][1])
		}
		used[index] = true
		indices[i] = index
	}
	return indices, nil
}

func (a *App) importColumns(w http.ResponseWriter, r *http.Request) {
	r.Body = http.MaxBytesReader(w, r.Body, 50<<20)
	if err := r.ParseMultipartForm(8 << 20); err != nil {
		problem(w, 400, errors.New("Не удалось прочитать CSV. Максимум — 50 МБ"))
		return
	}
	if r.MultipartForm != nil {
		defer r.MultipartForm.RemoveAll()
	}
	o, err := readImportOptions(r)
	if err != nil {
		problem(w, 422, err)
		return
	}
	f, _, err := r.FormFile("file")
	if err != nil {
		problem(w, 400, errors.New("Выберите CSV-файл"))
		return
	}
	defer f.Close()
	reader := csv.NewReader(io.LimitReader(f, 1<<20))
	reader.Comma = o.separator()
	head, err := reader.Read()
	if err != nil {
		problem(w, 422, errors.New("Не удалось прочитать заголовки CSV"))
		return
	}
	if err = cleanHeaders(head); err != nil {
		problem(w, 422, err)
		return
	}
	suggested := ImportOptions{Delimiter: o.Delimiter, PowerUnit: "normalized"}
	if indexes, e := suggested.indices(head); e == nil {
		suggested.Time = head[indexes[0]]
		suggested.Wind = head[indexes[1]]
		suggested.Power = head[indexes[2]]
		suggested.Temperature = head[indexes[3]]
	}
	respond(w, 200, map[string]any{"columns": head, "suggested": suggested})
}
