# Resolves a usable LAN IP (skips WSL/Hyper-V/Docker virtual switches),
# rewrites livekit.yaml + apps/server/.env, then starts livekit-server.
$ErrorActionPreference = "Stop"
$root = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $root

function Get-HezLanIp {
  $adapters = Get-NetIPAddress -AddressFamily IPv4 |
    Where-Object {
      $_.IPAddress -notlike "127.*" -and
      $_.PrefixOrigin -ne "WellKnown" -and
      $_.InterfaceAlias -notmatch "vEthernet|Loopback|Docker|WSL|Hyper-V|Default Switch|VPN|Tailscale|ZeroTier"
    } |
    Sort-Object -Property InterfaceMetric

  $pick = $adapters | Select-Object -First 1
  if (-not $pick) {
    throw "No suitable LAN IPv4 address found"
  }
  return $pick.IPAddress
}

$ip = Get-HezLanIp
Write-Host "[hez] LAN IP: $ip"

$yaml = @"
port: 7880
bind_addresses:
  - "0.0.0.0"
rtc:
  tcp_port: 7881
  udp_port: 7882
  use_external_ip: false
  node_ip: $ip
  enable_loopback_candidate: true
  stun_servers: []
keys:
  APIhezdevkey: hez_dev_secret_change_me_in_production
logging:
  level: info
"@
Set-Content -Path ".\livekit.yaml" -Value $yaml -Encoding UTF8

$envFile = @"
PORT=3001
JWT_SECRET=hez-dev-jwt-secret-change-me
DATABASE_PATH=./data/hez.db
LIVEKIT_URL=ws://${ip}:7880
LIVEKIT_API_KEY=APIhezdevkey
LIVEKIT_API_SECRET=hez_dev_secret_change_me_in_production
HEZ_LAN_IP=$ip
CORS_ORIGIN=http://localhost:5173,http://127.0.0.1:5173,http://${ip}:5173
"@
Set-Content -Path ".\apps\server\.env" -Value $envFile -Encoding UTF8

Get-Process livekit-server -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep -Seconds 1

$exe = Join-Path $root "tools\livekit\livekit-server.exe"
Start-Process -FilePath $exe -ArgumentList "--config","livekit.yaml","--bind","0.0.0.0" -WorkingDirectory $root -WindowStyle Hidden
Write-Host "[hez] LiveKit started. Open http://${ip}:5173"
