enum ControlType {
  onOff('on_off'),     // Cong tac ON/OFF
  toggle('toggle'),    // Cong tac gat 3 trang thai (LOW, MED, HIGH)
  momentary('momentary');  // Cong tac hanh trinh nhan tha (PRESS)

  final String value;
  const ControlType(this.value);

  static ControlType fromString(String? s) {
    if (s == null || s.isEmpty) return ControlType.onOff;
    return ControlType.values.firstWhere(
      (e) => e.value == s,
      orElse: () => ControlType.onOff,
    );
  }
}
