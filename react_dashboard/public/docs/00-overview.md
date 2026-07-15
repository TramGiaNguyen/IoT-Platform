# 00. Tổng quan và chuẩn bị

Tài liệu này hướng dẫn sử dụng **IoT Platform BDU** — hệ thống giúp người dùng thiết lập workplace, tạo thiết bị, cấu hình giao thức và kết nối ESP32 để gửi dữ liệu lên dashboard.

## Thông tin tài liệu

| Mục | Nội dung |
|-----|----------|
| Phiên bản | 1.0 |
| Đối tượng | Sinh viên, giảng viên, kỹ thuật viên triển khai thiết bị IoT |
| Phạm vi | Thao tác trên Platform và cấu hình cơ bản cho ESP32 |
| Trạng thái | Bản biên soạn chuyên nghiệp |

> **Mục tiêu tài liệu**: Giúp người dùng thao tác đúng quy trình — chọn workspace phù hợp, tạo phòng, tạo thiết bị, lưu thông tin kết nối, cấu hình đường điều khiển và kiểm tra dữ liệu từ ESP32.

---

## 1. Tổng quan và khái niệm cần biết

IoT Platform BDU là hệ thống dùng để quản lý thiết bị IoT, theo dõi dữ liệu cảm biến, cấu hình cảnh báo, quản lý phòng/nhóm và thực hiện điều khiển thiết bị thông qua các giao thức như **MQTT** hoặc **HTTP**.

### Phân biệt workspace Cá nhân và Nhóm

- **Tab Cá nhân**: dùng để quản lý thiết bị riêng của từng người dùng.
- **Tab Nhóm**: workspace làm việc chung; các thành viên trong cùng nhóm có thể truy cập và phối hợp quản lý thiết bị được gán vào nhóm.

### Khái niệm

| Khái niệm | Ý nghĩa sử dụng |
|-----------|-----------------|
| **Phòng** | Khu vực hoặc nhóm logic dùng để gom và quản lý thiết bị. |
| **Thiết bị** | Đối tượng IoT được tạo trên Platform, ví dụ ESP32 gateway, cảm biến hoặc bộ điều khiển relay. |
| **Device ID** | Mã định danh duy nhất của thiết bị; cần đưa vào firmware hoặc cấu hình phần cứng. |
| **Secret Key** | Khóa xác thực để thiết bị gửi dữ liệu lên Platform; không chia sẻ công khai. |
| **Topic Data** | Đường topic MQTT dùng để thiết bị publish dữ liệu cảm biến lên Platform. |
| **Đường điều khiển** | Kênh điều khiển tương ứng với relay/công tắc trên board mạch. |
| **Webhook LAN** | Cấu hình dùng cho thiết bị HTTP khi Platform cần gọi trực tiếp vào địa chỉ LAN của thiết bị. |

---

## 2. Chuẩn bị trước khi cấu hình

Trước khi bắt đầu, hãy đảm bảo đã chuẩn bị đầy đủ:

- Tài khoản đăng nhập IoT Platform BDU đã được cấp quyền phù hợp.
- Xác định trước sẽ thao tác trong workspace **Cá nhân** hay **Nhóm**.
- Thiết bị phần cứng đã sẵn sàng, ví dụ ESP32, cảm biến, relay hoặc gateway.
- Máy tính đã cài **Arduino IDE** hoặc trình biên dịch phù hợp với board mạch.
- Wi-Fi sử dụng cho ESP32 phải là Wi-Fi **2.4 GHz**; ESP32 thông thường không kết nối được Wi-Fi 5 GHz.
- Nếu dùng HTTP/Webhook LAN, nên chuẩn bị **IP tĩnh** hoặc **DHCP reservation** để Platform gọi đúng địa chỉ thiết bị.

### Quy trình tổng quát

```
Chọn workspace   →   Tạo phòng   →   Tạo thiết bị   →   Lưu credentials   →   Cấu hình ESP32   →   Kiểm thử dữ liệu   →   Vận hành
```

Tiếp theo: [01. Workspace & Phòng](./01-workspace-and-rooms.md)