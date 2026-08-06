import 'dart:convert';
import 'widget_config.dart';

/// Model gốc của file JSON xuất ra từ trang "Thiết lập điều khiển nội bộ"
/// (StandaloneControllerBuilder). File này chứa toàn bộ thông tin cấu hình
/// ESP cũng như danh sách widget.
class StandaloneConfig {
  final String schemaVersion;
  final String version;
  final String boardType; // 'esp32' | 'esp8266'
  final String orientation; // 'portrait' | 'landscape'
  final String deviceCode;
  final String devicePreset;
  final int customWidth;
  final int customHeight;

  // WiFi AP
  final String apSsid;
  final String apPassword;

  // ESP Web Server
  final int serverPort;
  final String serverEndpoint;

  // IP config (AP mode)
  final String apLocalIp;
  final String apGateway;
  final String apSubnet;

  final List<WidgetConfig> controls;

  final DateTime? exportedAt;

  const StandaloneConfig({
    required this.schemaVersion,
    required this.version,
    required this.boardType,
    required this.orientation,
    required this.deviceCode,
    required this.devicePreset,
    required this.customWidth,
    required this.customHeight,
    required this.apSsid,
    required this.apPassword,
    required this.serverPort,
    required this.serverEndpoint,
    required this.apLocalIp,
    required this.apGateway,
    required this.apSubnet,
    required this.controls,
    this.exportedAt,
  });

  /// Parse từ JSON string.
  factory StandaloneConfig.fromJsonString(String raw) {
    final data = json.decode(raw) as Map<String, dynamic>;
    return StandaloneConfig.fromJson(data);
  }

  factory StandaloneConfig.fromJson(Map<String, dynamic> json) {
    final rawControls = json['controls'];
    final controlsList = <WidgetConfig>[];
    if (rawControls is List) {
      for (final c in rawControls) {
        if (c is Map<String, dynamic>) {
          controlsList.add(WidgetConfig.fromJson(c));
        }
      }
    }

    final exportedAtStr = json['exportedAt'] as String?;
    return StandaloneConfig(
      schemaVersion: (json['schemaVersion'] as String?) ?? '1.0',
      version: (json['version'] as String?) ?? '1.0',
      boardType: (json['boardType'] as String?) ?? 'esp32',
      orientation: (json['orientation'] as String?) ?? 'portrait',
      deviceCode: (json['deviceCode'] as String?) ?? '',
      devicePreset: (json['devicePreset'] as String?) ?? 'iphone-12',
      customWidth: (json['customWidth'] as num?)?.toInt() ?? 360,
      customHeight: (json['customHeight'] as num?)?.toInt() ?? 640,
      apSsid: (json['apSsid'] as String?) ?? 'ESP_Control',
      apPassword: (json['apPassword'] as String?) ?? '12345678',
      serverPort: (json['serverPort'] as num?)?.toInt() ?? 80,
      serverEndpoint: (json['serverEndpoint'] as String?) ?? 'control',
      apLocalIp: (json['apLocalIp'] as String?) ?? '192.168.4.1',
      apGateway: (json['apGateway'] as String?) ?? '192.168.4.1',
      apSubnet: (json['apSubnet'] as String?) ?? '255.255.255.0',
      controls: controlsList,
      exportedAt: exportedAtStr != null ? DateTime.tryParse(exportedAtStr) : null,
    );
  }

  Map<String, dynamic> toJson() => {
        'schemaVersion': schemaVersion,
        'version': version,
        'boardType': boardType,
        'orientation': orientation,
        'deviceCode': deviceCode,
        'devicePreset': devicePreset,
        'customWidth': customWidth,
        'customHeight': customHeight,
        'apSsid': apSsid,
        'apPassword': apPassword,
        'serverPort': serverPort,
        'serverEndpoint': serverEndpoint,
        'apLocalIp': apLocalIp,
        'apGateway': apGateway,
        'apSubnet': apSubnet,
        'controls': controls.map((c) => c.toJson()).toList(),
        if (exportedAt != null) 'exportedAt': exportedAt!.toIso8601String(),
      };

  /// Base URL cho AP mode: http://192.168.4.1:80
  String get apBaseUrl => 'http://$apLocalIp:$serverPort';

  /// Base URL cho STA mode (qua mDNS hostname).
  String get staBaseUrl => 'http://$apSsid.local:$serverPort';

  /// Trả về URL cho HTML UI của ESP (trang điều khiển web-based).
  String get controlPageUrl => '$apBaseUrl/$serverEndpoint';

  /// Lấy widget theo id.
  WidgetConfig? widgetById(String id) {
    for (final c in controls) {
      if (c.id == id) return c;
    }
    return null;
  }

  /// Validate config: schema, controls.
  bool get isValid =>
      schemaVersion.isNotEmpty &&
      apSsid.isNotEmpty &&
      controls.isNotEmpty;
}