# 📡 Format Messages - Device Simulator

## 📋 Tổng quan

Simulator hiện tại publish **4 loại messages** lên MQTT broker:
1. **Sensor Data** (nhiệt độ/độ ẩm) - mỗi 5 giây
2. **AC1 Status** (trạng thái điều hòa 1) - mỗi 5 giây
3. **AC2 Status** (trạng thái điều hòa 2) - mỗi 5 giây
4. **Light Status** (trạng thái đèn) - mỗi 5 giây

---

## 🔍 Chi tiết từng loại Message

### 1. Sensor Data (Cảm biến nhiệt độ/độ ẩm)

**Topic:**
```
iot/devices/sensor-bdu-001/data
```

**Payload Format (JSON):**
```json
{
  "device_id": "sensor-bdu-001",
  "temperature": 26.45,
  "humidity": 62.30,
  "timestamp": 1721989259.123
}
```

**Ví dụ thực tế:**
```json
{
  "device_id": "sensor-bdu-001",
  "temperature": 28.45,
  "humidity": 55.20,
  "timestamp": 1721989259.456
}
```

**Giải thích:**
- `device_id`: ID cố định của sensor (`sensor-bdu-001`)
- `temperature`: Nhiệt độ (°C), random từ 25.0 đến 35.0
- `humidity`: Độ ẩm (%), random từ 50.0 đến 70.0
- `timestamp`: Unix timestamp (seconds since epoch)

---

### 2. AC1 Status (Điều hòa 1)

**Topic:**
```
iot/devices/ac-bdu-001/status
```

**Payload Format (JSON):**
```json
{
  "device_id": "ac-bdu-001",
  "type": "air_conditioner",
  "state": "ON",
  "setpoint": 24.0,
  "brightness": null,
  "timestamp": 1721989259.789
}
```

**Ví dụ thực tế:**

**Khi AC đang BẬT:**
```json
{
  "device_id": "ac-bdu-001",
  "type": "air_conditioner",
  "state": "ON",
  "setpoint": 26.0,
  "brightness": null,
  "timestamp": 1721989259.789
}
```

**Khi AC đang TẮT:**
```json
{
  "device_id": "ac-bdu-001",
  "type": "air_conditioner",
  "state": "OFF",
  "setpoint": 24.0,
  "brightness": null,
  "timestamp": 1721989264.123
}
```

**Giải thích:**
- `device_id`: ID cố định (`ac-bdu-001`)
- `type`: Loại thiết bị (`air_conditioner`)
- `state`: Trạng thái (`ON` hoặc `OFF`)
- `setpoint`: Nhiệt độ cài đặt (°C), mặc định 24.0
- `brightness`: `null` (không áp dụng cho AC)
- `timestamp`: Unix timestamp

---

### 3. AC2 Status (Điều hòa 2)

**Topic:**
```
iot/devices/ac-bdu-002/status
```

**Payload Format:** Giống hệt AC1, chỉ khác `device_id`:
```json
{
  "device_id": "ac-bdu-002",
  "type": "air_conditioner",
  "state": "OFF",
  "setpoint": 24.0,
  "brightness": null,
  "timestamp": 1721989259.456
}
```

---

### 4. Light Status (Đèn)

**Topic:**
```
iot/devices/light-bdu-001/status
```

**Payload Format (JSON):**
```json
{
  "device_id": "light-bdu-001",
  "type": "light",
  "state": "ON",
  "setpoint": null,
  "brightness": 80,
  "timestamp": 1721989259.123
}
```

**Ví dụ thực tế:**

**Khi đèn đang BẬT (độ sáng 80%):**
```json
{
  "device_id": "light-bdu-001",
  "type": "light",
  "state": "ON",
  "setpoint": null,
  "brightness": 80,
  "timestamp": 1721989259.789
}
```

**Khi đèn đang TẮT:**
```json
{
  "device_id": "light-bdu-001",
  "type": "light",
  "state": "OFF",
  "setpoint": null,
  "brightness": 0,
  "timestamp": 1721989264.456
}
```

**Giải thích:**
- `device_id`: ID cố định (`light-bdu-001`)
- `type`: Loại thiết bị (`light`)
- `state`: Trạng thái (`ON` hoặc `OFF`)
- `setpoint`: `null` (không áp dụng cho đèn)
- `brightness`: Độ sáng (0-100), 0 = tắt, 100 = sáng nhất
- `timestamp`: Unix timestamp

---

## 📥 Commands mà Simulator nhận được

Simulator **subscribe** các topic điều khiển và nhận commands:

### AC Commands

**Topic:**
```
iot/devices/ac-bdu-001/control
iot/devices/ac-bdu-002/control
```

**Commands hỗ trợ:**

1. **Bật/Tắt:**
   ```
   ON
   OFF
   ```

2. **Cài đặt nhiệt độ:**
   ```
   SET_TEMP:26
   SET_TEMP:24.5
   ```
   - Khi nhận lệnh này, AC tự động chuyển sang `ON`
   - Giá trị có thể là số nguyên hoặc số thập phân

**Ví dụ:**
```
Topic: iot/devices/ac-bdu-001/control
Payload: "SET_TEMP:26"
→ Kết quả: AC1 chuyển sang ON, setpoint = 26°C
```

---

### Light Commands

**Topic:**
```
iot/devices/light-bdu-001/control
```

**Commands hỗ trợ:**

1. **Bật/Tắt:**
   ```
   ON
   OFF
   ```
   - `ON`: Nếu brightness = 0 → tự động set = 100
   - `OFF`: Set brightness = 0

2. **Điều chỉnh độ sáng:**
   ```
   BRIGHTNESS:80
   BRIGHTNESS:50
   BRIGHTNESS:0
   ```
   - Giá trị từ 0-100
   - Nếu brightness > 0 → state = `ON`
   - Nếu brightness = 0 → state = `OFF`

**Ví dụ:**
```
Topic: iot/devices/light-bdu-001/control
Payload: "BRIGHTNESS:75"
→ Kết quả: Đèn bật, brightness = 75%
```

---

## 🔄 Luồng dữ liệu

### Publish (Simulator → MQTT)

```
Mỗi 5 giây, simulator publish:
├── iot/devices/sensor-bdu-001/data      (sensor data)
├── iot/devices/ac-bdu-001/status        (AC1 status)
├── iot/devices/ac-bdu-002/status        (AC2 status)
└── iot/devices/light-bdu-001/status     (Light status)
```

### Subscribe (MQTT → Simulator)

```
Simulator subscribe và lắng nghe:
├── iot/devices/ac-bdu-001/control        (AC1 commands)
├── iot/devices/ac-bdu-002/control        (AC2 commands)
└── iot/devices/light-bdu-001/control     (Light commands)
```

---

## 📊 Ví dụ Messages thực tế (sau 5 giây)

**Tại thời điểm T=0:**
```json
// Topic: iot/devices/sensor-bdu-001/data
{"device_id":"sensor-bdu-001","temperature":24.78,"humidity":55.20,"timestamp":1721989259.456}

// Topic: iot/devices/ac-bdu-001/status
{"device_id":"ac-bdu-001","type":"air_conditioner","state":"OFF","setpoint":24.0,"brightness":null,"timestamp":1721989259.789}

// Topic: iot/devices/ac-bdu-002/status
{"device_id":"ac-bdu-002","type":"air_conditioner","state":"OFF","setpoint":24.0,"brightness":null,"timestamp":1721989260.123}

// Topic: iot/devices/light-bdu-001/status
{"device_id":"light-bdu-001","type":"light","state":"OFF","setpoint":null,"brightness":0,"timestamp":1721989260.456}
```

**Tại thời điểm T=5 (sau khi nhận lệnh):**
```json
// Topic: iot/devices/ac-bdu-001/status (sau khi nhận "SET_TEMP:26")
{"device_id":"ac-bdu-001","type":"air_conditioner","state":"ON","setpoint":26.0,"brightness":null,"timestamp":1721989265.789}

// Topic: iot/devices/light-bdu-001/status (sau khi nhận "BRIGHTNESS:80")
{"device_id":"light-bdu-001","type":"light","state":"ON","setpoint":null,"brightness":80,"timestamp":1721989266.123}
```

---

## 🧪 Test Messages

### Test bằng MQTT Client

**Subscribe để xem messages:**
```bash
# Subscribe tất cả sensor data
mosquitto_sub -h localhost -t "iot/devices/+/data" -v

# Subscribe tất cả status
mosquitto_sub -h localhost -t "iot/devices/+/status" -v

# Subscribe một device cụ thể
mosquitto_sub -h localhost -t "iot/devices/ac-bdu-001/status" -v
```

**Publish command để điều khiển:**
```bash
# Bật AC1
mosquitto_pub -h localhost -t "iot/devices/ac-bdu-001/control" -m "ON"

# Cài đặt nhiệt độ AC1 = 26°C
mosquitto_pub -h localhost -t "iot/devices/ac-bdu-001/control" -m "SET_TEMP:26"

# Bật đèn với độ sáng 75%
mosquitto_pub -h localhost -t "iot/devices/light-bdu-001/control" -m "BRIGHTNESS:75"
```

---

## 📝 Lưu ý

1. **Tất cả payload đều là JSON string** (dùng `json.dumps()`)
2. **Timestamp là Unix timestamp** (số giây kể từ 1970-01-01)
3. **Messages được publish mỗi 5 giây** (có thể thay đổi trong code)
4. **Commands không phân biệt hoa/thường** (được convert sang uppercase)
5. **Simulator tự động cập nhật state** sau khi nhận command và publish lại trong lần tiếp theo

---

## 🔗 Liên kết

- Code simulator: `simulators/device_simulator.py`
- MQTT broker: `mqtt_server/mosquitto.conf`
- Device Control API: `device_control/device_control_api.py`

