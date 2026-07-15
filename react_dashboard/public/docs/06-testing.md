# 06. Kiểm thử vận hành

Phần này hướng dẫn kiểm thử gửi dữ liệu và kiểm thử điều khiển thiết bị sau khi nạp firmware.

---

## 5.1. Kiểm thử gửi dữ liệu

1. Nạp chương trình vào ESP32 và mở **Serial Monitor**.
2. Kiểm tra thiết bị đã kết nối Wi-Fi thành công.
3. Kiểm tra thông báo kết nối **MQTT/HTTP** thành công.
4. Quan sát Dashboard để xác nhận thiết bị chuyển sang trạng thái **Online**.
5. Kiểm tra giá trị cảm biến hiển thị đúng trên card thiết bị hoặc trang chi tiết.

**Mẫu payload JSON gửi lên Platform**:

```json
{
  "temperature": 25.5,
  "humidity": 60,
  "relay": 1
}
```

---

## 5.2. Kiểm thử điều khiển

1. Đảm bảo đã tạo đúng số lượng **đường điều khiển** trên Platform.
2. Đảm bảo firmware ESP32 có xử lý lệnh điều khiển tương ứng.
3. Thao tác **bật/tắt relay** trên giao diện Platform.
4. Quan sát trạng thái **relay thực tế** trên board mạch.
5. Kiểm tra giá trị phản hồi hoặc log trên **Serial Monitor** để xác nhận lệnh đã được xử lý.

> **Nguyên tắc kiểm thử**: Luôn kiểm thử từng phần — Wi-Fi trước, kết nối Platform tiếp theo, gửi dữ liệu sau cùng mới kiểm thử điều khiển. Cách này giúp khoanh vùng lỗi nhanh hơn.

Tiếp theo: [07. Lỗi thường gặp & Phụ lục](./07-errors-and-appendix.md)