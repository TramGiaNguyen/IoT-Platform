import 'package:flutter/material.dart';
import '../services/api_service.dart';
import '../models/scheduled_rule.dart';

class ScheduledRuleFormScreen extends StatefulWidget {
  final int? roomId;
  final ScheduledRule? rule;

  const ScheduledRuleFormScreen({Key? key, this.roomId, this.rule})
      : super(key: key);

  @override
  State<ScheduledRuleFormScreen> createState() =>
      _ScheduledRuleFormScreenState();
}

class _ScheduledRuleFormScreenState extends State<ScheduledRuleFormScreen> {
  final ApiService _apiService = ApiService();
  final _formKey = GlobalKey<FormState>();

  late TextEditingController _nameController;

  List<Map<String, dynamic>> _devices = [];
  List<Map<String, dynamic>> _relays = [];
  bool _isLoadingDevices = true;
  bool _isLoadingRelays = false;

  String? _deviceId;
  TimeOfDay _selectedTime = const TimeOfDay(hour: 8, minute: 0);
  Set<int> _selectedDays = {1, 2, 3, 4, 5};
  bool _isDaily = true;

  int? _actionRelay;
  String _actionState = 'ON';
  bool _isEnabled = true;
  bool _isSaving = false;

  @override
  void initState() {
    super.initState();

    _nameController = TextEditingController();

    if (widget.rule != null) {
      _nameController.text = widget.rule!.tenRule;
      _deviceId = widget.rule!.deviceId;
      _parseCronExpression(widget.rule!.cronExpression);

      if (widget.rule!.actionParams != null) {
        _actionRelay = widget.rule!.actionParams!['relay'];
        _actionState = widget.rule!.actionParams!['state'] ?? 'ON';
      }

      _isEnabled = widget.rule!.trangThai == 'enabled';
    }

    _loadDevices();
  }

  void _parseCronExpression(String cron) {
    final parts = cron.split(' ');
    if (parts.length >= 5) {
      final minute = int.tryParse(parts[0]) ?? 0;
      final hour = int.tryParse(parts[1]) ?? 8;
      _selectedTime = TimeOfDay(hour: hour, minute: minute);

      final weekday = parts[4];
      if (weekday == '*') {
        _isDaily = true;
        _selectedDays = {1, 2, 3, 4, 5, 6, 7};
      } else {
        _isDaily = false;
        _selectedDays = weekday
            .split(',')
            .map((d) => int.tryParse(d) ?? 1)
            .where((d) => d >= 0 && d <= 7)
            .toSet();
        if (_selectedDays.contains(0)) {
          _selectedDays.remove(0);
          _selectedDays.add(7);
        }
      }
    }
  }

  String _buildCronExpression() {
    final minute = _selectedTime.minute;
    final hour = _selectedTime.hour;

    if (_isDaily) {
      return '$minute $hour * * *';
    } else {
      final days = _selectedDays.map((d) => d == 7 ? 0 : d).toList()..sort();
      return '$minute $hour * * ${days.join(',')}';
    }
  }

  Future<void> _loadDevices() async {
    setState(() => _isLoadingDevices = true);
    
    try {
      final devices = await _apiService.getDevicesForDropdown(
        phongId: widget.roomId,
      );
      
      setState(() {
        _devices = devices;
        _isLoadingDevices = false;
      });
      
      if (_deviceId != null) {
        _loadRelays(_deviceId!);
      }
    } catch (e) {
      setState(() => _isLoadingDevices = false);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Loi tai thiet bi: ${e.toString()}'),
            backgroundColor: const Color(0xFFBA1A1A),
          ),
        );
      }
    }
  }

  Future<void> _loadRelays(String deviceId) async {
    setState(() => _isLoadingRelays = true);
    
    try {
      final relays = await _apiService.getDeviceRelays(deviceId);
      setState(() {
        _relays = relays;
        _isLoadingRelays = false;
        if (_actionRelay != null && 
            !relays.any((r) => r['relay'] == _actionRelay)) {
          _actionRelay = null;
        }
      });
    } catch (e) {
      setState(() => _isLoadingRelays = false);
    }
  }

  Future<void> _selectTime() async {
    final time = await showTimePicker(
      context: context,
      initialTime: _selectedTime,
    );

    if (time != null) {
      setState(() => _selectedTime = time);
    }
  }

  @override
  void dispose() {
    _nameController.dispose();
    super.dispose();
  }

  Future<void> _saveRule() async {
    if (!_formKey.currentState!.validate()) {
      return;
    }

    if (_deviceId == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Vui long chon thiet bi'),
          backgroundColor: Color(0xFFBA1A1A),
        ),
      );
      return;
    }

    if (_actionRelay == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Vui long chon relay'),
          backgroundColor: Color(0xFFBA1A1A),
        ),
      );
      return;
    }

    if (!_isDaily && _selectedDays.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Vui long chon it nhat mot ngay trong tuan'),
          backgroundColor: Color(0xFFBA1A1A),
        ),
      );
      return;
    }

    setState(() => _isSaving = true);

    try {
      final ruleData = {
        'ten_rule': _nameController.text,
        'phong_id': widget.roomId,
        'cron_expression': _buildCronExpression(),
        'device_id': _deviceId,
        'action_command': 'relay',
        'action_params': {
          'relay': _actionRelay,
          'state': _actionState,
        },
        'trang_thai': _isEnabled ? 'enabled' : 'disabled',
      };

      if (widget.rule != null) {
        await _apiService.updateScheduledRule(widget.rule!.id, ruleData);
      } else {
        await _apiService.createScheduledRule(ruleData);
      }

      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
                widget.rule != null ? 'Da cap nhat lich trinh' : 'Da tao lich trinh'),
            backgroundColor: const Color(0xFF006a6a),
          ),
        );
        Navigator.pop(context, true);
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Loi: ${e.toString()}'),
            backgroundColor: const Color(0xFFBA1A1A),
          ),
        );
      }
    } finally {
      if (mounted) {
        setState(() => _isSaving = false);
      }
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
            // App Bar
            Container(
              padding: EdgeInsets.only(
                top: MediaQuery.of(context).padding.top + 8,
                left: 4,
                right: 8,
                bottom: 8,
              ),
              decoration: const BoxDecoration(
                color: Color(0xFFF7FAFC),
                boxShadow: [
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
                    icon: const Icon(Icons.close, color: Color(0xFF003345)),
                    onPressed: () => Navigator.pop(context),
                  ),
                  Expanded(
                    child: Text(
                      widget.rule != null ? 'Sua Lich Trinh' : 'Tao Lich Trinh',
                      style: const TextStyle(
                        fontFamily: 'Manrope',
                        fontSize: 20,
                        fontWeight: FontWeight.w700,
                        letterSpacing: -0.02,
                        color: Color(0xFF003345),
                      ),
                    ),
                  ),
                ],
              ),
            ),

            // Content
            Expanded(
              child: _isLoadingDevices
                  ? const Center(
                      child: CircularProgressIndicator(
                        color: Color(0xFF006a6a),
                      ),
                    )
                  : Form(
                      key: _formKey,
                      child: ListView(
                        padding: const EdgeInsets.all(20),
                        children: [
                          // Rule name
                          _buildSectionLabel('TEN LICH TRINH'),
                          const SizedBox(height: 10),
                          TextFormField(
                            controller: _nameController,
                            decoration: _inputDecoration(
                              hintText: 'VD: Tuoi cay buoi sang',
                              prefixIcon: Icons.label_outline,
                            ),
                            validator: (value) {
                              if (value == null || value.isEmpty) {
                                return 'Vui long nhap ten lich trinh';
                              }
                              return null;
                            },
                          ),

                          const SizedBox(height: 28),

                          // Time
                          _buildSectionLabel('THOI GIAN'),
                          const SizedBox(height: 10),

                          // Time picker card - glass panel
                          GestureDetector(
                            onTap: _selectTime,
                            child: Container(
                              padding: const EdgeInsets.all(24),
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
                              child: Row(
                                children: [
                                  Container(
                                    padding: const EdgeInsets.all(14),
                                    decoration: BoxDecoration(
                                      color: Colors.white.withOpacity(0.15),
                                      borderRadius: BorderRadius.circular(16),
                                    ),
                                    child: const Icon(
                                      Icons.access_time,
                                      color: Colors.white,
                                      size: 28,
                                    ),
                                  ),
                                  const SizedBox(width: 16),
                                  Expanded(
                                    child: Column(
                                      crossAxisAlignment: CrossAxisAlignment.start,
                                      children: [
                                        const Text(
                                          'GIO THUC HIEN',
                                          style: TextStyle(
                                            fontFamily: 'Inter',
                                            fontSize: 10,
                                            fontWeight: FontWeight.w600,
                                            letterSpacing: 0.15,
                                            color: Color(0xFF90EFEF),
                                          ),
                                        ),
                                        const SizedBox(height: 4),
                                        Text(
                                          '${_selectedTime.hour.toString().padLeft(2, '0')}:${_selectedTime.minute.toString().padLeft(2, '0')}',
                                          style: const TextStyle(
                                            fontFamily: 'Manrope',
                                            fontSize: 36,
                                            fontWeight: FontWeight.w800,
                                            color: Colors.white,
                                          ),
                                        ),
                                      ],
                                    ),
                                  ),
                                  Icon(
                                    Icons.edit_calendar,
                                    color: Colors.white.withOpacity(0.7),
                                    size: 28,
                                  ),
                                ],
                              ),
                            ),
                          ),

                          const SizedBox(height: 14),

                          // Daily or specific days
                          Container(
                            padding: const EdgeInsets.all(16),
                            decoration: BoxDecoration(
                              color: Colors.white,
                              borderRadius: BorderRadius.circular(16),
                              border: Border.all(
                                color: const Color(0xFFC0C7CD).withOpacity(0.15),
                                width: 1,
                              ),
                            ),
                            child: Row(
                              children: [
                                Icon(
                                  Icons.event_repeat,
                                  color: _isDaily ? const Color(0xFF006a6a) : const Color(0xFF40484C),
                                ),
                                const SizedBox(width: 12),
                                Expanded(
                                  child: Column(
                                    crossAxisAlignment: CrossAxisAlignment.start,
                                    children: [
                                      Text(
                                        _isDaily ? 'Hang ngay' : 'Chon ngay cu the',
                                        style: const TextStyle(
                                          fontFamily: 'Manrope',
                                          fontWeight: FontWeight.w600,
                                          color: Color(0xFF003345),
                                        ),
                                      ),
                                      Text(
                                        _isDaily ? 'Chay moi ngay' : 'Chon ngay trong tuan',
                                        style: const TextStyle(
                                          fontFamily: 'Inter',
                                          fontSize: 12,
                                          color: Color(0xFF40484C),
                                        ),
                                      ),
                                    ],
                                  ),
                                ),
                                Switch(
                                  value: _isDaily,
                                  onChanged: (value) {
                                    setState(() {
                                      _isDaily = value;
                                      if (value) {
                                        _selectedDays = {1, 2, 3, 4, 5, 6, 7};
                                      }
                                    });
                                  },
                                  activeColor: const Color(0xFF006a6a),
                                ),
                              ],
                            ),
                          ),

                          if (!_isDaily) ...[
                            const SizedBox(height: 14),
                            // Day chips
                            _buildSectionLabel('CHON NGAY'),
                            const SizedBox(height: 10),
                            Wrap(
                              spacing: 8,
                              runSpacing: 8,
                              children: [
                                _buildDayChip('T2', 1),
                                _buildDayChip('T3', 2),
                                _buildDayChip('T4', 3),
                                _buildDayChip('T5', 4),
                                _buildDayChip('T6', 5),
                                _buildDayChip('T7', 6),
                                _buildDayChip('CN', 7),
                              ],
                            ),
                          ],

                          const SizedBox(height: 28),

                          // Actions
                          _buildSectionLabel('HANH DONG'),
                          const SizedBox(height: 10),

                          // Device dropdown
                          DropdownButtonFormField<String>(
                            value: _deviceId,
                            decoration: _inputDecoration(
                              hintText: 'Chon thiet bi',
                              prefixIcon: Icons.devices,
                            ),
                            items: _devices.map((device) {
                              return DropdownMenuItem<String>(
                                value: device['device_id'] as String,
                                child: Text(
                                  device['name'] ?? device['device_id'],
                                  overflow: TextOverflow.ellipsis,
                                ),
                              );
                            }).toList(),
                            onChanged: (value) {
                              setState(() {
                                _deviceId = value;
                                _actionRelay = null;
                                if (value != null) {
                                  _loadRelays(value);
                                }
                              });
                            },
                            validator: (value) {
                              if (value == null) {
                                return 'Vui long chon thiet bi';
                              }
                              return null;
                            },
                          ),

                          const SizedBox(height: 14),

                          // Relay and state
                          Row(
                            children: [
                              Expanded(
                                child: _isLoadingRelays
                                    ? const Center(child: CircularProgressIndicator(color: Color(0xFF006a6a)))
                                    : DropdownButtonFormField<int>(
                                        value: _actionRelay,
                                        decoration: _inputDecoration(
                                          hintText: 'Relay',
                                          prefixIcon: Icons.power,
                                        ),
                                        items: _relays.map((relay) {
                                          return DropdownMenuItem<int>(
                                            value: relay['relay'] as int,
                                            child: Text(relay['name'] as String),
                                          );
                                        }).toList(),
                                        onChanged: (value) {
                                          setState(() => _actionRelay = value);
                                        },
                                        validator: (value) {
                                          if (value == null) {
                                            return 'Chon relay';
                                          }
                                          return null;
                                        },
                                      ),
                              ),
                              const SizedBox(width: 12),
                              Expanded(
                                child: DropdownButtonFormField<String>(
                                  value: _actionState,
                                  decoration: _inputDecoration(
                                    hintText: 'Trang thai',
                                    prefixIcon: Icons.toggle_on,
                                  ),
                                  items: const [
                                    DropdownMenuItem(value: 'ON', child: Text('BAT')),
                                    DropdownMenuItem(value: 'OFF', child: Text('TAT')),
                                  ],
                                  onChanged: (value) {
                                    setState(() => _actionState = value!);
                                  },
                                ),
                              ),
                            ],
                          ),

                          const SizedBox(height: 14),

                          // Enable/Disable
                          Container(
                            padding: const EdgeInsets.all(16),
                            decoration: BoxDecoration(
                              color: Colors.white,
                              borderRadius: BorderRadius.circular(16),
                              border: Border.all(
                                color: const Color(0xFFC0C7CD).withOpacity(0.15),
                                width: 1,
                              ),
                            ),
                            child: Row(
                              children: [
                                Icon(
                                  _isEnabled ? Icons.check_circle : Icons.pause_circle,
                                  color: const Color(0xFF006a6a),
                                ),
                                const SizedBox(width: 12),
                                Expanded(
                                  child: Text(
                                    _isEnabled ? 'Kich hoat lich trinh' : 'Lich trinh dang tat',
                                    style: const TextStyle(
                                      fontFamily: 'Manrope',
                                      fontWeight: FontWeight.w600,
                                      color: Color(0xFF003345),
                                    ),
                                  ),
                                ),
                                Switch(
                                  value: _isEnabled,
                                  onChanged: (value) {
                                    setState(() => _isEnabled = value);
                                  },
                                  activeColor: const Color(0xFF006a6a),
                                ),
                              ],
                            ),
                          ),

                          const SizedBox(height: 20),

                          // Preview card
                          Container(
                            padding: const EdgeInsets.all(16),
                            decoration: BoxDecoration(
                              gradient: const LinearGradient(
                                begin: Alignment.topLeft,
                                end: Alignment.bottomRight,
                                colors: [
                                  Color(0xFF003345),
                                  Color(0xFF004B63),
                                ],
                              ),
                              borderRadius: BorderRadius.circular(16),
                            ),
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Row(
                                  children: [
                                    Icon(
                                      Icons.visibility,
                                      color: Colors.white.withOpacity(0.7),
                                      size: 18,
                                    ),
                                    const SizedBox(width: 8),
                                    const Text(
                                      'XEM TRUOC',
                                      style: TextStyle(
                                        fontFamily: 'Inter',
                                        fontSize: 10,
                                        fontWeight: FontWeight.w600,
                                        letterSpacing: 0.15,
                                        color: Color(0xFF90EFEF),
                                      ),
                                    ),
                                  ],
                                ),
                                const SizedBox(height: 8),
                                Text(
                                  _buildPreviewText(),
                                  style: const TextStyle(
                                    fontFamily: 'Manrope',
                                    fontSize: 14,
                                    fontWeight: FontWeight.w600,
                                    color: Colors.white,
                                  ),
                                ),
                                const SizedBox(height: 4),
                                Text(
                                  'Cron: ${_buildCronExpression()}',
                                  style: TextStyle(
                                    fontFamily: 'Inter',
                                    fontSize: 10,
                                    color: Colors.white.withOpacity(0.5),
                                  ),
                                ),
                              ],
                            ),
                          ),

                          const SizedBox(height: 28),

                          // Save button
                          SizedBox(
                            width: double.infinity,
                            height: 56,
                            child: DecoratedBox(
                              decoration: BoxDecoration(
                                gradient: const LinearGradient(
                                  begin: Alignment.centerLeft,
                                  end: Alignment.centerRight,
                                  colors: [
                                    Color(0xFF003345),
                                    Color(0xFF004B63),
                                  ],
                                ),
                                borderRadius: BorderRadius.circular(9999),
                                boxShadow: const [
                                  BoxShadow(
                                    color: Color(0x40003345),
                                    blurRadius: 32,
                                    offset: Offset(0, 12),
                                  ),
                                ],
                              ),
                              child: ElevatedButton(
                                onPressed: _isSaving ? null : _saveRule,
                                style: ElevatedButton.styleFrom(
                                  backgroundColor: Colors.transparent,
                                  foregroundColor: Colors.white,
                                  shadowColor: Colors.transparent,
                                  shape: RoundedRectangleBorder(
                                    borderRadius: BorderRadius.circular(9999),
                                  ),
                                ),
                                child: _isSaving
                                    ? const SizedBox(
                                        width: 24,
                                        height: 24,
                                        child: CircularProgressIndicator(
                                          strokeWidth: 2.5,
                                          valueColor: AlwaysStoppedAnimation<Color>(Colors.white),
                                        ),
                                      )
                                    : Text(
                                        widget.rule != null ? 'CAP NHAT' : 'TAO LICH TRINH',
                                        style: const TextStyle(
                                          fontFamily: 'Manrope',
                                          fontSize: 16,
                                          fontWeight: FontWeight.w700,
                                          letterSpacing: 0.02,
                                        ),
                                      ),
                              ),
                            ),
                          ),
                          const SizedBox(height: 40),
                        ],
                      ),
                    ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildSectionLabel(String text) {
    return Text(
      text,
      style: const TextStyle(
        fontFamily: 'Inter',
        fontSize: 10,
        fontWeight: FontWeight.w600,
        letterSpacing: 0.15,
        color: Color(0xFF40484C),
      ),
    );
  }

  Widget _buildDayChip(String label, int day) {
    final isSelected = _selectedDays.contains(day);
    return GestureDetector(
      onTap: () {
        setState(() {
          if (isSelected) {
            _selectedDays.remove(day);
          } else {
            _selectedDays.add(day);
          }
        });
      },
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 200),
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
        decoration: BoxDecoration(
          color: isSelected ? const Color(0xFF006a6a) : const Color(0xFFF1F4F6),
          borderRadius: BorderRadius.circular(9999),
        ),
        child: Text(
          label,
          style: TextStyle(
            fontFamily: 'Manrope',
            fontSize: 13,
            fontWeight: FontWeight.w600,
            color: isSelected ? Colors.white : const Color(0xFF40484C),
          ),
        ),
      ),
    );
  }

  InputDecoration _inputDecoration({
    String? hintText,
    IconData? prefixIcon,
  }) {
    return InputDecoration(
      hintText: hintText,
      prefixIcon: prefixIcon != null
          ? Icon(prefixIcon, color: const Color(0xFF006a6a))
          : null,
      filled: true,
      fillColor: const Color(0xFFF1F4F6),
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(16),
        borderSide: BorderSide(
          color: const Color(0xFFC0C7CD).withOpacity(0.15),
        ),
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(16),
        borderSide: BorderSide(
          color: const Color(0xFFC0C7CD).withOpacity(0.15),
        ),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(16),
        borderSide: BorderSide(
          color: const Color(0xFF006a6a).withOpacity(0.3),
          width: 2,
        ),
      ),
      contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
    );
  }

  String _buildPreviewText() {
    final time =
        '${_selectedTime.hour.toString().padLeft(2, '0')}:${_selectedTime.minute.toString().padLeft(2, '0')}';

    String relayName = 'relay $_actionRelay';
    if (_actionRelay != null) {
      final relay = _relays.firstWhere(
        (r) => r['relay'] == _actionRelay,
        orElse: () => {'name': 'Relay $_actionRelay'},
      );
      relayName = relay['name'] as String;
    }

    if (_isDaily) {
      return 'Hang ngay luc $time: $_actionState $relayName';
    } else {
      final dayNames = ['', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];
      final days = _selectedDays.map((d) => dayNames[d]).join(', ');
      return 'Moi $days luc $time: $_actionState $relayName';
    }
  }
}
