import 'package:flutter/material.dart';
import '../models/device.dart';

class MetricCard extends StatelessWidget {
  final Metric metric;

  const MetricCard({Key? key, required this.metric}) : super(key: key);

  @override
  Widget build(BuildContext context) {
    switch (metric.type.toLowerCase()) {
      case 'gauge':
        return _buildGaugeCard(context);
      case 'number':
        return _buildNumberCard(context);
      case 'text':
        return _buildTextCard(context);
      case 'boolean':
        return _buildBooleanCard(context);
      default:
        return _buildGenericCard(context);
    }
  }

  Widget _buildGaugeCard(BuildContext context) {
    final percentage = _calculatePercentage();
    final color = _getColorForMetric();

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
        mainAxisAlignment: MainAxisAlignment.center,
        mainAxisSize: MainAxisSize.min,
        children: [
          // Thin-stroke circular progress
          SizedBox(
            width: 72,
            height: 72,
            child: Stack(
              alignment: Alignment.center,
              children: [
                // Track (2px)
                SizedBox(
                  width: 72,
                  height: 72,
                  child: CircularProgressIndicator(
                    value: 1.0,
                    strokeWidth: 2,
                    backgroundColor: Colors.transparent,
                    valueColor: const AlwaysStoppedAnimation(
                      Color(0xFFC0C7CD),
                    ),
                  ),
                ),
                // Active (4px)
                SizedBox(
                  width: 72,
                  height: 72,
                  child: CircularProgressIndicator(
                    value: percentage,
                    strokeWidth: 4,
                    backgroundColor: Colors.transparent,
                    valueColor: AlwaysStoppedAnimation(color),
                  ),
                ),
                // Value
                Text(
                  metric.displayValue,
                  style: TextStyle(
                    fontFamily: 'Manrope',
                    fontSize: 18,
                    fontWeight: FontWeight.w700,
                    letterSpacing: -0.02,
                    color: color,
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 12),
          Text(
            metric.displayLabel,
            style: const TextStyle(
              fontFamily: 'Inter',
              fontSize: 10,
              fontWeight: FontWeight.w600,
              letterSpacing: 0.5,
              color: Color(0xFF40484C),
            ),
            textAlign: TextAlign.center,
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
          ),
          if (metric.unit != null && metric.unit!.isNotEmpty)
            Text(
              metric.unit!,
              style: const TextStyle(
                fontFamily: 'Inter',
                fontSize: 10,
                fontWeight: FontWeight.w500,
                color: Color(0xFF71787D),
              ),
            ),
        ],
      ),
    );
  }

  Widget _buildNumberCard(BuildContext context) {
    final color = _getColorForMetric();
    final icon = _getIconForMetric();

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
        mainAxisAlignment: MainAxisAlignment.center,
        mainAxisSize: MainAxisSize.min,
        children: [
          // Icon container
          Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: color.withOpacity(0.1),
              borderRadius: BorderRadius.circular(16),
            ),
            child: Icon(icon, color: color, size: 24),
          ),
          const SizedBox(height: 12),
          Text(
            metric.displayLabel,
            style: const TextStyle(
              fontFamily: 'Inter',
              fontSize: 10,
              fontWeight: FontWeight.w600,
              letterSpacing: 0.5,
              color: Color(0xFF40484C),
            ),
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: 6),
          Text(
            metric.displayText,
            style: const TextStyle(
              fontFamily: 'Manrope',
              fontSize: 16,
              fontWeight: FontWeight.w700,
              letterSpacing: -0.02,
              color: Color(0xFF003345),
            ),
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            textAlign: TextAlign.center,
          ),
        ],
      ),
    );
  }

  Widget _buildTextCard(BuildContext context) {
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
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Container(
            padding: const EdgeInsets.all(10),
            decoration: BoxDecoration(
              color: const Color(0xFF006a6a).withOpacity(0.1),
              borderRadius: BorderRadius.circular(16),
            ),
            child: const Icon(
              Icons.info_outline,
              size: 28,
              color: Color(0xFF006a6a),
            ),
          ),
          const SizedBox(height: 12),
          Text(
            metric.displayLabel,
            style: const TextStyle(
              fontFamily: 'Inter',
              fontSize: 10,
              fontWeight: FontWeight.w600,
              letterSpacing: 0.5,
              color: Color(0xFF40484C),
            ),
            textAlign: TextAlign.center,
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
          ),
          const SizedBox(height: 6),
          Text(
            metric.value.toString(),
            style: const TextStyle(
              fontFamily: 'Manrope',
              fontSize: 16,
              fontWeight: FontWeight.w700,
              letterSpacing: -0.02,
              color: Color(0xFF003345),
            ),
            textAlign: TextAlign.center,
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
          ),
        ],
      ),
    );
  }

  Widget _buildBooleanCard(BuildContext context) {
    final boolValue = _parseBoolValue();
    final color = boolValue ? const Color(0xFF006a6a) : const Color(0xFF40484C);

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
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(
            boolValue ? Icons.check_circle : Icons.cancel_outlined,
            size: 36,
            color: color,
          ),
          const SizedBox(height: 12),
          Text(
            metric.displayLabel,
            style: const TextStyle(
              fontFamily: 'Inter',
              fontSize: 10,
              fontWeight: FontWeight.w600,
              letterSpacing: 0.5,
              color: Color(0xFF40484C),
            ),
            textAlign: TextAlign.center,
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
          ),
          const SizedBox(height: 8),
          // Pill-shaped chip with dot
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
            decoration: BoxDecoration(
              color: boolValue
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
                    color: boolValue
                        ? const Color(0xFF006a6a)
                        : const Color(0xFF71787D),
                    shape: BoxShape.circle,
                  ),
                ),
                const SizedBox(width: 6),
                Text(
                  boolValue ? 'BAT' : 'TAT',
                  style: TextStyle(
                    fontFamily: 'Manrope',
                    fontSize: 12,
                    fontWeight: FontWeight.w700,
                    color: boolValue
                        ? const Color(0xFF006e6e)
                        : const Color(0xFF40484C),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildGenericCard(BuildContext context) {
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
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Container(
            padding: const EdgeInsets.all(10),
            decoration: BoxDecoration(
              color: const Color(0xFF006a6a).withOpacity(0.1),
              borderRadius: BorderRadius.circular(16),
            ),
            child: const Icon(
              Icons.sensors,
              size: 28,
              color: Color(0xFF006a6a),
            ),
          ),
          const SizedBox(height: 12),
          Text(
            metric.displayLabel,
            style: const TextStyle(
              fontFamily: 'Inter',
              fontSize: 10,
              fontWeight: FontWeight.w600,
              letterSpacing: 0.5,
              color: Color(0xFF40484C),
            ),
            textAlign: TextAlign.center,
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
          ),
          const SizedBox(height: 6),
          Text(
            metric.displayText,
            style: const TextStyle(
              fontFamily: 'Manrope',
              fontSize: 16,
              fontWeight: FontWeight.w700,
              letterSpacing: -0.02,
              color: Color(0xFF003345),
            ),
            textAlign: TextAlign.center,
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
          ),
        ],
      ),
    );
  }

  double _calculatePercentage() {
    if (metric.min == null || metric.max == null) return 0.5;
    if (metric.value is! num) return 0.5;

    final value = (metric.value as num).toDouble();
    final range = metric.max! - metric.min!;
    if (range == 0) return 0.5;

    return ((value - metric.min!) / range).clamp(0.0, 1.0);
  }

  bool _parseBoolValue() {
    if (metric.value is bool) return metric.value as bool;
    if (metric.value is String) {
      final str = (metric.value as String).toLowerCase();
      return str == 'true' || str == 'on' || str == '1';
    }
    if (metric.value is num) return (metric.value as num) != 0;
    return false;
  }

  Color _getColorForMetric() {
    if (metric.color != null) {
      try {
        return Color(int.parse(metric.color!.replaceFirst('#', '0xFF')));
      } catch (e) {
        // Fallback
      }
    }

    final key = metric.key.toLowerCase();
    if (key.contains('temp')) return const Color(0xFFF97316); // Orange
    if (key.contains('humi')) return const Color(0xFF0EA5E9); // Blue
    if (key.contains('volt')) return const Color(0xFFF59E0B); // Amber
    if (key.contains('current')) return const Color(0xFFEF4444); // Red
    if (key.contains('power')) return const Color(0xFF22C55E); // Green
    if (key.contains('energy')) return const Color(0xFF14B8A6); // Teal
    if (key.contains('freq')) return const Color(0xFFA855F7); // Purple
    if (key.contains('soil')) return const Color(0xFF92400E); // Brown
    if (key.contains('light')) return const Color(0xFFFACC15); // Yellow

    return const Color(0xFF006a6a);
  }

  IconData _getIconForMetric() {
    final key = metric.key.toLowerCase();
    if (key.contains('temp')) return Icons.thermostat;
    if (key.contains('humi')) return Icons.water_drop;
    if (key.contains('volt')) return Icons.bolt;
    if (key.contains('current')) return Icons.electric_bolt;
    if (key.contains('power')) return Icons.power;
    if (key.contains('energy')) return Icons.battery_charging_full;
    if (key.contains('freq')) return Icons.waves;
    if (key.contains('soil')) return Icons.grass;
    if (key.contains('light')) return Icons.light_mode;
    if (key.contains('fan')) return Icons.air;
    if (key.contains('pump')) return Icons.water;

    return Icons.sensors;
  }
}
