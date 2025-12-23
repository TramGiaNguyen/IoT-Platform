import json
import random
import time
import os

import paho.mqtt.client as mqtt

# MQTT Configuration
MQTT_BROKER = os.getenv('MQTT_BROKER', 'mqtt')
MQTT_PORT = int(os.getenv('MQTT_PORT', '1883'))
MQTT_USERNAME = os.getenv('MQTT_USERNAME', None)
MQTT_PASSWORD = os.getenv('MQTT_PASSWORD', None)

# Thiết bị giả lập
SENSOR_ID = "sensor-bdu-001"
AC1_ID = "ac-bdu-001"
AC2_ID = "ac-bdu-002"
LIGHT_ID = "light-bdu-001"

device_states = {
    AC1_ID: {"type": "air_conditioner", "state": "OFF", "setpoint": 24},
    AC2_ID: {"type": "air_conditioner", "state": "OFF", "setpoint": 24},
    LIGHT_ID: {"type": "light", "state": "OFF", "brightness": 0},  # 0–100
}

def on_connect(client, userdata, flags, rc, properties=None):
    print("✅ Connected to MQTT with result code", rc)

    # Subscribe các topic điều khiển cho từng thiết bị
    control_topics = [
        f"iot/devices/{AC1_ID}/control",
        f"iot/devices/{AC2_ID}/control",
        f"iot/devices/{LIGHT_ID}/control",
    ]
    for t in control_topics:
        client.subscribe(t)
        print(f"📡 Subscribed control topic: {t}")


def handle_ac_command(device_id: str, payload: str, payload_json: dict | None = None):
    """
    Hỗ trợ:
      - "ON" / "OFF"
      - "SET_TEMP:26"
      - JSON: {"state": "ON"/"OFF", "setpoint": 24}
      - JSON từ rule_engine: {"command": "set_ac_temp", "params": "{\"target\": 20}"}
    """
    state = device_states[device_id]

    if payload_json:
        # Handle rule_engine format: {"command": "set_ac_temp", "params": "{\"target\": 20}"}
        if "command" in payload_json:
            cmd = payload_json["command"]
            params_raw = payload_json.get("params")
            params = {}
            if params_raw:
                try:
                    params = json.loads(params_raw) if isinstance(params_raw, str) else params_raw
                except:
                    params = {}
            
            if cmd == "set_ac_temp":
                target = params.get("target")
                if target is not None:
                    try:
                        state["setpoint"] = float(target)
                        # Không tự động bật ON - chỉ cập nhật setpoint
                        print(f"✅ AC {device_id} set setpoint to {target}°C (state: {state['state']})")
                    except:
                        print(f"⚠️ Invalid target for {device_id}: {target}")
            elif cmd in ("on", "ON"):
                state["state"] = "ON"
            elif cmd in ("off", "OFF"):
                state["state"] = "OFF"
            return

        # Handle direct format: {"state": "ON"/"OFF", "setpoint": 24}
        if "state" in payload_json:
            st = str(payload_json["state"]).upper()
            if st in ("ON", "OFF"):
                state["state"] = st
        if "setpoint" in payload_json:
            try:
                value = float(payload_json["setpoint"])
                state["setpoint"] = value
                state["state"] = "ON"
            except Exception:
                print(f"⚠️  Invalid JSON setpoint for {device_id}: {payload_json}")
        return

    cmd = payload.upper()
    if cmd in ("ON", "OFF"):
        state["state"] = cmd
    elif cmd.startswith("SET_TEMP:"):
        try:
            value = float(cmd.split(":", 1)[1])
            state["setpoint"] = value
            state["state"] = "ON"
        except ValueError:
            print(f"⚠️  Invalid SET_TEMP value for {device_id}: {payload}")


def handle_light_command(device_id: str, payload: str, payload_json: dict | None = None):
    """
    Hỗ trợ:
      - "ON" / "OFF"
      - "BRIGHTNESS:80" (0–100)
      - JSON: {"state": "ON"/"OFF", "brightness": 80}
    """
    state = device_states[device_id]

    if payload_json:
        if "state" in payload_json:
            st = str(payload_json["state"]).upper()
            if st in ("ON", "OFF"):
                state["state"] = st
                if st == "OFF":
                    state["brightness"] = 0
        if "brightness" in payload_json:
            try:
                value = int(payload_json["brightness"])
                value = max(0, min(100, value))
                state["brightness"] = value
                state["state"] = "ON" if value > 0 else state.get("state", "OFF")
            except Exception:
                print(f"⚠️  Invalid JSON brightness for {device_id}: {payload_json}")
        return

    cmd = payload.upper()
    if cmd in ("ON", "OFF"):
        state["state"] = cmd
        if cmd == "OFF":
            state["brightness"] = 0
        elif state["brightness"] == 0:
            state["brightness"] = 100
    elif cmd.startswith("BRIGHTNESS:"):
        try:
            value = int(cmd.split(":", 1)[1])
            value = max(0, min(100, value))
            state["brightness"] = value
            state["state"] = "ON" if value > 0 else "OFF"
        except ValueError:
            print(f"⚠️  Invalid BRIGHTNESS value for {device_id}: {payload}")


def on_message(client, userdata, msg):
    topic = msg.topic
    payload = msg.payload.decode().strip()
    print(f"[COMMAND] {topic} -> {payload}")
    payload_json = None
    try:
        payload_json = json.loads(payload)
    except Exception:
        payload_json = None

    parts = topic.split("/")
    # topic dạng: iot/devices/{device_id}/control
    if len(parts) >= 4 and parts[0] == "iot" and parts[1] == "devices" and parts[-1] == "control":
        device_id = parts[2]
        if device_id not in device_states:
            print(f"⚠️  Unknown device_id in command: {device_id}")
            return

        if device_states[device_id]["type"] == "air_conditioner":
            handle_ac_command(device_id, payload, payload_json)
        elif device_states[device_id]["type"] == "light":
            handle_light_command(device_id, payload, payload_json)

        print(f"🔁 Updated state: {device_id} -> {device_states[device_id]}")
        # Publish trạng thái ngay sau khi nhận lệnh để UI thấy ON/OFF kịp thời
        status_topic = f"iot/devices/{device_id}/status"
        status_payload = {
            "device_id": device_id,
            "type": device_states[device_id]["type"],
            "state": device_states[device_id]["state"],
            "setpoint": device_states[device_id].get("setpoint"),
            "brightness": device_states[device_id].get("brightness"),
            "timestamp": time.time(),
        }
        pubres = client.publish(status_topic, json.dumps(status_payload), qos=1)
        try:
            pubres.wait_for_publish(timeout=2)  # Timeout để không block vô hạn
        except Exception as e:
            print(f"⚠️ Publish timeout: {e}")
        print(f"📤 Immediate status to {status_topic}: {status_payload}")


def publish_sensor_and_states(client: mqtt.Client):
    # Sensor nhiệt độ/độ ẩm
    data = {
        "device_id": SENSOR_ID,
        "temperature": round(random.uniform(25.0, 35.0), 2),
        "humidity": round(random.uniform(50.0, 70.0), 2),
        "timestamp": time.time(),
    }
    sensor_topic = f"iot/devices/{SENSOR_ID}/data"
    # Publish với QoS=1 để đảm bảo message được deliver
    result = client.publish(sensor_topic, json.dumps(data), qos=1)
    result.wait_for_publish(timeout=2)  # Timeout để không block vô hạn
    print(f"✅ Published to {sensor_topic}: {data}")

    # Trạng thái các thiết bị điều khiển được
    for dev_id, state in device_states.items():
        status_topic = f"iot/devices/{dev_id}/status"
        payload = {
            "device_id": dev_id,
            "type": state["type"],
            "state": state["state"],
            "setpoint": state.get("setpoint"),
            "brightness": state.get("brightness"),
            "timestamp": time.time(),
        }
        # Publish status với QoS=1
        result = client.publish(status_topic, json.dumps(payload), qos=1)
        result.wait_for_publish(timeout=2)  # Timeout để không block vô hạn
        print(f"📤 Status to {status_topic}: {payload}")


def main():
    # Sử dụng CallbackAPIVersion.VERSION2 để tương thích với MQTT broker
    client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2, protocol=mqtt.MQTTv311)
    client.on_connect = on_connect
    client.on_message = on_message

    # Set credentials if provided
    if MQTT_USERNAME and MQTT_PASSWORD:
        print(f"🔐 Using MQTT authentication (username: {MQTT_USERNAME})")
        client.username_pw_set(MQTT_USERNAME, MQTT_PASSWORD)

    # Retry connection with backoff
    max_retries = 10
    retry_delay = 5
    for attempt in range(max_retries):
        try:
            print(f"🔌 Connecting to MQTT broker: {MQTT_BROKER}:{MQTT_PORT} (attempt {attempt+1}/{max_retries})")
            client.connect(MQTT_BROKER, MQTT_PORT, 60)
            client.loop_start()
            print("✅ Simulator started, waiting for commands...")
            break
        except Exception as e:
            print(f"⚠️ Connection failed: {e}")
            if attempt < max_retries - 1:
                print(f"⏳ Retrying in {retry_delay} seconds...")
                time.sleep(retry_delay)
            else:
                print("❌ Max retries reached, exiting.")
                return

    try:
        while True:
            publish_sensor_and_states(client)
            time.sleep(5)
    except KeyboardInterrupt:
        print("Stopping simulator...")
    finally:
        client.loop_stop()
        client.disconnect()


if __name__ == "__main__":
    main()
