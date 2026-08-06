import 'package:flutter/material.dart';

import '../models/device_history_entry.dart';
import '../models/standalone_config.dart';
import '../services/device_history_service.dart';

/// Form screen for editing a saved [DeviceHistoryEntry].
///
/// Lets the user adjust SSID / password / IP / port / endpoint / gateway /
/// subnet without re-importing the JSON from the React Dashboard. The widget
/// list (`fullConfig.controls`) and other non-network fields are preserved.
///
/// On save, overlays the new values onto the existing [StandaloneConfig] JSON
/// and writes the entry back through [DeviceHistoryService]. Pops with `true`
/// to signal the home screen to refresh.
///
/// Explicit non-feature: this screen never produces a JSON file. JSON export
/// remains the responsibility of the React Dashboard.
class ConfigEditScreen extends StatefulWidget {
  final DeviceHistoryEntry entry;
  const ConfigEditScreen({super.key, required this.entry});

  @override
  State<ConfigEditScreen> createState() => _ConfigEditScreenState();
}

class _ConfigEditScreenState extends State<ConfigEditScreen> {
  final _formKey = GlobalKey<FormState>();

  late final TextEditingController _deviceCodeCtl;
  late final TextEditingController _apSsidCtl;
  late final TextEditingController _apPasswordCtl;
  late final TextEditingController _apLocalIpCtl;
  late final TextEditingController _serverPortCtl;
  late final TextEditingController _serverEndpointCtl;
  late final TextEditingController _apGatewayCtl;
  late final TextEditingController _apSubnetCtl;

  bool _saving = false;
  bool _deleting = false;

  @override
  void initState() {
    super.initState();
    final e = widget.entry;
    _deviceCodeCtl = TextEditingController(text: e.deviceCode);
    _apSsidCtl = TextEditingController(text: e.apSsid);
    _apPasswordCtl = TextEditingController(text: e.apPassword);
    _apLocalIpCtl = TextEditingController(text: e.apLocalIp);
    _serverPortCtl = TextEditingController(text: '${e.serverPort}');
    _serverEndpointCtl = TextEditingController(text: e.serverEndpoint);
    _apGatewayCtl = TextEditingController(text: e.apGateway);
    _apSubnetCtl = TextEditingController(text: e.apSubnet);
  }

  @override
  void dispose() {
    _deviceCodeCtl.dispose();
    _apSsidCtl.dispose();
    _apPasswordCtl.dispose();
    _apLocalIpCtl.dispose();
    _serverPortCtl.dispose();
    _serverEndpointCtl.dispose();
    _apGatewayCtl.dispose();
    _apSubnetCtl.dispose();
    super.dispose();
  }

  // IPv4 regex - accepts 0-255 per octet.
  static final _ipv4 = RegExp(
    r'^(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)(\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)){3}$',
  );

  Future<void> _save() async {
    if (!_formKey.currentState!.validate()) return;
    setState(() => _saving = true);

    final baseCfg = widget.entry.toStandaloneConfig();
    final updatedCfg = StandaloneConfig(
      schemaVersion: baseCfg.schemaVersion,
      version: baseCfg.version,
      boardType: baseCfg.boardType,
      orientation: baseCfg.orientation,
      deviceCode: _deviceCodeCtl.text.trim(),
      devicePreset: baseCfg.devicePreset,
      customWidth: baseCfg.customWidth,
      customHeight: baseCfg.customHeight,
      apSsid: _apSsidCtl.text.trim(),
      apPassword: _apPasswordCtl.text,
      serverPort: int.tryParse(_serverPortCtl.text.trim()) ?? 80,
      serverEndpoint: _serverEndpointCtl.text.trim(),
      apLocalIp: _apLocalIpCtl.text.trim(),
      apGateway: _apGatewayCtl.text.trim(),
      apSubnet: _apSubnetCtl.text.trim(),
      controls: baseCfg.controls,
      exportedAt: baseCfg.exportedAt,
    );

    final updated = DeviceHistoryEntry.fromStandaloneConfig(
      updatedCfg,
      createdAt: widget.entry.createdAt,
      lastConnectedAt: DateTime.now(),
    );

    final service = await DeviceHistoryService.create();
    await service.add(updated);

    if (!mounted) return;
    Navigator.pop(context, true);
  }

  Future<void> _delete() async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: const Color(0xFF0a1929),
        title: const Text('Xóa thiết bị?',
            style: TextStyle(color: Colors.white)),
        content: Text(
          'Thiết bị "${widget.entry.displayTitle}" sẽ bị xóa khỏi danh sách. '
          'Bạn có thể thêm lại bằng cách import file JSON.',
          style: const TextStyle(color: Colors.white70),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Hủy', style: TextStyle(color: Colors.cyanAccent)),
          ),
          TextButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Xóa',
                style: TextStyle(color: Colors.redAccent)),
          ),
        ],
      ),
    );
    if (confirmed != true || !mounted) return;

    setState(() => _deleting = true);
    final service = await DeviceHistoryService.create();
    await service.remove(widget.entry.deviceCode);

    if (!mounted) return;
    Navigator.pop(context, true);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Sửa cấu hình thiết bị'),
        backgroundColor: const Color(0xFF0a1929),
        foregroundColor: Colors.cyanAccent,
      ),
      backgroundColor: const Color(0xFF06121f),
      body: SafeArea(
        child: Form(
          key: _formKey,
          child: ListView(
            padding: const EdgeInsets.all(16),
            children: [
              _section('Thiết bị'),
              TextFormField(
                controller: _deviceCodeCtl,
                decoration: const InputDecoration(
                  labelText: 'Tên thiết bị (deviceCode)',
                  helperText: 'Dùng để nhận diện trong danh sách',
                  border: OutlineInputBorder(),
                ),
                validator: (v) =>
                    (v == null || v.trim().isEmpty) ? 'Bắt buộc' : null,
              ),
              const SizedBox(height: 16),

              _section('WiFi AP'),
              TextFormField(
                controller: _apSsidCtl,
                decoration: const InputDecoration(
                  labelText: 'SSID',
                  helperText: 'Tên WiFi ESP phát ra',
                  border: OutlineInputBorder(),
                ),
                validator: (v) =>
                    (v == null || v.trim().isEmpty) ? 'Bắt buộc' : null,
              ),
              const SizedBox(height: 12),
              TextFormField(
                controller: _apPasswordCtl,
                obscureText: true,
                decoration: const InputDecoration(
                  labelText: 'Password',
                  helperText: 'Tối thiểu 8 ký tự (WPA2)',
                  border: OutlineInputBorder(),
                ),
                validator: (v) {
                  if (v == null || v.isEmpty) return 'Bắt buộc';
                  if (v.length < 8) return 'Tối thiểu 8 ký tự';
                  return null;
                },
              ),
              const SizedBox(height: 16),

              _section('ESP Web Server'),
              TextFormField(
                controller: _apLocalIpCtl,
                decoration: const InputDecoration(
                  labelText: 'IP ESP (AP mode)',
                  border: OutlineInputBorder(),
                ),
                validator: (v) {
                  if (v == null || v.trim().isEmpty) return 'Bắt buộc';
                  if (!_ipv4.hasMatch(v.trim())) return 'IPv4 không hợp lệ';
                  return null;
                },
              ),
              const SizedBox(height: 12),
              Row(
                children: [
                  Expanded(
                    child: TextFormField(
                      controller: _serverPortCtl,
                      keyboardType: TextInputType.number,
                      decoration: const InputDecoration(
                        labelText: 'Port',
                        border: OutlineInputBorder(),
                      ),
                      validator: (v) {
                        final n = int.tryParse((v ?? '').trim());
                        if (n == null) return 'Số nguyên';
                        if (n < 1 || n > 65535) return '1..65535';
                        return null;
                      },
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: TextFormField(
                      controller: _serverEndpointCtl,
                      decoration: const InputDecoration(
                        labelText: 'Endpoint',
                        helperText: 'Đường dẫn HTML UI',
                        border: OutlineInputBorder(),
                      ),
                      validator: (v) =>
                          (v == null || v.trim().isEmpty) ? 'Bắt buộc' : null,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 12),
              TextFormField(
                controller: _apGatewayCtl,
                decoration: const InputDecoration(
                  labelText: 'Gateway',
                  border: OutlineInputBorder(),
                ),
                validator: (v) {
                  if (v == null || v.trim().isEmpty) return null;
                  if (!_ipv4.hasMatch(v.trim())) return 'IPv4 không hợp lệ';
                  return null;
                },
              ),
              const SizedBox(height: 12),
              TextFormField(
                controller: _apSubnetCtl,
                decoration: const InputDecoration(
                  labelText: 'Subnet mask',
                  border: OutlineInputBorder(),
                ),
                validator: (v) {
                  if (v == null || v.trim().isEmpty) return null;
                  if (!_ipv4.hasMatch(v.trim())) return 'IPv4 không hợp lệ';
                  return null;
                },
              ),
              const SizedBox(height: 24),

              ElevatedButton.icon(
                onPressed: (_saving || _deleting) ? null : _save,
                icon: _saving
                    ? const SizedBox(
                        width: 16,
                        height: 16,
                        child: CircularProgressIndicator(
                          strokeWidth: 2, color: Colors.white),
                      )
                    : const Icon(Icons.save),
                label: const Text('Lưu'),
                style: ElevatedButton.styleFrom(
                  backgroundColor: Colors.cyanAccent,
                  foregroundColor: Colors.black,
                  padding: const EdgeInsets.symmetric(vertical: 14),
                ),
              ),
              const SizedBox(height: 12),
              OutlinedButton.icon(
                onPressed: (_saving || _deleting) ? null : _delete,
                icon: _deleting
                    ? const SizedBox(
                        width: 16,
                        height: 16,
                        child: CircularProgressIndicator(
                          strokeWidth: 2, color: Colors.redAccent),
                      )
                    : const Icon(Icons.delete_outline,
                        color: Colors.redAccent),
                label: const Text('Xóa thiết bị',
                    style: TextStyle(color: Colors.redAccent)),
                style: OutlinedButton.styleFrom(
                  side: const BorderSide(color: Colors.redAccent),
                  padding: const EdgeInsets.symmetric(vertical: 14),
                ),
              ),
              const SizedBox(height: 24),
              const Text(
                'Lưu ý: widget layout và các thiết lập nâng cao chỉ thay đổi '
                'qua React Dashboard. Màn hình này chỉ sửa các thông số mạng.',
                style: TextStyle(color: Colors.white54, fontSize: 11),
                textAlign: TextAlign.center,
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _section(String label) => Padding(
        padding: const EdgeInsets.only(bottom: 8),
        child: Text(
          label,
          style: const TextStyle(
            color: Colors.cyanAccent,
            fontSize: 12,
            fontWeight: FontWeight.bold,
            letterSpacing: 1.2,
          ),
        ),
      );
}