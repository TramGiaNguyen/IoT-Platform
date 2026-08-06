/**
 * Generate standalone HTML/CSS/JS for ESP web interface
 * Responsive, mobile-first design for direct ESP control
 */

import { sanitizeWidgetId, widgetEndpoint, escapeHtml } from './standaloneShared.js';
import { STANDALONE_CANVAS_CSS } from './standaloneSharedCSS.js';

export function generateStandaloneHTML(controls, options = {}) {
  const {
    ssid = 'ESP_Control',
    devicePreset = 'iphone-12',
    customWidth = 390,
    customHeight = 844,
    orientation = 'portrait'
  } = options;

  // Device presets (same as StandaloneControllerBuilder.js)
  const DEVICE_PRESETS = {
    'iphone-se': { width: 375, height: 667 },
    'iphone-12': { width: 390, height: 844 },
    'iphone-14-pro': { width: 393, height: 852 },
    'pixel-5': { width: 393, height: 851 },
    'galaxy-s20': { width: 360, height: 800 },
  };

  const CELL_SIZE = 40; // Same as StandaloneControllerBuilder.js
  const preset = DEVICE_PRESETS[devicePreset] || DEVICE_PRESETS['iphone-12'];
  const screenWidth = customWidth || preset.width;
  const screenHeight = customHeight || preset.height;
  const canvasWidth = orientation === 'portrait' ? screenWidth : screenHeight;
  const canvasHeight = orientation === 'portrait' ? screenHeight : screenWidth;

  const widgetsHtml = controls.map(ctrl => generateWidgetHTML(ctrl, CELL_SIZE)).join('\n    ');
  const jsHandlers = controls.map(ctrl => generateWidgetJSHandler(ctrl)).join('\n\n  ');

  return `<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>ESP Controller</title>
  <style>
    ${STANDALONE_CANVAS_CSS}
  </style>
<body>
  <div class="landscape-required-msg">
    <div class="rotate-icon">📱</div>
    <div>Vui lòng xoay ngang màn hình</div>
    <div style="font-size:14px;color:#a0a0a0;">Rotate your device to landscape mode</div>
  </div>

  <div
    class="device-container"
    style="width: ${canvasWidth}px; height: ${canvasHeight}px;"
  >
    <div class="controls-canvas">
      ${widgetsHtml}
    </div>
  </div>

  <div id="toast" class="toast"></div>

  <script>
    // Landscape lock for ESP display
    (function initOrientation() {
      const isLandscape = ${orientation === 'landscape' ? 'true' : 'false'};

      if (isLandscape) {
        // Try to lock to landscape using Screen Orientation API
        if (screen.orientation && screen.orientation.lock) {
          screen.orientation.lock('landscape').catch(function() {
            // Fallback: auto-rotate body
            document.body.classList.add('landscape-mode');
          });
        } else {
          // Fallback for browsers without Screen Orientation API
          document.body.classList.add('landscape-mode');
        }
      }
    })();

    // Send command to ESP
    function sendCommand(endpoint, params = {}) {
      const url = new URL(endpoint, window.location.origin);
      Object.entries(params).forEach(([key, value]) => {
        url.searchParams.set(key, value);
      });

      fetch(url.toString(), { mode: 'no-cors' })
        .then(() => showToast('OK'))
        .catch(err => console.error('Error:', err));
    }

    // Show toast notification
    function showToast(message) {
      const toast = document.getElementById('toast');
      toast.textContent = message;
      toast.classList.add('show');
      setTimeout(() => toast.classList.remove('show'), 800);
    }

    ${jsHandlers}
  </script>
</body>
</html>`;
}

function generateWidgetHTML(ctrl, CELL_SIZE = 40) {
  const left = (ctrl.x || 0) * CELL_SIZE;
  const top = (ctrl.y || 0) * CELL_SIZE;
  const width = (ctrl.width || 1) * CELL_SIZE;
  const height = (ctrl.height || 1) * CELL_SIZE;
  const safeId = sanitizeWidgetId(ctrl.id);
  const label = escapeHtml(ctrl.label || ctrl.type);

  const style = `left:${left}px; top:${top}px; width:${width}px; height:${height}px;`;
  const orient = ctrl.orientation === 'horizontal' ? 'row' : 'column';

  switch (ctrl.type) {
    case 'button': {
      const on = ctrl.onValue ?? 1;
      const off = ctrl.offValue ?? 0;
      return `
    <div class="sc-canvas-widget" style="${style}">
      <button
        class="sc-wp-button${off === 0 && on === 1 ? '' : ''}"
        data-on="${on}" data-off="${off}"
        style="padding: 8px 14px; border-radius: 8px; border: 1px solid var(--iot-outline); background: var(--iot-lowest); color: var(--iot-secondary); font-weight: 700; font-size: 13px; cursor: pointer; font-family: var(--font-sans);"
        onmousedown="window.__btnPress('${safeId}')"
        onmouseup="window.__btnRelease('${safeId}')"
        onmouseleave="window.__btnRelease('${safeId}')"
        ontouchstart="window.__btnPress('${safeId}')"
        ontouchend="window.__btnRelease('${safeId}')"
      >${label}</button>
    </div>`;
    }

    case 'toggle': {
      const on = ctrl.onValue ?? 1;
      const off = ctrl.offValue ?? 0;
      return `
    <div class="sc-canvas-widget" style="${style} flex-direction: ${orient}; gap: ${orient === 'row' ? '8px' : '4px'};">
      <button
        id="tog-track-${safeId}"
        class="sc-wp-toggle-track off"
        data-on="${on}" data-off="${off}"
        style="width: 54px; height: 28px; border-radius: 14px; background: var(--iot-lowest); border: 1px solid var(--iot-outline); position: relative; cursor: pointer; transition: all 0.2s;"
        onclick="window.__togglePress('${safeId}')"
      >
        <div
          id="tog-knob-${safeId}"
          style="position: absolute; top: 2px; left: 2px; width: 22px; height: 22px; border-radius: 50%; background: white; transition: all 0.2s; box-shadow: 0 1px 3px rgba(0,0,0,0.3);"
        ></div>
      </button>
      <span class="sc-wp-label">${label}</span>
    </div>`;
    }

    case 'slider': {
      const min = ctrl.min ?? 0;
      const max = ctrl.max ?? 255;
      const val = ctrl.value ?? min;
      return `
    <div class="sc-canvas-widget" style="${style} flex-direction: ${orient}; padding: 6px 8px; gap: 4px;">
      ${ctrl.label ? `<span class="sc-wp-label" style="margin-top: 0;">${label}</span>` : ''}
      <input
        type="range" class="sc-wp-range"
        id="slider-${safeId}"
        min="${min}" max="${max}" step="${ctrl.step ?? 1}" value="${val}"
        style="width: 100%; cursor: pointer;"
        oninput="window.__sliderUpdate('${safeId}', this.value)"
        onchange="window.__sliderUpdate('${safeId}', this.value)"
      />
      <div class="sc-wp-value-display" id="slider-val-${safeId}">${val}</div>
    </div>`;
    }

    case 'knob': {
      const min = ctrl.min ?? 0;
      const max = ctrl.max ?? 255;
      const val = ctrl.value ?? min;
      const range = max - min || 1;
      const ratio = (val - min) / range;
      const angle = -135 + ratio * 270;
      return `
    <div class="sc-canvas-widget" style="${style} padding: 4px;">
      <div
        id="knob-wrap-${safeId}"
        style="width: 100%; height: 100%; display: flex; flex-direction: column;
               align-items: center; justify-content: center; gap: 2px;
               box-sizing: border-box; user-select: none; padding: 4px;"
      >
        <div
          id="knob-${safeId}"
          style="width: 78%; aspect-ratio: 1; max-width: 110px; max-height: 110px; border-radius: 50%;
                 background: conic-gradient(from 225deg, var(--iot-primary) 0deg, var(--iot-primary) ${ratio * 270}deg, var(--iot-lowest) ${ratio * 270}deg, var(--iot-lowest) 270deg, transparent 270deg);
                 display: flex; align-items: center; justify-content: center;
                 touch-action: none; position: relative; cursor: grab;
                 box-shadow: 0 0 6px rgba(0, 229, 255, 0.1); transition: box-shadow 0.2s, cursor 0.2s;"
          onmousedown="window.__knobDown('${safeId}', event)"
          ontouchstart="window.__knobDown('${safeId}', event)"
        >
          <div
            style="position: absolute; top: 8%; left: 50%; width: 2px; height: 34%;
                   background: var(--iot-primary); transform-origin: 50% 100%;
                   transform: translateX(-50%) rotate(${angle + 45}deg);
                   border-radius: 1px; box-shadow: 0 0 4px var(--iot-primary);"
          ></div>
          <div
            style="width: 70%; aspect-ratio: 1; border-radius: 50%; background: var(--iot-panel);
                   display: flex; align-items: center; justify-content: center;
                   font-size: 14px; font-weight: 700; color: var(--iot-primary);
                   border: 1px solid var(--iot-outline);"
          ><span id="knob-val-${safeId}">${val}</span></div>
        </div>
      </div>
    </div>`;
    }

    case 'color_picker':
      return `
    <div class="sc-canvas-widget" style="${style} gap: 4px; padding: 4px;">
      <div
        id="color-preview-${safeId}"
        class="sc-wp-color-preview"
        style="width: 100%; min-height: 18px; flex: 1 1 auto; max-height: 40%; border-radius: 6px; background: rgb(255, 0, 0); border: 1px solid var(--iot-outline); box-shadow: 0 0 8px rgb(255, 0, 0);"
      ></div>
      <div style="display: flex; flex-direction: column; gap: 2px; width: 100%;" onclick="event.stopPropagation()">
        <div style="display: flex; align-items: center; gap: 4px;">
          <span style="font-size: 9px; color: #ef4444; font-weight: 700; width: 10px;">R</span>
          <input type="range" id="red-${safeId}" min="0" max="255" value="255"
            class="sc-wp-range" style="flex: 1; height: 6px; cursor: pointer;"
            oninput="window.__colorUpdate('${safeId}')" />
        </div>
        <div style="display: flex; align-items: center; gap: 4px;">
          <span style="font-size: 9px; color: #10b981; font-weight: 700; width: 10px;">G</span>
          <input type="range" id="green-${safeId}" min="0" max="255" value="0"
            class="sc-wp-range" style="flex: 1; height: 6px; cursor: pointer;"
            oninput="window.__colorUpdate('${safeId}')" />
        </div>
        <div style="display: flex; align-items: center; gap: 4px;">
          <span style="font-size: 9px; color: #3b82f6; font-weight: 700; width: 10px;">B</span>
          <input type="range" id="blue-${safeId}" min="0" max="255" value="0"
            class="sc-wp-range" style="flex: 1; height: 6px; cursor: pointer;"
            oninput="window.__colorUpdate('${safeId}')" />
        </div>
      </div>
    </div>`;

    case 'dpad': {
      const btn = (dir) => `
        <button
          class="sc-wp-dpad-btn"
          style="width: 100%; aspect-ratio: 1; border: 1px solid var(--iot-outline); border-radius: 4px;
                 background: var(--iot-lowest); color: var(--iot-secondary);
                 font-size: 12px; font-weight: 700; cursor: pointer;
                 display: flex; align-items: center; justify-content: center; font-family: var(--font-sans);"
          onmousedown="window.__dpadPress('${safeId}', '${dir}', this)"
          onmouseup="window.__dpadRelease(this)"
          onmouseleave="window.__dpadRelease(this)"
          ontouchstart="window.__dpadPress('${safeId}', '${dir}', this)"
          ontouchend="window.__dpadRelease(this)"
        >${dir === 'UP' ? '▲' : dir === 'DOWN' ? '▼' : dir === 'LEFT' ? '◀' : '▶'}</button>`;
      return `
    <div class="sc-canvas-widget" style="${style}">
      <div style="display: grid; grid-template-columns: repeat(3, 1fr); grid-template-rows: repeat(3, 1fr); gap: 2px; width: 88%; aspect-ratio: 1; max-width: 120px;">
        <div></div>${btn('UP')}
        <div></div>
        ${btn('LEFT')}
        <div style="background: var(--iot-lowest); border-radius: 4px; border: 1px solid var(--iot-outline); opacity: 0.3;"></div>
        ${btn('RIGHT')}
        <div></div>${btn('DOWN')}
        <div></div>
      </div>
    </div>`;
    }

    case 'joystick_full': {
      const joystickOrient = ctrl.orientation || 'both';
      const isHorizontal = joystickOrient === 'horizontal';
      const isVertical = joystickOrient === 'vertical';
      const trackDims = isHorizontal
        ? 'width: calc(100% + 0px); height: 60px; border-radius: 32px;'
        : isVertical
          ? 'width: 60px; height: calc(100% + 0px); border-radius: 32px;'
          : 'width: 100%; aspect-ratio: 1; max-width: 160px; border-radius: 50%;';
      const trackBg = joystickOrient === 'both'
        ? 'radial-gradient(circle, #1a2332 0%, #0b1224 100%)'
        : 'linear-gradient(135deg, #1a2332 0%, #0b1224 100%)';
      return `
    <div class="sc-canvas-widget" style="${style}">
      <div
        id="joystick-${safeId}"
        style="${trackDims} background: ${trackBg}; border: 2px solid var(--iot-high);
               position: relative; cursor: grab; touch-action: none;
               box-shadow: 0 0 6px rgba(0, 229, 255, 0.1);"
        onmousedown="window.__joyDown('${safeId}', event)"
        ontouchstart="window.__joyDown('${safeId}', event)"
      >
        ${!isVertical ? `<div style="position: absolute; top: 50%; left: 10%; right: 10%; height: 1px; background: var(--iot-outline); opacity: 0.5; pointer-events: none;"></div>` : ''}
        ${!isHorizontal ? `<div style="position: absolute; left: 50%; top: 10%; bottom: 10%; width: 1px; background: var(--iot-outline); opacity: 0.5; pointer-events: none;"></div>` : ''}
        <div
          id="joystick-knob-${safeId}"
          style="position: absolute; left: calc(50% - 22px); top: calc(50% - 22px);
                 width: 44px; height: 44px; border-radius: 50%;
                 background: linear-gradient(145deg, #00e5ff, #0891b2);
                 box-shadow: 0 2px 8px rgba(0, 229, 255, 0.5);
                 display: flex; align-items: center; justify-content: center;
                 pointer-events: none;"
        >
          <div style="width: 12px; height: 12px; border-radius: 50%; background: white; opacity: 0.6;"></div>
        </div>
      </div>
      <div class="sc-wp-joystick-values">
        ${!isVertical ? `<span>X: <span id="jx-${safeId}">0</span></span>` : ''}
        ${!isHorizontal ? `<span>Y: <span id="jy-${safeId}">0</span></span>` : ''}
      </div>
    </div>`;
    }

    case 'joystick_x':
      return `
    <div class="sc-canvas-widget" style="${style} flex-direction: column; align-items: center; justify-content: center; padding: 8px; gap: 8px;">
      <div
        id="track-x-${safeId}"
        style="width: 80px; height: 100%; background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
               border-radius: 40px; position: relative; cursor: pointer; touch-action: none;
               border: 2px solid #00e5ff; box-shadow: 0 0 10px rgba(0, 229, 255, 0.3);"
        onmousedown="window.__axisDown('${safeId}', 'x', event)"
        ontouchstart="window.__axisDown('${safeId}', 'x', event)"
      >
        <div style="position: absolute; left: 50%; top: 10%; bottom: 10%; width: 2px;
                    background: rgba(0, 229, 255, 0.3); transform: translateX(-50%);"></div>
        <div
          id="thumb-x-${safeId}"
          style="position: absolute; left: 50%; top: 50%; width: 70%; height: 50px;
                 border-radius: 50%; transform: translate(-50%, -50%);
                 background: linear-gradient(135deg, #00e5ff 0%, #0097a7 100%);
                 box-shadow: 0 4px 15px rgba(0, 229, 255, 0.5);
                 display: flex; align-items: center; justify-content: center;
                 font-size: 10px; color: #0a0a1a; font-weight: bold;
                 transition: all 0.2s ease;"
        >0</div>
      </div>
      <div class="sc-wp-value-display" id="jx-val-${safeId}">0</div>
    </div>`;

    case 'joystick_y':
      return `
    <div class="sc-canvas-widget" style="${style} flex-direction: column; align-items: center; justify-content: center; padding: 8px; gap: 8px;">
      <div
        id="track-y-${safeId}"
        style="width: 80px; height: 100%; background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
               border-radius: 40px; position: relative; cursor: pointer; touch-action: none;
               border: 2px solid #00e5ff; box-shadow: 0 0 10px rgba(0, 229, 255, 0.3);"
        onmousedown="window.__axisDown('${safeId}', 'y', event)"
        ontouchstart="window.__axisDown('${safeId}', 'y', event)"
      >
        <div style="position: absolute; top: 50%; left: 10%; right: 10%; height: 2px;
                    background: rgba(0, 229, 255, 0.3); transform: translateY(-50%);"></div>
        <div
          id="thumb-y-${safeId}"
          style="position: absolute; left: 50%; top: 50%; width: 70%; height: 50px;
                 border-radius: 50%; transform: translate(-50%, -50%);
                 background: linear-gradient(135deg, #00e5ff 0%, #0097a7 100%);
                 box-shadow: 0 4px 15px rgba(0, 229, 255, 0.5);
                 display: flex; align-items: center; justify-content: center;
                 font-size: 10px; color: #0a0a1a; font-weight: bold;
                 transition: all 0.2s ease;"
        >0</div>
      </div>
      <div class="sc-wp-value-display" id="jy-val-${safeId}">0</div>
    </div>`;

    case 'number_input': {
      const min = ctrl.min ?? 0;
      const max = ctrl.max ?? 255;
      const step = ctrl.step ?? 1;
      const val = ctrl.value ?? min;
      return `
    <div class="sc-canvas-widget" style="${style} flex-direction: ${orient}; gap: 6px;">
      <button class="sc-wp-num-btn" onclick="window.__numStep('${safeId}', -${step})">−</button>
      <input
        type="number" class="sc-wp-num-input" id="num-${safeId}"
        value="${val}" min="${min}" max="${max}" step="${step}"
        onchange="window.__numSet('${safeId}', this.value)"
      />
      <button class="sc-wp-num-btn" onclick="window.__numStep('${safeId}', ${step})">+</button>
    </div>`;
    }

    case 'stepper':
      return `
    <div class="sc-canvas-widget" style="${style} flex-direction: ${orient}; gap: 8px;">
      <button class="sc-wp-stepper-btn dec" onclick="window.__stepperPress('${safeId}', -1)">−</button>
      <div class="sc-wp-value-display" id="step-val-${safeId}">0</div>
      <button class="sc-wp-stepper-btn inc" onclick="window.__stepperPress('${safeId}', 1)">+</button>
    </div>`;

    case 'checkbox': {
      const on = ctrl.onValue ?? 1;
      const off = ctrl.offValue ?? 0;
      return `
    <div class="sc-canvas-widget" style="${style} flex-direction: row; gap: 8px;">
      <div
        id="check-box-${safeId}"
        data-on="${on}" data-off="${off}"
        style="width: 22px; height: 22px; border-radius: 4px; border: 2px solid var(--iot-primary);
               background: transparent; display: flex; align-items: center; justify-content: center;
               cursor: pointer; color: #001f24; font-size: 14px; font-weight: 700;"
        onclick="window.__checkboxToggle('${safeId}')"
      ></div>
      <span class="sc-wp-label">${label}</span>
    </div>`;
    }

    case 'icon_button': {
      const icon = ctrl.customIcon || ctrl.icon || '💡';
      const on = ctrl.onValue ?? 1;
      const off = ctrl.offValue ?? 0;
      return `
    <div class="sc-canvas-widget" style="${style}">
      <button
        id="icon-btn-${safeId}"
        data-on="${on}" data-off="${off}"
        style="width: 70%; max-width: 80px; aspect-ratio: 1; border-radius: 12px;
               border: 2px solid var(--iot-outline); background: var(--iot-lowest);
               color: var(--iot-primary); font-size: 26px; cursor: pointer;
               transition: all 0.2s; display: flex; align-items: center; justify-content: center;
               font-family: var(--font-sans);"
        onclick="window.__iconBtnPress('${safeId}')"
      >${escapeHtml(icon)}</button>
    </div>`;
    }

    case 'touch_pad':
      return `
    <div class="sc-canvas-widget" style="${style}">
      <button
        id="touch-${safeId}"
        style="width: 90%; height: 70%; border-radius: 8px;
               border: 2px dashed var(--iot-primary); background: transparent;
               color: var(--iot-primary); font-size: 11px; cursor: pointer;
               font-weight: 600; font-family: var(--font-sans);"
        onmousedown="window.__touchDown('${safeId}')"
        onmouseup="window.__touchUp('${safeId}')"
        onmouseleave="window.__touchUp('${safeId}')"
        ontouchstart="window.__touchDown('${safeId}')"
        ontouchend="window.__touchUp('${safeId}')"
      >Chạm giữ</button>
    </div>`;

    default:
      return '';
  }
}

function generateWidgetJSHandler(ctrl) {
  const safeId = sanitizeWidgetId(ctrl.id);
  const endpoint = widgetEndpoint(ctrl);
  const onVal = ctrl.onValue ?? 1;
  const offVal = ctrl.offValue ?? 0;

  // Helper - generate endpoint URLs (replaces legacy state mgmt)
  const urlOn = `'${endpoint}', { state: ${onVal} }`;
  const urlOff = `'${endpoint}', { state: ${offVal} }`;
  const urlVal = (v) => `'${endpoint}', { value: ${v} }`;
  const urlDir = (d) => `'${endpoint}', { dir: '${d}' }`;

  switch (ctrl.type) {
    case 'button':
      return `
window.__btnPress = function(id) {
  const btns = document.querySelectorAll('button.sc-wp-button');
  btns.forEach(b => { if (b.getAttribute('data-on') !== null && b.id === '') {} });
  sendCommand('${endpoint}', { state: ${onVal} });
};
window.__btnRelease = function(id) {
  sendCommand('${endpoint}', { state: ${offVal} });
};`;

    case 'toggle':
      return `
window.__togglePress = function(id) {
  const track = document.getElementById('tog-track-' + id);
  const knob = document.getElementById('tog-knob-' + id);
  if (!track || !knob) return;
  const wasOn = track.classList.contains('on');
  const willBeOn = !wasOn;
  if (willBeOn) {
    track.classList.remove('off');
    track.classList.add('on');
    track.style.background = 'var(--iot-success)';
    knob.style.left = '26px';
  } else {
    track.classList.remove('on');
    track.classList.add('off');
    track.style.background = 'var(--iot-lowest)';
    knob.style.left = '2px';
  }
  sendCommand('${endpoint}', { state: willBeOn ? ${onVal} : ${offVal} });
};`;

    case 'slider':
      return `
window.__sliderUpdate = function(id, val) {
  const v = parseInt(val);
  const disp = document.getElementById('slider-val-' + id);
  if (disp) disp.textContent = v;
  sendCommand('${endpoint}', { value: v });
};`;

    case 'knob': {
      const min = ctrl.min ?? 0;
      const max = ctrl.max ?? 255;
      return `
let __knobDragging_${safeId} = false;
window.__knobDown = function(id, ev) {
  __knobDragging_${safeId} = true;
  const knob = document.getElementById('knob-' + id);
  if (knob) {
    knob.style.cursor = 'grabbing';
    knob.style.boxShadow = '0 0 14px rgba(0, 229, 255, 0.4)';
  }
  ev.preventDefault();
  updateKnobFromEvt(id, ev);
  document.addEventListener('mousemove', ${safeId}Move);
  document.addEventListener('mouseup', ${safeId}Up);
  document.addEventListener('touchmove', ${safeId}Move, { passive: false });
  document.addEventListener('touchend', ${safeId}Up);
};
function ${safeId}Move(ev) { if (__knobDragging_${safeId}) updateKnobFromEvt('${safeId}', ev); }
function ${safeId}Up() {
  __knobDragging_${safeId} = false;
  const knob = document.getElementById('knob-${safeId}');
  if (knob) {
    knob.style.cursor = 'grab';
    knob.style.boxShadow = '0 0 6px rgba(0, 229, 255, 0.1)';
  }
  document.removeEventListener('mousemove', ${safeId}Move);
  document.removeEventListener('mouseup', ${safeId}Up);
  document.removeEventListener('touchmove', ${safeId}Move);
  document.removeEventListener('touchend', ${safeId}Up);
}
function updateKnobFromEvt(id, ev) {
  const knob = document.getElementById('knob-' + id);
  if (!knob) return;
  const rect = knob.getBoundingClientRect();
  const clientY = ev.touches ? ev.touches[0].clientY : ev.clientY;
  const centerY = rect.top + rect.height / 2;
  const dy = centerY - clientY;
  const half = rect.height / 2 - 8;
  const pct = Math.max(-1, Math.min(1, dy / half));
  const range = ${max} - ${min};
  const v = Math.round(${min} + ((pct + 1) / 2) * range);
  const clamped = Math.max(${min}, Math.min(${max}, v));
  const valEl = document.getElementById('knob-val-' + id);
  if (valEl) valEl.textContent = clamped;
  const ratio = (clamped - ${min}) / (range || 1);
  knob.style.background =
    'conic-gradient(from 225deg, var(--iot-primary) 0deg, var(--iot-primary) ' +
    (ratio * 270) + 'deg, var(--iot-lowest) ' + (ratio * 270) +
    'deg, var(--iot-lowest) 270deg, transparent 270deg)';
  sendCommand('${endpoint}', { value: clamped });
}`;
    }

    case 'color_picker':
      return `
window.__colorUpdate = function(id) {
  const r = parseInt(document.getElementById('red-' + id).value);
  const g = parseInt(document.getElementById('green-' + id).value);
  const b = parseInt(document.getElementById('blue-' + id).value);
  const preview = document.getElementById('color-preview-' + id);
  if (preview) {
    preview.style.background = 'rgb(' + r + ',' + g + ',' + b + ')';
    preview.style.boxShadow = '0 0 8px rgb(' + r + ',' + g + ',' + b + ')';
  }
  sendCommand('${endpoint}', { r: r, g: g, b: b });
};`;

    case 'dpad':
      return `
window.__dpadPress = function(id, dir, btn) {
  btn.style.background = 'var(--iot-primary)';
  btn.style.color = '#001f24';
  sendCommand('${endpoint}', { dir: dir });
};
window.__dpadRelease = function(btn) {
  btn.style.background = 'var(--iot-lowest)';
  btn.style.color = 'var(--iot-secondary)';
};`;

    case 'joystick_full':
      return `
let __joyDrag_${safeId} = false;
let __joyLastSend_${safeId} = 0;
window.__joyDown = function(id, ev) {
  __joyDrag_${safeId} = true;
  ev.preventDefault();
  updateJoyFromEvt(id, ev);
  document.addEventListener('mousemove', ${safeId}JMove);
  document.addEventListener('mouseup', ${safeId}JUp);
  document.addEventListener('touchmove', ${safeId}JMove, { passive: false });
  document.addEventListener('touchend', ${safeId}JUp);
};
function ${safeId}JMove(ev) {
  if (!__joyDrag_${safeId}) return;
  updateJoyFromEvt('${safeId}', ev);
}
function ${safeId}JUp() {
  __joyDrag_${safeId} = false;
  const knob = document.getElementById('joystick-knob-${safeId}');
  if (knob) {
    knob.style.left = 'calc(50% - 22px)';
    knob.style.top = 'calc(50% - 22px)';
  }
  const jx = document.getElementById('jx-${safeId}');
  const jy = document.getElementById('jy-${safeId}');
  if (jx) jx.textContent = '0';
  if (jy) jy.textContent = '0';
  sendCommand('${endpoint}', { x: 0, y: 0 });
  document.removeEventListener('mousemove', ${safeId}JMove);
  document.removeEventListener('mouseup', ${safeId}JUp);
  document.removeEventListener('touchmove', ${safeId}JMove);
  document.removeEventListener('touchend', ${safeId}JUp);
}
function updateJoyFromEvt(id, ev) {
  const track = document.getElementById('joystick-' + id);
  const knob = document.getElementById('joystick-knob-' + id);
  if (!track || !knob) return;
  const rect = track.getBoundingClientRect();
  const clientX = ev.touches ? ev.touches[0].clientX : ev.clientX;
  const clientY = ev.touches ? ev.touches[0].clientY : ev.clientY;
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  const halfW = rect.width / 2 - 22;
  const halfH = rect.height / 2 - 22;
  let dx = clientX - cx;
  let dy = clientY - cy;
  if (dx > halfW) dx = halfW;
  if (dx < -halfW) dx = -halfW;
  if (dy > halfH) dy = halfH;
  if (dy < -halfH) dy = -halfH;
  knob.style.left = 'calc(50% - 22px + ' + dx + 'px)';
  knob.style.top = 'calc(50% - 22px + ' + dy + 'px)';
  const x = Math.round(((dx / halfW) * 100));
  const y = Math.round(-((dy / halfH) * 100));
  const jx = document.getElementById('jx-' + id);
  const jy = document.getElementById('jy-' + id);
  if (jx) jx.textContent = x;
  if (jy) jy.textContent = y;
  const now = Date.now();
  if (now - __joyLastSend_${safeId} > 50) {
    sendCommand('${endpoint}', { x: x, y: y });
    __joyLastSend_${safeId} = now;
  }
}`;

    case 'joystick_x':
      return `
let __axisXDrag_${safeId} = false;
let __axisXValue_${safeId} = 0;
window.__axisDown = function(id, axis, ev) {
  __axisXDrag_${safeId} = true;
  ev.preventDefault();
  updateAxisFromEvt(id, axis, ev);
  document.addEventListener('mousemove', ${safeId}XMove);
  document.addEventListener('mouseup', ${safeId}XUp);
  document.addEventListener('touchmove', ${safeId}XMove, { passive: false });
  document.addEventListener('touchend', ${safeId}XUp);
};
function ${safeId}XMove(ev) { if (__axisXDrag_${safeId}) updateAxisFromEvt('${safeId}', 'x', ev); }
function ${safeId}XUp() {
  __axisXDrag_${safeId} = false;
  document.removeEventListener('mousemove', ${safeId}XMove);
  document.removeEventListener('mouseup', ${safeId}XUp);
  document.removeEventListener('touchmove', ${safeId}XMove);
  document.removeEventListener('touchend', ${safeId}XUp);
}
function updateAxisFromEvt(id, axis, ev) {
  const track = document.getElementById('track-' + axis + '-' + id);
  const thumb = document.getElementById('thumb-' + axis + '-' + id);
  const disp = document.getElementById('j' + axis + '-val-' + id);
  if (!track || !thumb) return;
  const rect = track.getBoundingClientRect();
  const clientY = ev.touches ? ev.touches[0].clientY : ev.clientY;
  const pct = Math.max(0, Math.min(100, ((clientY - rect.top) / rect.height) * 100));
  thumb.style.top = pct + '%';
  const val = Math.round(-((pct / 100) * 100));
  if (disp) disp.textContent = (val > 0 ? '+' : '') + val;
  thumb.textContent = (val > 0 ? '+' : '') + val;
  sendCommand('${endpoint}', { value: val });
}`;

    case 'joystick_y':
      return `
let __axisYDrag_${safeId} = false;
window.__axisDown = function(id, axis, ev) {
  if (axis !== 'y') return;
  __axisYDrag_${safeId} = true;
  ev.preventDefault();
  updateAxisYFromEvt(id, ev);
  document.addEventListener('mousemove', ${safeId}YMove);
  document.addEventListener('mouseup', ${safeId}YUp);
  document.addEventListener('touchmove', ${safeId}YMove, { passive: false });
  document.addEventListener('touchend', ${safeId}YUp);
};
function ${safeId}YMove(ev) { if (__axisYDrag_${safeId}) updateAxisYFromEvt('${safeId}', ev); }
function ${safeId}YUp() {
  __axisYDrag_${safeId} = false;
  document.removeEventListener('mousemove', ${safeId}YMove);
  document.removeEventListener('mouseup', ${safeId}YUp);
  document.removeEventListener('touchmove', ${safeId}YMove);
  document.removeEventListener('touchend', ${safeId}YUp);
}
function updateAxisYFromEvt(id, ev) {
  const track = document.getElementById('track-y-' + id);
  const thumb = document.getElementById('thumb-y-' + id);
  const disp = document.getElementById('jy-val-' + id);
  if (!track || !thumb) return;
  const rect = track.getBoundingClientRect();
  const clientX = ev.touches ? ev.touches[0].clientX : ev.clientX;
  const pct = Math.max(0, Math.min(100, ((clientX - rect.left) / rect.width) * 100));
  thumb.style.left = pct + '%';
  const val = Math.round(-((pct / 100) * 100));
  if (disp) disp.textContent = (val > 0 ? '+' : '') + val;
  thumb.textContent = (val > 0 ? '+' : '') + val;
  sendCommand('${endpoint}', { value: val });
}`;

    case 'number_input': {
      const min = ctrl.min ?? 0;
      const max = ctrl.max ?? 255;
      const step = ctrl.step ?? 1;
      return `
let __num_${safeId} = ${ctrl.value ?? min};
window.__numStep = function(id, delta) {
  const input = document.getElementById('num-' + id);
  if (!input) return;
  let v = parseFloat(input.value) + delta;
  if (v < ${min}) v = ${min};
  if (v > ${max}) v = ${max};
  input.value = v;
  sendCommand('${endpoint}', { value: v });
};
window.__numSet = function(id, val) {
  let v = parseFloat(val);
  if (isNaN(v)) v = ${min};
  if (v < ${min}) v = ${min};
  if (v > ${max}) v = ${max};
  const input = document.getElementById('num-' + id);
  if (input) input.value = v;
  sendCommand('${endpoint}', { value: v });
};`;
    }

    case 'stepper': {
      const min = ctrl.min ?? 0;
      const max = ctrl.max ?? 100;
      const step = ctrl.step ?? 1;
      return `
let __step_${safeId} = 0;
window.__stepperPress = function(id, dir) {
  __step_${safeId} += dir;
  if (__step_${safeId} < ${min}) __step_${safeId} = ${min};
  if (__step_${safeId} > ${max}) __step_${safeId} = ${max};
  const disp = document.getElementById('step-val-' + id);
  if (disp) disp.textContent = __step_${safeId};
  sendCommand('${endpoint}', { value: __step_${safeId} });
};`;
    }

    case 'checkbox':
      return `
window.__checkboxToggle = function(id) {
  const box = document.getElementById('check-box-' + id);
  if (!box) return;
  const wasOn = box.textContent === '✓';
  if (wasOn) {
    box.textContent = '';
    box.style.background = 'transparent';
    sendCommand('${endpoint}', { state: ${offVal} });
  } else {
    box.textContent = '✓';
    box.style.background = 'var(--iot-primary)';
    sendCommand('${endpoint}', { state: ${onVal} });
  }
};`;

    case 'icon_button':
      return `
window.__iconBtnPress = function(id) {
  const btn = document.getElementById('icon-btn-' + id);
  if (!btn) return;
  const wasActive = btn.classList.contains('active') || btn.style.background.includes('--iot-primary');
  if (!wasActive) {
    btn.classList.add('active');
    btn.style.background = 'var(--iot-primary)';
    btn.style.borderColor = 'var(--iot-primary)';
    btn.style.color = '#001f24';
    btn.style.boxShadow = '0 0 14px rgba(0, 229, 255, 0.5)';
    sendCommand('${endpoint}', { state: ${onVal} });
  } else {
    btn.classList.remove('active');
    btn.style.background = 'var(--iot-lowest)';
    btn.style.borderColor = 'var(--iot-outline)';
    btn.style.color = 'var(--iot-primary)';
    btn.style.boxShadow = 'none';
    sendCommand('${endpoint}', { state: ${offVal} });
  }
};`;

    case 'touch_pad':
      return `
window.__touchDown = function(id) {
  const btn = document.getElementById('touch-' + id);
  if (!btn) return;
  btn.style.background = 'var(--iot-primary)';
  btn.style.color = '#001f24';
  btn.textContent = 'Đang chạm';
  sendCommand('${endpoint}', { state: ${onVal} });
};
window.__touchUp = function(id) {
  const btn = document.getElementById('touch-' + id);
  if (!btn) return;
  btn.style.background = 'transparent';
  btn.style.color = 'var(--iot-primary)';
  btn.textContent = 'Chạm giữ';
  sendCommand('${endpoint}', { state: ${offVal} });
};`;

    default:
      return '';
  }
}
