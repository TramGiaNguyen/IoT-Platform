import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../models/device_history_entry.dart';
import '../models/standalone_config.dart';
import '../services/config_loader.dart';
import '../services/config_provider.dart';
import '../services/device_history_service.dart';
import 'config_edit_screen.dart';
import 'wifi_setup_screen.dart';

/// Home screen showing the list of devices the user has previously imported or
/// connected to. Tap a row to (re)open [WiFiSetupScreen]; long-press a row to
/// open [ConfigEditScreen]. The FAB imports a fresh JSON file via
/// [ConfigLoader.loadFromFile].
class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen>
    with WidgetsBindingObserver {
  final ConfigLoader _loader = ConfigLoader();
  late Future<DeviceHistoryService> _serviceFuture;
  List<DeviceHistoryEntry> _entries = [];
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _serviceFuture = DeviceHistoryService.create();
    _serviceFuture.then((svc) {
      if (mounted) setState(() => _entries = svc.getAll());
    });
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    // Refresh on resume - the user may have just edited config or
    // returned from system WiFi settings.
    if (state == AppLifecycleState.resumed) {
      _reload();
    }
  }

  Future<void> _reload() async {
    final svc = await _serviceFuture;
    if (!mounted) return;
    setState(() => _entries = svc.getAll());
  }

  Future<void> _pickFile() async {
    setState(() => _busy = true);
    final result = await _loader.loadFromFile();
    if (!mounted) return;
    setState(() => _busy = false);

    if (result.cancelled) return;

    if (result.isSuccess) {
      final entry =
          DeviceHistoryEntry.fromStandaloneConfig(result.config!);
      final svc = await _serviceFuture;
      await svc.add(entry);
      await _reload();
      if (!mounted) return;
      _goToWifiSetup(result.config!);
    } else {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(result.error ?? 'Lỗi không xác định')),
      );
    }
  }

  Future<void> _openDevice(DeviceHistoryEntry entry) async {
    final svc = await _serviceFuture;
    final cfg = svc.loadConfigForDevice(entry.deviceCode);
    if (!mounted) return;
    if (cfg == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
            content: Text('Không tìm thấy cấu hình. Thêm lại từ file JSON.')),
      );
      return;
    }
    context
        .read<ConfigProvider>()
        .setConfig(cfg, label: 'history:${entry.deviceCode}');
    if (!mounted) return;
    Navigator.push(
      context,
      MaterialPageRoute(builder: (_) => const WiFiSetupScreen()),
    );
  }

  Future<void> _editDevice(DeviceHistoryEntry entry) async {
    final updated = await Navigator.push<bool>(
      context,
      MaterialPageRoute(builder: (_) => ConfigEditScreen(entry: entry)),
    );
    if (updated == true && mounted) {
      await _reload();
    }
  }

  void _goToWifiSetup(StandaloneConfig cfg) {
    context.read<ConfigProvider>().setConfig(cfg, label: 'picked');
    Navigator.push(
      context,
      MaterialPageRoute(builder: (_) => const WiFiSetupScreen()),
    );
  }

  String _formatRelativeTime(DateTime t) {
    final diff = DateTime.now().difference(t);
    if (diff.inSeconds < 60) return 'vừa xong';
    if (diff.inMinutes < 60) return '${diff.inMinutes} phút trước';
    if (diff.inHours < 24) return '${diff.inHours} giờ trước';
    if (diff.inDays < 30) return '${diff.inDays} ngày trước';
    return '${(diff.inDays / 30).floor()} tháng trước';
  }

  @override
  Widget build(BuildContext context) {
    final entries = _entries;

    return Scaffold(
      appBar: AppBar(
        title: const Text('ESP Controller'),
        backgroundColor: const Color(0xFF0a1929),
        foregroundColor: Colors.cyanAccent,
      ),
      backgroundColor: const Color(0xFF06121f),
      body: SafeArea(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            _header(entries.length),
            if (_busy)
              const LinearProgressIndicator(color: Colors.cyanAccent),
            Expanded(
              child: entries.isEmpty
                  ? _emptyState()
                  : RefreshIndicator(
                      onRefresh: _reload,
                      child: ListView.builder(
                        padding: const EdgeInsets.symmetric(
                            horizontal: 12, vertical: 8),
                        itemCount: entries.length,
                        itemBuilder: (context, i) {
                          final e = entries[i];
                          return _deviceTile(e);
                        },
                      ),
                    ),
            ),
          ],
        ),
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: _busy ? null : _pickFile,
        backgroundColor: Colors.cyanAccent,
        foregroundColor: Colors.black,
        icon: const Icon(Icons.add),
        label: const Text('Thêm thiết bị'),
      ),
    );
  }

  Widget _header(int count) {
    return Container(
      margin: const EdgeInsets.all(16),
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          colors: [Color(0xFF0a1929), Color(0xFF1a2942)],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: Colors.cyanAccent.withOpacity(0.4)),
      ),
      child: Row(
        children: [
          const Icon(Icons.developer_board,
              color: Colors.cyanAccent, size: 40),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  'ESP Standalone Controller',
                  style: TextStyle(
                      color: Colors.white,
                      fontSize: 16,
                      fontWeight: FontWeight.bold),
                ),
                const SizedBox(height: 4),
                Text(
                  count == 0
                      ? 'Chưa có thiết bị nào. Bấm "Thêm thiết bị" để import file JSON.'
                      : 'Đã lưu $count thiết bị. Nhấn giữ để sửa cấu hình.',
                  style: const TextStyle(color: Colors.white70, fontSize: 12),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _emptyState() {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.devices_other,
                size: 80, color: Colors.cyanAccent.withOpacity(0.5)),
            const SizedBox(height: 16),
            const Text(
              'Chưa có thiết bị nào',
              style: TextStyle(
                  color: Colors.white,
                  fontSize: 18,
                  fontWeight: FontWeight.bold),
            ),
            const SizedBox(height: 8),
            const Text(
              'Import file JSON xuất từ IoT Platform > Thiết lập điều khiển nội bộ',
              style: TextStyle(color: Colors.white70, fontSize: 12),
              textAlign: TextAlign.center,
            ),
          ],
        ),
      ),
    );
  }

  Widget _deviceTile(DeviceHistoryEntry e) {
    return Card(
      color: const Color(0xFF0a1929),
      margin: const EdgeInsets.only(bottom: 8),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(12),
        side: BorderSide(color: Colors.cyanAccent.withOpacity(0.3)),
      ),
      child: InkWell(
        borderRadius: BorderRadius.circular(12),
        onTap: () => _openDevice(e),
        onLongPress: () => _editDevice(e),
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Row(
            children: [
              Container(
                width: 44,
                height: 44,
                decoration: BoxDecoration(
                  color: Colors.cyanAccent.withOpacity(0.15),
                  borderRadius: BorderRadius.circular(8),
                  border: Border.all(color: Colors.cyanAccent),
                ),
                child: const Icon(Icons.router, color: Colors.cyanAccent),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      e.displayTitle,
                      style: const TextStyle(
                          color: Colors.white,
                          fontSize: 15,
                          fontWeight: FontWeight.bold),
                      overflow: TextOverflow.ellipsis,
                    ),
                    const SizedBox(height: 4),
                    Text(
                      '${e.apSsid} • ${e.apLocalIp}:${e.serverPort}',
                      style: const TextStyle(
                          color: Colors.white70, fontSize: 12),
                      overflow: TextOverflow.ellipsis,
                    ),
                    const SizedBox(height: 2),
                    Text(
                      _formatRelativeTime(e.lastConnectedAt),
                      style:
                          const TextStyle(color: Colors.white54, fontSize: 11),
                    ),
                  ],
                ),
              ),
              Container(
                padding: const EdgeInsets.symmetric(
                    horizontal: 10, vertical: 6),
                decoration: BoxDecoration(
                  color: Colors.cyanAccent.withOpacity(0.15),
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(color: Colors.cyanAccent),
                ),
                child: Text(
                  '${e.widgetCount} widgets',
                  style: const TextStyle(
                      color: Colors.cyanAccent,
                      fontSize: 11,
                      fontWeight: FontWeight.bold),
                ),
              ),
              const SizedBox(width: 4),
              const Icon(Icons.chevron_right, color: Colors.cyanAccent),
            ],
          ),
        ),
      ),
    );
  }
}