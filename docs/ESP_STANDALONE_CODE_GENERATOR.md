# ESP Standalone Code Generator

## Tính năng: Kết hợp IoT Platform với ESP Standalone Controller

### Mục tiêu
Cho phép người dùng thiết kế giao diện điều khiển trên web platform, sau đó xuất thành code Arduino/PlatformIO để nạp vào ESP. ESP sẽ hoạt động độc lập, phát WiFi riêng để điện thoại kết nối trực tiếp - **không cần WiFi infrastructure**.

> **Phù hợp cho:** Cuộc thi, demo thuyết trình, ứng dụng di động không phụ thuộc mạng.

---

## Mô tả quy trình

### Bước 1: Thiết kế giao diện trên Web Platform

Người dùng sử dụng Dashboard Builder (có sẵn trong IoT Platform) để kéo thả các widget:

| Widget | Kiểu dữ liệu | Ví dụ |
|--------|--------------|-------|
| Button (Nút bấm) | Boolean | Bật/Tắt đèn |
| Toggle Switch | Boolean | Công tắc On/Off |
| Slider (Thanh trượt) | Integer/Float | Điều chỉnh tốc độ motor (0-255) |
| Joystick | X, Y (Float) | Điều khiển robot di chuyển |
| Color Picker | RGB (3 giá trị) | Điều khiển LED RGB |
| Direction Pad | 4 hướng | Điều khiển xe |

Mỗi widget cần cấu hình:
- **Tên hiển thị** (VD: "Bật đèn phòng khách")
- **Kiểu dữ liệu** (boolean, integer, float)
- **Giá trị min/max** (cho slider/picker)
- **Chân GPIO** gán vào (VD: GPIO13, GPIO15, GPIO4)

### Bước 2: Xuất code Arduino/PlatformIO

Nhấn nút **"Export ESP Code"**, hệ thống sinh ra file `.ino` chứa:

```cpp
// File: esp_standalone_controller.ino
// Tự động sinh từ IoT Platform

#include <WiFi.h>
#include <WebServer.h>
#include <ESPAsyncWebServer.h>

// ==================== CẤU HÌNH GPIO ====================
#define PIN_LED_1    13   // Widget: "Bật đèn" - Button
#define PIN_MOTOR    15   // Widget: "Tốc độ motor" - Slider
#define PIN_RELAY    4    // Widget: "Relay" - Toggle

// ==================== AP MODE ====================
const char* ssid = "ESP_Control_001";
const char* password = "12345678";

// ==================== WEB SERVER ====================
WebServer server(80);

// HTML/CSS UI được nhúng (responsive mobile)
const char INDEX_HTML[] PROGMEM = R"rawliteral(
<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    /* Giao diện mobile responsive */
    body { font-family: Arial; padding: 20px; background: #1a1a2e; }
    .control-btn {
      width: 100px; height: 100px;
      border-radius: 50%;
      font-size: 24px;
      margin: 10px;
    }
    .led-on { background: #00ff00; }
    .led-off { background: #333; }
    /* ... CSS cho các widget khác ... */
  </style>
</head>
<body>
  <h2>ESP Controller</h2>

  <!-- Widget: Button "Bật đèn" -> GPIO13 -->
  <button id="btnLed" class="control-btn led-off"
    onclick="toggleLED()">LED</button>

  <!-- Widget: Slider "Tốc độ motor" -> GPIO15 -->
  <input type="range" min="0" max="255" value="0"
    onchange="setMotor(this.value)">

  <!-- Widget: Toggle "Relay" -> GPIO4 -->
  <label class="switch">
    <input type="checkbox" id="relay"
      onchange="setRelay(this.checked)">
    <span class="slider"></span>
  </label>

  <script>
    // Xử lý gửi lệnh HTTP tới ESP
    function toggleLED() { fetch('/led/toggle'); }
    function setMotor(val) { fetch(`/motor?value=${val}`); }
    function setRelay(on) { fetch(`/relay?state=${on ? 1 : 0}`); }
  </script>
</body>
</html>
)rawliteral";

// ==================== XỬ LÝ GPIO ====================
void setup() {
  Serial.begin(115200);

  // Cấu hình chân GPIO
  pinMode(PIN_LED_1, OUTPUT);
  pinMode(PIN_MOTOR, OUTPUT);
  pinMode(PIN_RELAY, OUTPUT);

  // Khởi tạo AP Mode
  WiFi.softAP(ssid, password);
  Serial.println("AP Started");
  Serial.println(WiFi.softAPIP());

  // Cấu hình Web Server routes
  server.on("/", HTTP_GET, [](){
    server.send_P(200, "text/html", INDEX_HTML);
  });

  server.on("/led/toggle", HTTP_GET, [](){
    digitalWrite(PIN_LED_1, !digitalRead(PIN_LED_1));
    server.send(200, "text/plain", "OK");
  });

  server.on("/motor", HTTP_GET, [](){
    if (server.hasArg("value")) {
      int val = server.arg("value").toInt();
      analogWrite(PIN_MOTOR, val);
    }
    server.send(200, "text/plain", "OK");
  });

  server.on("/relay", HTTP_GET, [](){
    if (server.hasArg("state")) {
      int state = server.arg("state").toInt();
      digitalWrite(PIN_RELAY, state);
    }
    server.send(200, "text/plain", "OK");
  });

  server.begin();
}

void loop() {
  server.handleClient();
}
```

### Bước 3: Nạp code vào ESP

1. Mở file `.ino` trong Arduino IDE / PlatformIO
2. Chọn board ESP32 hoặc ESP8266
3. Nạp code bình thường
4. ESP khởi động thành công

### Bước 4: Kết nối từ điện thoại

1. Điện thoại kết nối WiFi `ESP_Control_001` (password: `12345678`)
2. Mở trình duyệt, truy cập `http://192.168.4.1`
3. Giao diện mobile hiển thị các widget đã thiết kế
4. Nhấn nút/tuỳ chỉnh → lệnh gửi HTTP → ESP điều khiển GPIO

---

## Sơ đồ kiến trúc

```
┌─────────────────────────────────────────────────────────────────┐
│                      IoT PLATFORM (Web)                         │
│                                                                 │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐     │
│  │  Widget 1    │    │  Widget 2    │    │  Widget 3    │     │
│  │  GPIO13      │    │  GPIO15      │    │  GPIO4       │     │
│  │  [Button]    │    │  [Slider]    │    │  [Toggle]    │     │
│  └──────────────┘    └──────────────┘    └──────────────┘     │
│                           │                                     │
│                    [Export ESP Code]                            │
└───────────────────────────┼─────────────────────────────────────┘
                            ▼
              ┌─────────────────────────────┐
              │     File: *.ino             │
              │   ├── AP Mode config       │
              │   ├── Web Server           │
              │   ├── HTML/CSS UI         │
              │   ├── GPIO definitions     │
              │   └── HTTP handlers        │
              └─────────────────────────────┘
                            │
                            ▼
              ┌─────────────────────────────┐
              │  Nạp qua Arduino IDE        │
              │  PlatformIO                 │
              └─────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│                      ESP32 / ESP8266                            │
│                                                                 │
│  📡 WiFi AP: ESP_Control_001                                    │
│     Password: 12345678                                          │
│                                                                 │
│  🌐 Web Server: http://192.168.4.1                              │
│                                                                 │
│  🔌 GPIO13 ──► LED / Relay                                      │
│  🔌 GPIO15 ──► Motor (PWM)                                     │
│  🔌 GPIO4  ──► Relay / Thiết bị                                │
│                                                                 │
└─────────────────────────────┬───────────────────────────────────┘
                              │
                              ▼
              ┌─────────────────────────────┐
              │       📱 Smartphone         │
              │                             │
              │  1. Kết nối WiFi ESP       │
              │  2. Mở trình duyệt         │
              │  3. Giao diện điều khiển   │
              │     ┌─────────────────┐     │
              │     │  🎛️  ⚡  🔘   │     │
              │     │ Button Slider   │     │
              │     │ Toggle         │     │
              │     └─────────────────┘     │
              └─────────────────────────────┘
```

---

## Tính năng kỹ thuật

### ESP Side

| Thành phần | Công nghệ |
|------------|-----------|
| WiFi Mode | ESP32/ESP8266 AP Mode |
| Web Server | AsyncWebServer / ESP8266WebServer |
| UI Storage | PROGMEM (nhúng trong flash) |
| Lưu cấu hình | EEPROM / Preferences |
| PWM | analogWrite() / ledcWrite() |

### Platform Side

| Thành phần | Công nghệ |
|------------|-----------|
| Dashboard Builder | React + Canvas (có sẵn) |
| Code Generator | Backend Python (Jinja2 templates) |
| Widget types | Button, Toggle, Slider, Joystick, Color Picker, D-Pad |
| GPIO mapping | Auto-assign hoặc manual |

---

## Danh sách widget hỗ trợ

| Widget | Kiểu dữ liệu | ESP Command | GPIO Mode |
|--------|--------------|-------------|-----------|
| Button | Boolean | `GET /btn?id=1&val=1` | digitalWrite |
| Toggle Switch | Boolean | `GET /toggle?id=1&state=1` | digitalWrite |
| Push Button | Boolean (momentary) | `GET /push?id=1` | digitalWrite |
| Slider | 0-255 | `GET /slider?id=1&value=128` | analogWrite |
| Slider (Servo) | 0-180 | `GET /servo?id=1&angle=90` | servo.write |
| Joystick | X, Y (-100 to 100) | `GET /joystick?x=50&y=-30` | custom |
| Color Picker | R, G, B | `GET /rgb?r=255&g=128&b=0` | analogWrite x3 |
| D-Pad | UP/DOWN/LEFT/RIGHT | `GET /dpad?dir=UP` | digitalWrite |

---

## Cách sử dụng (Workflow)

### 1. Thiết kế trên Platform
```
Dashboard Builder → Thêm Widget → Đặt tên → Gán GPIO → Lưu Dashboard
```

### 2. Xuất code
```
Dashboard → Export → Chọn "ESP Standalone" → Tải file .ino
```

### 3. Nạp vào ESP
```
Arduino IDE → File .ino → Board: ESP32 Dev Module → Upload
```

### 4. Sử dụng
```
Điện thoại → Kết nối WiFi ESP → Mở trình duyệt → Điều khiển!
```

---

## Lợi ích

| Tiêu chí | ESP Standalone | WiFi Infrastructure |
|----------|---------------|---------------------|
| Phụ thuộc mạng | Không | Cần router WiFi |
| Di động | ✅ Cao | ❌ Hạn chế |
| Demo cuộc thi | ✅ Tốt | ⚠️ Cần chuẩn bị |
| Số lượng thiết bị | Nhiều ESP độc lập | 1 server cho nhiều ESP |
| Độ trễ | Thấp (HTTP local) | Phụ thuộc mạng |
| Bảo mật | AP với password | Mã hoá tuỳ chọn |

---

## Cấu hình mặc định

| Thông số | Giá trị |
|----------|---------|
| SSID | `ESP_Control_XXX` (XXX = mã dashboard) |
| Password WiFi | `12345678` |
| Web Port | 80 |
| Default GPIO | 13, 15, 4 (có thể tuỳ chỉnh) |
| Baudrate | 115200 |

---

## Roadmap phát triển

- [ ] Tích hợp vào Dashboard Builder hiện tại
- [ ] Thêm widget: Servo Control, Stepper Motor
- [ ] Hỗ trợ PlatformIO project export
- [ ] Upload file .bin trực tiếp (không cần Arduino IDE)
- [ ] Web-based ESP Flasher (ESP Web Tools)
- [ ] Giao diện cấu hình WiFi qua captive portal
- [ ] OTA Update từ platform

---
