# 07. Lỗi thường gặp và Phụ lục

Phần này tổng hợp các lỗi thường gặp và mẫu cấu hình MQTT/HTTP để tham khảo.

---

## 6. Lỗi thường gặp và cách xử lý

| Hiện tượng | Nguyên nhân có thể | Cách xử lý đề xuất |
|------------|--------------------|--------------------|
| Thiết bị vẫn **Offline** | ESP32 chưa kết nối Wi-Fi, sai MQTT host/port, sai Device ID/Secret Key hoặc mạng chặn kết nối. | Kiểm tra Serial Monitor, xác nhận Wi-Fi 2.4 GHz, kiểm tra lại thông tin config từ Platform. |
| Dashboard **không có dữ liệu** | Thiết bị publish sai Topic Data, payload không đúng định dạng hoặc chưa có dữ liệu cảm biến. | Đối chiếu Topic Data trong config, kiểm tra JSON gửi lên và log gửi dữ liệu. |
| **Không điều khiển được** relay | Chưa tạo đường điều khiển, firmware chưa xử lý command hoặc sai chân GPIO. | Kiểm tra số đường điều khiển, tên command, mapping relay và trạng thái HIGH/LOW của module relay. |
| **HTTP/Webhook LAN** không hoạt động | Sai IP thiết bị, thiết bị khác mạng LAN, port web server ESP32 chưa mở hoặc IP bị đổi. | Đặt IP tĩnh/DHCP reservation, kiểm tra cùng mạng, thử truy cập URL điều khiển từ trình duyệt. |
| MQTT nhưng vẫn cấu hình **Webhook LAN** | Nhầm giữa MQTT và HTTP. | Nếu chỉ gửi dữ liệu bằng MQTT, có thể bỏ qua Webhook LAN. Chỉ cấu hình khi cần HTTP điều khiển qua LAN. |
| Tạo thiết bị ở Nhóm nhưng **thành viên khác không thấy** | Tài khoản thành viên chưa thuộc nhóm hoặc đang xem nhầm tab Cá nhân. | Kiểm tra membership nhóm, quyền truy cập và đảm bảo thiết bị được tạo/gán trong workspace Nhóm. |

---

## 7. Phụ lục: mẫu cấu hình MQTT và HTTP

### 7.1. Mẫu luồng MQTT

- ESP32 kết nối Wi-Fi 2.4 GHz.
- ESP32 kết nối MQTT Broker bằng thông tin do Platform cung cấp.
- ESP32 publish dữ liệu cảm biến lên Topic Data.
- Platform nhận dữ liệu, cập nhật Dashboard, rule và cảnh báo nếu có.

```
ESP32  --publish Topic Data-->  MQTT Broker  --xu ly du lieu-->  IoT Platform BDU  --hien thi & dieu khien-->  Dashboard / Rule / Cảnh báo
```

### 7.2. Mẫu luồng HTTP/Webhook LAN

- ESP32 mở web server nội bộ, ví dụ port 80.
- Platform lưu địa chỉ Webhook LAN của ESP32 hoặc gateway.
- Khi người dùng bấm điều khiển, Platform gửi HTTP request đến thiết bị.
- ESP32 xử lý payload điều khiển và cập nhật trạng thái relay/công tắc.

```
Nguoi dung bam dieu khien  --POST/GET command-->  IoT Platform BDU  --xu ly lenh-->  HTTP/Webhook LAN  --phan hoi trang thai-->  ESP32/Relay
```

Tiếp theo: [08. Checklist bàn giao](./08-checklist.md)