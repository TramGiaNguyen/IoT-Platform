import 'standalone_config.dart';

/// Metadata + full StandaloneConfig payload for a single device the user has
/// connected to (or attempted to connect to). Stored locally via
/// [DeviceHistoryService] so the home screen can show an offline list of
/// devices and rehydrate the [StandaloneConfig] when the user taps one.
///
/// Primary key is [deviceCode] (matches the `deviceCode` field exported by
/// React Dashboard's StandaloneControllerBuilder).
class DeviceHistoryEntry {
  final String deviceCode;
  final String devicePreset;
  final String apSsid;
  final String apPassword;
  final String apLocalIp;
  final int serverPort;
  final String serverEndpoint;
  final String apGateway;
  final String apSubnet;
  final int widgetCount;
  final DateTime lastConnectedAt;
  final DateTime createdAt;

  /// Full original JSON config (kept so we can rehydrate a [StandaloneConfig]
  /// later without re-fetching from anywhere).
  final Map<String, dynamic> fullConfig;

  const DeviceHistoryEntry({
    required this.deviceCode,
    required this.devicePreset,
    required this.apSsid,
    required this.apPassword,
    required this.apLocalIp,
    required this.serverPort,
    required this.serverEndpoint,
    required this.apGateway,
    required this.apSubnet,
    required this.widgetCount,
    required this.lastConnectedAt,
    required this.createdAt,
    required this.fullConfig,
  });

  /// Build an entry from a parsed [StandaloneConfig]. Use [createdAt] to keep
  /// the original creation time when re-saving an existing entry; defaults to
  /// `DateTime.now()`.
  factory DeviceHistoryEntry.fromStandaloneConfig(
    StandaloneConfig cfg, {
    DateTime? createdAt,
    DateTime? lastConnectedAt,
  }) {
    return DeviceHistoryEntry(
      deviceCode: cfg.deviceCode,
      devicePreset: cfg.devicePreset,
      apSsid: cfg.apSsid,
      apPassword: cfg.apPassword,
      apLocalIp: cfg.apLocalIp,
      serverPort: cfg.serverPort,
      serverEndpoint: cfg.serverEndpoint,
      apGateway: cfg.apGateway,
      apSubnet: cfg.apSubnet,
      widgetCount: cfg.controls.length,
      fullConfig: cfg.toJson(),
      createdAt: createdAt ?? DateTime.now(),
      lastConnectedAt: lastConnectedAt ?? DateTime.now(),
    );
  }

  /// Rehydrate a [StandaloneConfig] from the persisted [fullConfig].
  StandaloneConfig toStandaloneConfig() =>
      StandaloneConfig.fromJson(fullConfig);

  Map<String, dynamic> toJson() => {
        'deviceCode': deviceCode,
        'devicePreset': devicePreset,
        'apSsid': apSsid,
        'apPassword': apPassword,
        'apLocalIp': apLocalIp,
        'serverPort': serverPort,
        'serverEndpoint': serverEndpoint,
        'apGateway': apGateway,
        'apSubnet': apSubnet,
        'widgetCount': widgetCount,
        'lastConnectedAt': lastConnectedAt.toIso8601String(),
        'createdAt': createdAt.toIso8601String(),
        'fullConfig': fullConfig,
      };

  factory DeviceHistoryEntry.fromJson(Map<String, dynamic> json) {
    return DeviceHistoryEntry(
      deviceCode: (json['deviceCode'] ?? '').toString(),
      devicePreset: (json['devicePreset'] ?? 'iphone-12').toString(),
      apSsid: (json['apSsid'] ?? '').toString(),
      apPassword: (json['apPassword'] ?? '').toString(),
      apLocalIp: (json['apLocalIp'] ?? '192.168.4.1').toString(),
      serverPort: (json['serverPort'] as num?)?.toInt() ?? 80,
      serverEndpoint: (json['serverEndpoint'] ?? 'control').toString(),
      apGateway: (json['apGateway'] ?? '192.168.4.1').toString(),
      apSubnet: (json['apSubnet'] ?? '255.255.255.0').toString(),
      widgetCount: (json['widgetCount'] as num?)?.toInt() ?? 0,
      lastConnectedAt:
          DateTime.tryParse(json['lastConnectedAt']?.toString() ?? '') ??
              DateTime.now(),
      createdAt:
          DateTime.tryParse(json['createdAt']?.toString() ?? '') ??
              DateTime.now(),
      fullConfig:
          (json['fullConfig'] as Map?)?.cast<String, dynamic>() ?? const {},
    );
  }

  DeviceHistoryEntry copyWith({
    String? deviceCode,
    String? apSsid,
    String? apPassword,
    String? apLocalIp,
    int? serverPort,
    String? serverEndpoint,
    String? apGateway,
    String? apSubnet,
    DateTime? lastConnectedAt,
    int? widgetCount,
    Map<String, dynamic>? fullConfig,
  }) =>
      DeviceHistoryEntry(
        deviceCode: deviceCode ?? this.deviceCode,
        devicePreset: devicePreset,
        apSsid: apSsid ?? this.apSsid,
        apPassword: apPassword ?? this.apPassword,
        apLocalIp: apLocalIp ?? this.apLocalIp,
        serverPort: serverPort ?? this.serverPort,
        serverEndpoint: serverEndpoint ?? this.serverEndpoint,
        apGateway: apGateway ?? this.apGateway,
        apSubnet: apSubnet ?? this.apSubnet,
        widgetCount: widgetCount ?? this.widgetCount,
        lastConnectedAt: lastConnectedAt ?? this.lastConnectedAt,
        createdAt: createdAt,
        fullConfig: fullConfig ?? this.fullConfig,
      );

  /// Display title for list rows - prefer deviceCode, fall back to SSID.
  String get displayTitle =>
      deviceCode.isNotEmpty ? deviceCode : apSsid;
}