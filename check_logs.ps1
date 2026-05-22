# Script kiểm tra logs các services bị restart
Write-Host "=== Checking MQTT logs ===" -ForegroundColor Cyan
docker logs mqtt --tail 50

Write-Host "`n=== Checking mqtt_to_kafka logs ===" -ForegroundColor Cyan
docker logs mqtt_to_kafka --tail 50

Write-Host "`n=== Checking rule_engine logs ===" -ForegroundColor Cyan
docker logs rule_engine --tail 50

Write-Host "`n=== Checking container status ===" -ForegroundColor Cyan
docker ps -a --filter "name=mqtt" --filter "name=rule_engine"
