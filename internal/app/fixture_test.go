package app

func newFixtureApp(root, python string) (*App, error) {
	a, err := New(root, python)
	if err == nil {
		_, err = a.db.Exec(exampleTurbines)
		if err != nil {
			a.Close()
			return nil, err
		}
	}
	return a, err
}
