# Mobile App Technical Specification

## 🎯 Core Concepts

### 1. Dynamic Data Rendering

**Problem**: Mỗi phòng có thể có nhiều loại thiết bị khác nhau, mỗi thiết bị gửi về data khác nhau (temperature, humidity, voltage, power, custom sensors, etc.). Không thể hardcode UI cho từng loại.

**Solution**: Metadata-driven UI

```dart
class MetricMetadata {
  final String key;           // "temperature"
  final dynamic value;        // 26.5
  final String? unit;         // "°C"
  final MetricType type;      // gauge, number, switch
  final double? min;          // 0
  final double? max;          // 50
  final String? icon;         // "thermometer"
  final Color? color;         // Colors.orange
  
  // Auto-detect từ key name
  factory MetricMetadata.fromJson(String key, Map<String, dynamic> json) {
    return MetricMetadata(
      key: key,
      value: json['value'],
      unit: json['unit'],
      type: _detectType(key, json),
      min: json['min']?.toDouble(),
      max: json['max']?.toDouble(),
      icon: _detectIcon(key),
      color: _detectColor(key),
    );
  }
}
```

### 2. Widget Factory Pattern

```dart
class MetricWidgetFactory {
  static Widget create(MetricMetadata metadata) {
    switch (metadata.type) {
      case MetricType.gauge:
        return GaugeWidget(metadata);
      
      case MetricType.number:
        return NumberWidget(metadata);
      
      case MetricType.switch:
        return SwitchWidget(metadata);
      
      case MetricType.chart:
        return ChartWidget(metadata);
      
      default:
        return GenericWidget(metadata);
    }
  }
}
```

### 3. Responsive Grid Layout

```dart
class MetricsGrid extends StatelessWidget {
  final List<MetricMetadata> metrics;
  
  @override
  Widget build(BuildContext context) {
    return GridView.builder(
      gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
        crossAxisCount: _getCrossAxisCount(context),
        childAspectRatio: 1.5,
        crossAxisSpacing: 12,
        mainAxisSpacing: 12,
      ),
      itemCount: metrics.length,
      itemBuilder: (context, index) {
        return MetricWidgetFactory.create(metrics[index]);
      },
    );
  }
  
  int _getCrossAxisCount(BuildContext context) {
    final width = MediaQuery.of(context).size.width;
    if (width > 600) return 3;  // Tablet
    if (width > 400) return 2;  // Large phone
    return 1;                   // Small phone
  }
}
```

---

## 🏗️ State Management

### Recommendation: Provider Pattern

**Why Provider?**
- Simple và dễ học
- Built-in với Flutter
- Phù hợp với app size vừa phải
- Good performance

**Alternative**: Riverpod, Bloc (nếu app phức tạp hơn)

### Structure:

```dart
// providers/room_provider.dart
class RoomProvider extends ChangeNotifier {
  List<Room> _rooms = [];
  Room? _selectedRoom;
  bool _isLoading = false;
  String? _error;
  
  List<Room> get rooms => _rooms;
  Room? get selectedRoom => _selectedRoom;
  bool get isLoading => _isLoading;
  String? get error => _error;
  
  Future<void> loadRooms() async {
    _isLoading = true;
    _error = null;
    notifyListeners();
    
    try {
      _rooms = await ApiService().getRooms();
      _isLoading = false;
      notifyListeners();
    } catch (e) {
      _error = e.toString();
      _isLoading = false;
      notifyListeners();
    }
  }
  
  void selectRoom(Room room) {
    _selectedRoom = room;
    notifyListeners();
  }
}

// providers/device_provider.dart
class DeviceProvider extends ChangeNotifier {
  Map<String, RoomData> _roomDataCache = {};
  
  Future<RoomData> getRoomData(int roomId) async {
    final cacheKey = roomId.toString();
    
    // Return cached if fresh (< 30s)
    if (_roomDataCache.containsKey(cacheKey)) {
      final cached = _roomDataCache[cacheKey]!;
      if (DateTime.now().difference(cached.timestamp).inSeconds < 30) {
        return cached;
      }
    }
    
    // Fetch fresh data
    final data = await ApiService().getRoomData(roomId);
    _roomDataCache[cacheKey] = data;
    notifyListeners();
    
    return data;
  }
  
  Future<void> controlRelay(String deviceId, int relay, String state) async {
    await ApiService().controlRelay(deviceId, relay, state);
    
    // Invalidate cache
    _roomDataCache.clear();
    notifyListeners();
  }
}
```

### Usage in Widget:

```dart
class RoomListScreen extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return Consumer<RoomProvider>(
      builder: (context, roomProvider, child) {
        if (roomProvider.isLoading) {
          return Center(child: CircularProgressIndicator());
        }
        
        if (roomProvider.error != null) {
          return ErrorWidget(roomProvider.error!);
        }
        
        return ListView.builder(
          itemCount: roomProvider.rooms.length,
          itemBuilder: (context, index) {
            return RoomCard(room: roomProvider.rooms[index]);
          },
        );
      },
    );
  }
}
```

---

## 🎨 UI Components Library

### 1. GaugeWidget (Circular Progress)

```dart
class GaugeWidget extends StatelessWidget {
  final MetricMetadata metadata;
  
  @override
  Widget build(BuildContext context) {
    final percentage = _calculatePercentage();
    
    return Card(
      child: Padding(
        padding: EdgeInsets.all(16),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            // Circular gauge
            SizedBox(
              width: 100,
              height: 100,
              child: CircularProgressIndicator(
                value: percentage,
                strokeWidth: 12,
                backgroundColor: Colors.grey[200],
                valueColor: AlwaysStoppedAnimation(
                  _getColorForValue(percentage)
                ),
              ),
            ),
            SizedBox(height: 12),
            
            // Value
            Text(
              '${metadata.value}${metadata.unit ?? ''}',
              style: TextStyle(
                fontSize: 24,
                fontWeight: FontWeight.bold,
              ),
            ),
            
            // Label
            Text(
              _formatLabel(metadata.key),
              style: TextStyle(
                fontSize: 14,
                color: Colors.grey[600],
              ),
            ),
          ],
        ),
      ),
    );
  }
  
  double _calculatePercentage() {
    if (metadata.min == null || metadata.max == null) return 0.5;
    
    final value = (metadata.value as num).toDouble();
    final range = metadata.max! - metadata.min!;
    return (value - metadata.min!) / range;
  }
  
  Color _getColorForValue(double percentage) {
    if (percentage < 0.3) return Colors.blue;
    if (percentage < 0.7) return Colors.green;
    return Colors.red;
  }
}
```

### 2. NumberWidget (Simple Display)

```dart
class NumberWidget extends StatelessWidget {
  final MetricMetadata metadata;
  
  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: EdgeInsets.all(16),
        child: Row(
          children: [
            // Icon
            Container(
              padding: EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: metadata.color?.withOpacity(0.1),
                borderRadius: BorderRadius.circular(12),
              ),
              child: Icon(
                _getIconData(metadata.icon),
                color: metadata.color,
                size: 32,
              ),
            ),
            SizedBox(width: 16),
            
            // Value & Label
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    _formatLabel(metadata.key),
                    style: TextStyle(
                      fontSize: 14,
                      color: Colors.grey[600],
                    ),
                  ),
                  SizedBox(height: 4),
                  Text(
                    '${metadata.value}${metadata.unit ?? ''}',
                    style: TextStyle(
                      fontSize: 20,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
```

### 3. RelayControlWidget

```dart
class RelayControlWidget extends StatefulWidget {
  final Control control;
  final Function(int relay, String state) onControl;
  
  @override
  _RelayControlWidgetState createState() => _RelayControlWidgetState();
}

class _RelayControlWidgetState extends State<RelayControlWidget> {
  bool _isLoading = false;
  
  @override
  Widget build(BuildContext context) {
    final isOn = widget.control.state == 'ON';
    
    return Card(
      elevation: 2,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(12),
        side: BorderSide(
          color: isOn ? Colors.green : Colors.grey[300]!,
          width: 2,
        ),
      ),
      child: InkWell(
        onTap: _isLoading ? null : _handleTap,
        borderRadius: BorderRadius.circular(12),
        child: Padding(
          padding: EdgeInsets.all(16),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              // Icon
              Icon(
                Icons.lightbulb,
                size: 48,
                color: isOn ? Colors.amber : Colors.grey,
              ),
              SizedBox(height: 8),
              
              // Name
              Text(
                widget.control.name,
                style: TextStyle(
                  fontSize: 16,
                  fontWeight: FontWeight.bold,
                ),
                textAlign: TextAlign.center,
              ),
              SizedBox(height: 8),
              
              // State badge
              Container(
                padding: EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                decoration: BoxDecoration(
                  color: isOn 
                    ? Colors.green.withOpacity(0.2)
                    : Colors.grey.withOpacity(0.2),
                  borderRadius: BorderRadius.circular(20),
                ),
                child: Text(
                  isOn ? 'BẬT' : 'TẮT',
                  style: TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.bold,
                    color: isOn ? Colors.green : Colors.grey,
                  ),
                ),
              ),
              SizedBox(height: 12),
              
              // Control button
              SizedBox(
                width: double.infinity,
                child: ElevatedButton(
                  onPressed: _isLoading ? null : _handleTap,
                  style: ElevatedButton.styleFrom(
                    backgroundColor: isOn ? Colors.red : Colors.green,
                    foregroundColor: Colors.white,
                    padding: EdgeInsets.symmetric(vertical: 12),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(8),
                    ),
                  ),
                  child: _isLoading
                    ? SizedBox(
                        height: 20,
                        width: 20,
                        child: CircularProgressIndicator(
                          strokeWidth: 2,
                          color: Colors.white,
                        ),
                      )
                    : Text(
                        isOn ? 'TẮT' : 'BẬT',
                        style: TextStyle(
                          fontSize: 14,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
  
  Future<void> _handleTap() async {
    setState(() => _isLoading = true);
    
    try {
      final newState = widget.control.state == 'ON' ? 'OFF' : 'ON';
      await widget.onControl(widget.control.relay, newState);
      
      // Show success
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('Đã ${newState == 'ON' ? 'bật' : 'tắt'} ${widget.control.name}'),
          backgroundColor: Colors.green,
          duration: Duration(seconds: 1),
        ),
      );
    } catch (e) {
      // Show error
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('Lỗi: ${e.toString()}'),
          backgroundColor: Colors.red,
        ),
      );
    } finally {
      if (mounted) {
        setState(() => _isLoading = false);
      }
    }
  }
}
```

---

## 🔄 Caching Strategy

### Multi-level Cache:

```dart
class CacheManager {
  // Level 1: Memory cache (fast, volatile)
  static final Map<String, CacheEntry> _memoryCache = {};
  
  // Level 2: Disk cache (persistent)
  static SharedPreferences? _prefs;
  
  static Future<void> init() async {
    _prefs = await SharedPreferences.getInstance();
  }
  
  // Get with fallback
  static Future<T?> get<T>(
    String key,
    Future<T> Function() fetcher, {
    Duration maxAge = const Duration(minutes: 5),
  }) async {
    // Check memory cache
    if (_memoryCache.containsKey(key)) {
      final entry = _memoryCache[key]!;
      if (DateTime.now().difference(entry.timestamp) < maxAge) {
        return entry.data as T;
      }
    }
    
    // Check disk cache
    final diskData = _prefs?.getString(key);
    if (diskData != null) {
      try {
        final data = jsonDecode(diskData);
        _memoryCache[key] = CacheEntry(data, DateTime.now());
        return data as T;
      } catch (e) {
        // Invalid cache, fetch fresh
      }
    }
    
    // Fetch fresh data
    final freshData = await fetcher();
    
    // Update caches
    _memoryCache[key] = CacheEntry(freshData, DateTime.now());
    _prefs?.setString(key, jsonEncode(freshData));
    
    return freshData;
  }
  
  static void invalidate(String key) {
    _memoryCache.remove(key);
    _prefs?.remove(key);
  }
  
  static void invalidateAll() {
    _memoryCache.clear();
    _prefs?.clear();
  }
}

class CacheEntry {
  final dynamic data;
  final DateTime timestamp;
  
  CacheEntry(this.data, this.timestamp);
}
```

---

## 🔐 Security Considerations

### 1. Token Storage
```dart
// Use flutter_secure_storage
final storage = FlutterSecureStorage();

// Store
await storage.write(key: 'auth_token', value: token);

// Read
final token = await storage.read(key: 'auth_token');

// Delete
await storage.delete(key: 'auth_token');
```

### 2. API Key Protection
```dart
// NEVER hardcode API keys in code
// Use environment variables or secure config

class Config {
  static const String apiBaseUrl = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: 'http://localhost:8001',
  );
}
```

### 3. Input Validation
```dart
class Validator {
  static String? validateRelayNumber(int? relay) {
    if (relay == null) return 'Relay không được để trống';
    if (relay < 1 || relay > 8) return 'Relay phải từ 1-8';
    return null;
  }
  
  static String? validateState(String? state) {
    if (state == null) return 'State không được để trống';
    if (!['ON', 'OFF'].contains(state)) return 'State phải là ON hoặc OFF';
    return null;
  }
}
```

---

## 📊 Performance Optimization

### 1. Lazy Loading
```dart
class RoomListScreen extends StatefulWidget {
  @override
  _RoomListScreenState createState() => _RoomListScreenState();
}

class _RoomListScreenState extends State<RoomListScreen> {
  final ScrollController _scrollController = ScrollController();
  List<Room> _rooms = [];
  int _page = 1;
  bool _isLoadingMore = false;
  
  @override
  void initState() {
    super.initState();
    _loadRooms();
    _scrollController.addListener(_onScroll);
  }
  
  void _onScroll() {
    if (_scrollController.position.pixels >= 
        _scrollController.position.maxScrollExtent * 0.8) {
      _loadMore();
    }
  }
  
  Future<void> _loadMore() async {
    if (_isLoadingMore) return;
    
    setState(() => _isLoadingMore = true);
    
    final newRooms = await ApiService().getRooms(page: _page + 1);
    setState(() {
      _rooms.addAll(newRooms);
      _page++;
      _isLoadingMore = false;
    });
  }
}
```

### 2. Image Optimization
```dart
// Use cached_network_image
CachedNetworkImage(
  imageUrl: device.imageUrl,
  placeholder: (context, url) => CircularProgressIndicator(),
  errorWidget: (context, url, error) => Icon(Icons.error),
  fadeInDuration: Duration(milliseconds: 300),
  memCacheWidth: 200,  // Resize in memory
)
```

### 3. Debouncing
```dart
class Debouncer {
  final Duration delay;
  Timer? _timer;
  
  Debouncer({this.delay = const Duration(milliseconds: 500)});
  
  void run(VoidCallback action) {
    _timer?.cancel();
    _timer = Timer(delay, action);
  }
  
  void dispose() {
    _timer?.cancel();
  }
}

// Usage
final _debouncer = Debouncer();

TextField(
  onChanged: (value) {
    _debouncer.run(() {
      _performSearch(value);
    });
  },
)
```

---

## 🧪 Testing Strategy

### 1. Unit Tests
```dart
// test/services/api_service_test.dart
void main() {
  group('ApiService', () {
    test('getRooms returns list of rooms', () async {
      final api = ApiService();
      final rooms = await api.getRooms();
      
      expect(rooms, isA<List<Room>>());
      expect(rooms.length, greaterThan(0));
    });
    
    test('controlRelay sends correct payload', () async {
      final api = ApiService();
      
      await api.controlRelay('device-001', 1, 'ON');
      
      // Verify request was sent correctly
    });
  });
}
```

### 2. Widget Tests
```dart
// test/widgets/relay_control_widget_test.dart
void main() {
  testWidgets('RelayControlWidget displays correctly', (tester) async {
    final control = Control(
      relay: 1,
      name: 'Test Relay',
      state: 'ON',
    );
    
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: RelayControlWidget(
            control: control,
            onControl: (relay, state) {},
          ),
        ),
      ),
    );
    
    expect(find.text('Test Relay'), findsOneWidget);
    expect(find.text('BẬT'), findsOneWidget);
  });
}
```

---

## 📱 Platform-Specific Considerations

### Android
```yaml
# android/app/build.gradle
android {
    compileSdkVersion 33
    
    defaultConfig {
        minSdkVersion 21
        targetSdkVersion 33
    }
}
```

### iOS
```yaml
# ios/Podfile
platform :ios, '12.0'
```

### Permissions
```xml
<!-- Android: android/app/src/main/AndroidManifest.xml -->
<uses-permission android:name="android.permission.INTERNET" />

<!-- iOS: ios/Runner/Info.plist -->
<key>NSAppTransportSecurity</key>
<dict>
    <key>NSAllowsArbitraryLoads</key>
    <true/>
</dict>
```

---

## 🚀 Deployment

### Build Commands:

**Android APK:**
```bash
flutter build apk --release
```

**Android App Bundle:**
```bash
flutter build appbundle --release
```

**iOS:**
```bash
flutter build ios --release
```

### Version Management:
```yaml
# pubspec.yaml
version: 1.0.0+1
# Format: MAJOR.MINOR.PATCH+BUILD_NUMBER
```

---

**Status**: Technical Specification - Ready for Implementation
