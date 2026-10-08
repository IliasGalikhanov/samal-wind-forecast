$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
$env:GOMODCACHE = Join-Path $PSScriptRoot '.cache/gomod'
$env:GOCACHE = Join-Path $PSScriptRoot '.cache/gobuild'
go test ./...
if ($LASTEXITCODE -ne 0) { throw 'Проверки Go не пройдены.' }
& .venv/Scripts/python.exe -m pytest ml -q
if ($LASTEXITCODE -ne 0) { throw 'Проверки Python не пройдены.' }
Push-Location frontend
try {
    npm.cmd run build
    if ($LASTEXITCODE -ne 0) { throw 'Проверки TypeScript или сборка не пройдены.' }
} finally { Pop-Location }
Write-Host 'Проверки завершены.'
