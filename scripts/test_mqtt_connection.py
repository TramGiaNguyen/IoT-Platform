#!/usr/bin/env python3
"""
Test MQTT connection with device credentials
"""
import paho.mqtt.client as mqtt
import time
import json

# Device credentials from database
DEVICES = [
    {
        "device_id": "gateway-701e68b1",
        "secret_key": "sk_181f87096f30de708bd2047ee106291d"
    },
    {
        "device_id": "gateway-297dfd4c",
        "secret_key": "sk_dbfab99250ac63176a4f5d5a4c7a933c"
    }
]

MQTT_BROKER = "localhost"
MQTT_PORT = 1883

def on_connect(client, userdata, flags, rc):
    device_id = userdata
    if rc == 0:
        print(f"✅ {device_id}: Connected successfully!")
    else:
        print(f"❌ {device_id}: Connection failed with code {rc}")
        if rc == 5:
            print(f"   → Authentication failed. Check username/password.")

def test_device(device):
    device_id = device["device_id"]
    secret_key = device["secret_key"]
    
    print(f"\n🔍 Testing {device_id}...")
    print(f"   Username: {device_id}")
    print(f"   Password: {secret_key}")
    
    client = mqtt.Client(userdata=device_id)
    client.username_pw_set(device_id, secret_key)
    client.on_connect = on_connect
    
    try:
        client.connect(MQTT_BROKER, MQTT_PORT, 60)
        client.loop_start()
        time.sleep(2)
        client.loop_stop()
        client.disconnect()
    except Exception as e:
        print(f"❌ {device_id}: Connection error: {e}")

if __name__ == "__main__":
    print("=" * 60)
    print("MQTT Connection Test")
    print("=" * 60)
    
    for device in DEVICES:
        test_device(device)
    
    print("\n" + "=" * 60)
    print("Test completed!")
    print("=" * 60)
