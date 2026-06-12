# Script chẩn đoán lỗi MQTT
Write-Host "=== 1. Checking MQTT container status ===" -ForegroundColor Cyan
docker ps -a --filter "name=mqtt"

Write-Host "`n=== 2. MQTT logs (last 100 lines) ===" -ForegroundColor Cyan
docker logs mqtt --tail 100

Write-Host "`n=== 3. Checking MQTT healthcheck ===" -ForegroundColor Cyan
docker inspect mqtt --format='{{json .State.Health}}' 2>$null | ConvertFrom-Json | Format-List

Write-Host "`n=== 4. Checking MySQL dependency ===" -ForegroundColor Cyan
docker ps --filter "name=mysql"

Write-Host "`n=== 5. MySQL logs (last 30 lines) ===" -ForegroundColor Yellow
docker logs mysql --tail 30

Write-Host "`n=== 6. Testing MQTT port 1883 ===" -ForegroundColor Cyan
$result = Test-NetConnection -ComputerName localhost -Port 1883 -WarningAction SilentlyContinue
if ($result.TcpTestSucceeded) {
    Write-Host "✅ Port 1883 is open" -ForegroundColor Green
} else {
    Write-Host "❌ Port 1883 is closed" -ForegroundColor Red
}

Write-Host "`n=== 7. Checking if mosquitto process is running ===" -ForegroundColor Cyan
docker exec mqtt ps aux 2>$null | Select-String "mosquitto"
