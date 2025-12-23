#!/usr/bin/env python3
"""
MQTT Authentication Sync Service
Syncs device credentials from MySQL to Mosquitto password file.
Runs periodically to keep credentials updated.
"""

import os
import time
import subprocess
import mysql.connector
from pathlib import Path

# Configuration
MYSQL_HOST = os.getenv('MYSQL_HOST', 'mysql')
MYSQL_USER = os.getenv('MYSQL_USER', 'iot')
MYSQL_PASSWORD = os.getenv('MYSQL_PASSWORD', 'iot123')
MYSQL_DATABASE = os.getenv('MYSQL_DATABASE', 'iot_data')

PASSWORD_FILE = '/mosquitto/config/password_file'
SYNC_INTERVAL = int(os.getenv('SYNC_INTERVAL', '30'))  # seconds

# Default users that should always exist
DEFAULT_USERS = {
    'mqtt_to_kafka': os.getenv('MQTT_TO_KAFKA_PASSWORD', 'mqtt2kafka_secret'),
    'device_simulator': os.getenv('SIMULATOR_PASSWORD', 'simulator_secret'),
    'rule_engine': os.getenv('RULE_ENGINE_PASSWORD', 'ruleengine_secret'),
}


def get_mysql_connection():
    """Create MySQL connection with retry logic."""
    max_retries = 10
    retry_delay = 5
    
    for i in range(max_retries):
        try:
            conn = mysql.connector.connect(
                host=MYSQL_HOST,
                user=MYSQL_USER,
                password=MYSQL_PASSWORD,
                database=MYSQL_DATABASE
            )
            return conn
        except mysql.connector.Error as e:
            if i < max_retries - 1:
                print(f"⏳ Waiting for MySQL... (attempt {i+1}/{max_retries})")
                time.sleep(retry_delay)
            else:
                raise e
    return None


def get_device_credentials():
    """Fetch all device credentials from MySQL."""
    conn = get_mysql_connection()
    cursor = conn.cursor(dictionary=True)
    
    try:
        cursor.execute("""
            SELECT ma_thiet_bi, secret_key 
            FROM thiet_bi 
            WHERE is_active = 1 
              AND secret_key IS NOT NULL 
              AND protocol IN ('mqtt', 'both')
        """)
        devices = cursor.fetchall()
        return {d['ma_thiet_bi']: d['secret_key'] for d in devices}
    finally:
        cursor.close()
        conn.close()


def update_password_file(credentials):
    """
    Update Mosquitto password file with credentials.
    Uses mosquitto_passwd to properly hash passwords.
    """
    temp_file = '/tmp/mosquitto_passwd_temp'
    
    # Create empty file first
    Path(temp_file).touch()
    
    # Add default users first
    for username, password in DEFAULT_USERS.items():
        try:
            subprocess.run(
                ['mosquitto_passwd', '-b', temp_file, username, password],
                check=True,
                capture_output=True
            )
        except subprocess.CalledProcessError as e:
            print(f"❌ Failed to add user {username}: {e}")
    
    # Add device credentials
    for device_id, secret_key in credentials.items():
        # Remove 'sk_' prefix if present (secret key is the password)
        password = secret_key
        try:
            subprocess.run(
                ['mosquitto_passwd', '-b', temp_file, device_id, password],
                check=True,
                capture_output=True
            )
        except subprocess.CalledProcessError as e:
            print(f"❌ Failed to add device {device_id}: {e}")
    
    # Atomically replace the password file
    import shutil
    shutil.move(temp_file, PASSWORD_FILE)
    
    # Send SIGHUP to Mosquitto to reload password file
    try:
        # Find mosquitto process and send SIGHUP
        result = subprocess.run(
            ['pkill', '-HUP', 'mosquitto'],
            capture_output=True
        )
        if result.returncode == 0:
            print("🔄 Sent SIGHUP to Mosquitto - password file reloaded")
        else:
            print("⚠️ Could not signal Mosquitto (may need restart)")
    except Exception as e:
        print(f"⚠️ Failed to signal Mosquitto: {e}")
    
    print(f"✅ Updated password file with {len(credentials)} devices + {len(DEFAULT_USERS)} default users")


def main():
    """Main sync loop."""
    print("🔐 MQTT Auth Sync Service starting...")
    print(f"📊 Sync interval: {SYNC_INTERVAL} seconds")
    
    # Wait for dependencies
    time.sleep(10)
    
    last_credentials = {}
    
    while True:
        try:
            # Fetch current credentials
            credentials = get_device_credentials()
            
            # Only update if there are changes
            if credentials != last_credentials:
                print(f"🔄 Detected changes, syncing {len(credentials)} device credentials...")
                update_password_file(credentials)
                last_credentials = credentials.copy()
            else:
                print(f"✓ No changes detected ({len(credentials)} devices)")
            
        except Exception as e:
            print(f"❌ Sync error: {e}")
        
        time.sleep(SYNC_INTERVAL)


if __name__ == '__main__':
    main()
