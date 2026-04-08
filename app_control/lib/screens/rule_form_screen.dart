import 'package:flutter/material.dart';
import '../services/api_service.dart';
import '../models/rule.dart';

/// Một hàng hành động bật/tắt relay (rule có thể có nhiều relay).
class _RelayActionDraft {
  int relay;
  String state;
  int delaySeconds;

  _RelayActionDraft({
    required this.relay,
    required this.state,
    this.delaySeconds = 0,
  });
}

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
  late TextEditingController _conditionValueController;

  List<Map<String, dynamic>> _devices = [];
  List<Map<String, dynamic>> _actionRelays = [];
  bool _isLoadingDevices = true;
  bool _isLoadingActionRelays = false;

  String? _conditionDeviceId;
  String? _actionDeviceId;

  /// Nhãn gợi ý khi API không có mo_ta (giống tên hiển thị quen thuộc).
  static const Map<String, String> _knownFieldLabels = {
    'so_nguoi_trong_phong': 'So nguoi trong phong',
    'temperature': 'Nhiet do',
    'humidity': 'Do am',
    'voltage': 'Dien ap',
    'current': 'Dong dien',
    'power': 'Cong suat',
  };

  /// Field điều kiện: key + nhu mo ta tren web (tu /latest + latest_fields).
  List<MapEntry<String, String>> _dynamicFields = [];

  String _conditionField = 'so_nguoi_trong_phong';
  String _conditionOperator = '>';
  int _priority = 1;
  bool _isEnabled = true;
  bool _isSaving = false;

  List<_RelayActionDraft> _actionRows = [];

  String _humanizeKey(String k) {
    if (k.isEmpty) return k;
    return k.replaceAll('_', ' ');
  }

  List<DropdownMenuItem<String>> _buildConditionFieldItems() {
    if (_dynamicFields.isEmpty) {
      return [
        ..._knownFieldLabels.entries.map(
          (e) => DropdownMenuItem(value: e.key, child: Text(e.value)),
        ),
        if (!_knownFieldLabels.containsKey(_conditionField))
          DropdownMenuItem(
            value: _conditionField,
            child: Text(_conditionField, overflow: TextOverflow.ellipsis),
          ),
      ];
    }

    final seen = <String>{};
    final items = <DropdownMenuItem<String>>[];

    void addEntry(String key, String label) {
      if (seen.contains(key)) return;
      seen.add(key);
      items.add(DropdownMenuItem(
        value: key,
        child: Text(label, overflow: TextOverflow.ellipsis),
      ));
    }

    for (final e in _dynamicFields) {
      addEntry(e.key, e.value);
    }
    if (!seen.contains(_conditionField)) {
      addEntry(
        _conditionField,
        _knownFieldLabels[_conditionField] ?? _humanizeKey(_conditionField),
      );
    }
    return items;
  }

  @override
  void initState() {
    super.initState();

    _nameController = TextEditingController();
    _conditionValueController = TextEditingController(text: '30');

    if (widget.rule != null) {
      final r = widget.rule!;
      _nameController.text = r.tenRule;
      _conditionDeviceId = r.conditionDeviceId;

      final relayActions =
          r.actions.where((a) => a.actionCommand == 'relay').toList();
      if (relayActions.isNotEmpty) {
        _actionDeviceId = relayActions.first.deviceId;
        _actionRows = relayActions.map((a) {
          final p = a.actionParams ?? {};
          final relay = (p['relay'] as num?)?.toInt() ?? 1;
          final st = (p['state']?.toString() ?? 'ON').toUpperCase();
          return _RelayActionDraft(
            relay: relay,
            state: st == 'OFF' ? 'OFF' : 'ON',
            delaySeconds: a.delaySeconds,
          );
        }).toList();
      } else {
        _actionRows = [_RelayActionDraft(relay: 1, state: 'ON')];
        if (r.actions.isNotEmpty) {
          _actionDeviceId = r.actions.first.deviceId;
        }
      }

      if (r.conditions.isNotEmpty) {
        final cond = r.conditions[0];
        _conditionField = cond.field;
        _conditionOperator = cond.operator;
        _conditionValueController.text = cond.value.toString();
      }
      _priority = r.mucDoUuTien;
      _isEnabled = r.trangThai == 'enabled';
    } else {
      _actionRows = [_RelayActionDraft(relay: 1, state: 'ON')];
      _conditionField = 'so_nguoi_trong_phong';
      _conditionValueController.text = '1';
    }

    _loadDevices();
  }

  @override
  void dispose() {
    _nameController.dispose();
    _conditionValueController.dispose();
    super.dispose();
  }

  List<Map<String, dynamic>> _mergeDevicesWithRuleIds(
      List<Map<String, dynamic>> devices) {
    var merged = List<Map<String, dynamic>>.from(devices);
    for (final id in [_conditionDeviceId, _actionDeviceId]) {
      if (id != null &&
          id.isNotEmpty &&
          !merged.any((d) => d['device_id'] == id)) {
        merged.insert(0, {
          'device_id': id,
          'name': id,
          'latest_fields': <dynamic>[],
          'controls': <dynamic>[],
        });
      }
    }
    return merged;
  }

  Future<void> _loadDevices() async {
    setState(() => _isLoadingDevices = true);

    try {
      final devices = await _apiService.getDevicesForDropdown(
        phongId: widget.roomId,
      );

      setState(() {
        _devices = _mergeDevicesWithRuleIds(devices);
        _isLoadingDevices = false;
      });

      if (_conditionDeviceId != null) {
        _loadConditionFields(_conditionDeviceId!);
      }
      if (_actionDeviceId != null) {
        await _loadActionRelays(_actionDeviceId!);
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

  /// Giong web: latest_fields (tu /rooms/.../devices) + keys tu /devices/.../latest + data-keys.
  Future<void> _loadConditionFields(String deviceId) async {
    if (deviceId.isEmpty) return;

    Map<String, dynamic>? devRow;
    for (final d in _devices) {
      if (d['device_id']?.toString() == deviceId) {
        devRow = d;
        break;
      }
    }
    final latestFields = List<dynamic>.from(devRow?['latest_fields'] ?? []);

    final keys = <String>{};
    keys.add('so_nguoi_trong_phong');
    if (_conditionField.isNotEmpty) {
      keys.add(_conditionField);
    }
    for (final f in latestFields) {
      final s = f.toString();
      if (s.isNotEmpty) keys.add(s);
    }

    Map<String, dynamic> dataMap = {};
    try {
      final latest = await _apiService.getDeviceLatest(deviceId);
      dataMap = Map<String, dynamic>.from(
        latest['data'] as Map<String, dynamic>? ?? {},
      );
      for (final k in dataMap.keys) {
        keys.add(k.toString());
      }
    } catch (_) {
      /* van dung latest_fields */
    }

    final labelFromDataKeys = <String, String>{};
    try {
      final dk = await _apiService.getDeviceDataKeys(deviceId);
      final rows = dk['data_keys'] as List<dynamic>? ?? [];
      for (final row in rows.whereType<Map>()) {
        final khoa = row['khoa']?.toString();
        if (khoa == null || khoa.isEmpty) continue;
        keys.add(khoa);
        final moTa = row['mo_ta']?.toString();
        if (moTa != null && moTa.trim().isNotEmpty) {
          labelFromDataKeys[khoa] = moTa.trim();
        }
      }
    } catch (_) {}

    String labelFor(String k) {
      final meta = dataMap[k];
      if (meta is Map) {
        final m = meta['mo_ta']?.toString().trim();
        if (m != null && m.isNotEmpty) return m;
      }
      if (labelFromDataKeys.containsKey(k)) {
        return labelFromDataKeys[k]!;
      }
      if (_knownFieldLabels.containsKey(k)) return _knownFieldLabels[k]!;
      return _humanizeKey(k);
    }

    final ordered = keys.toList()
      ..sort((a, b) {
        if (a == 'so_nguoi_trong_phong') return -1;
        if (b == 'so_nguoi_trong_phong') return 1;
        return a.compareTo(b);
      });

    if (!mounted) return;
    setState(() {
      _dynamicFields =
          ordered.map((k) => MapEntry(k, labelFor(k))).toList();
      if (!keys.contains(_conditionField)) {
        _conditionField = ordered.isNotEmpty ? ordered.first : 'so_nguoi_trong_phong';
      }
    });
  }

  Future<void> _loadActionRelays(String deviceId) async {
    setState(() => _isLoadingActionRelays = true);
    try {
      final relays =
          await _apiService.getDeviceControlLinesRelays(deviceId);
      if (!mounted) return;
      setState(() {
        _actionRelays = relays;
        _isLoadingActionRelays = false;
        _syncRowsToAvailableRelays();
      });
    } catch (e) {
      if (mounted) {
        setState(() {
          _actionRelays = [];
          _isLoadingActionRelays = false;
        });
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Khong tai relay: $e'),
            backgroundColor: const Color(0xFFBA1A1A),
            duration: const Duration(seconds: 4),
          ),
        );
      }
    }
  }

  void _syncRowsToAvailableRelays() {
    if (_actionRelays.isEmpty) return;
    final nums = _actionRelays.map((r) => r['relay'] as int).toList();
    for (var i = 0; i < _actionRows.length; i++) {
      if (!nums.contains(_actionRows[i].relay)) {
        _actionRows[i].relay = nums.first;
      }
    }
  }

  void _addRelayRow() {
    if (_actionRelays.isEmpty) return;
    final used = _actionRows.map((r) => r.relay).toSet();
    int pick = _actionRelays.first['relay'] as int;
    for (final r in _actionRelays) {
      final n = r['relay'] as int;
      if (!used.contains(n)) {
        pick = n;
        break;
      }
    }
    setState(() {
      _actionRows.add(_RelayActionDraft(relay: pick, state: 'ON'));
    });
  }

  void _removeRelayRow(int index) {
    if (_actionRows.length <= 1) return;
    setState(() => _actionRows.removeAt(index));
  }

  Future<void> _saveRule() async {
    if (!_formKey.currentState!.validate()) {
      return;
    }

    final condVal =
        double.tryParse(_conditionValueController.text.trim()) ?? 0.0;

    if (_conditionDeviceId == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Vui long chon thiet bi cam bien'),
          backgroundColor: Color(0xFFBA1A1A),
        ),
      );
      return;
    }

    if (_actionDeviceId == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Vui long chon thiet bi dieu khien'),
          backgroundColor: Color(0xFFBA1A1A),
        ),
      );
      return;
    }

    if (_actionRelays.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Thiet bi khong co relay trong control_lines'),
          backgroundColor: Color(0xFFBA1A1A),
        ),
      );
      return;
    }

    if (_actionRows.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Can it nhat mot hanh dong relay'),
          backgroundColor: Color(0xFFBA1A1A),
        ),
      );
      return;
    }

    setState(() => _isSaving = true);

    try {
      final actions = <Map<String, dynamic>>[];
      for (var i = 0; i < _actionRows.length; i++) {
        final row = _actionRows[i];
        actions.add({
          'device_id': _actionDeviceId,
          'action_command': 'relay',
          'action_params': {
            'relay': row.relay,
            'state': row.state,
          },
          'delay_seconds': row.delaySeconds,
          'thu_tu': i + 1,
        });
      }

      final ruleData = {
        'ten_rule': _nameController.text,
        'phong_id': widget.roomId,
        'condition_device_id': _conditionDeviceId,
        'conditions': [
          {
            'field': _conditionField,
            'operator': _conditionOperator,
            'value': condVal,
          }
        ],
        'actions': actions,
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
            content: Text(
                widget.rule != null ? 'Da cap nhat rule' : 'Da tao rule'),
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
    final bottomInset = MediaQuery.of(context).padding.bottom;

    return Scaffold(
      body: Container(
        decoration: const BoxDecoration(
          color: Color(0xFFF7FAFC),
        ),
        child: Column(
          children: [
            Container(
              padding: EdgeInsets.only(
                top: MediaQuery.paddingOf(context).top + 8,
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
                      widget.rule != null ? 'Sua Rule' : 'Tao Rule Moi',
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
                        padding: EdgeInsets.fromLTRB(
                          20,
                          20,
                          20,
                          24 + bottomInset,
                        ),
                        children: [
                          _buildSectionLabel('TEN RULE'),
                          const SizedBox(height: 10),
                          TextFormField(
                            controller: _nameController,
                            decoration: _inputDecoration(
                              hintText: 'VD: Tuoi cay buoi sang',
                              prefixIcon: Icons.label_outline,
                            ),
                            validator: (value) {
                              if (value == null || value.isEmpty) {
                                return 'Vui long nhap ten rule';
                              }
                              return null;
                            },
                          ),
                          const SizedBox(height: 28),
                          _buildSectionLabel('DIEU KIEN'),
                          const SizedBox(height: 10),
                          DropdownButtonFormField<String>(
                            value: _conditionDeviceId,
                            isExpanded: true,
                            decoration: _inputDecoration(
                              hintText: 'Chon thiet bi cam bien',
                              prefixIcon: Icons.sensors,
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
                                _conditionDeviceId = value;
                                _dynamicFields = [];
                                if (value != null) {
                                  _loadConditionFields(value);
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
                          DropdownButtonFormField<String>(
                            value: _conditionField,
                            isExpanded: true,
                            decoration: _inputDecoration(
                              hintText: 'Truong du lieu',
                              prefixIcon: Icons.analytics,
                            ),
                            items: _buildConditionFieldItems(),
                            onChanged: (value) {
                              setState(() => _conditionField = value!);
                            },
                          ),
                          const SizedBox(height: 14),
                          DropdownButtonFormField<String>(
                            value: _conditionOperator,
                            isExpanded: true,
                            decoration: _compactDecoration(
                              hintText: 'Toan tu',
                            ),
                            items: const [
                              DropdownMenuItem(value: '>', child: Text('> lon hon')),
                              DropdownMenuItem(value: '<', child: Text('< nho hon')),
                              DropdownMenuItem(
                                  value: '>=', child: Text('>= lon hon bang')),
                              DropdownMenuItem(
                                  value: '<=', child: Text('<= nho hon bang')),
                              DropdownMenuItem(value: '==', child: Text('= bang')),
                              DropdownMenuItem(value: '!=', child: Text('!= khac')),
                            ],
                            onChanged: (value) {
                              setState(() => _conditionOperator = value!);
                            },
                          ),
                          const SizedBox(height: 12),
                          TextFormField(
                            controller: _conditionValueController,
                            decoration: _inputDecoration(
                              hintText: 'Gia tri (vd so nguoi, nhiet do)',
                              prefixIcon: Icons.numbers,
                            ),
                            keyboardType: const TextInputType.numberWithOptions(
                                decimal: true),
                            validator: (value) {
                              if (value == null || value.trim().isEmpty) {
                                return 'Nhap gia tri';
                              }
                              if (double.tryParse(value.trim()) == null) {
                                return 'So khong hop le';
                              }
                              return null;
                            },
                          ),
                          const SizedBox(height: 28),
                          _buildSectionLabel('HANH DONG'),
                          const SizedBox(height: 10),
                          DropdownButtonFormField<String>(
                            value: _actionDeviceId,
                            isExpanded: true,
                            decoration: _inputDecoration(
                              hintText: 'Chon thiet bi dieu khien',
                              prefixIcon: Icons.settings_remote,
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
                            onChanged: (value) async {
                              setState(() {
                                _actionDeviceId = value;
                              });
                              if (value != null) {
                                await _loadActionRelays(value);
                              }
                            },
                            validator: (value) {
                              if (value == null) {
                                return 'Vui long chon thiet bi';
                              }
                              return null;
                            },
                          ),
                          const SizedBox(height: 14),
                          if (_isLoadingActionRelays)
                            const Center(
                              child: Padding(
                                padding: EdgeInsets.all(16),
                                child: CircularProgressIndicator(
                                  color: Color(0xFF006a6a),
                                ),
                              ),
                            )
                          else if (_actionRelays.isEmpty)
                            Container(
                              width: double.infinity,
                              padding: const EdgeInsets.all(16),
                              decoration: BoxDecoration(
                                color: const Color(0xFFF1F4F6),
                                borderRadius: BorderRadius.circular(16),
                                border: Border.all(
                                  color: const Color(0xFFC0C7CD)
                                      .withOpacity(0.15),
                                ),
                              ),
                              child: const Text(
                                'Chua co relay trong control_lines cho thiet bi nay. '
                                'Kiem tra cau hinh thiet bi tren dashboard.',
                                style: TextStyle(
                                  color: Color(0xFF71787D),
                                  fontFamily: 'Inter',
                                  fontSize: 13,
                                ),
                              ),
                            )
                          else ...[
                            ...List.generate(_actionRows.length, (index) {
                              return Padding(
                                padding: const EdgeInsets.only(bottom: 10),
                                child: Container(
                                  padding: const EdgeInsets.all(12),
                                  decoration: BoxDecoration(
                                    color: Colors.white,
                                    borderRadius: BorderRadius.circular(16),
                                    border: Border.all(
                                      color: const Color(0xFFC0C7CD)
                                          .withOpacity(0.2),
                                    ),
                                  ),
                                  child: Column(
                                    crossAxisAlignment:
                                        CrossAxisAlignment.stretch,
                                    children: [
                                      Row(
                                        children: [
                                          Text(
                                            'Relay ${index + 1}',
                                            style: const TextStyle(
                                              fontFamily: 'Manrope',
                                              fontWeight: FontWeight.w600,
                                              color: Color(0xFF003345),
                                            ),
                                          ),
                                          const Spacer(),
                                          if (_actionRows.length > 1)
                                            IconButton(
                                              icon: const Icon(
                                                Icons.remove_circle_outline,
                                                color: Color(0xFFBA1A1A),
                                                size: 22,
                                              ),
                                              onPressed: () =>
                                                  _removeRelayRow(index),
                                            ),
                                        ],
                                      ),
                                      const SizedBox(height: 8),
                                      DropdownButtonFormField<int>(
                                        value: _actionRows[index].relay,
                                        isExpanded: true,
                                        decoration: _compactDecoration(
                                          hintText: 'So relay',
                                        ),
                                        items: _actionRelays.map((relay) {
                                          return DropdownMenuItem<int>(
                                            value: relay['relay'] as int,
                                            child: Text(
                                              relay['name'] as String,
                                              overflow: TextOverflow.ellipsis,
                                            ),
                                          );
                                        }).toList(),
                                        onChanged: (value) {
                                          if (value == null) return;
                                          setState(() {
                                            _actionRows[index].relay = value;
                                          });
                                        },
                                      ),
                                      const SizedBox(height: 8),
                                      DropdownButtonFormField<String>(
                                        value: _actionRows[index].state,
                                        isExpanded: true,
                                        decoration: _compactDecoration(
                                          hintText: 'Trang thai',
                                        ),
                                        items: const [
                                          DropdownMenuItem(
                                              value: 'ON', child: Text('BAT')),
                                          DropdownMenuItem(
                                              value: 'OFF', child: Text('TAT')),
                                        ],
                                        onChanged: (value) {
                                          if (value == null) return;
                                          setState(() {
                                            _actionRows[index].state = value;
                                          });
                                        },
                                      ),
                                    ],
                                  ),
                                ),
                              );
                            }),
                            Align(
                              alignment: Alignment.centerLeft,
                              child: TextButton.icon(
                                onPressed:
                                    _actionRelays.isNotEmpty ? _addRelayRow : null,
                                icon: const Icon(Icons.add,
                                    color: Color(0xFF006a6a)),
                                label: const Text(
                                  'Them relay',
                                  style: TextStyle(color: Color(0xFF006a6a)),
                                ),
                              ),
                            ),
                          ],
                          const SizedBox(height: 18),
                          _buildSectionLabel('CAI DAT'),
                          const SizedBox(height: 10),
                          DropdownButtonFormField<int>(
                            value: _priority,
                            isExpanded: true,
                            decoration: _inputDecoration(
                              hintText: 'Muc do uu tien',
                              prefixIcon: Icons.priority_high,
                            ),
                            items: List.generate(10, (i) => i + 1)
                                .map((i) => DropdownMenuItem(
                                    value: i, child: Text('Muc $i')))
                                .toList(),
                            onChanged: (value) {
                              setState(() => _priority = value!);
                            },
                          ),
                          const SizedBox(height: 14),
                          Container(
                            padding: const EdgeInsets.all(16),
                            decoration: BoxDecoration(
                              color: Colors.white,
                              borderRadius: BorderRadius.circular(16),
                              border: Border.all(
                                color: const Color(0xFFC0C7CD)
                                    .withOpacity(0.15),
                                width: 1,
                              ),
                            ),
                            child: Row(
                              children: [
                                Icon(
                                  _isEnabled
                                      ? Icons.check_circle
                                      : Icons.pause_circle,
                                  color: const Color(0xFF006a6a),
                                ),
                                const SizedBox(width: 12),
                                Expanded(
                                  child: Column(
                                    crossAxisAlignment:
                                        CrossAxisAlignment.start,
                                    children: [
                                      Text(
                                        _isEnabled
                                            ? 'Kich hoat rule'
                                            : 'Rule dang tat',
                                        style: const TextStyle(
                                          fontFamily: 'Manrope',
                                          fontWeight: FontWeight.w600,
                                          color: Color(0xFF003345),
                                        ),
                                      ),
                                      Text(
                                        _isEnabled
                                            ? 'Rule se chay khi dkien thoa man'
                                            : 'Rule khong chay',
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
                                  value: _isEnabled,
                                  onChanged: (value) {
                                    setState(() => _isEnabled = value);
                                  },
                                  activeColor: const Color(0xFF006a6a),
                                ),
                              ],
                            ),
                          ),
                          const SizedBox(height: 28),
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
                                          valueColor:
                                              AlwaysStoppedAnimation<Color>(
                                                  Colors.white),
                                        ),
                                      )
                                    : Text(
                                        widget.rule != null
                                            ? 'CAP NHAT'
                                            : 'TAO RULE',
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

  /// Dropdown gon (khong prefix icon) de tranh tran ngang.
  InputDecoration _compactDecoration({String? hintText}) {
    return InputDecoration(
      hintText: hintText,
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
      contentPadding:
          const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
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
      contentPadding:
          const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
    );
  }
}
