# Mobile App - Rules Feature Integration

## Tổng quan

Đã tích hợp đầy đủ tính năng Rule Engine vào mobile app, cho phép người dùng tạo và quản lý:
- **Conditional Rules**: Tự động điều khiển dựa trên điều kiện cảm biến
- **Scheduled Rules**: Tự động điều khiển theo lịch trình

## Các thành phần đã tạo

### 1. Models
- `app_control/lib/models/rule.dart` - Model cho conditional rules
- `app_control/lib/models/scheduled_rule.dart` - Model cho scheduled rules

### 2. API Services
- Đã thêm 8 methods vào `api_service.dart`:
  - `getRules()` - Lấy danh sách conditional rules
  - `createRule()` - Tạo conditional rule mới
  - `updateRule()` - Cập nhật conditional rule
  - `deleteRule()` - Xóa conditional rule
  - `getScheduledRules()` - Lấy danh sách scheduled rules
  - `createScheduledRule()` - Tạo scheduled rule mới
  - `updateScheduledRule()` - Cập nhật scheduled rule
  - `deleteScheduledRule()` - Xóa scheduled rule

### 3. Backend Proxy Endpoints
Đã thêm vào `backend_app_control/main.py`:
- `GET /rules` - Lấy conditional rules
- `POST /rules` - Tạo conditional rule
- `PUT /rules/{rule_id}` - Cập nhật conditional rule
- `DELETE /rules/{rule_id}` - Xóa conditional rule
- `GET /scheduled-rules` - Lấy scheduled rules
- `POST /scheduled-rules` - Tạo scheduled rule
- `PUT /scheduled-rules/{rule_id}` - Cập nhật scheduled rule
- `DELETE /scheduled-rules/{rule_id}` - Xóa scheduled rule

### 4. UI Screens

- `rules_screen.dart` - Màn hình danh sách rules với 2 tabs
- `rule_form_screen.dart` - Form tạo/sửa conditional rule
- `scheduled_rule_form_screen.dart` - Form tạo/sửa scheduled rule

### 5. Widgets
- `rule_card.dart` - Card hiển thị conditional rule
- `scheduled_rule_card.dart` - Card hiển thị scheduled rule

## Tính năng

### Conditional Rules
Tự động điều khiển thiết bị khi điều kiện cảm biến được thỏa mãn.

**Ví dụ:**
- Nếu nhiệt độ > 30°C → Bật quạt (relay 1)
- Nếu độ ẩm < 40% → Bật máy phun sương (relay 2)

**Các trường hỗ trợ:**
- temperature (nhiệt độ)
- humidity (độ ẩm)
- voltage (điện áp)
- current (dòng điện)
- power (công suất)

**Toán tử:**
- `>` (lớn hơn)
- `<` (nhỏ hơn)
- `>=` (lớn hơn bằng)
- `<=` (nhỏ hơn bằng)
- `==` (bằng)
- `!=` (khác)

### Scheduled Rules
Tự động điều khiển thiết bị theo lịch trình cố định.

**Ví dụ:**
- Bật đèn lúc 6:00 sáng hàng ngày
- Tắt điều hòa lúc 18:00 thứ 2-6
- Bật máy bơm lúc 8:30 chủ nhật

**Cron Expression:**
Format: `minute hour day month weekday`
- `0 6 * * *` = Hàng ngày lúc 6:00
- `0 18 * * 1-5` = Thứ 2-6 lúc 18:00
- `30 8 * * 0` = Chủ nhật lúc 8:30

## Cách sử dụng

### Truy cập Rules
1. **Từ Room List**: Nhấn icon Rules (⚡) trên AppBar → Xem tất cả rules
2. **Từ Room Detail**: Nhấn icon Rules (⚡) trên AppBar → Xem rules của phòng đó

### Tạo Conditional Rule
1. Vào màn hình Rules → Tab "Điều kiện"
2. Nhấn nút "Tạo Rule"
3. Điền thông tin:
   - Tên rule
   - Device ID cảm biến
   - Điều kiện (field, operator, value)
   - Device ID điều khiển
   - Relay và trạng thái (ON/OFF)
   - Mức độ ưu tiên
4. Bật/tắt rule
5. Nhấn "Tạo Rule"

### Tạo Scheduled Rule
1. Vào màn hình Rules → Tab "Lịch trình"
2. Nhấn nút "Tạo Rule"
3. Điền thông tin:
   - Tên lịch trình
   - Chọn giờ thực hiện
   - Chọn hàng ngày hoặc ngày cụ thể
   - Device ID
   - Relay và trạng thái (ON/OFF)
4. Bật/tắt lịch trình
5. Nhấn "Tạo Lịch Trình"

### Quản lý Rules
- **Bật/Tắt**: Dùng switch trên card
- **Sửa**: Nhấn vào card
- **Xóa**: Nhấn icon xóa (🗑️)

## Kiến trúc

```
Mobile App (Flutter)
    ↓ HTTP/HTTPS
backend_app_control (FastAPI Proxy)
    ↓ HTTP/HTTPS + JWT
fastapi_backend (Main Backend)
    ↓ MySQL
Database (rules, scheduled_rules tables)
    ↓
rule_engine (Python Service)
    ↓ MQTT
Devices (ESP32, Gateway)
```

## Testing

### Test Conditional Rule
1. Tạo rule: "Nếu temperature > 25 → Bật relay 1"
2. Kiểm tra trong database: `SELECT * FROM rules;`
3. Gửi dữ liệu nhiệt độ > 25
4. Xem log rule engine: `docker-compose logs -f rule-engine`
5. Kiểm tra relay đã bật

### Test Scheduled Rule
1. Tạo rule: "Bật relay 1 lúc [giờ hiện tại + 2 phút]"
2. Kiểm tra database: `SELECT * FROM scheduled_rules;`
3. Đợi đến giờ đã đặt
4. Xem log rule engine
5. Kiểm tra relay đã bật

## Troubleshooting

### Rules không chạy
- Kiểm tra rule đã enabled chưa
- Kiểm tra device_id đúng chưa
- Xem log rule engine: `docker-compose logs -f rule-engine`
- Kiểm tra rule engine đang chạy: `docker-compose ps rule-engine`

### Scheduled rule không chạy đúng giờ
- Kiểm tra cron expression
- Kiểm tra timezone của server
- Xem last_run_at trong database

### Không tạo được rule từ app
- Kiểm tra token còn hạn không
- Kiểm tra backend_app_control đang chạy
- Xem log backend: `docker-compose logs -f backend-app-control`

## Files đã thay đổi

### Mobile App
- `app_control/lib/models/rule.dart` (NEW)
- `app_control/lib/models/scheduled_rule.dart` (NEW)
- `app_control/lib/services/api_service.dart` (MODIFIED)
- `app_control/lib/screens/rules_screen.dart` (NEW)
- `app_control/lib/screens/rule_form_screen.dart` (NEW)
- `app_control/lib/screens/scheduled_rule_form_screen.dart` (NEW)
- `app_control/lib/screens/room_detail_screen.dart` (MODIFIED)
- `app_control/lib/screens/room_list_screen.dart` (MODIFIED)
- `app_control/lib/widgets/rule_card.dart` (NEW)
- `app_control/lib/widgets/scheduled_rule_card.dart` (NEW)

### Backend
- `backend_app_control/main.py` (MODIFIED - added 8 endpoints)

## Next Steps

Các tính năng có thể mở rộng:
1. Rule với nhiều điều kiện (AND/OR logic)
2. Rule với nhiều actions
3. Notification khi rule được kích hoạt
4. Rule history/logs
5. Rule templates
6. Import/Export rules
7. Rule testing/simulation
