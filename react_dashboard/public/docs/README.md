# Tài liệu hướng dẫn sử dụng BDU IoT Platform

Chào mừng bạn đến với tài liệu hướng dẫn sử dụng **BDU IoT Platform** — nền tảng quản lý và giám sát thiết bị IoT (cảm biến, bộ điều khiển, gateway, camera) qua giao thức MQTT, HTTP và CoAP.

> Tài liệu này dành cho **người dùng cuối** (user) sử dụng sản phẩm, không dành cho lập trình viên phát triển hệ thống.

---

## Mục lục

| # | Tài liệu | Mô tả |
|---|----------|-------|
| 1 | [Bắt đầu nhanh](./01-getting-started.md) | Đăng nhập, khám phá giao diện |
| 2 | [**Thiết bị & ESP32** (trung tâm)](./02-devices-and-esp32.md) | Khái niệm + khai báo thiết bị trên IoT_Platform + cấu hình & lập trình ESP32 + điều khiển thiết bị |
| 3 | [Nâng cao & Xử lý sự cố](./03-advanced.md) | Dashboard tuỳ biến, cảnh báo & luật, người dùng & phân quyền, FAQ + endpoint reference |

> **Trọng tâm của nền tảng là file `02-devices-and-esp32.md`** — đọc file này là đủ cho hầu hết tác vụ (khai báo thiết bị, nạp firmware ESP32, gửi/nhận dữ liệu, điều khiển relay).

---

## Yêu cầu hệ thống tối thiểu

- **Trình duyệt**: Chrome 100+, Edge 100+, Firefox 100+.
- **Kết nối mạng**: Wi-Fi hoặc Ethernet để truy cập dashboard.
- **Đối với thiết bị ESP32**: Arduino IDE 2.x hoặc PlatformIO, framework Arduino.

---

## Kiến trúc tổng quan (sơ lược)

```
+-----------------------+        +----------------------------+
|   Dashboard Web       | <----> |   Backend FastAPI (Python) |
|   (React, cổng 3000)  |  HTTP  |       (cổng 8000)         |
+-----------------------+   WS   +-------------+--------------+
                                               |
        +---------------------------------------+-----------------------------------+
        |                                       |                                   |
+-------+------+      +--------------+ +--------v-----+      +-------+-------+ +------v------+
|   MySQL      |      |  Kafka       | |  Redis       |      |  MongoDB      | |  AI Analyst |
|  (cổng 3308) |      | (iot-events) | | (6379)       |      |  (27017)      | |  (YOLO,8101)|
|  dữ liệu    |      |  event log   | | cache + pubsub|     | logs/camera   | |  camera AI  |
|  chính       |      |              | |              |      |               | |             |
+--------------+      +-------^------+ +--------------+      +--------------+ +-------------+
                             |
+----------------+   +------+-------+    +-----------------+
|   Mosquitto    |   |  mqtt_to_    |    |  http_to_kafka  |
|   (1883, 9001) |<--+ kafka bridge |    |    (cổng 5000)  |
|   MQTT broker  |   |              |    |                 |
+-------+--------+   +--------------+    +--------+--------+
        ^                                        |
        |  publish                               | HTTP /api/v1/ingest
+-------+-------+                         +-------+--------+
|   ESP32 / IoT |                         |  ESP32 / IoT   |
+---------------+                         +----------------+
                                                  (HTTP fallback)
```

**Các thành phần chính**:

| Thành phần | Vai trò |
|------------|---------|
| **MySQL** | Trạng thái tĩnh: người dùng, lớp học, nhóm, phòng, thiết bị, luật, cảnh báo |
| **MongoDB** | Log sự kiện, dữ liệu camera |
| **Kafka** | Bus sự kiện `iot-events`, event log để replay / audit |
| **Redis** | Cache + Pub/Sub cho WebSocket realtime |
| **Mosquitto** | MQTT broker — kênh giao tiếp chính ESP32 ↔ backend |
| **Spark** | Batch thống kê (nhiệt độ / độ ẩm theo giờ / ngày) |
| **AI Analyst** | Phân tích camera AI (YOLO, đếm người, occupancy) |
| **Grafana** (cổng 3001) | Dashboard giám sát hệ thống (cho admin) |

---

## Nhận hỗ trợ

Nếu gặp sự cố chưa có trong tài liệu, liên hệ đội ngũ quản trị qua kênh nội bộ (giáo viên / admin).
