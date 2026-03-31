# Chẩn đoán: POST từ host Windows và từ container fastapi_backend tới edge control URL.
# Chạy từ thư mục gốc repo:  .\scripts\verify-edge-control.ps1
# Tuỳ chọn: -EdgeUrl "http://IP/api/v1/control" -ApiKey "ak_..."

param(
    [string]$EdgeUrl = "http://192.168.190.171/api/v1/control",
    [string]$ApiKey = ""
)

$ErrorActionPreference = "Continue"
$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $root

Write-Host "=== 1) Host: Python scripts/verify_edge_control.py ===" -ForegroundColor Cyan
$pyArgs = @("scripts/verify_edge_control.py", "--url", $EdgeUrl)
if ($ApiKey) { $pyArgs += @("--header", "X-API-Key: $ApiKey") }
if (Get-Command python -ErrorAction SilentlyContinue) {
    & python @pyArgs
} elseif (Get-Command py -ErrorAction SilentlyContinue) {
    & py @pyArgs
} else {
    Write-Host "Không tìm thấy python trên PATH. Thử Invoke-WebRequest..." -ForegroundColor Yellow
    $bodyObj = @{
        control_commands = @(
            @{
                relay     = 1
                commands  = @{ on = @{ relay = 1; state = "ON" } }
            }
        )
    }
    $json = $bodyObj | ConvertTo-Json -Depth 10
    $headers = @{ "Content-Type" = "application/json" }
    if ($ApiKey) { $headers["X-API-Key"] = $ApiKey }
    try {
        $r = Invoke-WebRequest -Uri $EdgeUrl -Method POST -Body $json -Headers $headers -UseBasicParsing -TimeoutSec 15
        Write-Host "HTTP $($r.StatusCode)"
    } catch {
        Write-Host "FAIL: $($_.Exception.Message)"
    }
}

Write-Host ""
Write-Host "=== 2) Container fastapi_backend (nếu đang chạy) ===" -ForegroundColor Cyan
$running = docker ps --filter "name=fastapi_backend" --format "{{.Names}}" 2>$null
if ($running) { $running = $running.Trim() }
if (-not $running) {
    Write-Host "Không thấy container fastapi_backend. Bỏ qua bước 2." -ForegroundColor Yellow
    exit 0
}

# Copy script vào container và chạy (image python có requests)
$scriptPath = Join-Path $root "scripts/verify_edge_control.py"
docker cp "$scriptPath" "${running}:/tmp/verify_edge_control.py" 2>$null
if ($LASTEXITCODE -ne 0) {
    Write-Host "docker cp thất bại." -ForegroundColor Yellow
    exit 0
}

$execArgs = @("/tmp/verify_edge_control.py", "--url", $EdgeUrl)
if ($ApiKey) {
    $execArgs += @("--header", "X-API-Key: $ApiKey")
}
docker exec $running python @execArgs

Write-Host ""
Write-Host "Gợi ý: Nếu host OK nhưng container FAIL -> kiểm tra routing Docker -> LAN." -ForegroundColor DarkGray
Write-Host "Nếu HTTP 401/403 -> xem docs/EDGE_CONTROL_DEBUG.md (EDGE_CONTROL_API_KEY)." -ForegroundColor DarkGray
