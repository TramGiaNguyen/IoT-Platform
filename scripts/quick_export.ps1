# Quick export script - Export trực tiếp từ Docker containers

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "Quick Export Tool - Export from Docker" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan

# Kiểm tra Docker đang chạy
Write-Host "`n🔍 Checking Docker containers..." -ForegroundColor Cyan
$containers = docker-compose ps --services --filter "status=running"
if (-not $containers) {
    Write-Host "❌ Error: Docker containers are not running!" -ForegroundColor Red
    Write-Host "Please start Docker first: docker-compose up -d" -ForegroundColor Yellow
    exit 1
}

Write-Host "✅ Docker containers are running" -ForegroundColor Green

# Tạo folder backup
$timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
$backupDir = "backup"
if (-not (Test-Path $backupDir)) {
    New-Item -ItemType Directory -Path $backupDir | Out-Null
}

Write-Host "`n📦 Exporting MySQL data..." -ForegroundColor Cyan
$mysqlFile = "$backupDir/mysql_backup_$timestamp.sql"
docker exec mysql mysqldump -u iot -piot123 iot_data > $mysqlFile
if ($LASTEXITCODE -eq 0) {
    $size = (Get-Item $mysqlFile).Length / 1KB
    Write-Host "✅ MySQL exported: $mysqlFile ($([math]::Round($size, 2)) KB)" -ForegroundColor Green
} else {
    Write-Host "❌ MySQL export failed!" -ForegroundColor Red
}

Write-Host "`n📦 Exporting MongoDB data..." -ForegroundColor Cyan
$mongoDir = "$backupDir/mongodb_$timestamp"
docker exec mongodb mongodump --db iot --out /tmp/mongo_backup 2>&1 | Out-Null
docker cp mongodb:/tmp/mongo_backup/iot $mongoDir 2>&1 | Out-Null
if ($LASTEXITCODE -eq 0) {
    Write-Host "✅ MongoDB exported: $mongoDir" -ForegroundColor Green
} else {
    Write-Host "❌ MongoDB export failed!" -ForegroundColor Red
}

Write-Host "`n==========================================" -ForegroundColor Cyan
Write-Host "✅ Export completed!" -ForegroundColor Green
Write-Host "==========================================" -ForegroundColor Cyan

Write-Host "`n📋 Backup files:" -ForegroundColor Yellow
Write-Host "  MySQL: $mysqlFile"
Write-Host "  MongoDB: $mongoDir"

Write-Host "`n📋 Next steps:" -ForegroundColor Yellow
Write-Host "1. Copy folder 'backup/' to new machine"
Write-Host "2. On new machine, run: powershell -ExecutionPolicy Bypass -File scripts/quick_import.ps1"
