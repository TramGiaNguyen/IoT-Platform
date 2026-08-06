import 'package:flutter/material.dart';
import 'dart:math' as math;

import '../models/widget_config.dart';
import '../services/esp_client.dart';

/// Callback khi widget thay đổi giá trị/trạng thái.
typedef WidgetCommandCallback = Future<bool> Function(
    WidgetConfig widget, Map<String, dynamic> payload);

/// Dispatcher chọn widget render theo `WidgetType`.
/// Tất cả 14 widget types đều được hỗ trợ tại đây để tránh phân mảnh file.
class WidgetFactory {
  static Widget build({
    required WidgetConfig config,
    required double cellSize, // kích thước 1 ô lưới (pixel) - dùng để scale
    required String? activeBaseUrl,
    EspClient? client,
  }) {
    // Tính size thực tế (px) dựa trên grid cell + width/height
    final widthPx = config.width * cellSize;
    final heightPx = config.height * cellSize;
    final send = client != null && activeBaseUrl != null
        ? (WidgetConfig w, Map<String, dynamic> payload) =>
            client.sendCommand(widget: w, baseUrl: activeBaseUrl!, query: payload)
        : null;

    Widget body;
    switch (config.type) {
      case WidgetType.button:
        body = _ButtonWidget(config: config, send: send);
        break;
      case WidgetType.toggle:
        body = _ToggleWidget(config: config, send: send);
        break;
      case WidgetType.checkbox:
        body = _CheckboxWidget(config: config, send: send);
        break;
      case WidgetType.iconButton:
        body = _IconButtonWidget(config: config, send: send);
        break;
      case WidgetType.slider:
        body = _SliderWidget(config: config, send: send);
        break;
      case WidgetType.knob:
        body = _KnobWidget(config: config, send: send);
        break;
      case WidgetType.numberInput:
        body = _NumberInputWidget(config: config, send: send);
        break;
      case WidgetType.stepper:
        body = _StepperWidget(config: config, send: send);
        break;
      case WidgetType.dpad:
        body = _DpadWidget(config: config, send: send);
        break;
      case WidgetType.joystickFull:
        body = _JoystickFullWidget(config: config, send: send);
        break;
      case WidgetType.joystickX:
        body = _JoystickWidget1D(config: config, axis: AxisX(), send: send);
        break;
      case WidgetType.joystickY:
        body = _JoystickWidget1D(config: config, axis: AxisY(), send: send);
        break;
      case WidgetType.colorPicker:
        body = _ColorPickerWidget(config: config, send: send);
        break;
      case WidgetType.touchPad:
        body = _TouchPadWidget(config: config, send: send);
        break;
      case WidgetType.unknown:
        body = Center(
          child: Text('Unknown: ${config.type.value}',
              style: const TextStyle(color: Colors.redAccent)),
        );
        break;
    }

    return Container(
      width: widthPx,
      height: heightPx,
      padding: const EdgeInsets.all(4),
      child: body,
    );
  }
}

// ==================== BUTTON (ON/OFF momentary) ====================

class _ButtonWidget extends StatefulWidget {
  final WidgetConfig config;
  final WidgetCommandCallback? send;
  const _ButtonWidget({required this.config, this.send});

  @override
  State<_ButtonWidget> createState() => _ButtonWidgetState();
}

class _ButtonWidgetState extends State<_ButtonWidget> {
  bool _pressed = false;

  Future<void> _onPressed(bool down) async {
    setState(() => _pressed = down);
    if (widget.send != null) {
      await widget.send!(widget.config, {
        'state': down ? widget.config.onValue : widget.config.offValue,
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTapDown: (_) => _onPressed(true),
      onTapUp: (_) => _onPressed(false),
      onTapCancel: () => _onPressed(false),
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 80),
        decoration: BoxDecoration(
          color: _pressed ? Colors.cyanAccent : const Color(0xFF0a1929),
          borderRadius: BorderRadius.circular(8),
          border: Border.all(
              color: _pressed ? Colors.cyanAccent : Colors.cyan.withOpacity(0.4),
              width: 1.5),
        ),
        alignment: Alignment.center,
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const Icon(Icons.power_settings_new, color: Colors.white, size: 24),
            const SizedBox(height: 2),
            Text(widget.config.label,
                style: const TextStyle(
                    color: Colors.white, fontSize: 11, fontWeight: FontWeight.w600),
                textAlign: TextAlign.center,
                overflow: TextOverflow.ellipsis,
                maxLines: 1),
          ],
        ),
      ),
    );
  }
}

// ==================== TOGGLE SWITCH ====================

class _ToggleWidget extends StatefulWidget {
  final WidgetConfig config;
  final WidgetCommandCallback? send;
  const _ToggleWidget({required this.config, this.send});

  @override
  State<_ToggleWidget> createState() => _ToggleWidgetState();
}

class _ToggleWidgetState extends State<_ToggleWidget> {
  late bool _on;

  @override
  void initState() {
    super.initState();
    _on = widget.config.value >= widget.config.onValue;
  }

  Future<void> _flip() async {
    setState(() => _on = !_on);
    if (widget.send != null) {
      await widget.send!(widget.config, {
        'state': _on ? widget.config.onValue : widget.config.offValue,
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: _flip,
      child: Container(
        decoration: BoxDecoration(
          color: _on ? Colors.cyanAccent.withOpacity(0.2) : const Color(0xFF0a1929),
          borderRadius: BorderRadius.circular(8),
          border: Border.all(
              color: _on ? Colors.cyanAccent : Colors.cyan.withOpacity(0.4),
              width: 1.5),
        ),
        padding: const EdgeInsets.symmetric(horizontal: 6),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Expanded(
              child: Text(widget.config.label,
                  style: const TextStyle(color: Colors.white, fontSize: 11),
                  overflow: TextOverflow.ellipsis,
                  maxLines: 1),
            ),
            Switch(
              value: _on,
              onChanged: (_) => _flip(),
              activeColor: Colors.cyanAccent,
              materialTapTargetSize: MaterialTapTargetSize.shrinkWrap,
            ),
          ],
        ),
      ),
    );
  }
}

// ==================== CHECKBOX ====================

class _CheckboxWidget extends StatefulWidget {
  final WidgetConfig config;
  final WidgetCommandCallback? send;
  const _CheckboxWidget({required this.config, this.send});

  @override
  State<_CheckboxWidget> createState() => _CheckboxWidgetState();
}

class _CheckboxWidgetState extends State<_CheckboxWidget> {
  late bool _checked;

  @override
  void initState() {
    super.initState();
    _checked = widget.config.value >= widget.config.onValue;
  }

  Future<void> _toggle() async {
    setState(() => _checked = !_checked);
    if (widget.send != null) {
      await widget.send!(widget.config, {
        'state': _checked ? widget.config.onValue : widget.config.offValue,
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: _toggle,
      child: Container(
        decoration: BoxDecoration(
          color: _checked ? Colors.cyanAccent.withOpacity(0.2) : const Color(0xFF0a1929),
          borderRadius: BorderRadius.circular(8),
          border: Border.all(
              color: _checked ? Colors.cyanAccent : Colors.cyan.withOpacity(0.4),
              width: 1.5),
        ),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(_checked ? Icons.check_box : Icons.check_box_outline_blank,
                color: _checked ? Colors.cyanAccent : Colors.white70, size: 28),
            const SizedBox(height: 2),
            Text(widget.config.label,
                style: const TextStyle(color: Colors.white, fontSize: 10),
                overflow: TextOverflow.ellipsis,
                maxLines: 1),
          ],
        ),
      ),
    );
  }
}

// ==================== ICON BUTTON ====================

class _IconButtonWidget extends StatefulWidget {
  final WidgetConfig config;
  final WidgetCommandCallback? send;
  const _IconButtonWidget({required this.config, this.send});

  @override
  State<_IconButtonWidget> createState() => _IconButtonWidgetState();
}

class _IconButtonWidgetState extends State<_IconButtonWidget> {
  bool _pressed = false;

  Future<void> _onPress(bool down) async {
    setState(() => _pressed = down);
    if (widget.send != null) {
      await widget.send!(widget.config, {
        'state': down ? widget.config.onValue : widget.config.offValue,
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTapDown: (_) => _onPress(true),
      onTapUp: (_) => _onPress(false),
      onTapCancel: () => _onPress(false),
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 80),
        decoration: BoxDecoration(
          color: _pressed ? Colors.cyanAccent : const Color(0xFF0a1929),
          borderRadius: BorderRadius.circular(8),
          border: Border.all(
              color: _pressed ? Colors.cyanAccent : Colors.cyan.withOpacity(0.4),
              width: 1.5),
        ),
        alignment: Alignment.center,
        child: Text(
          widget.config.customIcon,
          style: const TextStyle(fontSize: 28),
        ),
      ),
    );
  }
}

// ==================== SLIDER ====================

class _SliderWidget extends StatefulWidget {
  final WidgetConfig config;
  final WidgetCommandCallback? send;
  const _SliderWidget({required this.config, this.send});

  @override
  State<_SliderWidget> createState() => _SliderWidgetState();
}

class _SliderWidgetState extends State<_SliderWidget> {
  late double _value;

  @override
  void initState() {
    super.initState();
    _value = widget.config.value.toDouble().clamp(
      widget.config.min.toDouble(),
      widget.config.max.toDouble(),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: const Color(0xFF0a1929),
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: Colors.cyan.withOpacity(0.4), width: 1.5),
      ),
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 4),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Text(
            '${widget.config.label}: ${_value.toInt()}',
            style: const TextStyle(color: Colors.white, fontSize: 10),
            overflow: TextOverflow.ellipsis,
            maxLines: 1,
          ),
          Expanded(
            child: SliderTheme(
              data: SliderTheme.of(context).copyWith(
                activeTrackColor: Colors.cyanAccent,
                thumbColor: Colors.cyanAccent,
                inactiveTrackColor: Colors.white24,
              ),
              child: Slider(
                value: _value,
                min: widget.config.min.toDouble(),
                max: widget.config.max.toDouble(),
                divisions:
                    (widget.config.max - widget.config.min).toInt().abs().clamp(1, 1000),
                onChanged: (v) => setState(() => _value = v),
                onChangeEnd: (v) {
                  if (widget.send != null) {
                    widget.send!(widget.config, {'value': v.toInt()});
                  }
                },
              ),
            ),
          ),
        ],
      ),
    );
  }
}

// ==================== KNOB ====================

class _KnobWidget extends StatefulWidget {
  final WidgetConfig config;
  final WidgetCommandCallback? send;
  const _KnobWidget({required this.config, this.send});

  @override
  State<_KnobWidget> createState() => _KnobWidgetState();
}

class _KnobWidgetState extends State<_KnobWidget> {
  double _angle = 0;

  @override
  void initState() {
    super.initState();
    final range = widget.config.max.toDouble() - widget.config.min.toDouble();
    final ratio = range == 0 ? 0.0 : (widget.config.value.toDouble() - widget.config.min.toDouble()) / range;
    _angle = -135 + ratio * 270; // 270deg sweep
  }

  double _normalizeAngle(double a) {
    while (a < 0) a += 360;
    while (a >= 360) a -= 360;
    return a;
  }

  void _updateFromDrag(Offset localPos, Size size) {
    final center = Offset(size.width / 2, size.height / 2);
    final dx = localPos.dx - center.dx;
    final dy = localPos.dy - center.dy;
    var ang = math.atan2(dy, dx) * 180 / math.pi;
    ang = _normalizeAngle(ang);
    // Map 0..360 -> -135..+135 sweep
    final mapped = ang;
    setState(() => _angle = mapped);
    final range = widget.config.max.toDouble() - widget.config.min.toDouble();
    final ratio = ((mapped - (-135)) / 270).clamp(0.0, 1.0);
    final val = widget.config.min.toDouble() + ratio * range;
    if (widget.send != null) {
      widget.send!(widget.config, {'value': val.toInt()});
    }
  }

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) {
        final size = Size(constraints.maxWidth, constraints.maxHeight);
        return GestureDetector(
          onPanUpdate: (d) => _updateFromDrag(d.localPosition, size),
          child: Container(
            decoration: BoxDecoration(
              color: const Color(0xFF0a1929),
              borderRadius: BorderRadius.circular(8),
              border: Border.all(color: Colors.cyan.withOpacity(0.4), width: 1.5),
            ),
            padding: const EdgeInsets.all(4),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Expanded(
                  child: Center(
                    child: AspectRatio(
                      aspectRatio: 1,
                      child: Stack(
                        alignment: Alignment.center,
                        children: [
                          // Indicator line
                          Transform.rotate(
                            angle: _angle * math.pi / 180,
                            child: Container(
                              width: 2,
                              height: 16,
                              color: Colors.cyanAccent,
                              margin: const EdgeInsets.only(bottom: 40),
                            ),
                          ),
                          Container(
                            decoration: BoxDecoration(
                              shape: BoxShape.circle,
                              color: const Color(0xFF0a1929),
                              border: Border.all(color: Colors.cyanAccent, width: 2),
                            ),
                            child: Center(
                              child: Text(
                                _angleToValue().toInt().toString(),
                                style: const TextStyle(
                                    color: Colors.cyanAccent,
                                    fontSize: 16,
                                    fontWeight: FontWeight.bold),
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
                Text(widget.config.label,
                    style: const TextStyle(color: Colors.white70, fontSize: 10),
                    overflow: TextOverflow.ellipsis,
                    maxLines: 1),
              ],
            ),
          ),
        );
      },
    );
  }

  num _angleToValue() {
    final range = widget.config.max.toDouble() - widget.config.min.toDouble();
    final ratio = ((_angle - (-135)) / 270).clamp(0.0, 1.0);
    return widget.config.min.toDouble() + ratio * range;
  }
}

// ==================== NUMBER INPUT ====================

class _NumberInputWidget extends StatefulWidget {
  final WidgetConfig config;
  final WidgetCommandCallback? send;
  const _NumberInputWidget({required this.config, this.send});

  @override
  State<_NumberInputWidget> createState() => _NumberInputWidgetState();
}

class _NumberInputWidgetState extends State<_NumberInputWidget> {
  late num _value;

  @override
  void initState() {
    super.initState();
    _value = widget.config.value;
  }

  Future<void> _setValue(num v) async {
    final clamped = v.clamp(widget.config.min, widget.config.max);
    setState(() => _value = clamped);
    if (widget.send != null) {
      await widget.send!(widget.config, {'value': clamped.toInt()});
    }
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: const Color(0xFF0a1929),
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: Colors.cyan.withOpacity(0.4), width: 1.5),
      ),
      padding: const EdgeInsets.all(4),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Text(widget.config.label,
              style: const TextStyle(color: Colors.white70, fontSize: 10),
              overflow: TextOverflow.ellipsis,
              maxLines: 1),
          const SizedBox(height: 4),
          Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              IconButton(
                onPressed: () => _setValue(_value - widget.config.step),
                icon: const Icon(Icons.remove, color: Colors.cyanAccent),
                padding: EdgeInsets.zero,
                constraints: const BoxConstraints(minWidth: 24, minHeight: 24),
              ),
              Expanded(
                child: Center(
                  child: Text(
                    _value.toInt().toString(),
                    style: const TextStyle(
                        color: Colors.white, fontSize: 18, fontWeight: FontWeight.bold),
                  ),
                ),
              ),
              IconButton(
                onPressed: () => _setValue(_value + widget.config.step),
                icon: const Icon(Icons.add, color: Colors.cyanAccent),
                padding: EdgeInsets.zero,
                constraints: const BoxConstraints(minWidth: 24, minHeight: 24),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

// ==================== STEPPER (+/-) ====================

class _StepperWidget extends StatefulWidget {
  final WidgetConfig config;
  final WidgetCommandCallback? send;
  const _StepperWidget({required this.config, this.send});

  @override
  State<_StepperWidget> createState() => _StepperWidgetState();
}

class _StepperWidgetState extends State<_StepperWidget> {
  late num _value;

  @override
  void initState() {
    super.initState();
    _value = widget.config.value;
  }

  Future<void> _step(bool up) async {
    final next = (_value + (up ? widget.config.step : -widget.config.step))
        .clamp(widget.config.min, widget.config.max);
    setState(() => _value = next);
    if (widget.send != null) {
      await widget.send!(widget.config, {
        'value': next.toInt(),
        'dir': up ? 'UP' : 'DOWN',
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: const Color(0xFF0a1929),
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: Colors.cyan.withOpacity(0.4), width: 1.5),
      ),
      padding: const EdgeInsets.all(4),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Text(widget.config.label,
              style: const TextStyle(color: Colors.white70, fontSize: 10),
              overflow: TextOverflow.ellipsis,
              maxLines: 1),
          const SizedBox(height: 4),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceEvenly,
            children: [
              _stepBtn(Icons.remove, () => _step(false)),
              Text(_value.toInt().toString(),
                  style: const TextStyle(
                      color: Colors.white, fontSize: 16, fontWeight: FontWeight.bold)),
              _stepBtn(Icons.add, () => _step(true)),
            ],
          ),
        ],
      ),
    );
  }

  Widget _stepBtn(IconData icon, VoidCallback onPressed) {
    return GestureDetector(
      onTap: onPressed,
      child: Container(
        width: 32,
        height: 32,
        decoration: BoxDecoration(
          color: Colors.cyan.withOpacity(0.2),
          borderRadius: BorderRadius.circular(6),
          border: Border.all(color: Colors.cyanAccent),
        ),
        child: Icon(icon, color: Colors.cyanAccent, size: 18),
      ),
    );
  }
}

// ==================== D-PAD ====================

class _DpadWidget extends StatelessWidget {
  final WidgetConfig config;
  final WidgetCommandCallback? send;
  const _DpadWidget({required this.config, this.send});

  Future<void> _press(String dir) async {
    if (send != null) {
      await send!(config, {'dir': dir});
    }
  }

  Widget _btn(IconData icon, String dir) {
    return GestureDetector(
      onTapDown: (_) => _press(dir),
      child: Container(
        decoration: BoxDecoration(
          color: const Color(0xFF0a1929),
          border: Border.all(color: Colors.cyanAccent, width: 1.5),
          borderRadius: BorderRadius.circular(6),
        ),
        child: Icon(icon, color: Colors.cyanAccent, size: 20),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: const Color(0xFF06121f),
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: Colors.cyan.withOpacity(0.4), width: 1.5),
      ),
      padding: const EdgeInsets.all(4),
      child: Column(
        children: [
          Text(config.label,
              style: const TextStyle(color: Colors.white70, fontSize: 10),
              overflow: TextOverflow.ellipsis,
              maxLines: 1),
          Expanded(
            child: Column(
              children: [
                Expanded(child: _btn(Icons.keyboard_arrow_up, 'UP')),
                Expanded(
                  child: Row(
                    children: [
                      Expanded(child: _btn(Icons.keyboard_arrow_left, 'LEFT')),
                      Expanded(child: _btn(Icons.keyboard_arrow_right, 'RIGHT')),
                    ],
                  ),
                ),
                Expanded(child: _btn(Icons.keyboard_arrow_down, 'DOWN')),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

// ==================== JOYSTICK FULL (X, Y) ====================

class _JoystickFullWidget extends StatefulWidget {
  final WidgetConfig config;
  final WidgetCommandCallback? send;
  const _JoystickFullWidget({required this.config, this.send});

  @override
  State<_JoystickFullWidget> createState() => _JoystickFullWidgetState();
}

class _JoystickFullWidgetState extends State<_JoystickFullWidget> {
  Offset _knobPos = Offset.zero;

  void _update(Offset localPos, Size size) {
    final center = Offset(size.width / 2, size.height / 2);
    final maxR = math.min(size.width, size.height) / 2 - 12;
    final delta = localPos - center;
    final dist = delta.distance.clamp(0.0, maxR);
    final ang = delta.direction;
    final clamped = Offset(math.cos(ang) * dist, math.sin(ang) * dist);
    setState(() => _knobPos = clamped);

    if (widget.send != null) {
      // Map sang range min..max
      final xRatio = ((clamped.dx + maxR) / (2 * maxR)).clamp(0.0, 1.0);
      final yRatio = ((clamped.dy + maxR) / (2 * maxR)).clamp(0.0, 1.0);
      final xVal = widget.config.min.toDouble() +
          xRatio * (widget.config.max.toDouble() - widget.config.min.toDouble());
      final yVal = widget.config.min.toDouble() +
          yRatio * (widget.config.max.toDouble() - widget.config.min.toDouble());
      // Gửi 2 lệnh: X rồi Y. ESP endpoint thường là 1 endpoint /joystick_full/<id>
      widget.send!(widget.config, {'x': xVal.toInt(), 'y': yVal.toInt()});
    }
  }

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, c) {
        final size = Size(c.maxWidth, c.maxHeight);
        return GestureDetector(
          onPanUpdate: (d) => _update(d.localPosition, size),
          onPanEnd: (_) {
            setState(() => _knobPos = Offset.zero);
            if (widget.send != null) {
              final mid = ((widget.config.min.toDouble() + widget.config.max.toDouble()) / 2).toInt();
              widget.send!(widget.config, {'x': mid, 'y': mid});
            }
          },
          child: Container(
            decoration: BoxDecoration(
              color: const Color(0xFF06121f),
              borderRadius: BorderRadius.circular(50),
              border: Border.all(color: Colors.cyanAccent, width: 2),
            ),
            child: Stack(
              alignment: Alignment.center,
              children: [
                Container(
                  width: 30,
                  height: 30,
                  decoration: BoxDecoration(
                    color: Colors.cyanAccent,
                    shape: BoxShape.circle,
                    boxShadow: [
                      BoxShadow(
                          color: Colors.cyanAccent.withOpacity(0.6),
                          blurRadius: 10,
                          spreadRadius: 2),
                    ],
                  ),
                ),
                Transform.translate(
                  offset: _knobPos,
                  child: Container(
                    width: 18,
                    height: 18,
                    decoration: const BoxDecoration(
                      color: Colors.white,
                      shape: BoxShape.circle,
                    ),
                  ),
                ),
                Positioned(
                  bottom: 4,
                  child: Text(widget.config.label,
                      style: const TextStyle(color: Colors.white70, fontSize: 10)),
                ),
              ],
            ),
          ),
        );
      },
    );
  }
}

// ==================== JOYSTICK 1D (X hoặc Y) ====================

class AxisX {
  const AxisX();
}

class AxisY {
  const AxisY();
}

class _JoystickWidget1D extends StatefulWidget {
  final WidgetConfig config;
  final Object axis; // AxisX | AxisY
  final WidgetCommandCallback? send;
  const _JoystickWidget1D({
    required this.config,
    required this.axis,
    this.send,
  });

  @override
  State<_JoystickWidget1D> createState() => _JoystickWidget1DState();
}

class _JoystickWidget1DState extends State<_JoystickWidget1D> {
  double _pos = 0;

  void _update(Offset localPos, Size size) {
    final isX = widget.axis is AxisX;
    final delta = isX ? localPos.dx - size.width / 2 : localPos.dy - size.height / 2;
    final maxR = (isX ? size.width : size.height) / 2 - 8;
    final clamped = delta.clamp(-maxR, maxR);
    setState(() => _pos = clamped);

    if (widget.send != null) {
      final range = widget.config.max.toDouble() - widget.config.min.toDouble();
      final ratio = ((clamped + maxR) / (2 * maxR)).clamp(0.0, 1.0);
      final val = widget.config.min.toDouble() + ratio * range;
      widget.send!(widget.config, {'value': val.toInt()});
    }
  }

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, c) {
        final size = Size(c.maxWidth, c.maxHeight);
        final isX = widget.axis is AxisX;
        return GestureDetector(
          onPanUpdate: (d) => _update(d.localPosition, size),
          onPanEnd: (_) {
            setState(() => _pos = 0);
            if (widget.send != null) {
              final mid = ((widget.config.min.toDouble() + widget.config.max.toDouble()) / 2).toInt();
              widget.send!(widget.config, {'value': mid});
            }
          },
          child: Container(
            decoration: BoxDecoration(
              color: const Color(0xFF06121f),
              borderRadius: BorderRadius.circular(isX ? 8 : 50),
              border: Border.all(color: Colors.cyanAccent, width: 2),
            ),
            child: Stack(
              alignment: Alignment.center,
              children: [
                Container(
                  width: isX ? 50 : 6,
                  height: isX ? 6 : 50,
                  decoration: BoxDecoration(
                    color: Colors.cyanAccent.withOpacity(0.4),
                    shape: BoxShape.rectangle,
                    borderRadius: BorderRadius.circular(3),
                  ),
                ),
                Transform.translate(
                  offset: isX ? Offset(_pos, 0) : Offset(0, _pos),
                  child: Container(
                    width: 24,
                    height: 24,
                    decoration: BoxDecoration(
                      color: Colors.cyanAccent,
                      shape: BoxShape.circle,
                      boxShadow: [
                        BoxShadow(
                            color: Colors.cyanAccent.withOpacity(0.6),
                            blurRadius: 8,
                            spreadRadius: 1),
                      ],
                    ),
                  ),
                ),
              ],
            ),
          ),
        );
      },
    );
  }
}

// ==================== COLOR PICKER (RGB) ====================

class _ColorPickerWidget extends StatefulWidget {
  final WidgetConfig config;
  final WidgetCommandCallback? send;
  const _ColorPickerWidget({required this.config, this.send});

  @override
  State<_ColorPickerWidget> createState() => _ColorPickerWidgetState();
}

class _ColorPickerWidgetState extends State<_ColorPickerWidget> {
  double _r = 128, _g = 128, _b = 128;

  Future<void> _send() async {
    if (widget.send != null) {
      await widget.send!(widget.config, {
        'r': _r.toInt(),
        'g': _g.toInt(),
        'b': _b.toInt(),
      });
    }
  }

  Widget _slider(String label, double v, Color color, void Function(double) onChange) {
    return Row(
      children: [
        SizedBox(
          width: 12,
          child: Text(label,
              style: TextStyle(color: color, fontSize: 10, fontWeight: FontWeight.bold)),
        ),
        Expanded(
          child: SliderTheme(
            data: SliderTheme.of(context).copyWith(activeTrackColor: color, thumbColor: color),
            child: Slider(
              value: v,
              min: 0,
              max: 255,
              onChanged: onChange,
              onChangeEnd: (_) => _send(),
            ),
          ),
        ),
      ],
    );
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: const Color(0xFF0a1929),
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: Colors.cyan.withOpacity(0.4), width: 1.5),
      ),
      padding: const EdgeInsets.all(6),
      child: Column(
        children: [
          Container(
            height: 24,
            decoration: BoxDecoration(
              color: Color.fromARGB(255, _r.toInt(), _g.toInt(), _b.toInt()),
              borderRadius: BorderRadius.circular(4),
              border: Border.all(color: Colors.white24),
            ),
          ),
          const SizedBox(height: 4),
          Expanded(
            child: Column(
              mainAxisAlignment: MainAxisAlignment.spaceEvenly,
              children: [
                _slider('R', _r, Colors.red, (v) => setState(() => _r = v)),
                _slider('G', _g, Colors.green, (v) => setState(() => _g = v)),
                _slider('B', _b, Colors.blue, (v) => setState(() => _b = v)),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

// ==================== TOUCH PAD ====================

class _TouchPadWidget extends StatefulWidget {
  final WidgetConfig config;
  final WidgetCommandCallback? send;
  const _TouchPadWidget({required this.config, this.send});

  @override
  State<_TouchPadWidget> createState() => _TouchPadWidgetState();
}

class _TouchPadWidgetState extends State<_TouchPadWidget> {
  Offset? _pos;

  void _update(Offset p, Size size) {
    setState(() => _pos = p);
    if (widget.send != null) {
      final xRatio = (p.dx / size.width).clamp(0.0, 1.0);
      final yRatio = (p.dy / size.height).clamp(0.0, 1.0);
      final range = widget.config.max.toDouble() - widget.config.min.toDouble();
      final xVal = widget.config.min.toDouble() + xRatio * range;
      final yVal = widget.config.min.toDouble() + yRatio * range;
      widget.send!(widget.config, {'x': xVal.toInt(), 'y': yVal.toInt()});
    }
  }

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, c) {
        final size = Size(c.maxWidth, c.maxHeight);
        return GestureDetector(
          onPanUpdate: (d) => _update(d.localPosition, size),
          onTapDown: (d) => _update(d.localPosition, size),
          onPanEnd: (_) => setState(() => _pos = null),
          onTapUp: (_) => setState(() => _pos = null),
          child: Container(
            decoration: BoxDecoration(
              color: const Color(0xFF06121f),
              borderRadius: BorderRadius.circular(8),
              border: Border.all(color: Colors.cyanAccent, width: 2),
            ),
            child: Stack(
              children: [
                if (_pos != null)
                  Positioned(
                    left: (_pos!.dx - 10).clamp(0, size.width - 20),
                    top: (_pos!.dy - 10).clamp(0, size.height - 20),
                    child: Container(
                      width: 20,
                      height: 20,
                      decoration: BoxDecoration(
                        color: Colors.cyanAccent.withOpacity(0.6),
                        shape: BoxShape.circle,
                      ),
                    ),
                  ),
                Center(
                  child: Text(widget.config.label,
                      style: const TextStyle(color: Colors.white70, fontSize: 11)),
                ),
              ],
            ),
          ),
        );
      },
    );
  }
}