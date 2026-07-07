# 01. Bắt đầu nhanh

Tài liệu này hướng dẫn bạn từ lúc chưa có tài khoản đến khi nhìn thấy thiết bị đầu tiên trên dashboard.

## 1. Truy cập dashboard

Mở trình duyệt, truy cập địa chỉ dashboard mà quản trị viên cung cấp. Mặc định local:

- **Dashboard web**: http://localhost:3000
- **Backend API**: http://localhost:8000 (tài liệu API tại `/docs`)

## 2. Đăng nhập

1. Truy cập trang dashboard.
2. Nhập **email** và **mật khẩu** đã được admin cấp.
3. Nhấn **Đăng nhập**.

Nếu quên mật khẩu, nhấn **Quên mật khẩu**, điền email, hệ thống sẽ gửi link đặt lại mật khẩu vào email (nếu SMTP được admin cấu hình). Nếu không có SMTP, liên hệ admin để reset trực tiếp.

> **Lưu ý**: trong tổ chức nội bộ (ví dụ BDU), tài khoản thường do admin tạo sẵn. Bạn không tự đăng ký.

## 3. Khám phá giao diện

Sau khi đăng nhập, bạn sẽ thấy **Dashboard** chính gồm các khu vực:

```
+-----------------------+--------------------------------------+
|                       |                                      |
|    SIDEBAR            |           MAIN VIEW                  |
|  (thanh bên trái)     |     (nội dung chính)                 |
|                       |                                      |
|  Brand "BDU IoT"      |                                      |
|  ───────────────      |    [Nội dung theo mục đang chọn]     |
|  Workspace switcher   |                                      |
|   • Cá nhân           |                                      |
|   • Nhóm              |                                      |
|                       |                                      |
|  Menu chính:          |                                      |
|  • Dashboard          |                                      |
|  • Quản lý phòng      |                                      |
|  • Quản lý rule       |                                      |
|  • Quản báo           |                                      |
|  • Device Profiles    |                                      |
|  • Quản lý Dashboard  |                                      |
|  • Quản lý user       |                                      |
|  • Quản lý lớp học    |                                      |
|                       |                                      |
|  + Khai báo TB        |                                      |
|  + Tài liệu hướng dẫn |                                      |
+-----------------------+--------------------------------------+
              TOP HEADER: tên user, đăng xuất, đổi mk
```

### Workspace switcher (Cá nhân / Nhóm)

Ở đầu sidebar có hai nút **Cá nhân** / **Nhóm**. Hai nút này **chỉ hiển thị khi tài khoản của bạn thuộc ít nhất 1 nhóm** — sinh viên chưa được xếp vào nhóm sẽ không thấy workspace switcher.

- **Cá nhân**: chỉ thiết bị bạn sở hữu, không thuộc nhóm nào.
- **Nhóm**: tất cả thiết bị trong các nhóm (lớp / dự án) mà bạn tham gia.

Khi đổi workspace, danh sách thiết bị và toàn bộ dashboard reload theo phạm vi mới.

### Các mục menu chính

| Mục | Mô tả |
|-----|-------|
| **Dashboard** | Tổng quan các thiết bị trong workspace hiện tại |
| **Quản lý phòng** | Phòng cá nhân (mỗi user có phòng riêng để gắn thiết bị) |
| **Quản lý rule** | Luật tự động (IF-THEN) và luật theo lịch (cron) |
| **Quản báo** | Cảnh báo: danh sách, trạng thái, đóng/mở |
| **Device Profiles** | Hồ sơ thiết bị mẫu để tái sử dụng khi khai báo nhiều thiết bị cùng loại |
| **Quản lý Dashboard** | Tạo / sửa / xoá dashboard tuỳ biến |
| **Quản lý người dùng** | (chỉ admin) CRUD tài khoản |
| **Quản lý lớp học** | (admin / giáo viên) CRUD lớp, gán giáo viên, tạo nhóm trong lớp |

## 4. Quy trình tổng quát: thêm một thiết bị và xem dữ liệu

```
Khai báo thiết bị        Hệ thống cấp          Nạp cấu hình
   trên web            thông tin xác thực       vào ESP32
  ────────────► ─────────────────────► ─────────────────►
                                                       │
                                                       v
                                   ESP32 kết nối broker MQTT / POST HTTP
                                                       │
                                                       v
                                              Dữ liệu realtime
                                              trên dashboard
```

Các bước chi tiết:

1. **Khai báo thiết bị** trên sidebar, nhấn **+ Khai Báo Thiết Bị**, đặt tên, chọn loại, gán vào phòng cá nhân. Hệ thống cấp `http_api_key` và `secret_key`.
2. **Cấu hình ESP32**: xem [05. ESP32](./05-esp32-setup.md).
3. **Quan sát**: trở lại dashboard, thiết bị sẽ chuyển từ `offline` → `online` ngay khi ESP32 gửi dữ liệu đầu tiên (qua MQTT hoặc HTTP).

## 5. Câu hỏi thường gặp

**Q: Tôi đăng nhập rồi nhưng không thấy thiết bị nào trên dashboard?**
A: Bạn cần tự khai báo thiết bị trước (mục **+ Khai Báo Thiết Bị**), hoặc được mời vào nhóm/lớp có sẵn thiết bị.

**Q: Làm sao đăng xuất?**
A: Nhấn vào tên user (góc trên bên phải) → **Đăng xuất**.

**Q: Tôi muốn đổi mật khẩu?**
A: Tên user → **Đổi mật khẩu**. Mật khẩu mới tối thiểu 6 ký tự.

**Q: Vì sao tôi không thấy workspace switcher (Cá nhân / Nhóm)?**
A: Vì tài khoản của bạn chưa được xếp vào nhóm nào. Liên hệ giáo viên / admin để được thêm vào nhóm.

---

Tiếp theo: [02. Thiết bị & ESP32 (trung tâm)](./02-devices-and-esp32.md)