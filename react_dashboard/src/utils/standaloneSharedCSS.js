/**
 * Shared CSS embedded in standalone ESP HTML output.
 * Mirrors the widget preview styles from
 *   react_dashboard/src/components/StandaloneControllerBuilder/WidgetPreview.js
 * and
 *   react_dashboard/src/styles/standalone-controller.css
 * so that what the user sees in the Builder canvas matches what the ESP serves.
 */
export const STANDALONE_CANVAS_CSS = `
  :root {
    --iot-bg:           #0b1326;
    --iot-panel:        #131b2e;
    --iot-high:         #222a3d;
    --iot-lowest:       #060e20;
    --iot-primary:      #00e5ff;
    --iot-primary-dim:  #0891b2;
    --iot-secondary:    #c1c6d7;
    --iot-on-surface:   #dae2fd;
    --iot-outline:      rgba(132, 147, 150, 0.2);
    --iot-success:      #10b981;
    --iot-warn:         #f59e0b;
    --iot-danger:       #ef4444;
    --font-sans:        "Geist", "Inter", system-ui, sans-serif;
    --font-mono:        "JetBrains Mono", monospace;
  }

  * {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
    -webkit-tap-highlight-color: transparent;
  }

  body {
    font-family: var(--font-sans);
    background-color: var(--iot-bg);
    color: var(--iot-on-surface);
    overflow-x: hidden;
  }

  .device-container {
    position: relative;
    background: var(--iot-panel);
    margin: 0 auto;
    overflow: hidden;
  }

  .controls-canvas {
    position: relative;
    width: 100%;
    height: 100%;
    background-color: var(--iot-panel);
    background-image:
      linear-gradient(rgba(255, 255, 255, 0.03) 1px, transparent 1px),
      linear-gradient(90deg, rgba(255, 255, 255, 0.03) 1px, transparent 1px);
    background-size: 40px 40px;
  }

  /* ===== Canvas widget (matches Builder canvas) ===== */
  .sc-canvas-widget {
    position: absolute;
    background: var(--iot-lowest);
    border: 2px solid rgba(132, 147, 150, 0.2);
    border-radius: 12px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    padding: 4px;
    gap: 2px;
    user-select: none;
  }

  /* ===== Widget preview helpers ===== */
  .sc-wp-range {
    -webkit-appearance: none;
    appearance: none;
    height: 8px;
    background: var(--iot-lowest);
    border-radius: 4px;
    outline: none;
    padding: 0;
    margin: 0;
  }
  .sc-wp-range::-webkit-slider-thumb {
    -webkit-appearance: none;
    appearance: none;
    width: 18px;
    height: 18px;
    border-radius: 50%;
    background: var(--iot-primary);
    cursor: pointer;
    border: 2px solid var(--iot-bg);
    box-shadow: 0 0 4px rgba(0, 229, 255, 0.4);
  }
  .sc-wp-range::-moz-range-thumb {
    width: 18px;
    height: 18px;
    border-radius: 50%;
    background: var(--iot-primary);
    cursor: pointer;
    border: 2px solid var(--iot-bg);
  }
  .sc-wp-range:focus { outline: none; }

  .sc-wp-value-display {
    font-size: 12px;
    font-weight: 600;
    color: var(--iot-primary);
    text-align: center;
    font-family: var(--font-mono);
    margin-top: 2px;
  }

  .sc-wp-label {
    font-size: 10px;
    color: var(--iot-secondary);
    text-align: center;
    margin-top: 2px;
  }

  .sc-wp-joystick-values {
    display: flex;
    gap: 12px;
    font-size: 10px;
    color: var(--iot-outline);
    font-family: var(--font-mono);
  }

  .sc-wp-color-preview {
    border-radius: 6px;
    flex-shrink: 0;
  }

  .sc-wp-num-btn,
  .sc-wp-stepper-btn {
    width: 30px;
    height: 30px;
    border-radius: 6px;
    border: 1px solid var(--iot-outline);
    background: var(--iot-lowest);
    color: var(--iot-primary);
    font-size: 16px;
    font-weight: 700;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: var(--font-sans);
  }
  .sc-wp-num-btn:hover,
  .sc-wp-stepper-btn:hover {
    background: var(--iot-primary);
    color: #001f24;
  }
  .sc-wp-stepper-btn.dec:hover { background: var(--iot-danger); color: white; }
  .sc-wp-stepper-btn.inc:hover { background: var(--iot-success); color: white; }

  .sc-wp-num-input {
    width: 50px;
    padding: 4px 6px;
    border-radius: 6px;
    border: 1px solid var(--iot-outline);
    background: var(--iot-lowest);
    color: var(--iot-on-surface);
    font-size: 13px;
    font-family: var(--font-mono);
    text-align: center;
  }
  .sc-wp-num-input:focus {
    outline: none;
    border-color: var(--iot-primary);
  }

  .sc-wp-toggle-track {
    box-shadow: inset 0 0 4px rgba(0, 0, 0, 0.4);
  }
  .sc-wp-toggle-track.on {
    box-shadow: 0 0 8px rgba(16, 185, 129, 0.4);
  }

  .sc-wp-dpad-btn {
    user-select: none;
    -webkit-user-select: none;
  }
  .sc-wp-dpad-btn:focus { outline: none; }

  .sc-wp-default-icon {
    font-size: 24px;
  }
  .sc-wp-default-label {
    font-size: 10px;
    color: var(--iot-outline);
  }

  /* ===== Toast (used by sendCommand feedback) ===== */
  .toast {
    position: fixed;
    bottom: 20px;
    left: 50%;
    transform: translateX(-50%);
    background: var(--iot-panel);
    color: var(--iot-on-surface);
    padding: 8px 16px;
    border-radius: 8px;
    border: 1px solid var(--iot-primary);
    font-size: 13px;
    font-family: var(--font-sans);
    z-index: 1000;
    opacity: 0;
    transition: opacity 0.3s;
    pointer-events: none;
  }
  .toast.show { opacity: 1; }
`;