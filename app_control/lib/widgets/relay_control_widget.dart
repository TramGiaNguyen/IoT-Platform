import 'package:flutter/material.dart';
import '../models/device.dart';

class RelayControlWidget extends StatefulWidget {
  final Control control;
  final String deviceId;
  final Function(String deviceId, int relay, String state) onControl;

  const RelayControlWidget({
    Key? key,
    required this.control,
    required this.deviceId,
    required this.onControl,
  }) : super(key: key);

  @override
  State<RelayControlWidget> createState() => _RelayControlWidgetState();
}

class _RelayControlWidgetState extends State<RelayControlWidget> {
  bool _isLoading = false;

  @override
  Widget build(BuildContext context) {
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
          borderRadius: BorderRadius.circular(24),
          child: Padding(
            padding: const EdgeInsets.fromLTRB(12, 12, 12, 10),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                // Icon with rounded container
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

                // Name
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

                // State badge - pill shaped with dot
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

                // Control button - gradient pill (compact to avoid grid overflow)
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
