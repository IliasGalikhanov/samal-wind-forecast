param([string]$PythonPath = '')
$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
if (-not (Get-Command go -ErrorAction SilentlyContinue)) { throw 'Установите Go 1.25+ с go.dev/dl и повторите запуск.' }
if (-not (Get-Command npm.cmd -ErrorAction SilentlyContinue)) { throw 'Установите Node.js 22.12+ или 24 LTS с nodejs.org и повторите запуск.' }
if (-not (Test-Path -LiteralPath '.venv/Scripts/python.exe')) {
    if (-not $PythonPath) {
        $pythonCommand = Get-Command python -ErrorAction SilentlyContinue
        if ($pythonCommand) { $PythonPath = $pythonCommand.Source }
    }
    if (-not $PythonPath) {
        $bundledPython = Join-Path $env:USERPROFILE '.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe'
        if (Test-Path -LiteralPath $bundledPython) { $PythonPath = $bundledPython }
    }
    if (-not $PythonPath) { throw 'Укажите Python 3.12: ./setup.ps1 -PythonPath C:/path/to/python.exe' }
    & $PythonPath -m venv .venv
    if ($LASTEXITCODE -ne 0) { throw 'Не удалось создать окружение Python.' }
}
$requirements = if (Test-Path -LiteralPath 'ml/requirements.lock.txt') { 'ml/requirements.lock.txt' } else { 'ml/requirements.txt' }
& .venv/Scripts/python.exe -m pip install --timeout 120 --progress-bar off -r $requirements
if ($LASTEXITCODE -ne 0) { throw 'Не удалось установить библиотеки Python.' }
Push-Location frontend
try {
    npm.cmd ci
    if ($LASTEXITCODE -ne 0) { throw 'Не удалось установить зависимости интерфейса.' }
    npm.cmd run build
    if ($LASTEXITCODE -ne 0) { throw 'Не удалось собрать интерфейс.' }
} finally { Pop-Location }
$env:GOMODCACHE = Join-Path $PSScriptRoot '.cache/gomod'
$env:GOCACHE = Join-Path $PSScriptRoot '.cache/gobuild'
New-Item -ItemType Directory -Path runtime -Force | Out-Null
go build -o runtime/samal.exe ./cmd/server
if ($LASTEXITCODE -ne 0) { throw 'Не удалось собрать Go-приложение.' }
Write-Host 'SAMAL готов. Запуск: ./start.ps1'
