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
  Timer? _refreshTimer;
  StreamSubscription? _wsSubscription;

  @override
  void initState() {
    super.initState();
    _loadRoomData();
    // Connect WebSocket after data loads successfully
    _loadRoomData().then((_) {
      if (_error == null) {
        _connectWebSocket();
      }
    });
    // Auto refresh every 30 seconds (WebSocket will handle real-time updates)
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
    // Connect to WebSocket
    _wsService.connect();
    
    // Listen to events
    _wsSubscription = _wsService.eventStream.listen((event) {
      _handleWebSocketEvent(event);
    });
  }

  void _handleWebSocketEvent(Map<String, dynamic> event) {
    // Check if event is for devices in this room
    final deviceId = event['device_id'] as String?;
    if (deviceId == null || _roomData == null) return;
    
    // Find device in room
    final deviceIndex = _roomData!.devices.indexWhere(
      (d) => d.deviceId == deviceId,
    );
    
    if (deviceIndex == -1) return;
    
    // Update device data
    setState(() {
      final device = _roomData!.devices[deviceIndex];
      
      // Update metrics
      event.forEach((key, value) {
        if (key == 'device_id' || key == 'timestamp' || key == '_internal_id') {
          return;
        }
        
        // Check if it's a relay state
        if (key.startsWith('relay_') && key.endsWith('_state')) {
          final relayNum = int.tryParse(key.split('_')[1]);
          if (relayNum != null) {
            // Update control state
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
          // Update metric
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

      // Reload data after 2 seconds
      await Future.delayed(const Duration(seconds: 2));
      await _loadRoomData(silent: true);
    } catch (e) {
      rethrow;
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text(widget.room.name),
        backgroundColor: Colors.blue.shade900,
        foregroundColor: Colors.white,
        actions: [
          IconButton(
            icon: const Icon(Icons.rule),
            onPressed: () {
              Navigator.push(
                context,
                MaterialPageRoute(
                  builder: (context) => RulesScreen(roomId: widget.room.id),
                ),
              );
            },
            tooltip: 'Rules',
          ),
          IconButton(
            icon: const Icon(Icons.refresh),
            onPressed: _loadRoomData,
            tooltip: 'Làm mới',
          ),
        ],
      ),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator())
          : _error != null
              ? Center(
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      const Icon(
                        Icons.error_outline,
                        size: 60,
                        color: Colors.red,
                      ),
                      const SizedBox(height: 16),
                      Padding(
                        padding: const EdgeInsets.symmetric(horizontal: 32),
                        child: Text(
                          _error!,
                          textAlign: TextAlign.center,
                        ),
                      ),
                      const SizedBox(height: 16),
                      ElevatedButton(
                        onPressed: _loadRoomData,
                        child: const Text('Thử lại'),
                      ),
                    ],
                  ),
                )
              : RefreshIndicator(
                  onRefresh: () => _loadRoomData(),
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
                            ],
                          ),
                        )
                      : Center(
                          child: Column(
                            mainAxisAlignment: MainAxisAlignment.center,
                            children: [
                              Icon(
                                Icons.devices_other,
                                size: 80,
                                color: Colors.grey[400],
                              ),
                              const SizedBox(height: 16),
                              Text(
                                'Chưa có thiết bị trong phòng',
                                style: TextStyle(
                                  fontSize: 16,
                                  color: Colors.grey[600],
                                ),
                              ),
                            ],
                          ),
                        ),
                ),
    );
  }

  Widget _buildOverviewCard() {
    return Card(
      elevation: 2,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(12),
      ),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Row(
              children: [
                Icon(Icons.dashboard, color: Colors.blue),
                SizedBox(width: 8),
                Text(
                  'Tổng quan',
                  style: TextStyle(
                    fontSize: 18,
                    fontWeight: FontWeight.bold,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 16),
            Row(
              children: [
                Expanded(
                  child: _buildStatBox(
                    label: 'Thiết bị',
                    value: _roomData!.deviceCount.toString(),
                    icon: Icons.devices,
                    color: Colors.blue,
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: _buildStatBox(
                    label: 'Online',
                    value: _roomData!.onlineCount.toString(),
                    icon: Icons.check_circle,
                    color: Colors.green,
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: _buildStatBox(
                    label: 'Offline',
                    value: _roomData!.offlineCount.toString(),
                    icon: Icons.cancel,
                    color: Colors.red,
                  ),
                ),
              ],
            ),
          ],
        ),
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
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: color.withOpacity(0.1),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Column(
        children: [
          Icon(icon, color: color, size: 24),
          const SizedBox(height: 4),
          Text(
            value,
            style: TextStyle(
              fontSize: 20,
              fontWeight: FontWeight.bold,
              color: color,
            ),
          ),
          Text(
            label,
            style: TextStyle(
              fontSize: 12,
              color: Colors.grey[700],
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
              padding: const EdgeInsets.all(8),
              decoration: BoxDecoration(
                color: device.isOnline
                    ? Colors.green.withOpacity(0.1)
                    : Colors.red.withOpacity(0.1),
                borderRadius: BorderRadius.circular(8),
              ),
              child: Icon(
                Icons.router,
                color: device.isOnline ? Colors.green : Colors.red,
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
                      fontSize: 16,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                  Text(
                    device.statusDisplay,
                    style: TextStyle(
                      fontSize: 12,
                      color: device.isOnline ? Colors.green : Colors.red,
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
        const SizedBox(height: 16),

        // Controls
        if (device.hasControls) ...[
          const Row(
            children: [
              Icon(Icons.settings_remote, size: 18, color: Colors.blue),
              SizedBox(width: 6),
              Text(
                'Điều khiển',
                style: TextStyle(
                  fontSize: 14,
                  fontWeight: FontWeight.bold,
                  color: Colors.blue,
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
              childAspectRatio: 0.85,
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
          const SizedBox(height: 16),
        ],

        // Metrics
        if (device.hasMetrics) ...[
          const Row(
            children: [
              Icon(Icons.analytics, size: 18, color: Colors.orange),
              SizedBox(width: 6),
              Text(
                'Dữ liệu',
                style: TextStyle(
                  fontSize: 14,
                  fontWeight: FontWeight.bold,
                  color: Colors.orange,
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
              childAspectRatio: 1.2,
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
