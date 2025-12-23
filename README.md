# Nền tảng IoT Bình Dương

Hệ thống IoT toàn diện phục vụ giám sát, thu thập, xử lý và hiển thị dữ liệu thiết bị tại Trường Đại học Bình Dương. Bao gồm MQTT, Kafka, FastAPI, MongoDB, MySQL, Spark, Grafana, React, Docker Compose.

---

## Nền tảng IoT Bình Dương – Giai đoạn 1 (Hướng dẫn triển khai đầy đủ)

Dự án này cung cấp một hệ thống IoT toàn diện từ thiết bị → MQTT → Kafka → MongoDB/MySQL → FastAPI → React Dashboard → Spark Streaming.

---

## Kiến trúc tổng thể

1. **ESP32 / Trình giả lập** → MQTT (Mosquitto)
2. MQTT → Kafka (qua `mqtt_to_kafka.py`)
3. Kafka → Spark Streaming → MongoDB + MySQL
4. FastAPI cung cấp REST + WebSocket
5. Dashboard React giao diện người dùng
6. Grafana (dành cho biểu đồ thời gian thực trong tương lai)

---

## Yêu cầu hệ thống

* Docker & Docker Compose
* Node.js (tùy chọn nếu muốn phát triển React frontend cục bộ)

---

## Các bước triển khai chi tiết

### Bước 1. Tải mã nguồn và dựng các container:

```bash
cd BinhDuong-IoT-Platform
sudo docker-compose up --build -d
```

### Bước 2. Mô phỏng thiết bị IoT (hoặc dùng ESP32 thật):

```bash
cd simulator
python device_simulator.py
```

### Bước 3. Truy cập các dịch vụ:

| Dịch vụ         | Địa chỉ URL                                    |
| --------------- | ---------------------------------------------- |
| FastAPI API     | [http://localhost:8000](http://localhost:8000) |
| Giao diện React | [http://localhost:3000](http://localhost:3000) |
| MongoDB         | localhost:27017                                |
| MySQL           | localhost:3306 (user: iot)                     |
| Grafana         | [http://localhost:3001](http://localhost:3001) |
| MQTT Broker     | localhost:1883                                 |
| Kafka           | localhost:9092                                 |

---

## 📡 Định dạng dữ liệu MQTT

**Topic:**

```
iot/devices/{device_id}/data
```

**Payload:**

```json
{
  "device_id": "sensor-bdu-001",
  "temperature": 26.5,
  "humidity": 55.2,
  "timestamp": 1721989259
}
```

---

## Xử lý dữ liệu với Spark Streaming

* File: `spark_jobs/process_events.py`
* Đọc dữ liệu từ Kafka topic `iot-events`
* Ghi dữ liệu vào MongoDB (`iot.events`) và MySQL (`events` table)

---

## Cấu trúc cơ sở dữ liệu

### MySQL: CSDL `iot_data`

```sql
CREATE TABLE events (
  id INT AUTO_INCREMENT PRIMARY KEY,
  device_id VARCHAR(255),
  temperature FLOAT,
  humidity FLOAT,
  timestamp BIGINT
);
```

---

## Cấu trúc thư mục dự án

```
BinhDuong-IoT-Platform/
├── fastapi_backend/               # Backend (REST API + WebSocket + JWT)
│   ├── main.py                    # Điểm khởi động chính
│   ├── auth.py                    # Xác thực JWT
│   ├── database.py                # Kết nối MongoDB + MySQL
│   ├── models.py                  # Pydantic schemas
│   ├── routes.py                  # Các route REST API
│   ├── websocket.py               # WebSocket gửi dữ liệu thời gian thực
│   ├── requirements.txt
│   └── .env

├── frontend/                      # Giao diện người dùng React
│   ├── public/
│   └── src/
│       ├── App.js
│       ├── index.js
│       ├── components/
│       │   ├── Dashboard.js
│       │   ├── DeviceList.js
│       │   └── Login.js
│       ├── services/
│       │   └── service.js
│       ├── styles/
│       │   └── style.css
│       └── package.json

├── mqtt_to_kafka/                # Cầu nối MQTT → Kafka
│   ├── mqtt_to_kafka.py
│   ├── config.json
│   ├── requirements.txt
│   └── Dockerfile

├── spark_jobs/                   # Spark xử lý streaming
│   ├── process_events.py
│   └── Dockerfile

├── grafana/                      # Cấu hình Grafana
│   ├── dashboards/
│   │   └── mqtt_mongo_dashboard.json
│   └── provisioning/
│       ├── datasources/
│       │   └── mongodb.yml
│       └── dashboards/
│           └── default.yaml

├── mqtt_server/                  # Máy chủ MQTT độc lập
│   ├── docker-compose.yml
│   └── mosquitto.conf

├── simulator/                    # Mô phỏng thiết bị gửi dữ liệu
│   ├── device_simulator.py
│   ├── requirements.txt
│   ├── Dockerfile
│   └── docker-compose.yml

├── docker-compose.yml            # Docker Compose cho hệ thống chính
├── README.md
```

---

## 7. Lưu ý triển khai thực tế

* MQTT broker và thiết bị mô phỏng có thể đặt tại máy chủ biên (edge server) độc lập
* Thiết lập `.env`, khóa JWT\_SECRET và thông tin DB phù hợp cho môi trường production
* Spark job có thể mở rộng bằng YARN hoặc Kubernetes trong hệ thống lớn
* Biểu đồ Grafana tùy chỉnh phù hợp với từng loại cảm biến và yêu cầu giám sát

