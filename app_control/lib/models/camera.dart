class ZoneDefinition {
  final int? id;
  final String zoneName;
  final int zoneIndex;
  final List<List<double>> polygonPoints; // [[x1,y1],[x2,y2],...]
  final bool isEntryZone;

  ZoneDefinition({
    this.id,
    required this.zoneName,
    required this.zoneIndex,
    required this.polygonPoints,
    this.isEntryZone = false,
  });

  factory ZoneDefinition.fromJson(Map<String, dynamic> json) {
    return ZoneDefinition(
      id: json['id'] as int?,
      zoneName: json['zone_name'] as String? ?? json['name'] as String? ?? 'Zone',
      zoneIndex: json['zone_index'] as int? ?? json['index'] as int? ?? 0,
      polygonPoints: _parsePolygonPoints(json['polygon_points'] ?? json['points']),
      isEntryZone: json['is_entry_zone'] == true ||
          json['is_entry_zone'] == 1 ||
          json['is_entry_zone'] == '1' ||
          json['is_entry_zone'] == true,
    );
  }

  static List<List<double>> _parsePolygonPoints(dynamic raw) {
    if (raw == null) return [];
    if (raw is List) {
      return raw.map((p) {
        if (p is List && p.length >= 2) {
          return [double.tryParse('${p[0]}') ?? 0.0, double.tryParse('${p[1]}') ?? 0.0];
        }
        return <double>[];
      }).toList();
    }
    return [];
  }

  Map<String, dynamic> toJson() {
    return {
      if (id != null) 'id': id,
      'zone_name': zoneName,
      'zone_index': zoneIndex,
      'polygon_points': polygonPoints,
      'is_entry_zone': isEntryZone,
    };
  }

  ZoneDefinition copyWith({
    int? id,
    String? zoneName,
    int? zoneIndex,
    List<List<double>>? polygonPoints,
    bool? isEntryZone,
  }) {
    return ZoneDefinition(
      id: id ?? this.id,
      zoneName: zoneName ?? this.zoneName,
      zoneIndex: zoneIndex ?? this.zoneIndex,
      polygonPoints: polygonPoints ?? this.polygonPoints,
      isEntryZone: isEntryZone ?? this.isEntryZone,
    );
  }
}


class RoomCamera {
  final int id;
  final int phongId;
  final String ten;
  final String? ipAddress;
  final int port;
  final String? rtspPath;
  final String? username;
  final bool hasPassword;
  String? streamUrl;  // Changed from final to allow updates
  final int thuTu;
  final bool isActive;
  final DateTime? createdAt;
  final DateTime? updatedAt;
  final List<ZoneDefinition> zones;

  RoomCamera({
    required this.id,
    required this.phongId,
    required this.ten,
    this.ipAddress,
    this.port = 554,
    this.rtspPath,
    this.username,
    this.hasPassword = false,
    this.streamUrl,
    this.thuTu = 0,
    this.isActive = true,
    this.createdAt,
    this.updatedAt,
    this.zones = const [],
  });

  RoomCamera copyWithZoneList(List<ZoneDefinition> newZones) {
    return RoomCamera(
      id: id,
      phongId: phongId,
      ten: ten,
      ipAddress: ipAddress,
      port: port,
      rtspPath: rtspPath,
      username: username,
      hasPassword: hasPassword,
      streamUrl: streamUrl,
      thuTu: thuTu,
      isActive: isActive,
      createdAt: createdAt,
      updatedAt: updatedAt,
      zones: newZones,
    );
  }

  RoomCamera({
    required this.id,
    required this.phongId,
    required this.ten,
    this.ipAddress,
    this.port = 554,
    this.rtspPath,
    this.username,
    this.hasPassword = false,
    this.streamUrl,
    this.thuTu = 0,
    this.isActive = true,
    this.createdAt,
    this.updatedAt,
  });

  factory RoomCamera.fromJson(Map<String, dynamic> json) {
    DateTime? parseDateTime(dynamic value) {
      if (value == null) return null;
      if (value is String) {
        try {
          return DateTime.parse(value);
        } catch (e) {
          return null;
        }
      }
      return null;
    }

    List<ZoneDefinition> parseZones(dynamic raw) {
      if (raw == null) return [];
      if (raw is! List) return [];
      return raw
          .whereType<Map<String, dynamic>>()
          .map((z) => ZoneDefinition.fromJson(z))
          .toList();
    }

    return RoomCamera(
      id: json['id'] as int,
      phongId: json['phong_id'] as int,
      ten: json['ten'] as String? ?? 'Camera',
      ipAddress: json['ip_address'] as String?,
      port: json['port'] as int? ?? 554,
      rtspPath: json['rtsp_path'] as String?,
      username: json['username'] as String?,
      hasPassword: json['has_password'] as bool? ?? false,
      streamUrl: json['stream_url'] as String?,
      thuTu: json['thu_tu'] as int? ?? 0,
      isActive: (json['is_active'] is bool)
          ? json['is_active'] as bool
          : (json['is_active'] is int)
              ? (json['is_active'] as int) == 1
              : (json['is_active'] is String)
                  ? (json['is_active'] as String) == '1' || (json['is_active'] as String).toLowerCase() == 'true'
                  : true,
      createdAt: parseDateTime(json['created_at']),
      updatedAt: parseDateTime(json['updated_at']),
      zones: parseZones(json['zones']),
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'phong_id': phongId,
      'ten': ten,
      'ip_address': ipAddress,
      'port': port,
      'rtsp_path': rtspPath,
      'username': username,
      'has_password': hasPassword,
      'stream_url': streamUrl,
      'thu_tu': thuTu,
      'is_active': isActive,
      'created_at': createdAt?.toIso8601String(),
      'updated_at': updatedAt?.toIso8601String(),
      'zones': zones.map((z) => z.toJson()).toList(),
    };
  }

  /// Build RTSP URL from ip_address + port + rtsp_path.
  /// Returns null if ip_address is missing.
  String? get rtspUrl {
    if (ipAddress == null || ipAddress!.isEmpty) return null;
    final path = rtspPath ?? '';
    return 'rtsp://${ipAddress!}:$port$path';
  }
}
