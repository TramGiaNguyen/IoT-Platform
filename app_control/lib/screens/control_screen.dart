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
        
        if (_error!.contains('het han')) {
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
            backgroundColor: const Color(0xFFBA1A1A),
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
      
      await Future.delayed(const Duration(seconds: 2));
      await _loadData(silent: true);
      
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Da ${newState == 'ON' ? 'bat' : 'tat'} relay $relay'),
            backgroundColor: const Color(0xFF006a6a),
            duration: const Duration(seconds: 1),
          ),
        );
      }
    } catch (e) {
      await _loadData(silent: true);
      
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(e.toString().replaceAll('Exception: ', '')),
            backgroundColor: const Color(0xFFBA1A1A),
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
    final relayColor = _getColorForRelay(name);

    return Container(
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(24),
        border: Border.all(
          color: isOn 
              ? const Color(0xFF006a6a).withOpacity(0.3)
              : const Color(0xFFC0C7CD).withOpacity(0.15),
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
      child: Material(
        color: Colors.transparent,
        borderRadius: BorderRadius.circular(24),
        child: InkWell(
          onTap: isLoading ? null : () => _controlRelay(relay, state),
          borderRadius: BorderRadius.circular(24),
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Container(
                  padding: const EdgeInsets.all(14),
                  decoration: BoxDecoration(
                    color: relayColor.withOpacity(0.1),
                    borderRadius: BorderRadius.circular(16),
                  ),
                  child: Icon(
                    _getIconForRelay(name),
                    size: 36,
                    color: isOn ? relayColor : const Color(0xFF40484C),
                  ),
                ),
                const SizedBox(height: 12),
                Text(
                  name,
                  style: const TextStyle(
                    fontFamily: 'Manrope',
                    fontSize: 14,
                    fontWeight: FontWeight.w700,
                    color: Color(0xFF003345),
                  ),
                  textAlign: TextAlign.center,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                ),
                const SizedBox(height: 8),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                  decoration: BoxDecoration(
                    color: isOn
                        ? const Color(0xFF90EFEF).withOpacity(0.3)
                        : const Color(0xFFE0E3E5),
                    borderRadius: BorderRadius.circular(9999),
                  ),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Container(
                        width: 6,
                        height: 6,
                        decoration: BoxDecoration(
                          color: isOn
                              ? const Color(0xFF006a6a)
                              : const Color(0xFF71787D),
                          shape: BoxShape.circle,
                        ),
                      ),
                      const SizedBox(width: 6),
                      Text(
                        isOn ? 'DANG BAT' : 'DANG TAT',
                        style: TextStyle(
                          fontFamily: 'Inter',
                          fontSize: 11,
                          fontWeight: FontWeight.w600,
                          letterSpacing: 0.3,
                          color: isOn
                              ? const Color(0xFF006e6e)
                              : const Color(0xFF40484C),
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 12),
                SizedBox(
                  width: double.infinity,
                  child: DecoratedBox(
                    decoration: BoxDecoration(
                      gradient: LinearGradient(
                        begin: Alignment.centerLeft,
                        end: Alignment.centerRight,
                        colors: isOn
                            ? [const Color(0xFF006a6a), const Color(0xFF004D56)]
                            : [const Color(0xFF003345), const Color(0xFF004B63)],
                      ),
                      borderRadius: BorderRadius.circular(9999),
                      boxShadow: [
                        BoxShadow(
                          color: (isOn
                                  ? const Color(0xFF006a6a)
                                  : const Color(0xFF003345))
                              .withOpacity(0.25),
                          blurRadius: 16,
                          offset: const Offset(0, 6),
                        ),
                      ],
                    ),
                    child: ElevatedButton(
                      onPressed: isLoading ? null : () => _controlRelay(relay, state),
                      style: ElevatedButton.styleFrom(
                        backgroundColor: Colors.transparent,
                        foregroundColor: Colors.white,
                        shadowColor: Colors.transparent,
                        disabledBackgroundColor: Colors.transparent,
                        padding: const EdgeInsets.symmetric(vertical: 12),
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(9999),
                        ),
                      ),
                      child: isLoading
                          ? const SizedBox(
                              height: 18,
                              width: 18,
                              child: CircularProgressIndicator(
                                strokeWidth: 2,
                                color: Colors.white,
                              ),
                            )
                          : Text(
                              isOn ? 'TAT' : 'BAT',
                              style: const TextStyle(
                                fontFamily: 'Manrope',
                                fontSize: 13,
                                fontWeight: FontWeight.w700,
                                letterSpacing: 0.3,
                              ),
                            ),
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildInfoCard(String title, String value, String unit, IconData icon, Color color) {
    return Container(
      padding: const EdgeInsets.all(16),
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
        children: [
          Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: color.withOpacity(0.1),
              borderRadius: BorderRadius.circular(16),
            ),
            child: Icon(icon, color: color, size: 28),
          ),
          const SizedBox(height: 12),
          Text(
            title,
            style: const TextStyle(
              fontFamily: 'Inter',
              fontSize: 10,
              fontWeight: FontWeight.w600,
              letterSpacing: 0.5,
              color: Color(0xFF40484C),
            ),
          ),
          const SizedBox(height: 4),
          Text(
            value,
            style: const TextStyle(
              fontFamily: 'Manrope',
              fontSize: 20,
              fontWeight: FontWeight.w700,
              letterSpacing: -0.02,
              color: Color(0xFF003345),
            ),
          ),
          if (unit.isNotEmpty)
            Text(
              unit,
              style: const TextStyle(
                fontFamily: 'Inter',
                fontSize: 10,
                color: Color(0xFF71787D),
              ),
            ),
        ],
      ),
    );
  }

  Widget _buildAcCard() {
    final temp = (_acData?['temp'] ?? 24).toString();
    final on = _acData?['on'] == true;
    final humidity = _acData?['humidity'];
    final indoorTemp = _acData?['indoorTemp'];

    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [
            Color(0xFF003345),
            Color(0xFF004B63),
          ],
        ),
        borderRadius: BorderRadius.circular(24),
        boxShadow: const [
          BoxShadow(
            color: Color(0x40003345),
            blurRadius: 32,
            offset: Offset(0, 12),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            'Dieu khien may lanh',
            style: TextStyle(
              fontFamily: 'Manrope',
              fontSize: 20,
              fontWeight: FontWeight.w700,
              color: Colors.white,
            ),
          ),
          const SizedBox(height: 16),
          Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      '$temp\u00B0C',
                      style: const TextStyle(
                        fontFamily: 'Manrope',
                        fontSize: 36,
                        fontWeight: FontWeight.w800,
                        color: Colors.white,
                      ),
                    ),
                    Text(
                      'Nhiet do phong: ${indoorTemp ?? "--"}\u00B0C',
                      style: TextStyle(
                        fontFamily: 'Inter',
                        fontSize: 12,
                        color: Colors.white.withOpacity(0.7),
                      ),
                    ),
                    Text(
                      'Do am: ${humidity ?? "--"}%',
                      style: TextStyle(
                        fontFamily: 'Inter',
                        fontSize: 12,
                        color: Colors.white.withOpacity(0.7),
                      ),
                    ),
                    const SizedBox(height: 8),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                      decoration: BoxDecoration(
                        color: on
                            ? const Color(0xFF90EFEF).withOpacity(0.3)
                            : Colors.white.withOpacity(0.2),
                        borderRadius: BorderRadius.circular(9999),
                      ),
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Container(
                            width: 6,
                            height: 6,
                            decoration: BoxDecoration(
                              color: on ? const Color(0xFF90EFEF) : Colors.white.withOpacity(0.5),
                              shape: BoxShape.circle,
                            ),
                          ),
                          const SizedBox(width: 6),
                          Text(
                            on ? 'DANG BAT' : 'DANG TAT',
                            style: TextStyle(
                              fontFamily: 'Inter',
                              fontSize: 11,
                              fontWeight: FontWeight.w600,
                              color: on ? const Color(0xFF90EFEF) : Colors.white.withOpacity(0.7),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
              Container(
                padding: const EdgeInsets.all(20),
                decoration: BoxDecoration(
                  color: Colors.white.withOpacity(0.15),
                  borderRadius: BorderRadius.circular(20),
                ),
                child: const Icon(
                  Icons.ac_unit,
                  size: 48,
                  color: Colors.white,
                ),
              ),
            ],
          ),
          const SizedBox(height: 20),
          GridView.count(
            crossAxisCount: 2,
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            mainAxisSpacing: 10,
            crossAxisSpacing: 10,
            childAspectRatio: 2.5,
            children: [
              _buildAcButton('BAT MAY', 'on', Icons.power_settings_new),
              _buildAcButton('TAT MAY', 'off', Icons.power_settings_new),
              _buildAcButton('TANG +', 'up', Icons.add),
              _buildAcButton('GIAM -', 'down', Icons.remove),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildAcButton(String label, String command, IconData icon) {
    return SizedBox(
      height: 44,
      child: DecoratedBox(
        decoration: BoxDecoration(
          color: Colors.white.withOpacity(0.15),
          borderRadius: BorderRadius.circular(9999),
        ),
        child: ElevatedButton.icon(
          onPressed: _acCommandLoading ? null : () => _controlAc(command),
          style: ElevatedButton.styleFrom(
            backgroundColor: Colors.transparent,
            foregroundColor: Colors.white,
            shadowColor: Colors.transparent,
            padding: const EdgeInsets.symmetric(horizontal: 12),
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(9999),
            ),
          ),
          icon: Icon(icon, size: 18),
          label: Text(
            label,
            style: const TextStyle(
              fontFamily: 'Manrope',
              fontSize: 12,
              fontWeight: FontWeight.w700,
            ),
          ),
        ),
      ),
    );
  }

  IconData _getIconForRelay(String name) {
    final lowerName = name.toLowerCase();
    if (lowerName.contains('den') || lowerName.contains('light')) {
      return Icons.lightbulb;
    }
    if (lowerName.contains('quat') || lowerName.contains('fan')) {
      return Icons.air;
    }
    if (lowerName.contains('may') || lowerName.contains('ac')) {
      return Icons.ac_unit;
    }
    if (lowerName.contains('bom') || lowerName.contains('pump')) {
      return Icons.water;
    }
    if (lowerName.contains('cua') || lowerName.contains('door')) {
      return Icons.door_front_door;
    }
    return Icons.power;
  }

  Color _getColorForRelay(String name) {
    final lowerName = name.toLowerCase();
    if (lowerName.contains('den') || lowerName.contains('light')) {
      return const Color(0xFFF59E0B);
    }
    if (lowerName.contains('quat') || lowerName.contains('fan')) {
      return const Color(0xFF0EA5E9);
    }
    if (lowerName.contains('may') || lowerName.contains('ac')) {
      return const Color(0xFF06B6D4);
    }
    if (lowerName.contains('bom') || lowerName.contains('pump')) {
      return const Color(0xFF14B8A6);
    }
    return const Color(0xFF006a6a);
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
                left: 8,
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
                  const SizedBox(width: 8),
                  const Expanded(
                    child: Text(
                      'Trung tam Chuyen doi So',
                      style: TextStyle(
                        fontFamily: 'Manrope',
                        fontSize: 20,
                        fontWeight: FontWeight.w700,
                        letterSpacing: -0.02,
                        color: Color(0xFF003345),
                      ),
                    ),
                  ),
                  IconButton(
                    icon: const Icon(Icons.refresh, color: Color(0xFF006a6a)),
                    onPressed: _loadData,
                  ),
                  IconButton(
                    icon: const Icon(Icons.logout, color: Color(0xFF003345)),
                    onPressed: _logout,
                  ),
                ],
              ),
            ),

            // Content
            Expanded(
              child: _isLoading
                  ? const Center(
                      child: CircularProgressIndicator(color: Color(0xFF006a6a)),
                    )
                  : _error != null
                      ? Center(
                          child: Column(
                            mainAxisAlignment: MainAxisAlignment.center,
                            children: [
                              const Icon(Icons.error_outline, size: 60, color: Color(0xFFBA1A1A)),
                              const SizedBox(height: 16),
                              Text(_error!, textAlign: TextAlign.center),
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
                                  style: TextStyle(color: Colors.white, fontFamily: 'Manrope', fontWeight: FontWeight.w600),
                                ),
                              ),
                            ],
                          ),
                        )
                      : RefreshIndicator(
                          onRefresh: () => _loadData(),
                          color: const Color(0xFF006a6a),
                          child: SingleChildScrollView(
                            physics: const AlwaysScrollableScrollPhysics(),
                            padding: const EdgeInsets.all(16),
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                _buildAcCard(),
                                const SizedBox(height: 24),
                                // Relay controls
                                const Row(
                                  children: [
                                    Icon(Icons.settings_remote, size: 20, color: Color(0xFF006a6a)),
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
                                GridView.count(
                                  crossAxisCount: 2,
                                  shrinkWrap: true,
                                  physics: const NeverScrollableScrollPhysics(),
                                  mainAxisSpacing: 12,
                                  crossAxisSpacing: 12,
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
                                const SizedBox(height: 24),
                                // Power monitoring
                                const Row(
                                  children: [
                                    Icon(Icons.analytics, size: 20, color: Color(0xFFF97316)),
                                    SizedBox(width: 8),
                                    Text(
                                      'GIAM SAT DIEN NANG',
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
                                GridView.count(
                                  crossAxisCount: 2,
                                  shrinkWrap: true,
                                  physics: const NeverScrollableScrollPhysics(),
                                  mainAxisSpacing: 12,
                                  crossAxisSpacing: 12,
                                  childAspectRatio: 1.0,
                                  children: [
                                    _buildInfoCard('Dien ap', _relayData!['voltage'].toStringAsFixed(1), 'V', Icons.bolt, const Color(0xFFF59E0B)),
                                    _buildInfoCard('Dong dien', _relayData!['current'].toStringAsFixed(2), 'A', Icons.electric_bolt, const Color(0xFFEF4444)),
                                    _buildInfoCard('Cong suat', _relayData!['power'].toStringAsFixed(2), 'kW', Icons.power, const Color(0xFF22C55E)),
                                    _buildInfoCard('Nang luong', _relayData!['energy'].toStringAsFixed(2), 'kWh', Icons.battery_charging_full, const Color(0xFF14B8A6)),
                                    _buildInfoCard('Tan so', _relayData!['frequency'].toStringAsFixed(1), 'Hz', Icons.waves, const Color(0xFFA855F7)),
                                    _buildInfoCard('He so cong suat', _relayData!['power_factor'].toStringAsFixed(2), '', Icons.speed, const Color(0xFF92400E)),
                                  ],
                                ),
                                const SizedBox(height: 16),
                                Center(
                                  child: Text(
                                    'Cap nhat: ${_relayData!['last_update']}',
                                    style: const TextStyle(
                                      fontFamily: 'Inter',
                                      fontSize: 10,
                                      fontWeight: FontWeight.w600,
                                      letterSpacing: 0.5,
                                      color: Color(0xFF71787D),
                                    ),
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
}
