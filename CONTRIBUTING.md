# Работа с проектом

Фронтенд, API и ML находятся в одном репозитории и основной ветке `main`: изменения контракта можно проверить и выпустить одним pull request. Для новых задач создавайте короткоживущие ветки, например `feat/csv-mapping` или `fix/weather-retry`.

## Коммиты

Используем Conventional Commits: `type(scope): description`. Описание на английском, в повелительной форме; один коммит — одно связное изменение. Типы: `feat`, `fix`, `refactor`, `test`, `docs`, `build`, `ci`, `chore`. Области: `api` (Go), `ml` (Python), `web` (React/TypeScript), `docker`, `repo`.

Примеры:

- `feat(api): support custom turbine coordinates`
- `fix(ml): reject incomplete weather horizons`
- `feat(web): add CSV column mapping`
- `build(docker): add an offline demo profile`

Для всех языков действует одна схема. Форматирование Go — `gofmt`, проверка — `go vet` и `go test`. Python проверяется pytest. Для фронтенда используется Prettier с конфигурацией `frontend/.prettierrc.json`: `npm --prefix frontend run format`. TypeScript проверяется компилятором и сборкой Vite; пользовательские сценарии — Playwright.

## Проверка изменения

1. Установите зависимости по README и выполните `./check.ps1` на Windows либо команды из workflow на Linux/macOS.
2. Для изменений ML выполните `python scripts/demo.py --verify` в окружении с ML-зависимостями. Для Docker/API проверьте новую пустую установку по `docs/reproducibility.md`.
3. Добавьте только нужные файлы, просмотрите `git diff --cached` и выполните `python scripts/check_publication.py --history`.
4. В pull request опишите изменение поведения и выполненные проверки. Дождитесь успешного CI.

Для изменений интерфейса выполните `npm --prefix frontend run test:e2e`. Нужны установленные ML-зависимости, Go и Chromium (`cd frontend; npx playwright install chromium`). Два сервера используют новые базы под `.cache/e2e/` на портах 8095/8096. Тесты не переиспользуют уже работающий сервер. Полный ML-тест может занять несколько минут. При ошибке доступны локальные `frontend/playwright-report/` и `frontend/test-results/`; в CI они сохраняются как краткоживущие артефакты.

Изменяя API, обновляйте `docs/openapi.json` и запускайте `python scripts/check_docs.py`. Проверяются ссылки документации, уникальные operationId, ссылки схем и соответствие списка методов маршрутам Go. Это не заменяет интеграционные тесты поведения API.

Оригинальные датасеты, пользовательские загрузки, модели, базы, резервные копии, секреты и локальные результаты не публикуются. Для тестов используйте вымышленные данные. Не прикладывайте пользовательскую базу или скриншоты с реальными измерениями к issues.
