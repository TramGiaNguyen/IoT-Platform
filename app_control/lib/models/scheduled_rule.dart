// app_control/lib/models/scheduled_rule.dart

class ScheduledRule {
  final int id;
  final String tenRule;
  final int? phongId;
  final String cronExpression;
  final String deviceId;
  final String actionCommand;
  final Map<String, dynamic>? actionParams;
  final String trangThai; // 'enabled' or 'disabled'
  final DateTime? lastRunAt;

  ScheduledRule({
    required this.id,
    required this.tenRule,
    this.phongId,
    required this.cronExpression,
    required this.deviceId,
    required this.actionCommand,
    this.actionParams,
    required this.trangThai,
    this.lastRunAt,
  });

  factory ScheduledRule.fromJson(Map<String, dynamic> json) {
    return ScheduledRule(
      id: json['id'],
      tenRule: json['ten_rule'] ?? '',
      phongId: json['phong_id'],
      cronExpression: json['cron_expression'] ?? '',
      deviceId: json['device_id'] ?? '',
      actionCommand: json['action_command'] ?? '',
      actionParams: json['action_params'] is String
          ? null
          : json['action_params'] as Map<String, dynamic>?,
      trangThai: json['trang_thai'] ?? 'disabled',
      lastRunAt: json['last_run_at'] != null
          ? DateTime.tryParse(json['last_run_at'])
          : null,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'ten_rule': tenRule,
      'phong_id': phongId,
      'cron_expression': cronExpression,
      'device_id': deviceId,
      'action_command': actionCommand,
      'action_params': actionParams,
      'trang_thai': trangThai,
    };
  }

  String get displaySchedule {
    // Parse cron expression to human-readable format
    // Format: "minute hour day month weekday"
    // Example: "0 8 * * *" = "Every day at 08:00"
    final parts = cronExpression.split(' ');
    if (parts.length < 5) return cronExpression;

    final minute = parts[0];
    final hour = parts[1];
    final day = parts[2];
    final month = parts[3];
    final weekday = parts[4];

    if (day == '*' && month == '*' && weekday == '*') {
      // Daily
      return 'Hàng ngày lúc $hour:${minute.padLeft(2, '0')}';
    } else if (day == '*' && month == '*' && weekday != '*') {
      // Weekly
      final days = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
      final dayNames = weekday.split(',').map((d) {
        final idx = int.tryParse(d) ?? 0;
        return days[idx % 7];
      }).join(', ');
      return 'Mỗi $dayNames lúc $hour:${minute.padLeft(2, '0')}';
    } else {
      return cronExpression;
    }
  }

  String get displayAction {
    if (actionCommand == 'relay' && actionParams != null) {
      final relay = actionParams!['relay'];
      final state = actionParams!['state'];
      return 'Relay $relay: $state';
    }
    return actionCommand;
  }
}
