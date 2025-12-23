import paho.mqtt.client as mqtt
import json, time

MQTT_BROKER = "192.168.1.7"
MQTT_PORT = 1883
DEVICE_ID = "test-ngrok-001"

def on_connect(client, userdata, flags, rc, properties=None):
    print(f"✅ Connected! rc={rc}")

client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2)
client.on_connect = on_connect
client.connect(MQTT_BROKER, MQTT_PORT)
client.loop_start()

time.sleep(2)

# Gửi liên tục 15 giây
print("🔄 Gửi liên tục trong 15 giây - Nhấn 'Quét thiết bị' ngay!")
for i in range(15):
    data = {"device_id": DEVICE_ID, "temperature": 30 + i, "humidity": 60, "timestamp": time.time()}
    client.publish(f"garden/{DEVICE_ID}/sensor", json.dumps(data))
    print(f"📤 [{i+1}/15] Sent: {data}")
    time.sleep(1)

client.disconnect()
print("✅ Done!")