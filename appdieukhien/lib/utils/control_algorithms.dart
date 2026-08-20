import 'dart:math' as math;

/// ============================================================
// CONTROL ALGORITHMS - Các bộ lọc và điều khiển cho robot/IoT
/// ============================================================

/// Exponential Moving Average (EMA) - Loc nhieu, muon me
/// 
/// Formula: new = α * current + (1-α) * previous
/// 
/// α = 0.1 → rất mượt, chậm phản ứng
/// α = 0.3 → cân bằng
/// α = 0.5 → nhanh, ít mượt
class EMA {
  double _value = 0;
  bool _initialized = false;
  
  /// Alpha: 0.0-1.0. Giá trị càng cao = càng nhanh phản ứng
  final double alpha;
  
  EMA({this.alpha = 0.3});
  
  /// Cập nhật với giá trị mới, trả về giá trị đã lọc
  double update(double current) {
    if (!_initialized) {
      _value = current;
      _initialized = true;
      return _value;
    }
    _value = alpha * current + (1 - alpha) * _value;
    return _value;
  }
  
  /// Reset về giá trị ban đầu
  void reset([double value = 0]) {
    _value = value;
    _initialized = false;
  }
  
  double get value => _value;
}

/// Deadband - Loại bỏ vùng nhiễu quanh giá trị trung tâm
/// 
/// Ví dụ: joystick ở -5 đến 5 → coi như 0
class Deadband {
  final double threshold;
  final double center;
  
  Deadband({
    this.threshold = 5,
    this.center = 0,
  });
  
  /// Trả về giá trị đã áp deadband
  double apply(double value) {
    if (value > center - threshold && value < center + threshold) {
      return center;
    }
    return value;
  }
  
  void reset() {
    // Deadband is stateless, no internal state to reset
  }
}

/// Rate Limiter - Giới hạn tốc độ thay đổi
/// 
/// Ví dụ: joystick nhảy 0→100→0→100
///        Motor chỉ thay đổi tối đa 20/giây
class RateLimiter {
  double _lastValue = 0;
  DateTime? _lastTime;
  final double maxChangePerSecond;
  final double initialValue;
  
  RateLimiter({
    this.maxChangePerSecond = 200, // Thay đổi tối đa 200 đơn vị/giây
    this.initialValue = 0,
  });
  
  /// Cập nhật với giá trị mới, trả về giá trị đã giới hạn
  double update(double target) {
    final now = DateTime.now();
    
    if (_lastTime == null) {
      _lastValue = target;
      _lastTime = now;
      return _lastValue;
    }
    
    final dt = now.difference(_lastTime!).inMilliseconds / 1000.0;
    final maxChange = maxChangePerSecond * dt;
    final diff = target - _lastValue;
    
    if (diff.abs() <= maxChange) {
      _lastValue = target;
    } else {
      // Giới hạn tốc độ
      _lastValue += diff.sign * maxChange;
    }
    
    _lastTime = now;
    return _lastValue;
  }
  
  void reset([double value = 0]) {
    _lastValue = value;
    _lastTime = null;
  }

  double get value => _lastValue;
}

/// Acceleration Limiter - Gioi han gia toc/toc do thay doi cua motor
///
/// Khac voi RateLimiter (gioi han theo thoi gian), AccelerationLimiter gioi han
/// delta moi chu ky update.
///
/// Vi du: Joystick nhay 0 -> 255
///    Thay vi: 0 -> 255 ngay lap tuc
///    Se la:   0 -> 10 -> 20 -> 30 -> ... -> 255 (moi chu ky tang 10)
///
/// Thuong dung khi can muon thay doi gia tri nhung khong bi giat.
/// VD: xe dap dien, drone throttle, servo position
class AccelerationLimiter {
  double _currentValue = 0;
  double _maxDeltaUp;     // Toc do tang toi da moi cycle
  double _maxDeltaDown;   // Toc do giam toi da moi cycle
  final double minValue;
  final double maxValue;

  AccelerationLimiter({
    double maxDeltaUp = 10,      // Mac dinh tang 10 don vi/cycle
    double maxDeltaDown = 10,    // Mac dinh giam 10 don vi/cycle
    this.minValue = 0,
    this.maxValue = 255,
  })  : _maxDeltaUp = maxDeltaUp,
        _maxDeltaDown = maxDeltaDown;

  /// Cap nhat gia tri voi gioi han gia toc
  /// target: gia tri mong muon
  /// Tra ve: gia tri da duoc gioi han
  double update(double target) {
    final clampedTarget = target.clamp(minValue, maxValue);
    final diff = clampedTarget - _currentValue;

    if (diff.abs() <= (diff > 0 ? _maxDeltaUp : _maxDeltaDown)) {
      // Thay doi nho hon gioi han -> cho phep ngay
      _currentValue = clampedTarget;
    } else {
      // Gioi han toc do thay doi
      _currentValue += diff.sign * (diff > 0 ? _maxDeltaUp : _maxDeltaDown);
      _currentValue = _currentValue.clamp(minValue, maxValue);
    }

    return _currentValue;
  }

  /// Reset ve gia tri cu the
  void reset([double value = 0]) {
    _currentValue = value.clamp(minValue, maxValue);
  }

  double get value => _currentValue;

  /// Set gioi han moi
  void setLimits({double? up, double? down}) {
    if (up != null) _maxDeltaUp = up;
    if (down != null) _maxDeltaDown = down;
  }
}

/// S-Curve Motion Profile - Motion profile tien tien
///
/// Khac voi AccelerationLimiter (gioi han delta deu), S-Curve tao ra
/// quy dao chuyen dong muot hon:
/// - Cham o dau (tranh gioi han luc lon luc nho)
/// - Nhanh o giua (dat toc do toi da)
/// - Cham o cuoi (tranh overshoot)
///
/// Su dung trong:
/// - Xe dap dien, xe tu lai
/// - Robot AGV
/// - CNC, máy in 3D
/// - Tesla, xe tu hanh
class SCurveProfile {
  double _currentPosition = 0;
  double _targetPosition = 0;
  double _currentVelocity = 0;

  // Tham so
  final double maxVelocity;    // Toc do toi da
  final double acceleration;    // Gia toc (tang toc)
  final double deceleration;    // Gia toc nguoc (giam toc)
  final double jerk;            // Jerk - toc do thay doi gia toc

  SCurveProfile({
    this.maxVelocity = 100,
    this.acceleration = 50,
    this.deceleration = 50,
    this.jerk = 100,
  });

  /// Cap nhat profile
  /// target: vi tri mong muon
  /// dt: thoi gian giua 2 lan goi (giay)
  double update(double target, {double dt = 0.016}) {
    if ((_targetPosition - target).abs() > 0.001) {
      _targetPosition = target;
    }

    final distance = _targetPosition - _currentPosition;
    final direction = distance.sign;
    final absDistance = distance.abs();

    // Tinh quang duong can de ham tot
    final decDist = (maxVelocity * maxVelocity) / (2 * deceleration);

    if (absDistance <= decDist) {
      // Dang o vung giam toc - tinh gia toc nguoc
      final targetDecel = -(direction * deceleration).clamp(-deceleration, deceleration);
      _currentVelocity += targetDecel * dt;
    } else {
      // Dang o vung tang toc hoac toc do hang
      if (_currentVelocity.abs() < maxVelocity) {
        final targetAccel = (direction * acceleration).clamp(-acceleration, acceleration);
        _currentVelocity += targetAccel * dt;
        _currentVelocity = _currentVelocity.clamp(-maxVelocity, maxVelocity);
      }
    }

    // Gioi han toc do
    _currentVelocity = _currentVelocity.clamp(-maxVelocity, maxVelocity);

    // Cap nhat vi tri
    _currentPosition += _currentVelocity * dt;

    // Kiem tra da den dich
    if ((_currentPosition - _targetPosition).abs() < 0.01 && _currentVelocity.abs() < 0.1) {
      _currentPosition = _targetPosition;
      _currentVelocity = 0;
    }

    return _currentPosition;
  }

  void reset([double position = 0]) {
    _currentPosition = position;
    _currentVelocity = 0;
    _targetPosition = position;
  }

  double get position => _currentPosition;
  double get velocity => _currentVelocity;
}

/// PID Controller - Điều khiển servo/motor chính xác
/// 
/// Khi cần servo quay tới 90°:
/// - Hiện tại 85° → chỉ tăng một ít
/// - Hiện tại 0°  → tăng rất nhanh
class PID {
  double _setpoint = 0;    // Giá trị mong muốn
  double _input = 0;        // Giá trị hiện tại (từ sensor)
  double _output = 0;       // Output đã tính
  
  // Gains
  double kp = 1.0;         // Proportional gain
  double ki = 0.0;         // Integral gain  
  double kd = 0.0;         // Derivative gain
  
  // Internal state
  double _integral = 0;
  double _lastError = 0;
  DateTime? _lastTime;
  
  // Output limits
  double outMin = double.negativeInfinity;
  double outMax = double.infinity;
  
  PID({
    this.kp = 1.0,
    this.ki = 0.0,
    this.kd = 0.0,
    this.outMin = double.negativeInfinity,
    this.outMax = double.infinity,
  });
  
  /// Đặt giá trị mong muốn (target)
  void setSetpoint(double setpoint) {
    _setpoint = setpoint;
  }
  
  /// Tính output PID
  /// - input: giá trị hiện tại từ sensor/encoder
  /// - Trả về: giá trị điều khiển (PWM, vị trí servo, v.v.)
  double compute(double input) {
    _input = input;
    final now = DateTime.now();
    
    double dt = 0;
    if (_lastTime != null) {
      dt = now.difference(_lastTime!).inMilliseconds / 1000.0;
    }
    _lastTime = now;
    
    // Tính error
    final error = _setpoint - _input;
    
    // P term
    final p = kp * error;
    
    // I term (với anti-windup)
    _integral += error * dt;
    // Giới hạn integral để tránh overshoot
    _integral = _integral.clamp(-100, 100);
    final i = ki * _integral;
    
    // D term
    double d = 0;
    if (dt > 0) {
      d = kd * (error - _lastError) / dt;
    }
    _lastError = error;
    
    // Tổng hợp output
    _output = p + i + d;
    
    // Giới hạn output
    _output = _output.clamp(outMin, outMax);
    
    return _output;
  }
  
  /// Reset PID controller
  void reset() {
    _integral = 0;
    _lastError = 0;
    _lastTime = null;
    _output = 0;
  }
  
  double get setpoint => _setpoint;
  double get input => _input;
  double get output => _output;
}

/// ============================================================
/// CONTROL PIPELINE - Ghép nối các bộ lọc cho robot
/// ============================================================

/// Pipeline cho điều khiển servo:
/// Joystick → Deadband → EMA → Steering RateLimiter → Servo
///
/// Gio no cho servo: gioi han toc do quay, tranh giat tay lai
/// Tang toc: 0° → 40° se cham dan, khong nhay
/// Giam toc: 40° → 0° se cham dan, khong dung dot ngot
class ServoControlPipeline {
  final Deadband _deadband;
  final EMA _ema;
  final RateLimiter _steeringLimiter;
  final PID _pid;

  double _currentPosition = 90; // Vị trí hiện tại của servo
  final double minOutput;
  final double maxOutput;

  ServoControlPipeline({
    double deadbandThreshold = 5,
    double emaAlpha = 0.2,        // EMA de lam muon them
    double steeringRateLimit = 30, // Toc do quay toi da (do/giay)
    this.kp = 2.0,
    this.ki = 0.1,
    this.kd = 0.5,
    this.minOutput = 0,
    this.maxOutput = 180,
  })  : _deadband = Deadband(threshold: deadbandThreshold),
        _ema = EMA(alpha: emaAlpha),
        _steeringLimiter = RateLimiter(
          maxChangePerSecond: steeringRateLimit,
          initialValue: 90,
        ),
        _pid = PID(kp: kp, ki: ki, kd: kd, outMin: minOutput, outMax: maxOutput);

  double kp;
  double ki;
  double kd;

  /// Xử lý giá trị joystick (-100..100), trả về góc servo đã điều khiển (0..180)
  double process(double joystickValue, {double? currentServoPosition}) {
    if (currentServoPosition != null) {
      _currentPosition = currentServoPosition;
    }

    // 1. Deadband - loại bỏ nhiễu nhỏ quanh 0
    final debounced = _deadband.apply(joystickValue);

    // 2. EMA - làm mượt tín hiệu
    final smoothed = _ema.update(debounced);

    // 3. Map sang range servo
    final normalized = ((smoothed + 100) / 200) * (maxOutput - minOutput) + minOutput;

    // 4. Steering Rate Limiter - gioi han toc do quay
    final limited = _steeringLimiter.update(normalized);

    // 5. PID - tinh output cho servo
    _pid.kp = kp;
    _pid.ki = ki;
    _pid.kd = kd;
    _pid.setSetpoint(limited);

    final servoAngle = _pid.compute(_currentPosition);

    return servoAngle;
  }

  void reset() {
    _deadband.reset();
    _ema.reset();
    _steeringLimiter.reset();
    _pid.reset();
  }
}

/// Pipeline cho điều khiển motor DC (xe tự hành):
/// Joystick → Deadband → EMA → AccelerationLimiter → Motor
///
/// Tang dau: Cham -> Nhanh (tranh giat luc lon)
/// Giam toc: Nhanh -> Cham (tranh dung dot ngot)
class MotorControlPipeline {
  final Deadband _deadband;
  final EMA _ema;
  final AccelerationLimiter _accelLimiter;
  bool _useSCurve;
  SCurveProfile? _sCurve;

  final double minOutput;
  final double maxOutput;

  MotorControlPipeline({
    double deadbandThreshold = 5,
    double emaAlpha = 0.3,
    double accelLimitUp = 15,      // Toc do tang toi da moi cycle
    double accelLimitDown = 20,    // Toc do giam toi da (co the nhanh hon)
    bool useSCurve = false,
    this.minOutput = 0,
    this.maxOutput = 255,
  })  : _deadband = Deadband(threshold: deadbandThreshold),
        _ema = EMA(alpha: emaAlpha),
        _accelLimiter = AccelerationLimiter(
          maxDeltaUp: accelLimitUp,
          maxDeltaDown: accelLimitDown,
          minValue: 0,
          maxValue: 255,
        ),
        _useSCurve = useSCurve {
    if (useSCurve) {
      _sCurve = SCurveProfile(
        maxVelocity: 100,
        acceleration: 50,
        deceleration: 50,
      );
    }
  }

  /// Bật/tắt S-Curve profile
  void setUseSCurve(bool use) {
    _useSCurve = use;
    if (use && _sCurve == null) {
      _sCurve = SCurveProfile(
        maxVelocity: 100,
        acceleration: 50,
        deceleration: 50,
      );
    }
  }

  /// Xử lý giá trị joystick (-100..100), trả về PWM đã lọc (0..255)
  double process(double joystickValue) {
    // 1. Deadband - loại bỏ nhiễu nhỏ quanh 0
    final debounced = _deadband.apply(joystickValue);

    // 2. EMA - làm mượt tín hiệu
    final smoothed = _ema.update(debounced);

    // 3. Map sang range output
    final normalized = ((smoothed + 100) / 200) * (maxOutput - minOutput) + minOutput;

    // 4. Acceleration Limiter hoặc S-Curve
    double limited;
    if (_useSCurve && _sCurve != null) {
      limited = _sCurve!.update(normalized);
    } else {
      limited = _accelLimiter.update(normalized);
    }

    return limited;
  }

  void reset() {
    _deadband.reset();
    _ema.reset();
    _accelLimiter.reset();
    _sCurve?.reset();
  }
}

/// ============================================================
/// UTILITY - Các hàm tiện ích
/// ============================================================

/// Chuyển đổi giá trị joystick (-100 đến 100) sang góc servo (0-180)
double joystickToServoAngle(int joystickValue, {int deadzone = 5}) {
  // Apply deadzone
  if (joystickValue.abs() < deadzone) {
    return 90; // Trung tâm
  }
  
  // Map từ -100..100 sang 0..180
  final ratio = (joystickValue + 100) / 200;
  return ratio * 180;
}

/// Map giá trị từ range này sang range khác
double mapRange(double value, double inMin, double inMax, double outMin, double outMax) {
  return (value - inMin) * (outMax - outMin) / (inMax - inMin) + outMin;
}

/// Constrain giá trị trong khoảng
double constrain(double value, double min, double max) {
  return value.clamp(min, max);
}
