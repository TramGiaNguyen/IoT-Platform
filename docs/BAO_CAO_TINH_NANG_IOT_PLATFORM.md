# BÁO CÁO CHỨC NĂNG HỆ THỐNG IoT PLATFORM

## 1. Tổng quan hệ thống

IoT Platform là nền tảng quản lý, giám sát và điều khiển các thiết bị IoT trong môi trường trường học, phòng thực hành hoặc phòng nghiên cứu.

### 1.1. Kiến trúc hệ thống

```
┌─────────────────────────────────────────────────────────────────────┐
│                         IoT Devices                                 │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐          │
│  │   ESP32  │  │   ESP32  │  │  Sensor  │  │  Camera  │          │
│  │  (WiFi)  │  │  (WiFi)  │  │  (CoAP)  │  │  (RTSP)  │          │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘          │
└───────┼─────────────┼─────────────┼─────────────┼─────────────────┘
        │ MQTT/HTTP   │ MQTT/HTTP   │    CoAP     │    RTSP
        ▼             ▼             ▼             ▼
┌─────────────────────────────────────────────────────────────────────┐
│                         PROTOCOLS                                   │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐          │
│  │   MQTT   │  │   HTTP   │  │   CoAP   │  │   RTSP   │          │
│  │ Broker   │  │   API    │  │  Server  │  │  Stream  │          │
│  │  :1883   │  │  :8000   │  │  :5683   │  │          │          │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘          │
└───────┼─────────────┼─────────────┼─────────────┼─────────────────┘
        │             │             │             │
        └─────────────┴──────┬──────┴─────────────┘
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    MESSAGE BROKERS                                  │
│  ┌──────────────┐              ┌──────────────┐                     │
│  │    Kafka    │──────────────│    Redis    │                     │
│  │   Events    │              │   Pub/Sub   │                     │
│  └──────────────┘              └──────────────┘                     │
│          │                            │                             │
│          ▼                            ▼                             │
│  ┌──────────────┐              ┌──────────────┐                     │
│  │    Kafka     │              │   WebSocket │                     │
│  │   Consumer   │              │   Server    │                     │
│  └──────────────┘              └──────────────┘                     │
└─────────────────────────────────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    BACKEND & SERVICES                               │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐             │
│  │  FastAPI     │  │ Rule Engine  │  │   Alerting  │             │
│  │  Backend     │  │              │  │   Service   │             │
│  └──────────────┘  └──────────────┘  └──────────────┘             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐             │
│  │    MySQL     │  │   MongoDB    │  │  AI Analyst  │             │
│  │  (Metadata)  │  │  (Events)    │  │  (Camera)    │             │
│  └──────────────┘  └──────────────┘  └──────────────┘             │
└─────────────────────────────────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│                       FRONTEND                                      │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │              React Dashboard (Web Application)                │  │
│  │  • Device Management    • Dashboard Builder                   │  │
│  │  • Rule Editor         • Camera & Occupancy                   │  │
│  │  • User Management      • Standalone Controller Builder       │  │
│  └──────────────────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │              Flutter Control App (Mobile)                     │  │
│  │  • Standalone Controller   • WiFi Configuration               │  │
│  └──────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
```

### 1.2. Hỗ trợ giao thức

| Giao thức | Cổng | Mục đích | Thiết bị |
|-----------|------|----------|----------|
| **MQTT** | 1883 | Telemetry & Control | ESP32, sensors |
| **HTTP** | 8000 | REST API, device registration | All devices |
| **CoAP** | 5683 | Nhẹ, UDP, low-power devices | Sensors |
| **WebSocket** | WS | Real-time updates | Dashboard |
| **RTSP** | Camera | MJPEG video stream | IP Cameras |

### 1.3. Ba nhóm người dùng

* **Admin – Quản trị viên**: Quản lý toàn bộ hệ thống
* **Teacher – Giáo viên**: Quản lý lớp, nhóm, thiết bị được phân công
* **Student – Học sinh/Sinh viên**: Sử dụng thiết bị, tạo Dashboard và Rule

---

## 2. ADMIN – QUẢN TRỊ VIÊN

Admin có quyền quản lý cao nhất, bao gồm toàn bộ người dùng, thiết bị, phòng học, lớp học và cấu hình hệ thống.

### 2.1. Quản lý người dùng

Admin có thể:
- Tạo tài khoản mới (Admin, Teacher, Student)
- Chỉnh sửa thông tin tài khoản
- Xóa hoặc vô hiệu hóa tài khoản
- Đặt lại mật khẩu
- **Bulk Import**: Nhập nhiều tài khoản từ file Excel
- Kiểm tra trạng thái hoạt động của tài khoản

### 2.2. Phân quyền

Admin cấu hình quyền truy cập chi tiết:
- Theo trang chức năng
- Theo phòng học
- Theo lớp học
- Theo thiết bị
- Theo Dashboard
- Theo Rule

### 2.3. Impersonation

Admin có thể đăng nhập tạm thời dưới quyền Teacher hoặc Student để:
- Kiểm tra quyền truy cập
- Kiểm tra giao diện người dùng
- Xử lý lỗi mà người dùng gặp phải
- Debug Dashboard, thiết bị hoặc Rule

---

## 3. QUẢN LÝ THIẾT BỊ IoT

### 3.1. Đăng ký thiết bị

Hỗ trợ đăng ký qua nhiều giao thức:
- **MQTT**: Cung cấp credentials (username, password, client ID)
- **HTTP**: Cung cấp API Key
- **Cả hai**: Thiết bị hỗ trợ đa giao thức

Thông tin thiết bị:
- Device ID
- Tên thiết bị
- Loại thiết bị (sensor, light, air_conditioner, power_meter, gateway, smart_classroom_energy)
- Phòng được gán
- Gateway
- API Key / Device Token

### 3.2. Loại thiết bị

| Loại | Mô tả | Ví dụ |
|------|-------|-------|
| `sensor` | Cảm biến thu thập dữ liệu | Nhiệt độ, độ ẩm, ánh sáng |
| `light` | Thiết bị chiếu sáng | Đèn LED, bóng đèn |
| `air_conditioner` | Điều hòa không khí | Máy lạnh thông minh |
| `power_meter` | Đo công suất | Watt-meter |
| `gateway` | Thiết bị trung gian | ESP32 Gateway |
| `smart_classroom_energy` | Đo năng lượng phòng học | Smart meter |

### 3.3. Cấu hình thiết bị

Admin/Teacher có thể cấu hình:
- Đổi tên thiết bị
- Chọn loại thiết bị
- Khai báo các Data Keys (thông số gửi về):
  - Nhiệt độ (temperature)
  - Độ ẩm (humidity)
  - Ánh sáng (light)
  - Khoảng cách (distance)
  - Trạng thái Relay
  - Trạng thái cửa (door)
  - Cảnh báo cháy (smoke)
- Cấu hình Relay Control Lines (tối đa 16 relay):
  - ON/OFF toggle
  - 3-way toggle (LOW/MED/HIGH)
  - Momentary (nhấn)
  - Range (0-100)
- Cấu hình MQTT Topic
- Cấu hình HTTP Endpoint (Edge Control URL)
- Auto-detect keys từ dữ liệu thực (Kafka-based)

### 3.4. Theo dõi trạng thái

Trạng thái thiết bị:
- **Online**: Thiết bị đang kết nối
- **Warning**: Thông số bất thường
- **Offline**: Thiết bị mất kết nối (dựa trên `last_seen` timestamp)

### 3.5. Điều khiển thiết bị

Người dùng có quyền có thể:
- Bật/tắt Relay
- Bật/tắt đèn
- Điều chỉnh độ sáng (brightness)
- Điều chỉnh nhiệt độ (AC setpoint)
- Điều chỉnh tốc độ quạt (fan speed)
- Điều khiển Servo
- Mở/đóng cửa

Lệnh được gửi qua:
- MQTT: `iot/devices/{device_id}/control`
- HTTP: Edge Control URL với JSON body template

### 3.6. ESP32 Code Generator

Hệ thống tự động sinh code Arduino cho ESP32/ESP8266:
- WiFi SSID/password configuration
- Static IP configuration
- MQTT/HTTP mode selection
- Relay control endpoints
- Sensor data publishing
- Xuất file `.ino` để nạp trực tiếp

---

## 4. QUẢN LÝ PHÒNG VÀ LỚP HỌC

### 4.1. Quản lý phòng học

Admin/Teacher có thể:
- Tạo phòng mới
- Chỉnh sửa thông tin phòng
- Xóa phòng
- Gán thiết bị IoT vào phòng
- Gán giáo viên phụ trách

Mỗi phòng có thể chứa nhiều thiết bị:
```
Phòng IoT Lab 01
├── ESP32 Gateway 01
├── Cảm biến nhiệt độ
├── Cảm biến độ ẩm
├── Đèn LED
├── Quạt
├── Relay
└── Camera IP
```

### 4.2. Quản lý lớp học

Admin có thể:
- Tạo lớp
- Chỉnh sửa lớp
- Xóa lớp
- Gán giáo viên phụ trách
- Thêm/xóa học sinh vào lớp
- Bulk Import học sinh từ Excel

Một giáo viên có thể phụ trách nhiều lớp.

### 4.3. Quản lý nhóm

Admin/Teacher có thể chia học sinh thành nhóm:
- Tối đa **5 thành viên** mỗi nhóm
- Gán thiết bị cho nhóm
- Gán Dashboard cho nhóm
- Gán Rule cho nhóm
- Cấp quyền điều khiển thiết bị

---

## 5. CAMERA & OCCUPANCY

### 5.1. Quản lý Camera

Hỗ trợ IP Camera với RTSP stream:
- Cấu hình IP, port, path, credentials
- MJPEG streaming qua AI Analyst service
- Start/stop AI analysis sessions
- Real-time people count overlay

### 5.2. Zone Configuration

Người dùng có thể vẽ các vùng trên camera stream:
- **Monitor Zone**: Vùng giám sát
- **Entry Zone**: Vùng cửa ra vào
- Polygon drawing trên canvas
- Manual coordinate entry fallback
- Zone-specific occupancy tracking

### 5.3. Occupancy Tracking

- Đếm số người theo thời gian thực
- Tracking duration (thời gian ở lại)
- Daily aggregation lúc 00:05 ICT
- Lưu trữ zone occupancy log

---

## 6. DASHBOARD

### 6.1. Dashboard hệ thống (Admin)

Admin có Dashboard tổng quan:
- Tổng số thiết bị / Online / Offline / Warning
- Tổng số phòng
- Tổng số lớp
- Active alerts
- Số lượng Rule đang hoạt động
- Message throughput (hourly/daily sparkline)
- Real-time log stream

### 6.2. Dashboard tùy chỉnh

Mọi người dùng đều có thể:
- Tạo Dashboard mới
- Đổi tên Dashboard
- Thêm Widget
- Xóa Widget
- Thay đổi vị trí và kích thước Widget
- Chia sẻ Dashboard (view/edit permissions)

### 6.3. Widget Types

| Widget | Mô tả |
|--------|-------|
| `line_chart` | Biểu đồ đường theo thời gian |
| `bar_chart` | Biểu đồ cột |
| `gauge` | Đồng hồ đo |
| `stat_card` | Thẻ hiển thị giá trị |
| `table` | Bảng dữ liệu |
| `pie_chart` | Biểu đồ tròn |

### 6.4. Widget Configuration

Mỗi Widget cấu hình được:
- Chọn thiết bị nguồn
- Chọn data key (temperature, humidity...)
- Chọn time range
- Tùy chỉnh màu sắc
- Refresh interval

---

## 7. STANDALONE CONTROLLER BUILDER

### 7.1. Widget Canvas

Người dùng có thể tạo giao diện điều khiển bằng drag-and-drop:
- Visual canvas trên lưới
- Nhiều device presets (iPhone SE, iPhone 12/14, Pixel 5, Galaxy S20, custom)
- Portrait/landscape orientation
- Preview mode trong khung điện thoại

### 7.2. Widget Types cho Controller

| Widget | Mô tả | Use case |
|--------|-------|----------|
| `joystick` | Joystick (full, X, Y) | Robot, drone |
| `color_picker` | Chọn màu RGB | LED RGB |
| `touch_pad` | Touch pad area | Drawing |
| `dpad` | D-pad control | Remote control |
| `slider` | Thanh trượt | Dimmer, volume |
| `knob` | Nút xoay | Temperature, brightness |
| `number_input` | Nhập số | Setpoint |
| `stepper` | Tăng/giảm | Counter |
| `toggle` | Bật/tắt | Switch |
| `button` | Nút nhấn | Momentary action |
| `checkbox` | Checkbox | Multi-select |
| `icon_button` | Nút icon | Quick actions |

### 7.3. Widget Configuration

- Label text
- Màu sắc
- Virtual pin vs GPIO
- HTTP endpoint
- Min/max values
- Grid snapping
- Resize với 4-corner handles

### 7.4. Export & Import

- **Export .ino**: Sinh code Arduino cho ESP32/ESP8266
- **Import/Export JSON**: Lưu và load cấu hình
- **Save Config**: Lưu cấu hình vào database

---

## 8. RULE ENGINE

### 8.1. Cấu trúc Rule

```
IF [Điều kiện] THEN [Hành động]
```

**Điều kiện** bao gồm:
- Thiết bị
- Sensor/Thuộc tính
- Phép so sánh: `>`, `<`, `>=`, `<=`, `!=`, `=`
- Giá trị ngưỡng

**Hành động** bao gồm:
- Relay ON/OFF
- Set brightness
- AC modes (cool, heat, fan)
- Custom MQTT command
- Gửi cảnh báo

### 8.2. Loại Rule

| Loại | Mô tả | Trigger |
|------|-------|---------| 
| **Condition-Based** | IF condition → action | Khi sensor value thay đổi |
| **Scheduled** | Cron-based | Thời gian cố định (daily, interval, weekdays) |
| **Occupancy-Based** | Dựa trên số người | Khi occupancy thay đổi |

### 8.3. Scheduled Rules

Cron-based scheduling:
- Daily: Mỗi ngày vào giờ X
- Interval: Mỗi X phút/giờ
- Weekdays: Thứ 2-6
- Weekends: Thứ 7, CN
- Cron presets có sẵn

### 8.4. Rule Actions

- **Multi-action**: Thực hiện nhiều action
- **Delay**: Đặt delay giữa các actions
- **Priority**: Thứ tự ưu tiên
- **Enable/Disable**: Bật/tắt không cần xóa

### 8.5. Occupancy Rules

- Polling every 5 seconds
- 60-second cooldown để tránh spam
- Kết hợp với camera zone occupancy

---

## 9. CẢNH BÁO (ALERTING)

### 9.1. Alert Types

| Type | Mô tả |
|------|-------|
| `device_offline` | Thiết bị mất kết nối |
| `threshold_exceeded` | Vượt ngưỡng sensor |
| `rule_triggered` | Rule được kích hoạt |
| `system_error` | Lỗi hệ thống |
| `emergency` | Khẩn cấp (cháy, gas...) |

### 9.2. Alert Severity

- `low`: Thông tin
- `medium`: Cảnh báo
- `high`: Nghiêm trọng
- `critical`: Khẩn cấp

### 9.3. Alert Lifecycle

```
New → Acknowledged → Resolved
```

- **New**: Mới được tạo
- **Acknowledged**: Đã xem/xác nhận
- **Resolved**: Đã xử lý xong (có thể thêm ghi chú)

### 9.4. Notification Channels

Hỗ trợ thông báo đa kênh:
- **Telegram**: Bot notifications
- **Zalo**: Zalo OA
- **Email**: Email notifications

---

## 10. TEACHER – GIÁO VIÊN

### 10.1. Quản lý lớp học

Teacher có thể:
- Xem danh sách lớp được phân công
- Xem/thêm/xóa học sinh trong lớp
- Tạo nhóm (tối đa 5 người)
- Thay đổi thành viên nhóm
- Bulk Import học sinh từ Excel

### 10.2. Quản lý phòng

Teacher có thể (trong phạm vi được cấp quyền):
- Xem phòng được phân công
- Xem thiết bị trong phòng
- Gán thiết bị cho nhóm
- Theo dõi trạng thái thiết bị
- Điều khiển thiết bị

### 10.3. Dashboard

Teacher có thể:
- Xem Dashboard cá nhân
- Tạo Dashboard mới
- Thêm Widget
- Xem dữ liệu thiết bị
- Theo dõi hoạt động của lớp/nhóm

### 10.4. Rule

Teacher có thể:
- Tạo Rule cho phòng được phân công
- Sửa/xóa Rule của mình
- Bật/tắt Rule
- Theo dõi lịch sử thực thi

### 10.5. Cảnh báo

Teacher có thể:
- Nhận cảnh báo
- Xem chi tiết cảnh báo
- Xác nhận cảnh báo
- Đánh dấu đã xử lý
- Xem lịch sử cảnh báo

---

## 11. STUDENT – HỌC SINH/SINH VIÊN

### 11.1. Dashboard

Student có thể:
- Xem Dashboard cá nhân
- Xem Dashboard nhóm
- Tạo Dashboard mới
- Thêm Widget
- Theo dõi dữ liệu Sensor real-time

### 11.2. Xem thiết bị

Student có thể xem:
- Thiết bị được cấp quyền
- Thiết bị của nhóm
- Trạng thái thiết bị
- Dữ liệu Sensor
- Lịch sử dữ liệu

### 11.3. Điều khiển thiết bị

Student có thể điều khiển thiết bị được cấp quyền:
- Bật/tắt đèn, quạt, Relay
- Điều chỉnh độ sáng
- Điều chỉnh nhiệt độ
- Điều khiển Servo
- Các Actuator khác

### 11.4. Tạo Rule

Student **được phép tạo Rule** để thực hành:
- IF temperature > 30°C → bật quạt
- IF humidity < 40% → bật máy phun sương
- IF light < 200 lux → bật đèn
- IF motion detected → bật đèn trong 10 giây

**Lưu ý**: Student chỉ được sử dụng thiết bị được cấp quyền.

### 11.5. Tương tác nhóm

Student có thể:
- Xem thành viên nhóm
- Xem Dashboard nhóm
- Xem thiết bị nhóm
- Điều khiển thiết bị nhóm
- Tạo Dashboard cho bài thực hành
- Tạo Rule cho thiết bị nhóm

### 11.6. Cảnh báo

Student có thể:
- Nhận cảnh báo liên quan đến thiết bị của mình
- Xem chi tiết cảnh báo
- Xem lịch sử cảnh báo

---

## 12. FLUTTER CONTROL APP (appdieukhien)

### 12.1. WiFi Setup

Ứng dụng cho phép cấu hình WiFi cho ESP32:
- Nhập SSID
- Nhập Password
- Static IP configuration
- Gateway & Subnet

### 12.2. Widget Canvas

- Render widgets trên màn hình điện thoại
- Grid-based responsive layout
- Edit mode: drag-and-drop repositioning
- Widget factory: joystick, slider, toggle, button...

### 12.3. ESP HTTP Client

- Giao tiếp với ESP32 qua HTTP
- Configurable endpoints
- Real-time control feedback

### 12.4. Standalone Config

- Schema versioning
- Board type selection (ESP32/ESP8266)
- Layout override persistence
- Orientation lock

---

## 13. BẢNG SO SÁNH QUYỀN

| Tính năng | Admin | Teacher | Student |
|-----------|:-----:|:-------:|:-------:|
| Đăng nhập/Đăng xuất | ✅ | ✅ | ✅ |
| Đổi mật khẩu | ✅ | ✅ | ✅ |
| Quản lý người dùng | ✅ | ❌ | ❌ |
| Bulk Import người dùng | ✅ | ❌ | ❌ |
| Impersonation | ✅ | ✅* | ❌ |
| Quản lý lớp học | ✅ | ✅* | ❌ |
| Quản lý nhóm | ✅ | ✅* | ❌ |
| Đăng ký thiết bị | ✅ | ❌ | ❌ |
| Cấu hình thiết bị | ✅ | ✅* | ❌ |
| Gán thiết bị vào phòng | ✅ | ✅* | ❌ |
| Xem Dashboard | ✅ | ✅ | ✅ |
| Tạo Dashboard | ✅ | ✅ | ✅ |
| Chỉnh sửa Dashboard cá nhân | ✅ | ✅ | ✅ |
| Xem thiết bị | ✅ | ✅ | ✅ |
| Điều khiển thiết bị | ✅ | ✅* | ✅* |
| Xem dữ liệu Sensor | ✅ | ✅* | ✅* |
| Xem phòng | ✅ | ✅* | ✅* |
| Camera & Occupancy | ✅ | ✅* | ✅* |
| Tạo Rule | ✅ | ✅* | ✅* |
| Chỉnh sửa Rule của mình | ✅ | ✅ | ✅ |
| ESP32 Code Generator | ✅ | ✅* | ✅* |
| Standalone Controller Builder | ✅ | ✅ | ✅ |
| Xem cảnh báo | ✅ | ✅ | ✅ |
| Nhận notification | ✅ | ✅ | ✅ |
| Xem lịch sử cảnh báo | ✅ | ✅ | ✅ |
| Xem System Logs | ✅ | ✅* | ❌ |

**Ghi chú**: Dấu `*` có nghĩa là chỉ trong phạm vi tài nguyên được Admin cấp quyền.

---

## 14. DATABASE TABLES

| Bảng | Mô tả |
|------|-------|
| `nguoi_dung` | Users với vai_tro (Admin/Teacher/Student) |
| `thiet_bi` | Devices với room/group assignment |
| `phong` | Rooms với owner tracking |
| `lop_hoc` | Classes với teacher assignment |
| `nhom` | Groups within classes |
| `nhom_thanh_vien` | Group membership |
| `rules` | Automation rules |
| `rule_actions` | Actions của rules |
| `scheduled_rules` | Cron-based rule scheduling |
| `canh_bao` | Alerts với lifecycle (new/ack/resolved) |
| `kenh_thong_bao` | Notification channels (Telegram, Zalo, Email) |
| `custom_dashboards` | User dashboards |
| `custom_widgets` | Dashboard widgets |
| `zone_occupancy_log` | Real-time occupancy logs |
| `zone_occupancy_daily` | Daily aggregation |
| `phong_cameras` | Room cameras |
| `camera_zones` | Camera zone configurations |
| `control_lines` | Per-device relay configurations |
| `quyen_trang` | Page permissions |
| `device_data_keys` | Device sensor keys |

---

## 15. MÔ HÌNH PHÂN QUYỀN

```
User → Role → Permission → Resource
```

**Ví dụ:**

```
Student01
├── Role: Student
├── Room: IoT Lab 01
├── Group: Group 01
├── Devices: ESP32-01, ESP32-02
└── Permissions: View + Control + Create Rule

Khi Student01 tạo Rule:
  Temperature ESP32-01 > 30°C → Relay ESP32-02 ON

Backend kiểm tra:
  ✅ Student01 có quyền ESP32-01 (sensor input) → Cho phép
  ✅ Student01 có quyền ESP32-02 (relay output) → Cho phép
  → Rule được tạo thành công
```

---

## 16. LUỒNG HOẠT ĐỘNG

### 16.1. Luồng dữ liệu thiết bị

```
┌─────────────┐
│ ESP32/Sensor│
└──────┬──────┘
       │ MQTT/HTTP/CoAP
       ▼
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│ MQTT Broker │────▶│    Kafka    │────▶│Rule Engine  │
│   :1883     │     │   Events    │     │             │
└─────────────┘     └─────────────┘     └──────┬──────┘
       │                   │                   │
       │                   ▼                   ▼
       │            ┌─────────────┐     ┌─────────────┐
       │            │  Dashboard  │◀────│  Condition  │
       │            │  (Real-time) │     │   Matched   │
       │            └─────────────┘     └──────┬──────┘
       │                                        │
       ▼                                        ▼
┌─────────────┐                         ┌─────────────┐
│   MySQL     │◀────────────────────────│   Action    │
│  (Storage)  │                         │  Execution  │
└─────────────┘                         └──────┬──────┘
       ▲                                    │
       │                                    ▼
       │                             ┌─────────────┐
       └─────────────────────────────│    MQTT     │
                                     │   Control   │
                                     └─────────────┘
```

### 16.2. Luồng Rule

```
1. ESP32 gửi: Temperature = 32°C
               ↓
2. Backend nhận, lưu vào MySQL + Kafka
               ↓
3. Rule Engine nhận event từ Kafka
               ↓
4. Kiểm tra: Temperature > 30°C? → TRUE
               ↓
5. Thực hiện Action: Fan Relay = ON
               ↓
6. Gửi lệnh qua MQTT
               ↓
7. ESP32 nhận → Quạt bật
               ↓
8. Gửi notification (Telegram/Zalo/Email)
```

---

## 17. CÔNG NGHỆ SỬ DỤNG

### Backend
- **FastAPI**: REST API
- **MySQL**: Metadata storage
- **MongoDB**: Event/sensor data
- **Redis**: Cache, Pub/Sub, Session

### Message Brokers
- **Kafka**: Event streaming (`iot-events` topic)
- **Redis Pub/Sub**: Real-time updates
- **Mosquitto**: MQTT Broker

### Frontend
- **React**: Dashboard web
- **TypeScript**: Type safety
- **WebSocket**: Real-time communication

### Mobile
- **Flutter**: Standalone controller app

### IoT
- **ESP32/ESP8266**: Microcontroller
- **Arduino**: Firmware
- **MQTT/HTTP/CoAP**: Communication

### AI/Computer Vision
- **AI Analyst Service**: Camera stream analysis
- **People Counting**: Real-time occupancy

---

## 18. KẾT LUẬN

IoT Platform là nền tảng IoT hoàn chỉnh với:

### Đặc điểm chính:
1. **Đa giao thức**: MQTT, HTTP, CoAP, RTSP
2. **Đa người dùng**: Admin, Teacher, Student với RBAC
3. **Real-time**: WebSocket + Redis Pub/Sub
4. **Event-driven**: Kafka-based architecture
5. **Visual tools**: Dashboard builder, Rule editor, Controller builder
6. **Camera AI**: People counting, zone occupancy
7. **Code generation**: Auto Arduino code for ESP32
8. **Mobile app**: Flutter standalone controller

### Phân quyền:
- **Admin**: Toàn quyền quản lý hệ thống
- **Teacher**: Quản lý lớp, nhóm, thiết bị được phân công
- **Student**: Sử dụng thiết bị, tạo Dashboard và Rule (trong phạm vi được cấp quyền)

### Mục tiêu:
Cho phép Student trực tiếp thiết kế, thử nghiệm và đánh giá các hệ thống IoT tự động trong môi trường được kiểm soát:

```
Sensor → Condition → Rule → Action → Actuator
```

Qua đó, sinh viên có thể học và thực hành IoT một cách toàn diện.
