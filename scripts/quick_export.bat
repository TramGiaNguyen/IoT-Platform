@echo off
REM Quick export script for Windows CMD

echo ==========================================
echo Quick Export Tool - Export from Docker
echo ==========================================

REM Check Docker is running
echo.
echo Checking Docker containers...
docker-compose ps >nul 2>&1
if errorlevel 1 (
    echo ERROR: Docker containers are not running!
    echo Please start Docker first: docker-compose up -d
    exit /b 1
)
echo Docker containers are running

REM Create backup folder
if not exist "backup" mkdir backup

REM Get timestamp
for /f "tokens=2-4 delims=/ " %%a in ('date /t') do (set mydate=%%c%%a%%b)
for /f "tokens=1-2 delims=/:" %%a in ('time /t') do (set mytime=%%a%%b)
set timestamp=%mydate%_%mytime%

REM Export MySQL
echo.
echo Exporting MySQL data...
docker exec mysql mysqldump -u iot -piot123 iot_data > backup\mysql_backup.sql
if errorlevel 1 (
    echo ERROR: MySQL export failed!
) else (
    echo MySQL exported: backup\mysql_backup.sql
)

REM Export MongoDB
echo.
echo Exporting MongoDB data...
docker exec mongodb mongodump --db iot --out /tmp/mongo_backup
docker cp mongodb:/tmp/mongo_backup/iot backup\mongodb_backup
if errorlevel 1 (
    echo ERROR: MongoDB export failed!
) else (
    echo MongoDB exported: backup\mongodb_backup
)

echo.
echo ==========================================
echo Export completed!
echo ==========================================

echo.
echo Backup files:
echo   MySQL: backup\mysql_backup.sql
echo   MongoDB: backup\mongodb_backup
echo.
echo Next steps:
echo 1. Copy folder 'backup' to new machine
echo 2. On new machine, run: scripts\quick_import.bat

pause
