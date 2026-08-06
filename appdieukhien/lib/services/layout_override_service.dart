import 'dart:convert';

import 'package:shared_preferences/shared_preferences.dart';

import '../models/layout_override.dart';

/// Persists layout overrides per device into SharedPreferences.
/// Key pattern: `layout_override_v1_{sanitizedDeviceCode}`
class LayoutOverrideService {
  static const String _kPrefix = 'layout_override_v1_';

  final SharedPreferences _prefs;

  LayoutOverrideService(this._prefs);

  static Future<LayoutOverrideService> create() async {
    final prefs = await SharedPreferences.getInstance();
    return LayoutOverrideService(prefs);
  }

  String _key(String deviceCode) =>
      '$_kPrefix${deviceCode.replaceAll(RegExp(r'[^a-zA-Z0-9_-]'), '_')}';

  /// Load overrides for a device, or null if none stored.
  LayoutOverride? loadOverride(String deviceCode) {
    final raw = _prefs.getString(_key(deviceCode));
    if (raw == null || raw.isEmpty) return null;
    try {
      return LayoutOverride.fromJson(
          json.decode(raw) as Map<String, dynamic>);
    } catch (_) {
      return null;
    }
  }

  /// Save overrides for a device.
  Future<void> saveOverride(LayoutOverride override) async {
    await _prefs.setString(
      _key(override.deviceCode),
      json.encode(override.toJson()),
    );
  }

  /// Clear overrides for a device.
  Future<void> clearOverride(String deviceCode) async {
    await _prefs.remove(_key(deviceCode));
  }

  /// Check if a device has any overrides.
  bool hasOverride(String deviceCode) {
    return _prefs.containsKey(_key(deviceCode));
  }
}
