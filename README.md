# IoT Platform  - Nền tảng IoT Toàn diện cho Đại học Bình Dương

Hệ thống IoT đa chức năng phục vụ giám sát, điều khiển, thu thập, xử lý và hiển thị dữ liệu thiết bị IoT. Hỗ trợ đa giao thức (MQTT, HTTP, CoAP), xử lý dữ liệu thời gian thực, quản lý người dùng phân quyền, và tự động hóa thông minh.

## Tính năng chính

### 1. Thu thập dữ liệu đa giao thức
- **MQTT**: Giao thức chính cho thiết bị IoT
- **HTTP/HTTPS**: REST API cho thiết bị và ứng dụng bên ngoài
- **CoAP**: Giao thức nhẹ cho thiết bị hạn chế tài nguyên
- Hỗ trợ Device Profile để tùy chỉnh cách xử lý dữ liệu theo từng loại thiết bị

### 2. Xử lý dữ liệu thời gian thực
- **Apache Kafka**: Message broker phân tán, xử lý hàng triệu sự kiện/giây
- **Apache Spark Streaming**: Xử lý dữ liệu streaming, tính toán tổng hợp
- **MongoDB**: Lưu trữ dữ liệu time-series với TTL 30 ngày
- **MySQL**: Lưu trữ dữ liệu tổng hợp và metadata
- Tự động xóa dữ liệu cũ hơn 30 ngày

### 3. Hệ thống quản lý người dùng
- **Phân quyền 3 cấp**: Admin, Teacher, Student
- **JWT Authentication**: Bảo mật API với token
- **Impersonation Login**: Admin/Teacher có thể đăng nhập vào tài khoản người dùng khác
- **Quản lý lớp học**: Teacher quản lý học viên và thiết bị của họ

### 4. Điều khiển thiết bị
- **Real-time Control**: Điều khiển relay qua MQTT
- **Edge Control**: Gọi API của thiết bị edge (HTTP/HTTPS)
- **Mobile App**: Ứng dụng Flutter cho Android/iOS
- **WebSocket**: Cập nhật trạng thái thiết bị thời gian thực

### 5. Tự động hóa thông minh
- **Rule Engine**: Tạo quy tắc tự động dựa trên điều kiện
  - Conditional Rules: Nếu nhiệt độ > 30°C thì bật quạt
  - Scheduled Rules: Tự động bật/tắt thiết bị theo lịch
  - Device Offline Detection: Cảnh báo khi thiết bị mất kết nối
- **Rule Chain Editor**: Giao diện kéo thả tạo luồng xử lý phức tạp

### 6. Dashboard và Visualization
- **Custom Dashboard Builder**: Tạo dashboard tùy chỉnh với kéo thả
- **Widget Library**: Line chart, gauge, relay control, status card
- **Real-time Updates**: Dữ liệu cập nhật tự động qua WebSocket
- **Responsive Design**: Tương thích mọi kích thước màn hình

### 7. Quản lý thiết bị
- **Device Registration**: Đăng ký thiết bị mới với wizard
- **Device Profiles**: Định nghĩa cách xử lý dữ liệu cho từng loại thiết bị
- **Room Management**: Tổ chức thiết bị theo phòng/khu vực
- **Device Status Monitoring**: Theo dõi trạng thái online/offline

## Kiến trúc hệ thống

```
┌─────────────┐     ┌──────────────┐     ┌─────────────┐
│   Devices   │────▶│ MQTT Broker  │────▶│    Kafka    │
│ (ESP32/...)  │     │  (Mosquitto) │     │             │
└─────────────┘     └──────────────┘     └──────┬──────┘
                                                  │
┌─────────────┐     ┌──────────────┐            │
│  HTTP/CoAP  │────▶│ http_to_kafka│────────────┘
│   Devices   │     │              │
└─────────────┘     └──────────────┘

                    ┌──────────────────────────┐
                    │   Spark Streaming        │
                    │  (process_events.py)     │
                    └────────┬─────────────────┘
                             │
                    ┌────────┴─────────┐
                    │                  │
            ┌───────▼──────┐   ┌──────▼──────┐
            │   MongoDB    │   │    MySQL    │
            │ (Time-series)│   │ (Metadata)  │
            └───────┬──────┘   └──────┬──────┘
                    │                  │
            ┌───────┴──────────────────┴──────┐
            │        FastAPI Backend          │
            │  (REST API + WebSocket + Auth)  │
            └───────┬──────────────────┬──────┘
                    │                  │
        ┌───────────▼──────┐   ┌──────▼──────────┐
        │  React Dashboard │   │  Flutter App    │
        │   (Web UI)       │   │  (Mobile)       │
        └──────────────────┘   └─────────────────┘

        ┌──────────────────┐
        │   Rule Engine    │◀──── MQTT (control)
        │  (Automation)    │
        └──────────────────┘
```


## Cấu hình thiết bị IoT

### MQTT Device

**Topic gửi dữ liệu:**
```
iot/devices/{device_id}/data
```

**Payload format:**
```json
{
  "device_id": "gateway-701e68b1",
  "temperature": 26.5,
  "humidity": 65.2,
  "relay1": 1,
  "relay2": 0,
  "timestamp": 1711891200
}
```

**Topic nhận lệnh điều khiển:**
```
iot/devices/{device_id}/control
```

**Control payload:**
```json
{
  "relay": 1,
  "state": "ON"
}
```

### HTTP Device

**Endpoint:**
```
POST http://localhost:5001/data
```

**Headers:**
```
Content-Type: application/json
```

**Body:**
```json
{
  "device_id": "http-device-001",
  "temperature": 28.3,
  "humidity": 70.5
}
```

### CoAP Device

**Endpoint:**
```
coap://localhost:5683/data
```

**Payload:** Giống HTTP format

## Hướng dẫn sử dụng

### 1. Quản lý người dùng (Admin)

1. Đăng nhập với tài khoản Admin
2. Vào menu "Quản lý người dùng"
3. Thêm người dùng mới với vai trò Teacher hoặc Student
4. Sử dụng nút "Đăng nhập" để impersonate vào tài khoản người dùng khác

### 2. Quản lý lớp học (Teacher)

1. Đăng nhập với tài khoản Teacher
2. Vào menu "Quản lý lớp học"
3. Tạo lớp học mới và thêm học viên
4. Xem danh sách học viên và thiết bị của họ
5. Sử dụng nút "Đăng nhập" để truy cập tài khoản học viên

### 3. Đăng ký thiết bị

1. Vào menu "Thiết bị" → "Thêm thiết bị"
2. Chọn Device Profile phù hợp
3. Nhập Device ID và thông tin cấu hình
4. Thiết bị sẽ tự động xuất hiện khi gửi dữ liệu lần đầu

### 4. Tạo Dashboard

1. Vào menu "Dashboard" → "Tạo mới"
2. Kéo thả các widget từ thanh công cụ
3. Cấu hình widget: chọn thiết bị, trường dữ liệu, màu sắc
4. Lưu dashboard và chia sẻ với người dùng khác

### 5. Tạo Rule tự động

**Conditional Rule:**
1. Vào menu "Quy tắc" → "Tạo quy tắc mới"
2. Chọn loại "Conditional"
3. Thiết lập điều kiện: `temperature > 30`
4. Thiết lập hành động: Bật relay 1
5. Kích hoạt rule

**Scheduled Rule:**
1. Chọn loại "Scheduled"
2. Thiết lập thời gian: `08:00` hàng ngày
3. Thiết lập hành động: Bật relay 2
4. Kích hoạt rule

## Bảo mật

### Authentication
- JWT token với expiration time
- Password hashing với bcrypt
- Internal API key cho service-to-service communication

### Authorization
- Role-based access control (RBAC)
- Admin: Toàn quyền truy cập
- Teacher: Quản lý lớp học và học viên
- Student: Chỉ truy cập thiết bị của mình

### Data Protection
- MQTT authentication với username/password
- API rate limiting (tùy chọn)
- Input validation với Pydantic
- SQL injection prevention với parameterized queries

## Database Schema

### MySQL Tables

**nguoi_dung** (Users)
```sql
- id: INT PRIMARY KEY
- email: VARCHAR(255) UNIQUE
- mat_khau_hash: VARCHAR(255)
- vai_tro: ENUM('admin', 'teacher', 'student')
- ho_ten: VARCHAR(255)
```

**lop_hoc** (Classes)
```sql
- id: INT PRIMARY KEY
- ten_lop: VARCHAR(255)
- giao_vien_id: INT (FK to nguoi_dung)
```

**thiet_bi** (Devices)
```sql
- id: INT PRIMARY KEY
- device_id: VARCHAR(255) UNIQUE
- nguoi_dung_id: INT (FK to nguoi_dung)
- phong_id: INT (FK to phong)
- device_profile_id: INT
```

**quy_tac** (Rules)
```sql
- id: INT PRIMARY KEY
- ten_quy_tac: VARCHAR(255)
- loai: ENUM('conditional', 'scheduled')
- dieu_kien: TEXT
- hanh_dong: TEXT
- kich_hoat: BOOLEAN
```

### MongoDB Collections

**events** (Time-series data)
```javascript
{
  device_id: "gateway-701e68b1",
  temperature: 26.5,
  humidity: 65.2,
  relay1: 1,
  relay2: 0,
  timestamp: ISODate("2026-03-31T08:00:00Z")
}
```

TTL Index: Tự động xóa documents sau 30 ngày

## Data Flow

1. **Device → MQTT Broker**: Thiết bị gửi dữ liệu qua MQTT
2. **MQTT → Kafka**: `mqtt_to_kafka` đọc MQTT và publish vào Kafka topic
3. **Kafka → Spark**: Spark Streaming đọc từ Kafka và xử lý
4. **Spark → Databases**: Ghi vào MongoDB (raw data) và MySQL (aggregated)
5. **Backend → WebSocket**: FastAPI đọc DB và push qua WebSocket
6. **WebSocket → Frontend**: React nhận real-time updates


## 🔄 Data Migration

### Chuyển dữ liệu giữa các máy

Khi bạn build lại project trên máy mới và muốn giữ lại dữ liệu từ máy cũ:

**Trên máy CŨ:**
```bash
# Windows
pwsh scripts/migrate_data.ps1
# Chọn option 1 (Export)

# Linux/Mac
bash scripts/migrate_data.sh
# Chọn option 1 (Export)
```

**Copy folder `backup/` sang máy MỚI**

**Trên máy MỚI:**
```bash
# Khởi động containers trước
docker-compose up -d

# Import dữ liệu
pwsh scripts/migrate_data.ps1  # Windows
bash scripts/migrate_data.sh   # Linux/Mac
# Chọn option 2 (Import)

# Restart
docker-compose restart
```

📖 **Chi tiết**: Xem [docs/DATA_MIGRATION.md](docs/DATA_MIGRATION.md)

---

## 🧪 Testing

### Rebuild specific service

```bash
# Rebuild backend
docker-compose build --no-cache fastapi-backend
docker-compose up -d fastapi-backend

# Rebuild frontend
docker-compose build --no-cache frontend
docker-compose up -d frontend

# Rebuild spark processor
docker-compose build --no-cache spark-processor
docker-compose up -d spark-processor
```

### View logs

```bash
# All services
docker-compose logs -f

# Specific service
docker-compose logs -f fastapi-backend
docker-compose logs -f rule-engine
```

### Access database

**MySQL:**
```bash
docker exec -it mysql mysql -u iot -piot123 iot_data
```

**MongoDB:**
```bash
docker exec -it mongodb mongosh iot
```

### Run utility scripts

**Setup MongoDB TTL:**
```bash
python scripts/setup_mongodb_ttl.py
```

**Manual cleanup old data:**
```bash
python scripts/cleanup_mysql_old_data.py
```

**Test scheduled rules:**
```bash
pwsh scripts/test-scheduled-rules.ps1
```

### Test MQTT connection

```bash
# Subscribe to topic
mosquitto_sub -h localhost -p 1883 -t "iot/devices/+/data" -u mqtt_user -P mqtt_pass

# Publish test message
mosquitto_pub -h localhost -p 1883 -t "iot/devices/test-001/data" \
  -m '{"device_id":"test-001","temperature":25.5,"humidity":60}' \
  -u mqtt_user -P mqtt_pass
```

### Test HTTP endpoint

```bash
curl -X POST http://localhost:5001/data \
  -H "Content-Type: application/json" \
  -d '{"device_id":"http-001","temperature":27.3,"humidity":55.2}'
```

### Test API authentication

```bash
# Login
curl -X POST http://localhost:8000/login \
  -H "Content-Type: application/json" \
  -d '{"email":"22050026@student.bdu.edu.vn","password":"123456"}'

# Use token
curl -X GET http://localhost:8000/devices \
  -H "Authorization: Bearer YOUR_TOKEN_HERE"
```
