// app_control/lib/models/rule.dart

import 'dart:convert';

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
    final fieldLabel = field == 'so_nguoi_trong_phong'
        ? 'So nguoi trong phong'
        : field;
    return '$fieldLabel $operatorText $value';
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
    Map<String, dynamic>? params;
    final ap = json['action_params'];
    if (ap is Map<String, dynamic>) {
      params = ap;
    } else if (ap is String && ap.trim().isNotEmpty) {
      try {
        final decoded = jsonDecode(ap);
        if (decoded is Map) {
          params = Map<String, dynamic>.from(decoded);
        }
      } catch (_) {
        params = null;
      }
    }

    return RuleAction(
      id: json['id'] ?? json['action_id'],
      deviceId: json['device_id'] ?? json['action_device_id'] ?? '',
      actionCommand: json['action_command'] ?? '',
      actionParams: params,
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
    switch (actionCommand) {
      case 'relay':
        if (actionParams != null) {
          final relay = actionParams!['relay'];
          final state = actionParams!['state'];
          if (relay != null && state != null) {
            return 'Relay $relay: $state';
          }
        }
        return 'Relay';
      case 'turn_on':
        return 'Bat thi bi';
      case 'turn_off':
        return 'Tat thi bi';
      case 'toggle':
        return 'Dao trang thai';
      case 'set_ac_temp':
        final temp = actionParams?['temperature'];
        return 'Dat nhiet do: ${temp ?? '?'}C';
      case 'set_mode':
        final mode = actionParams?['mode'];
        return 'Che do: ${mode ?? '?'}';
      case 'set_fan_speed':
        final speed = actionParams?['speed'];
        return 'Toc do quat: ${speed ?? '?'}';
      case 'set_brightness':
        final brightness = actionParams?['brightness'];
        return 'Do sang: ${brightness ?? '?'}%';
      case 'set_humidity':
        final humidity = actionParams?['humidity'];
        return 'Do am: ${humidity ?? '?'}%';
      default:
        if (actionCommand.isNotEmpty) {
          return actionCommand;
        }
        return 'Han dong';
    }
  }
}

enum ActionCommandType {
  relay,
  turnOn,
  turnOff,
  toggle,
  setAcTemp,
  setMode,
  setFanSpeed,
  setBrightness,
  setHumidity,
}

extension ActionCommandTypeExtension on ActionCommandType {
  String get command {
    switch (this) {
      case ActionCommandType.relay:
        return 'relay';
      case ActionCommandType.turnOn:
        return 'turn_on';
      case ActionCommandType.turnOff:
        return 'turn_off';
      case ActionCommandType.toggle:
        return 'toggle';
      case ActionCommandType.setAcTemp:
        return 'set_ac_temp';
      case ActionCommandType.setMode:
        return 'set_mode';
      case ActionCommandType.setFanSpeed:
        return 'set_fan_speed';
      case ActionCommandType.setBrightness:
        return 'set_brightness';
      case ActionCommandType.setHumidity:
        return 'set_humidity';
    }
  }

  String get displayName {
    switch (this) {
      case ActionCommandType.relay:
        return 'Relay';
      case ActionCommandType.turnOn:
        return 'Bat thi bi (turn_on)';
      case ActionCommandType.turnOff:
        return 'Tat thi bi (turn_off)';
      case ActionCommandType.toggle:
        return 'Dao trang thai (toggle)';
      case ActionCommandType.setAcTemp:
        return 'Dat nhiet do AC';
      case ActionCommandType.setMode:
        return 'Dat che do AC';
      case ActionCommandType.setFanSpeed:
        return 'Toc do quat';
      case ActionCommandType.setBrightness:
        return 'Do sang';
      case ActionCommandType.setHumidity:
        return 'Do am';
    }
  }

  bool get requiresParam {
    switch (this) {
      case ActionCommandType.relay:
      case ActionCommandType.turnOn:
      case ActionCommandType.turnOff:
      case ActionCommandType.toggle:
        return false;
      case ActionCommandType.setAcTemp:
      case ActionCommandType.setMode:
      case ActionCommandType.setFanSpeed:
      case ActionCommandType.setBrightness:
      case ActionCommandType.setHumidity:
        return true;
    }
  }

  Map<String, dynamic>? defaultParams() {
    switch (this) {
      case ActionCommandType.setAcTemp:
        return {'temperature': 25};
      case ActionCommandType.setMode:
        return {'mode': 'cool'};
      case ActionCommandType.setFanSpeed:
        return {'speed': 3};
      case ActionCommandType.setBrightness:
        return {'brightness': 80};
      case ActionCommandType.setHumidity:
        return {'humidity': 60};
      default:
        return null;
    }
  }

  static ActionCommandType? fromCommand(String command) {
    switch (command) {
      case 'relay':
        return ActionCommandType.relay;
      case 'turn_on':
        return ActionCommandType.turnOn;
      case 'turn_off':
        return ActionCommandType.turnOff;
      case 'toggle':
        return ActionCommandType.toggle;
      case 'set_ac_temp':
        return ActionCommandType.setAcTemp;
      case 'set_mode':
        return ActionCommandType.setMode;
      case 'set_fan_speed':
        return ActionCommandType.setFanSpeed;
      case 'set_brightness':
        return ActionCommandType.setBrightness;
      case 'set_humidity':
        return ActionCommandType.setHumidity;
      default:
        return null;
    }
  }
}
