# 03. Nâng cao & Xử lý sự cố

Tài liệu này gồm 4 phần dành cho người đã nắm phần **setup thiết bị + ESP32** ở [02](./02-devices-and-esp32.md):

1. Dashboard tuỳ biến (widget, chia sẻ).
2. Cảnh báo & Luật tự động.
3. Quản lý người dùng & phân quyền.
4. Xử lý sự cố thường gặp.

---

## 1. Dashboard & Widget

Có hai dạng: **Dashboard Viewer** (xem danh sách thiết bị) và **Dashboard Builder** (kéo-thả widget tuỳ biến).

### 1.1 Dashboard Viewer (mặc định)

Vào menu **Dashboard** ở sidebar → thấy danh sách thiết bị trong workspace hiện tại. Nhấn vào **tên thiết bị** → chi tiết, gồm các tab:

| Tab | Nội dung |
|-----|---------|
| **Chi tiết** | Thuộc tính: tên, loại, phòng/nhóm, chủ sở hữu, IP, MAC, last seen, edge_control_url |
| **Dữ liệu** | Biểu đồ thời gian thực + log dữ liệu thô |
| **Cảnh báo** | Lịch sử cảnh báo của riêng thiết bị này |
| **Luật** | Luật dùng thiết bị làm đầu vào / đầu ra |
| **Điều khiển** | Bật/tắt, đặt setpoint (chỉ `controller`) |
| **Lịch sử lệnh** | Audit log: ai bấm gì, lúc nào, status `pending`/`sent`/`acked`/`failed` |

### 1.2 Dashboard Builder (tuỳ biến)

Vào menu **Quản lý Dashboard** → **+ Tạo Dashboard** → điền:

| Trường | Mô tả |
|--------|-------|
| Tên dashboard | Bắt buộc, vd `Dashboard lớp IoT K18` |
| Icon | Vd `dashboard`, `monitoring` |
| Màu | Mã hex (mặc định `#22d3ee`) |
| Phạm vi | Phòng cá nhân / Lớp học / Nhóm |

Widget có sẵn:

| Widget | Mục đích |
|--------|----------|
| Biểu đồ đường / cột | Vẽ 1 trường dữ liệu theo thời gian |
| Gauge | Hiển thị giá trị hiện tại với ngưỡng min/max |
| Bảng dữ liệu | Danh sách dữ liệu thô |
| Status badge | online/offline |
| Action button | Gửi lệnh xuống thiết bị |
| Text / Label | Ghi chú |

**Thêm widget**: kéo từ toolbar → thả vào canvas → nhấn đúp để cấu hình:

- Tiêu đề, Thiết bị nguồn, Trường dữ liệu (vd `temperature`).
- Loại biểu đồ, Khoảng thời gian (5 phút / 30 phút / 1 giờ / 24 giờ / tuần).
- Ngưỡng cảnh báo (tuỳ chọn).
- Vị trí: `vi_tri_x`, `vi_tri_y`, `chieu_rong`, `chieu_cao` (grid 12 cột).

**Khoá** widget bằng icon ổ khoá để chống chỉnh sửa nhầm. **Lưu** sau mỗi thay đổi.

### 1.3 Chia sẻ Dashboard

Bảng `dashboard_permissions`:

| Quyền | Ý nghĩa |
|-------|----------|
| `view` | Chỉ xem |
| `edit` | Xem + sửa widget |
| `owner` | Toàn quyền (gồm xoá dashboard) |

Phạm vi mặc định:
- `phong_id` → chủ sở hữu phòng + user được phân quyền.
- `nhom_id` → tất cả thành viên nhóm xem; trưởng nhóm có thể sửa.
- `lop_hoc_id` → tất cả sinh viên + GV trong lớp xem.

### 1.4 Tự động cập nhật

| Widget | Refresh |
|--------|---------|
| Gauge / Status | 5 giây |
| Biểu đồ | 15 giây – 1 phút (tuỳ range) |
| Bảng dữ liệu | 10 giây |

Ngoài ra, frontend subscribe WebSocket Redis Pub/Sub `ws:events` đẩy cập nhật **realtime** — không cần F5.

### 1.5 Responsive

- **Desktop / laptop**: đầy đủ, nhiều widget.
- **Tablet**: 2 cột.
- **Mobile**: 1 cột, cuộn dọc.

---

## 2. Cảnh báo (Alarms) & Luật (Rules)

### 2.1 Cảnh báo

Lưu ở bảng `canh_bao`. Mỗi cảnh báo có **mức độ** (`muc_do`) và **loại** (`loai`):

| Mức | Màu | Loại | Trạng thái |
|-----|-----|------|-----------|
| `low` 🟢 | xanh lá | `device_offline` (mất kết nối) | `new` (mới) |
| `medium` 🟡 | vàng | `threshold_exceeded` (vượt ngưỡng) | `acknowledged` (đã xem) |
| `high` 🟠 | cam | `rule_triggered` (rule kích hoạt) | `resolved` (đã xử lý) |
| `critical` 🔴 | đỏ | `system_error`, `emergency` | |

**Tạo cảnh báo**: menu **Quản báo** → **+ Tạo cảnh báo**:

| Trường | Mô tả / ví dụ |
|--------|---------------|
| Tên | `Nhiệt độ cao` |
| Thiết bị | Chọn thiết bị |
| Trường dữ liệu (`khoa`) | `temperature` |
| Điều kiện | `>` / `<` / `=` / `>=` / `<=` / `!=` |
| Ngưỡng | `> 35` |
| Mức | `low` / `medium` / `high` / `critical` |
| Kênh thông báo | Xem mục 2.3 |

**Xem**: menu **Quản báo**, bộ lọc theo mức / thiết bị / trạng thái. Click cảnh báo → `acknowledged` hoặc `resolved`.

### 2.2 Luật tự động (Rules)

3 loại rule:

#### a) Luật điều kiện (`rules`)

```
IF (giá trị cảm biến so với ngưỡng) THEN (hành động)
```

- `condition_device_id`, `field` (vd `temperature`), `operator` (vd `>`), `value` (vd `35`).
- Điều kiện nâng cao: `conditions` JSON, `rule_graph` JSON (AND/OR phức tạp).
- Hành động (`rule_actions`): gửi lệnh controller / tạo cảnh báo / đóng cảnh báo.

#### b) Luật theo lịch (`scheduled_rules`) — cron

```
cron_expression: "0 22 * * *"    # 22h mỗi ngày
device_id: "esp32-lab1"
action_command: "off"
```

#### c) Rule offline tự động (rule_engine quét 10 phút/lần)

```
IF Thiết bị Gateway-1.last_seen < NOW() - 10 phút
THEN Tạo canh_bao device_offline, muc_do=critical
```

#### Tạo rule điều kiện

Menu **Quản lý rule** → **+ Tạo rule**:

| Bước | Nội dung |
|------|----------|
| Tên rule, mô tả | (tuỳ chọn) |
| Điều kiện | Thiết bị + Trường + So sánh + Ngưỡng + Mức ưu tiên |
| Hành động | Thiết bị + Lệnh + Delay (nhiều hành động, có delay giữa) |
| Bật / tắt | `enabled` / `disabled` |

**Ví dụ**:

| Rule | Cấu hình |
|------|----------|
| Bật quạt khi nóng | IF Cảm biến nhiệt Lab1.temperature > 35 THEN Quạt phòng Lab1 → on |
| Tắt đèn 22h | cron `0 22 * * *` → Đèn phòng Lab1 → off |
| Cảnh báo offline | rule_engine tự động (không cần tạo) |
| Đóng cảnh báo khi bình thường | IF temperature < 30 THEN close alarm "Nhiệt độ cao" |

`rules.muc_do_uu_tien` cho phép cấu hình **cooldown** để tránh spam.

### 2.3 Kênh thông báo cảnh báo

| Kênh (`loai`) | Mô tả | `external_id` |
|---------------|-------|---------------|
| `telegram` | Telegram bot | `chat_id` |
| `email` | SMTP | Địa chỉ email |
| `zalo` | Zalo OA | `user_id` Zalo |

Cấu hình ở **Cài đặt → Kênh thông báo** (admin). Cần set env:

```
TELEGRAM_BOT_TOKEN, ZALO_ACCESS_TOKEN
SMTP_SERVER, SMTP_PORT, SMTP_USER, SMTP_PASSWORD
```

> Cảnh báo mức `low` có thể chỉ hiển thị trên dashboard, không gửi kênh ngoài.

### 2.4 Webhook (tuỳ chọn)

Ngoài 3 kênh trên có thể cấu hình webhook HTTP (Slack, Discord, Google Sheets…). Liên hệ admin.

---

## 3. Quản lý tài khoản & Người dùng

### 3.1 Vai trò

| Vai trò | Quyền |
|---------|-------|
| **admin** | Toàn quyền: CRUD user, lớp, nhóm, phòng, thiết bị, dashboard, cấu hình hệ thống. Thấy menu **Quản lý người dùng**. |
| **teacher** | Quản lý lớp & nhóm mình phụ trách. CRUD thiết bị trong phạm vi. Thấy **Quản lý lớp học**. Không thấy **Quản lý người dùng toàn hệ thống**. |
| **student** | Xem & điều khiển thiết bị trong nhóm tham gia. Chỉ xem thiết bị cá nhân. Thấy workspace **Nhóm** khi thuộc ≥ 1 nhóm. |

### 3.2 Tạo tài khoản

**Admin tạo (mặc định)**:
- Menu **Quản lý người dùng** → **+ Thêm người dùng**.
- Điền email, họ tên, vai trò (`admin` / `teacher` / `student`).
- Mật khẩu mặc định được cấp → user nên đổi sau lần đầu.

**Tự đăng ký** (mặc định tắt):
- Trang login → **Đăng ký** → tài khoản mặc định `student`, admin nâng cấp role sau.

### 3.3 Mời thành viên vào nhóm

**Quản lý lớp học** → chọn lớp → nhóm → tab **Thành viên**:

1. Gõ email hoặc tên sinh viên.
2. Chọn user (chỉ user thuộc lớp).
3. Vai trò: `sinh_vien` / `giao_vien`.
4. **Thêm**.

User mới sẽ thấy workspace **Nhóm** và thiết bị thuộc nhóm.

### 3.4 Ma trận phân quyền chi tiết

| Hành động | Admin | Teacher | Student |
|-----------|:-----:|:-------:|:-------:|
| CRUD người dùng toàn hệ thống | ✓ | ✗ | ✗ |
| CRUD lớp học | ✓ | ✓ (lớp mình) | ✗ |
| CRUD nhóm | ✓ | ✓ (lớp mình) | ✗ |
| CRUD phòng cá nhân | ✓ | ✓ | ✓ (phòng mình) |
| Khai báo thiết bị | ✓ | ✓ | ✓ |
| Xem thiết bị cá nhân người khác | ✓ | ✗ | ✗ |
| Xem thiết bị nhóm mình | ✓ | ✓ | ✓ |
| Tạo rule | ✓ | ✓ | ✗ |
| Tạo cảnh báo | ✓ | ✓ | ✓ (trong phạm vi) |
| Điều khiển thiết bị | ✓ | ✓ | ✓ (được phân quyền) |
| Cấu hình hệ thống (SMTP, MQTT…) | ✓ | ✗ | ✗ |

Chi tiết xem `fastapi_backend/permissions.py`.

### 3.5 Đổi mật khẩu & Khôi phục

- **Đổi**: tên user (góc trên phải) → **Đổi mật khẩu**. Tối thiểu **6 ký tự**.
- **Quên**: trang login → **Quên mật khẩu** → email nhận link (hạn 1 giờ). Không nhận được (SMTP chưa cấu hình) → liên hệ admin.

### 3.6 Xoá tài khoản

Admin: **Quản lý người dùng** → tìm user → **Xoá**:

- User không đăng nhập được nữa.
- Lịch sử điều khiển / cảnh báo **giữ lại** để audit.
- Thiết bị `nguoi_so_huu_id = user.id` chuyển sang admin hoặc chỉ định lại trước khi xoá.
- `nhom_thanh_vien` của user bị xoá (`ON DELETE CASCADE`).

### 3.7 Idle timeout

Frontend có `ActivityTracker` tự logout khi không có hoạt động. Di chuột / gõ phím thường xuyên để tránh bị logout.

---

## 4. Xử lý sự cố thường gặp

### 4.1 Thiết bị hiển thị **offline**

ESP32 đã kết nối nhưng hiện không online (rule_engine quét 10 phút/lần).

| Kiểm tra | Cách xử lý |
|----------|------------|
| ESP32 còn nguồn? | Đèn power LED? Pin yếu? |
| Wi-Fi còn kết nối? | Serial Monitor → `WiFi: lost connection`? |
| MQTT broker chạy? | `docker ps` xem container `mqtt`. |
| MQTT credentials đúng? | Serial: `rc=-2` (sai user/pass), `rc=5` (not authorized) |
| Last seen bao lâu? | Nếu > 10 phút → ESP32 ngừng gửi. |

**Checklist sửa**:

- [ ] Khởi động lại ESP32 (cắt nguồn hoặc RESET).
- [ ] Serial Monitor có `MQTT connecting...ok`?
- [ ] Sai `not authorized` → admin chạy `scripts/sync-mqtt-credentials.ps1`.
- [ ] Code có `mqtt.publish(TOPIC_DATA, ...)` trong `loop()`?

### 4.2 Thiết bị hiển thị **error**

Có kết nối nhưng dữ liệu không hợp lệ. Nguyên nhân thường gặp:

- JSON payload lỗi (thiếu `}`, ký tự đặc biệt không escape).
- HTTP ingest thiếu `device_id`.
- Controller không subscribe control topic.

**Cách sửa**: xem log chi tiết trong **chi tiết thiết bị → Lịch sử lệnh / Dữ liệu**, tìm dòng `error / parse failed`.

Thêm check phía ESP32:

```cpp
DeserializationError err = deserializeJson(doc, buf);
if (err) {
  Serial.print("Bad JSON: ");
  Serial.println(err.c_str());
  return;
}
```

### 4.3 Không đăng nhập được

| Nguyên nhân | Xử lý |
|------------|-------|
| Email không tồn tại | Kiểm tra chữ hoa/thường, typo |
| Mật khẩu sai | **Quên mật khẩu** |
| Tài khoản bị khoá | Admin xử lý qua **Quản lý người dùng** |

### 4.4 Không gửi được lệnh điều khiển

Khi bấm on/off mà thiết bị không phản hồi:

1. **Online?** Offline → lệnh queue (`pending`) → gửi khi online lại.
2. **Đúng `device_type = controller`?** `sensor` không điều khiển được.
3. **ESP32 subscribe control topic?** Serial Monitor sẽ thấy khi backend publish.
4. **Callback `onControl` xử lý đúng?** Test thử bằng `mosquitto_pub`:
   ```bash
   mosquitto_pub -h <broker> -u <ma_thiet_bi> -P <secret> \
     -t iot/devices/<ma_thiet_bi>/control \
     -m '{"state":"ON"}'
   ```

### 4.5 Dashboard cập nhật chậm

- Mỗi widget có interval riêng (5–60 giây) + WebSocket push realtime qua Redis `ws:events`.
- Nếu rất chậm (> 1 phút): kiểm tra container `kafka` + `kafka_event_consumer` còn `Up` không.

### 4.6 ESP32 HTTP bị **401 / 403**

| Lỗi | Nguyên nhân |
|-----|-------------|
| 401 Unauthorized | Sai `X-API-Key`, thiết bị chưa khai báo, hoặc `is_active = 0`. |
| 403 Forbidden | Thiết bị bị vô hiệu hoá. |

Kiểm tra: API key trong code trùng dashboard? Body có `device_id` đúng? Thiết bị đang `active`?

### 4.7 Không nhận cảnh báo qua email / Telegram / Zalo

- Admin kiểm tra **Cài đặt → Kênh thông báo** đã cấu hình.
- Kiểm tra env `SMTP_*`, `TELEGRAM_BOT_TOKEN`, `ZALO_ACCESS_TOKEN`.
- Kiểm tra spam/junk folder.
- Cảnh báo `low` có thể không gửi kênh ngoài.

### 4.8 Dashboard Builder lỗi / không lưu

- Chưa có quyền sửa dashboard (chỉ người tạo / trưởng nhóm / admin).
- Widget thiếu trường bắt buộc (quên chọn thiết bị).
- Thử F5 rồi lại.

### 4.9 Không xoá được thiết bị / phòng

- Còn **luật** tham chiếu → xoá luật trước.
- Còn **cảnh báo** mở → đóng cảnh báo trước.

### 4.10 Không thấy workspace switcher

- Tài khoản chưa được thêm vào nhóm nào (`nhom_thanh_vien`).
- Liên hệ giáo viên / admin.

---

## 5. Phụ lục — Endpoint hữu ích (tham khảo)

| Method + Path | Mô tả |
|---------------|-------|
| `POST /token` hoặc `POST /login` | Đăng nhập, trả JWT |
| `GET /auth/me` | Lấy thông tin user hiện tại |
| `GET /auth/me/groups` | Danh sách nhóm của user |
| `GET /devices` | Liệt kê thiết bị (lọc theo workspace) |
| `GET /devices/{id}/data?from=...&to=...` | Lấy dữ liệu lịch sử |
| `POST /devices/{id}/control` | Gửi lệnh điều khiển (cần JWT) |
| `POST /devices/{id}/control-relay` | Điều khiển relay đơn giản (cho mobile app) |
| `GET /devices/{id}/full-config` | Tải cấu hình đầy đủ cho ESP32 |
| `POST /devices/{id}/keys` / `GET /devices/{id}/keys` | Quản lý API key |
| `POST /api/v1/ingest` | ESP32 gửi HTTP (cần `X-API-Key`) |
| `GET /config/commands` | Liệt kê các lệnh điều khiển được hỗ trợ |
| `GET /config/device-topics/{device_id}` | Lấy 4 topic MQTT cho thiết bị |
| `GET /rooms` | Liệt kê phòng |

Backend expose **Swagger UI** tại `http://localhost:8000/docs`.

---

## 6. Khi không tự giải quyết được

1. Ghi nhận: thời điểm, loại thiết bị, `ma_thiet_bi`, Serial Monitor log, ảnh dashboard.
2. Liên hệ admin kèm thông tin trên.

---

Về [trang chủ](./README.md)
