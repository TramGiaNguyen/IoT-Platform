# PowerShell script để migrate dữ liệu giữa 2 máy Windows

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "IoT Platform Data Migration Tool" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Chọn chế độ:"
Write-Host "1. Export data (chạy trên máy CŨ)"
Write-Host "2. Import data (chạy trên máy MỚI)"
Write-Host ""
$choice = Read-Host "Nhập lựa chọn (1 hoặc 2)"

if ($choice -eq "1") {
    Write-Host ""
    Write-Host "📦 EXPORT MODE - Máy CŨ" -ForegroundColor Yellow
    Write-Host "==========================================" -ForegroundColor Yellow
    
    # Install dependencies
    Write-Host "📥 Installing Python dependencies..." -ForegroundColor Cyan
    pip install mysql-connector-python pymongo
    
    # Run export
    Write-Host ""
    Write-Host "🔄 Exporting data..." -ForegroundColor Cyan
    python scripts/export_data.py
    
    Write-Host ""
    Write-Host "✅ Export completed!" -ForegroundColor Green
    Write-Host ""
    Write-Host "📋 Next steps:" -ForegroundColor Yellow
    Write-Host "1. Copy folder 'backup/' to new machine"
    Write-Host "2. Run this script on new machine and choose option 2"
    
} elseif ($choice -eq "2") {
    Write-Host ""
    Write-Host "📥 IMPORT MODE - Máy MỚI" -ForegroundColor Yellow
    Write-Host "==========================================" -ForegroundColor Yellow
    
    # Check if backup folder exists
    if (-not (Test-Path "backup")) {
        Write-Host "❌ Error: backup/ folder not found!" -ForegroundColor Red
        Write-Host "Please copy backup folder from old machine first." -ForegroundColor Red
        exit 1
    }
    
    # Find latest backup files
    $MYSQL_BACKUP = Get-ChildItem "backup/mysql_backup_*.json" | Sort-Object LastWriteTime -Descending | Select-Object -First 1
    $MONGO_BACKUP = Get-ChildItem "backup/mongodb_backup_*.json" | Sort-Object LastWriteTime -Descending | Select-Object -First 1
    
    if (-not $MYSQL_BACKUP -or -not $MONGO_BACKUP) {
        Write-Host "❌ Error: Backup files not found in backup/ folder" -ForegroundColor Red
        exit 1
    }
    
    Write-Host "Found backup files:" -ForegroundColor Green
    Write-Host "  MySQL: $($MYSQL_BACKUP.Name)"
    Write-Host "  MongoDB: $($MONGO_BACKUP.Name)"
    Write-Host ""
    
    # Install dependencies
    Write-Host "📥 Installing Python dependencies..." -ForegroundColor Cyan
    pip install mysql-connector-python pymongo
    
    # Run import
    Write-Host ""
    Write-Host "🔄 Importing data..." -ForegroundColor Cyan
    python scripts/import_data.py $MYSQL_BACKUP.FullName $MONGO_BACKUP.FullName
    
    Write-Host ""
    Write-Host "✅ Import completed!" -ForegroundColor Green
    Write-Host ""
    Write-Host "📋 Next steps:" -ForegroundColor Yellow
    Write-Host "1. Restart containers: docker-compose restart"
    Write-Host "2. Check dashboard: http://localhost:3000"
    
} else {
    Write-Host "❌ Invalid choice. Please run again and choose 1 or 2." -ForegroundColor Red
    exit 1
}
