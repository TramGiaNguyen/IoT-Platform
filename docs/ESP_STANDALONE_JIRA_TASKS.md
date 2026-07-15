# Phân chia công việc - ESP Standalone Code Generator

> File hướng dẫn chia nhỏ các công việc để đưa lên Jira theo từng sprint.

---

## 📋 TỔNG QUAN EPIC

**Epic:** ESP Standalone Code Generator  
**Mô tả:** Cho phép thiết kế giao diện điều khiển trên IoT Platform → xuất code Arduino → nạp vào ESP → điều khiển qua điện thoại (không cần WiFi infrastructure).

**Ước tính tổng:** 6 sprint (3 tháng)

---

## 🎯 SPRINT 1: Nền tảng Backend & Code Generator Core (2 tuần)

### ESP-101: Tạo backend API endpoint cho ESP Code Generator
**Priority:** High  
**Story Points:** 5  
**Type:** Backend

**Mô tả:**
- Tạo endpoint `POST /api/esp/export-code` nhận JSON config dashboard
- Tạo endpoint `POST /api/esp/preview` trả về HTML preview
- Xác thực user và lưu log xuất code

**Acceptance Criteria:**
- [ ] API nhận danh sách widget từ dashboard
- [ ] API trả về file `.ino` dạng text hoặc base64
- [ ] Có authentication
- [ ] Log lịch sử export vào database

**Assignee:** Backend Dev  
**Labels:** `backend`, `esp-generator`, `sprint-1`

---

### ESP-102: Xây dựng template Jinja2 cho file .ino
**Priority:** High  
**Story Points:** 8  
**Type:** Backend

**Mô tả:**
- Tạo template Jinja2 sinh code Arduino
- Template phải generate: AP config, WebServer, HTML UI, GPIO setup
- Hỗ trợ các loại widget cơ bản: Button, Toggle, Slider

**Acceptance Criteria:**
- [ ] Template sinh ra file `.ino` compile được
- [ ] GPIO được map đúng với widget
- [ ] AP mode tự động config (SSID, password)
- [ ] WebServer phục vụ HTML responsive
- [ ] Có comment tiếng Việt giải thích từng phần

**Files liên quan:**
- `fastapi_backend/templates/esp_standalone.ino.j2`
- `fastapi_backend/services/esp_codegen.py`

**Assignee:** Backend Dev  
**Labels:** `backend`, `template`, `esp-generator`

---

### ESP-103: Hỗ trợ ESP32 và ESP8266 board variants
**Priority:** Medium  
**Story Points:** 3  
**Type:** Backend

**Mô tả:**
- Template hỗ trợ cả ESP32 và ESP8266
- Auto-detect board từ config
- Tự chọn thư viện phù hợp (WiFi.h vs WiFi.h + ESP8266WiFi.h)

**Acceptance Criteria:**
- [ ] Compile được trên ESP32 DevKit
- [ ] Compile được trên ESP8266 NodeMCU
- [ ] Có chọn board trong form export

**Assignee:** Backend Dev  
**Labels:** `backend`, `esp32`, `esp8266`

---

## 🎯 SPRINT 2: Dashboard Builder Integration (2 tuần)

### ESP-201: Tích hợp nút "Export ESP Code" vào Dashboard Builder
**Priority:** High  
**Story Points:** 5  
**Type:** Frontend

**Mô tả:**
- Thêm button "Export ESP Code" trong Dashboard Builder toolbar
- Modal hiển thị config: tên ESP, SSID, password, board type
- Gọi API backend để generate code

**Acceptance Criteria:**
- [ ] Button hiển thị trên Dashboard Builder
- [ ] Modal config với form đầy đủ fields
- [ ] Loading state khi generate
- [ ] Download file `.ino` thành công
- [ ] Thông báo lỗi nếu fail

**Files liên quan:**
- `react_dashboard/src/components/DashboardBuilder/DashboardBuilder.js`
- `react_dashboard/src/components/DashboardBuilder/ExportESPModal.js`

**Assignee:** Frontend Dev  
**Labels:** `frontend`, `dashboard-builder`, `export`

---

### ESP-202: Thêm widget types mới (Joystick, Color Picker, D-Pad)
**Priority:** Medium  
**Story Points:** 8  
**Type:** Frontend

**Mô tả:**
- Bổ sung 3 widget types: Joystick, Color Picker, Direction Pad
- Cấu hình: tên, GPIO mapping, min/max values
- Render trong Canvas với style phù hợp mobile

**Acceptance Criteria:**
- [ ] Widget Joystick với 2 trục X/Y
- [ ] Widget Color Picker RGB
- [ ] Widget D-Pad 4 hướng
- [ ] Có thể kéo thả vào Canvas
- [ ] Lưu config vào database

**Files liên quan:**
- `react_dashboard/src/components/DashboardBuilder/WidgetEditor.js`
- `react_dashboard/src/components/DashboardBuilder/WidgetPreview.js`
- `react_dashboard/src/components/DashboardBuilder/Canvas.js`

**Assignee:** Frontend Dev  
**Labels:** `frontend`, `widget`, `dashboard-builder`

---

### ESP-203: Cấu hình GPIO mapping cho widget
**Priority:** High  
**Story Points:** 5  
**Type:** Frontend

**Mô tả:**
- Mỗi widget phải có dropdown chọn GPIO pin
- Validate GPIO không trùng giữa các widget
- Hiển thị warning nếu GPIO không khả dụng (VD: GPIO6-11 trên ESP32)

**Acceptance Criteria:**
- [ ] Dropdown chọn GPIO 0-39 (ESP32)
- [ ] Validation GPIO trùng
- [ ] Tooltip mô tả từng GPIO
- [ ] Lưu GPIO vào widget config

**Files liên quan:**
- `react_dashboard/src/components/DashboardBuilder/WidgetEditor.js`

**Assignee:** Frontend Dev  
**Labels:** `frontend`, `gpio`, `validation`

---

## 🎯 SPRINT 3: ESP Firmware & Hardware Testing (2 tuần)

### ESP-301: Viết ESP firmware template (WebServer + AP Mode)
**Priority:** High  
**Story Points:** 8  
**Type:** Embedded / Arduino

**Mô tả:**
- Viết code Arduino hoàn chỉnh cho ESP
- AP Mode với captive portal
- AsyncWebServer phục vụ giao diện mobile
- Xử lý HTTP request cho từng widget

**Acceptance Criteria:**
- [ ] ESP phát WiFi thành công
- [ ] Captive portal mở giao diện mobile khi kết nối
- [ ] HTML responsive trên mobile (iOS + Android)
- [ ] Xử lý 6 loại widget: Button, Toggle, Slider, Joystick, Color, D-Pad
- [ ] Tối đa 20 widget trong 1 dashboard

**Files liên quan:**
- `esp_firmware/esp_standalone_controller/esp_standalone_controller.ino`

**Assignee:** Embedded Dev  
**Labels:** `embedded`, `esp32`, `firmware`

---

### ESP-302: Tối ưu HTML/CSS cho mobile UI
**Priority:** Medium  
**Story States:** 5  
**Type:** Frontend (HTML inside ESP)

**Mô tả:**
- HTML/CSS nhúng trong PROGMEM phải responsive
- Hỗ trợ cảm ứng (touch-friendly)
- Animations mượt trên mobile

**Acceptance Criteria:**
- [ ] Nút bấm tối thiểu 44x44px (chuẩn mobile)
- [ ] Slider hoạt động mượt trên iOS Safari
- [ ] Không bị zoom khi nhấn input
- [ ] Load time < 2 giây

**Assignee:** Frontend Dev  
**Labels:** `frontend`, `mobile`, `css`

---

### ESP-303: Test với ESP32 thật (end-to-end)
**Priority:** High  
**Story Points:** 5  
**Type:** QA / Testing

**Mô tả:**
- Test compile code trên Arduino IDE
- Upload lên ESP32 DevKit
- Test từng widget: nhấn nút → GPIO thay đổi
- Test với iPhone và Android

**Acceptance Criteria:**
- [ ] Compile không lỗi
- [ ] Upload thành công qua USB
- [ ] Test 6 widget types đều hoạt động
- [ ] Test trên 2 thiết bị mobile
- [ ] Ghi video demo

**Assignee:** QA  
**Labels:** `qa`, `hardware-test`, `demo`

---

## 🎯 SPRINT 4: Web Flasher & UX Polish (2 tuần)

### ESP-401: Tích hợp ESP Web Tools (upload trực tiếp từ browser)
**Priority:** Medium  
**Story Points:** 8  
**Type:** Frontend

**Mô tả:**
- Tích hợp thư viện `esp-web-tools` để nạp firmware từ trình duyệt
- User chỉ cần cắm USB, nhấn "Upload" trên web
- Không cần cài Arduino IDE

**Acceptance Criteria:**
- [ ] Nút "Upload to ESP" trên platform
- [ ] Trình duyệt nhận diện ESP qua WebSerial
- [ ] Flash firmware tự động
- [ ] Hiển thị progress upload
- [ ] Hỗ trợ Chrome/Edge

**Files liên quan:**
- `react_dashboard/src/components/ESPFlasher/`
- `fastapi_backend/api/esp_firmware.py` (build .bin)

**Assignee:** Frontend Dev  
**Labels:** `frontend`, `webserial`, `flasher`

---

### ESP-402: Build .bin file từ Arduino code (headless)
**Priority:** Medium  
**Story Points:** 8  
**Type:** Backend / DevOps

**Mô tả:**
- Dùng `arduino-cli` headless để compile `.ino` → `.bin`
- Build trên server khi user export code
- Trả về file `.bin` cho ESP Web Tools

**Acceptance Criteria:**
- [ ] Arduino CLI chạy trên backend server
- [ ] Compile thành công file `.bin`
- [ ] Cache kết quả build
- [ ] Thời gian build < 30 giây

**Files liên quan:**
- `fastapi_backend/services/arduino_builder.py`
- `Dockerfile` (cài arduino-cli)

**Assignee:** Backend Dev  
**Labels:** `backend`, `arduino-cli`, `ci`

---

### ESP-403: Captive portal cho ESP WiFi
**Priority:** Low  
**Story Points:** 3  
**Type:** Embedded

**Mô tả:**
- Khi điện thoại kết nối WiFi ESP, tự động mở trang điều khiển
- DNS server redirect mọi domain về 192.168.4.1

**Acceptance Criteria:**
- [ ] DNS server chạy trên ESP
- [ ] iOS tự động mở popup "Sign in"
- [ ] Android mở notification kết nối

**Assignee:** Embedded Dev  
**Labels:** `embedded`, `captive-portal`

---

## 🎯 SPRINT 5: Tính năng nâng cao (2 tuần)

### ESP-501: Hỗ trợ PlatformIO project export
**Priority:** Low  
**Story Points:** 5  
**Type:** Backend

**Mô tả:**
- Ngoài file `.ino`, hỗ trợ export cả project PlatformIO
- Bao gồm `platformio.ini`, `src/main.cpp`, thư mục `data/`

**Acceptance Criteria:**
- [ ] Export file ZIP chứa project PlatformIO
- [ ] Build bằng PlatformIO thành công
- [ ] Có chọn loại project (.ino / PlatformIO) khi export

**Assignee:** Backend Dev  
**Labels:** `backend`, `platformio`, `export`

---

### ESP-502: Thêm widget Servo Motor & Stepper
**Priority:** Low  
**Story Points:** 5  
**Type:** Frontend + Embedded

**Mô tả:**
- Widget Servo: góc 0-180°
- Widget Stepper: số bước, tốc độ
- Tích hợp thư viện Servo.h, AccelStepper.h

**Acceptance Criteria:**
- [ ] Widget Servo trên platform
- [ ] Widget Stepper trên platform
- [ ] ESP code compile với thư viện Servo
- [ ] Test servo thật quay đúng góc

**Assignee:** Full-stack Dev  
**Labels:** `widget`, `servo`, `stepper`

---

### ESP-503: Lưu cấu hình vào EEPROM
**Priority:** Low  
**Story Points:** 3  
**Type:** Embedded

**Mô tả:**
- Lưu SSID, password, GPIO config vào EEPROM
- Khi ESP reset, giữ nguyên cấu hình
- Cho phép đổi SSID qua web

**Acceptance Criteria:**
- [ ] Lưu config vào EEPROM
- [ ] Restore khi restart
- [ ] Web UI cho phép đổi SSID

**Assignee:** Embedded Dev  
**Labels:** `embedded`, `eeprom`, `persistence`

---

## 🎯 SPRINT 6: Tài liệu & Demo (2 tuần)

### ESP-601: Viết hướng dẫn sử dụng chi tiết
**Priority:** Medium  
**Story Points:** 3  
**Type:** Documentation

**Mô tả:**
- Hướng dẫn từng bước trên web docs
- Video demo
- Sample dashboards mẫu

**Acceptance Criteria:**
- [ ] Doc trong `react_dashboard/public/docs/`
- [ ] Video demo 5 phút
- [ ] 3 dashboard mẫu (đèn, motor, robot)

**Assignee:** Tech Writer  
**Labels:** `docs`, `tutorial`

---

### ESP-602: Chuẩn bị bộ demo cho cuộc thi
**Priority:** High  
**Story Points:** 5  
**Type:** Demo

**Mô tả:**
- Chuẩn bị ESP32 + linh kiện
- 3 case study: điều khiển đèn, motor DC, robot
- Slide thuyết trình

**Acceptance Criteria:**
- [ ] 3 bộ demo hoàn chỉnh
- [ ] Slide PowerPoint
- [ ] Video demo 3 phút

**Assignee:** PM + Embedded Dev  
**Labels:** `demo`, `competition`

---

### ESP-603: Landing page & marketing
**Priority:** Low  
**Story Points:** 3  
**Type:** Marketing

**Mô tả:**
- Trang giới thiệu tính năng ESP Standalone
- Screenshots, GIFs
- Chia sẻ lên cộng đồng Arduino Việt Nam

**Acceptance Criteria:**
- [ ] Landing page trên platform
- [ ] 5 screenshots chất lượng
- [ ] Bài đăng Facebook/Group Arduino

**Assignee:** Marketing  
**Labels:** `marketing`, `landing-page`

---

## 📊 BẢNG TỔNG HỢP

| Sprint | Tickets | Story Points | Thời gian |
|--------|---------|--------------|-----------|
| Sprint 1 | ESP-101, 102, 103 | 16 | 2 tuần |
| Sprint 2 | ESP-201, 202, 203 | 18 | 2 tuần |
| Sprint 3 | ESP-301, 302, 303 | 18 | 2 tuần |
| Sprint 4 | ESP-401, 402, 403 | 19 | 2 tuần |
| Sprint 5 | ESP-501, 502, 503 | 13 | 2 tuần |
| Sprint 6 | ESP-601, 602, 603 | 11 | 2 tuần |
| **Tổng** | **18 tickets** | **95 SP** | **12 tuần** |

---

## 🏷️ LABELS ĐỀ XUẤT CHO JIRA

- `esp-generator` - Tính năng chính
- `backend` - Backend development
- `frontend` - Frontend development
- `embedded` - ESP firmware / Arduino
- `sprint-1` ... `sprint-6` - Sprint number
- `hardware-test` - Test với phần cứng thật
- `docs` - Tài liệu
- `demo` - Demo / thi đấu
- `high-priority`, `medium-priority`, `low-priority`

---

## 🔗 DEPENDENCIES

```
ESP-102 (template) ──► ESP-201 (UI button) ──► ESP-301 (firmware) ──► ESP-303 (test)
                                                    │
                                                    ▼
                                            ESP-401 (web flasher) ──► ESP-402 (.bin builder)
```

---

## 📝 GHI CHÚ

- **Sprint 1-3:** MVP - Có thể demo được cơ bản
- **Sprint 4:** UX tốt hơn, không cần Arduino IDE
- **Sprint 5-6:** Nâng cao & chuẩn bị thi đấu

> Sau khi cập nhật lên Jira, có thể dùng JQL filter: `project = ESP ORDER BY priority DESC, sprint ASC`