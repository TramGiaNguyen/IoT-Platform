# Tài liệu tích hợp Vườn Thông Minh với IoT Platform

## Thông tin kết nối

| Thông số | Giá trị |
|----------|---------|
| **Protocol** | MQTT |
| **Host** | `<IP_SERVER>` hoặc `<NGROK_HOST>` |
| **Port** | `1883` hoặc `<NGROK_PORT>` |
| **Device ID** | `garden-001` |

---

## MQTT Topics

| Topic | Hướng | Mô tả |
|-------|-------|-------|
| `garden/garden-001/sensor` | Jetson → Platform | Gửi data cảm biến |
| `garden/garden-001/detection` | Jetson → Platform | Gửi kết quả AI |
| `garden/garden-001/control` | Platform → Jetson | Nhận lệnh điều khiển |

---

## Format dữ liệu JSON

### 1. Sensor Data
```json
{
  "sensor": {
    "timestamp": "2025-12-07 20:30:00",
    "temperature": 28.0,
    "humidity": 65.0,
    "soil_moisture": 45.0,
    "light_level": 800,
    "pump_status": "ESP32_001",
    "light_status": 0,
    "fan_status": 0,
    "device_id": "garden-001"
  }
}
```

### 2. AI Detection Data
```json
{
  "detection": {
    "timestamp": "2025-12-07 20:30:00",
    "plant_count": 5,
    "prediction": "healthy",
    "confidence": 0.95,
    "source": "jetson_nano"
  }
}
```

### 3. Control Commands (nhận từ Platform)
```json
{
  "command": "pump_on",
  "timestamp": 1765114200,
  "source": "platform"
}
```

Các lệnh hợp lệ: `pump_on`, `pump_off`, `light_on`, `light_off`, `fan_on`, `fan_off`

---

## Code mẫu Python

### Cài đặt
```bash
pip install paho-mqtt
```

### garden_client.py
```python
import json
import time
import paho.mqtt.client as mqtt

# === CẤU HÌNH ===
MQTT_BROKER = "<IP_SERVER>"  # Thay bằng IP thực tế
MQTT_PORT = 1883
DEVICE_ID = "garden-001"

# Topics
TOPIC_SENSOR = f"garden/{DEVICE_ID}/sensor"
TOPIC_DETECTION = f"garden/{DEVICE_ID}/detection"
TOPIC_CONTROL = f"garden/{DEVICE_ID}/control"


# === XỬ LÝ LỆNH ĐIỀU KHIỂN ===
def on_message(client, userdata, msg):
    payload = json.loads(msg.payload.decode())
    command = payload.get("command")
    print(f"Nhận lệnh: {command}")
    
    if command == "pump_on":
        # Bật máy bơm (thêm code GPIO)
        pass
    elif command == "pump_off":
        # Tắt máy bơm
        pass
    # ... xử lý các lệnh khác


def on_connect(client, userdata, flags, rc):
    if rc == 0:
        print("Kết nối MQTT thành công!")
        client.subscribe(TOPIC_CONTROL)
    else:
        print(f"Kết nối thất bại, mã lỗi: {rc}")


# === KHỞI TẠO CLIENT ===
client = mqtt.Client(client_id=DEVICE_ID)
client.on_connect = on_connect
client.on_message = on_message
client.connect(MQTT_BROKER, MQTT_PORT)
client.loop_start()


# === GỬI DỮ LIỆU ===
def send_sensor_data(temp, humidity, soil, light, pump, lamp, fan):
    data = {
        "sensor": {
            "timestamp": time.strftime("%Y-%m-%d %H:%M:%S"),
            "temperature": temp,
            "humidity": humidity,
            "soil_moisture": soil,
            "light_level": light,
            "pump_status": pump,
            "light_status": lamp,
            "fan_status": fan,
            "device_id": DEVICE_ID
        }
    }
    client.publish(TOPIC_SENSOR, json.dumps(data))


def send_detection_data(plant_count, prediction, confidence):
    data = {
        "detection": {
            "timestamp": time.strftime("%Y-%m-%d %H:%M:%S"),
            "plant_count": plant_count,
            "prediction": prediction,
            "confidence": confidence,
            "source": "jetson_nano"
        }
    }
    client.publish(TOPIC_DETECTION, json.dumps(data))


# === VÒNG LẶP CHÍNH ===
if __name__ == "__main__":
    while True:
        # Đọc cảm biến và gửi (thay bằng code đọc GPIO thực tế)
        send_sensor_data(28.5, 65.0, 45.0, 800, "ESP32_001", 0, 0)
        
        # Gửi kết quả AI (khi có)
        # send_detection_data(5, "healthy", 0.95)
        
        time.sleep(5)  # Gửi mỗi 5 giây
```

---

## Kiểm tra kết nối

```bash
# Test publish
mosquitto_pub -h <IP_SERVER> -p 1883 -t "garden/garden-001/sensor" -m '{"sensor":{"temperature":28}}'

# Test subscribe
mosquitto_sub -h <IP_SERVER> -p 1883 -t "garden/garden-001/control"
```

---

## Lưu ý

1. **Interval gửi data**: Nên gửi mỗi 5-10 giây
2. **Timestamp**: Sử dụng format `YYYY-MM-DD HH:MM:SS`
3. **Reconnect**: Thêm logic tự kết nối lại nếu mất kết nối
4. **Device ID**: Giữ nguyên `garden-001` để Platform nhận diện
