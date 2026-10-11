$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
$env:GOMODCACHE = Join-Path $PSScriptRoot '.cache/gomod'
$env:GOCACHE = Join-Path $PSScriptRoot '.cache/gobuild'
if (gofmt -l cmd internal) { throw 'Выполните gofmt для файлов Go.' }
go vet ./...
if ($LASTEXITCODE -ne 0) { throw 'Go vet не пройден.' }
go test ./...
if ($LASTEXITCODE -ne 0) { throw 'Проверки Go не пройдены.' }
$pytestTemp = Join-Path $PSScriptRoot ('.cache/pytest-' + [guid]::NewGuid().ToString('N'))
& .venv/Scripts/python.exe -m pytest ml -q --basetemp $pytestTemp -p no:cacheprovider
if ($LASTEXITCODE -ne 0) { throw 'Проверки Python не пройдены.' }
& .venv/Scripts/python.exe -m unittest discover -s scripts -p 'test_*.py'
if ($LASTEXITCODE -ne 0) { throw 'Проверка защиты публикации не пройдена.' }
& .venv/Scripts/python.exe scripts/check_docs.py
if ($LASTEXITCODE -ne 0) { throw 'Проверка документации не пройдена.' }
Push-Location frontend
try {
    npm.cmd run format:check
    if ($LASTEXITCODE -ne 0) { throw 'Форматирование фронтенда не пройдено.' }
    npm.cmd run build
    if ($LASTEXITCODE -ne 0) { throw 'Проверки TypeScript или сборка не пройдены.' }
} finally { Pop-Location }
Write-Host 'Проверки завершены.'
