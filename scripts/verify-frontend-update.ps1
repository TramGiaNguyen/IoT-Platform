# Script verify frontend đã update
# Chạy: .\scripts\verify-frontend-update.ps1

Write-Host "=== Verify Frontend Update ===" -ForegroundColor Cyan

# 1. Kiểm tra container status
Write-Host "`n1. Frontend container status:" -ForegroundColor Yellow
docker ps --filter "name=react_dashboard" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"

# 2. Kiểm tra thời gian tạo container
Write-Host "`n2. Container created time:" -ForegroundColor Yellow
$created = docker inspect react_dashboard --format '{{.Created}}'
Write-Host "Created: $created" -ForegroundColor White

# 3. Kiểm tra image ID
Write-Host "`n3. Image info:" -ForegroundColor Yellow
docker inspect react_dashboard --format '{{.Image}}' | ForEach-Object {
    $imageId = $_
    Write-Host "Image ID: $imageId" -ForegroundColor White
    docker images --filter "reference=iotplatformnew-frontend" --format "table {{.Repository}}\t{{.Tag}}\t{{.ID}}\t{{.CreatedAt}}"
}

# 4. Kiểm tra file RulesManagement.js trong container
Write-Host "`n4. Checking RulesManagement.js code:" -ForegroundColor Yellow
Write-Host "Searching for 'Array.from({ length: 60' in container..." -ForegroundColor Gray
$result = docker exec react_dashboard grep -n "Array.from({ length: 60" /app/src/components/RulesManagement.js 2>$null
if ($result) {
    Write-Host "✓ FOUND: Code đã update!" -ForegroundColor Green
    Write-Host $result -ForegroundColor White
} else {
    Write-Host "✗ NOT FOUND: Code chưa update hoặc file không tồn tại" -ForegroundColor Red
    Write-Host "Cần rebuild lại frontend!" -ForegroundColor Yellow
}

# 5. Test HTTP endpoint
Write-Host "`n5. Testing frontend HTTP endpoint:" -ForegroundColor Yellow
try {
    $response = Invoke-WebRequest -Uri "http://localhost:3000" -TimeoutSec 5 -UseBasicParsing
    Write-Host "✓ Frontend responding: HTTP $($response.StatusCode)" -ForegroundColor Green
} catch {
    Write-Host "✗ Frontend not responding: $($_.Exception.Message)" -ForegroundColor Red
}

# 6. Hướng dẫn
Write-Host "`n=== Hướng dẫn ===" -ForegroundColor Cyan
Write-Host "1. Mở http://localhost:3000 trong browser" -ForegroundColor White
Write-Host "2. Hard refresh: Ctrl + Shift + R (hoặc Ctrl + F5)" -ForegroundColor White
Write-Host "3. Vào: Quản lý Rule > Rule theo lịch > Tạo rule" -ForegroundColor White
Write-Host "4. Chọn: Tùy chỉnh chi tiết > Vào thời điểm cụ thể" -ForegroundColor White
Write-Host "5. Click dropdown 'Phút' - phải thấy 60 options (00-59)" -ForegroundColor White

Write-Host "`n=== Nếu vẫn thấy code cũ ===" -ForegroundColor Cyan
Write-Host "Chạy lệnh sau để rebuild:" -ForegroundColor White
Write-Host "docker-compose stop frontend" -ForegroundColor Green
Write-Host "docker-compose build --no-cache frontend" -ForegroundColor Green
Write-Host "docker-compose start frontend" -ForegroundColor Green

Write-Host "`nXem thêm: docs/CLEAR_BROWSER_CACHE.md" -ForegroundColor Gray
Write-Host "`n=== Hoàn tất ===" -ForegroundColor Cyan
