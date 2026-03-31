# IoT Platform - Nền tảng IoT Toàn diện

Hệ thống IoT đa chức năng phục vụ giám sát, điều khiển, thu thập, xử lý và hiển thị dữ liệu thiết bị IoT. Hỗ trợ đa giao thức (MQTT, HTTP, CoAP), xử lý dữ liệu thời gian thực, quản lý người dùng phân quyền, và tự động hóa thông minh.

## 🌟 Tính năng chính

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
- **Alarm System**: Hệ thống cảnh báo qua Email, Telegram, Zalo

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

## 🏗️ Kiến trúc hệ thống

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

## 📋 Yêu cầu hệ thống

- **Docker** >= 20.10
- **Docker Compose** >= 2.0
- **RAM**: Tối thiểu 8GB (khuyến nghị 16GB)
- **Disk**: Tối thiểu 20GB trống
- **OS**: Linux, macOS, Windows (với WSL2)

## 🚀 Cài đặt và triển khai

### 1. Clone repository

```bash
git clone https://github.com/TramGiaNguyen/IoT-Platform.git
cd IoT-Platform
```

### 2. Cấu hình môi trường

Tạo file `.env` trong thư mục `fastapi_backend/`:

```env
JWT_SECRET=your-secret-key-change-in-production
INTERNAL_API_KEY=internal-rule-engine-key-change-in-production
```

### 3. Khởi động hệ thống

```bash
docker-compose up -d
```

Lệnh này sẽ khởi động tất cả các service:
- Zookeeper & Kafka
- MongoDB & MySQL
- MQTT Broker (Mosquitto)
- FastAPI Backend
- React Dashboard
- Spark Streaming
- Rule Engine
- HTTP to Kafka adapter
- CoAP adapter

### 4. Kiểm tra trạng thái

```bash
docker-compose ps
```

Tất cả service phải ở trạng thái `Up` hoặc `Up (healthy)`.

### 5. Truy cập hệ thống

| Service | URL | Mô tả |
|---------|-----|-------|
| **Web Dashboard** | http://localhost:3000 | Giao diện quản lý chính |
| **FastAPI Docs** | http://localhost:8000/docs | API Documentation (Swagger) |
| **MQTT Broker** | localhost:1883 | MQTT broker cho thiết bị |
| **MongoDB** | localhost:27017 | Database time-series |
| **MySQL** | localhost:3307 | Database metadata |

### 6. Đăng nhập lần đầu

**Tài khoản Admin mặc định:**
- Email: `22050026@student.bdu.edu.vn`
- Password: `123456`

⚠️ **Quan trọng**: Đổi mật khẩu ngay sau khi đăng nhập lần đầu!

## 📱 Cài đặt Mobile App

### Android

```bash
cd app_control
flutter pub get
flutter run
```

### iOS

```bash
cd app_control
flutter pub get
cd ios
pod install
cd ..
flutter run
```

## 🔧 Cấu hình thiết bị IoT

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

## 🎯 Hướng dẫn sử dụng

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

### 6. Cấu hình cảnh báo

1. Vào menu "Cảnh báo"
2. Tạo alarm mới với điều kiện
3. Chọn kênh thông báo: Email, Telegram, Zalo
4. Cấu hình thông tin kênh trong `alerting/config.json`

## 🗂️ Cấu trúc dự án

```
IoT-Platform/
├── alerting/                    # Hệ thống cảnh báo
│   ├── alert_service.py
│   ├── email_notifier.py
│   ├── telegram_notifier.py
│   └── zalo_notifier.py
├── app_control/                 # Flutter mobile app
│   ├── lib/
│   │   ├── main.dart
│   │   ├── screens/
│   │   └── services/
│   ├── android/
│   └── ios/
├── backend_app_control/         # Backend cho mobile app
│   └── main.py
├── coap_adapter/                # CoAP protocol adapter
│   └── coap_server.py
├── fastapi_backend/             # Backend chính
│   ├── main.py                  # Entry point
│   ├── auth.py                  # JWT authentication
│   ├── routes.py                # REST API endpoints
│   ├── websocket.py             # WebSocket handler
│   ├── database.py              # DB connections
│   ├── models.py                # Pydantic models
│   ├── device_config.py         # Device profiles
│   └── public_api.py            # Public API (no auth)
├── http_to_kafka/               # HTTP to Kafka bridge
│   └── http_to_kafka.py
├── mqtt_auth_sync/              # MQTT authentication sync
│   └── sync_credentials.py
├── mqtt_to_kafka/               # MQTT to Kafka bridge
│   ├── mqtt_to_kafka.py
│   └── profile_transformer.py
├── react_dashboard/             # Web dashboard
│   └── src/
│       ├── components/
│       │   ├── Dashboard.js
│       │   ├── DeviceList.js
│       │   ├── DashboardBuilder/
│       │   ├── UserManagement.js
│       │   ├── ClassManagement.js
│       │   └── RulesManagement.js
│       └── services.js
├── rule_engine/                 # Rule automation engine
│   ├── rule_engine.py
│   └── alarm_service.py
├── scripts/                     # Utility scripts
│   ├── setup_mongodb_ttl.py
│   ├── cleanup_mysql_old_data.py
│   └── test-scheduled-rules.ps1
├── spark_jobs/                  # Spark streaming jobs
│   └── process_events.py
├── migrations/                  # Database migrations
├── data.sql                     # Initial data
└── docker-compose.yml           # Docker orchestration
```

## 🔐 Bảo mật

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

## 📊 Database Schema

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

## 🔄 Data Flow

1. **Device → MQTT Broker**: Thiết bị gửi dữ liệu qua MQTT
2. **MQTT → Kafka**: `mqtt_to_kafka` đọc MQTT và publish vào Kafka topic
3. **Kafka → Spark**: Spark Streaming đọc từ Kafka và xử lý
4. **Spark → Databases**: Ghi vào MongoDB (raw data) và MySQL (aggregated)
5. **Backend → WebSocket**: FastAPI đọc DB và push qua WebSocket
6. **WebSocket → Frontend**: React nhận real-time updates

## 🛠️ Development

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

## 🧪 Testing

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

## 🐛 Troubleshooting

### Service không khởi động

```bash
# Check logs
docker-compose logs service-name

# Restart service
docker-compose restart service-name

# Rebuild if needed
docker-compose build --no-cache service-name
docker-compose up -d service-name
```

### Kafka connection issues

```bash
# Check Kafka is running
docker-compose ps kafka

# Check Kafka topics
docker exec -it kafka kafka-topics.sh --list --bootstrap-server localhost:9092

# Check consumer lag
docker exec -it kafka kafka-consumer-groups.sh \
  --bootstrap-server localhost:9092 --describe --group spark-streaming
```

### Database connection issues

```bash
# Check MySQL
docker exec -it mysql mysqladmin -u iot -piot123 ping

# Check MongoDB
docker exec -it mongodb mongosh --eval "db.adminCommand('ping')"
```

### MQTT authentication failed

1. Kiểm tra credentials trong `mqtt_auth_sync/sync_credentials.py`
2. Restart MQTT broker: `docker-compose restart mqtt-broker`
3. Check logs: `docker-compose logs mqtt-broker`

### Rule engine không hoạt động

1. Check rule engine logs: `docker-compose logs rule-engine`
2. Verify INTERNAL_API_KEY trong docker-compose.yml
3. Check rule status trong database: `SELECT * FROM quy_tac WHERE kich_hoat = 1`

## 📈 Performance Tuning

### Kafka

```yaml
# docker-compose.yml
environment:
  KAFKA_NUM_PARTITIONS: 3
  KAFKA_DEFAULT_REPLICATION_FACTOR: 1
  KAFKA_LOG_RETENTION_HOURS: 24
```

### Spark

```yaml
# docker-compose.yml
environment:
  SPARK_DRIVER_MEMORY: 2g
  SPARK_EXECUTOR_MEMORY: 2g
```

### MongoDB

```javascript
// Create indexes
db.events.createIndex({ device_id: 1, timestamp: -1 })
db.events.createIndex({ timestamp: 1 }, { expireAfterSeconds: 2592000 })
```

### MySQL

```sql
-- Add indexes
CREATE INDEX idx_device_timestamp ON events(device_id, timestamp);
CREATE INDEX idx_user_devices ON thiet_bi(nguoi_dung_id);
```

## 🚀 Production Deployment

### 1. Security Checklist

- [ ] Đổi JWT_SECRET thành giá trị ngẫu nhiên mạnh
- [ ] Đổi INTERNAL_API_KEY
- [ ] Đổi mật khẩu database (MySQL, MongoDB)
- [ ] Đổi mật khẩu MQTT broker
- [ ] Đổi mật khẩu admin mặc định
- [ ] Enable HTTPS với SSL certificate
- [ ] Enable MQTT over TLS
- [ ] Cấu hình firewall rules
- [ ] Enable rate limiting
- [ ] Backup database định kỳ

### 2. Environment Variables

Tạo file `.env.production`:

```env
# Backend
JWT_SECRET=<random-256-bit-key>
INTERNAL_API_KEY=<random-key>

# Database
MYSQL_ROOT_PASSWORD=<strong-password>
MYSQL_PASSWORD=<strong-password>
MONGO_INITDB_ROOT_PASSWORD=<strong-password>

# MQTT
MQTT_USERNAME=<username>
MQTT_PASSWORD=<strong-password>

# Alerting
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=<email>
SMTP_PASSWORD=<app-password>
TELEGRAM_BOT_TOKEN=<token>
ZALO_ACCESS_TOKEN=<token>
```

### 3. Docker Compose Production

```bash
# Use production compose file
docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

### 4. Monitoring

Khuyến nghị sử dụng:
- **Prometheus**: Metrics collection
- **Grafana**: Visualization
- **ELK Stack**: Log aggregation
- **Uptime Kuma**: Service monitoring

### 5. Backup Strategy

**Database Backup:**
```bash
# MySQL
docker exec mysql mysqldump -u iot -piot123 iot_data > backup_$(date +%Y%m%d).sql

# MongoDB
docker exec mongodb mongodump --db iot --out /backup/$(date +%Y%m%d)
```

**Automated Backup:**
```bash
# Add to crontab
0 2 * * * /path/to/backup_script.sh
```

## 📚 API Documentation

Sau khi khởi động hệ thống, truy cập:
- **Swagger UI**: http://localhost:8000/docs
- **ReDoc**: http://localhost:8000/redoc

### Key Endpoints

**Authentication:**
- `POST /login` - Đăng nhập
- `POST /register` - Đăng ký (nếu enabled)
- `POST /users/{user_id}/impersonate` - Impersonate login

**Devices:**
- `GET /devices` - Danh sách thiết bị
- `GET /devices/{device_id}` - Chi tiết thiết bị
- `POST /devices/{device_id}/control-relay` - Điều khiển relay
- `GET /devices/{device_id}/latest` - Dữ liệu mới nhất

**Rules:**
- `GET /rules` - Danh sách quy tắc
- `POST /rules` - Tạo quy tắc mới
- `PUT /rules/{rule_id}` - Cập nhật quy tắc
- `DELETE /rules/{rule_id}` - Xóa quy tắc

**Dashboards:**
- `GET /dashboards` - Danh sách dashboard
- `POST /dashboards` - Tạo dashboard mới
- `PUT /dashboards/{dashboard_id}` - Cập nhật dashboard

## 🤝 Contributing

Contributions are welcome! Please follow these steps:

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Commit your changes: `git commit -m 'Add amazing feature'`
4. Push to the branch: `git push origin feature/amazing-feature`
5. Open a Pull Request

## 📝 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 👥 Authors

- **Tram Gia Nguyen** - Initial work - [TramGiaNguyen](https://github.com/TramGiaNguyen)

## 🙏 Acknowledgments

- Trường Đại học Bình Dương
- Apache Kafka & Spark communities
- FastAPI & React communities
- All contributors and testers

## 📞 Support

Nếu bạn gặp vấn đề hoặc có câu hỏi:

1. Kiểm tra [Troubleshooting](#-troubleshooting) section
2. Xem [API Documentation](#-api-documentation)
3. Tạo [GitHub Issue](https://github.com/TramGiaNguyen/IoT-Platform/issues)
4. Email: 22050026@student.bdu.edu.vn

## 🗺️ Roadmap

### Version 2.0 (Planned)
- [ ] Machine Learning integration cho predictive maintenance
- [ ] Multi-tenancy support
- [ ] Advanced analytics dashboard
- [ ] Mobile app push notifications
- [ ] Voice control integration (Google Assistant, Alexa)
- [ ] Blockchain integration cho data integrity
- [ ] Edge computing với TensorFlow Lite
- [ ] GraphQL API
- [ ] Kubernetes deployment support
- [ ] Multi-language support (English, Vietnamese)

### Version 1.1 (In Progress)
- [x] Impersonation login
- [x] Scheduled rules
- [x] Data cleanup (30 days TTL)
- [x] Mobile app (Flutter)
- [x] Edge control
- [x] Device profiles
- [x] Alarm system

## 📊 System Requirements

### Minimum
- CPU: 4 cores
- RAM: 8GB
- Disk: 20GB SSD
- Network: 100Mbps

### Recommended
- CPU: 8 cores
- RAM: 16GB
- Disk: 50GB SSD
- Network: 1Gbps

### Production
- CPU: 16+ cores
- RAM: 32GB+
- Disk: 100GB+ SSD (RAID 10)
- Network: 10Gbps
- Load Balancer
- Database replication
- Redis cache

---

**Made with ❤️ by Tram Gia Nguyen**
