import time
import random
import paho.mqtt.client as mqtt

# Cấu hình MQTT
MQTT_BROKER = "mqtt"          # nếu chạy Docker dùng hostname "mqtt", nếu chạy local thì đổi thành "localhost" hoặc IP broker
MQTT_PORT = 1883
CLIENT_ID = "smart-office-sim-1"

# State giả lập relay
state = {
    "ac1": "OFF",
    "ac2": "OFF",
    "light": "OFF",
}

# Khi connect thì subscribe các topic điều khiển
def on_connect(client, userdata, flags, rc):
    print("Connected with result code", rc)
    client.subscribe("bdu/iot/office/ac1")
    client.subscribe("bdu/iot/office/ac2")
    client.subscribe("bdu/iot/office/light")
    print("Subscribed to control topics")

# Khi nhận lệnh điều khiển
def on_message(client, userdata, msg):
    topic = msg.topic
    payload = msg.payload.decode().strip()
    print(f"[COMMAND] {topic} -> {payload}")

    if topic == "bdu/iot/office/ac1":
        state["ac1"] = payload
    elif topic == "bdu/iot/office/ac2":
        state["ac2"] = payload
    elif topic == "bdu/iot/office/light":
        state["light"] = payload

    print(f"Current simulated state: {state}")

def main():
    client = mqtt.Client(client_id=CLIENT_ID)
    client.on_connect = on_connect
    client.on_message = on_message

    client.connect(MQTT_BROKER, MQTT_PORT, 60)
    client.loop_start()

    try:
        last_temp_sent = 0
        interval = 10  # 10 giây giống code ESP32

        while True:
            now = time.time()
            if now - last_temp_sent >= interval:
                # Giả lập đọc nhiệt độ ~ 24–28 độ
                temp = round(random.uniform(24.0, 28.0), 2)
                payload = str(temp)
                client.publish("bdu/iot/office/temperature", payload)
                print(f"[TEMP] Published temperature: {payload} °C")
                last_temp_sent = now

            time.sleep(0.5)
    except KeyboardInterrupt:
        print("Stopping simulator...")
    finally:
        client.loop_stop()
        client.disconnect()

if __name__ == "__main__":
    main()