/// Loại widget điều khiển, mapping với chuỗi `type` trong JSON xuất ra
/// từ React Dashboard. Mỗi widget type ánh xạ tới một endpoint route
/// `/<type>/<widget_id>` được ESP generator tạo ra.
enum WidgetType {
  joystickFull('joystick_full'),
  joystickX('joystick_x'),
  joystickY('joystick_y'),
  colorPicker('color_picker'),
  touchPad('touch_pad'),
  dpad('dpad'),
  slider('slider'),
  knob('knob'),
  numberInput('number_input'),
  stepper('stepper'),
  toggle('toggle'),
  button('button'),
  checkbox('checkbox'),
  iconButton('icon_button'),
  unknown('');

  final String value;
  const WidgetType(this.value);

  static WidgetType fromString(String? raw) {
    if (raw == null) return WidgetType.unknown;
    for (final t in WidgetType.values) {
      if (t.value == raw) return t;
    }
    return WidgetType.unknown;
  }
}

/// Model của một widget điều khiển. Được parse từ JSON config.
class WidgetConfig {
  final String id;
  final WidgetType type;
  final String label;
  final int x;
  final int y;
  final int width;
  final int height;

  // Range/value
  final num min;
  final num max;
  final num value;
  final num step;
  final num onValue;
  final num offValue;
  final bool invert;
  final num deadzone;
  final num sensitivity;
  final bool autoCenter;

  // Pin config
  final String pinType; // 'virtual' | 'physical'
  final String gpioName;
  final String gpioMode;
  final num virtualPin;
  final List<int> gpio;

  // Visual config
  final String customIcon;
  final String customColor;
  final String? colorPreset;
  final String orientation; // 'both' | 'horizontal' | 'vertical'

  const WidgetConfig({
    required this.id,
    required this.type,
    required this.label,
    required this.x,
    required this.y,
    required this.width,
    required this.height,
    this.min = 0,
    this.max = 255,
    this.value = 0,
    this.step = 1,
    this.onValue = 1,
    this.offValue = 0,
    this.invert = false,
    this.deadzone = 5,
    this.sensitivity = 1.0,
    this.autoCenter = true,
    this.pinType = 'virtual',
    this.gpioName = '',
    this.gpioMode = 'output',
    this.virtualPin = 0,
    this.gpio = const [],
    this.customIcon = '💡',
    this.customColor = '#00e5ff',
    this.colorPreset,
    this.orientation = 'both',
  });

  factory WidgetConfig.fromJson(Map<String, dynamic> json) {
    return WidgetConfig(
      id: (json['id'] ?? '').toString(),
      type: WidgetType.fromString(json['type'] as String?),
      label: (json['label'] ?? json['type'] ?? '').toString(),
      x: (json['x'] as num?)?.toInt() ?? 0,
      y: (json['y'] as num?)?.toInt() ?? 0,
      width: (json['width'] as num?)?.toInt() ?? 2,
      height: (json['height'] as num?)?.toInt() ?? 2,
      min: (json['min'] as num?) ?? 0,
      max: (json['max'] as num?) ?? 255,
      value: (json['value'] as num?) ?? 0,
      step: (json['step'] as num?) ?? 1,
      onValue: (json['onValue'] as num?) ?? 1,
      offValue: (json['offValue'] as num?) ?? 0,
      invert: json['invert'] as bool? ?? false,
      deadzone: (json['deadzone'] as num?) ?? 5,
      sensitivity: (json['sensitivity'] as num?) ?? 1.0,
      autoCenter: json['autoCenter'] as bool? ?? true,
      pinType: (json['pinType'] as String?) ?? 'virtual',
      gpioName: (json['gpioName'] as String?) ?? '',
      gpioMode: (json['gpioMode'] as String?) ?? 'output',
      virtualPin: (json['virtualPin'] as num?) ?? 0,
      gpio: (json['gpio'] as List?)?.map((e) => (e as num).toInt()).toList() ?? const [],
      customIcon: (json['customIcon'] ?? json['icon'] ?? '💡').toString(),
      customColor: (json['customColor'] ?? json['color'] ?? '#00e5ff').toString(),
      colorPreset: json['colorPreset'] as String?,
      orientation: (json['orientation'] as String?) ?? 'both',
    );
  }

  Map<String, dynamic> toJson() => {
        'id': id,
        'type': type.value,
        'label': label,
        'x': x,
        'y': y,
        'width': width,
        'height': height,
        'min': min,
        'max': max,
        'value': value,
        'step': step,
        'onValue': onValue,
        'offValue': offValue,
        'invert': invert,
        'deadzone': deadzone,
        'sensitivity': sensitivity,
        'autoCenter': autoCenter,
        'pinType': pinType,
        'gpioName': gpioName,
        'gpioMode': gpioMode,
        'virtualPin': virtualPin,
        'gpio': gpio,
        'customIcon': customIcon,
        'customColor': customColor,
        'colorPreset': colorPreset,
        'orientation': orientation,
      };

  /// Trả về URL endpoint đầy đủ mà ESP đã đăng ký qua `widgetEndpoint()`.
  /// Pattern: `${baseUrl}/${type}/${sanitizedId}`
  String endpointUrl(String baseUrl) {
    final safeId = id.replaceAll(RegExp(r'[^a-zA-Z0-9_-]'), '_');
    return '$baseUrl/${type.value}/$safeId';
  }

  /// True nếu widget là dạng "momentary" (nhấn-giữ-thả): button.
  bool get isMomentary => type == WidgetType.button;

  /// True nếu widget dùng giá trị trong range min..max.
  bool get hasRange =>
      type == WidgetType.slider ||
      type == WidgetType.knob ||
      type == WidgetType.numberInput ||
      type == WidgetType.stepper;

  /// Tạo bản sao với các field được thay đổi.
  WidgetConfig copyWith({
    String? id,
    WidgetType? type,
    String? label,
    int? x,
    int? y,
    int? width,
    int? height,
    num? min,
    num? max,
    num? value,
    num? step,
    num? onValue,
    num? offValue,
    bool? invert,
    num? deadzone,
    num? sensitivity,
    bool? autoCenter,
    String? pinType,
    String? gpioName,
    String? gpioMode,
    num? virtualPin,
    List<int>? gpio,
    String? customIcon,
    String? customColor,
    String? colorPreset,
    String? orientation,
  }) =>
      WidgetConfig(
        id: id ?? this.id,
        type: type ?? this.type,
        label: label ?? this.label,
        x: x ?? this.x,
        y: y ?? this.y,
        width: width ?? this.width,
        height: height ?? this.height,
        min: min ?? this.min,
        max: max ?? this.max,
        value: value ?? this.value,
        step: step ?? this.step,
        onValue: onValue ?? this.onValue,
        offValue: offValue ?? this.offValue,
        invert: invert ?? this.invert,
        deadzone: deadzone ?? this.deadzone,
        sensitivity: sensitivity ?? this.sensitivity,
        autoCenter: autoCenter ?? this.autoCenter,
        pinType: pinType ?? this.pinType,
        gpioName: gpioName ?? this.gpioName,
        gpioMode: gpioMode ?? this.gpioMode,
        virtualPin: virtualPin ?? this.virtualPin,
        gpio: gpio ?? this.gpio,
        customIcon: customIcon ?? this.customIcon,
        customColor: customColor ?? this.customColor,
        colorPreset: colorPreset ?? this.colorPreset,
        orientation: orientation ?? this.orientation,
      );
}