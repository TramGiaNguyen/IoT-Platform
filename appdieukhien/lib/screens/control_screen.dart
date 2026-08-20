import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';

import '../models/device_history_entry.dart';
import '../models/layout_override.dart';
import '../models/standalone_config.dart';
import '../models/widget_config.dart';
import '../services/config_provider.dart';
import '../services/device_history_service.dart';
import '../services/esp_client.dart';
import '../services/layout_override_service.dart';
import '../widgets/widget_factory.dart';
import '../widgets/widget_wrapper.dart';

/// Màn hình điều khiển chính. Render tất cả widget theo đúng
/// vị trí (x, y, width, height) trên 1 canvas có kích thước
/// tỉ lệ với `customWidth x customHeight` của config.
///
/// Khi `_isEditMode == true`, widget được wrap trong [WidgetWrapper]
/// cho phép drag + resize với grid snap.
class ControlScreen extends StatefulWidget {
  const ControlScreen({super.key});

  @override
  State<ControlScreen> createState() => _ControlScreenState();
}

class _ControlScreenState extends State<ControlScreen> {
  final EspClient _espClient = EspClient();
  static const double _defaultCellSize = 36.0;

  bool _isEditMode = false;
  bool _isSaving = false;
  Map<String, WidgetLayoutOverride> _pendingOverrides = {};
  LayoutOverrideService? _layoutService;
  LayoutOverride? _savedOverride;

  void _applyOrientationFromConfig() {
    final cfg = context.read<ConfigProvider>().config;
    if (cfg == null) return;

    final isLandscape = cfg.orientation == 'landscape';
    // Force the screen to the configured orientation
    SystemChrome.setPreferredOrientations([
      isLandscape
          ? DeviceOrientation.landscapeLeft
          : DeviceOrientation.portraitUp,
    ]);
  }

  @override
  void initState() {
    super.initState();
    _loadSavedOverrides();
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    // Apply orientation after first frame so config is guaranteed to be available
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _applyOrientationFromConfig();
    });
  }

  Future<void> _loadSavedOverrides() async {
    final cfg = context.read<ConfigProvider>().config;
    if (cfg == null) return;
    _layoutService = await LayoutOverrideService.create();
    _savedOverride = _layoutService!.loadOverride(cfg.deviceCode);
    if (_savedOverride != null) {
      _pendingOverrides = Map.from(_savedOverride!.overrides);
    }
    if (mounted) setState(() {});
  }

  void _onLayoutChanged(String widgetId, WidgetLayoutOverride layout) {
    setState(() {
      _pendingOverrides[widgetId] = layout;
    });
  }

  Future<void> _saveLayout() async {
    if (_isSaving) return;
    final cfg = context.read<ConfigProvider>().config;
    if (cfg == null) return;

    setState(() => _isSaving = true);

    // Build new widget configs with overridden positions
    final updatedWidgets = cfg.controls.map((w) {
      final override = _pendingOverrides[w.id];
      if (override != null) {
        return w.copyWith(
          x: override.x,
          y: override.y,
          width: override.width,
          height: override.height,
        );
      }
      return w;
    }).toList();

    // Create updated config
    final updatedConfig = StandaloneConfig(
      schemaVersion: cfg.schemaVersion,
      version: cfg.version,
      boardType: cfg.boardType,
      orientation: cfg.orientation,
      deviceCode: cfg.deviceCode,
      devicePreset: cfg.devicePreset,
      customWidth: cfg.customWidth,
      customHeight: cfg.customHeight,
      apSsid: cfg.apSsid,
      apPassword: cfg.apPassword,
      serverPort: cfg.serverPort,
      serverEndpoint: cfg.serverEndpoint,
      apLocalIp: cfg.apLocalIp,
      apGateway: cfg.apGateway,
      apSubnet: cfg.apSubnet,
      controls: updatedWidgets,
      exportedAt: cfg.exportedAt,
    );

    // Save overrides to SharedPreferences
    final layoutOverride = LayoutOverride(
      deviceCode: cfg.deviceCode,
      overrides: Map.from(_pendingOverrides),
      lastModified: DateTime.now(),
    );
    await _layoutService?.saveOverride(layoutOverride);

    // Update device history entry with new full config
    final historyService = await DeviceHistoryService.create();
    final entries = historyService.getAll();
    final existingEntry = entries.where((e) => e.deviceCode == cfg.deviceCode).firstOrNull;
    if (existingEntry != null) {
      final newEntry = existingEntry.copyWith(
        fullConfig: updatedConfig.toJson(),
        lastConnectedAt: DateTime.now(),
      );
      await historyService.update(newEntry);
    } else {
      final newEntry = DeviceHistoryEntry.fromStandaloneConfig(updatedConfig);
      await historyService.add(newEntry);
    }

    // Update in-memory config
    if (mounted) {
      context.read<ConfigProvider>().setConfig(updatedConfig, label: 'layout-edited');
    }

    setState(() {
      _isSaving = false;
      _isEditMode = false;
      _savedOverride = layoutOverride;
    });

    if (mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Da luu layout'),
          backgroundColor: Colors.greenAccent,
          duration: Duration(seconds: 2),
        ),
      );
    }
  }

  void _cancelEdit() {
    if (_savedOverride != null) {
      _pendingOverrides = Map.from(_savedOverride!.overrides);
    } else {
      _pendingOverrides = {};
    }
    setState(() => _isEditMode = false);
  }

  void _resetToOriginal() {
    _pendingOverrides = {};
    setState(() {});
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(
        content: Text('Da reset ve vi tri goc'),
        duration: Duration(seconds: 2),
      ),
    );
  }

  @override
  void dispose() {
    // Restore all allowed orientations when leaving screen
    SystemChrome.setPreferredOrientations([
      DeviceOrientation.portraitUp,
      DeviceOrientation.landscapeLeft,
      DeviceOrientation.landscapeRight,
    ]);
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final cfg = context.watch<ConfigProvider>().config;
    final activeBaseUrl = context.watch<ConfigProvider>().activeBaseUrl;

    if (cfg == null) {
      return const Scaffold(
        body: Center(child: Text('Chua co cau hinh.')),
      );
    }

    final isLandscape = cfg.orientation == 'landscape';
    // Swap dimensions so the canvas "thinks" it's portrait but in landscape space
    final canvasWidth  = isLandscape ? cfg.customHeight.toDouble() : cfg.customWidth.toDouble();
    final canvasHeight = isLandscape ? cfg.customWidth.toDouble()  : cfg.customHeight.toDouble();

    // Calculate grid dimensions (in cells)
    final gridWidth = (canvasWidth / _defaultCellSize).ceil();
    final gridHeight = (canvasHeight / _defaultCellSize).ceil();

    return Scaffold(
      appBar: AppBar(
        title: Text(
          _isEditMode
              ? 'Sua layout (${_pendingOverrides.length} thay doi)'
              : '${cfg.deviceCode} - ${cfg.controls.length} widgets',
        ),
        backgroundColor: Color(0xFF0a1929),
        foregroundColor: Colors.cyanAccent,
        actions: [
          if (_isEditMode) ...[
            IconButton(
              tooltip: 'Reset ve vi tri goc',
              onPressed: _resetToOriginal,
              icon: const Icon(Icons.restore, color: Colors.white70),
            ),
            IconButton(
              tooltip: 'Huy',
              onPressed: _cancelEdit,
              icon: const Icon(Icons.close, color: Colors.orangeAccent),
            ),
            IconButton(
              tooltip: 'Luu layout',
              onPressed: _isSaving ? null : _saveLayout,
              icon: _isSaving
                  ? const SizedBox(
                      width: 20,
                      height: 20,
                      child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                    )
                  : const Icon(Icons.check, color: Colors.greenAccent),
            ),
          ] else ...[
            IconButton(
              tooltip: activeBaseUrl == null ? 'Chua ket noi ESP' : 'ESP: $activeBaseUrl',
              onPressed: () {},
              icon: Icon(
                activeBaseUrl != null ? Icons.wifi : Icons.wifi_off,
                color: activeBaseUrl != null ? Colors.greenAccent : Colors.orangeAccent,
              ),
            ),
            IconButton(
              tooltip: 'Sua layout',
              onPressed: () => setState(() => _isEditMode = true),
              icon: const Icon(Icons.edit, color: Colors.cyanAccent),
            ),
            IconButton(
              tooltip: 'Xoay man hinh',
              onPressed: () {
                // Toggle between configured orientation and its opposite
                final targetOrientation = isLandscape
                    ? DeviceOrientation.portraitUp
                    : (DeviceOrientation.landscapeLeft);
                SystemChrome.setPreferredOrientations([targetOrientation]);
              },
              icon: Icon(isLandscape ? Icons.stay_current_portrait : Icons.stay_current_landscape),
            ),
          ],
        ],
      ),
      backgroundColor: Color(0xFF06121f),
      body: SafeArea(
        child: LayoutBuilder(
          builder: (context, constraints) {
            final maxW = constraints.maxWidth;
            final maxH = constraints.maxHeight;
            final scaleW = maxW / canvasWidth;
            final scaleH = maxH / canvasHeight;
            final scale = math.min(scaleW, scaleH);
            final displayW = canvasWidth * scale;
            final displayH = canvasHeight * scale;
            final cellSize = _defaultCellSize * scale;

            return Center(
              child: FittedBox(
                fit: BoxFit.contain,
                child: Container(
                  width: canvasWidth * scale,
                  height: canvasHeight * scale,
                  decoration: BoxDecoration(
                    color: Color(0xFF06121f),
                    border: Border.all(
                      color: _isEditMode
                          ? Colors.cyanAccent
                          : Colors.cyanAccent.withOpacity(0.4),
                      width: _isEditMode ? 2 : 1,
                    ),
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Stack(
                    clipBehavior: Clip.none,
                    children: cfg.controls.map((w) {
                      // Check for pending or saved override
                      final override = _pendingOverrides[w.id];
                      final layout = override ??
                          (_savedOverride?.get(w.id) != null
                              ? _savedOverride!.get(w.id)
                              : null);

                      final effectiveLayout = layout ??
                          WidgetLayoutOverride(
                            x: w.x,
                            y: w.y,
                            width: w.width,
                            height: w.height,
                          );

                      // For landscape, use widget's natural portrait layout scaled via FittedBox
                      final rotatedX = effectiveLayout.x;
                      final rotatedY = effectiveLayout.y;

                      if (_isEditMode) {
                        return WidgetWrapper(
                          key: ValueKey('edit-${w.id}'),
                          widgetId: w.id,
                          child: WidgetFactory.build(
                            config: w,
                            cellSize: cellSize,
                            activeBaseUrl: null,
                            client: null,
                          ),
                          cellSize: cellSize,
                          gridWidth: gridWidth,
                          gridHeight: gridHeight,
                          initialLayout: effectiveLayout,
                          isEditMode: _isEditMode,
                          onLayoutChanged: _onLayoutChanged,
                        );
                      }

                      return Positioned(
                        key: ValueKey('normal-${w.id}'),
                        left: rotatedX * cellSize,
                        top: rotatedY * cellSize,
                        child: SizedBox(
                          width: effectiveLayout.width * cellSize,
                          height: effectiveLayout.height * cellSize,
                          child: WidgetFactory.build(
                            config: w,
                            cellSize: cellSize,
                            activeBaseUrl: activeBaseUrl,
                            client: activeBaseUrl != null ? _espClient : null,
                          ),
                        ),
                      );
                    }).toList(),
                  ),
                ),
              ),
            );
          },
        ),
      ),
    );
  }
}
