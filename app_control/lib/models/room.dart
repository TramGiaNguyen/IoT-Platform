class Room {
  final int id;
  final String name;
  final String? description;
  final int deviceCount;
  final int onlineCount;
  final int occupancy; // so nguoi trong phong
  final DateTime? lastUpdate;

  Room({
    required this.id,
    required this.name,
    this.description,
    required this.deviceCount,
    required this.onlineCount,
    this.occupancy = 0,
    this.lastUpdate,
  });

  factory Room.fromJson(Map<String, dynamic> json) {
    DateTime? parseLastUpdate(dynamic value) {
      if (value == null) return null;
      if (value is String) {
        try {
          return DateTime.parse(value);
        } catch (e) {
          return null;
        }
      }
      if (value is int || value is double) {
        try {
          return DateTime.fromMillisecondsSinceEpoch((value as num).toInt() * 1000);
        } catch (e) {
          return null;
        }
      }
      return null;
    }

    int readOccupancy() {
      final v = json['so_nguoi'] ?? json['occupancy'];
      if (v == null) return 0;
      if (v is int) return v;
      if (v is num) return v.toInt();
      return int.tryParse(v.toString()) ?? 0;
    }

    return Room(
      id: json['id'] as int,
      name: json['name'] as String,
      description: json['description'] as String?,
      deviceCount: json['device_count'] as int? ?? 0,
      onlineCount: json['online_count'] as int? ?? 0,
      occupancy: readOccupancy(),
      lastUpdate: parseLastUpdate(json['last_update']),
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'name': name,
      'description': description,
      'device_count': deviceCount,
      'online_count': onlineCount,
      'occupancy': occupancy,
      'last_update': lastUpdate?.toIso8601String(),
    };
  }

  // Helper getters
  int get offlineCount => deviceCount - onlineCount;

  bool get hasDevices => deviceCount > 0;

  bool get allOnline => deviceCount > 0 && onlineCount == deviceCount;

  bool get hasOccupancy => occupancy > 0;

  String get statusText {
    if (deviceCount == 0) return 'Chưa có thiết bị';
    if (allOnline) return 'Tất cả online';
    return '$onlineCount/$deviceCount online';
  }

  String get occupancyText {
    if (occupancy <= 0) return 'Khong co nguoi';
    if (occupancy == 1) return '1 nguoi';
    return '$occupancy nguoi';
  }
}
