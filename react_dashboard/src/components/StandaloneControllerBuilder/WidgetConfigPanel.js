import React, { useState, useCallback, useEffect, useMemo } from 'react';

// Available GPIO pins for ESP32
const ESP32_PINS = [
  { value: 0, label: 'GPIO 0 (BOOT)' },
  { value: 1, label: 'GPIO 1 (TX)' },
  { value: 2, label: 'GPIO 2' },
  { value: 3, label: 'GPIO 3 (RX)' },
  { value: 4, label: 'GPIO 4' },
  { value: 5, label: 'GPIO 5' },
  { value: 12, label: 'GPIO 12 (HSPI)' },
  { value: 13, label: 'GPIO 13 (HSPI)' },
  { value: 14, label: 'GPIO 14 (HSPI)' },
  { value: 15, label: 'GPIO 15 (HSPI)' },
  { value: 16, label: 'GPIO 16 (RX2)' },
  { value: 17, label: 'GPIO 17 (TX2)' },
  { value: 18, label: 'GPIO 18 (VSPI)' },
  { value: 19, label: 'GPIO 19 (VSPI)' },
  { value: 21, label: 'GPIO 21' },
  { value: 22, label: 'GPIO 22' },
  { value: 23, label: 'GPIO 23 (VSPI)' },
  { value: 25, label: 'GPIO 25' },
  { value: 26, label: 'GPIO 26' },
  { value: 27, label: 'GPIO 27' },
  { value: 32, label: 'GPIO 32' },
  { value: 33, label: 'GPIO 33' },
  { value: 34, label: 'GPIO 34 (Input only)' },
  { value: 35, label: 'GPIO 35 (Input only)' },
  { value: 36, label: 'GPIO 36 (Input only)' },
  { value: 39, label: 'GPIO 39 (Input only)' },
];

// Available icons for icon_button widget
const ICON_OPTIONS = [
  { value: '💡', label: 'Light' },
  { value: '🔌', label: 'Plug' },
  { value: '📺', label: 'TV' },
  { value: '🌀', label: 'Fan' },
  { value: '❄️', label: 'AC' },
  { value: '🔔', label: 'Bell' },
  { value: '🚪', label: 'Door' },
  { value: '🚿', label: 'Shower' },
  { value: '🔒', label: 'Lock' },
  { value: '🔓', label: 'Unlock' },
  { value: '🎵', label: 'Music' },
  { value: '📻', label: 'Radio' },
  { value: '⏰', label: 'Clock' },
  { value: '🔘', label: 'Button' },
  { value: '⚡', label: 'Power' },
  { value: '🌡️', label: 'Temp' },
  { value: '💧', label: 'Water' },
  { value: '🌱', label: 'Plant' },
  { value: '🚗', label: 'Car' },
  { value: '🏠', label: 'Home' },
];

// Color presets for color_picker and widget styling
const COLOR_PRESETS = [
  '#ef4444', '#f97316', '#eab308', '#22c55e',
  '#14b8a6', '#3b82f6', '#8b5cf6', '#ec4899',
  '#00e5ff', '#ffffff', '#6b7280', '#000000',
];

// GPIO modes
const GPIO_MODES = [
  { value: 'output', label: 'Output (Relay/LED)' },
  { value: 'input', label: 'Input (Button/Sensor)' },
  { value: 'pwm', label: 'PWM (Speed/Brightness)' },
];

// Orientation options for joystick
const ORIENTATION_OPTIONS = [
  { value: 'both', label: 'Cả hai (X, Y)' },
  { value: 'horizontal', label: 'Ngang (Trái-Phải)' },
  { value: 'vertical', label: 'Dọc (Lên-Xuống)' },
];

// Pin types: physical (GPIO thật) hoặc virtual (chân ảo)
const PIN_TYPES = [
  { value: 'physical', label: 'Physical Pin (GPIO thật)' },
  { value: 'virtual', label: 'Virtual Pin (Chân ảo)' },
];

// Available virtual pins (VP0 - VP31)
const VIRTUAL_PINS = Array.from({ length: 32 }, (_, i) => ({
  value: i,
  label: `VP${i}`,
}));

// Widget-specific GPIO pin labels
const WIDGET_PIN_LABELS = {
  joystick_full: ['X Axis', 'Y Axis'],
  joystick_x: ['X Axis'],
  joystick_y: ['Y Axis'],
  color_picker: ['Red Pin', 'Green Pin', 'Blue Pin'],
  dpad: ['UP', 'DOWN', 'LEFT', 'RIGHT'],
  slider: ['Value'],
  knob: ['Value'],
  number_input: ['Value'],
  stepper: ['Step +', 'Step -'],
  toggle: ['State'],
  button: ['State'],
  checkbox: ['State'],
  icon_button: ['State'],
  touch_pad: ['Touch'],
};

export default function WidgetConfigPanel({ ctrl, onUpdate, onDelete, allControls }) {
  const [activeTab, setActiveTab] = useState('gpio');
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState(null);

  // Local state for editing
  const [localCtrl, setLocalCtrl] = useState({
    label: ctrl.label || '',
    pinType: ctrl.pinType || 'virtual', // Mặc định là virtual pin
    gpioName: ctrl.gpioName || generateDefaultGpioName(ctrl),
    gpioMode: ctrl.gpioMode || 'output',
    gpio: ctrl.gpio || [...(ctrl.gpio || [])],
    virtualPin: ctrl.virtualPin ?? 0, // Virtual pin index (0-31)
    min: ctrl.min ?? 0,
    max: ctrl.max ?? 255,
    step: ctrl.step ?? 1,
    onValue: ctrl.onValue ?? 1,
    offValue: ctrl.offValue ?? 0,
    invert: ctrl.invert ?? false,
    deadzone: ctrl.deadzone ?? 5,
    sensitivity: ctrl.sensitivity ?? 1.0,
    customIcon: ctrl.customIcon || ctrl.icon || '💡',
    customColor: ctrl.customColor || '#00e5ff',
    colorPreset: ctrl.colorPreset || null,
    orientation: ctrl.orientation || (ctrl.type === 'joystick_full' ? 'both' : (ctrl.type === 'joystick_y' ? 'vertical' : 'horizontal')),
    autoCenter: ctrl.autoCenter ?? true,
  });

  // Generate default GPIO name
  function generateDefaultGpioName(ctrl) {
    const type = ctrl.type.replace(/_/g, '_');
    return `${type}_${Date.now() % 1000}`;
  }

  // Sync localCtrl khi prop ctrl thay đổi (khi chọn widget khác)
  useEffect(() => {
    setActiveTab('gpio'); // Reset tab về GPIO
    setLocalCtrl({
      label: ctrl.label || '',
      pinType: ctrl.pinType || 'virtual',
      gpioName: ctrl.gpioName || generateDefaultGpioName(ctrl),
      gpioMode: ctrl.gpioMode || 'output',
      gpio: ctrl.gpio || [...(ctrl.gpio || [])],
      virtualPin: ctrl.virtualPin ?? 0,
      min: ctrl.min ?? 0,
      max: ctrl.max ?? 255,
      step: ctrl.step ?? 1,
      onValue: ctrl.onValue ?? 1,
      offValue: ctrl.offValue ?? 0,
      invert: ctrl.invert ?? false,
      deadzone: ctrl.deadzone ?? 5,
      sensitivity: ctrl.sensitivity ?? 1.0,
      customIcon: ctrl.customIcon || ctrl.icon || '💡',
      customColor: ctrl.customColor || '#00e5ff',
      colorPreset: ctrl.colorPreset || null,
      orientation: ctrl.orientation || (ctrl.type === 'joystick_full' ? 'both' : (ctrl.type === 'joystick_y' ? 'vertical' : 'horizontal')),
      autoCenter: ctrl.autoCenter ?? true,
    });
  }, [ctrl.id]); // Chỉ sync khi widget thay đổi

  // Detect GPIO/VP conflicts
  const gpioConflicts = useMemo(() => {
    const conflicts = [];
    const usedPins = new Map();

    allControls.forEach((c) => {
      if (c.id === ctrl.id || !c.gpio) return;
      c.gpio.forEach((pin, idx) => {
        if (usedPins.has(pin)) {
          const existing = usedPins.get(pin);
          conflicts.push({
            pin,
            widget1: existing,
            widget2: c.label,
          });
        } else {
          usedPins.set(pin, c.label);
        }
      });
    });

    // Check current widget against itself
    localCtrl.gpio.forEach((pin, idx) => {
      const count = allControls.filter((c) => c.id !== ctrl.id && c.gpio?.includes(pin)).length;
      if (count > 0) {
        const otherWidgets = allControls.filter((c) => c.id !== ctrl.id && c.gpio?.includes(pin));
        conflicts.push({
          pin,
          widget1: ctrl.label,
          widget2: otherWidgets.map((w) => w.label).join(', '),
        });
      }
    });

    return conflicts;
  }, [allControls, ctrl.id, ctrl.label, localCtrl.gpio.join(',')]);

  // Detect virtual pin conflicts
  const virtualPinConflicts = useMemo(() => {
    if (localCtrl.pinType !== 'virtual') return [];

    const conflicts = [];
    const currentVP = localCtrl.virtualPin;
    const isJoystickFull = ctrl.type === 'joystick_full';
    const requiredVPs = isJoystickFull ? [currentVP, currentVP + 1] : [currentVP];

    allControls.forEach((c) => {
      if (c.id === ctrl.id || c.pinType !== 'virtual') return;

      const otherVP = c.virtualPin;
      const otherIsJoystickFull = c.type === 'joystick_full';
      const otherRequiredVPs = otherIsJoystickFull ? [otherVP, otherVP + 1] : [otherVP];

      // Check if any VP overlaps
      requiredVPs.forEach((vp) => {
        otherRequiredVPs.forEach((otherVp) => {
          if (vp === otherVp) {
            conflicts.push({
              pin: vp,
              widget1: ctrl.label,
              widget2: c.label,
            });
          }
        });
      });
    });
    return conflicts;
  }, [allControls, ctrl.id, ctrl.label, localCtrl.pinType, localCtrl.virtualPin, ctrl.type]);

  const handleChange = useCallback((field, value) => {
    setLocalCtrl((prev) => ({ ...prev, [field]: value }));
  }, []);

  const handleGpioChange = useCallback((index, value) => {
    setLocalCtrl((prev) => {
      const newGpio = [...prev.gpio];
      newGpio[index] = parseInt(value) || 0;
      return { ...prev, gpio: newGpio };
    });
  }, []);

  const handleVirtualPinChange = useCallback((value) => {
    setLocalCtrl((prev) => ({ ...prev, virtualPin: parseInt(value) || 0 }));
  }, []);

  const handlePinTypeChange = useCallback((value) => {
    setLocalCtrl((prev) => ({ ...prev, pinType: value }));
  }, []);

  const handleSave = useCallback(async () => {
    setSaving(true);
    setSaveMsg(null);
    try {
      await Promise.resolve(onUpdate(ctrl.id, localCtrl));
      setSaveMsg({ type: 'success', text: 'Đã lưu widget thành công!' });
      setTimeout(() => setSaveMsg(null), 2500);
    } catch (err) {
      setSaveMsg({ type: 'error', text: 'Lưu thất bại: ' + (err?.message || 'Lỗi không xác định') });
    } finally {
      setSaving(false);
    }
  }, [ctrl.id, localCtrl, onUpdate]);

  const pinLabels = WIDGET_PIN_LABELS[ctrl.type] || ['Pin'];

  return (
    <div className="sc-config-panel">
      {/* Header */}
      <div className="sc-config-header">
        <div className="sc-config-title">
          <span className="sc-config-icon">{localCtrl.customIcon || ctrl.icon}</span>
          <span className="sc-config-name">{ctrl.type.replace(/_/g, ' ')}</span>
        </div>
        <button className="sc-config-close" onClick={onDelete} title="Xóa widget">
          ×
        </button>
      </div>

      {/* Tabs */}
      <div className="sc-config-tabs">
        <button
          className={`sc-config-tab ${activeTab === 'gpio' ? 'active' : ''}`}
          onClick={() => setActiveTab('gpio')}
        >
          GPIO
        </button>
        <button
          className={`sc-config-tab ${activeTab === 'options' ? 'active' : ''}`}
          onClick={() => setActiveTab('options')}
        >
          Tùy chọn
        </button>
        <button
          className={`sc-config-tab ${activeTab === 'style' ? 'active' : ''}`}
          onClick={() => setActiveTab('style')}
        >
          Giao diện
        </button>
      </div>

      {/* Tab Content */}
      <div className="sc-config-content">
        {/* GPIO Tab */}
        {activeTab === 'gpio' && (
          <div className="sc-config-section">
            {/* Label */}
            <div className="sc-config-field">
              <label>Tên hiển thị</label>
              <input
                type="text"
                value={localCtrl.label}
                onChange={(e) => handleChange('label', e.target.value)}
                placeholder="VD: Đèn phòng khách"
                className="sc-config-input"
              />
            </div>

            {/* GPIO Name (for code generation) */}
            <div className="sc-config-field">
              <label>Tên GPIO (code)</label>
              <input
                type="text"
                value={localCtrl.gpioName}
                onChange={(e) => handleChange('gpioName', e.target.value.replace(/[^a-zA-Z0-9_]/g, '_'))}
                placeholder="VD: relay_1"
                className="sc-config-input sc-config-mono"
              />
              <span className="sc-config-hint">Dùng trong code Arduino</span>
            </div>

            {/* Pin Type Selector */}
            <div className="sc-config-field">
              <label>Loại Pin</label>
              <select
                value={localCtrl.pinType}
                onChange={(e) => handlePinTypeChange(e.target.value)}
                className="sc-config-select"
              >
                {PIN_TYPES.map((pt) => (
                  <option key={pt.value} value={pt.value}>
                    {pt.label}
                  </option>
                ))}
              </select>
              <span className="sc-config-hint">
                {localCtrl.pinType === 'virtual'
                  ? 'Virtual Pin: Map với chân thật trong code ESP'
                  : 'Physical Pin: Gán trực tiếp GPIO'}
              </span>
            </div>

            {/* Virtual Pin Selection */}
            {localCtrl.pinType === 'virtual' && (
              <div className="sc-config-field">
                <label>Virtual Pin</label>
                <select
                  value={localCtrl.virtualPin}
                  onChange={(e) => handleVirtualPinChange(e.target.value)}
                  className="sc-config-select"
                >
                  {VIRTUAL_PINS.map((vp) => (
                    <option key={vp.value} value={vp.value}>
                      {vp.label}
                    </option>
                  ))}
                </select>
                <span className="sc-config-hint">
                  {ctrl.type === 'joystick_full'
                    ? `VP${localCtrl.virtualPin} (X) + VP${localCtrl.virtualPin + 1} (Y) sẽ được map sang chân thật`
                    : `VP${localCtrl.virtualPin} sẽ được map sang chân thật trong code ESP`}
                </span>
              </div>
            )}

            {/* Orientation - only for joystick types */}
            {(ctrl.type === 'joystick_x' || ctrl.type === 'joystick_y' || ctrl.type === 'joystick_full') && (
              <div className="sc-config-field">
                <label>Hướng</label>
                <select
                  value={localCtrl.orientation || (ctrl.type === 'joystick_full' ? 'both' : 'horizontal')}
                  onChange={(e) => handleChange('orientation', e.target.value)}
                  className="sc-config-select"
                >
                  {ORIENTATION_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* GPIO Mode - hidden for joystick types */}
            {ctrl.type !== 'joystick_x' && ctrl.type !== 'joystick_y' && ctrl.type !== 'joystick_full' && (
              <div className="sc-config-field">
                <label>Chế độ</label>
                <select
                  value={localCtrl.gpioMode}
                  onChange={(e) => handleChange('gpioMode', e.target.value)}
                  className="sc-config-select"
                >
                  {GPIO_MODES.map((mode) => (
                    <option key={mode.value} value={mode.value}>
                      {mode.label}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Physical GPIO Pin Mapping - chỉ hiện khi chọn physical */}
            {localCtrl.pinType === 'physical' && (
              <div className="sc-config-field">
                <label>Pin Mapping</label>
                <div className="sc-config-pins">
                  {localCtrl.gpio.map((pin, idx) => (
                    <div key={idx} className="sc-config-pin-row">
                      <span className="sc-config-pin-label">
                        {pinLabels[idx] || `Pin ${idx + 1}`}
                      </span>
                      <select
                        value={pin}
                        onChange={(e) => handleGpioChange(idx, e.target.value)}
                        className="sc-config-select"
                      >
                        <option value="">-- Chọn Pin --</option>
                        {ESP32_PINS.map((p) => (
                          <option key={p.value} value={p.value}>
                            {p.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* GPIO Conflict Warning */}
            {gpioConflicts.length > 0 && localCtrl.pinType === 'physical' && (
              <div className="sc-config-warning">
                <span className="sc-config-warning-icon">⚠️</span>
                <div className="sc-config-warning-text">
                  <strong>Pin trùng lặp:</strong>
                  {gpioConflicts.map((conf, i) => (
                    <div key={i}>
                      GPIO {conf.pin} đã dùng bởi "{conf.widget2}"
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Virtual Pin Conflict Warning */}
            {virtualPinConflicts.length > 0 && localCtrl.pinType === 'virtual' && (
              <div className="sc-config-warning">
                <span className="sc-config-warning-icon">⚠️</span>
                <div className="sc-config-warning-text">
                  <strong>Virtual Pin trùng lặp:</strong>
                  {virtualPinConflicts.map((conf, i) => (
                    <div key={i}>
                      VP{conf.pin} đã dùng bởi "{conf.widget2}"
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* On/Off Values */}
            {(ctrl.type === 'button' || ctrl.type === 'toggle' || ctrl.type === 'checkbox' || ctrl.type === 'icon_button') && (
              <div className="sc-config-field-group">
                <div className="sc-config-field">
                  <label>Giá trị ON</label>
                  <input
                    type="number"
                    value={localCtrl.onValue}
                    onChange={(e) => handleChange('onValue', parseInt(e.target.value) || 0)}
                    className="sc-config-input sc-config-small"
                  />
                </div>
                <div className="sc-config-field">
                  <label>Giá trị OFF</label>
                  <input
                    type="number"
                    value={localCtrl.offValue}
                    onChange={(e) => handleChange('offValue', parseInt(e.target.value) || 0)}
                    className="sc-config-input sc-config-small"
                  />
                </div>
              </div>
            )}
          </div>
        )}

        {/* Options Tab */}
        {activeTab === 'options' && (
          <div className="sc-config-section">
            {/* Min/Max/Step for numeric widgets */}
            {(ctrl.type === 'slider' || ctrl.type === 'knob' || ctrl.type === 'number_input') && (
              <>
                <div className="sc-config-field-group">
                  <div className="sc-config-field">
                    <label>Min</label>
                    <input
                      type="number"
                      value={localCtrl.min}
                      onChange={(e) => handleChange('min', parseFloat(e.target.value) || 0)}
                      className="sc-config-input sc-config-small"
                    />
                  </div>
                  <div className="sc-config-field">
                    <label>Max</label>
                    <input
                      type="number"
                      value={localCtrl.max}
                      onChange={(e) => handleChange('max', parseFloat(e.target.value) || 255)}
                      className="sc-config-input sc-config-small"
                    />
                  </div>
                  <div className="sc-config-field">
                    <label>Step</label>
                    <input
                      type="number"
                      value={localCtrl.step}
                      onChange={(e) => handleChange('step', parseFloat(e.target.value) || 1)}
                      min="0.01"
                      step="0.1"
                      className="sc-config-input sc-config-small"
                    />
                  </div>
                </div>

                <div className="sc-config-field">
                  <label className="sc-config-checkbox-label">
                    <input
                      type="checkbox"
                      checked={localCtrl.invert}
                      onChange={(e) => handleChange('invert', e.target.checked)}
                    />
                    Đảo ngược giá trị
                  </label>
                  <span className="sc-config-hint">Giá trị cao = thấp, thấp = cao</span>
                </div>
              </>
            )}

            {/* Joystick specific options */}
            {(ctrl.type === 'joystick_full' || ctrl.type === 'joystick_x' || ctrl.type === 'joystick_y') && (
              <>
                <div className="sc-config-field">
                  <label>Deadzone</label>
                  <input
                    type="number"
                    value={localCtrl.deadzone}
                    onChange={(e) => handleChange('deadzone', parseInt(e.target.value) || 0)}
                    min="0"
                    max="50"
                    className="sc-config-input sc-config-small"
                  />
                  <span className="sc-config-hint">Vùng trung tâm không nhạy (0-50)</span>
                </div>

                <div className="sc-config-field">
                  <label>Độ nhạy</label>
                  <input
                    type="number"
                    value={localCtrl.sensitivity}
                    onChange={(e) => handleChange('sensitivity', parseFloat(e.target.value) || 1)}
                    min="0.1"
                    max="5"
                    step="0.1"
                    className="sc-config-input sc-config-small"
                  />
                  <span className="sc-config-hint">Hệ số nhân độ nhạy (0.1 - 5)</span>
                </div>

                {/* Auto-Center option - only for joystick_x and joystick_y */}
                {(ctrl.type === 'joystick_x' || ctrl.type === 'joystick_y') && (
                  <div className="sc-config-field">
                    <label className="sc-config-checkbox-label">
                      <input
                        type="checkbox"
                        checked={localCtrl.autoCenter !== false}
                        onChange={(e) => handleChange('autoCenter', e.target.checked)}
                      />
                      Tự động trở về giữa
                    </label>
                    <span className="sc-config-hint">
                      Bật: Trở về vị trí giữa khi thả. Tắt: Giữ nguyên vị trí.
                    </span>
                  </div>
                )}

                {/* Min/Max options - only for joystick_full */}
                {ctrl.type === 'joystick_full' && (
                  <div className="sc-config-field-group">
                    <div className="sc-config-field">
                      <label>Min</label>
                      <input
                        type="number"
                        value={localCtrl.min ?? 0}
                        onChange={(e) => handleChange('min', parseInt(e.target.value) || 0)}
                        className="sc-config-input sc-config-small"
                      />
                    </div>
                    <div className="sc-config-field">
                      <label>Max</label>
                      <input
                        type="number"
                        value={localCtrl.max ?? 255}
                        onChange={(e) => handleChange('max', parseInt(e.target.value) || 255)}
                        className="sc-config-input sc-config-small"
                      />
                    </div>
                  </div>
                )}
              </>
            )}

            {/* Orientation option - for all widgets */}
            <div className="sc-config-field">
              <label>Hướng hiển thị</label>
              <select
                value={localCtrl.orientation || 'vertical'}
                onChange={(e) => handleChange('orientation', e.target.value)}
                className="sc-config-select"
              >
                <option value="vertical">Thẳng đứng</option>
                <option value="horizontal">Ngang</option>
              </select>
              <span className="sc-config-hint">
                Thay đổi hướng hiển thị widget
              </span>
            </div>

            {/* Color Picker presets */}
            {ctrl.type === 'color_picker' && (
              <div className="sc-config-field">
                <label>Preset Colors</label>
                <div className="sc-config-color-presets">
                  {COLOR_PRESETS.map((color) => (
                    <button
                      key={color}
                      className={`sc-config-color-preset ${localCtrl.colorPreset === color ? 'active' : ''}`}
                      style={{ backgroundColor: color }}
                      onClick={() => {
                        handleChange('colorPreset', color);
                        // Parse RGB from hex
                        const r = parseInt(color.slice(1, 3), 16);
                        const g = parseInt(color.slice(3, 5), 16);
                        const b = parseInt(color.slice(5, 7), 16);
                        setLocalCtrl((prev) => ({
                          ...prev,
                          colorPreset: color,
                          customColor: color,
                        }));
                      }}
                      title={color}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Stepper options */}
            {ctrl.type === 'stepper' && (
              <>
                <div className="sc-config-field-group">
                  <div className="sc-config-field">
                    <label>Min</label>
                    <input
                      type="number"
                      value={localCtrl.min}
                      onChange={(e) => handleChange('min', parseInt(e.target.value) || 0)}
                      className="sc-config-input sc-config-small"
                    />
                  </div>
                  <div className="sc-config-field">
                    <label>Max</label>
                    <input
                      type="number"
                      value={localCtrl.max}
                      onChange={(e) => handleChange('max', parseInt(e.target.value) || 100)}
                      className="sc-config-input sc-config-small"
                    />
                  </div>
                  <div className="sc-config-field">
                    <label>Bước</label>
                    <input
                      type="number"
                      value={localCtrl.step}
                      onChange={(e) => handleChange('step', parseInt(e.target.value) || 1)}
                      min="1"
                      className="sc-config-input sc-config-small"
                    />
                  </div>
                </div>
              </>
            )}

            {/* D-pad options */}
            {ctrl.type === 'dpad' && (
              <>
                <div className="sc-config-field">
                  <label className="sc-config-info">
                    D-pad điều khiển 4 hướng qua 4 GPIO pins.
                    Mỗi nút nhấn sẽ gửi HIGH tới pin tương ứng.
                  </label>
                </div>
                <div className="sc-config-field-group">
                  <div className="sc-config-field">
                    <label>Min</label>
                    <input
                      type="number"
                      value={localCtrl.min ?? 0}
                      onChange={(e) => handleChange('min', parseInt(e.target.value) || 0)}
                      className="sc-config-input sc-config-small"
                    />
                  </div>
                  <div className="sc-config-field">
                    <label>Max</label>
                    <input
                      type="number"
                      value={localCtrl.max ?? 1}
                      onChange={(e) => handleChange('max', parseInt(e.target.value) || 1)}
                      className="sc-config-input sc-config-small"
                    />
                  </div>
                </div>
              </>
            )}

            {/* Touch pad info */}
            {ctrl.type === 'touch_pad' && (
              <div className="sc-config-field">
                <label className="sc-config-info">
                  Touch pad gửi giá trị 1 khi chạm, 0 khi thả.
                  Sử dụng chế độ Input.
                </label>
              </div>
            )}
          </div>
        )}

        {/* Style Tab */}
        {activeTab === 'style' && (
          <div className="sc-config-section">
            {/* Icon Selection for icon_button */}
            {ctrl.type === 'icon_button' && (
              <div className="sc-config-field">
                <label>Icon</label>
                <div className="sc-config-icons">
                  {ICON_OPTIONS.map((icon) => (
                    <button
                      key={icon.value}
                      className={`sc-config-icon-btn ${localCtrl.customIcon === icon.value ? 'active' : ''}`}
                      onClick={() => handleChange('customIcon', icon.value)}
                      title={icon.label}
                    >
                      {icon.value}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Widget Color */}
            <div className="sc-config-field">
              <label>Màu widget</label>
              <div className="sc-config-color-row">
                <input
                  type="color"
                  value={localCtrl.customColor}
                  onChange={(e) => handleChange('customColor', e.target.value)}
                  className="sc-config-color-input"
                />
                <input
                  type="text"
                  value={localCtrl.customColor}
                  onChange={(e) => handleChange('customColor', e.target.value)}
                  className="sc-config-input sc-config-small sc-config-mono"
                  placeholder="#00e5ff"
                />
              </div>
              <div className="sc-config-color-presets">
                {COLOR_PRESETS.map((color) => (
                  <button
                    key={color}
                    className={`sc-config-color-preset ${localCtrl.customColor === color ? 'active' : ''}`}
                    style={{ backgroundColor: color }}
                    onClick={() => handleChange('customColor', color)}
                    title={color}
                  />
                ))}
              </div>
            </div>

            {/* Display preview */}
            <div className="sc-config-preview">
              <label>Xem trước</label>
              <div
                className="sc-config-preview-box"
                style={{
                  borderColor: localCtrl.customColor,
                  backgroundColor: `${localCtrl.customColor}20`,
                }}
              >
                <span className="sc-config-preview-icon">
                  {localCtrl.customIcon || ctrl.icon}
                </span>
                <span className="sc-config-preview-label">
                  {localCtrl.label || ctrl.label}
                </span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="sc-config-footer">
        {saveMsg && (
          <span className={`sc-config-msg ${saveMsg.type}`}>
            {saveMsg.type === 'success' ? '✓' : '⚠'} {saveMsg.text}
          </span>
        )}
        <button
          className="sc-btn sc-btn-primary"
          onClick={handleSave}
          disabled={saving}
        >
          {saving ? 'Đang lưu...' : 'Lưu'}
        </button>
      </div>
    </div>
  );
}
