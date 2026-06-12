import 'control_type.dart';

enum SyncStatus {
  synced,
  pending,
  failed;

  static SyncStatus fromString(String? value) {
    switch (value?.toLowerCase()) {
      case 'pending':
        return SyncStatus.pending;
      case 'failed':
        return SyncStatus.failed;
      default:
        return SyncStatus.synced;
    }
  }
}

class Device {
  final String deviceId;
  final String name;
  final String? type;
  final String status;
  final DateTime? lastSeen;
  final Map<String, Metric> metrics;
  final List<Control> controls;

  Device({
    required this.deviceId,
    required this.name,
    this.type,
    required this.status,
    this.lastSeen,
    required this.metrics,
    required this.controls,
  });

  factory Device.fromJson(Map<String, dynamic> json) {
    DateTime? parseLastSeen(dynamic value) {
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

    // Parse metrics
    final metricsMap = <String, Metric>{};
    if (json['metrics'] != null) {
      (json['metrics'] as Map<String, dynamic>).forEach((key, value) {
        metricsMap[key] = Metric.fromJson(key, value as Map<String, dynamic>);
      });
    }

    // Parse controls
    final controlsList = <Control>[];
    if (json['controls'] != null) {
      for (var controlJson in json['controls'] as List) {
        controlsList.add(Control.fromJson(controlJson as Map<String, dynamic>));
      }
    }

    return Device(
      deviceId: json['device_id'] as String,
      name: json['name'] as String,
      type: json['type'] as String?,
      status: json['status'] as String? ?? 'unknown',
      lastSeen: parseLastSeen(json['last_seen']),
      metrics: metricsMap,
      controls: controlsList,
    );
  }

  bool get isOnline => status.toLowerCase() == 'online';

  bool get hasMetrics => metrics.isNotEmpty;

  bool get hasControls => controls.isNotEmpty;

  Device copyWith({
    String? deviceId,
    String? name,
    String? type,
    String? status,
    DateTime? lastSeen,
    Map<String, Metric>? metrics,
    List<Control>? controls,
  }) {
    return Device(
      deviceId: deviceId ?? this.deviceId,
      name: name ?? this.name,
      type: type ?? this.type,
      status: status ?? this.status,
      lastSeen: lastSeen ?? this.lastSeen,
      metrics: metrics ?? this.metrics,
      controls: controls ?? this.controls,
    );
  }

  String get statusDisplay {
    switch (status.toLowerCase()) {
      case 'online':
        return 'Đang hoạt động';
      case 'offline':
        return 'Ngoại tuyến';
      case 'error':
        return 'Lỗi';
      default:
        return 'Không xác định';
    }
  }
}

class Control {
  final int relay;
  final String name;
  final String state; // reportedState -- gia tri tu telemetry gateway
  final bool controllable;
  final ControlType controlType;
  /// Gia tri dang cho xac nhan (VD: "ON" sau khi user bat nut)
  final String? targetValue;
  /// Trang thai dong bo hoa
  final SyncStatus syncStatus;
  /// Thoi diem nut duoc bam (dung de tinh timeout)
  final DateTime? pendingAt;
  /// So giay cho phep cho pending (mac dinh 10s)
  final int pendingTimeoutSecs;

  Control({
    required this.relay,
    required this.name,
    required this.state,
    this.controllable = true,
    this.controlType = ControlType.onOff,
    this.targetValue,
    this.syncStatus = SyncStatus.synced,
    this.pendingAt,
    this.pendingTimeoutSecs = 10,
  });

  factory Control.fromJson(Map<String, dynamic> json) {
    DateTime? parsePendingAt(dynamic value) {
      if (value == null) return null;
      if (value is String) {
        try {
          return DateTime.parse(value);
        } catch (_) {
          return null;
        }
      }
      if (value is int || value is double) {
        try {
          return DateTime.fromMillisecondsSinceEpoch((value as num).toInt());
        } catch (_) {
          return null;
        }
      }
      return null;
    }

    return Control(
      relay: json['relay'] as int,
      name: json['name'] as String,
      state: json['state'] as String,
      controllable: json['controllable'] as bool? ?? true,
      controlType: ControlType.fromString(json['control_type'] as String?),
      targetValue: json['target_value'] as String?,
      syncStatus: SyncStatus.fromString(json['sync_status'] as String?),
      pendingAt: parsePendingAt(json['pending_at']),
      pendingTimeoutSecs: json['pending_timeout_secs'] as int? ?? 10,
    );
  }

  /// Co pending command hay khong
  bool get isPending => pendingAt != null && targetValue != null;

  /// Gia tri thuc te (reportedState) -- dung cho logic isOn
  String get actualState => state;

  /// Gia tri de hien thi tren UI
  String get displayState {
    if (isPending) return '$targetValue pending';
    return stateDisplay;
  }

  /// Co bi timeout chua
  bool get isTimedOut =>
      isPending &&
      DateTime.now().difference(pendingAt!).inSeconds >= pendingTimeoutSecs;

  bool get isOn => actualState.toUpperCase() == 'ON';
  bool get isPress => actualState.toUpperCase() == 'PRESS';

  String get stateDisplay {
    switch (controlType) {
      case ControlType.toggle:
        return state.isEmpty ? 'OFF' : state;
      case ControlType.momentary:
        return isPress ? 'ĐANG NHẤN' : 'SẴN SÀNG';
      case ControlType.onOff:
      default:
        return isOn ? 'BẬT' : 'TẮT';
    }
  }

  Map<String, dynamic> toJson() {
    return {
      'relay': relay,
      'name': name,
      'state': state,
      'controllable': controllable,
      'control_type': controlType.name,
      'target_value': targetValue,
      'sync_status': syncStatus.name,
      'pending_at': pendingAt?.millisecondsSinceEpoch,
      'pending_timeout_secs': pendingTimeoutSecs,
    };
  }

  Control copyWith({
    int? relay,
    String? name,
    String? state,
    bool? controllable,
    ControlType? controlType,
    String? targetValue,
    SyncStatus? syncStatus,
    DateTime? pendingAt,
    int? pendingTimeoutSecs,
    // Dung de xoa pending: truyen explicit null
    bool clearPending = false,
  }) {
    return Control(
      relay: relay ?? this.relay,
      name: name ?? this.name,
      state: state ?? this.state,
      controllable: controllable ?? this.controllable,
      controlType: controlType ?? this.controlType,
      targetValue: clearPending ? null : (targetValue ?? this.targetValue),
      syncStatus: clearPending ? SyncStatus.synced : (syncStatus ?? this.syncStatus),
      pendingAt: clearPending ? null : (pendingAt ?? this.pendingAt),
      pendingTimeoutSecs: pendingTimeoutSecs ?? this.pendingTimeoutSecs,
    );
  }
}

class Metric {
  final String key;
  final dynamic value;
  final String? unit;
  final String type;
  final double? min;
  final double? max;
  final String? icon;
  final String? color;

  Metric({
    required this.key,
    required this.value,
    this.unit,
    required this.type,
    this.min,
    this.max,
    this.icon,
    this.color,
  });

  factory Metric.fromJson(String key, Map<String, dynamic> json) {
    // Safe parse for unit (can be string or null)
    String? parseUnit(dynamic value) {
      if (value == null) return null;
      return value.toString();
    }

    // Safe parse for min/max (can be int, double, or null)
    double? parseDouble(dynamic value) {
      if (value == null) return null;
      if (value is num) return value.toDouble();
      if (value is String) {
        try {
          return double.parse(value);
        } catch (e) {
          return null;
        }
      }
      return null;
    }

    return Metric(
      key: key,
      value: json['value'],
      unit: parseUnit(json['unit']),
      type: json['type'] as String? ?? 'generic',
      min: parseDouble(json['min']),
      max: parseDouble(json['max']),
      icon: json['icon'] as String?,
      color: json['color'] as String?,
    );
  }

  // Helper để format display value
  String get displayValue {
    if (value == null) return 'N/A';
    
    if (value is num) {
      final numValue = value as num;
      if (numValue == numValue.toInt()) {
        return numValue.toInt().toString();
      }
      return numValue.toStringAsFixed(1);
    }
    
    return value.toString();
  }

  String get displayText => '$displayValue${unit ?? ''}';
  
  // Helper để format label
  String get displayLabel {
    // Handle empty or null key
    if (key.isEmpty) return 'Unknown';
    
    // Convert snake_case to Title Case
    return key
        .split('_')
        .where((word) => word.isNotEmpty) // Filter out empty strings
        .map((word) => word[0].toUpperCase() + word.substring(1))
        .join(' ');
  }
}
