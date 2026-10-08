# Работа с проектом

Фронтенд, API и ML находятся в одном репозитории и основной ветке `main`: изменения контракта можно проверить и выпустить одним pull request. Для новых задач создавайте короткоживущие ветки, например `feat/csv-mapping` или `fix/weather-retry`.

## Коммиты

Используем Conventional Commits: `type(scope): description`. Описание на английском, в повелительной форме; один коммит — одно связное изменение. Типы: `feat`, `fix`, `refactor`, `test`, `docs`, `build`, `ci`, `chore`. Области: `api` (Go), `ml` (Python), `web` (React/TypeScript), `docker`, `repo`.

Примеры:

- `feat(api): support custom turbine coordinates`
- `fix(ml): reject incomplete weather horizons`
- `feat(web): add CSV column mapping`
- `build(docker): add an offline demo profile`

Для всех языков действует одна схема. Форматирование Go — `gofmt`, проверка — `go vet` и `go test`. Python проверяется pytest, TypeScript — компилятором и сборкой Vite. Не добавляйте отдельный форматтер без согласованной конфигурации.

## Проверка изменения

1. Установите зависимости по README и выполните `./check.ps1` на Windows либо команды из workflow на Linux/macOS.
2. Для изменений ML выполните `python scripts/demo.py --verify` в окружении с ML-зависимостями. Для Docker/API проверьте новую пустую установку по `docs/reproducibility.md`.
3. Добавьте только нужные файлы, просмотрите `git diff --cached` и выполните `python scripts/check_publication.py --history`.
4. В pull request опишите изменение поведения и выполненные проверки. Дождитесь успешного CI.

Оригинальные датасеты, пользовательские загрузки, модели, базы, резервные копии, секреты и локальные результаты не публикуются. Для тестов используйте вымышленные данные. Не прикладывайте пользовательскую базу или скриншоты с реальными измерениями к issues.
