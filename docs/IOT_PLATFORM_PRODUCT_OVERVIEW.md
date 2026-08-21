# NỀN TẢNG IoT THÔNG MINH
## Giải pháp quản lý thiết bị IoT toàn diện cho trường học thông minh

---

**Phiên bản:** 2.0
**Đơn vị phát triển:** Trường Đại học Bình Dương
**Ngày phát hành:** Tháng 8/2026

---

## Mục lục

1. [Tổng quan](#1-tổng-quan)
2. [Tính năng chính](#2-tính-năng-chính)
3. [Giao diện người dùng](#3-giao-diện-người-dùng)
4. [Phân tích dữ liệu & AI](#4-phân-tích-dữ-liệu--ai)
5. [Tự động hóa](#5-tự-động-hóa)
6. [Ứng dụng di động](#6-ứng-dụng-di-động)
7. [Hệ thống cảnh báo](#7-hệ-thống-cảnh-báo)
8. [Bảo mật & Phân quyền](#8-bảo-mật--phân-quyền)
9. [Kiến trúc hệ thống](#9-kiến-trúc-hệ-thống)
10. [Yêu cầu kỹ thuật](#10-yeu-cầu-kỹ-thuật)
11. [Liên hệ](#11-liên-hệ)

---

## 1. Tổng quan

### Giới thiệu

**Nền tảng IoT Thông minh** là hệ thống quản lý và giám sát thiết bị Internet vạn vật (IoT) được thiết kế riêng cho môi trường giáo dục. Hệ thống hỗ trợ kết nối đa giao thức, thu thập dữ liệu thời gian thực, phân tích bằng trí tuệ nhân tạo và tự động hóa các quy trình vận hành.

### Vấn đề được giải quyết

| Thách thức | Giải pháp của chúng tôi |
|------------|--------------------------|
| Quản lý nhiều thiết bị IoT rời rạc | Tập trung hóa trên một nền tảng duy nhất |
| Khó phát hiện thiết bị hỏng/bất thường | AI tự động phân tích và cảnh báo |
| Thao tác thủ công tốn thời gian | Tự động hóa dựa trên quy tắc và lịch trình |
| Khó kiểm soát truy cập | Phân quyền theo vai trò (Admin/Giáo viên/Sinh viên) |
| Giám sát không thời gian thực | Cập nhật WebSocket tức thì |

---

## 2. Tính năng chính

### 2.1 Kết nối đa giao thức

Hệ thống hỗ trợ đồng thời nhiều giao thức IoT phổ biến, cho phép tích hợp linh hoạt với nhiều loại thiết bị khác nhau:

- **MQTT** - Giao thức chính cho các thiết bị ESP32/ESP8266
- **HTTP/HTTPS** - Kết nối REST API cho thiết bị ngoài
- **CoAP** - Giao thức nhẹ cho thiết bị tiết kiệm năng lượng
- **WebSocket** - Cập nhật thời gian thực lên dashboard
- **RTSP** - Stream video từ camera

### 2.2 Quản lý thiết bị thông minh

- **Tự động phát hiện thiết bị mới** - Thiết bị gửi dữ liệu lần đầu sẽ được tự động đăng ký
- **Nhận diện phần cứng tự động** - Hệ thống tự nhận biết loại cảm biến (DHT11, DHT22, BME280, DS18B20...)
- **Hồ sơ thiết bị** - Lưu trữ thông tin chi tiết về cấu hình và lịch sử hoạt động
- **Giám sát trạng thái online/offline** - Theo dõi thời gian hoạt động của từng thiết bị

### 2.3 Quản lý không gian

- Tổ chức thiết bị theo **Phòng/Ngành/Tầng**
- **Dashboard tổng quan** cho từng không gian
- Theo dõi **occupancy** (số người trong phòng) qua camera AI
- Bản đồ nhiệt phân bố thiết bị

---

## 3. Giao diện người dùng

### 3.1 Dashboard tùy chỉnh

Người dùng có thể tự thiết kế dashboard riêng với **trình kéo-thả trực quan**:

| Widget | Mô tả |
|--------|--------|
| **Biểu đồ đường** | Hiển thị dữ liệu cảm biến theo thời gian |
| **Biểu đồ cột** | So sánh giá trị giữa các thiết bị |
| **Gauge** | Hiển thị giá trị dạng đồng hồ đo |
| **Thẻ thống kê** | Số liệu tổng quan nhanh |
| **Bảng dữ liệu** | Danh sách giá trị chi tiết |
| **Biểu đồ tròn** | Tỷ lệ phần trăm |

### 3.2 Trang chi tiết thiết bị

- **Biểu đồ thời gian thực** - Dữ liệu cập nhật liên tục
- **Lịch sử dữ liệu** - Xem lại dữ liệu theo ngày/giờ
- **Điều khiển** - Bật/tắt relay, điều chỉnh thông số
- **Cấu hình** - Tùy chỉnh ngưỡng cảnh báo
- **Sức khỏe thiết bị** - Đánh giá tình trạng linh kiện

### 3.3 Thiết kế bộ điều khiển ESP Standalone

Công cụ trực quan để thiết kế giao diện điều khiển cho ESP32/ESP8266:

```
Joystick 4 hướng          Slider điều khiển
     ▲                        ┃
   ◄ ● ►          →          ┃
     ▼                        ┃
                          [====▓====]
                          
Color Picker              D-pad & Touch Pad
┌─────────┐
│ ● ● ● ● │              ┌───┬───┬───┐
│         │              │ ▲ │   │ ▲ │
│ ● ● ● ● │              ├───┼───┼───┤
└─────────┘              │ ◄ │ ● │ ► │
                          ├───┼───┼───┤
RGB Output                │ ▼ │   │ ▼ │
                         └───┴───┴───┘
```

- **20+ loại widget** từ cơ bản đến chuyên nghiệp
- **Xuất code Arduino (.ino)** tự động
- **Preview trực tiếp** trên nhiều kích thước màn hình

---

## 4. Phân tích dữ liệu & AI

### 4.1 Phân tích bất thường (Anomaly Detection)

Hệ thống AI tự động phát hiện các giá trị bất thường:

- **Phát hiện điểm bất thường** - Giá trị vượt ngưỡng thống kê
- **Phát hiện flatline** - Cảm biến không thay đổi (có thể hỏng)
- **Phát hiện drift** - Cảm biến lệch dần khỏi baseline
- **Phân tích tương quan** - Phát hiện tương quan bất thường giữa các cảm biến

### 4.2 Theo dõi sức khỏe linh kiện

```
┌─────────────────────────────────────────────────────────┐
│  TỔNG QUAN SỨC KHỎE THIẾT BỊ                           │
├─────────────────────────────────────────────────────────┤
│  Health Score: ████████████░░░ 85%                      │
│                                                         │
│  ⚠️ 2 vấn đề được phát hiện:                            │
│  • Cảm biến DHT11 - Drift nhẹ (phát hiện 2 ngày trước)│
│  • Pin ESP32 - Mức thấp 18%                            │
│                                                         │
│  📊 Lịch sử sức khỏe:                                   │
│  ████████████████████████████                           │
│  Tuần 1  Tuần 2  Tuần 3  Tuần 4  Hiện tại              │
└─────────────────────────────────────────────────────────┘
```

### 4.3 Dự báo xu hướng

- **Forecast** - Dự đoán giá trị tương lai dựa trên dữ liệu lịch sử
- **Trend Analysis** - Phát hiện xu hướng tăng/giảm
- **Threshold Suggestions** - Gợi ý ngưỡng cảnh báo tối ưu

### 4.4 Phát hiện phần cứng tự động

Hệ thống tự động nhận diện:

| Loại cảm biến | Phần cứng được phát hiện |
|---------------|-------------------------|
| Nhiệt độ + Độ ẩm | DHT11, DHT22, BME280 |
| Nhiệt độ đơn lẻ | DS18B20 |
| Áp suất | BMP180, BMP280 |
| Độ ẩm đất | Capacitive Soil |
| Ánh sáng | BH1750, LDR |
| Chuyển động | PIR |
| Gas/CO2 | MQ135, MH-Z19 |

---

## 5. Tự động hóa

### 5.1 Quy tắc điều kiện

Thiết lập hành động tự động khi điều kiện được thỏa mãn:

```
NẾU  [Nhiệt độ phòng A] > 30°C
VÀ   [Giờ học] = 08:00-11:00
THÌ   Bật điều hòa mode Cool 25°C
      Gửi cảnh báo cho giáo viên
```

### 5.2 Quy tắc theo lịch trình

- Hẹn giờ bật/tắt thiết bị
- Hỗ trợ ngày trong tuần / cuối tuần
- Lặp lại theo chu kỳ tùy chỉnh

### 5.3 Quy tắc theo occupancy

Kích hoạt dựa trên số người trong phòng:

```
NẾU  [Số người trong phòng] = 0
TRONG  15 phút
THÌ   Tắt tất cả đèn và điều hòa
```

### 5.4 Hành động được hỗ trợ

- Bật/tắt relay
- Điều chỉnh độ sáng
- Chuyển chế độ điều hòa (Cool/Heat/Fan)
- Gửi thông báo (Telegram, Zalo, Email)
- Gửi lệnh MQTT tùy chỉnh

---

## 6. Ứng dụng di động

### 6.1 ESP Controller App

Ứng dụng Flutter cho phép điều khiển thiết bị ESP32/ESP8266 từ điện thoại:

- **Kết nối WiFi trực tiếp** - Không cần qua server trung gian
- **Widget điều khiển** - Joystick, slider, button, toggle...
- **Lịch sử hoạt động** - SQLite lưu trữ cục bộ
- **Import cấu hình** - Tải JSON từ web platform

### 6.2 Tính năng nổi bật

```
┌─────────────────────────────────────┐
│  🎮 ESP CONTROLLER                 │
├─────────────────────────────────────┤
│  📶 WiFi: Kết nối nhanh            │
│  📁 Import: Từ JSON file           │
│  📊 Dashboard: Widget tùy chỉnh    │
│  🔄 Realtime: Cập nhật tức thì     │
│  💾 Offline: Lịch sử cục bộ        │
└─────────────────────────────────────┘
```

---

## 7. Hệ thống cảnh báo

### 7.1 Cảnh báo đa kênh

| Kênh thông báo | Mô tả |
|----------------|-------|
| **Dashboard** | Badge sáng trên biểu tượng chuông |
| **Telegram** | Tin nhắn tức thì đến bot |
| **Zalo** | Thông báo qua Zalo OA |
| **Email** | Báo cáo tóm tắt định kỳ |

### 7.2 Phân loại mức độ

| Mức độ | Màu sắc | Hành động |
|--------|---------|-----------|
| **Critical** | Đỏ | Cảnh báo khẩn cấp, gọi điện |
| **Warning** | Vàng | Theo dõi và xử lý trong ngày |
| **Info** | Xanh | Ghi nhận và phân tích |

### 7.3 Vòng đời cảnh báo

```
Phát hiện → New → Đã xác nhận → Đang xử lý → Đã giải quyết
   │          │           │            │            │
   └──────────┴───────────┴────────────┴────────────┘
                      Lịch sử được ghi lại
```

---

## 8. Bảo mật & Phân quyền

### 8.1 Vai trò người dùng

| Vai trò | Quản lý thiết bị | Tạo Dashboard | Tạo Rule | Quản lý Users | Giám sát |
|---------|------------------|---------------|----------|---------------|----------|
| **Admin** | ✅ Toàn quyền | ✅ | ✅ | ✅ | ✅ |
| **Giáo viên** | ✅ Phòng được giao | ✅ | ✅ | ❌ | ✅ |
| **Sinh viên** | ✅ Sử dụng | ✅ (hạn chế) | ❌ | ❌ | ❌ |

### 8.2 Xác thực & Ủy quyền

- **JWT Authentication** với refresh token
- **Impersonation** - Admin/Giáo viên có thể đăng nhập thay tài khoản khác để hỗ trợ
- **Password Policy** - Yêu cầu đổi mật khẩu lần đầu

### 8.3 Bảo mật dữ liệu

- Dữ liệu thời gian thực lưu trong MongoDB với TTL 30 ngày
- Metadata và cấu hình trong MySQL an toàn
- MQTT authentication với username/password

---

## 9. Kiến trúc hệ thống

### 9.1 Sơ đồ tổng quan

```
┌──────────────────────────────────────────────────────────────────┐
│                         NGƯỜI DÙNG                               │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│    ┌─────────────────┐      ┌─────────────────┐                  │
│    │   Web Dashboard │      │  Mobile App     │                  │
│    │   (React)       │      │  (Flutter)      │                  │
│    └────────┬────────┘      └────────┬────────┘                  │
│             │                          │                          │
│             └────────────┬─────────────┘                          │
│                          │                                        │
│                    WebSocket + REST API                           │
│                          │                                        │
│             ┌────────────▼────────────┐                          │
│             │     FastAPI Backend      │                          │
│             │   (REST + WebSocket)     │                          │
│             └────────────┬────────────┘                          │
│                          │                                        │
│        ┌─────────────────┼─────────────────┐                      │
│        │                 │                 │                      │
│        ▼                 ▼                 ▼                      │
│  ┌───────────┐   ┌───────────┐   ┌───────────┐                 │
│  │   MySQL   │   │  MongoDB  │   │   Kafka   │                 │
│  │ (Metadata)│   │(Time-series)│   │ (Events)  │                 │
│  └───────────┘   └───────────┘   └─────┬─────┘                 │
│                                        │                         │
│                                        ▼                         │
│                              ┌─────────────────┐                │
│                              │ Kafka Consumer   │                │
│                              │ (AI Analytics)   │                │
│                              └─────────────────┘                │
│                                                                  │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │                        THIẾT BỊ IoT                         │ │
│  │  ESP32  │  ESP8266  │  Sensors  │  Camera  │  Actuators    │ │
│  └────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────┘
```

### 9.2 Luồng dữ liệu

```
Thiết bị gửi dữ liệu
        │
        ▼
   MQTT Broker ──────► Kafka
        │                │
        │                ▼
        │        ┌───────────────┐
        │        │ Kafka Consumer │
        │        │  (AI Pipeline) │
        │        └───────┬───────┘
        │                │
        │        ┌──────▼──────┐
        │        │   MongoDB    │
        │        │ (events)     │
        │        └──────────────┘
        │                │
        │        ┌──────▼──────┐
        │        │    MySQL    │
        │        │  (profiles) │
        │        └──────────────┘
        │                │
        │        ┌──────▼──────┐
        │        │  FastAPI    │
        │        │  Backend    │
        │        └──────┬──────┘
        │               │
        └──────► WebSocket ◄──── Dashboard
```

---

## 10. Yêu cầu kỹ thuật

### 10.1 Phần cứng đề xuất

| Component | Yêu cầu tối thiểu | Đề xuất |
|-----------|-------------------|---------|
| CPU | 4 cores | 8 cores |
| RAM | 8 GB | 16 GB |
| Storage | 100 GB SSD | 256 GB SSD |
| Network | 1 Gbps | 10 Gbps |

### 10.2 Phần mềm

- **Docker & Docker Compose** - Container orchestration
- **Node.js 18+** - React Dashboard build
- **Python 3.10+** - FastAPI Backend
- **Flutter 3.x** - Mobile App

### 10.3 Dịch vụ bên thứ ba (tùy chọn)

- Telegram Bot - Cảnh báo
- Zalo OA - Cảnh báo
- SMTP Server - Email

### 10.4 Thiết bị được hỗ trợ

- **ESP32** - Bộ điều khiển chính
- **ESP8266** - Phiên bản tiết kiệm
- **DHT11/DHT22** - Cảm biến nhiệt độ & độ ẩm
- **BME280** - Cảm biến môi trường đa năng
- **DS18B20** - Cảm biến nhiệt độ 1-wire
- **Relay Module** - Điều khiển ON/OFF
- **Camera IP** - Giám sát occupancy

---

## 11. Liên hệ

### Đơn vị phát triển

**Trường Đại học Bình Dương**
- Khoa: Công nghệ Thông tin
- Địa chỉ: Bình Dương, Việt Nam
- Email: iot@bd-u.edu.vn

### Hỗ trợ kỹ thuật

- Hotline: [Số điện thoại]
- Email: support@iot-platform.edu.vn
- Giờ hỗ trợ: 8:00 - 17:00 (Thứ 2 - Thứ 6)

---

## Phụ lục

### A. Danh sách API chính

| Endpoint | Mô tả |
|----------|--------|
| `GET /api/devices` | Danh sách thiết bị |
| `GET /api/devices/{id}` | Chi tiết thiết bị |
| `POST /api/devices/{id}/control` | Điều khiển thiết bị |
| `GET /api/rooms/{id}` | Thông tin phòng |
| `GET /api/rules` | Danh sách quy tắc |
| `POST /api/ai/analyze` | Phân tích AI |
| `WS /ws` | WebSocket endpoint |

### B. Giải thích thuật ngữ

| Thuật ngữ | Giải thích |
|-----------|------------|
| **IoT** | Internet of Things - Internet vạn vật |
| **MQTT** | Message Queuing Telemetry Transport |
| **ESP32** | Vi điều khiển WiFi+Bluetooth của Espressif |
| **Dashboard** | Trang tổng quan với các widget |
| **Rule** | Quy tắc tự động hóa |
| **Occupancy** | Số người trong không gian |
| **Anomaly** | Giá trị bất thường |

---

*© 2026 Trường Đại học Bình Dương. Bảo lưu mọi quyền.*
