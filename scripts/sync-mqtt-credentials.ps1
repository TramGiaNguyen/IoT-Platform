# Sync MQTT credentials after rebuild
Write-Host "🔄 Syncing MQTT credentials..." -ForegroundColor Cyan

# Run sync script
docker exec -d mqtt python /app/sync_credentials.py

Start-Sleep -Seconds 5

# Restart MQTT to apply changes
Write-Host "🔄 Restarting MQTT broker..." -ForegroundColor Cyan
docker restart mqtt

Start-Sleep -Seconds 10

Write-Host "✅ MQTT credentials synced successfully!" -ForegroundColor Green
Write-Host ""
Write-Host "Your devices can now connect with their credentials from database." -ForegroundColor Yellow
