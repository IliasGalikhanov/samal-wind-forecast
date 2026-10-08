param([int]$Port = 8080)
$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
if (-not (Test-Path -LiteralPath 'runtime/samal.exe')) { throw 'Сначала выполните ./setup.ps1' }
if (-not (Test-Path -LiteralPath '.venv/Scripts/python.exe')) { throw 'Сначала выполните ./setup.ps1' }
if (-not (Test-Path -LiteralPath 'frontend/dist/index.html')) { throw 'Интерфейс не собран. Выполните ./setup.ps1' }
$serverArgs = @('-root', $PSScriptRoot, '-addr', "127.0.0.1:$Port")
if ((Test-Path -LiteralPath 'data/raw/turbine 1.csv') -and (Test-Path -LiteralPath 'data/raw/turbine 2.csv')) {
    $serverArgs += @('-seed', (Join-Path $PSScriptRoot 'data/raw'))
}
Write-Host "SAMAL: http://127.0.0.1:$Port — для остановки нажмите Ctrl+C."
& .\runtime\samal.exe @serverArgs
