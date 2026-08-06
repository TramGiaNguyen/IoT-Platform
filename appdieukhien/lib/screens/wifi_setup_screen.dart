import 'package:app_settings/app_settings.dart';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../models/device_history_entry.dart';
import '../services/config_provider.dart';
import '../services/device_history_service.dart';
import '../services/esp_client.dart';
import '../services/wifi_helper.dart';
import 'control_screen.dart';

/// Hướng dẫn user kết nối WiFi ESP và xác nhận trước khi vào màn hình điều khiển.
class WiFiSetupScreen extends StatefulWidget {
  const WiFiSetupScreen({super.key});

  @override
  State<WiFiSetupScreen> createState() => _WiFiSetupScreenState();
}

class _WiFiSetupScreenState extends State<WiFiSetupScreen> {
  final EspClient _espClient = EspClient();
  final WiFiHelper _wifiHelper = WiFiHelper();
  String? _currentSsid;
  bool _checkingWifi = false;
  bool _pinging = false;
  String? _reachableBase;
  String? _errorMsg;

  @override
  void initState() {
    super.initState();
    _refreshSsid();
  }

  Future<void> _refreshSsid() async {
    setState(() => _checkingWifi = true);
    final ssid = await _wifiHelper.getCurrentSsid();
    setState(() {
      _currentSsid = ssid;
      _checkingWifi = false;
    });
  }

  Future<void> _tryConnectEsp() async {
    final cfg = context.read<ConfigProvider>().config;
    if (cfg == null) return;

    setState(() {
      _pinging = true;
      _reachableBase = null;
      _errorMsg = null;
    });

    final urls = _espClient.candidateBaseUrls(
      cfg.controls.first,
      apSsid: cfg.apSsid,
      apPassword: cfg.apPassword,
      serverPort: cfg.serverPort,
      serverEndpoint: cfg.serverEndpoint,
      apLocalIp: cfg.apLocalIp,
    );

    final reachable = await _espClient.findReachableEsp(urls,
        serverEndpoint: cfg.serverEndpoint);

    setState(() {
      _pinging = false;
      if (reachable != null) {
        _reachableBase = reachable;
        context.read<ConfigProvider>().setActiveBaseUrl(reachable);
        _persistToHistory();
      } else {
        _errorMsg = 'Không kết nối được ESP. Hãy chắc chắn đã kết nối WiFi "${cfg.apSsid}"';
      }
    });
  }

  /// Upsert the active config into local history on every successful
  /// connection. Idempotent - `DeviceHistoryService.add` overwrites by
  /// `deviceCode` and refreshes `lastConnectedAt`.
  Future<void> _persistToHistory() async {
    final cfg = context.read<ConfigProvider>().config;
    if (cfg == null) return;
    final entry = DeviceHistoryEntry.fromStandaloneConfig(cfg);
    final service = await DeviceHistoryService.create();
    await service.add(entry);
  }

  Future<void> _openWifiSettings() async {
    await AppSettings.openAppSettings();
    if (!mounted) return;
    await _refreshSsid();
  }

  void _goToControl() {
    Navigator.pushReplacement(
      context,
      MaterialPageRoute(builder: (_) => const ControlScreen()),
    );
  }

  @override
  Widget build(BuildContext context) {
    final cfg = context.watch<ConfigProvider>().config;
    if (cfg == null) {
      return const Scaffold(
        body: Center(child: Text('Chưa có cấu hình. Quay lại Home.')),
      );
    }

    final isOnEspWifi = _currentSsid != null && _currentSsid!.contains(cfg.apSsid);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Kết nối WiFi ESP'),
        backgroundColor: const Color(0xFF0a1929),
        foregroundColor: Colors.cyanAccent,
      ),
      backgroundColor: const Color(0xFF06121f),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            // Info card
            Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: const Color(0xFF0a1929),
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: Colors.cyanAccent.withOpacity(0.4)),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      const Icon(Icons.router, color: Colors.cyanAccent),
                      const SizedBox(width: 8),
                      Text(cfg.apSsid,
                          style: const TextStyle(
                              color: Colors.white, fontSize: 18, fontWeight: FontWeight.bold)),
                    ],
                  ),
                  const SizedBox(height: 12),
                  _infoRow('Password', cfg.apPassword),
                  _infoRow('IP', cfg.apLocalIp),
                  _infoRow('Port', cfg.serverPort.toString()),
                  _infoRow('Endpoint', cfg.serverEndpoint),
                  _infoRow('Device', cfg.deviceCode),
                ],
              ),
            ),
            const SizedBox(height: 20),

            // Status WiFi hiện tại
            Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: isOnEspWifi
                    ? Colors.green.withOpacity(0.15)
                    : Colors.orange.withOpacity(0.15),
                borderRadius: BorderRadius.circular(12),
                border: Border.all(
                    color: isOnEspWifi ? Colors.greenAccent : Colors.orangeAccent),
              ),
              child: Row(
                children: [
                  Icon(
                    isOnEspWifi ? Icons.wifi : Icons.wifi_off,
                    color: isOnEspWifi ? Colors.greenAccent : Colors.orangeAccent,
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          isOnEspWifi
                              ? 'Đã kết nối: $_currentSsid'
                              : 'Chưa kết nối WiFi ESP',
                          style: TextStyle(
                              color: isOnEspWifi ? Colors.greenAccent : Colors.orangeAccent,
                              fontWeight: FontWeight.bold),
                        ),
                        Text(
                          _checkingWifi
                              ? 'Đang kiểm tra...'
                              : 'Vào cài đặt WiFi điện thoại và chọn "${cfg.apSsid}"',
                          style: const TextStyle(color: Colors.white70, fontSize: 12),
                        ),
                      ],
                    ),
                  ),
                  IconButton(
                    onPressed: _checkingWifi ? null : _refreshSsid,
                    icon: const Icon(Icons.refresh, color: Colors.cyanAccent),
                  ),
                ],
              ),
            ),

            if (_errorMsg != null) ...[
              const SizedBox(height: 12),
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: Colors.red.withOpacity(0.15),
                  borderRadius: BorderRadius.circular(8),
                  border: Border.all(color: Colors.redAccent),
                ),
                child: Row(
                  children: [
                    const Icon(Icons.error_outline, color: Colors.redAccent),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Text(_errorMsg!,
                          style: const TextStyle(color: Colors.redAccent, fontSize: 12)),
                    ),
                  ],
                ),
              ),
            ],

            if (_reachableBase != null) ...[
              const SizedBox(height: 12),
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: Colors.green.withOpacity(0.15),
                  borderRadius: BorderRadius.circular(8),
                  border: Border.all(color: Colors.greenAccent),
                ),
                child: Row(
                  children: [
                    const Icon(Icons.check_circle, color: Colors.greenAccent),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Text('ESP sẵn sàng: $_reachableBase',
                          style: const TextStyle(color: Colors.greenAccent, fontSize: 12)),
                    ),
                  ],
                ),
              ),
            ],

            const SizedBox(height: 24),

            OutlinedButton.icon(
              onPressed: _pinging ? null : _openWifiSettings,
              icon: const Icon(Icons.settings),
              label: const Text('Mở cài đặt WiFi'),
              style: OutlinedButton.styleFrom(
                foregroundColor: Colors.cyanAccent,
                side: const BorderSide(color: Colors.cyanAccent),
                padding: const EdgeInsets.symmetric(vertical: 14),
              ),
            ),
            const SizedBox(height: 12),

            ElevatedButton.icon(
              onPressed: _pinging ? null : _tryConnectEsp,
              icon: _pinging
                  ? const SizedBox(
                      width: 16,
                      height: 16,
                      child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                    )
                  : const Icon(Icons.wifi_find),
              label: Text(_pinging ? 'Đang ping...' : 'Kiểm tra kết nối ESP'),
              style: ElevatedButton.styleFrom(
                backgroundColor: Colors.cyanAccent,
                foregroundColor: Colors.black,
                padding: const EdgeInsets.symmetric(vertical: 14),
              ),
            ),
            const SizedBox(height: 12),

            if (_reachableBase != null)
              ElevatedButton.icon(
                onPressed: _goToControl,
                icon: const Icon(Icons.touch_app),
                label: const Text('Mở bảng điều khiển'),
                style: ElevatedButton.styleFrom(
                  backgroundColor: Colors.greenAccent,
                  foregroundColor: Colors.black,
                  padding: const EdgeInsets.symmetric(vertical: 14),
                ),
              ),

            const SizedBox(height: 24),
            const Text(
              'Lưu ý: ESP có thể phát WiFi (AP mode) hoặc cùng mạng LAN (STA mode). App sẽ tự động thử cả hai.',
              style: TextStyle(color: Colors.white54, fontSize: 11),
              textAlign: TextAlign.center,
            ),
          ],
        ),
      ),
    );
  }

  Widget _infoRow(String label, String value) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 2),
      child: Row(
        children: [
          SizedBox(
            width: 80,
            child: Text(label,
                style: const TextStyle(color: Colors.white60, fontSize: 12)),
          ),
          Expanded(
            child: Text(value,
                style: const TextStyle(
                    color: Colors.white,
                    fontSize: 13,
                    fontFamily: 'monospace',
                    fontWeight: FontWeight.w500)),
          ),
        ],
      ),
    );
  }
}