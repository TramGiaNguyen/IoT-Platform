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
  final String state;
  final bool controllable;

  Control({
    required this.relay,
    required this.name,
    required this.state,
    this.controllable = true,
  });

  factory Control.fromJson(Map<String, dynamic> json) {
    return Control(
      relay: json['relay'] as int,
      name: json['name'] as String,
      state: json['state'] as String,
      controllable: json['controllable'] as bool? ?? true,
    );
  }

  bool get isOn => state.toUpperCase() == 'ON';
  
  String get stateDisplay => isOn ? 'BẬT' : 'TẮT';
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
