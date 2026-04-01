// app_control/lib/screens/rule_form_screen.dart

import 'package:flutter/material.dart';
import '../services/api_service.dart';
import '../models/rule.dart';

class RuleFormScreen extends StatefulWidget {
  final int? roomId;
  final Rule? rule;

  const RuleFormScreen({Key? key, this.roomId, this.rule}) : super(key: key);

  @override
  State<RuleFormScreen> createState() => _RuleFormScreenState();
}

class _RuleFormScreenState extends State<RuleFormScreen> {
  final ApiService _apiService = ApiService();
  final _formKey = GlobalKey<FormState>();

  late TextEditingController _nameController;

  // Devices and relays data
  List<Map<String, dynamic>> _devices = [];
  List<Map<String, dynamic>> _conditionRelays = [];
  List<Map<String, dynamic>> _actionRelays = [];
  bool _isLoadingDevices = true;
  bool _isLoadingConditionRelays = false;
  bool _isLoadingActionRelays = false;

  String? _conditionDeviceId;
  String? _actionDeviceId;
  
  String _conditionField = 'temperature';
  String _conditionOperator = '>';
  double _conditionValue = 30.0;

  int? _actionRelay;
  String _actionState = 'ON';
  int _priority = 1;
  bool _isEnabled = true;
  bool _isSaving = false;

  @override
  void initState() {
    super.initState();
    
    _nameController = TextEditingController();
    
    if (widget.rule != null) {
      // Edit mode
      _nameController.text = widget.rule!.tenRule;
      _conditionDeviceId = widget.rule!.conditionDeviceId;
      
      if (widget.rule!.actions.isNotEmpty) {
        _actionDeviceId = widget.rule!.actions[0].deviceId;
        if (widget.rule!.actions[0].actionParams != null) {
          _actionRelay = widget.rule!.actions[0].actionParams!['relay'];
          _actionState = widget.rule!.actions[0].actionParams!['state'] ?? 'ON';
        }
      }
      
      if (widget.rule!.conditions.isNotEmpty) {
        final cond = widget.rule!.conditions[0];
        _conditionField = cond.field;
        _conditionOperator = cond.operator;
        _conditionValue = double.tryParse(cond.value.toString()) ?? 30.0;
      }
      
      _priority = widget.rule!.mucDoUuTien;
      _isEnabled = widget.rule!.trangThai == 'enabled';
    }
    
    _loadDevices();
  }

  @override
  void dispose() {
    _nameController.dispose();
    super.dispose();
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
      
      // Load relays for pre-selected devices
      if (_conditionDeviceId != null) {
        _loadConditionRelays(_conditionDeviceId!);
      }
      if (_actionDeviceId != null) {
        _loadActionRelays(_actionDeviceId!);
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

  Future<void> _loadConditionRelays(String deviceId) async {
    setState(() => _isLoadingConditionRelays = true);
    
    try {
      final relays = await _apiService.getDeviceRelays(deviceId);
      setState(() {
        _conditionRelays = relays;
        _isLoadingConditionRelays = false;
      });
    } catch (e) {
      setState(() => _isLoadingConditionRelays = false);
    }
  }

  Future<void> _loadActionRelays(String deviceId) async {
    setState(() => _isLoadingActionRelays = true);
    
    try {
      final relays = await _apiService.getDeviceRelays(deviceId);
      setState(() {
        _actionRelays = relays;
        _isLoadingActionRelays = false;
        // Reset relay selection if current selection not in list
        if (_actionRelay != null && 
            !relays.any((r) => r['relay'] == _actionRelay)) {
          _actionRelay = null;
        }
      });
    } catch (e) {
      setState(() => _isLoadingActionRelays = false);
    }
  }

  Future<void> _saveRule() async {
    if (!_formKey.currentState!.validate()) {
      return;
    }

    if (_conditionDeviceId == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Vui lòng chọn thiết bị cảm biến'),
          backgroundColor: Colors.red,
        ),
      );
      return;
    }

    if (_actionDeviceId == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Vui lòng chọn thiết bị điều khiển'),
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

    setState(() => _isSaving = true);

    try {
      final ruleData = {
        'ten_rule': _nameController.text,
        'phong_id': widget.roomId,
        'condition_device_id': _conditionDeviceId,
        'conditions': [
          {
            'field': _conditionField,
            'operator': _conditionOperator,
            'value': _conditionValue,
          }
        ],
        'actions': [
          {
            'device_id': _actionDeviceId,
            'action_command': 'relay',
            'action_params': {
              'relay': _actionRelay,
              'state': _actionState,
            },
            'delay_seconds': 0,
            'thu_tu': 1,
          }
        ],
        'muc_do_uu_tien': _priority,
        'trang_thai': _isEnabled ? 'enabled' : 'disabled',
      };

      if (widget.rule != null) {
        await _apiService.updateRule(widget.rule!.id, ruleData);
      } else {
        await _apiService.createRule(ruleData);
      }

      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(widget.rule != null ? 'Đã cập nhật rule' : 'Đã tạo rule'),
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
        title: Text(widget.rule != null ? 'Sửa Rule' : 'Tạo Rule Mới'),
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
                      labelText: 'Tên rule',
                      border: OutlineInputBorder(),
                      prefixIcon: Icon(Icons.label),
                    ),
                    validator: (value) {
                      if (value == null || value.isEmpty) {
                        return 'Vui lòng nhập tên rule';
                      }
                      return null;
                    },
                  ),
                  
                  const SizedBox(height: 24),
                  const Text(
                    'ĐIỀU KIỆN',
                    style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
                  ),
                  const SizedBox(height: 12),
                  
                  // Condition device dropdown
                  DropdownButtonFormField<String>(
                    value: _conditionDeviceId,
                    decoration: const InputDecoration(
                      labelText: 'Thiết bị cảm biến',
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
                        _conditionDeviceId = value;
                        if (value != null) {
                          _loadConditionRelays(value);
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
                  
                  // Condition field
                  DropdownButtonFormField<String>(
                    value: _conditionField,
                    decoration: const InputDecoration(
                      labelText: 'Trường dữ liệu',
                      border: OutlineInputBorder(),
                      prefixIcon: Icon(Icons.sensors),
                    ),
                    items: const [
                      DropdownMenuItem(value: 'temperature', child: Text('Nhiệt độ (temperature)')),
                      DropdownMenuItem(value: 'humidity', child: Text('Độ ẩm (humidity)')),
                      DropdownMenuItem(value: 'voltage', child: Text('Điện áp (voltage)')),
                      DropdownMenuItem(value: 'current', child: Text('Dòng điện (current)')),
                      DropdownMenuItem(value: 'power', child: Text('Công suất (power)')),
                    ],
                    onChanged: (value) {
                      setState(() => _conditionField = value!);
                    },
                  ),
                  
                  const SizedBox(height: 12),
                  
                  // Operator and value
                  Row(
                    children: [
                      Expanded(
                        flex: 2,
                        child: DropdownButtonFormField<String>(
                          value: _conditionOperator,
                          decoration: const InputDecoration(
                            labelText: 'Toán tử',
                            border: OutlineInputBorder(),
                          ),
                          items: const [
                            DropdownMenuItem(value: '>', child: Text('> (lớn hơn)')),
                            DropdownMenuItem(value: '<', child: Text('< (nhỏ hơn)')),
                            DropdownMenuItem(value: '>=', child: Text('≥ (lớn hơn bằng)')),
                            DropdownMenuItem(value: '<=', child: Text('≤ (nhỏ hơn bằng)')),
                            DropdownMenuItem(value: '==', child: Text('= (bằng)')),
                            DropdownMenuItem(value: '!=', child: Text('≠ (khác)')),
                          ],
                          onChanged: (value) {
                            setState(() => _conditionOperator = value!);
                          },
                        ),
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        flex: 3,
                        child: TextFormField(
                          initialValue: _conditionValue.toString(),
                          decoration: const InputDecoration(
                            labelText: 'Giá trị',
                            border: OutlineInputBorder(),
                          ),
                          keyboardType: TextInputType.number,
                          onChanged: (value) {
                            _conditionValue = double.tryParse(value) ?? _conditionValue;
                          },
                          validator: (value) {
                            if (value == null || value.isEmpty) {
                              return 'Nhập giá trị';
                            }
                            if (double.tryParse(value) == null) {
                              return 'Số không hợp lệ';
                            }
                            return null;
                          },
                        ),
                      ),
                    ],
                  ),
                  
                  const SizedBox(height: 24),
                  const Text(
                    'HÀNH ĐỘNG',
                    style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
                  ),
                  const SizedBox(height: 12),
                  
                  // Action device dropdown
                  DropdownButtonFormField<String>(
                    value: _actionDeviceId,
                    decoration: const InputDecoration(
                      labelText: 'Thiết bị điều khiển',
                      border: OutlineInputBorder(),
                      prefixIcon: Icon(Icons.devices_other),
                    ),
                    items: _devices.map((device) {
                      return DropdownMenuItem<String>(
                        value: device['device_id'],
                        child: Text(device['name'] ?? device['device_id']),
                      );
                    }).toList(),
                    onChanged: (value) {
                      setState(() {
                        _actionDeviceId = value;
                        _actionRelay = null; // Reset relay selection
                        if (value != null) {
                          _loadActionRelays(value);
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
                        child: _isLoadingActionRelays
                            ? const Center(child: CircularProgressIndicator())
                            : DropdownButtonFormField<int>(
                                value: _actionRelay,
                                decoration: const InputDecoration(
                                  labelText: 'Relay',
                                  border: OutlineInputBorder(),
                                ),
                                items: _actionRelays.map((relay) {
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
                  const Text(
                    'CÀI ĐẶT',
                    style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
                  ),
                  const SizedBox(height: 12),
                  
                  // Priority
                  DropdownButtonFormField<int>(
                    value: _priority,
                    decoration: const InputDecoration(
                      labelText: 'Mức độ ưu tiên',
                      border: OutlineInputBorder(),
                      prefixIcon: Icon(Icons.priority_high),
                      helperText: 'Số nhỏ = ưu tiên cao hơn',
                    ),
                    items: List.generate(10, (i) => i + 1)
                        .map((i) => DropdownMenuItem(value: i, child: Text('Mức $i')))
                        .toList(),
                    onChanged: (value) {
                      setState(() => _priority = value!);
                    },
                  ),
                  
                  const SizedBox(height: 12),
                  
                  // Enable/Disable
                  SwitchListTile(
                    title: const Text('Kích hoạt rule'),
                    subtitle: Text(_isEnabled ? 'Rule đang bật' : 'Rule đang tắt'),
                    value: _isEnabled,
                    onChanged: (value) {
                      setState(() => _isEnabled = value);
                    },
                    activeColor: Colors.green,
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
                        : Text(widget.rule != null ? 'Cập nhật' : 'Tạo Rule'),
                  ),
                ],
              ),
            ),
    );
  }
}
