import 'device.dart';

class RoomData {
  final int roomId;
  final String roomName;
  final List<Device> devices;
  final DateTime timestamp;

  RoomData({
    required this.roomId,
    required this.roomName,
    required this.devices,
    DateTime? timestamp,
  }) : timestamp = timestamp ?? DateTime.now();

  factory RoomData.fromJson(Map<String, dynamic> json) {
    final devicesList = <Device>[];
    if (json['devices'] != null) {
      for (var deviceJson in json['devices'] as List) {
        devicesList.add(Device.fromJson(deviceJson as Map<String, dynamic>));
      }
    }

    return RoomData(
      roomId: json['room_id'] as int? ?? json['room']?['id'] as int,
      roomName: json['room_name'] as String? ?? json['room']?['name'] as String,
      devices: devicesList,
    );
  }

  // Helper getters
  int get deviceCount => devices.length;
  
  int get onlineCount => devices.where((d) => d.isOnline).length;
  
  int get offlineCount => deviceCount - onlineCount;
  
  bool get hasDevices => devices.isNotEmpty;
  
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
