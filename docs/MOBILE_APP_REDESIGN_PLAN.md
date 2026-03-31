# Mobile App Redesign Plan - Dynamic Room-Based Control

## 📋 Tổng quan

Thiết kế lại mobile app để:
1. **Tự động load rooms** theo quyền hạn người dùng
2. **Hiển thị thiết bị theo room** với giao diện động
3. **Tự thích nghi với data** không cố định từ mỗi phòng
4. **Điều khiển relay** của tất cả thiết bị trong room
5. **Hiển thị metrics** linh hoạt theo loại dữ liệu

---

## 🎯 Mục tiêu chính

### 1. Room-Based Navigation
- User đăng nhập → Xem danh sách rooms (phòng vật lý) có quyền truy cập
- Click vào room → Xem tất cả thiết bị IoT và controls trong room đó
- Phân quyền tự động:
  - **Admin**: Tất cả rooms trong hệ thống
  - **Teacher**: Rooms của mình + Rooms của học viên trong lớp
  - **Student**: Chỉ rooms của mình

**Room Examples:**
- "Phòng Lab IoT" - chứa ESP32, sensors, relay boards
- "Phòng Server" - chứa monitoring devices, AC control
- "Nhà kho" - chứa temperature/humidity sensors
- "Phòng Học A1" - chứa smart classroom devices

### 2. Dynamic Data Rendering
- Không hardcode loại dữ liệu (temperature, humidity, etc.)
- Tự động phát hiện và hiển thị metrics từ API
- Tự động tạo UI cards phù hợp với từng loại dữ liệu
- Hỗ trợ nhiều loại widget: gauge, chart, switch, button

### 3. Flexible Control
- Tự động load relay controls từ `control_lines` table
- Hiển thị tên relay tùy chỉnh (Đèn trần, Quạt, etc.)
- Hỗ trợ nhiều thiết bị trong cùng 1 room
- Group controls theo thiết bị

---

## 🗂️ Database Schema Analysis

### Bảng liên quan:

**1. phong (Rooms)**
```sql
- id: INT
- ten_phong: VARCHAR(100)
- mo_ta: TEXT
- nguoi_so_huu_id: INT  -- Owner của room
```

**2. thiet_bi (Devices)**
```sql
- id: INT
- ma_thiet_bi: VARCHAR(100)  -- device_id
- ten_thiet_bi: VARCHAR(100)
- phong_id: INT  -- Room assignment
- nguoi_so_huu_id: INT  -- Device owner
- trang_thai: ENUM('online','offline','error')
```

**3. control_lines (Relay Controls)**
```sql
- id: INT
- thiet_bi_id: INT
- relay_number: INT
- ten_duong: VARCHAR(100)  -- Custom name: "Đèn trần", "Quạt"
- hien_thi_ttcds: TINYINT(1)  -- Show in app or not
```

**4. nguoi_dung (Users)**
```sql
- id: INT
- vai_tro: ENUM('admin','teacher','student')
- lop_hoc_id: INT
```

### Quyền truy cập:
- **Admin**: Tất cả rooms trong hệ thống
- **Teacher**: Rooms mà teacher tạo ra (nguoi_so_huu_id = teacher_id) + Rooms của học viên trong lớp quản lý
- **Student**: Chỉ rooms mà student tạo ra hoặc được assign (nguoi_so_huu_id = student_id)

---

## 🏗️ Architecture Design

### 1. API Endpoints cần thiết

#### Backend API mới (backend_app_control):

```
GET /rooms
- Trả về danh sách rooms theo quyền hạn user
- Response: [
    {
      "id": 1,
      "name": "Phòng Lab 1",
      "description": "Phòng thí nghiệm IoT",
      "device_count": 3,
      "online_count": 2
    }
  ]
```

```
GET /rooms/{room_id}/devices
- Trả về tất cả thiết bị trong room
- Response: [
    {
      "device_id": "gateway-701e68b1",
      "name": "TTCDS Gateway",
      "status": "online",
      "last_seen": "2026-03-31T10:30:00"
    }
  ]
```

```
GET /rooms/{room_id}/data
- Trả về tất cả dữ liệu của room (dynamic)
- Response: {
    "devices": [
      {
        "device_id": "gateway-701e68b1",
        "name": "TTCDS Gateway",
        "metrics": {
          "temperature": {"value": 26.5, "unit": "°C", "type": "gauge"},
          "humidity": {"value": 65.2, "unit": "%", "type": "gauge"},
          "voltage": {"value": 227.5, "unit": "V", "type": "number"},
          "power": {"value": 21.9, "unit": "kW", "type": "number"}
        },
        "controls": [
          {"relay": 1, "name": "Đèn trần", "state": "ON"},
          {"relay": 2, "name": "Quạt", "state": "OFF"}
        ]
      }
    ]
  }
```

```
POST /rooms/{room_id}/control
- Điều khiển relay trong room
- Body: {
    "device_id": "gateway-701e68b1",
    "relay": 1,
    "state": "ON"
  }
```

---

## 📱 Mobile App Structure

### Screen Flow:
```
LoginScreen
    ↓
RoomListScreen (Danh sách phòng)
    ↓
RoomDetailScreen (Chi tiết phòng + thiết bị)
    ↓
DeviceDetailScreen (Chi tiết 1 thiết bị - optional)
```

### Folder Structure:
```
lib/
├── main.dart
├── models/
│   ├── room.dart              # Room model
│   ├── device.dart            # Device model
│   ├── metric.dart            # Dynamic metric model
│   ├── control.dart           # Control (relay) model
│   └── user.dart              # User model
├── screens/
│   ├── login_screen.dart
│   ├── room_list_screen.dart  # NEW: Danh sách rooms
│   ├── room_detail_screen.dart # NEW: Chi tiết room
│   └── device_detail_screen.dart # Optional
├── widgets/
│   ├── metric_card.dart       # Dynamic metric display
│   ├── control_card.dart      # Relay control widget
│   ├── device_card.dart       # Device summary card
│   └── room_card.dart         # Room summary card
├── services/
│   ├── api_service.dart       # HTTP client
│   └── auth_service.dart      # Authentication
└── utils/
    ├── metric_renderer.dart   # Logic để render metric động
    └── constants.dart         # Colors, styles
```

---

## 🎨 UI/UX Design

### 1. Room List Screen

**Layout:**
```
┌─────────────────────────────┐
│  ☰  Phòng của tôi      👤   │
├─────────────────────────────┤
│                             │
│  ┌───────────────────────┐  │
│  │ 🏠 Phòng Lab 1        │  │
│  │ 3 thiết bị • 2 online │  │
│  │ Cập nhật: 2 phút trước│  │
│  └───────────────────────┘  │
│                             │
│  ┌───────────────────────┐  │
│  │ 🏠 Phòng Lab 2        │  │
│  │ 5 thiết bị • 4 online │  │
│  │ Cập nhật: 5 phút trước│  │
│  └───────────────────────┘  │
│                             │
│  ┌───────────────────────┐  │
│  │ 🏠 Phòng Học A1       │  │
│  │ 2 thiết bị • 2 online │  │
│  │ Cập nhật: 1 phút trước│  │
│  └───────────────────────┘  │
│                             │
└─────────────────────────────┘
```

**Features:**
- Pull to refresh
- Search bar để tìm phòng
- Badge hiển thị số thiết bị online/offline
- Tap vào card → Navigate to Room Detail

---

### 2. Room Detail Screen

**Layout:**
```
┌─────────────────────────────┐
│  ← Phòng Lab 1         🔄   │
├─────────────────────────────┤
│                             │
│  📊 Tổng quan               │
│  ┌─────────┬─────────┐      │
│  │ 3 thiết │ 2 online│      │
│  │   bị    │         │      │
│  └─────────┴─────────┘      │
│                             │
│  ⚡ Điều khiển              │
│  ┌─────────────────────┐    │
│  │ TTCDS Gateway       │    │
│  │ ● Online            │    │
│  │                     │    │
│  │ ┌─────┐ ┌─────┐    │    │
│  │ │💡ON │ │💡OFF│    │    │
│  │ │Đèn 1│ │Đèn 2│    │    │
│  │ └─────┘ └─────┘    │    │
│  │                     │    │
│  │ ┌─────┐ ┌─────┐    │    │
│  │ │🌀OFF│ │🔌ON │    │    │
│  │ │Quạt │ │Máy  │    │    │
│  │ └─────┘ └─────┘    │    │
│  └─────────────────────┘    │
│                             │
│  📈 Dữ liệu                │
│  ┌─────────────────────┐    │
│  │ 🌡️ Nhiệt độ: 26.5°C │    │
│  │ 💧 Độ ẩm: 65.2%     │    │
│  │ ⚡ Điện áp: 227.5V   │    │
│  │ 🔋 Công suất: 21.9kW│    │
│  └─────────────────────┘    │
│                             │
└─────────────────────────────┘
```

**Features:**
- Group controls theo device
- Dynamic metric cards
- Real-time updates (WebSocket hoặc polling)
- Swipe to refresh

---

## 🔧 Dynamic Rendering Strategy

### Metric Type Detection

**Dựa vào tên field và giá trị để tự động chọn widget:**

```dart
enum MetricType {
  temperature,  // 🌡️ Gauge với màu gradient
  humidity,     // 💧 Gauge với màu xanh
  voltage,      // ⚡ Number với icon
  current,      // 🔌 Number với icon
  power,        // 🔋 Number với icon
  energy,       // 📊 Number với icon
  frequency,    // 📡 Number với icon
  relay,        // 💡 Switch/Button
  generic       // 📄 Text display
}

MetricType detectMetricType(String key, dynamic value) {
  key = key.toLowerCase();
  
  if (key.contains('temp')) return MetricType.temperature;
  if (key.contains('humi')) return MetricType.humidity;
  if (key.contains('volt')) return MetricType.voltage;
  if (key.contains('current') || key.contains('amp')) return MetricType.current;
  if (key.contains('power') || key.contains('watt')) return MetricType.power;
  if (key.contains('energy')) return MetricType.energy;
  if (key.contains('freq')) return MetricType.frequency;
  if (key.contains('relay') || key.contains('state')) return MetricType.relay;
  
  return MetricType.generic;
}
```

### Widget Mapping

```dart
Widget buildMetricWidget(Metric metric) {
  switch (metric.type) {
    case MetricType.temperature:
      return TemperatureGauge(metric);
    
    case MetricType.humidity:
      return HumidityGauge(metric);
    
    case MetricType.voltage:
    case MetricType.current:
    case MetricType.power:
    case MetricType.energy:
    case MetricType.frequency:
      return NumberCard(metric);
    
    case MetricType.relay:
      return RelaySwitch(metric);
    
    case MetricType.generic:
    default:
      return GenericCard(metric);
  }
}
```

---

## 🔐 Permission Logic

### Backend Permission Check:

```python
def get_user_rooms(user_id: int, role: str, conn) -> List[dict]:
    """
    Lấy danh sách rooms theo quyền hạn
    
    Room = Không gian vật lý chứa thiết bị IoT
    VD: "Phòng Lab 1", "Phòng Server", "Nhà kho"
    
    Quyền truy cập:
    - Admin: Tất cả rooms
    - Teacher: Rooms của mình + Rooms của học viên trong lớp
    - Student: Chỉ rooms của mình
    """
    cursor = conn.cursor(dictionary=True)
    
    if role == 'admin':
        # Admin: Tất cả rooms trong hệ thống
        query = """
            SELECT p.*, 
                   COUNT(DISTINCT tb.id) as device_count,
                   SUM(CASE WHEN tb.trang_thai = 'online' THEN 1 ELSE 0 END) as online_count
            FROM phong p
            LEFT JOIN thiet_bi tb ON p.id = tb.phong_id
            GROUP BY p.id
            ORDER BY p.ten_phong
        """
        cursor.execute(query)
    
    elif role == 'teacher':
        # Teacher: 
        # 1. Rooms mà teacher tạo (nguoi_so_huu_id = teacher_id)
        # 2. Rooms của học viên trong lớp teacher quản lý
        query = """
            SELECT DISTINCT p.*, 
                   COUNT(DISTINCT tb.id) as device_count,
                   SUM(CASE WHEN tb.trang_thai = 'online' THEN 1 ELSE 0 END) as online_count
            FROM phong p
            LEFT JOIN thiet_bi tb ON p.id = tb.phong_id
            WHERE p.nguoi_so_huu_id = %s
               OR p.nguoi_so_huu_id IN (
                   SELECT nd.id 
                   FROM nguoi_dung nd
                   INNER JOIN lop_hoc lh ON nd.lop_hoc_id = lh.id
                   WHERE lh.giao_vien_id = %s
               )
            GROUP BY p.id
            ORDER BY p.ten_phong
        """
        cursor.execute(query, (user_id, user_id))
    
    else:  # student
        # Student: Chỉ rooms mà student tạo ra hoặc được assign
        query = """
            SELECT p.*, 
                   COUNT(DISTINCT tb.id) as device_count,
                   SUM(CASE WHEN tb.trang_thai = 'online' THEN 1 ELSE 0 END) as online_count
            FROM phong p
            LEFT JOIN thiet_bi tb ON p.id = tb.phong_id
            WHERE p.nguoi_so_huu_id = %s
            GROUP BY p.id
            ORDER BY p.ten_phong
        """
        cursor.execute(query, (user_id,))
    
    return cursor.fetchall()
```

### Use Case Examples:

**Scenario 1: Student tạo room cho project cá nhân**
```
Student A tạo room "Phòng Lab Cá Nhân"
→ Thêm thiết bị: ESP32-001, Sensor-002
→ Chỉ Student A thấy room này trên app
```

**Scenario 2: Teacher tạo room cho lớp**
```
Teacher B tạo room "Phòng Lab IoT - Lớp K18"
→ Thêm thiết bị: Gateway-001, Relay-Board-001
→ Teacher B thấy room này
→ Admin cũng thấy (admin thấy tất cả)
```

**Scenario 3: Student trong lớp của Teacher**
```
Student C (trong lớp của Teacher B) tạo room "Project Nhóm 1"
→ Thêm thiết bị: Arduino-001
→ Student C thấy room
→ Teacher B thấy room (vì C là học viên của B)
→ Admin thấy room
```

**Scenario 4: Admin quản lý infrastructure**
```
Admin tạo room "Phòng Server"
→ Thêm thiết bị: Server-Monitor-001, AC-Control-001
→ Admin thấy room
→ Teacher và Student KHÔNG thấy (trừ khi admin assign)
```

---

## 📊 Data Flow

```
1. User Login
   ↓
2. GET /rooms → Backend checks role → Return filtered rooms
   ↓
3. Display Room List
   ↓
4. User taps Room
   ↓
5. GET /rooms/{id}/data → Backend aggregates all device data
   ↓
6. Parse response → Detect metric types → Render dynamic widgets
   ↓
7. User controls relay
   ↓
8. POST /rooms/{id}/control → Backend sends MQTT command
   ↓
9. Optimistic UI update + Refresh after 2s
```

---

## 🎯 Implementation Phases

### Phase 1: Backend API (1-2 days)
- [ ] Tạo endpoint GET /rooms
- [ ] Tạo endpoint GET /rooms/{id}/devices
- [ ] Tạo endpoint GET /rooms/{id}/data
- [ ] Tạo endpoint POST /rooms/{id}/control
- [ ] Implement permission logic
- [ ] Test với Postman/curl

### Phase 2: Models & Services (1 day)
- [ ] Tạo Room model
- [ ] Tạo Device model
- [ ] Tạo Metric model (dynamic)
- [ ] Tạo Control model
- [ ] Update ApiService với new endpoints
- [ ] Add caching strategy

### Phase 3: UI Screens (2-3 days)
- [ ] RoomListScreen
- [ ] RoomDetailScreen
- [ ] Dynamic metric widgets
- [ ] Control widgets
- [ ] Navigation flow
- [ ] Pull to refresh

### Phase 4: Dynamic Rendering (2 days)
- [ ] Metric type detection logic
- [ ] Widget factory pattern
- [ ] Temperature gauge
- [ ] Humidity gauge
- [ ] Number cards
- [ ] Generic cards
- [ ] Relay switches

### Phase 5: Polish & Testing (1-2 days)
- [ ] Error handling
- [ ] Loading states
- [ ] Empty states
- [ ] Animations
- [ ] Testing với nhiều rooms
- [ ] Testing với nhiều loại data

**Total: 7-10 days**

---

## 🎨 Widget Library

### 1. TemperatureGauge
- Circular gauge với gradient màu
- Màu: Blue (cold) → Green (normal) → Red (hot)
- Range: 0-50°C
- Icon: 🌡️

### 2. HumidityGauge
- Circular gauge với màu xanh
- Range: 0-100%
- Icon: 💧

### 3. NumberCard
- Simple card với icon + value + unit
- Icons theo loại: ⚡🔌🔋📊📡
- Màu theo loại metric

### 4. RelaySwitch
- Toggle switch hoặc button
- Màu: Green (ON) / Grey (OFF)
- Loading state khi đang control
- Icon: 💡🌀🔌

### 5. GenericCard
- Fallback cho data không xác định
- Hiển thị key-value đơn giản
- Icon: 📄

---

## 🔄 Real-time Updates

### Strategy Options:

**Option 1: Polling (Simple)**
```dart
Timer.periodic(Duration(seconds: 5), (timer) {
  _refreshRoomData();
});
```
- Pros: Đơn giản, dễ implement
- Cons: Tốn battery, không real-time

**Option 2: WebSocket (Recommended)**
```dart
WebSocketChannel channel = WebSocketChannel.connect(
  Uri.parse('ws://server:8000/ws/rooms/{room_id}')
);

channel.stream.listen((data) {
  _updateRoomData(jsonDecode(data));
});
```
- Pros: Real-time, tiết kiệm battery
- Cons: Phức tạp hơn, cần maintain connection

**Recommendation**: Start với Polling, upgrade to WebSocket sau

---

## 🎯 Success Criteria

### Functional:
- ✅ User có thể xem tất cả rooms có quyền
- ✅ User có thể xem tất cả thiết bị trong room
- ✅ User có thể điều khiển relay
- ✅ Data hiển thị động không cần hardcode
- ✅ UI tự thích nghi với nhiều loại data

### Non-functional:
- ✅ Load time < 2s
- ✅ Smooth animations
- ✅ Responsive trên nhiều screen sizes
- ✅ Offline mode (cache data)
- ✅ Error handling graceful

---

## 📝 API Response Examples

### GET /rooms
```json
{
  "rooms": [
    {
      "id": 1,
      "name": "Phòng Lab 1",
      "description": "Phòng thí nghiệm IoT",
      "device_count": 3,
      "online_count": 2,
      "last_update": "2026-03-31T10:30:00"
    }
  ]
}
```

### GET /rooms/1/data
```json
{
  "room": {
    "id": 1,
    "name": "Phòng Lab 1"
  },
  "devices": [
    {
      "device_id": "gateway-701e68b1",
      "name": "TTCDS Gateway",
      "status": "online",
      "last_seen": "2026-03-31T10:30:00",
      "metrics": {
        "temperature": {
          "value": 26.5,
          "unit": "°C",
          "type": "gauge",
          "min": 0,
          "max": 50
        },
        "humidity": {
          "value": 65.2,
          "unit": "%",
          "type": "gauge",
          "min": 0,
          "max": 100
        },
        "voltage": {
          "value": 227.5,
          "unit": "V",
          "type": "number"
        },
        "power": {
          "value": 21.9,
          "unit": "kW",
          "type": "number"
        }
      },
      "controls": [
        {
          "relay": 1,
          "name": "Đèn trần",
          "state": "ON",
          "controllable": true
        },
        {
          "relay": 2,
          "name": "Quạt",
          "state": "OFF",
          "controllable": true
        }
      ]
    }
  ]
}
```

---

## 🚀 Next Steps

1. **Review plan này** với team
2. **Approve architecture** và API design
3. **Start Phase 1**: Backend API development
4. **Parallel**: UI mockups trong Figma (optional)
5. **Iterate** based on feedback

---

## 📚 References

- Flutter documentation: https://flutter.dev/docs
- Material Design: https://material.io/design
- REST API best practices
- Dynamic UI patterns in Flutter

---

**Created**: 2026-03-31
**Author**: Kiro AI Assistant
**Status**: Draft - Awaiting Review
