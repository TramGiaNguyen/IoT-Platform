# Script sửa lỗi restart liên tục cho mqtt, mqtt_to_kafka, rule_engine

Write-Host "=== Stopping affected services ===" -ForegroundColor Yellow
docker-compose stop mqtt mqtt-to-kafka rule-engine simulator device-control

Write-Host "`n=== Removing old containers ===" -ForegroundColor Yellow
docker-compose rm -f mqtt mqtt-to-kafka rule-engine simulator device-control

Write-Host "`n=== Rebuilding services ===" -ForegroundColor Cyan
docker-compose build --no-cache mqtt mqtt-to-kafka rule-engine

Write-Host "`n=== Starting services with new healthcheck ===" -ForegroundColor Green
docker-compose up -d

Write-Host "`n=== Waiting 30 seconds for services to stabilize ===" -ForegroundColor Cyan
Start-Sleep -Seconds 30

Write-Host "`n=== Checking service status ===" -ForegroundColor Green
docker-compose ps

Write-Host "`n=== Checking MQTT healthcheck ===" -ForegroundColor Cyan
docker inspect mqtt --format='{{json .State.Health}}' | ConvertFrom-Json | Format-List

Write-Host "`n=== Recent logs from mqtt ===" -ForegroundColor Yellow
docker logs mqtt --tail 20

Write-Host "`n=== Recent logs from mqtt_to_kafka ===" -ForegroundColor Yellow
docker logs mqtt_to_kafka --tail 20

Write-Host "`n=== Recent logs from rule_engine ===" -ForegroundColor Yellow
docker logs rule_engine --tail 20

Write-Host "`n=== Done! ===" -ForegroundColor Green
Write-Host "Nếu vẫn còn lỗi, chạy: docker-compose logs -f mqtt mqtt-to-kafka rule-engine" -ForegroundColor Cyan
