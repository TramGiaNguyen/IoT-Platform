import 'package:flutter/material.dart';
import 'dart:async';
import '../services/api_service.dart';
import 'login_screen.dart';

class ControlScreen extends StatefulWidget {
  const ControlScreen({Key? key}) : super(key: key);

  @override
  State<ControlScreen> createState() => _ControlScreenState();
}

class _ControlScreenState extends State<ControlScreen> {
  final _apiService = ApiService();
  Timer? _refreshTimer;
  
  Map<String, dynamic>? _relayData;
  Map<String, dynamic>? _acData;
  bool _isLoading = true;
  String? _error;
  Map<int, bool> _controlLoading = {};
  bool _acCommandLoading = false;

  @override
  void initState() {
    super.initState();
    _loadData();
    // Auto refresh every 5 seconds
    _refreshTimer = Timer.periodic(
      const Duration(seconds: 5),
      (_) => _loadData(silent: true),
    );
  }

  @override
  void dispose() {
    _refreshTimer?.cancel();
    super.dispose();
  }

  Future<void> _loadData({bool silent = false}) async {
    if (!silent) {
      setState(() {
        _isLoading = true;
        _error = null;
      });
    }

    try {
      final results = await Future.wait([
        _apiService.getRelayStatus(),
        _apiService.getAcStatus(),
      ]);
      if (mounted) {
        setState(() {
          _relayData = results[0];
          _acData = results[1];
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
        
        if (_error!.contains('hết hạn')) {
          _logout();
        }
      }
    }
  }

  Future<void> _controlAc(String command) async {
    setState(() {
      _acCommandLoading = true;
    });

    try {
      final status = await _apiService.controlAc(command);
      if (mounted) {
        setState(() {
          _acData = status;
        });
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(e.toString().replaceAll('Exception: ', '')),
            backgroundColor: Colors.red,
          ),
        );
      }
    } finally {
      if (mounted) {
        setState(() {
          _acCommandLoading = false;
        });
      }
    }
  }

  Future<void> _controlRelay(int relay, String currentState) async {
    final newState = currentState == 'ON' ? 'OFF' : 'ON';
    
    setState(() {
      _controlLoading[relay] = true;
      // Optimistic update
      if (_relayData!['relays'] != null) {
        for (var r in _relayData!['relays']) {
          if (r['relay'] == relay) {
            r['state'] = newState;
            break;
          }
        }
      }
    });

    try {
      await _apiService.controlRelay(relay, newState);
      
      // Reload after 2 seconds to sync with actual state
      await Future.delayed(const Duration(seconds: 2));
      await _loadData(silent: true);
      
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Đã ${newState == 'ON' ? 'bật' : 'tắt'} relay $relay'),
            backgroundColor: Colors.green,
            duration: const Duration(seconds: 1),
          ),
        );
      }
    } catch (e) {
      // Revert on error
      await _loadData(silent: true);
      
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(e.toString().replaceAll('Exception: ', '')),
            backgroundColor: Colors.red,
          ),
        );
      }
    } finally {
      if (mounted) {
        setState(() {
          _controlLoading[relay] = false;
        });
      }
    }
  }

  Future<void> _logout() async {
    await _apiService.logout();
    if (mounted) {
      Navigator.of(context).pushReplacement(
        MaterialPageRoute(builder: (_) => const LoginScreen()),
      );
    }
  }

  Widget _buildRelayCard(int relay, String name, String state) {
    final isOn = state == 'ON';
    final isLoading = _controlLoading[relay] ?? false;
    
    return Card(
      elevation: 4,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(16),
        side: BorderSide(
          color: isOn ? Colors.green : Colors.grey.shade300,
          width: 2,
        ),
      ),
      child: InkWell(
        onTap: isLoading ? null : () => _controlRelay(relay, state),
        borderRadius: BorderRadius.circular(16),
        child: Padding(
          padding: const EdgeInsets.all(12),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(
                Icons.lightbulb,
                size: 50,
                color: isOn ? Colors.amber : Colors.grey,
              ),
              const SizedBox(height: 8),
              Text(
                name,
                style: const TextStyle(
                  fontSize: 18,
                  fontWeight: FontWeight.bold,
                ),
              ),
              const SizedBox(height: 4),
              Container(
                padding: const EdgeInsets.symmetric(
                  horizontal: 12,
                  vertical: 6,
                ),
                decoration: BoxDecoration(
                  color: isOn
                      ? Colors.green.withOpacity(0.2)
                      : Colors.grey.withOpacity(0.2),
                  borderRadius: BorderRadius.circular(20),
                ),
                child: Text(
                  isOn ? 'ĐANG BẬT' : 'ĐANG TẮT',
                  style: TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.bold,
                    color: isOn ? Colors.green : Colors.grey,
                  ),
                ),
              ),
              const SizedBox(height: 12),
              SizedBox(
                width: double.infinity,
                child: ElevatedButton(
                  onPressed: isLoading ? null : () => _controlRelay(relay, state),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: isOn ? Colors.red : Colors.green,
                    foregroundColor: Colors.white,
                    padding: const EdgeInsets.symmetric(vertical: 12),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(10),
                    ),
                  ),
                  child: isLoading
                      ? const SizedBox(
                          height: 20,
                          width: 20,
                          child: CircularProgressIndicator(
                            strokeWidth: 2,
                            color: Colors.white,
                          ),
                        )
                      : Text(
                          isOn ? 'TẮT' : 'BẬT',
                          style: const TextStyle(
                            fontSize: 16,
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildInfoCard(String title, String value, String unit, IconData icon, Color color) {
    return Card(
      elevation: 2,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(12),
      ),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Row(
          children: [
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: color.withOpacity(0.1),
                borderRadius: BorderRadius.circular(10),
              ),
              child: Icon(icon, color: color, size: 30),
            ),
            const SizedBox(width: 16),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    title,
                    style: TextStyle(
                      fontSize: 14,
                      color: Colors.grey.shade600,
                    ),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    '$value $unit',
                    style: const TextStyle(
                      fontSize: 20,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildAcCard() {
    final temp = (_acData?['temp'] ?? 24).toString();
    final on = _acData?['on'] == true;
    final humidity = _acData?['humidity'];
    final indoorTemp = _acData?['indoorTemp'];

    return Card(
      elevation: 3,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              '❄️ Điều khiển máy lạnh',
              style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold),
            ),
            const SizedBox(height: 12),
            Text('Nhiệt độ cài đặt: $temp°C', style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w600)),
            const SizedBox(height: 4),
            Text('Nhiệt độ phòng: ${indoorTemp ?? "--"}°C'),
            Text('Độ ẩm: ${humidity ?? "--"}%'),
            const SizedBox(height: 8),
            Text(
              'Trạng thái: ${on ? "ĐANG BẬT" : "ĐANG TẮT"}',
              style: TextStyle(
                color: on ? Colors.green : Colors.red,
                fontWeight: FontWeight.bold,
              ),
            ),
            const SizedBox(height: 12),
            GridView.count(
              crossAxisCount: 2,
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              mainAxisSpacing: 10,
              crossAxisSpacing: 10,
              childAspectRatio: 2.5,
              children: [
                ElevatedButton(
                  onPressed: _acCommandLoading ? null : () => _controlAc('on'),
                  style: ElevatedButton.styleFrom(backgroundColor: Colors.green),
                  child: const Text('BẬT MÁY', style: TextStyle(color: Colors.white)),
                ),
                ElevatedButton(
                  onPressed: _acCommandLoading ? null : () => _controlAc('off'),
                  style: ElevatedButton.styleFrom(backgroundColor: Colors.red),
                  child: const Text('TẮT MÁY', style: TextStyle(color: Colors.white)),
                ),
                ElevatedButton(
                  onPressed: _acCommandLoading ? null : () => _controlAc('up'),
                  child: const Text('TĂNG +'),
                ),
                ElevatedButton(
                  onPressed: _acCommandLoading ? null : () => _controlAc('down'),
                  child: const Text('GIẢM -'),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Trung tâm Chuyển đổi Số'),
        backgroundColor: Colors.blue.shade900,
        foregroundColor: Colors.white,
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh),
            onPressed: _loadData,
          ),
          IconButton(
            icon: const Icon(Icons.logout),
            onPressed: _logout,
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
                      const Icon(Icons.error_outline, size: 60, color: Colors.red),
                      const SizedBox(height: 16),
                      Text(_error!, textAlign: TextAlign.center),
                      const SizedBox(height: 16),
                      ElevatedButton(
                        onPressed: _loadData,
                        child: const Text('Thử lại'),
                      ),
                    ],
                  ),
                )
              : RefreshIndicator(
                  onRefresh: () => _loadData(),
                  child: SingleChildScrollView(
                    physics: const AlwaysScrollableScrollPhysics(),
                    padding: const EdgeInsets.all(16),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        _buildAcCard(),
                        const SizedBox(height: 24),
                        // Relay controls
                        const Text(
                          '⚡ Điều khiển',
                          style: TextStyle(
                            fontSize: 20,
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                        const SizedBox(height: 16),
                        GridView.count(
                          crossAxisCount: 2,
                          shrinkWrap: true,
                          physics: const NeverScrollableScrollPhysics(),
                          mainAxisSpacing: 16,
                          crossAxisSpacing: 16,
                          childAspectRatio: 0.72,
                          children: [
                            if (_relayData!['relays'] != null)
                              ...(_relayData!['relays'] as List).map((r) => _buildRelayCard(
                                r['relay'] as int,
                                r['name'] as String,
                                r['state'] as String
                              )).toList(),
                          ],
                        ),
                        const SizedBox(height: 32),
                        
                        // Power monitoring
                        const Text(
                          '📊 Giám sát điện năng',
                          style: TextStyle(
                            fontSize: 20,
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                        const SizedBox(height: 16),
                        _buildInfoCard(
                          'Điện áp',
                          _relayData!['voltage'].toStringAsFixed(1),
                          'V',
                          Icons.bolt,
                          Colors.blue,
                        ),
                        const SizedBox(height: 12),
                        _buildInfoCard(
                          'Dòng điện',
                          _relayData!['current'].toStringAsFixed(2),
                          'A',
                          Icons.electrical_services,
                          Colors.orange,
                        ),
                        const SizedBox(height: 12),
                        _buildInfoCard(
                          'Công suất',
                          _relayData!['power'].toStringAsFixed(2),
                          'kW',
                          Icons.power,
                          Colors.purple,
                        ),
                        const SizedBox(height: 12),
                        _buildInfoCard(
                          'Năng lượng',
                          _relayData!['energy'].toStringAsFixed(2),
                          'kWh',
                          Icons.battery_charging_full,
                          Colors.teal,
                        ),
                        const SizedBox(height: 12),
                        _buildInfoCard(
                          'Tần số',
                          _relayData!['frequency'].toStringAsFixed(1),
                          'Hz',
                          Icons.waves,
                          Colors.deepOrange,
                        ),
                        const SizedBox(height: 12),
                        _buildInfoCard(
                          'Hệ số công suất',
                          _relayData!['power_factor'].toStringAsFixed(2),
                          '',
                          Icons.speed,
                          Colors.brown,
                        ),
                        const SizedBox(height: 24),
                        
                        // Last update
                        Center(
                          child: Text(
                            'Cập nhật: ${_relayData!['last_update']}',
                            style: TextStyle(
                              fontSize: 12,
                              color: Colors.grey.shade600,
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
    );
  }
}
