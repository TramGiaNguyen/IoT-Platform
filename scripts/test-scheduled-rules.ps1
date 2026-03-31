# Script test Scheduled Rules
# Chạy: .\scripts\test-scheduled-rules.ps1

Write-Host "=== Test Scheduled Rules ===" -ForegroundColor Cyan

# 1. Kiểm tra rule engine đang chạy
Write-Host "`n1. Kiểm tra Rule Engine status..." -ForegroundColor Yellow
docker ps --filter "name=rule_engine" --format "table {{.Names}}\t{{.Status}}"

# 2. Xem logs rule engine (10 dòng cuối)
Write-Host "`n2. Rule Engine logs (10 dòng cuối):" -ForegroundColor Yellow
docker logs rule_engine --tail 10

# 3. Kiểm tra scheduled rules trong database
Write-Host "`n3. Scheduled Rules trong database:" -ForegroundColor Yellow
docker exec mysql mysql -uiot -piot123 iot_data -e "SELECT id, ten_rule, cron_expression, device_id, action_command, trang_thai, last_run_at FROM scheduled_rules ORDER BY id DESC LIMIT 5;"

# 4. Kiểm tra commands đã tạo (từ scheduled rules)
Write-Host "`n4. Commands gần đây (từ scheduled rules):" -ForegroundColor Yellow
docker exec mysql mysql -uiot -piot123 iot_data -e "SELECT id, device_id, command, status, created_at FROM commands WHERE rule_id IS NULL ORDER BY created_at DESC LIMIT 5;"

# 5. Test tạo rule mới qua API
Write-Host "`n5. Test tạo scheduled rule mới..." -ForegroundColor Yellow
Write-Host "Bạn cần login vào UI và tạo rule thủ công, sau đó chạy lại script này để xem kết quả" -ForegroundColor Gray

# 6. Hướng dẫn test
Write-Host "`n=== Hướng dẫn test ===" -ForegroundColor Cyan
Write-Host "1. Mở http://localhost:3000" -ForegroundColor White
Write-Host "2. Vào 'Quản lý Rule' > Tab 'Rule theo lịch'" -ForegroundColor White
Write-Host "3. Tạo rule mới với thời gian 1-2 phút tới" -ForegroundColor White
Write-Host "4. Đợi đến giờ và chạy lại script này" -ForegroundColor White
Write-Host "5. Kiểm tra 'last_run_at' đã update chưa" -ForegroundColor White

# 7. Monitor real-time
Write-Host "`n=== Monitor real-time ===" -ForegroundColor Cyan
Write-Host "Chạy lệnh sau để xem logs real-time:" -ForegroundColor White
Write-Host "docker logs -f rule_engine | Select-String 'SCHEDULED'" -ForegroundColor Green

Write-Host "`n=== Hoàn tất ===" -ForegroundColor Cyan
