# Quick import script - Import vào Docker containers

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "Quick Import Tool - Import to Docker" -ForegroundColor Cyan
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

# Kiểm tra folder backup
if (-not (Test-Path "backup")) {
    Write-Host "`n❌ Error: backup/ folder not found!" -ForegroundColor Red
    Write-Host "Please copy backup folder from old machine first." -ForegroundColor Yellow
    exit 1
}

# Tìm file backup mới nhất
Write-Host "`n🔍 Finding backup files..." -ForegroundColor Cyan
$mysqlBackup = Get-ChildItem "backup/mysql_backup_*.sql" -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending | Select-Object -First 1
$mongoBackup = Get-ChildItem "backup/mongodb_*" -Directory -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending | Select-Object -First 1

if (-not $mysqlBackup) {
    Write-Host "❌ MySQL backup file not found!" -ForegroundColor Red
    exit 1
}

if (-not $mongoBackup) {
    Write-Host "❌ MongoDB backup folder not found!" -ForegroundColor Red
    exit 1
}

Write-Host "Found backup files:" -ForegroundColor Green
Write-Host "  MySQL: $($mysqlBackup.Name)"
Write-Host "  MongoDB: $($mongoBackup.Name)"

# Confirm
Write-Host "`n⚠️  WARNING: This will overwrite existing data!" -ForegroundColor Yellow
$confirm = Read-Host "Continue? (yes/no)"
if ($confirm -ne "yes") {
    Write-Host "❌ Import cancelled" -ForegroundColor Red
    exit 0
}

# Import MySQL
Write-Host "`n📥 Importing MySQL data..." -ForegroundColor Cyan
Get-Content $mysqlBackup.FullName | docker exec -i mysql mysql -u iot -piot123 iot_data
if ($LASTEXITCODE -eq 0) {
    Write-Host "✅ MySQL imported successfully" -ForegroundColor Green
} else {
    Write-Host "❌ MySQL import failed!" -ForegroundColor Red
}

# Import MongoDB
Write-Host "`n📥 Importing MongoDB data..." -ForegroundColor Cyan
docker cp $mongoBackup.FullName mongodb:/tmp/mongo_restore 2>&1 | Out-Null
docker exec mongodb mongorestore --db iot --drop /tmp/mongo_restore 2>&1 | Out-Null
if ($LASTEXITCODE -eq 0) {
    Write-Host "✅ MongoDB imported successfully" -ForegroundColor Green
} else {
    Write-Host "❌ MongoDB import failed!" -ForegroundColor Red
}

Write-Host "`n==========================================" -ForegroundColor Cyan
Write-Host "✅ Import completed!" -ForegroundColor Green
Write-Host "==========================================" -ForegroundColor Cyan

Write-Host "`n📋 Next steps:" -ForegroundColor Yellow
Write-Host "1. Restart containers: docker-compose restart"
Write-Host "2. Check dashboard: http://localhost:3000"
Write-Host "3. Verify devices are showing up"

Write-Host "`n🔄 Restarting containers..." -ForegroundColor Cyan
docker-compose restart
Write-Host "✅ Containers restarted" -ForegroundColor Green
