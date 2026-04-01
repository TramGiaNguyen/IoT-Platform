// app_control/lib/models/rule.dart

class Rule {
  final int id;
  final String tenRule;
  final int? phongId;
  final String conditionDeviceId;
  final List<RuleCondition> conditions;
  final List<RuleAction> actions;
  final int mucDoUuTien;
  final String trangThai; // 'enabled' or 'disabled'

  Rule({
    required this.id,
    required this.tenRule,
    this.phongId,
    required this.conditionDeviceId,
    required this.conditions,
    required this.actions,
    required this.mucDoUuTien,
    required this.trangThai,
  });

  factory Rule.fromJson(Map<String, dynamic> json) {
    return Rule(
      id: json['rule_id'] ?? json['id'],
      tenRule: json['ten_rule'] ?? '',
      phongId: json['phong_id'],
      conditionDeviceId: json['condition_device_id'] ?? '',
      conditions: (json['conditions'] as List<dynamic>?)
              ?.map((c) => RuleCondition.fromJson(c))
              .toList() ??
          [],
      actions: (json['actions'] as List<dynamic>?)
              ?.map((a) => RuleAction.fromJson(a))
              .toList() ??
          [],
      mucDoUuTien: json['muc_do_uu_tien'] ?? 1,
      trangThai: json['trang_thai'] ?? 'disabled',
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'ten_rule': tenRule,
      'phong_id': phongId,
      'condition_device_id': conditionDeviceId,
      'conditions': conditions.map((c) => c.toJson()).toList(),
      'actions': actions.map((a) => a.toJson()).toList(),
      'muc_do_uu_tien': mucDoUuTien,
      'trang_thai': trangThai,
    };
  }
}

class RuleCondition {
  final String field;
  final String operator;
  final dynamic value;

  RuleCondition({
    required this.field,
    required this.operator,
    required this.value,
  });

  factory RuleCondition.fromJson(Map<String, dynamic> json) {
    return RuleCondition(
      field: json['field'] ?? '',
      operator: json['operator'] ?? '==',
      value: json['value'],
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'field': field,
      'operator': operator,
      'value': value,
    };
  }

  String get displayText {
    String operatorText = operator;
    switch (operator) {
      case '>':
        operatorText = '>';
        break;
      case '<':
        operatorText = '<';
        break;
      case '>=':
        operatorText = '≥';
        break;
      case '<=':
        operatorText = '≤';
        break;
      case '==':
        operatorText = '=';
        break;
      case '!=':
        operatorText = '≠';
        break;
    }
    return '$field $operatorText $value';
  }
}

class RuleAction {
  final int? id;
  final String deviceId;
  final String actionCommand;
  final Map<String, dynamic>? actionParams;
  final int delaySeconds;
  final int thuTu;

  RuleAction({
    this.id,
    required this.deviceId,
    required this.actionCommand,
    this.actionParams,
    this.delaySeconds = 0,
    this.thuTu = 1,
  });

  factory RuleAction.fromJson(Map<String, dynamic> json) {
    return RuleAction(
      id: json['id'] ?? json['action_id'],
      deviceId: json['device_id'] ?? json['action_device_id'] ?? '',
      actionCommand: json['action_command'] ?? '',
      actionParams: json['action_params'] is String
          ? null
          : json['action_params'] as Map<String, dynamic>?,
      delaySeconds: json['delay_seconds'] ?? 0,
      thuTu: json['thu_tu'] ?? 1,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'device_id': deviceId,
      'action_command': actionCommand,
      'action_params': actionParams,
      'delay_seconds': delaySeconds,
      'thu_tu': thuTu,
    };
  }

  String get displayText {
    if (actionCommand == 'relay' && actionParams != null) {
      final relay = actionParams!['relay'];
      final state = actionParams!['state'];
      return 'Relay $relay: $state';
    }
    return actionCommand;
  }
}
