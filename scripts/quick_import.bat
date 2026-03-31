@echo off
REM Quick import script for Windows CMD

echo ==========================================
echo Quick Import Tool - Import to Docker
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

REM Check backup folder
if not exist "backup" (
    echo.
    echo ERROR: backup folder not found!
    echo Please copy backup folder from old machine first.
    exit /b 1
)

REM Check backup files
if not exist "backup\mysql_backup.sql" (
    echo.
    echo ERROR: MySQL backup file not found!
    echo Looking for: backup\mysql_backup.sql
    exit /b 1
)

if not exist "backup\mongodb_backup" (
    echo.
    echo ERROR: MongoDB backup folder not found!
    echo Looking for: backup\mongodb_backup
    exit /b 1
)

echo.
echo Found backup files:
echo   MySQL: backup\mysql_backup.sql
echo   MongoDB: backup\mongodb_backup

REM Confirm
echo.
echo WARNING: This will overwrite existing data!
set /p confirm="Continue? (yes/no): "
if not "%confirm%"=="yes" (
    echo Import cancelled
    exit /b 0
)

REM Import MySQL
echo.
echo Importing MySQL data...
type backup\mysql_backup.sql | docker exec -i mysql mysql -u iot -piot123 iot_data
if errorlevel 1 (
    echo ERROR: MySQL import failed!
) else (
    echo MySQL imported successfully
)

REM Import MongoDB
echo.
echo Importing MongoDB data...
docker cp backup\mongodb_backup mongodb:/tmp/mongo_restore
docker exec mongodb mongorestore --db iot --drop /tmp/mongo_restore
if errorlevel 1 (
    echo ERROR: MongoDB import failed!
) else (
    echo MongoDB imported successfully
)

echo.
echo ==========================================
echo Import completed!
echo ==========================================

echo.
echo Next steps:
echo 1. Restarting containers...
docker-compose restart
echo 2. Check dashboard: http://localhost:3000
echo 3. Verify devices are showing up

echo.
echo Done!
pause
