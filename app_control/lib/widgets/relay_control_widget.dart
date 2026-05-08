import 'package:flutter/material.dart';
import '../models/device.dart';
import '../models/control_type.dart';

class RelayControlWidget extends StatefulWidget {
  final Control control;
  final String deviceId;
  final Function(String deviceId, int relay, String state) onControl;
  final Function(int relay, ControlType newType)? onChangeControlType;

  const RelayControlWidget({
    Key? key,
    required this.control,
    required this.deviceId,
    required this.onControl,
    this.onChangeControlType,
  }) : super(key: key);

  @override
  State<RelayControlWidget> createState() => _RelayControlWidgetState();
}

class _RelayControlWidgetState extends State<RelayControlWidget> {
  bool _isLoading = false;

  @override
  Widget build(BuildContext context) {
    switch (widget.control.controlType) {
      case ControlType.toggle:
        return _buildThreeWayToggle();
      case ControlType.momentary:
        return _buildMomentaryButton();
      case ControlType.onOff:
      default:
        return _buildOnOffToggle();
    }
  }

  // ON/OFF Toggle (default)
  Widget _buildOnOffToggle() {
    final isOn = widget.control.isOn;
    final relayColor = _getColorForRelay(widget.control.name);

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
          onTap: widget.control.controllable && !_isLoading ? _handleTap : null,
          onLongPress: _showChangeTypeMenu,
          borderRadius: BorderRadius.circular(24),
          child: Padding(
            padding: const EdgeInsets.fromLTRB(12, 12, 12, 10),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Container(
                  padding: const EdgeInsets.all(10),
                  decoration: BoxDecoration(
                    color: relayColor.withOpacity(0.1),
                    borderRadius: BorderRadius.circular(16),
                  ),
                  child: Icon(
                    _getIconForRelay(widget.control.name),
                    size: 32,
                    color: isOn ? relayColor : const Color(0xFF40484C),
                  ),
                ),
                const SizedBox(height: 8),
                Text(
                  widget.control.name,
                  style: const TextStyle(
                    fontFamily: 'Manrope',
                    fontSize: 13,
                    fontWeight: FontWeight.w700,
                    color: Color(0xFF003345),
                  ),
                  textAlign: TextAlign.center,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                ),
                const SizedBox(height: 6),
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
                        widget.control.stateDisplay,
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
                const SizedBox(height: 8),
                if (widget.control.controllable)
                  SizedBox(
                    width: double.infinity,
                    height: 36,
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
                            blurRadius: 12,
                            offset: const Offset(0, 4),
                          ),
                        ],
                      ),
                      child: ElevatedButton(
                        onPressed: !_isLoading ? _handleTap : null,
                        style: ElevatedButton.styleFrom(
                          backgroundColor: Colors.transparent,
                          foregroundColor: Colors.white,
                          shadowColor: Colors.transparent,
                          disabledBackgroundColor: Colors.transparent,
                          padding: EdgeInsets.zero,
                          minimumSize: Size.zero,
                          tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(9999),
                          ),
                        ),
                        child: _isLoading
                            ? const SizedBox(
                                height: 18,
                                width: 18,
                                child: CircularProgressIndicator(
                                  strokeWidth: 2,
                                  color: Colors.white,
                                ),
                              )
                            : FittedBox(
                                fit: BoxFit.scaleDown,
                                child: Text(
                                  isOn ? 'TAT DIEN' : 'BAT DIEN',
                                  maxLines: 1,
                                  style: const TextStyle(
                                    fontFamily: 'Manrope',
                                    fontSize: 12,
                                    fontWeight: FontWeight.w700,
                                    letterSpacing: 0.2,
                                  ),
                                ),
                              ),
                      ),
                    ),
                  )
                else
                  Container(
                    padding: const EdgeInsets.symmetric(vertical: 12),
                    child: const Text(
                      'Khong the dieu khien',
                      style: TextStyle(
                        fontFamily: 'Inter',
                        fontSize: 11,
                        color: Color(0xFF71787D),
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

  // Three-way toggle (LOW, MED, HIGH)
  Widget _buildThreeWayToggle() {
    final state = widget.control.state;
    final relayColor = _getColorForRelay(widget.control.name);
    final states = ['LOW', 'MED', 'HIGH'];
    final stateColors = {
      'LOW': const Color(0xFFF59E0B),   // Amber
      'MED': const Color(0xFF0EA5E9),   // Blue
      'HIGH': const Color(0xFF22C55E),   // Green
    };

    return Container(
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(24),
        border: Border.all(color: relayColor.withOpacity(0.3), width: 1),
        boxShadow: const [BoxShadow(color: Color(0x0F1C1E10), blurRadius: 32, offset: Offset(0, 8))],
      ),
      child: Material(
        color: Colors.transparent,
        borderRadius: BorderRadius.circular(24),
        child: GestureDetector(
          onLongPress: _showChangeTypeMenu,
          child: Padding(
            padding: const EdgeInsets.fromLTRB(12, 12, 12, 10),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Container(
                  padding: const EdgeInsets.all(10),
                  decoration: BoxDecoration(color: relayColor.withOpacity(0.1), borderRadius: BorderRadius.circular(16)),
                  child: Icon(_getIconForRelay(widget.control.name), size: 32, color: relayColor),
                ),
                const SizedBox(height: 8),
                Text(widget.control.name, style: const TextStyle(fontFamily: 'Manrope', fontSize: 13, fontWeight: FontWeight.w700, color: Color(0xFF003345)), textAlign: TextAlign.center, maxLines: 2, overflow: TextOverflow.ellipsis),
                const SizedBox(height: 4),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                  decoration: BoxDecoration(color: relayColor.withOpacity(0.2), borderRadius: BorderRadius.circular(9999)),
                  child: Text(state.isEmpty ? 'OFF' : state, style: TextStyle(fontFamily: 'Inter', fontSize: 11, fontWeight: FontWeight.w600, color: relayColor)),
                ),
                const SizedBox(height: 8),
                ...states.map((s) => _buildThreeWayButton(s, state, stateColors[s]!, relayColor)),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildThreeWayButton(String level, String currentState, Color levelColor, Color baseColor) {
    final isActive = currentState == level;
    return GestureDetector(
      onTap: widget.control.controllable && !_isLoading ? () => _handleThreeWayTap(level) : null,
      child: Container(
        width: double.infinity,
        height: 32,
        margin: const EdgeInsets.only(bottom: 4),
        decoration: BoxDecoration(
          gradient: isActive ? LinearGradient(colors: [levelColor, levelColor.withOpacity(0.8)]) : null,
          color: isActive ? null : const Color(0xFFF1F5F9),
          borderRadius: BorderRadius.circular(9999),
          border: Border.all(color: isActive ? levelColor : const Color(0xFFE2E8F0), width: 1),
        ),
        child: Center(
          child: Text(isActive ? 'DANG $level' : level, style: TextStyle(fontFamily: 'Manrope', fontSize: 11, fontWeight: FontWeight.w700, color: isActive ? Colors.white : const Color(0xFF64748B))),
        ),
      ),
    );
  }

  Future<void> _handleThreeWayTap(String level) async {
    if (!widget.control.controllable) return;
    setState(() => _isLoading = true);
    try {
      await widget.onControl(widget.deviceId, widget.control.relay, level);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Da chuyen $level ${widget.control.name}'), backgroundColor: const Color(0xFF006a6a), duration: const Duration(seconds: 1)),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Loi: ${e.toString()}'), backgroundColor: const Color(0xFFBA1A1A)),
        );
      }
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  // Momentary button
  Widget _buildMomentaryButton() {
    final relayColor = _getColorForRelay(widget.control.name);
    final isPressed = widget.control.isPress;

    return Container(
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(24),
        border: Border.all(color: relayColor.withOpacity(0.3), width: 1),
        boxShadow: const [BoxShadow(color: Color(0x0F1C1E10), blurRadius: 32, offset: Offset(0, 8))],
      ),
      child: Material(
        color: Colors.transparent,
        borderRadius: BorderRadius.circular(24),
        child: GestureDetector(
          onLongPress: _showChangeTypeMenu,
          child: InkWell(
            onTap: widget.control.controllable && !_isLoading ? _handleMomentaryTap : null,
            borderRadius: BorderRadius.circular(24),
          child: Padding(
            padding: const EdgeInsets.fromLTRB(12, 12, 12, 10),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Container(
                  padding: const EdgeInsets.all(10),
                  decoration: BoxDecoration(color: relayColor.withOpacity(0.1), borderRadius: BorderRadius.circular(16)),
                  child: Icon(isPressed ? Icons.notifications_active : Icons.notifications_outlined, size: 32, color: isPressed ? relayColor : const Color(0xFF40484C)),
                ),
                const SizedBox(height: 8),
                Text(widget.control.name, style: const TextStyle(fontFamily: 'Manrope', fontSize: 13, fontWeight: FontWeight.w700, color: Color(0xFF003345)), textAlign: TextAlign.center, maxLines: 2, overflow: TextOverflow.ellipsis),
                const SizedBox(height: 4),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                  decoration: BoxDecoration(color: isPressed ? relayColor.withOpacity(0.2) : const Color(0xFFE0E3E5), borderRadius: BorderRadius.circular(9999)),
                  child: Text(widget.control.stateDisplay, style: TextStyle(fontFamily: 'Inter', fontSize: 11, fontWeight: FontWeight.w600, color: isPressed ? relayColor : const Color(0xFF40484C))),
                ),
                const SizedBox(height: 8),
                SizedBox(
                  width: double.infinity,
                  height: 36,
                  child: DecoratedBox(
                    decoration: BoxDecoration(
                      gradient: LinearGradient(colors: isPressed ? [relayColor, relayColor.withOpacity(0.8)] : [const Color(0xFF003345), const Color(0xFF004B63)]),
                      borderRadius: BorderRadius.circular(9999),
                      boxShadow: [BoxShadow(color: (isPressed ? relayColor : const Color(0xFF003345)).withOpacity(0.25), blurRadius: 12, offset: const Offset(0, 4))],
                    ),
                    child: ElevatedButton(
                      onPressed: !_isLoading ? _handleMomentaryTap : null,
                      style: ElevatedButton.styleFrom(backgroundColor: Colors.transparent, foregroundColor: Colors.white, shadowColor: Colors.transparent, padding: EdgeInsets.zero, shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(9999))),
                      child: _isLoading
                          ? const SizedBox(height: 18, width: 18, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                          : const FittedBox(fit: BoxFit.scaleDown, child: Text('NHAN', style: TextStyle(fontFamily: 'Manrope', fontSize: 12, fontWeight: FontWeight.w700))),
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
        ),
      ),
    );
  }

  Future<void> _handleMomentaryTap() async {
    if (!widget.control.controllable) return;
    setState(() => _isLoading = true);
    try {
      await widget.onControl(widget.deviceId, widget.control.relay, 'PRESS');
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Da kich hoat ${widget.control.name}'), backgroundColor: const Color(0xFF006a6a), duration: const Duration(seconds: 1)),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Loi: ${e.toString()}'), backgroundColor: const Color(0xFFBA1A1A)),
        );
      }
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  Future<void> _handleTap() async {
    if (!widget.control.controllable) return;

    setState(() => _isLoading = true);

    try {
      final newState = widget.control.isOn ? 'OFF' : 'ON';
      await widget.onControl(widget.deviceId, widget.control.relay, newState);

      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              'Da ${newState == 'ON' ? 'bat' : 'tat'} ${widget.control.name}',
            ),
            backgroundColor: const Color(0xFF006a6a),
            duration: const Duration(seconds: 1),
          ),
        );
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
        setState(() => _isLoading = false);
      }
    }
  }

  void _showChangeTypeMenu() {
    showModalBottomSheet(
      context: context,
      backgroundColor: Colors.transparent,
      builder: (context) => Container(
        decoration: const BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
        ),
        padding: const EdgeInsets.fromLTRB(24, 16, 24, 32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Center(
              child: Container(
                width: 40,
                height: 4,
                decoration: BoxDecoration(
                  color: const Color(0xFFC0C7CD),
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
            ),
            const SizedBox(height: 16),
            Text(
              'Dang nut: ${_getTypeLabel(widget.control.controlType)}',
              style: const TextStyle(
                fontFamily: 'Manrope',
                fontSize: 16,
                fontWeight: FontWeight.w700,
                color: Color(0xFF003345),
              ),
            ),
            const SizedBox(height: 4),
            Text(
              widget.control.name,
              style: const TextStyle(
                fontFamily: 'Inter',
                fontSize: 13,
                color: Color(0xFF71787D),
              ),
            ),
            const SizedBox(height: 16),
            ...ControlType.values.map((type) => _buildTypeOption(type)),
          ],
        ),
      ),
    );
  }

  Widget _buildTypeOption(ControlType type) {
    final isSelected = widget.control.controlType == type;
    return ListTile(
      onTap: () {
        Navigator.pop(context);
        if (!isSelected) {
          widget.onChangeControlType?.call(widget.control.relay, type);
        }
      },
      contentPadding: EdgeInsets.zero,
      leading: Container(
        padding: const EdgeInsets.all(8),
        decoration: BoxDecoration(
          color: isSelected
              ? const Color(0xFF006a6a).withOpacity(0.1)
              : const Color(0xFFF1F5F9),
          borderRadius: BorderRadius.circular(12),
        ),
        child: Icon(
          _getTypeIcon(type),
          color: isSelected ? const Color(0xFF006a6a) : const Color(0xFF71787D),
          size: 22,
        ),
      ),
      title: Text(
        _getTypeLabel(type),
        style: TextStyle(
          fontFamily: 'Manrope',
          fontWeight: FontWeight.w600,
          color: isSelected ? const Color(0xFF006a6a) : const Color(0xFF003345),
        ),
      ),
      subtitle: Text(
        _getTypeDescription(type),
        style: const TextStyle(
          fontFamily: 'Inter',
          fontSize: 12,
          color: Color(0xFF71787D),
        ),
      ),
      trailing: isSelected
          ? const Icon(Icons.check_circle, color: Color(0xFF006a6a))
          : null,
    );
  }

  String _getTypeLabel(ControlType type) {
    switch (type) {
      case ControlType.onOff:
        return 'ON/OFF';
      case ControlType.toggle:
        return 'Gat 3 trang thai';
      case ControlType.momentary:
        return 'Nhan tha';
    }
  }

  String _getTypeDescription(ControlType type) {
    switch (type) {
      case ControlType.onOff:
        return 'Cong tac bat/tat binh thuong';
      case ControlType.toggle:
        return 'LOW / MED / HIGH (quat, bom...)';
      case ControlType.momentary:
        return 'Nhan giu roi tha (chuong, cua...)';
    }
  }

  IconData _getTypeIcon(ControlType type) {
    switch (type) {
      case ControlType.onOff:
        return Icons.power_settings_new;
      case ControlType.toggle:
        return Icons.toggle_on;
      case ControlType.momentary:
        return Icons.touch_app;
    }
  }

  IconData _getIconForRelay(String name) {
    final lowerName = name.toLowerCase();
    if (lowerName.contains('den') || lowerName.contains('light')) {
      return Icons.lightbulb;
    }
    if (lowerName.contains('quat') || lowerName.contains('fan')) {
      return Icons.air;
    }
    if (lowerName.contains('may') || lowerName.contains('ac') ||
        lowerName.contains('dieu hoa')) {
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
      return const Color(0xFFF59E0B); // Amber
    }
    if (lowerName.contains('quat') || lowerName.contains('fan')) {
      return const Color(0xFF0EA5E9); // Blue
    }
    if (lowerName.contains('may') || lowerName.contains('ac')) {
      return const Color(0xFF06B6D4); // Cyan
    }
    if (lowerName.contains('bom') || lowerName.contains('pump')) {
      return const Color(0xFF14B8A6); // Teal
    }
    return const Color(0xFF006a6a); // Default secondary
  }
}
