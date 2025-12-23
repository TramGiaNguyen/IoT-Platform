#!/usr/bin/env python3
import paho.mqtt.client as mqtt
import time
import json

def on_connect(client, userdata, flags, rc, properties=None):
    print(f"✅ Connected with code {rc}")
    client.subscribe("iot/+/data")
    print("📡 Subscribed to iot/+/data")

def on_message(client, userdata, msg):
    print(f"📥 RECEIVED on {msg.topic}: {msg.payload.decode()[:100]}")

client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2, protocol=mqtt.MQTTv311)
client.on_connect = on_connect
client.on_message = on_message
client.connect("mqtt", 1883, 60)
client.loop_start()

print("Waiting for messages...")
time.sleep(30)
client.loop_stop()
client.disconnect()





