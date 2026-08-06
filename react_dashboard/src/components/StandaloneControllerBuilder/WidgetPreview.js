import React, { useState, useRef, useCallback, useEffect, useMemo, memo } from 'react';

/**
 * WidgetPreview - Live preview components for the Standalone Controller Builder canvas
 * Mỗi widget render đúng UI thật nhưng tương tác chỉ update local state, không gửi API.
 * Khi Save/Preview thì standaloneHtmlGenerator.js sinh ra HTML có gọi sendCommand thật.
 */

const CELL_SIZE = 40;
const MAX_RADIUS = 22; // joystick knob radius
const KNOB_SIZE = 12; // inner dot

/* ===== Helper function for Joystick axis style ===== */
const axisStyle = (orientation) => ({
  position: 'absolute',
  ...(orientation === 'horizontal'
    ? { top: '50%', left: '10%', right: '10%', height: '1px' }
    : { left: '50%', top: '10%', bottom: '10%', width: '1px' }),
  background: 'var(--iot-outline)',
  opacity: 0.5,
  pointerEvents: 'none',
});

/* ===== ColorSlider helper ===== */
function ColorSlider({ label, value, onChange, color }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
      <span style={{ fontSize: '9px', color, fontWeight: 700, width: '10px' }}>{label}</span>
      <input
        type="range"
        min="0"
        max="255"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
        className="sc-wp-range sc-wp-range-rgb"
        style={{ flex: 1, height: '6px', cursor: 'pointer' }}
      />
    </div>
  );
}

/* ===== Individual preview components ===== */

/* ----- JoystickPreview ----- */
const JoystickPreview = memo(function JoystickPreview({ ctrl, wrapperStyle, pos, setPos, width, height, fullJoystick, onClick }) {
  const containerRef = useRef(null);
  const [dragging, setDragging] = useState(false);

  const isFull = !!fullJoystick;
  // Joystick_full respects ctrl.orientation: both=circle, horizontal=wide track, vertical=tall track
  // Single-axis joysticks (joystick_x / joystick_y) are handled by SingleAxisPreview, not here.
  const joystickOrient = isFull ? (ctrl.orientation || 'both') : 'both';
  // Size limit so joystick fits in widget area
  const maxBoxSize = Math.min(width * CELL_SIZE, height * CELL_SIZE) - 16;
  const boxSize = Math.max(80, Math.min(180, maxBoxSize));

  // Track dimensions per orientation
  const trackDims = joystickOrient === 'horizontal'
    ? { w: Math.max(160, boxSize + 80), h: Math.max(60, Math.round(boxSize * 0.45)), radius: '32px' }
    : joystickOrient === 'vertical'
    ? { w: Math.max(60, Math.round(boxSize * 0.45)), h: Math.max(160, boxSize + 80), radius: '32px' }
    : { w: boxSize, h: boxSize, radius: '50%' };

  const updatePos = useCallback(
    (clientX, clientY) => {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      let dx = clientX - centerX;
      let dy = clientY - centerY;
      // Half-track size per axis depending on orientation
      const halfW = Math.max(20, rect.width / 2 - MAX_RADIUS - 4);
      const halfH = Math.max(20, rect.height / 2 - MAX_RADIUS - 4);

      if (joystickOrient === 'horizontal') {
        dy = 0;
        if (dx > halfW) dx = halfW;
        if (dx < -halfW) dx = -halfW;
      } else if (joystickOrient === 'vertical') {
        dx = 0;
        if (dy > halfH) dy = halfH;
        if (dy < -halfH) dy = -halfH;
      } else {
        // Both: clamp inside ellipse
        if (dx > halfW) dx = halfW;
        if (dx < -halfW) dx = -halfW;
        if (dy > halfH) dy = halfH;
        if (dy < -halfH) dy = -halfH;
      }

      // Convert to 0-100 percentage relative to each axis
      const xPct = ((dx + halfW) / (halfW * 2)) * 100;
      const yPct = ((dy + halfH) / (halfH * 2)) * 100;
      setPos({ x: xPct, y: yPct });
    },
    [joystickOrient, setPos]
  );

  const onDown = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragging(true);
    const point = e.touches ? e.touches[0] : e;
    updatePos(point.clientX, point.clientY);
  };

  const onMove = useCallback(
    (e) => {
      if (!dragging) return;
      const point = e.touches ? e.touches[0] : e;
      updatePos(point.clientX, point.clientY);
    },
    [dragging, updatePos]
  );

  const onUp = useCallback(() => {
    if (!dragging) return;
    setDragging(false);
    setPos({ x: 50, y: 50 });
  }, [dragging, setPos]);

  useEffect(() => {
    if (!dragging) return;
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    window.addEventListener('touchmove', onMove, { passive: false });
    window.addEventListener('touchend', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onUp);
    };
  }, [dragging, onMove, onUp]);

  return (
    <div style={wrapperStyle} onClick={onClick}>
      <div
        ref={containerRef}
        className="sc-wp-joystick"
        onMouseDown={onDown}
        onTouchStart={onDown}
        style={{
          width: trackDims.w,
          height: trackDims.h,
          borderRadius: trackDims.radius,
          background: joystickOrient === 'both'
            ? 'radial-gradient(circle, #1a2332 0%, #0b1224 100%)'
            : 'linear-gradient(135deg, #1a2332 0%, #0b1224 100%)',
          border: '2px solid var(--iot-high)',
          position: 'relative',
          cursor: dragging ? 'grabbing' : 'grab',
          touchAction: 'none',
          boxShadow: dragging
            ? '0 0 14px rgba(0,229,255,0.4)'
            : '0 0 6px rgba(0,229,255,0.1)',
        }}
      >
        {/* crosshair grid lines - only show axes that are active */}
        {joystickOrient !== 'vertical' && <div className="sc-wp-joystick-axis" style={axisStyle('horizontal')} />}
        {joystickOrient !== 'horizontal' && <div className="sc-wp-joystick-axis" style={axisStyle('vertical')} />}

        {/* knob */}
        <div
          className="sc-wp-joystick-knob"
          style={{
            position: 'absolute',
            left: `calc(${pos.x}% - ${MAX_RADIUS}px)`,
            top: `calc(${pos.y}% - ${MAX_RADIUS}px)`,
            width: MAX_RADIUS * 2,
            height: MAX_RADIUS * 2,
            borderRadius: '50%',
            background: 'linear-gradient(145deg, #00e5ff, #0891b2)',
            boxShadow: '0 2px 8px rgba(0,229,255,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            pointerEvents: 'none',
          }}
        >
          <div
            style={{
              width: KNOB_SIZE,
              height: KNOB_SIZE,
              borderRadius: '50%',
              background: 'white',
              opacity: 0.6,
            }}
          />
        </div>
      </div>
      {isFull && height >= 3 && (
        <div className="sc-wp-joystick-values">
          {joystickOrient !== 'vertical' && <span>X: {Math.round((((pos.x - 50) / 50) * 100))}</span>}
          {joystickOrient !== 'horizontal' && <span>Y: {Math.round((((50 - pos.y) / 50) * 100))}</span>}
        </div>
      )}
    </div>
  );
});

/* ----- SingleAxisPreview ----- */
const SingleAxisPreview = memo(function SingleAxisPreview({ ctrl, value, setValue, min, max, onClick }) {
  const isHorizontal = ctrl.orientation === 'horizontal';
  const isAutoReturn = ctrl.autoCenter === true || ctrl.autoCenter === 'center';
  const trackRef = useRef(null);
  const [isDragging, setIsDragging] = useState(false);

  // Calculate thumb position percentage
  const range = max - min;
  const percent = ((value - min) / range) * 100;

  const handleDrag = useCallback((clientX, clientY) => {
    if (!isDragging || !trackRef.current) return;
    const rect = trackRef.current.getBoundingClientRect();

    // Check if pointer is inside the track bounds
    if (clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > rect.bottom) {
      return; // Ignore moves outside the track
    }

    let newPercent;

    if (isHorizontal) {
      newPercent = Math.max(0, Math.min(100, ((clientX - rect.left) / rect.width) * 100));
    } else {
      // Vertical: top = positive (max), bottom = negative (min)
      newPercent = Math.max(0, Math.min(100, ((clientY - rect.top) / rect.height) * 100));
    }

    const newValue = Math.round(min + (newPercent / 100) * range);
    setValue(newValue);
  }, [isDragging, isHorizontal, min, max, range, setValue]);

  const handleMouseDown = (e) => {
    e.stopPropagation();
    e.preventDefault();
    setIsDragging(true);
    handleDrag(e.clientX, e.clientY);
  };

  const handleTouchStart = (e) => {
    e.stopPropagation();
    e.preventDefault();
    setIsDragging(true);
    const touch = e.touches[0];
    handleDrag(touch.clientX, touch.clientY);
  };

  // Local mouse/touch move on the track only
  const handleMouseMove = (e) => {
    if (!isDragging) return;
    e.stopPropagation();
    handleDrag(e.clientX, e.clientY);
  };

  const handleTouchMove = (e) => {
    if (!isDragging) return;
    e.stopPropagation();
    e.preventDefault();
    const touch = e.touches[0];
    handleDrag(touch.clientX, touch.clientY);
  };

  const handleMouseUp = (e) => {
    if (isDragging) {
      if (isAutoReturn) {
        setValue(0);
      }
      setIsDragging(false);
    }
  };

  const handleTouchEnd = (e) => {
    if (isDragging) {
      if (isAutoReturn) {
        setValue(0);
      }
      setIsDragging(false);
    }
  };

  // Track dimensions
  const trackWidth = isHorizontal ? '100%' : '80px';
  const trackHeight = isHorizontal ? '80px' : '100%';

  // Thumb position
  const thumbStyle = isHorizontal
    ? { left: `${percent}%`, top: '50%', transform: 'translate(-50%, -50%)' }
    : { top: `${100 - percent}%`, left: '50%', transform: 'translate(-50%, -50%)' };

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      width: '100%',
      height: '100%',
      padding: '8px',
      boxSizing: 'border-box',
      gap: '8px',
    }} onClick={onClick}>
      {/* Touch track */}
      <div
        ref={trackRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        style={{
          width: trackWidth,
          height: trackHeight,
          background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)',
          borderRadius: isHorizontal ? '40px' : '40px',
          position: 'relative',
          cursor: 'pointer',
          touchAction: 'none',
          border: '2px solid #00e5ff',
          boxShadow: isDragging ? '0 0 20px rgba(0, 229, 255, 0.5)' : '0 0 10px rgba(0, 229, 255, 0.3)',
        }}
      >
        {/* Center line */}
        <div style={{
          position: 'absolute',
          left: isHorizontal ? '50%' : '50%',
          top: isHorizontal ? '10%' : '50%',
          width: isHorizontal ? '2px' : '60%',
          height: isHorizontal ? '80%' : '2px',
          background: 'rgba(0, 229, 255, 0.3)',
          transform: isHorizontal ? 'translateX(-50%)' : 'translateY(-50%)',
        }} />

        {/* Thumb */}
        <div style={{
          position: 'absolute',
          ...thumbStyle,
          width: isHorizontal ? '50px' : '70%',
          height: isHorizontal ? '70%' : '50px',
          background: isDragging
            ? 'linear-gradient(135deg, #00e5ff 0%, #00bcd4 100%)'
            : 'linear-gradient(135deg, #00e5ff 0%, #0097a7 100%)',
          borderRadius: '50%',
          boxShadow: '0 4px 15px rgba(0, 229, 255, 0.5)',
          transition: isDragging ? 'none' : 'all 0.2s ease',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '10px',
          color: '#0a0a1a',
          fontWeight: 'bold',
          userSelect: 'none',
        }}>
          {isHorizontal ? (value > 0 ? '+' : '') + value : (value > 0 ? '+' : '') + value}
        </div>
      </div>

      {/* Value display */}
      <div className="sc-wp-value-display" style={{
        fontSize: '14px',
        fontWeight: 'bold',
      }}>
        {value > 0 ? '+' : ''}{value}
      </div>
    </div>
  );
});

/* ----- ColorPickerPreview ----- */
const ColorPickerPreview = memo(function ColorPickerPreview({ ctrl, color, setColor, wrapperStyle, onClick }) {
  const updateChannel = (channel, val) => {
    setColor((prev) => ({ ...prev, [channel]: parseInt(val) }));
  };
  const rgbString = `rgb(${color.r}, ${color.g}, ${color.b})`;

  return (
    <div style={{ ...wrapperStyle, gap: '4px', padding: '4px' }} onClick={onClick}>
      <div
        className="sc-wp-color-preview"
        style={{
          width: '100%',
          minHeight: '18px',
          flex: '1 1 auto',
          maxHeight: '40%',
          borderRadius: '6px',
          background: rgbString,
          border: '1px solid var(--iot-outline)',
          boxShadow: `0 0 8px ${rgbString}`,
        }}
      />
      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', width: '100%' }} onClick={(e) => e.stopPropagation()}>
        <ColorSlider label="R" value={color.r} onChange={(v) => updateChannel('r', v)} color="#ef4444" />
        <ColorSlider label="G" value={color.g} onChange={(v) => updateChannel('g', v)} color="#10b981" />
        <ColorSlider label="B" value={color.b} onChange={(v) => updateChannel('b', v)} color="#3b82f6" />
      </div>
    </div>
  );
});

/* ----- DpadPreview ----- */
const DpadPreview = memo(function DpadPreview({ ctrl, wrapperStyle, active, setActive, onClick }) {
  const handlePress = (dir) => (e) => {
    e.stopPropagation();
    setActive(dir);
  };
  const handleRelease = (e) => {
    e?.stopPropagation?.();
    setActive(null);
  };

  const btn = (dir, label) => (
    <button
      key={dir || label}
      className={`sc-wp-dpad-btn ${active === dir ? 'active' : ''}`}
      onMouseDown={handlePress(dir)}
      onMouseUp={handleRelease}
      onMouseLeave={handleRelease}
      onTouchStart={handlePress(dir)}
      onTouchEnd={handleRelease}
      style={{
        width: '100%',
        aspectRatio: '1',
        border: '1px solid var(--iot-outline)',
        borderRadius: '4px',
        background: active === dir ? 'var(--iot-primary)' : 'var(--iot-lowest)',
        color: active === dir ? '#001f24' : 'var(--iot-secondary)',
        fontSize: '12px',
        fontWeight: 700,
        cursor: 'pointer',
        transition: 'all 0.1s',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {label}
    </button>
  );

  return (
    <div style={wrapperStyle} onClick={onClick}>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gridTemplateRows: 'repeat(3, 1fr)',
          gap: '2px',
          width: '88%',
          aspectRatio: '1',
          maxWidth: '120px',
        }}
      >
        <div />
        {btn('UP', '▲')}
        <div />
        {btn('LEFT', '◀')}
        <div
          style={{
            background: 'var(--iot-lowest)',
            borderRadius: '4px',
            border: '1px solid var(--iot-outline)',
            opacity: 0.3,
          }}
        />
        {btn('RIGHT', '▶')}
        <div />
        {btn('DOWN', '▼')}
        <div />
      </div>
    </div>
  );
});

/* ----- SliderPreview ----- */
const SliderPreview = memo(function SliderPreview({ ctrl, value, setValue, onClick }) {
  const min = ctrl.min ?? 0;
  const max = ctrl.max ?? 255;
  const isHorizontal = ctrl.orientation === 'horizontal';

  return (
    <div style={{
      display: 'flex',
      flexDirection: isHorizontal ? 'row' : 'column',
      alignItems: 'center',
      width: '100%',
      padding: '6px 8px',
      gap: '4px'
    }} onClick={onClick}>
      {ctrl.label && <span className="sc-wp-label">{ctrl.label}</span>}
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(e) => setValue(parseInt(e.target.value))}
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
        className="sc-wp-range"
        style={{
          width: isHorizontal ? '70%' : '100%',
          height: isHorizontal ? 'auto' : '100%',
          writingMode: isHorizontal ? 'vertical-lr' : 'horizontal-tb',
          direction: isHorizontal ? 'rtl' : 'ltr',
        }}
      />
      <div className="sc-wp-value-display">{value}</div>
    </div>
  );
});

/* ----- KnobPreview ----- */
const KnobPreview = memo(function KnobPreview({ ctrl, value, setValue, wrapperStyle, onClick }) {
  const containerRef = useRef(null);
  const [dragging, setDragging] = useState(false);
  const min = ctrl.min ?? 0;
  const max = ctrl.max ?? 255;

  const updateFromY = useCallback(
    (clientY) => {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const centerY = rect.top + rect.height / 2;
      const dy = centerY - clientY;
      const half = rect.height / 2 - 8;
      const pct = Math.max(-1, Math.min(1, dy / half));
      const range = max - min;
      const newVal = Math.round(min + ((pct + 1) / 2) * range);
      setValue(Math.max(min, Math.min(max, newVal)));
    },
    [min, max, setValue]
  );

  const onDown = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragging(true);
    updateFromY(e.touches ? e.touches[0].clientY : e.clientY);
  };

  const onMove = useCallback(
    (e) => {
      if (!dragging) return;
      e.preventDefault();
      updateFromY(e.touches ? e.touches[0].clientY : e.clientY);
    },
    [dragging, updateFromY]
  );

  const onUp = useCallback(() => setDragging(false), []);

  useEffect(() => {
    if (!dragging) return;
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    window.addEventListener('touchmove', onMove, { passive: false });
    window.addEventListener('touchend', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onUp);
    };
  }, [dragging, onMove, onUp]);

  // Angle from value
  const ratio = (value - min) / (max - min || 1);
  const angle = -135 + ratio * 270; // -135deg to +135deg

  return (
    <div style={wrapperStyle} onClick={onClick}>
      <div
        ref={containerRef}
        className="sc-wp-knob"
        onMouseDown={onDown}
        onTouchStart={onDown}
        style={{
          width: '78%',
          aspectRatio: '1',
          maxWidth: '110px',
          maxHeight: '110px',
          borderRadius: '50%',
          background: `conic-gradient(from 225deg, var(--iot-primary) 0deg, var(--iot-primary) ${ratio * 270}deg, var(--iot-lowest) ${ratio * 270}deg, var(--iot-lowest) 270deg, transparent 270deg)`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: dragging ? 'grabbing' : 'grab',
          touchAction: 'none',
          position: 'relative',
        }}
      >
        {/* Indicator line */}
        <div
          style={{
            position: 'absolute',
            top: '8%',
            left: '50%',
            width: '2px',
            height: '34%',
            background: 'var(--iot-primary)',
            transformOrigin: '50% 100%',
            transform: `translateX(-50%) rotate(${angle + 45}deg)`,
            borderRadius: '1px',
            boxShadow: '0 0 4px var(--iot-primary)',
          }}
        />
        <div
          style={{
            width: '70%',
            aspectRatio: '1',
            borderRadius: '50%',
            background: 'var(--iot-panel)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '14px',
            fontWeight: 700,
            color: 'var(--iot-primary)',
            border: '1px solid var(--iot-outline)',
          }}
        >
          {value}
        </div>
      </div>
    </div>
  );
});

/* ----- NumberInputPreview ----- */
const NumberInputPreview = memo(function NumberInputPreview({ ctrl, value, setValue, wrapperStyle, onClick }) {
  const min = ctrl.min ?? 0;
  const max = ctrl.max ?? 255;
  const step = ctrl.step ?? 1;
  const isHorizontal = ctrl.orientation === 'horizontal';
  const inc = (e) => {
    e.stopPropagation();
    setValue(Math.min(max, value + step));
  };
  const dec = (e) => {
    e.stopPropagation();
    setValue(Math.max(min, value - step));
  };
  return (
    <div style={{ ...wrapperStyle, flexDirection: isHorizontal ? 'column' : 'row', gap: '6px' }} onClick={onClick}>
      <button onClick={dec} onMouseDown={(e) => e.stopPropagation()} className="sc-wp-num-btn">
        −
      </button>
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(e) => setValue(parseFloat(e.target.value) || 0)}
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
        className="sc-wp-num-input"
      />
      <button onClick={inc} onMouseDown={(e) => e.stopPropagation()} className="sc-wp-num-btn">
        +
      </button>
    </div>
  );
});

/* ----- StepperPreview ----- */
const StepperPreview = memo(function StepperPreview({ ctrl, value, setValue, wrapperStyle, onClick }) {
  const isHorizontal = ctrl.orientation === 'horizontal';
  const inc = (e) => {
    e.stopPropagation();
    setValue(value + 1);
  };
  const dec = (e) => {
    e.stopPropagation();
    setValue(value - 1);
  };
  return (
    <div style={{ ...wrapperStyle, flexDirection: isHorizontal ? 'column' : 'row', gap: '8px' }} onClick={onClick}>
      <button onClick={dec} onMouseDown={(e) => e.stopPropagation()} className="sc-wp-stepper-btn dec">
        −
      </button>
      <div className="sc-wp-value-display">{value}</div>
      <button onClick={inc} onMouseDown={(e) => e.stopPropagation()} className="sc-wp-stepper-btn inc">
        +
      </button>
    </div>
  );
});

/* ----- TogglePreview ----- */
const TogglePreview = memo(function TogglePreview({ ctrl, on, setOn, wrapperStyle, onClick }) {
  const isHorizontal = ctrl.orientation === 'horizontal';
  const toggle = (e) => {
    e.stopPropagation();
    setOn(!on);
  };
  return (
    <div style={{ ...wrapperStyle, flexDirection: isHorizontal ? 'row' : 'column', gap: isHorizontal ? '8px' : '4px' }} onClick={onClick}>
      <button
        className={`sc-wp-toggle-track ${on ? 'on' : 'off'}`}
        onClick={toggle}
        onMouseDown={(e) => e.stopPropagation()}
        style={{
          width: '54px',
          height: '28px',
          borderRadius: '14px',
          background: on ? 'var(--iot-success)' : 'var(--iot-lowest)',
          border: '1px solid var(--iot-outline)',
          position: 'relative',
          cursor: 'pointer',
          transition: 'all 0.2s',
        }}
      >
        <div
          className="sc-wp-toggle-knob"
          style={{
            position: 'absolute',
            top: '2px',
            left: on ? '26px' : '2px',
            width: '22px',
            height: '22px',
            borderRadius: '50%',
            background: 'white',
            transition: 'all 0.2s',
            boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
          }}
        />
      </button>
      <span className="sc-wp-label">{ctrl.label || 'Toggle'}</span>
    </div>
  );
});

/* ----- ButtonPreview ----- */
const ButtonPreview = memo(function ButtonPreview({ ctrl, on, setOn, wrapperStyle, onClick }) {
  const label = ctrl.label || 'Button';
  const isHorizontal = ctrl.orientation === 'horizontal';
  const press = (e) => {
    e.stopPropagation();
    setOn(true);
  };
  const release = (e) => {
    e?.stopPropagation?.();
    setOn(false);
  };
  return (
    <div style={{ ...wrapperStyle, flexDirection: isHorizontal ? 'row' : 'column', gap: isHorizontal ? '8px' : '4px' }} onClick={onClick}>
      <button
        className={`sc-wp-button ${on ? 'active' : ''}`}
        onMouseDown={press}
        onMouseUp={release}
        onMouseLeave={release}
        onTouchStart={press}
        onTouchEnd={release}
        style={{
          padding: '8px 14px',
          borderRadius: '8px',
          border: '1px solid var(--iot-outline)',
          background: on ? 'var(--iot-success)' : 'var(--iot-lowest)',
          color: on ? '#000' : 'var(--iot-secondary)',
          fontWeight: 700,
          fontSize: '13px',
          cursor: 'pointer',
          transition: 'all 0.15s',
          minWidth: '60px',
        }}
      >
        {label}
      </button>
    </div>
  );
});

/* ----- CheckboxPreview ----- */
const CheckboxPreview = memo(function CheckboxPreview({ ctrl, checked, setChecked, wrapperStyle, onClick }) {
  const label = ctrl.label || 'Checkbox';
  const toggle = (e) => {
    e.stopPropagation();
    setChecked(!checked);
  };
  return (
    <div style={{ ...wrapperStyle, flexDirection: 'row', gap: '8px' }} onClick={onClick}>
      <div
        onClick={toggle}
        onMouseDown={(e) => e.stopPropagation()}
        className={`sc-wp-checkbox ${checked ? 'checked' : ''}`}
        style={{
          width: '22px',
          height: '22px',
          borderRadius: '4px',
          border: '2px solid var(--iot-primary)',
          background: checked ? 'var(--iot-primary)' : 'transparent',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          color: '#001f24',
          fontSize: '14px',
          fontWeight: 700,
        }}
      >
        {checked ? '✓' : ''}
      </div>
      <span className="sc-wp-label">{label}</span>
    </div>
  );
});

/* ----- IconButtonPreview ----- */
const IconButtonPreview = memo(function IconButtonPreview({ ctrl, on, setOn, wrapperStyle, onClick }) {
  const icon = ctrl.customIcon || ctrl.icon || '💡';
  const isHorizontal = ctrl.orientation === 'horizontal';
  const toggle = (e) => {
    e.stopPropagation();
    setOn(!on);
  };
  return (
    <div style={{ ...wrapperStyle, flexDirection: isHorizontal ? 'row' : 'column', gap: isHorizontal ? '8px' : '4px' }} onClick={onClick}>
      <button
        className={`sc-wp-icon-btn ${on ? 'active' : ''}`}
        onClick={toggle}
        onMouseDown={(e) => e.stopPropagation()}
        style={{
          width: isHorizontal ? 'auto' : '70%',
          maxWidth: '80px',
          aspectRatio: isHorizontal ? 'auto' : '1',
          borderRadius: '12px',
          border: `2px solid ${on ? 'var(--iot-primary)' : 'var(--iot-outline)'}`,
          background: on ? 'var(--iot-primary)' : 'var(--iot-lowest)',
          color: on ? '#001f24' : 'var(--iot-primary)',
          fontSize: '26px',
          cursor: 'pointer',
          transition: 'all 0.2s',
          boxShadow: on ? '0 0 14px rgba(0,229,255,0.5)' : 'none',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {icon}
      </button>
    </div>
  );
});

/* ----- TouchPadPreview ----- */
const TouchPadPreview = memo(function TouchPadPreview({ ctrl, touching, setTouching, wrapperStyle, onClick }) {
  const press = (e) => {
    e.stopPropagation();
    setTouching(true);
  };
  const release = (e) => {
    e?.stopPropagation?.();
    setTouching(false);
  };
  return (
    <div style={wrapperStyle} onClick={onClick}>
      <button
        className={`sc-wp-touch-pad ${touching ? 'active' : ''}`}
        onMouseDown={press}
        onMouseUp={release}
        onMouseLeave={release}
        onTouchStart={press}
        onTouchEnd={release}
        style={{
          width: '90%',
          height: '70%',
          borderRadius: '8px',
          border: '2px dashed var(--iot-primary)',
          background: touching ? 'var(--iot-primary)' : 'transparent',
          color: touching ? '#001f24' : 'var(--iot-primary)',
          fontSize: '11px',
          cursor: 'pointer',
          transition: 'all 0.1s',
          fontWeight: 600,
        }}
      >
        {touching ? 'Đang chạm' : 'Chạm giữ'}
      </button>
    </div>
  );
});

/* ===== Main MemoizedWidgetPreview component ===== */
const MemoizedWidgetPreview = memo(function MemoizedWidgetPreview({ ctrl, width, height, onSelect }) {
  const [localValue, setLocalValue] = useState(ctrl.value ?? 0);
  const [localToggle, setLocalToggle] = useState(false);
  const [localColor, setLocalColor] = useState({ r: 255, g: 0, b: 0 });
  const [joystickPos, setJoystickPos] = useState({ x: 50, y: 50 });
  const [touching, setTouching] = useState(false);
  const [dpadActive, setDpadActive] = useState(null);

  // Sync local state when widget changes
  useEffect(() => {
    setLocalValue(ctrl.value ?? 0);
  }, [ctrl.id, ctrl.value]);

  // Handle click to select widget - prevent bubbling to canvas
  const handleClick = useCallback((e) => {
    e.stopPropagation();
    if (onSelect) {
      onSelect(ctrl.id);
    }
  }, [ctrl.id, onSelect]);

  // Determine preview sizing based on widget cell size
  const sizeStyles = useMemo(() => ({
    width: '100%',
    height: '100%',
    boxSizing: 'border-box',
  }), []);

  const wrapperStyle = useMemo(() => ({
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    height: '100%',
    padding: '4px',
    gap: '2px',
    overflow: 'hidden',
    userSelect: 'none',
  }), []);

  switch (ctrl.type) {
    case 'joystick_full':
      return (
        <JoystickPreview
          ctrl={ctrl}
          wrapperStyle={wrapperStyle}
          sizeStyles={sizeStyles}
          pos={joystickPos}
          setPos={setJoystickPos}
          width={width}
          height={height}
          fullJoystick
          onClick={handleClick}
        />
      );
    case 'joystick_x':
      return (
        <SingleAxisPreview
          ctrl={ctrl}
          value={localValue}
          setValue={setLocalValue}
          min={-100}
          max={100}
          onClick={handleClick}
        />
      );
    case 'joystick_y':
      return (
        <SingleAxisPreview
          ctrl={ctrl}
          value={localValue}
          setValue={setLocalValue}
          min={-100}
          max={100}
          onClick={handleClick}
        />
      );
    case 'color_picker':
      return (
        <ColorPickerPreview
          ctrl={ctrl}
          color={localColor}
          setColor={setLocalColor}
          wrapperStyle={wrapperStyle}
          onClick={handleClick}
        />
      );
    case 'dpad':
      return (
        <DpadPreview
          ctrl={ctrl}
          wrapperStyle={wrapperStyle}
          active={dpadActive}
          setActive={setDpadActive}
          onClick={handleClick}
        />
      );
    case 'slider':
      return <SliderPreview ctrl={ctrl} value={localValue} setValue={setLocalValue} onClick={handleClick} />;
    case 'knob':
      return (
        <KnobPreview
          ctrl={ctrl}
          value={localValue}
          setValue={setLocalValue}
          wrapperStyle={wrapperStyle}
          onClick={handleClick}
        />
      );
    case 'number_input':
      return (
        <NumberInputPreview
          ctrl={ctrl}
          value={localValue}
          setValue={setLocalValue}
          wrapperStyle={wrapperStyle}
          onClick={handleClick}
        />
      );
    case 'stepper':
      return (
        <StepperPreview
          ctrl={ctrl}
          value={localValue}
          setValue={setLocalValue}
          wrapperStyle={wrapperStyle}
          onClick={handleClick}
        />
      );
    case 'toggle':
      return (
        <TogglePreview
          ctrl={ctrl}
          on={localToggle}
          setOn={setLocalToggle}
          wrapperStyle={wrapperStyle}
          onClick={handleClick}
        />
      );
    case 'button':
      return (
        <ButtonPreview
          ctrl={ctrl}
          on={localToggle}
          setOn={setLocalToggle}
          wrapperStyle={wrapperStyle}
          onClick={handleClick}
        />
      );
    case 'checkbox':
      return (
        <CheckboxPreview
          ctrl={ctrl}
          checked={localToggle}
          setChecked={setLocalToggle}
          wrapperStyle={wrapperStyle}
          onClick={handleClick}
        />
      );
    case 'icon_button':
      return (
        <IconButtonPreview
          ctrl={ctrl}
          on={localToggle}
          setOn={setLocalToggle}
          wrapperStyle={wrapperStyle}
          onClick={handleClick}
        />
      );
    case 'touch_pad':
      return (
        <TouchPadPreview
          ctrl={ctrl}
          touching={touching}
          setTouching={setTouching}
          wrapperStyle={wrapperStyle}
          onClick={handleClick}
        />
      );
    default:
      return (
        <div style={wrapperStyle} onClick={handleClick}>
          <span className="sc-wp-default-icon">{ctrl.icon}</span>
          <span className="sc-wp-default-label">{ctrl.label}</span>
        </div>
      );
  }
});

// Export memoized component
export default MemoizedWidgetPreview;
