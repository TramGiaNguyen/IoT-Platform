# Backend App Control - IoT Platform

Backend trung gian cho Flutter app điều khiển relay TTCDS.

## Tính năng

- Đăng nhập qua tài khoản IoT Platform
- Lấy trạng thái 3 relay (1, 2, 4)
- Điều khiển relay ON/OFF
- Lấy dữ liệu điện (voltage, current, power)

## API Endpoints

### 1. Login
```
POST /auth/login
Content-Type: application/json

{
  "username": "user@bdu.edu.vn",
  "password": "password"
}

Response:
{
  "access_token": "...",
  "token_type": "bearer",
  "user_info": {
    "username": "user@bdu.edu.vn",
    "role": "admin"
  }
}
```

### 2. Get Relay Status
```
GET /relay/status
Authorization: Bearer {token}

Response:
{
  "relay_1": "OFF",
  "relay_2": "ON",
  "relay_4": "OFF",
  "voltage": 227.5,
  "current": 0.16,
  "power": 21.9,
  "last_update": "2024-03-23T10:30:00"
}
```

### 3. Control Relay
```
POST /relay/control
Authorization: Bearer {token}
Content-Type: application/json

{
  "relay": 1,
  "state": "ON"
}

Response:
{
  "status": "success",
  "relay": 1,
  "state": "ON",
  "message": "Đã on relay 1"
}
```

## Development

```bash
# Install dependencies
pip install -r requirements.txt

# Run
uvicorn main:app --reload --port 8001
```

## Docker

```bash
# Build
docker build -t backend-app-control .

# Run
docker run -p 8001:8001 backend-app-control
```
