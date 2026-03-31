import 'package:flutter/material.dart';
import '../models/device.dart';

class MetricCard extends StatelessWidget {
  final Metric metric;

  const MetricCard({Key? key, required this.metric}) : super(key: key);

  @override
  Widget build(BuildContext context) {
    // Determine widget type based on metric type
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

    return Card(
      elevation: 2,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          mainAxisSize: MainAxisSize.min,
          children: [
            // Circular gauge
            SizedBox(
              width: 70,
              height: 70,
              child: Stack(
                alignment: Alignment.center,
                children: [
                  CircularProgressIndicator(
                    value: percentage,
                    strokeWidth: 6,
                    backgroundColor: Colors.grey[200],
                    valueColor: AlwaysStoppedAnimation(color),
                  ),
                  Text(
                    metric.displayValue,
                    style: TextStyle(
                      fontSize: 16,
                      fontWeight: FontWeight.bold,
                      color: color,
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 8),
            Text(
              metric.displayLabel,
              style: TextStyle(
                fontSize: 11,
                color: Colors.grey[700],
                fontWeight: FontWeight.w500,
              ),
              textAlign: TextAlign.center,
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
            ),
            if (metric.unit != null && metric.unit!.isNotEmpty)
              Text(
                metric.unit!,
                style: TextStyle(
                  fontSize: 10,
                  color: Colors.grey[500],
                ),
              ),
          ],
        ),
      ),
    );
  }

  Widget _buildNumberCard(BuildContext context) {
    final color = _getColorForMetric();
    final icon = _getIconForMetric();

    return Card(
      elevation: 2,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              padding: const EdgeInsets.all(10),
              decoration: BoxDecoration(
                color: color.withOpacity(0.1),
                borderRadius: BorderRadius.circular(10),
              ),
              child: Icon(icon, color: color, size: 24),
            ),
            const SizedBox(height: 8),
            Text(
              metric.displayLabel,
              style: TextStyle(
                fontSize: 10,
                color: Colors.grey[600],
              ),
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 4),
            Text(
              metric.displayText,
              style: const TextStyle(
                fontSize: 14,
                fontWeight: FontWeight.bold,
              ),
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              textAlign: TextAlign.center,
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildTextCard(BuildContext context) {
    return Card(
      elevation: 2,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(
              Icons.info_outline,
              size: 32,
              color: Colors.blue[700],
            ),
            const SizedBox(height: 8),
            Text(
              metric.displayLabel,
              style: TextStyle(
                fontSize: 12,
                color: Colors.grey[600],
              ),
              textAlign: TextAlign.center,
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
            ),
            const SizedBox(height: 4),
            Text(
              metric.value.toString(),
              style: const TextStyle(
                fontSize: 16,
                fontWeight: FontWeight.bold,
              ),
              textAlign: TextAlign.center,
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildBooleanCard(BuildContext context) {
    final boolValue = _parseBoolValue();
    final color = boolValue ? Colors.green : Colors.grey;

    return Card(
      elevation: 2,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(
              boolValue ? Icons.check_circle : Icons.cancel,
              size: 40,
              color: color,
            ),
            const SizedBox(height: 8),
            Text(
              metric.displayLabel,
              style: TextStyle(
                fontSize: 12,
                color: Colors.grey[600],
              ),
              textAlign: TextAlign.center,
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
            ),
            const SizedBox(height: 4),
            Text(
              boolValue ? 'BẬT' : 'TẮT',
              style: TextStyle(
                fontSize: 16,
                fontWeight: FontWeight.bold,
                color: color,
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildGenericCard(BuildContext context) {
    return Card(
      elevation: 2,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(
              Icons.sensors,
              size: 32,
              color: Colors.grey[600],
            ),
            const SizedBox(height: 8),
            Text(
              metric.displayLabel,
              style: TextStyle(
                fontSize: 12,
                color: Colors.grey[600],
              ),
              textAlign: TextAlign.center,
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
            ),
            const SizedBox(height: 4),
            Text(
              metric.displayText,
              style: const TextStyle(
                fontSize: 16,
                fontWeight: FontWeight.bold,
              ),
              textAlign: TextAlign.center,
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
            ),
          ],
        ),
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
    // Try to parse color from metric
    if (metric.color != null) {
      try {
        return Color(int.parse(metric.color!.replaceFirst('#', '0xFF')));
      } catch (e) {
        // Fallback to auto-detect
      }
    }

    // Auto-detect based on key
    final key = metric.key.toLowerCase();
    if (key.contains('temp')) return Colors.orange;
    if (key.contains('humi')) return Colors.blue;
    if (key.contains('volt')) return Colors.amber;
    if (key.contains('current')) return Colors.red;
    if (key.contains('power')) return Colors.green;
    if (key.contains('energy')) return Colors.teal;
    if (key.contains('freq')) return Colors.purple;
    if (key.contains('soil')) return Colors.brown;
    if (key.contains('light')) return Colors.yellow;

    return Colors.blueGrey;
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
