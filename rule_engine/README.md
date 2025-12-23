# 🔧 Rule Engine - Tự động điều khiển thiết bị

## 📋 Mô tả

Rule Engine tự động đọc dữ liệu cảm biến từ MQTT, đánh giá các điều kiện (rules) và gửi lệnh điều khiển thiết bị khi điều kiện được thỏa mãn.

## 🔄 Luồng hoạt động

```
Sensor → MQTT (iot/devices/+/data) 
    ↓
Rule Engine (subscribe MQTT)
    ↓
Evaluate Rules (check conditions)
    ↓
If condition passed → Send command
    ↓
MQTT (iot/devices/{device_id}/control) → Device Simulator
```

## 📝 Cấu hình Rules

File `rules.json` chứa danh sách các rules:

```json
{
  "condition": {
    "field": "temperature",    // Field trong sensor data
    "operator": ">=",          // >, <, ==, >=, <=
    "value": 25                // Giá trị ngưỡng
  },
  "action": {
    "device_id": "ac-bdu-001", // ID thiết bị cần điều khiển
    "command": "SET_TEMP:28"   // Lệnh gửi đi
  },
  "description": "Mô tả rule"
}
```

## 🎯 Ví dụ Rules hiện tại

### 1. Tự động tăng AC khi nhiệt độ >= 25°C
```json
{
  "condition": {
    "field": "temperature",
    "operator": ">=",
    "value": 25
  },
  "action": {
    "device_id": "ac-bdu-001",
    "command": "SET_TEMP:28"
  }
}
```

### 2. Tự động tăng AC khi nhiệt độ >= 26°C
```json
{
  "condition": {
    "field": "temperature",
    "operator": ">=",
    "value": 26
  },
  "action": {
    "device_id": "ac-bdu-001",
    "command": "SET_TEMP:29"
  }
}
```

## 🚀 Cách sử dụng

### Chạy trong Docker (tự động)
Rule engine tự động chạy khi build Docker Compose:
```bash
docker-compose up -d rule-engine
```

### Chạy thủ công
```bash
cd rule_engine
pip install -r requirements.txt
python rule_engine.py
```

## 📡 MQTT Topics

### Subscribe (nhận dữ liệu)
- `iot/devices/+/data` - Dữ liệu cảm biến (temperature, humidity)

### Publish (gửi lệnh)
- `iot/devices/{device_id}/control` - Lệnh điều khiển thiết bị

## 🔧 Cấu hình

Trong `rule_engine.py`:
- `USE_MQTT_FOR_COMMANDS = True` - Gửi lệnh trực tiếp qua MQTT (khuyến nghị)
- `USE_MQTT_FOR_COMMANDS = False` - Gửi lệnh qua Device Control API (HTTP)

## 📊 Logs

Rule engine sẽ log:
- ✅ Khi nhận được sensor data
- ✅ Khi rule được kích hoạt và lệnh được gửi
- ❌ Khi có lỗi xảy ra

## 🧪 Test

1. **Kiểm tra logs:**
   ```bash
   docker-compose logs -f rule-engine
   ```

2. **Xem sensor data:**
   ```bash
   docker exec -it mqtt mosquitto_sub -h localhost -t "iot/devices/+/data" -v
   ```

3. **Xem commands được gửi:**
   ```bash
   docker exec -it mqtt mosquitto_sub -h localhost -t "iot/devices/+/control" -v
   ```

## 📝 Thêm Rule mới

1. Mở file `rules.json`
2. Thêm rule mới vào mảng:
   ```json
   {
     "condition": {
       "field": "temperature",
       "operator": ">",
       "value": 30
     },
     "action": {
       "device_id": "ac-bdu-001",
       "command": "ON"
     },
     "description": "Bật AC khi nhiệt độ > 30°C"
   }
   ```
3. Restart rule engine:
   ```bash
   docker-compose restart rule-engine
   ```

## ⚠️ Lưu ý

- Rule engine đánh giá **tất cả rules** mỗi khi nhận sensor data
- Nếu nhiều rules cùng thỏa mãn, tất cả actions sẽ được thực thi
- Commands được gửi ngay lập tức khi điều kiện thỏa mãn
- Để tránh spam, có thể thêm logic debounce/throttle trong tương lai









