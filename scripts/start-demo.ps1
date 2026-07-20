# Hez 本地 Demo 启动（假数据库）
# 用法: powershell -ExecutionPolicy Bypass -File scripts/start-demo.ps1

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

$env:HEZ_DEMO = "1"
$env:DATABASE_PATH = Join-Path $Root "apps\server\data\hez-demo.db"
$env:JWT_SECRET = if ($env:JWT_SECRET) { $env:JWT_SECRET } else { "hez-demo-jwt-not-for-production" }
$env:CORS_ORIGIN = if ($env:CORS_ORIGIN) { $env:CORS_ORIGIN } else { "http://localhost:5173,http://127.0.0.1:5173" }

Write-Host "[hez] Demo mode ON"
Write-Host "[hez] DB: $env:DATABASE_PATH"
Write-Host "[hez] Accounts: alice / bob / carol  password: demo123"
Write-Host "[hez] UI lab (no API): http://localhost:5173/lab"
Write-Host ""

# Start API (demo entry) + web
Start-Process -FilePath "npm" -ArgumentList @("run", "demo:server") -WorkingDirectory $Root -NoNewWindow
Start-Sleep -Seconds 1
npm run dev:web
