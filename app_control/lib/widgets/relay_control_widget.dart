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

    return Card(
      elevation: 2,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(12),
        side: BorderSide(
          color: isOn ? Colors.green : Colors.grey.shade300,
          width: 2,
        ),
      ),
      child: InkWell(
        onTap: widget.control.controllable && !_isLoading ? _handleTap : null,
        borderRadius: BorderRadius.circular(12),
        child: Padding(
          padding: const EdgeInsets.all(12),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              // Icon
              Icon(
                _getIconForRelay(widget.control.name),
                size: 40,
                color: isOn ? _getColorForRelay(widget.control.name) : Colors.grey,
              ),
              const SizedBox(height: 8),

              // Name
              Text(
                widget.control.name,
                style: const TextStyle(
                  fontSize: 14,
                  fontWeight: FontWeight.bold,
                ),
                textAlign: TextAlign.center,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
              ),
              const SizedBox(height: 6),

              // State badge
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                decoration: BoxDecoration(
                  color: isOn
                      ? Colors.green.withOpacity(0.2)
                      : Colors.grey.withOpacity(0.2),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Text(
                  widget.control.stateDisplay,
                  style: TextStyle(
                    fontSize: 11,
                    fontWeight: FontWeight.bold,
                    color: isOn ? Colors.green : Colors.grey,
                  ),
                ),
              ),
              const SizedBox(height: 10),

              // Control button
              SizedBox(
                width: double.infinity,
                child: ElevatedButton(
                  onPressed: widget.control.controllable && !_isLoading
                      ? _handleTap
                      : null,
                  style: ElevatedButton.styleFrom(
                    backgroundColor: isOn ? Colors.red : Colors.green,
                    foregroundColor: Colors.white,
                    padding: const EdgeInsets.symmetric(vertical: 10),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(8),
                    ),
                  ),
                  child: _isLoading
                      ? const SizedBox(
                          height: 16,
                          width: 16,
                          child: CircularProgressIndicator(
                            strokeWidth: 2,
                            color: Colors.white,
                          ),
                        )
                      : Text(
                          isOn ? 'TẮT' : 'BẬT',
                          style: const TextStyle(
                            fontSize: 13,
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
              'Đã ${newState == 'ON' ? 'bật' : 'tắt'} ${widget.control.name}',
            ),
            backgroundColor: Colors.green,
            duration: const Duration(seconds: 1),
          ),
        );
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
        setState(() => _isLoading = false);
      }
    }
  }

  IconData _getIconForRelay(String name) {
    final lowerName = name.toLowerCase();
    if (lowerName.contains('đèn') || lowerName.contains('light')) {
      return Icons.lightbulb;
    }
    if (lowerName.contains('quạt') || lowerName.contains('fan')) {
      return Icons.air;
    }
    if (lowerName.contains('máy') || lowerName.contains('ac') ||
        lowerName.contains('điều hòa')) {
      return Icons.ac_unit;
    }
    if (lowerName.contains('bơm') || lowerName.contains('pump')) {
      return Icons.water;
    }
    if (lowerName.contains('cửa') || lowerName.contains('door')) {
      return Icons.door_front_door;
    }
    return Icons.power;
  }

  Color _getColorForRelay(String name) {
    final lowerName = name.toLowerCase();
    if (lowerName.contains('đèn') || lowerName.contains('light')) {
      return Colors.amber;
    }
    if (lowerName.contains('quạt') || lowerName.contains('fan')) {
      return Colors.blue;
    }
    if (lowerName.contains('máy') || lowerName.contains('ac')) {
      return Colors.cyan;
    }
    if (lowerName.contains('bơm') || lowerName.contains('pump')) {
      return Colors.teal;
    }
    return Colors.green;
  }
}
