# HTTP-to-Kafka Service

Service nhận HTTP data từ IoT devices và publish vào Kafka topic `iot-events`.

## Mục đích

- Hỗ trợ các thiết bị IoT gửi data qua HTTP thay vì MQTT
- Đảm bảo data từ HTTP cũng đi qua pipeline: Kafka → Spark → MongoDB + MySQL
- Tương tự như MQTT-to-Kafka nhưng cho HTTP protocol

## API Endpoints

### POST /ingest

Nhận data từ device và publish vào Kafka.

**Request:**
```json
{
  "device_id": "gateway-7069a6a6",
  "temperature": 28,
  "humidity": 65,
  "soil_moisture": 100,
  "relay_1_pump": "OFF",
  "relay_2_light": "ON",
  "timestamp": 1234567890  // optional, auto-generated if missing
}
```

**Response:**
```json
{
  "status": "ok",
  "message": "Data published to Kafka",
  "device_id": "gateway-7069a6a6",
  "timestamp": 1234567890
}
```

### GET /health

Health check endpoint.

**Response:**
```json
{
  "status": "ok",
  "service": "http-to-kafka"
}
```

## Cấu hình Device

Device cần gửi HTTP POST request đến:
```
http://<platform-ip>:5000/ingest
```

Với header:
```
Content-Type: application/json
```

## Environment Variables

- `KAFKA_BROKER`: Kafka bootstrap server (default: `kafka:9092`)
- `KAFKA_TOPIC`: Kafka topic name (default: `iot-events`)

## Docker

Build và chạy:
```bash
docker-compose up -d http-to-kafka
```

Xem logs:
```bash
docker logs http_to_kafka -f
```

## Luồng Data

```
Device (HTTP) → HTTP-to-Kafka (port 5000) → Kafka → Spark → MongoDB + MySQL → Dashboard
```

## Testing

Test với curl:
```bash
curl -X POST http://localhost:5000/ingest \
  -H "Content-Type: application/json" \
  -d '{
    "device_id": "test-device",
    "temperature": 25,
    "humidity": 60
  }'
```

## Notes

- Service tự động thêm timestamp nếu payload không có
- Tất cả data sẽ được ghi vào MongoDB và MySQL qua Spark processor
- Widgets sẽ query từ MongoDB để hiển thị data
