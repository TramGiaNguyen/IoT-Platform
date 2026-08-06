import 'dart:convert';

import 'package:shared_preferences/shared_preferences.dart';

import '../models/device_history_entry.dart';
import '../models/standalone_config.dart';

/// Thin wrapper over [SharedPreferences] that persists the user's saved
/// devices and their full [StandaloneConfig] payloads.
///
/// Storage layout:
/// - `device_history_v1` : JSON array of [DeviceHistoryEntry] metadata
///   (newest first). Capped at [maxEntries] entries - oldest are dropped.
/// - `device_config_<deviceCode>` : full [StandaloneConfig] JSON per device,
///   keyed by sanitized `deviceCode`. Used to rehydrate [StandaloneConfig]
///   when the user taps a row in the home list without re-reading the entire
///   history array.
class DeviceHistoryService {
  static const String _kListKey = 'device_history_v1';
  static const int maxEntries = 50;

  final SharedPreferences _prefs;
  DeviceHistoryService(this._prefs);

  /// Convenience constructor - resolves [SharedPreferences.getInstance]
  /// internally. Prefer this in screens; pass `_prefs` directly in tests.
  static Future<DeviceHistoryService> create() async {
    final prefs = await SharedPreferences.getInstance();
    return DeviceHistoryService(prefs);
  }

  String _configKey(String deviceCode) =>
      'device_config_${deviceCode.replaceAll(RegExp(r'[^a-zA-Z0-9_-]'), '_')}';

  /// Read all saved entries, newest first. Returns an empty list on first run.
  List<DeviceHistoryEntry> getAll() {
    final raw = _prefs.getString(_kListKey);
    if (raw == null || raw.isEmpty) return <DeviceHistoryEntry>[];
    try {
      final decoded = json.decode(raw) as List<dynamic>;
      return decoded
          .whereType<Map<String, dynamic>>()
          .map(DeviceHistoryEntry.fromJson)
          .toList();
    } catch (_) {
      return <DeviceHistoryEntry>[];
    }
  }

  /// Upsert an entry by [DeviceHistoryEntry.deviceCode]. The entry becomes the
  /// newest (first) item; older entries are pushed down. When the list grows
  /// past [maxEntries], the oldest are dropped. The full config is also
  /// persisted under a per-device key so [loadConfigForDevice] can hydrate it.
  Future<void> add(DeviceHistoryEntry entry) async {
    final all = getAll().where((e) => e.deviceCode != entry.deviceCode).toList();
    all.insert(0, entry);
    if (all.length > maxEntries) {
      all.removeRange(maxEntries, all.length);
    }
    await _prefs.setString(
      _kListKey,
      json.encode(all.map((e) => e.toJson()).toList()),
    );
    await _prefs.setString(
      _configKey(entry.deviceCode),
      json.encode(entry.fullConfig),
    );
  }

  /// Alias for [add] - keeps the call-site readable when an existing entry
  /// is being mutated (e.g. from [ConfigEditScreen]).
  Future<void> update(DeviceHistoryEntry entry) async => add(entry);

  /// Remove a device from history and delete its per-device config blob.
  /// No-op if the device is not present.
  Future<void> remove(String deviceCode) async {
    final all = getAll().where((e) => e.deviceCode != deviceCode).toList();
    await _prefs.setString(
      _kListKey,
      json.encode(all.map((e) => e.toJson()).toList()),
    );
    await _prefs.remove(_configKey(deviceCode));
  }

  /// Rehydrate a [StandaloneConfig] for the given device, or `null` if not
  /// stored (e.g. the per-device blob was deleted manually).
  StandaloneConfig? loadConfigForDevice(String deviceCode) {
    final raw = _prefs.getString(_configKey(deviceCode));
    if (raw == null || raw.isEmpty) return null;
    try {
      return StandaloneConfig.fromJsonString(raw);
    } catch (_) {
      return null;
    }
  }

  /// Wipe everything (used by debug / future "reset" buttons).
  Future<void> clear() async {
    final all = getAll();
    for (final e in all) {
      await _prefs.remove(_configKey(e.deviceCode));
    }
    await _prefs.remove(_kListKey);
  }
}