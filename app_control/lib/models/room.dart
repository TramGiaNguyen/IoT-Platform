class Room {
  final int id;
  final String name;
  final String? description;
  final int deviceCount;
  final int onlineCount;
  final int occupancy; // so nguoi trong phong
  final DateTime? lastUpdate;

  // Permission / assignment metadata (admin can assign this room to teacher/student)
  final int? nguoiSoHuuId;
  final String? nguoiSoHuuTen;
  final bool canEdit;
  final bool canDelete;
  final bool isAssigned;

  Room({
    required this.id,
    required this.name,
    this.description,
    required this.deviceCount,
    required this.onlineCount,
    this.occupancy = 0,
    this.lastUpdate,
    this.nguoiSoHuuId,
    this.nguoiSoHuuTen,
    this.canEdit = true,
    this.canDelete = true,
    this.isAssigned = false,
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

    int? readIntOrNull(dynamic v) {
      if (v == null) return null;
      if (v is int) return v;
      if (v is num) return v.toInt();
      return int.tryParse(v.toString());
    }

    bool readBool(dynamic v, {bool defaultValue = true}) {
      if (v == null) return defaultValue;
      if (v is bool) return v;
      if (v is num) return v != 0;
      if (v is String) {
        final s = v.toLowerCase();
        if (s == 'true' || s == '1') return true;
        if (s == 'false' || s == '0') return false;
      }
      return defaultValue;
    }

    return Room(
      id: json['id'] as int,
      name: json['name'] as String,
      description: json['description'] as String?,
      deviceCount: json['device_count'] as int? ?? 0,
      onlineCount: json['online_count'] as int? ?? 0,
      occupancy: readOccupancy(),
      lastUpdate: parseLastUpdate(json['last_update']),
      nguoiSoHuuId: readIntOrNull(json['nguoi_so_huu_id']),
      nguoiSoHuuTen: json['nguoi_so_huu_ten'] as String?,
      canEdit: readBool(json['can_edit'], defaultValue: true),
      canDelete: readBool(json['can_delete'], defaultValue: true),
      isAssigned: readBool(json['is_assigned'], defaultValue: false),
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
      'nguoi_so_huu_id': nguoiSoHuuId,
      'nguoi_so_huu_ten': nguoiSoHuuTen,
      'can_edit': canEdit,
      'can_delete': canDelete,
      'is_assigned': isAssigned,
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
    if (occupancy <= 0) return 'Không có người';
    if (occupancy == 1) return '1 nguoi';
    return '$occupancy nguoi';
  }
}
