import 'dart:convert';

/// Override layout for a single widget: position (x, y) and size (width, height).
/// All values are in grid cells (not pixels).
class WidgetLayoutOverride {
  final int x;
  final int y;
  final int width;
  final int height;

  const WidgetLayoutOverride({
    required this.x,
    required this.y,
    required this.width,
    required this.height,
  });

  factory WidgetLayoutOverride.fromJson(Map<String, dynamic> json) {
    return WidgetLayoutOverride(
      x: (json['x'] as num?)?.toInt() ?? 0,
      y: (json['y'] as num?)?.toInt() ?? 0,
      width: (json['width'] as num?)?.toInt() ?? 2,
      height: (json['height'] as num?)?.toInt() ?? 2,
    );
  }

  Map<String, dynamic> toJson() => {
        'x': x,
        'y': y,
        'width': width,
        'height': height,
      };

  WidgetLayoutOverride copyWith({
    int? x,
    int? y,
    int? width,
    int? height,
  }) =>
      WidgetLayoutOverride(
        x: x ?? this.x,
        y: y ?? this.y,
        width: width ?? this.width,
        height: height ?? this.height,
      );

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is WidgetLayoutOverride &&
          runtimeType == other.runtimeType &&
          x == other.x &&
          y == other.y &&
          width == other.width &&
          height == other.height;

  @override
  int get hashCode => Object.hash(x, y, width, height);
}

/// Container for all layout overrides for a single device.
/// Stored per-device in SharedPreferences.
class LayoutOverride {
  final String deviceCode;
  final Map<String, WidgetLayoutOverride> overrides;
  final DateTime lastModified;

  const LayoutOverride({
    required this.deviceCode,
    required this.overrides,
    required this.lastModified,
  });

  factory LayoutOverride.fromJson(Map<String, dynamic> json) {
    final raw = json['overrides'] as Map<String, dynamic>?;
    final overrides = <String, WidgetLayoutOverride>{};
    if (raw != null) {
      for (final entry in raw.entries) {
        if (entry.value is Map) {
          overrides[entry.key] = WidgetLayoutOverride.fromJson(
              entry.value as Map<String, dynamic>);
        }
      }
    }
    return LayoutOverride(
      deviceCode: (json['deviceCode'] ?? '').toString(),
      overrides: overrides,
      lastModified: DateTime.tryParse((json['lastModified'] ?? '').toString()) ??
          DateTime.now(),
    );
  }

  Map<String, dynamic> toJson() => {
        'deviceCode': deviceCode,
        'overrides': overrides.map((k, v) => MapEntry(k, v.toJson())),
        'lastModified': lastModified.toIso8601String(),
      };

  LayoutOverride copyWith({
    String? deviceCode,
    Map<String, WidgetLayoutOverride>? overrides,
    DateTime? lastModified,
  }) =>
      LayoutOverride(
        deviceCode: deviceCode ?? this.deviceCode,
        overrides: overrides ?? this.overrides,
        lastModified: lastModified ?? this.lastModified,
      );

  /// Get override for a widget, or null if not overridden.
  WidgetLayoutOverride? get(String widgetId) => overrides[widgetId];

  /// Return a new LayoutOverride with the given widget override applied.
  LayoutOverride withOverride(String widgetId, WidgetLayoutOverride override) {
    final newMap = Map<String, WidgetLayoutOverride>.from(overrides);
    newMap[widgetId] = override;
    return copyWith(overrides: newMap, lastModified: DateTime.now());
  }

  /// Return a new LayoutOverride with the given widget removed.
  LayoutOverride withoutOverride(String widgetId) {
    final newMap = Map<String, WidgetLayoutOverride>.from(overrides);
    newMap.remove(widgetId);
    return copyWith(overrides: newMap, lastModified: DateTime.now());
  }
}
