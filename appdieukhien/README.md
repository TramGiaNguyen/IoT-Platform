# AppDieuKhien - Flutter App điều khiển ESP

App Flutter (Android/iOS) đọc file JSON xuất ra từ **IoT Platform > Thiết lập điều khiển nội bộ** và render thành giao diện điều khiển ESP với 14 loại widget (joystick, slider, knob, button, ...).

## Tính năng

- Đọc file JSON cấu hình ESP từ thiết bị (file picker).
- Load file JSON mẫu được bundle sẵn để demo.
- Tự động kết nối ESP qua WiFi AP mode (mặc định `192.168.4.1`) hoặc STA mode (qua mDNS).
- Hỗ trợ 14 loại widget điều khiển:
  - joystick_full, joystick_x, joystick_y
  - color_picker, touch_pad, dpad
  - slider, knob, number_input, stepper
  - toggle, button, checkbox, icon_button
- Giao tiếp với ESP qua HTTP GET tới endpoint `/<widget_type>/<sanitized_id>`.
- Responsive layout giữ đúng tỉ lệ `customWidth x customHeight` của config.

## Cấu trúc project

```
lib/
├── main.dart                 # Entry point
├── models/
│   ├── widget_config.dart    # Model của 1 widget
│   └── standalone_config.dart # Model của cả file JSON config
├── services/
│   ├── config_loader.dart    # Load JSON từ file/asset/API
│   ├── config_provider.dart  # State toàn cục cho config
│   ├── esp_client.dart       # HTTP client giao tiếp ESP
│   └── wifi_helper.dart      # Helper kiểm tra WiFi
├── screens/
│   ├── home_screen.dart      # Màn hình chính - chọn file
│   ├── wifi_setup_screen.dart # Hướng dẫn kết nối WiFi
│   └── control_screen.dart   # Màn hình điều khiển chính
└── widgets/
    └── widget_factory.dart   # Renderer cho 14 loại widget

assets/
└── sample_config.json        # File JSON mẫu để demo
```

## Luồng sử dụng

1. Trong **IoT Platform** (React Dashboard):
   - Vào trang **Thiết lập điều khiển nội bộ** của thiết bị.
   - Kéo thả widget, cấu hình GPIO/virtual pin.
   - Bấm **"Xuất JSON"** để tải file `*_standalone_config.json`.

2. Trong **app Flutter**:
   - Mở app, bấm **"Chọn file JSON"** rồi chọn file vừa xuất.
   - Bấm **"Kiểm tra kết nối ESP"** sau khi đã vào WiFi của ESP (`apSsid`).
   - Bấm **"Mở bảng điều khiển"** để điều khiển ESP.

## Cách ESP và App giao tiếp

ESP generator tạo ra các route:

```
GET /                        -> HTML control panel
GET /<serverEndpoint>        -> HTML control panel (vd /control)
GET /<widget_type>/<id>      -> Handler cho widget (vd /slider/w_xxx)
```

App Flutter gửi lệnh qua query string:

| Widget type     | Query params                              |
|-----------------|--------------------------------------------|
| button          | `?state=<onValue>` hoặc `?state=<offValue>` |
| toggle          | `?state=<onValue>` hoặc `?state=<offValue>` |
| checkbox        | `?state=<onValue>` hoặc `?state=<offValue>` |
| icon_button     | `?state=<onValue>` hoặc `?state=<offValue>` |
| slider          | `?value=<int>`                              |
| knob            | `?value=<int>`                              |
| number_input    | `?value=<int>`                              |
| stepper         | `?value=<int>&dir=<UP\|DOWN>`               |
| joystick_x/y    | `?value=<int>`                              |
| joystick_full   | `?x=<int>&y=<int>`                          |
| color_picker    | `?r=<int>&g=<int>&b=<int>`                 |
| dpad            | `?dir=<UP\|DOWN\|LEFT\|RIGHT>`              |
| touch_pad       | `?x=<int>&y=<int>`                          |

## Build

### Yêu cầu

- Flutter SDK >= 3.12
- Android SDK / Xcode (cho build mobile)

### Cài dependencies

```bash
cd appdieukhien
flutter pub get
```

### Chạy trên Android

```bash
flutter run -d <device_id>
# Hoặc build APK
flutter build apk --release
```

### Chạy trên iOS

```bash
cd ios && pod install && cd ..
flutter run -d <device_id>
# Hoặc build
flutter build ios --release
```

## Cấu hình backend (optional)

Nếu muốn fetch config trực tiếp từ backend IoT Platform thay vì file picker, gọi:

```
GET /api/public/standalone-config/<device_code>
```

Response là JSON giống file export.

## Cập nhật schema

Schema version hiện tại là `1.0`. Khi nâng cấp, tăng `schemaVersion` trong:
- [lib/models/standalone_config.dart](lib/models/standalone_config.dart)
- React Dashboard: `handleExportJson`
- Backend: response của public endpoint

App Flutter sẽ báo lỗi nếu `schemaVersion` không khớp.