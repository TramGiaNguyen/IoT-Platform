#!/bin/sh

echo "🚀 Starting MQTT Auth Sync container..."

# Start the sync service in background (will add new device credentials)
echo "📡 Starting credential sync service..."
python3 /app/sync_credentials.py 2>&1 &

# Wait a moment for initial sync
sleep 5

# Start Mosquitto
echo "🔐 Starting Mosquitto with authentication..."
exec mosquitto -c /mosquitto/config/mosquitto.conf
