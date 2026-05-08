import 'dart:convert';
import 'package:flutter/material.dart';
import '../models/camera.dart';
import '../services/api_service.dart';

class CameraSetupSheet extends StatefulWidget {
  final int roomId;
  final List<RoomCamera> existingCameras;
  final VoidCallback onSaved;

  const CameraSetupSheet({
    super.key,
    required this.roomId,
    required this.existingCameras,
    required this.onSaved,
  });

  @override
  State<CameraSetupSheet> createState() => _CameraSetupSheetState();
}

class _CameraSetupSheetState extends State<CameraSetupSheet> {
  final _api = ApiService();
  final _formKey = GlobalKey<FormState>();

  List<RoomCamera> _cameras = [];
  bool _isLoading = false;
  bool _isSaving = false;
  String? _error;
  int? _expandedCameraId;

  // Form fields for new camera
  final _tenController = TextEditingController();
  final _ipController = TextEditingController();
  final _portController = TextEditingController(text: '554');
  final _rtspPathController = TextEditingController(text: '/Streaming/Channels/101');
  final _usernameController = TextEditingController();
  final _passwordController = TextEditingController();

  bool _enableZoneConfig = false;
  final List<_ZoneSlot> _zoneSlots = [];

  @override
  void initState() {
    super.initState();
    _cameras = List.from(widget.existingCameras);
  }

  @override
  void dispose() {
    _tenController.dispose();
    _ipController.dispose();
    _portController.dispose();
    _rtspPathController.dispose();
    _usernameController.dispose();
    _passwordController.dispose();
    super.dispose();
  }

  void _addZoneSlot() {
    setState(() {
      _zoneSlots.add(_ZoneSlot(
        nameController: TextEditingController(text: 'Zone ${_zoneSlots.length + 1}'),
        pointsController: TextEditingController(),
      ));
    });
  }

  void _removeZoneSlot(int index) {
    setState(() {
      _zoneSlots[index].dispose();
      _zoneSlots.removeAt(index);
    });
  }

  Future<void> _saveCamera() async {
    if (!_formKey.currentState!.validate()) return;
    if (_enableZoneConfig) {
      for (var slot in _zoneSlots) {
        final text = slot.pointsController.text.trim();
        if (text.isEmpty) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('Vui lòng nhập tọa độ cho tất cả zones')),
          );
          return;
        }
        if (!_isValidPolygonString(text)) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('Tọa độ zone không đúng định dạng. Ví dụ: [(124,311),(104,287),(57,287)]')),
          );
          return;
        }
      }
    }

    setState(() => _isSaving = true);

    try {
      final cameraData = {
        'ten': _tenController.text.trim(),
        'ip_address': _ipController.text.trim(),
        'port': int.tryParse(_portController.text.trim()) ?? 554,
        'rtsp_path': _rtspPathController.text.trim(),
        'username': _usernameController.text.trim().isEmpty
            ? null
            : _usernameController.text.trim(),
        'password': _passwordController.text.isEmpty ? null : _passwordController.text,
        'is_active': true,
      };

      final newCamera = await _api.createCamera(widget.roomId, cameraData);

      // Save zones if enabled
      if (_enableZoneConfig && _zoneSlots.isNotEmpty) {
        final zones = _zoneSlots.asMap().entries.map((entry) {
          final idx = entry.key;
          final slot = entry.value;
          final points = _parsePolygonString(slot.pointsController.text.trim());
          return ZoneDefinition(
            zoneName: slot.nameController.text.trim().isEmpty
                ? 'Zone ${idx + 1}'
                : slot.nameController.text.trim(),
            zoneIndex: idx + 1,
            polygonPoints: points,
            isEntryZone: slot.isEntryZone,
          );
        }).toList();

        await _api.saveCameraZones(widget.roomId, newCamera.id, zones);
        await _api.syncCameraZonesToAI(newCamera.id);
      }

      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Camera đã được tạo thành công'),
            backgroundColor: Color(0xFF006a6a),
          ),
        );
        _tenController.clear();
        _ipController.clear();
        _portController.text = '554';
        _rtspPathController.text = '/Streaming/Channels/101';
        _usernameController.clear();
        _passwordController.clear();
        setState(() {
          _zoneSlots.clear();
          _enableZoneConfig = false;
        });
        widget.onSaved();
        Navigator.pop(context);
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Lỗi: $e'), backgroundColor: Colors.red),
        );
      }
    } finally {
      if (mounted) setState(() => _isSaving = false);
    }
  }

  bool _isValidPolygonString(String text) {
    text = text.trim();
    if (!text.startsWith('[') || !text.endsWith(']')) return false;
    try {
      final parsed = jsonDecode(text);
      if (parsed is! List || parsed.isEmpty) return false;
      for (var item in parsed) {
        if (item is! List || item.length < 2) return false;
        if (item[0] is! num || item[1] is! num) return false;
      }
      return true;
    } catch (_) {
      return false;
    }
  }

  List<List<double>> _parsePolygonString(String text) {
    text = text.trim();
    try {
      final parsed = jsonDecode(text) as List;
      return parsed.map<List<double>>((item) {
        final list = item as List;
        return [double.parse(list[0].toString()), double.parse(list[1].toString())];
      }).toList();
    } catch (_) {
      return [];
    }
  }

  void _deleteCamera(RoomCamera camera) async {
    final confirm = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Xóa camera'),
        content: Text('Bạn có chắc muốn xóa camera "${camera.ten}"?'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Hủy')),
          TextButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Xóa', style: TextStyle(color: Colors.red)),
          ),
        ],
      ),
    );

    if (confirm != true) return;

    try {
      await _api.deleteCamera(widget.roomId, camera.id);
      setState(() {
        _cameras.removeWhere((c) => c.id == camera.id);
      });
      widget.onSaved();
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Camera đã được xóa'), backgroundColor: Color(0xFF006a6a)),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Lỗi xóa: $e'), backgroundColor: Colors.red),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return DraggableScrollableSheet(
      initialChildSize: 0.9,
      minChildSize: 0.5,
      maxChildSize: 0.95,
      expand: false,
      builder: (context, scrollController) {
        return Container(
          decoration: const BoxDecoration(
            color: Color(0xFFF7FAFC),
            borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
          ),
          child: Column(
            children: [
              // Handle bar
              Container(
                margin: const EdgeInsets.only(top: 12),
                width: 40,
                height: 4,
                decoration: BoxDecoration(
                  color: Colors.grey[300],
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
              // Header
              Padding(
                padding: const EdgeInsets.all(16),
                child: Row(
                  children: [
                    const Icon(Icons.videocam, color: Color(0xFF006a6a)),
                    const SizedBox(width: 8),
                    const Expanded(
                      child: Text(
                        'Quản lý Camera',
                        style: TextStyle(
                          fontFamily: 'Manrope',
                          fontSize: 18,
                          fontWeight: FontWeight.w700,
                          color: Color(0xFF003345),
                        ),
                      ),
                    ),
                    IconButton(
                      icon: const Icon(Icons.close),
                      onPressed: () => Navigator.pop(context),
                    ),
                  ],
                ),
              ),
              const Divider(height: 1),
              // Content
              Expanded(
                child: ListView(
                  controller: scrollController,
                  padding: const EdgeInsets.all(16),
                  children: [
                    // Existing cameras
                    if (_cameras.isNotEmpty) ...[
                      const Text(
                        'CAMERA HIỆN CÓ',
                        style: TextStyle(
                          fontFamily: 'Inter',
                          fontSize: 11,
                          fontWeight: FontWeight.w600,
                          letterSpacing: 0.1,
                          color: Color(0xFF006a6a),
                        ),
                      ),
                      const SizedBox(height: 8),
                      ..._cameras.map((c) => _buildCameraTile(c)),
                      const SizedBox(height: 16),
                    ],

                    // Add new camera form
                    const Text(
                      'THÊM CAMERA MỚI',
                      style: TextStyle(
                        fontFamily: 'Inter',
                        fontSize: 11,
                        fontWeight: FontWeight.w600,
                        letterSpacing: 0.1,
                        color: Color(0xFF006a6a),
                      ),
                    ),
                    const SizedBox(height: 12),
                    _buildAddCameraForm(),
                  ],
                ),
              ),
            ],
          ),
        );
      },
    );
  }

  Widget _buildCameraTile(RoomCamera camera) {
    final isExpanded = _expandedCameraId == camera.id;

    return Card(
      margin: const EdgeInsets.only(bottom: 8),
      elevation: 0,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(12),
        side: const BorderSide(color: Color(0xFFE0E0E0)),
      ),
      child: Column(
        children: [
          ListTile(
            leading: CircleAvatar(
              backgroundColor: const Color(0xFF006a6a).withOpacity(0.1),
              child: const Icon(Icons.videocam, color: Color(0xFF006a6a), size: 20),
            ),
            title: Text(
              camera.ten,
              style: const TextStyle(fontFamily: 'Manrope', fontWeight: FontWeight.w600),
            ),
            subtitle: Text(
              camera.ipAddress != null
                  ? '${camera.ipAddress}:${camera.port}'
                  : 'Chưa có IP',
              style: const TextStyle(fontFamily: 'Manrope', fontSize: 12, color: Color(0xFF6B7280)),
            ),
            trailing: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                if (camera.zones.isNotEmpty)
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                    decoration: BoxDecoration(
                      color: const Color(0xFF006a6a).withOpacity(0.1),
                      borderRadius: BorderRadius.circular(999),
                    ),
                    child: Text(
                      '${camera.zones.length} zone${camera.zones.length > 1 ? 's' : ''}',
                      style: const TextStyle(
                        fontFamily: 'Manrope',
                        fontSize: 11,
                        color: Color(0xFF006a6a),
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ),
                IconButton(
                  icon: Icon(isExpanded ? Icons.expand_less : Icons.expand_more),
                  onPressed: () {
                    setState(() {
                      _expandedCameraId = isExpanded ? null : camera.id;
                    });
                  },
                ),
              ],
            ),
          ),
          if (isExpanded) ...[
            const Divider(height: 1),
            Padding(
              padding: const EdgeInsets.all(12),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  if (camera.ipAddress != null)
                    _infoRow('IP', camera.ipAddress!),
                  _infoRow('Port', '${camera.port}'),
                  if (camera.rtspPath != null)
                    _infoRow('RTSP Path', camera.rtspPath!),
                  if (camera.zones.isNotEmpty) ...[
                    const SizedBox(height: 8),
                    const Text(
                      'Zones:',
                      style: TextStyle(fontFamily: 'Manrope', fontWeight: FontWeight.w600, fontSize: 13),
                    ),
                    const SizedBox(height: 4),
                    ...camera.zones.map((z) => Padding(
                      padding: const EdgeInsets.only(left: 8, bottom: 2),
                      child: Text(
                        '• ${z.zoneName}: ${z.polygonPoints.length} điểm',
                        style: const TextStyle(fontFamily: 'Manrope', fontSize: 12, color: Color(0xFF6B7280)),
                      ),
                    )),
                  ],
                  const SizedBox(height: 8),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.end,
                    children: [
                      TextButton.icon(
                        onPressed: () => _deleteCamera(camera),
                        icon: const Icon(Icons.delete_outline, size: 18, color: Colors.red),
                        label: const Text('Xóa', style: TextStyle(color: Colors.red)),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ],
        ],
      ),
    );
  }

  Widget _infoRow(String label, String value) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 4),
      child: Row(
        children: [
          SizedBox(
            width: 80,
            child: Text(
              '$label:',
              style: const TextStyle(
                fontFamily: 'Manrope',
                fontSize: 12,
                fontWeight: FontWeight.w600,
                color: Color(0xFF6B7280),
              ),
            ),
          ),
          Expanded(
            child: Text(
              value,
              style: const TextStyle(fontFamily: 'Manrope', fontSize: 12, color: Color(0xFF374151)),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildAddCameraForm() {
    return Form(
      key: _formKey,
      child: Card(
        elevation: 0,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(12),
          side: const BorderSide(color: Color(0xFFE0E0E0)),
        ),
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              TextFormField(
                controller: _tenController,
                decoration: _inputDecoration('Tên camera', Icons.label_outline),
                validator: (v) => (v == null || v.trim().isEmpty) ? 'Nhập tên camera' : null,
              ),
              const SizedBox(height: 12),
              TextFormField(
                controller: _ipController,
                decoration: _inputDecoration('Địa chỉ IP', Icons.computer),
                keyboardType: TextInputType.number,
                validator: (v) {
                  if (v == null || v.trim().isEmpty) return 'Nhập địa chỉ IP';
                  if (!_isValidIP(v.trim())) return 'IP không hợp lệ';
                  return null;
                },
              ),
              const SizedBox(height: 12),
              Row(
                children: [
                  Expanded(
                    child: TextFormField(
                      controller: _portController,
                      decoration: _inputDecoration('Port', Icons.settings_ethernet),
                      keyboardType: TextInputType.number,
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    flex: 2,
                    child: TextFormField(
                      controller: _rtspPathController,
                      decoration: _inputDecoration('RTSP Path', Icons.link),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 12),
              TextFormField(
                controller: _usernameController,
                decoration: _inputDecoration('Username (tùy chọn)', Icons.person_outline),
              ),
              const SizedBox(height: 12),
              TextFormField(
                controller: _passwordController,
                decoration: _inputDecoration('Password (tùy chọn)', Icons.lock_outline),
                obscureText: true,
              ),

              // Zone config section
              const SizedBox(height: 20),
              const Divider(),
              const SizedBox(height: 12),
              Row(
                children: [
                  Checkbox(
                    value: _enableZoneConfig,
                    onChanged: (v) => setState(() => _enableZoneConfig = v ?? false),
                    activeColor: const Color(0xFF006a6a),
                  ),
                  const SizedBox(width: 4),
                  const Expanded(
                    child: Text(
                      'Cấu hình Zone Tracking',
                      style: TextStyle(
                        fontFamily: 'Manrope',
                        fontWeight: FontWeight.w600,
                        fontSize: 15,
                        color: Color(0xFF003345),
                      ),
                    ),
                  ),
                ],
              ),

              if (_enableZoneConfig) ...[
                const SizedBox(height: 8),
                const Text(
                  'Tick vào ô trên để bật cấu hình zone. Mỗi zone là một vùng theo dõi riêng biệt trên hình camera.',
                  style: TextStyle(
                    fontFamily: 'Manrope',
                    fontSize: 12,
                    color: Color(0xFF6B7280),
                  ),
                ),
                const SizedBox(height: 16),
                ..._zoneSlots.asMap().entries.map((entry) {
                  final idx = entry.key;
                  final slot = entry.value;
                  return _buildZoneSlot(idx, slot);
                }),
                const SizedBox(height: 8),
                Center(
                  child: TextButton.icon(
                    onPressed: _addZoneSlot,
                    icon: const Icon(Icons.add_circle_outline, color: Color(0xFF006a6a)),
                    label: const Text(
                      'Thêm Zone',
                      style: TextStyle(
                        fontFamily: 'Manrope',
                        color: Color(0xFF006a6a),
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ),
                ),
                const SizedBox(height: 8),
                const Text(
                  'Định dạng tọa độ: [(124,311),(104,287),(57,287),(4,286),(5,417),(88,349),(125,311)]',
                  style: TextStyle(
                    fontFamily: 'Manrope',
                    fontSize: 11,
                    color: Color(0xFF9CA3AF),
                    fontStyle: FontStyle.italic,
                  ),
                ),
              ],

              const SizedBox(height: 20),
              SizedBox(
                width: double.infinity,
                child: ElevatedButton(
                  onPressed: _isSaving ? null : _saveCamera,
                  style: ElevatedButton.styleFrom(
                    backgroundColor: const Color(0xFF006a6a),
                    foregroundColor: Colors.white,
                    padding: const EdgeInsets.symmetric(vertical: 14),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(12),
                    ),
                    elevation: 0,
                  ),
                  child: _isSaving
                      ? const SizedBox(
                          height: 20,
                          width: 20,
                          child: CircularProgressIndicator(
                            strokeWidth: 2,
                            color: Colors.white,
                          ),
                        )
                      : const Text(
                          'Lưu Camera',
                          style: TextStyle(
                            fontFamily: 'Manrope',
                            fontWeight: FontWeight.w700,
                            fontSize: 15,
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

  Widget _buildZoneSlot(int index, _ZoneSlot slot) {
    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      elevation: 0,
      color: const Color(0xFFF0F9FF),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(10),
        side: const BorderSide(color: Color(0xFFBAE6FD)),
      ),
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                  decoration: BoxDecoration(
                    color: const Color(0xFF006a6a),
                    borderRadius: BorderRadius.circular(999),
                  ),
                  child: Text(
                    'Zone ${index + 1}',
                    style: const TextStyle(
                      fontFamily: 'Manrope',
                      fontSize: 11,
                      color: Colors.white,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ),
                const Spacer(),
                Checkbox(
                  value: slot.isEntryZone,
                  onChanged: (v) => setState(() => slot.isEntryZone = v ?? false),
                  activeColor: const Color(0xFF006a6a),
                ),
                const SizedBox(width: 4),
                const Text(
                  'Entry Zone',
                  style: TextStyle(fontFamily: 'Manrope', fontSize: 12, color: Color(0xFF006a6a)),
                ),
                const Spacer(),
                IconButton(
                  icon: const Icon(Icons.delete_outline, color: Colors.red, size: 20),
                  onPressed: () => _removeZoneSlot(index),
                  padding: EdgeInsets.zero,
                  constraints: const BoxConstraints(),
                ),
              ],
            ),
            const SizedBox(height: 8),
            TextField(
              controller: slot.nameController,
              decoration: const InputDecoration(
                labelText: 'Tên zone',
                hintText: 'VD: Bàn 1, Khu vực vào...',
                isDense: true,
                border: OutlineInputBorder(),
              ),
              style: const TextStyle(fontFamily: 'Manrope', fontSize: 14),
            ),
            const SizedBox(height: 8),
            TextField(
              controller: slot.pointsController,
              decoration: const InputDecoration(
                labelText: 'Tọa độ polygon',
                hintText: '[(124,311),(104,287),(57,287),...]',
                isDense: true,
                border: OutlineInputBorder(),
              ),
              style: const TextStyle(fontFamily: 'Manrope', fontSize: 13),
              maxLines: 2,
            ),
          ],
        ),
      ),
    );
  }

  InputDecoration _inputDecoration(String label, IconData icon) {
    return InputDecoration(
      labelText: label,
      prefixIcon: Icon(icon, size: 20, color: const Color(0xFF6B7280)),
      isDense: true,
      border: OutlineInputBorder(borderRadius: BorderRadius.circular(10)),
      contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
    );
  }

  bool _isValidIP(String ip) {
    final parts = ip.split('.');
    if (parts.length != 4) return false;
    return parts.every((p) {
      final n = int.tryParse(p);
      return n != null && n >= 0 && n <= 255;
    });
  }
}

class _ZoneSlot {
  final TextEditingController nameController;
  final TextEditingController pointsController;
  bool isEntryZone;

  _ZoneSlot({
    required this.nameController,
    required this.pointsController,
    this.isEntryZone = false,
  });

  void dispose() {
    nameController.dispose();
    pointsController.dispose();
  }
}
