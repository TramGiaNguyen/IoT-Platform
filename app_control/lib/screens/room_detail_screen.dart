import 'package:flutter/material.dart';
import 'dart:async';
import '../services/api_service.dart';
import '../services/websocket_service.dart';
import '../models/room.dart';
import '../models/room_data.dart';
import '../models/device.dart';
import '../widgets/metric_card.dart';
import '../widgets/relay_control_widget.dart';
import 'rules_screen.dart';

class RoomDetailScreen extends StatefulWidget {
  final Room room;

  const RoomDetailScreen({
    Key? key,
    required this.room,
  }) : super(key: key);

  @override
  State<RoomDetailScreen> createState() => _RoomDetailScreenState();
}

class _RoomDetailScreenState extends State<RoomDetailScreen> {
  final _apiService = ApiService();
  final _wsService = WebSocketService();
  RoomData? _roomData;
  bool _isLoading = true;
  String? _error;
  /// Cập nhật mỗi lần load (API dùng `so_nguoi`, không dùng giá trị cũ từ danh sách).
  int _shownOccupancy = 0;
  Timer? _refreshTimer;
  StreamSubscription? _wsSubscription;

  @override
  void initState() {
    super.initState();
    _shownOccupancy = widget.room.occupancy;
    _loadRoomData();
    _loadRoomData().then((_) {
      if (_error == null) {
        _connectWebSocket();
      }
    });
    _refreshTimer = Timer.periodic(
      const Duration(seconds: 30),
      (_) => _loadRoomData(silent: true),
    );
  }

  @override
  void dispose() {
    _refreshTimer?.cancel();
    _wsSubscription?.cancel();
    _wsService.dispose();
    super.dispose();
  }

  void _connectWebSocket() {
    _wsService.connect();
    
    _wsSubscription = _wsService.eventStream.listen((event) {
      _handleWebSocketEvent(event);
    });
  }

  void _handleWebSocketEvent(Map<String, dynamic> event) {
    final deviceId = event['device_id'] as String?;
    if (deviceId == null || _roomData == null) return;
    
    final deviceIndex = _roomData!.devices.indexWhere(
      (d) => d.deviceId == deviceId,
    );
    
    if (deviceIndex == -1) return;
    
    setState(() {
      final device = _roomData!.devices[deviceIndex];
      
      event.forEach((key, value) {
        if (key == 'device_id' || key == 'timestamp' || key == '_internal_id') {
          return;
        }
        
        if (key.startsWith('relay_') && key.endsWith('_state')) {
          final relayNum = int.tryParse(key.split('_')[1]);
          if (relayNum != null) {
            final controlIndex = device.controls.indexWhere(
              (c) => c.relay == relayNum,
            );
            if (controlIndex != -1) {
              final control = device.controls[controlIndex];
              device.controls[controlIndex] = Control(
                relay: control.relay,
                name: control.name,
                state: value.toString().toUpperCase(),
                controllable: control.controllable,
              );
            }
          }
        } else {
          if (device.metrics.containsKey(key)) {
            final oldMetric = device.metrics[key]!;
            device.metrics[key] = Metric(
              key: key,
              value: value,
              unit: oldMetric.unit,
              type: oldMetric.type,
              min: oldMetric.min,
              max: oldMetric.max,
              icon: oldMetric.icon,
              color: oldMetric.color,
            );
          }
        }
      });
    });
  }

  Future<void> _loadRoomData({bool silent = false}) async {
    if (!silent) {
      setState(() {
        _isLoading = true;
        _error = null;
      });
    }

    try {
      final roomData = await _apiService.getRoomData(widget.room.id);
      if (mounted) {
        setState(() {
          _roomData = roomData;
          // Cùng payload với thiết bị — không phụ thuộc GET /occupancy (tránh lệch proxy / lỗi im lặng).
          _shownOccupancy = roomData.soNguoiTrongPhong;
          _isLoading = false;
          _error = null;
        });
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          _error = e.toString().replaceAll('Exception: ', '');
          _isLoading = false;
        });
      }
    }
  }

  Future<void> _controlRelay(String deviceId, int relay, String state) async {
    try {
      await _apiService.controlRoomRelay(
        roomId: widget.room.id,
        deviceId: deviceId,
        relay: relay,
        state: state,
      );

      await Future.delayed(const Duration(seconds: 2));
      await _loadRoomData(silent: true);
    } catch (e) {
      rethrow;
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Container(
        decoration: const BoxDecoration(
          color: Color(0xFFF7FAFC),
        ),
        child: Column(
          children: [
            // Glassmorphism App Bar
            Container(
              padding: EdgeInsets.only(
                top: MediaQuery.of(context).padding.top + 8,
                left: 4,
                right: 8,
                bottom: 8,
              ),
              decoration: BoxDecoration(
                color: const Color(0xFFF7FAFC).withOpacity(0.4),
                boxShadow: const [
                  BoxShadow(
                    color: Color(0x0F1C1E06),
                    blurRadius: 24,
                    offset: Offset(0, 8),
                  ),
                ],
              ),
              child: Row(
                children: [
                  IconButton(
                    icon: const Icon(
                      Icons.arrow_back,
                      color: Color(0xFF003345),
                    ),
                    onPressed: () => Navigator.pop(context),
                  ),
                  Expanded(
                    child: Text(
                      widget.room.name,
                      style: const TextStyle(
                        fontFamily: 'Manrope',
                        fontSize: 20,
                        fontWeight: FontWeight.w700,
                        letterSpacing: -0.02,
                        color: Color(0xFF003345),
                      ),
                    ),
                  ),
                  IconButton(
                    icon: const Icon(
                      Icons.rule,
                      color: Color(0xFF006a6a),
                    ),
                    onPressed: () {
                      Navigator.push(
                        context,
                        MaterialPageRoute(
                          builder: (context) => RulesScreen(roomId: widget.room.id),
                        ),
                      );
                    },
                  ),
                  IconButton(
                    icon: const Icon(
                      Icons.refresh,
                      color: Color(0xFF006a6a),
                    ),
                    onPressed: _loadRoomData,
                  ),
                ],
              ),
            ),

            // Content
            Expanded(
              child: _isLoading
                  ? const Center(
                      child: CircularProgressIndicator(
                        color: Color(0xFF006a6a),
                      ),
                    )
                  : _error != null
                      ? Center(
                          child: Column(
                            mainAxisAlignment: MainAxisAlignment.center,
                            children: [
                              const Icon(
                                Icons.error_outline,
                                size: 64,
                                color: Color(0xFFBA1A1A),
                              ),
                              const SizedBox(height: 16),
                              Padding(
                                padding: const EdgeInsets.symmetric(horizontal: 32),
                                child: Text(
                                  _error!,
                                  textAlign: TextAlign.center,
                                  style: const TextStyle(color: Color(0xFF40484C)),
                                ),
                              ),
                              const SizedBox(height: 16),
                              Container(
                                padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 12),
                                decoration: BoxDecoration(
                                  gradient: const LinearGradient(
                                    colors: [Color(0xFF003345), Color(0xFF004B63)],
                                  ),
                                  borderRadius: BorderRadius.circular(9999),
                                ),
                                child: const Text(
                                  'Thu lai',
                                  style: TextStyle(
                                    color: Colors.white,
                                    fontFamily: 'Manrope',
                                    fontWeight: FontWeight.w600,
                                  ),
                                ),
                              ),
                            ],
                          ),
                        )
                      : RefreshIndicator(
                          onRefresh: () => _loadRoomData(),
                          color: const Color(0xFF006a6a),
                          child: _roomData!.hasDevices
                              ? SingleChildScrollView(
                                  physics: const AlwaysScrollableScrollPhysics(),
                                  padding: const EdgeInsets.all(16),
                                  child: Column(
                                    crossAxisAlignment: CrossAxisAlignment.start,
                                    children: [
                                      // Overview card
                                      _buildOverviewCard(),
                                      const SizedBox(height: 24),

                                      // Devices
                                      for (var device in _roomData!.devices) ...[
                                        _buildDeviceSection(device),
                                        const SizedBox(height: 24),
                                      ],
                                      const SizedBox(height: 24),
                                    ],
                                  ),
                                )
                              : Center(
                                  child: Column(
                                    mainAxisAlignment: MainAxisAlignment.center,
                                    children: [
                                      Container(
                                        padding: const EdgeInsets.all(24),
                                        decoration: BoxDecoration(
                                          color: const Color(0xFFC0C7CD).withOpacity(0.15),
                                          shape: BoxShape.circle,
                                        ),
                                        child: const Icon(
                                          Icons.devices_other,
                                          size: 64,
                                          color: Color(0xFFC0C7CD),
                                        ),
                                      ),
                                      const SizedBox(height: 16),
                                      const Text(
                                        'Chua co thiet bi trong phong',
                                        style: TextStyle(
                                          fontSize: 16,
                                          color: Color(0xFF40484C),
                                        ),
                                      ),
                                    ],
                                  ),
                                ),
                        ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildOverviewCard() {
    return Container(
      padding: const EdgeInsets.all(24),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(24),
        border: Border.all(
          color: const Color(0xFFC0C7CD).withOpacity(0.15),
          width: 1,
        ),
        boxShadow: const [
          BoxShadow(
            color: Color(0x0F1C1E10),
            blurRadius: 32,
            offset: Offset(0, 8),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Row(
            children: [
              Icon(Icons.dashboard, color: Color(0xFF006a6a)),
              SizedBox(width: 8),
              Text(
                'TONG QUAN',
                style: TextStyle(
                  fontFamily: 'Inter',
                  fontSize: 10,
                  fontWeight: FontWeight.w600,
                  letterSpacing: 0.15,
                  color: Color(0xFF006a6a),
                ),
              ),
            ],
          ),
          const SizedBox(height: 16),
          Row(
            children: [
              Expanded(
                child: _buildStatBox(
                  label: 'Thiet bi',
                  value: _roomData!.deviceCount.toString(),
                  icon: Icons.devices,
                  color: const Color(0xFF003345),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: _buildStatBox(
                  label: 'Online',
                  value: _roomData!.onlineCount.toString(),
                  icon: Icons.check_circle,
                  color: const Color(0xFF006a6a),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: _buildStatBox(
                  label: 'Nguoi',
                  value: _shownOccupancy.toString(),
                  icon: Icons.person,
                  color: _shownOccupancy > 0
                      ? const Color(0xFFA855F7)
                      : const Color(0xFF40484C),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildStatBox({
    required String label,
    required String value,
    required IconData icon,
    required Color color,
  }) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: color.withOpacity(0.08),
        borderRadius: BorderRadius.circular(16),
      ),
      child: Column(
        children: [
          Icon(icon, color: color, size: 24),
          const SizedBox(height: 6),
          Text(
            value,
            style: TextStyle(
              fontFamily: 'Manrope',
              fontSize: 22,
              fontWeight: FontWeight.w700,
              letterSpacing: -0.02,
              color: color,
            ),
          ),
          const SizedBox(height: 2),
          Text(
            label,
            style: const TextStyle(
              fontFamily: 'Inter',
              fontSize: 10,
              fontWeight: FontWeight.w600,
              letterSpacing: 0.3,
              color: Color(0xFF40484C),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildDeviceSection(Device device) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        // Device header
        Row(
          children: [
            Container(
              padding: const EdgeInsets.all(10),
              decoration: BoxDecoration(
                color: device.isOnline
                    ? const Color(0xFF90EFEF).withOpacity(0.2)
                    : const Color(0xFFE0E3E5),
                borderRadius: BorderRadius.circular(16),
              ),
              child: Icon(
                Icons.router,
                color: device.isOnline ? const Color(0xFF006a6a) : const Color(0xFF40484C),
                size: 24,
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    device.name,
                    style: const TextStyle(
                      fontFamily: 'Manrope',
                      fontSize: 16,
                      fontWeight: FontWeight.w700,
                      color: Color(0xFF003345),
                    ),
                  ),
                  Row(
                    children: [
                      Container(
                        width: 6,
                        height: 6,
                        decoration: BoxDecoration(
                          color: device.isOnline ? const Color(0xFF006a6a) : const Color(0xFF71787D),
                          shape: BoxShape.circle,
                        ),
                      ),
                      const SizedBox(width: 6),
                      Text(
                        device.statusDisplay,
                        style: TextStyle(
                          fontFamily: 'Inter',
                          fontSize: 12,
                          color: device.isOnline ? const Color(0xFF006a6a) : const Color(0xFF71787D),
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ],
        ),
        const SizedBox(height: 20),

        // Controls
        if (device.hasControls) ...[
          const Row(
            children: [
              Icon(Icons.settings_remote, size: 18, color: Color(0xFF006a6a)),
              SizedBox(width: 8),
              Text(
                'DIEU KHIEN',
                style: TextStyle(
                  fontFamily: 'Inter',
                  fontSize: 10,
                  fontWeight: FontWeight.w600,
                  letterSpacing: 0.15,
                  color: Color(0xFF006a6a),
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          GridView.builder(
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
              crossAxisCount: 2,
              childAspectRatio: 0.72,
              crossAxisSpacing: 12,
              mainAxisSpacing: 12,
            ),
            itemCount: device.controls.length,
            itemBuilder: (context, index) {
              return RelayControlWidget(
                control: device.controls[index],
                deviceId: device.deviceId,
                onControl: _controlRelay,
              );
            },
          ),
          const SizedBox(height: 20),
        ],

        // Metrics
        if (device.hasMetrics) ...[
          const Row(
            children: [
              Icon(Icons.analytics, size: 18, color: Color(0xFFF97316)),
              SizedBox(width: 8),
              Text(
                'DU LIEU CAM BIEN',
                style: TextStyle(
                  fontFamily: 'Inter',
                  fontSize: 10,
                  fontWeight: FontWeight.w600,
                  letterSpacing: 0.15,
                  color: Color(0xFFF97316),
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          GridView.builder(
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
              crossAxisCount: 2,
              childAspectRatio: 1.0,
              crossAxisSpacing: 12,
              mainAxisSpacing: 12,
            ),
            itemCount: device.metrics.length,
            itemBuilder: (context, index) {
              final metric = device.metrics.values.elementAt(index);
              return MetricCard(metric: metric);
            },
          ),
        ],
      ],
    );
  }
}
