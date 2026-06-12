import 'dart:async';
import 'package:flutter/material.dart';
import '../models/device.dart';
import '../models/control_type.dart';

class RelayControlWidget extends StatefulWidget {
  final Control control;
  final String deviceId;
  final Function(String deviceId, int relay, String state) onControl;
  final Function(int relay, ControlType newType)? onChangeControlType;
  /// Callback khi pending timeout (het thoi gian cho ma chua co confirm)
  final Function(String deviceId, int relay)? onPendingTimeout;

  const RelayControlWidget({
    Key? key,
    required this.control,
    required this.deviceId,
    required this.onControl,
    this.onChangeControlType,
    this.onPendingTimeout,
  }) : super(key: key);

  @override
  State<RelayControlWidget> createState() => _RelayControlWidgetState();
}

class _RelayControlWidgetState extends State<RelayControlWidget> {
  bool _isLoading = false;
  Timer? _pendingTimer;

  @override
  void initState() {
    super.initState();
    _startPendingTimerIfNeeded();
  }

  @override
  void didUpdateWidget(covariant RelayControlWidget oldWidget) {
    super.didUpdateWidget(oldWidget);
    // Neu pending state thay doi -> restart timer
    if (widget.control.isPending != oldWidget.control.isPending ||
        widget.control.pendingAt != oldWidget.control.pendingAt) {
      _pendingTimer?.cancel();
      _pendingTimer = null;
      _startPendingTimerIfNeeded();
    }
  }

  @override
  void dispose() {
    _pendingTimer?.cancel();
    super.dispose();
  }

  void _startPendingTimerIfNeeded() {
    if (!widget.control.isPending) return;
    _pendingTimer?.cancel();
    _pendingTimer = Timer(
      Duration(seconds: widget.control.pendingTimeoutSecs),
      () {
        if (mounted && widget.control.isPending) {
          widget.onPendingTimeout?.call(widget.deviceId, widget.control.relay);
        }
      },
    );
  }

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
    final isOn = widget.control.actualState.toUpperCase() == 'ON';
    final syncStatus = widget.control.syncStatus;
    final relayColor = _getColorForRelay(widget.control.name);
    final pendingColor = const Color(0xFFF59E0B);
    final failedColor = const Color(0xFFBA1A1A);

    final isPending = syncStatus == SyncStatus.pending;
    final isFailed = syncStatus == SyncStatus.failed;

    return Container(
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(24),
        border: Border.all(
          color: isFailed
              ? failedColor.withOpacity(0.6)
              : (isPending
                  ? pendingColor.withOpacity(0.6)
                  : (isOn
                      ? const Color(0xFF006a6a).withOpacity(0.3)
                      : const Color(0xFFC0C7CD).withOpacity(0.15))),
          width: (isPending || isFailed) ? 2 : 1,
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
          onTap: widget.control.controllable && !_isLoading && !isPending ? _handleTap : null,
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
                    isFailed
                        ? Icons.error_outline
                        : _getIconForRelay(widget.control.name),
                    size: 32,
                    color: isFailed
                        ? failedColor
                        : (isPending
                            ? pendingColor
                            : (isOn ? relayColor : const Color(0xFF40484C))),
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
                    color: isFailed
                        ? failedColor.withOpacity(0.1)
                        : (isPending
                            ? pendingColor.withOpacity(0.15)
                            : (isOn
                                ? const Color(0xFF90EFEF).withOpacity(0.3)
                                : const Color(0xFFE0E3E5))),
                    borderRadius: BorderRadius.circular(9999),
                    border: (isPending || isFailed)
                        ? Border.all(
                            color: (isFailed ? failedColor : pendingColor)
                                .withOpacity(0.5),
                            width: 1)
                        : null,
                  ),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      if (isPending) ...[
                        SizedBox(
                          width: 8,
                          height: 8,
                          child: CircularProgressIndicator(
                            strokeWidth: 1.5,
                            color: pendingColor,
                          ),
                        ),
                        const SizedBox(width: 6),
                      ] else if (isFailed) ...[
                        Icon(Icons.warning_amber, size: 10, color: failedColor),
                        const SizedBox(width: 4),
                      ] else ...[
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
                      ],
                      Text(
                        _getSyncBadgeLabel(),
                        style: TextStyle(
                          fontFamily: 'Inter',
                          fontSize: 11,
                          fontWeight: FontWeight.w600,
                          letterSpacing: 0.3,
                          color: isFailed
                              ? failedColor
                              : (isPending
                                  ? pendingColor
                                  : (isOn
                                      ? const Color(0xFF006e6e)
                                      : const Color(0xFF40484C))),
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
                        gradient: isFailed
                            ? LinearGradient(
                                colors: [failedColor, failedColor.withOpacity(0.8)],
                              )
                            : (isPending
                                ? LinearGradient(
                                    colors: [pendingColor, pendingColor.withOpacity(0.8)],
                                  )
                                : LinearGradient(
                                    begin: Alignment.centerLeft,
                                    end: Alignment.centerRight,
                                    colors: isOn
                                        ? [const Color(0xFF006a6a), const Color(0xFF004D56)]
                                        : [const Color(0xFF003345), const Color(0xFF004B63)],
                                  )),
                        borderRadius: BorderRadius.circular(9999),
                        boxShadow: [
                          BoxShadow(
                            color: (isFailed
                                    ? failedColor
                                    : (isPending
                                        ? pendingColor
                                        : (isOn
                                            ? const Color(0xFF006a6a)
                                            : const Color(0xFF003345))))
                                .withOpacity(0.25),
                            blurRadius: 12,
                            offset: const Offset(0, 4),
                          ),
                        ],
                      ),
                      child: ElevatedButton(
                        onPressed: !_isLoading && !isPending && !isFailed ? _handleTap : null,
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
                                  _getButtonLabel(),
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
    final state = widget.control.actualState;
    final syncStatus = widget.control.syncStatus;
    final pendingTarget = widget.control.targetValue;
    final relayColor = _getColorForRelay(widget.control.name);
    final pendingColor = const Color(0xFFF59E0B);
    final failedColor = const Color(0xFFBA1A1A);
    final states = ['LOW', 'MED', 'HIGH'];
    final stateColors = {
      'LOW': const Color(0xFFF59E0B),   // Amber
      'MED': const Color(0xFF0EA5E9),   // Blue
      'HIGH': const Color(0xFF22C55E),  // Green
    };
    final isPending = syncStatus == SyncStatus.pending;
    final isFailed = syncStatus == SyncStatus.failed;
    final effectiveColor = isFailed ? failedColor : (isPending ? pendingColor : relayColor);

    return Container(
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(24),
        border: Border.all(
          color: effectiveColor.withOpacity(isPending || isFailed ? 0.6 : 0.3),
          width: isPending || isFailed ? 2 : 1,
        ),
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
                  decoration: BoxDecoration(
                    color: effectiveColor.withOpacity(0.1),
                    borderRadius: BorderRadius.circular(16),
                  ),
                  child: Icon(
                    isFailed ? Icons.error_outline : _getIconForRelay(widget.control.name),
                    size: 32,
                    color: effectiveColor,
                  ),
                ),
                const SizedBox(height: 8),
                Text(widget.control.name, style: const TextStyle(fontFamily: 'Manrope', fontSize: 13, fontWeight: FontWeight.w700, color: Color(0xFF003345)), textAlign: TextAlign.center, maxLines: 2, overflow: TextOverflow.ellipsis),
                const SizedBox(height: 4),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                  decoration: BoxDecoration(
                    color: effectiveColor.withOpacity(0.15),
                    borderRadius: BorderRadius.circular(9999),
                    border: (isPending || isFailed) ? Border.all(color: effectiveColor.withOpacity(0.4), width: 1) : null,
                  ),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      if (isPending) ...[
                        SizedBox(
                          width: 8,
                          height: 8,
                          child: CircularProgressIndicator(strokeWidth: 1.5, color: pendingColor),
                        ),
                        const SizedBox(width: 4),
                      ] else if (isFailed) ...[
                        Icon(Icons.warning_amber, size: 10, color: failedColor),
                        const SizedBox(width: 4),
                      ],
                      Text(
                        isFailed
                            ? 'Loi'
                            : (isPending ? 'Dang $pendingTarget...' : (state.isEmpty ? 'OFF' : state)),
                        style: TextStyle(fontFamily: 'Inter', fontSize: 11, fontWeight: FontWeight.w600, color: effectiveColor),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 8),
                ...states.map((s) => _buildThreeWayButton(s, state, stateColors[s]!, relayColor, isPending, isFailed)),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildThreeWayButton(String level, String currentState, Color levelColor, Color baseColor, bool isPending, bool isFailed) {
    final isActive = currentState == level;
    // Chi highlight active level neu khong pending/failed
    final isHighlighted = !isPending && !isFailed && isActive;
    return GestureDetector(
      onTap: widget.control.controllable && !_isLoading && !isPending && !isFailed ? () => _handleThreeWayTap(level) : null,
      child: Container(
        width: double.infinity,
        height: 32,
        margin: const EdgeInsets.only(bottom: 4),
        decoration: BoxDecoration(
          gradient: isHighlighted ? LinearGradient(colors: [levelColor, levelColor.withOpacity(0.8)]) : null,
          color: isHighlighted ? null : const Color(0xFFF1F5F9),
          borderRadius: BorderRadius.circular(9999),
          border: Border.all(color: isHighlighted ? levelColor : const Color(0xFFE2E8F0), width: 1),
        ),
        child: Center(
          child: Text(
            isFailed
                ? 'LOI'
                : (isPending
                    ? 'DOI...'
                    : (isActive ? 'DANG $level' : level)),
            style: TextStyle(fontFamily: 'Manrope', fontSize: 11, fontWeight: FontWeight.w700, color: isHighlighted ? Colors.white : const Color(0xFF64748B)),
          ),
        ),
      ),
    );
  }

  Future<void> _handleThreeWayTap(String level) async {
    if (!widget.control.controllable) return;
    setState(() => _isLoading = true);
    try {
      await widget.onControl(widget.deviceId, widget.control.relay, level);
      // Snackbars xu ly o parent (confirm/error)
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
    final isPressed = widget.control.actualState.toUpperCase() == 'PRESS';
    final syncStatus = widget.control.syncStatus;
    final pendingColor = const Color(0xFFF59E0B);
    final failedColor = const Color(0xFFBA1A1A);
    final isPending = syncStatus == SyncStatus.pending;
    final isFailed = syncStatus == SyncStatus.failed;
    final effectiveColor = isFailed ? failedColor : (isPending ? pendingColor : (isPressed ? relayColor : const Color(0xFF40484C)));

    return Container(
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(24),
        border: Border.all(
          color: effectiveColor.withOpacity(isPending || isFailed ? 0.6 : 0.3),
          width: isPending || isFailed ? 2 : 1,
        ),
        boxShadow: const [BoxShadow(color: Color(0x0F1C1E10), blurRadius: 32, offset: Offset(0, 8))],
      ),
      child: Material(
        color: Colors.transparent,
        borderRadius: BorderRadius.circular(24),
        child: GestureDetector(
          onLongPress: _showChangeTypeMenu,
          child: InkWell(
            onTap: widget.control.controllable && !_isLoading && !isPending && !isFailed ? _handleMomentaryTap : null,
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
                    color: effectiveColor.withOpacity(0.1),
                    borderRadius: BorderRadius.circular(16),
                  ),
                  child: Icon(
                    isFailed
                        ? Icons.error_outline
                        : (isPending ? Icons.hourglass_empty : (isPressed ? Icons.notifications_active : Icons.notifications_outlined)),
                    size: 32,
                    color: effectiveColor,
                  ),
                ),
                const SizedBox(height: 8),
                Text(widget.control.name, style: const TextStyle(fontFamily: 'Manrope', fontSize: 13, fontWeight: FontWeight.w700, color: Color(0xFF003345)), textAlign: TextAlign.center, maxLines: 2, overflow: TextOverflow.ellipsis),
                const SizedBox(height: 4),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                  decoration: BoxDecoration(
                    color: effectiveColor.withOpacity(0.15),
                    borderRadius: BorderRadius.circular(9999),
                    border: (isPending || isFailed) ? Border.all(color: effectiveColor.withOpacity(0.4), width: 1) : null,
                  ),
                  child: Text(
                    isFailed
                        ? 'Loi'
                        : (isPending ? '${widget.control.targetValue} doi...' : widget.control.stateDisplay),
                    style: TextStyle(fontFamily: 'Inter', fontSize: 11, fontWeight: FontWeight.w600, color: effectiveColor),
                  ),
                ),
                const SizedBox(height: 8),
                SizedBox(
                  width: double.infinity,
                  height: 36,
                  child: DecoratedBox(
                    decoration: BoxDecoration(
                      gradient: isFailed
                          ? LinearGradient(colors: [failedColor, failedColor.withOpacity(0.8)])
                          : (isPending
                              ? LinearGradient(colors: [pendingColor, pendingColor.withOpacity(0.8)])
                              : LinearGradient(colors: isPressed ? [relayColor, relayColor.withOpacity(0.8)] : [const Color(0xFF003345), const Color(0xFF004B63)])),
                      borderRadius: BorderRadius.circular(9999),
                      boxShadow: [BoxShadow(color: effectiveColor.withOpacity(0.25), blurRadius: 12, offset: const Offset(0, 4))],
                    ),
                    child: ElevatedButton(
                      onPressed: !_isLoading && !isPending && !isFailed ? _handleMomentaryTap : null,
                      style: ElevatedButton.styleFrom(backgroundColor: Colors.transparent, foregroundColor: Colors.white, shadowColor: Colors.transparent, padding: EdgeInsets.zero, shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(9999))),
                      child: _isLoading
                          ? const SizedBox(height: 18, width: 18, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                          : FittedBox(fit: BoxFit.scaleDown, child: Text(
                              isFailed
                                  ? 'LOI'
                                  : (isPending ? 'DOI...' : 'NHAN'),
                              style: const TextStyle(fontFamily: 'Manrope', fontSize: 12, fontWeight: FontWeight.w700))),
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
      // Snackbars xu ly o parent (confirm/error)
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
      final newState = widget.control.actualState.toUpperCase() == 'ON' ? 'OFF' : 'ON';
      // Snackbars se duoc parent (room_detail_screen) xu ly:
      // - Confirm: khi WebSocket xac nhan
      // - Error: khi API that bai hoac timeout
      await widget.onControl(widget.deviceId, widget.control.relay, newState);
      // KHONG reset _isLoading o day -- parent se xu ly optimistic update
      // va WebSocket se confirm hoac rollback
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

  String _getSyncBadgeLabel() {
    switch (widget.control.syncStatus) {
      case SyncStatus.pending:
        if (widget.control.targetValue?.toUpperCase() == 'ON') return 'Dang bat...';
        if (widget.control.targetValue?.toUpperCase() == 'OFF') return 'Dang tat...';
        if (widget.control.targetValue != null) return 'Dang doi...';
        return 'Dang doi...';
      case SyncStatus.failed:
        return 'Loi';
      case SyncStatus.synced:
        return widget.control.stateDisplay;
    }
  }

  String _getButtonLabel() {
    switch (widget.control.syncStatus) {
      case SyncStatus.pending:
        if (widget.control.targetValue?.toUpperCase() == 'ON') return 'DANG BAT';
        if (widget.control.targetValue?.toUpperCase() == 'OFF') return 'DANG TAT';
        return 'DOI...';
      case SyncStatus.failed:
        return 'LOI';
      case SyncStatus.synced:
        return widget.control.isOn ? 'TAT DIEN' : 'BAT DIEN';
    }
  }
}
