// app_control/lib/screens/scheduled_rule_form_screen.dart

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

  // Devices and relays data
  List<Map<String, dynamic>> _devices = [];
  List<Map<String, dynamic>> _relays = [];
  bool _isLoadingDevices = true;
  bool _isLoadingRelays = false;

  String? _deviceId;
  TimeOfDay _selectedTime = const TimeOfDay(hour: 8, minute: 0);
  Set<int> _selectedDays = {1, 2, 3, 4, 5}; // Mon-Fri
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
      // Edit mode
      _nameController.text = widget.rule!.tenRule;
      _deviceId = widget.rule!.deviceId;

      // Parse cron expression
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
      
      // Load relays for pre-selected device
      if (_deviceId != null) {
        _loadRelays(_deviceId!);
      }
    } catch (e) {
      setState(() => _isLoadingDevices = false);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Lỗi tải thiết bị: ${e.toString()}'),
            backgroundColor: Colors.red,
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
        // Reset relay selection if current selection not in list
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
          content: Text('Vui lòng chọn thiết bị'),
          backgroundColor: Colors.red,
        ),
      );
      return;
    }

    if (_actionRelay == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Vui lòng chọn relay'),
          backgroundColor: Colors.red,
        ),
      );
      return;
    }

    if (!_isDaily && _selectedDays.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Vui lòng chọn ít nhất một ngày trong tuần'),
          backgroundColor: Colors.red,
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
                widget.rule != null ? 'Đã cập nhật lịch trình' : 'Đã tạo lịch trình'),
            backgroundColor: Colors.green,
          ),
        );
        Navigator.pop(context, true);
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Lỗi: ${e.toString()}'),
            backgroundColor: Colors.red,
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
      appBar: AppBar(
        title: Text(widget.rule != null ? 'Sửa Lịch Trình' : 'Tạo Lịch Trình'),
      ),
      body: _isLoadingDevices
          ? const Center(child: CircularProgressIndicator())
          : Form(
              key: _formKey,
              child: ListView(
                padding: const EdgeInsets.all(16),
                children: [
                  // Rule name
                  TextFormField(
                    controller: _nameController,
                    decoration: const InputDecoration(
                      labelText: 'Tên lịch trình',
                      border: OutlineInputBorder(),
                      prefixIcon: Icon(Icons.label),
                    ),
                    validator: (value) {
                      if (value == null || value.isEmpty) {
                        return 'Vui lòng nhập tên lịch trình';
                      }
                      return null;
                    },
                  ),

                  const SizedBox(height: 24),
                  const Text(
                    'THỜI GIAN',
                    style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
                  ),
                  const SizedBox(height: 12),

                  // Time picker
                  ListTile(
                    title: const Text('Giờ thực hiện'),
                    subtitle: Text(
                      '${_selectedTime.hour.toString().padLeft(2, '0')}:${_selectedTime.minute.toString().padLeft(2, '0')}',
                      style: const TextStyle(fontSize: 24, fontWeight: FontWeight.bold),
                    ),
                    trailing: const Icon(Icons.access_time),
                    onTap: _selectTime,
                    tileColor: Colors.blue.shade50,
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(8),
                    ),
                  ),

                  const SizedBox(height: 12),

                  // Daily or specific days
                  SwitchListTile(
                    title: const Text('Hàng ngày'),
                    subtitle: Text(_isDaily ? 'Chạy mỗi ngày' : 'Chọn ngày cụ thể'),
                    value: _isDaily,
                    onChanged: (value) {
                      setState(() {
                        _isDaily = value;
                        if (value) {
                          _selectedDays = {1, 2, 3, 4, 5, 6, 7};
                        }
                      });
                    },
                    activeColor: Colors.green,
                  ),

                  if (!_isDaily) ...[
                    const SizedBox(height: 12),
                    const Text('Chọn ngày trong tuần:'),
                    const SizedBox(height: 8),
                    Wrap(
                      spacing: 8,
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

                  const SizedBox(height: 24),
                  const Text(
                    'HÀNH ĐỘNG',
                    style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
                  ),
                  const SizedBox(height: 12),

                  // Device dropdown
                  DropdownButtonFormField<String>(
                    value: _deviceId,
                    decoration: const InputDecoration(
                      labelText: 'Thiết bị',
                      border: OutlineInputBorder(),
                      prefixIcon: Icon(Icons.devices),
                    ),
                    items: _devices.map((device) {
                      return DropdownMenuItem<String>(
                        value: device['device_id'],
                        child: Text(device['name'] ?? device['device_id']),
                      );
                    }).toList(),
                    onChanged: (value) {
                      setState(() {
                        _deviceId = value;
                        _actionRelay = null; // Reset relay selection
                        if (value != null) {
                          _loadRelays(value);
                        }
                      });
                    },
                    validator: (value) {
                      if (value == null) {
                        return 'Vui lòng chọn thiết bị';
                      }
                      return null;
                    },
                  ),

                  const SizedBox(height: 12),

                  // Relay and state
                  Row(
                    children: [
                      Expanded(
                        child: _isLoadingRelays
                            ? const Center(child: CircularProgressIndicator())
                            : DropdownButtonFormField<int>(
                                value: _actionRelay,
                                decoration: const InputDecoration(
                                  labelText: 'Relay',
                                  border: OutlineInputBorder(),
                                ),
                                items: _relays.map((relay) {
                                  return DropdownMenuItem<int>(
                                    value: relay['relay'],
                                    child: Text(relay['name']),
                                  );
                                }).toList(),
                                onChanged: (value) {
                                  setState(() => _actionRelay = value);
                                },
                                validator: (value) {
                                  if (value == null) {
                                    return 'Chọn relay';
                                  }
                                  return null;
                                },
                              ),
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: DropdownButtonFormField<String>(
                          value: _actionState,
                          decoration: const InputDecoration(
                            labelText: 'Trạng thái',
                            border: OutlineInputBorder(),
                          ),
                          items: const [
                            DropdownMenuItem(value: 'ON', child: Text('BẬT (ON)')),
                            DropdownMenuItem(value: 'OFF', child: Text('TẮT (OFF)')),
                          ],
                          onChanged: (value) {
                            setState(() => _actionState = value!);
                          },
                        ),
                      ),
                    ],
                  ),

                  const SizedBox(height: 24),

                  // Enable/Disable
                  SwitchListTile(
                    title: const Text('Kích hoạt lịch trình'),
                    subtitle:
                        Text(_isEnabled ? 'Lịch trình đang bật' : 'Lịch trình đang tắt'),
                    value: _isEnabled,
                    onChanged: (value) {
                      setState(() => _isEnabled = value);
                    },
                    activeColor: Colors.green,
                  ),

                  const SizedBox(height: 24),

                  // Preview
                  Container(
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color: Colors.grey.shade100,
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Text(
                          'Xem trước:',
                          style: TextStyle(fontWeight: FontWeight.bold),
                        ),
                        const SizedBox(height: 4),
                        Text(_buildPreviewText()),
                        const SizedBox(height: 4),
                        Text(
                          'Cron: ${_buildCronExpression()}',
                          style: TextStyle(fontSize: 11, color: Colors.grey.shade600),
                        ),
                      ],
                    ),
                  ),

                  const SizedBox(height: 24),

                  // Save button
                  ElevatedButton(
                    onPressed: _isSaving ? null : _saveRule,
                    style: ElevatedButton.styleFrom(
                      padding: const EdgeInsets.all(16),
                    ),
                    child: _isSaving
                        ? const CircularProgressIndicator()
                        : Text(widget.rule != null ? 'Cập nhật' : 'Tạo Lịch Trình'),
                  ),
                ],
              ),
            ),
    );
  }

  Widget _buildDayChip(String label, int day) {
    final isSelected = _selectedDays.contains(day);
    return FilterChip(
      label: Text(label),
      selected: isSelected,
      onSelected: (selected) {
        setState(() {
          if (selected) {
            _selectedDays.add(day);
          } else {
            _selectedDays.remove(day);
          }
        });
      },
      selectedColor: Colors.blue,
      labelStyle: TextStyle(
        color: isSelected ? Colors.white : Colors.black,
      ),
    );
  }

  String _buildPreviewText() {
    final time =
        '${_selectedTime.hour.toString().padLeft(2, '0')}:${_selectedTime.minute.toString().padLeft(2, '0')}';

    // Get relay name
    String relayName = 'relay $_actionRelay';
    if (_actionRelay != null) {
      final relay = _relays.firstWhere(
        (r) => r['relay'] == _actionRelay,
        orElse: () => {'name': 'Relay $_actionRelay'},
      );
      relayName = relay['name'];
    }

    if (_isDaily) {
      return 'Hàng ngày lúc $time: $_actionState $relayName';
    } else {
      final dayNames = ['', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];
      final days = _selectedDays.map((d) => dayNames[d]).join(', ');
      return 'Mỗi $days lúc $time: $_actionState $relayName';
    }
  }
}
