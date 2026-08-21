import 'device.dart';
import 'camera.dart';

class RoomData {
  final int roomId;
  final String roomName;
  final List<Device> devices;
  final List<RoomCamera> cameras;
  final DateTime timestamp;
  /// room_total từ `phong_occupancy` (cùng GET /rooms/{id}/data).
  final int soNguoiTrongPhong;
  /// Danh sách các field key được hiển thị trên app.
  /// NULL/empty = hiển thị tất cả (backward compatible).
  final List<String>? appDisplayFields;

  RoomData({
    required this.roomId,
    required this.roomName,
    required this.devices,
    this.cameras = const [],
    DateTime? timestamp,
    this.soNguoiTrongPhong = 0,
    this.appDisplayFields,
  }) : timestamp = timestamp ?? DateTime.now();

  factory RoomData.fromJson(Map<String, dynamic> json) {
    final devicesList = <Device>[];
    if (json['devices'] != null) {
      for (var deviceJson in json['devices'] as List) {
        devicesList.add(Device.fromJson(deviceJson as Map<String, dynamic>));
      }
    }

    final camerasList = <RoomCamera>[];
    if (json['cameras'] != null) {
      for (var cameraJson in json['cameras'] as List) {
        camerasList.add(RoomCamera.fromJson(cameraJson as Map<String, dynamic>));
      }
    }

    int readSoNguoi() {
      final v = json['so_nguoi'] ?? json['so_nguoi_trong_phong'];
      if (v == null) return 0;
      if (v is int) return v;
      if (v is num) return v.toInt();
      return int.tryParse(v.toString()) ?? 0;
    }

    // Parse app_display_fields from API response
    List<String>? parseAppDisplayFields() {
      final fields = json['app_display_fields'];
      if (fields == null) return null;
      if (fields is List) {
        return fields.map((e) => e.toString()).toList();
      }
      return null;
    }

    return RoomData(
      roomId: json['room_id'] as int? ?? json['room']?['id'] as int,
      roomName: json['room_name'] as String? ?? json['room']?['name'] as String,
      devices: devicesList,
      cameras: camerasList,
      soNguoiTrongPhong: readSoNguoi(),
      appDisplayFields: parseAppDisplayFields(),
    );
  }

  /// Kiểm tra xem một field key có được hiển thị không.
  /// - Nếu appDisplayFields là NULL/empty: hiển thị tất cả (backward compatible).
  /// - Nếu có giá trị: chỉ hiển thị các fields trong danh sách.
  bool shouldDisplayField(String fieldKey) {
    if (appDisplayFields == null || appDisplayFields!.isEmpty) {
      return true; // Hiển thị tất cả
    }
    return appDisplayFields!.contains(fieldKey);
  }

  // Helper getters
  int get deviceCount => devices.length;
  
  int get onlineCount => devices.where((d) => d.isOnline).length;
  
  int get offlineCount => deviceCount - onlineCount;
  
  bool get hasDevices => devices.isNotEmpty;

  int get cameraCount => cameras.length;
  
  bool get hasCameras => cameras.isNotEmpty;
  
  List<RoomCamera> get activeCameras => cameras.where((c) => c.isActive).toList();
  
  List<Device> get onlineDevices => devices.where((d) => d.isOnline).toList();
  
  List<Device> get offlineDevices => devices.where((d) => !d.isOnline).toList();
  
  // Get all controls from all devices
  List<Control> get allControls {
    final controls = <Control>[];
    for (var device in devices) {
      controls.addAll(device.controls);
    }
    return controls;
  }
  
  // Get all metrics from all devices
  Map<String, List<Metric>> get allMetrics {
    final metrics = <String, List<Metric>>{};
    for (var device in devices) {
      device.metrics.forEach((key, metric) {
        if (!metrics.containsKey(key)) {
          metrics[key] = [];
        }
        metrics[key]!.add(metric);
      });
    }
    return metrics;
  }
  
  // Check if data is fresh (< 30 seconds old)
  bool get isFresh {
    return DateTime.now().difference(timestamp).inSeconds < 30;
  }
}
