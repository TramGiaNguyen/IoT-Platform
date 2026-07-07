# 02. Thiết bị & ESP32 — Trung tâm

> Đây là tài liệu **trọng tâm** của nền tảng. Đọc xong file này bạn sẽ biết:
> - Các khái niệm cơ bản (Lớp / Nhóm / Phòng / Thiết bị).
> - Cách khai báo thiết bị mới trên IoT_Platform.
> - Cách nạp firmware ESP32 để thiết bị gửi dữ liệu lên dashboard.
> - Cách điều khiển thiết bị `controller` từ dashboard xuống ESP32.

---

## 1. Khái niệm cơ bản

Nền tảng tổ chức theo 4 cấp: **Lớp học → Nhóm → Phòng cá nhân → Thiết bị**.

| Cấp | Bảng | Mô tả |
|-----|------|-------|
| **Lớp học** | `lop_hoc` | Cohort sinh viên do 1 giáo viên phụ trách. Ví dụ: `Lớp IoT K18`. Chứa nhiều nhóm. |
| **Nhóm** | `nhom` | Tập con sinh viên trong lớp. Mỗi nhóm thuộc đúng 1 lớp. Ví dụ: `NHOM_1_1`. |
| **Phòng cá nhân** | `phong` | Phòng riêng của một user để gom thiết bị cá nhân. |
| **Thiết bị** | `thiet_bi` | Cảm biến, relay, gateway, camera… đã đăng ký với platform. |

### Quy tắc quan hệ

```
┌────────────────────────────────────────┐
│ Lớp học (lop_hoc)                     │
│  ├── Nhóm (nhom)                       │
│  │     ├── Thành viên (nhom_thanh_vien) │
│  │     └── Thiết bị (nhom_id)          │ ← thiết bị nhóm
│  └── Phòng cá nhân (phong)             │
│        └── Thiết bị (phong_id)         │ ← thiết bị cá nhân
└────────────────────────────────────────┘
```

- Mỗi thiết bị thuộc **tối đa 1 nhóm** và **tối đa 1 phòng**.
- Có `nhom_id` → workspace "Nhóm"; chỉ có `phong_id` → workspace "Cá nhân".

### Vai trò (Role)

| Vai trò | Quyền chính |
|---------|-------------|
| **admin** | Toàn quyền: CRUD user, lớp, nhóm, phòng, thiết bị, dashboard, cấu hình hệ thống. |
| **teacher** | Quản lý lớp & nhóm mình phụ trách. CRUD thiết bị trong phạm vi. |
| **student** | Xem & điều khiển thiết bị trong nhóm mình; thiết bị cá nhân của mình. |

---

## 2. Khai báo thiết bị mới trên IoT_Platform (Registration-First)

> **Nguyên tắc**: Trước khi ESP32 gửi bất kỳ dữ liệu nào, thiết bị **phải được khai báo trên dashboard trước** để hệ thống biết `ma_thiet_bi` hợp lệ và cấp khoá xác thực.

### Các bước trên dashboard

1. Trên sidebar, nhấn **+ Khai Báo Thiết Bị**.
2. Điền các trường:

| Trường | Bắt buộc | Mô tả | Ví dụ |
|--------|----------|-------|-------|
| Mã thiết bị (`ma_thiet_bi`) | ✓ | Mã định danh duy nhất, viết liền, không dấu | `sensor-001`, `esp32-lab1` |
| Tên thiết bị (`ten_thiet_bi`) | ✓ | Tên hiển thị | `Cảm biến nhiệt Lab1` |
| Loại thiết bị (`loai_thiet_bi`) |   | Phân loại tự do | `sensor`, `relay`, `dht22` |
| Loại nghiệp vụ (`device_type`) | ✓ | `sensor` / `controller` / `gateway` | `sensor` |
| Giao thức (`protocol`) | ✓ | `mqtt` / `http` / `both` | `both` |
| Phòng |   | Chọn phòng cá nhân đã có | `Phòng cá nhân A` |
| Nhóm |   | Chọn nhóm (để trống = cá nhân) | `NHOM_1_1` |
| Chủ sở hữu |   | Mặc định = bạn | `nguyen.a@school.vn` |

3. Nhấn **Lưu**.

### Hệ thống cấp 2 thông tin bí mật (chỉ hiển thị 1 lần)

- `http_api_key` — API key dùng cho HTTP ingest (header `X-API-Key`).
- `secret_key` — mật khẩu MQTT đăng nhập (username = `ma_thiet_bi`).

> **CẢNH BÁO**: Hãy sao chép ngay và lưu vào file `secrets.h` của ESP32 (xem mục 5). Nếu mất, dùng API `POST /devices/{id}/regenerate-key` hoặc xoá rồi khai báo lại.

### Các trường quan trọng khác của thiết bị

| Trường | Mô tả |
|--------|-------|
| `device_type` | `sensor` (chỉ đo) / `controller` (nhận lệnh) / `gateway`. |
| `trang_thai` | `online` / `offline` / `error`. Ngưỡng offline mặc định 10 phút. |
| `edge_control_url` | URL webhook để gửi lệnh HTTP xuống thiết bị (tuỳ chọn). |
| `edge_control_body_template` | Template JSON cho HTTP relay. |

### Đường điều khiển (Control Lines)

Với `device_type = controller`, mỗi đường relay khai báo riêng:

| Trường | Mô tả |
|--------|-------|
| `relay_number` | 1 → 16 |
| `ten_duong` | Tên hiển thị (vd: `Đèn trần`, `Quạt`) |
| `control_type` | `toggle` / `three_way` / `momentary` / `on_off` / `range` |

---

## 3. Cấu hình ESP32 — Phần cứng & Firmware

> **Yêu cầu trước**: Bạn đã khai báo thiết bị (mục 2) và có: `ma_thiet_bi`, `http_api_key`, `mqtt_password` (= `secret_key`), `mqtt_username` (= `ma_thiet_bi`).

### 3.1 Hai giao thức

| Giao thức | Khi nào dùng | Ưu điểm | Nhược điểm |
|-----------|--------------|----------|------------|
| **MQTT** | Wi-Fi ổn định, realtime | Hai chiều, push nhanh | Cần duy trì kết nối liên tục |
| **HTTP POST** | Qua NAT / proxy, gửi theo chu kỳ | Đơn giản, qua firewall dễ | Một chiều (nhận lệnh qua `edge_control_url`) |

**Khuyến nghị**: dùng **MQTT**. Dùng HTTP khi ESP32 không hỗ trợ MQTT.

### 3.2 Linh kiện tối thiểu

- 1 × ESP32 DevKit (WROOM / S3 / C3 …).
- Cảm biến tuỳ chọn: DHT22 (nhiệt + ẩm), DS18B20, relay 5V.
- Breadboard, dây dupont, nguồn USB hoặc adapter 5V.

### 3.3 Sơ đồ kết nối (DHT22 + Relay)

```
   DHT22              ESP32
   ------             -----
   VCC  ──────────────► 3.3V (hoặc 5V tuỳ module)
   DATA ──[10kΩ]─────► GPIO 4  (DATA kéo lên bằng điện trở 10kΩ lên VCC)
   GND  ──────────────► GND

   Relay IN ─────────► GPIO 5
   Relay VCC ────────► 5V (cấp riêng nếu cần)
   Relay GND ────────► GND
```

### 3.4 Cài Arduino IDE / PlatformIO

**Arduino IDE**:
1. Tải Arduino IDE 2.x từ arduino.cc.
2. File → Preferences → Additional boards manager URLs → thêm:
   ```
   https://raw.githubusercontent.com/espressif/arduino-esp32/gh-pages/package_esp32_index.json
   ```
3. Tools → Board → Boards Manager → tìm `esp32` → cài phiên bản ≥ 2.0.0.
4. Cài thư viện:
   - **PubSubClient** (Nick O'Leary) — MQTT.
   - **ArduinoJson** (Benoît Blanchon) — version **6.x**.
   - **DHT sensor library** (Adafruit) + **Adafruit Unified Sensor**.
5. Cắm ESP32 vào USB, chọn đúng cổng COM.

**PlatformIO** (`platformio.ini`):

```ini
[env:esp32dev]
platform = espressif32
board = esp32dev
framework = arduino
lib_deps =
    knolleary/PubSubClient@^2.3
    bblanchon/ArduinoJson@^6.21
    adafruit/DHT sensor library@^1.4
    adafruit/Adafruit Unified Sensor@^1.1
monitor_speed = 115200
```

### 3.5 Thông số cấu hình bắt buộc (lưu vào `secrets.h`)

| Thông số | Nguồn | Ví dụ |
|----------|-------|-------|
| `MA_THIET_BI` | Bạn tự đặt | `esp32-lab1` |
| `MQTT_BROKER` | Admin cung cấp | `192.168.1.100` |
| `MQTT_PORT` | Mặc định `1883` (TCP) | `1883` |
| `MQTT_USER` | = `MA_THIET_BI` | `esp32-lab1` |
| `MQTT_PASS` | = `secret_key` từ dashboard | `a1b2c3d4-...` |
| `HTTP_API_KEY` | = `http_api_key` | `3f9e8a7b-...` |
| `BACKEND_HOST` | URL FastAPI | `http://192.168.1.100:8000` |

### 3.6 MQTT Topics (4 topic, không thay đổi)

| Hướng | Topic | Loại |
|-------|-------|------|
| ESP32 → Server | `iot/devices/<ma_thiet_bi>/data` | Publish — Telemetry |
| ESP32 → Server | `iot/devices/<ma_thiet_bi>/status` | Publish — Trạng thái / heartbeat |
| ESP32 → Server | `iot/devices/<ma_thiet_bi>/lwt` | Publish (LWT) — Last Will |
| Server → ESP32 | `iot/devices/<ma_thiet_bi>/control` | Subscribe — Lệnh điều khiển |

**Payload**:
- `/data`: JSON tự do, vd `{"temperature": 25.5, "humidity": 60}`. Platform không ép schema.
- `/status`: `{"status":"online","fw_version":"1.0.0","ip":"..."}`.
- `/lwt`: `offline` (tự publish khi mất kết nối).
- `/control`: xem mục 4 bên dưới.

---

## 4. Điều khiển thiết bị từ Dashboard

### 4.1 Cách gửi lệnh

| Từ dashboard | Hành động |
|--------------|-----------|
| Danh sách thiết bị (workspace Cá nhân / Nhóm) | Nút on/off nhanh (chỉ controller). |
| Chi tiết thiết bị → tab **Điều khiển** | Bật/tắt, đặt setpoint, đổi chế độ. |
| Đường relay | Mỗi relay một nút riêng (toggle / three_way / range…). |

### 4.2 Danh sách lệnh chuẩn (publish xuống topic `/control`)

| Lệnh | Payload JSON |
|------|--------------|
| `on` | `{"state":"ON"}` |
| `off` | `{"state":"OFF"}` |
| `brightness` | `{"state":"ON","brightness": <0-100>}` |
| `set_temp` | `{"state":"ON","setpoint": <nhiệt độ>}` |
| `mode_cool` / `mode_heat` / `mode_fan` / `mode_auto` | `{"state":"ON","mode":"cool"\|"heat"\|"fan_only"\|"auto"}` |
| `fan_speed` | `{"state":"ON","fan_speed":"low\|medium\|high\|auto"}` |
| `toggle` | `{"command":"toggle"}` |
| `open` / `close` | `{"command":"open"}` / `{"command":"close"}` |
| `lock` / `unlock` | `{"command":"lock"}` / `{"command":"unlock"}` |
| `reset` | `{"command":"reset"}` |
| `ota_update` | `{"command":"ota_update","url":"<firmware link>"}` |

ESP32 subscribe topic `control` với QoS 1 và xử lý JSON trong callback `onControl`.

### 4.3 Điều khiển qua HTTP webhook (`edge_control_url`)

Nếu controller **không subscribe MQTT**, cấu hình trên dashboard:

- `edge_control_url`: vd `http://192.168.190.171/api/v1/control`.
- `edge_control_body_template`:
  ```json
  {"relay": {{relay}}, "state": "{{state}}", "cmd": "{{cmd}}"}
  ```

Khi user bấm nút → platform POST HTTP xuống URL (header `X-API-Key` = `http_api_key`).

### 4.4 Xử lý lệnh phía ESP32 (code minh hoạ)

```cpp
void onControl(char* topic, byte* payload, unsigned int length) {
  StaticJsonDocument<256> doc;
  if (deserializeJson(doc, payload, length)) return;

  if (doc["state"].as<String>() == "ON") {
    digitalWrite(RELAY_PIN, HIGH);
  } else if (doc["state"].as<String>() == "OFF") {
    digitalWrite(RELAY_PIN, LOW);
  }
  if (doc["command"].as<String>() == "toggle") {
    digitalWrite(RELAY_PIN, !digitalRead(RELAY_PIN));
  }
  if (doc.containsKey("brightness")) {
    int pwm = map(doc["brightness"].as<int>(), 0, 100, 0, 255);
    ledcWrite(0, pwm);
  }
  if (doc["command"].as<String>() == "reset") {
    ESP.restart();
  }
}
```

### 4.5 Trạng thái lệnh

Mọi lệnh lưu ở bảng `commands`:

| Status | Ý nghĩa |
|--------|---------|
| `pending` | Ghi DB, chờ xử lý |
| `sent` | Đã publish MQTT / POST HTTP |
| `acked` | ESP32 xác nhận (PUBACK) |
| `failed` | Timeout / offline / lỗi HTTP |

---

## 5. Code mẫu — `secrets.h` + `main.cpp` (MQTT, DHT22 + Relay)

### `secrets.h` (KHÔNG commit lên git)

```cpp
#pragma once
// === Wi-Fi ===
#define WIFI_SSID     "TenWiFi_Cua_Ban"
#define WIFI_PASSWORD "MatKhauWiFi"
// === MQTT broker ===
#define MQTT_BROKER   "192.168.1.100"
#define MQTT_PORT     1883
// === Thiết bị (lấy từ dashboard) ===
#define MA_THIET_BI   "esp32-lab1"
#define MQTT_USER     "esp32-lab1"
#define MQTT_PASS     "a1b2c3d4-e5f6-7890-abcd-ef0123456789"
// === HTTP fallback ===
#define BACKEND_HOST  "http://192.168.1.100:8000"
#define API_KEY       "3f9e8a7b-d4c1-..."
```

### `main.cpp`

```cpp
#include <WiFi.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>
#include <DHT.h>
#include "secrets.h"

#define DHT_PIN   4
#define DHT_TYPE  DHT22
#define RELAY_PIN 5

DHT dht(DHT_PIN, DHT_TYPE);
WiFiClient espClient;
PubSubClient mqtt(espClient);

const char* TOPIC_DATA    = "iot/devices/" MA_THIET_BI "/data";
const char* TOPIC_STATUS  = "iot/devices/" MA_THIET_BI "/status";
const char* TOPIC_CONTROL = "iot/devices/" MA_THIET_BI "/control";
const char* TOPIC_LWT     = "iot/devices/" MA_THIET_BI "/lwt";

void setupWifi() {
  Serial.print("Wi-Fi connecting");
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  while (WiFi.status() != WL_CONNECTED) { delay(500); Serial.print("."); }
  Serial.println();
  Serial.print("IP: "); Serial.println(WiFi.localIP());
}

void onControl(char* topic, byte* payload, unsigned int length) {
  StaticJsonDocument<256> doc;
  if (deserializeJson(doc, payload, length)) return;
  if (doc["state"].as<String>() == "ON")      digitalWrite(RELAY_PIN, HIGH);
  else if (doc["state"].as<String>() == "OFF") digitalWrite(RELAY_PIN, LOW);
  else if (doc["command"].as<String>() == "toggle") digitalWrite(RELAY_PIN, !digitalRead(RELAY_PIN));
}

void setupMqtt() {
  mqtt.setServer(MQTT_BROKER, MQTT_PORT);
  mqtt.setBufferSize(1024);
  mqtt.setKeepAlive(30);
  mqtt.setCallback(onControl);
}

bool mqttReconnect() {
  if (mqtt.connected()) return true;
  Serial.print("MQTT connecting...");
  bool ok = mqtt.connect(MQTT_USER, MQTT_USER, MQTT_PASS,
                         TOPIC_LWT, 1, true, "offline");
  if (!ok) { Serial.print("fail rc="); Serial.println(mqtt.state()); delay(2000); return false; }
  Serial.println("ok");
  mqtt.publish(TOPIC_STATUS, "{\"status\":\"online\"}", true);
  mqtt.subscribe(TOPIC_CONTROL, 1);
  return true;
}

unsigned long lastSend = 0;
void publishTelemetry() {
  float t = dht.readTemperature();
  float h = dht.readHumidity();
  if (isnan(t) || isnan(h)) return;
  StaticJsonDocument<256> doc;
  doc["temperature"] = t; doc["humidity"] = h;
  char buf[256]; size_t n = serializeJson(doc, buf);
  mqtt.publish(TOPIC_DATA, buf, n);
}

void setup() {
  Serial.begin(115200);
  pinMode(RELAY_PIN, OUTPUT); digitalWrite(RELAY_PIN, LOW);
  dht.begin();
  setupWifi(); setupMqtt();
}

void loop() {
  if (!mqtt.connected()) mqttReconnect();
  mqtt.loop();
  if (millis() - lastSend > 15000) { publishTelemetry(); lastSend = millis(); }
}
```

### Nạp & kiểm tra

1. Upload `secrets.h` + `main.cpp` qua Arduino IDE.
2. Mở **Serial Monitor** (Ctrl+Shift+M), baud `115200`.
3. Phải thấy:
   ```
   Wi-Fi connecting........
   IP: 192.168.1.50
   MQTT connecting...ok
   ```
4. Quay lại dashboard, F5: thiết bị chuyển `offline` → **`online`** trong 5–10 giây.

---

## 6. Code mẫu — HTTP POST (fallback)

Nếu ESP32 không dùng được MQTT, gửi qua HTTP:

- **Endpoint**: `POST {BACKEND_HOST}/api/v1/ingest`
- **Headers**: `X-API-Key: <http_api_key>`, `Content-Type: application/json`
- **Body**:
  ```json
  {
    "device_id": "esp32-lab1",
    "data": {"temperature": 25.5, "humidity": 60},
    "timestamp": 1710000000
  }
  ```

```cpp
#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include "secrets.h"

void postData() {
  HTTPClient http;
  http.begin(BACKEND_HOST "/api/v1/ingest");
  http.addHeader("X-API-Key", API_KEY);
  http.addHeader("Content-Type", "application/json");
  StaticJsonDocument<256> doc;
  doc["device_id"] = MA_THIET_BI;
  doc["data"]["temperature"] = 25.5;
  doc["data"]["humidity"] = 60;
  String body; serializeJson(doc, body);
  int code = http.POST(body);
  Serial.printf("POST → %d\n", code);
  http.end();
}
```

> HTTP ingest **một chiều**. Để nhận lệnh controller:
> 1. Vừa HTTP ingest vừa MQTT subscribe control, hoặc
> 2. Cấu hình `edge_control_url` trên dashboard → backend POST HTTP xuống ESP32 thay vì publish MQTT.

---

## 7. Kiểm tra nhanh sau khi nạp

Sau khi nạp firmware, vào dashboard (workspace Cá nhân / Nhóm):

| Kiểm tra | Kết quả mong đợi |
|----------|------------------|
| Trạng thái | `online` ✓ |
| Last seen | Mới trong vài phút |
| Tab Dữ liệu | Biểu đồ cập nhật mỗi 15 giây |
| Tab Điều khiển (controller) | Bấm Bật → Serial Monitor in `Relay ON` |

Nếu vẫn `offline`, xem [03. Nâng cao & Xử lý sự cố](./03-advanced.md).

---

## 8. Quick FAQ

**Q: `ma_thiet_bi` đổi được sau khi khai báo không?**
A: Không. Đây là khoá chính. Muốn đổi, xoá rồi khai báo mới.

**Q: Tại sao thiết bị `offline` dù ESP32 đang chạy?**
A: ESP32 không publish dữ liệu đều (> 10 phút). Xem [03. Nâng cao](./03-advanced.md).

**Q: Mất `http_api_key` / `secret_key` thì sao?**
A: Dùng API `POST /devices/{id}/regenerate-key`, hoặc xoá rồi khai báo lại.

**Q: Một thiết bị thuộc nhiều nhóm?**
A: Không. `nhom_id` chỉ 1 giá trị.

**Q: Xoá nhóm thì thiết bị trong nhóm có bị xoá?**
A: Không — chỉ gỡ liên kết (`nhom_id = NULL`), trở về cá nhân của chủ sở hữu.

---

Tiếp theo: [03. Nâng cao & Xử lý sự cố](./03-advanced.md)
