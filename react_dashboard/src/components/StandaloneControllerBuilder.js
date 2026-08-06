import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { generateStandaloneHTML } from '../utils/standaloneHtmlGenerator';
import { generateStandaloneESP32, generateStandaloneESP8266 } from '../utils/standaloneESPGenerator';
import WidgetPreview from './StandaloneControllerBuilder/WidgetPreview';
import WidgetConfigPanel from './StandaloneControllerBuilder/WidgetConfigPanel';
import '../styles/standalone-controller.css';

const CELL_SIZE = 40;

// Device presets for responsive sizing (like Chrome DevTools)
const DEVICE_PRESETS = [
  { id: 'iphone-se', label: 'iPhone SE', width: 375, height: 667 },
  { id: 'iphone-12', label: 'iPhone 12', width: 390, height: 844 },
  { id: 'iphone-14-pro', label: 'iPhone 14 Pro', width: 393, height: 852 },
  { id: 'pixel-5', label: 'Pixel 5', width: 393, height: 851 },
  { id: 'galaxy-s20', label: 'Galaxy S20', width: 360, height: 800 },
  { id: 'custom', label: 'Custom', width: 360, height: 640 },
];

// Widget types with default sizes (in grid units)
const WIDGET_TYPES = [
  { type: 'joystick_full', label: 'Joystick (X,Y)', icon: '🕹️', width: 4, height: 4, endpoints: ['/joystick'], defaultVirtualPin: 0, virtualPinCount: 2 },
  { type: 'joystick_x', label: 'Joystick X', icon: '↔️', width: 3, height: 3, endpoints: ['/joystick/x'], defaultVirtualPin: 2, virtualPinCount: 1 },
  { type: 'joystick_y', label: 'Joystick Y', icon: '↕️', width: 3, height: 3, endpoints: ['/joystick/y'], defaultVirtualPin: 3, virtualPinCount: 1 },
  { type: 'color_picker', label: 'Color Picker', icon: '🎨', width: 4, height: 3, endpoints: ['/rgb'], defaultVirtualPin: 4, virtualPinCount: 3 },
  { type: 'touch_pad', label: 'Touch Pad', icon: '👆', width: 2, height: 2, endpoints: ['/touch'], defaultVirtualPin: 7, virtualPinCount: 1 },
  { type: 'dpad', label: 'D-pad', icon: '🎮', width: 3, height: 3, endpoints: ['/dpad'], defaultVirtualPin: 8, virtualPinCount: 4 },
  { type: 'slider', label: 'Slider', icon: '━', width: 4, height: 2, endpoints: ['/slider'], defaultVirtualPin: 12, virtualPinCount: 1, min: 0, max: 255 },
  { type: 'knob', label: 'Knob/Dial', icon: '◎', width: 3, height: 3, endpoints: ['/knob'], defaultVirtualPin: 13, virtualPinCount: 1, min: 0, max: 255 },
  { type: 'number_input', label: 'Number Input', icon: '🔢', width: 3, height: 2, endpoints: ['/number'], defaultVirtualPin: 14, virtualPinCount: 1, min: 0, max: 255 },
  { type: 'stepper', label: 'Stepper', icon: '±', width: 3, height: 2, endpoints: ['/stepper'], defaultVirtualPin: 15, virtualPinCount: 2, min: 0, max: 100 },
  { type: 'toggle', label: 'Toggle Switch', icon: '⚡', width: 2, height: 2, endpoints: ['/toggle'], defaultVirtualPin: 16, virtualPinCount: 1, min: 0, max: 1 },
  { type: 'button', label: 'Button ON/OFF', icon: '🔘', width: 2, height: 2, endpoints: ['/button'], defaultVirtualPin: 17, virtualPinCount: 1, min: 0, max: 1 },
  { type: 'checkbox', label: 'Checkbox', icon: '☑️', width: 2, height: 2, endpoints: ['/checkbox'], defaultVirtualPin: 18, virtualPinCount: 1, min: 0, max: 1 },
  { type: 'icon_button', label: 'Icon Button', icon: '💡', width: 2, height: 2, endpoints: ['/icon'], defaultVirtualPin: 19, virtualPinCount: 1, min: 0, max: 1 },
];

// Min grid sizes (cells) per widget type — prevents widgets from being resized too small to render meaningfully
const MIN_SIZES = {
  joystick_full: { w: 3, h: 3 },
  joystick_x: { w: 2, h: 1 },
  joystick_y: { w: 2, h: 1 },
  color_picker: { w: 3, h: 3 },
  touch_pad: { w: 2, h: 2 },
  dpad: { w: 3, h: 3 },
  slider: { w: 2, h: 1 },
  knob: { w: 2, h: 2 },
  number_input: { w: 2, h: 1 },
  stepper: { w: 2, h: 1 },
  toggle: { w: 1, h: 1 },
  button: { w: 1, h: 1 },
  checkbox: { w: 1, h: 1 },
  icon_button: { w: 1, h: 1 },
};

const StandaloneControllerBuilder = ({ device, config, onSave, onBack }) => {
  const innerDevice = device?.device;
  const deviceCode = innerDevice?.ma_thiet_bi || device?.ma_thiet_bi || innerDevice?.device_id || device?.device_id || 'ESP001';

  // State
  const [orientation, setOrientation] = useState(config?.orientation || 'portrait');
  const [boardType, setBoardType] = useState(config?.boardType || 'esp32');
  const [apSsid, setApSsid] = useState(() => config?.apSsid || `ESP_Control_${deviceCode.slice(0, 8)}`);
  const [apPassword, setApPassword] = useState(() => config?.apPassword || '12345678');
  const [serverPort, setServerPort] = useState(() => config?.serverPort || 80);
  const [serverEndpoint, setServerEndpoint] = useState(() => config?.serverEndpoint || 'control');
  const [controls, setControls] = useState(() => config?.controls || []);
  const [selectedId, setSelectedId] = useState(null);
  const [draggingId, setDraggingId] = useState(null);
  const [draggingType, setDraggingType] = useState(null);
  const [previewHtml, setPreviewHtml] = useState(null);
  const [showPreview, setShowPreview] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState(null);

  // Device preset state
  const [devicePreset, setDevicePreset] = useState(config?.devicePreset || 'iphone-12');
  const [customWidth, setCustomWidth] = useState(config?.customWidth || 360);
  const [customHeight, setCustomHeight] = useState(config?.customHeight || 640);

  // IP configuration for ESP8266 AP mode
  const [apLocalIp, setApLocalIp] = useState(config?.apLocalIp || '192.168.4.1');
  const [apGateway, setApGateway] = useState(config?.apGateway || '192.168.4.1');
  const [apSubnet, setApSubnet] = useState(config?.apSubnet || '255.255.255.0');

  // Zoom state
  const [zoom, setZoom] = useState(1);

  // Zoom handlers
  const zoomIn = useCallback(() => {
    setZoom(z => Math.min(z + 0.1, 2));
  }, []);

  const zoomOut = useCallback(() => {
    setZoom(z => Math.max(z - 0.1, 0.5));
  }, []);

  const zoomReset = useCallback(() => {
    setZoom(1);
  }, []);

  // Refs
  const canvasRef = useRef(null);
  const dragStartRef = useRef({ x: 0, y: 0 });
  const dragWidgetStartRef = useRef({ x: 0, y: 0 });
  const dragResizeStartRef = useRef({ w: 0, h: 0 });
  const rafRef = useRef(null);

  // Resize state
  const [resizingId, setResizingId] = useState(null);
  const [resizeCorner, setResizeCorner] = useState(null); // 'nw' | 'ne' | 'sw' | 'se'

  // Get current device dimensions
  const currentPreset = DEVICE_PRESETS.find(d => d.id === devicePreset) || DEVICE_PRESETS[1];
  const screenWidth = devicePreset === 'custom' ? customWidth : currentPreset.width;
  const screenHeight = devicePreset === 'custom' ? customHeight : currentPreset.height;

  // Effective dimensions: landscape swaps W/H so phone renders horizontally
  const effectiveWidth = orientation === 'portrait' ? screenWidth : screenHeight;
  const effectiveHeight = orientation === 'portrait' ? screenHeight : screenWidth;

  // Grid dimensions: always use max dimension so both orientations have same cell count
  const maxDim = Math.max(screenWidth, screenHeight);
  const gridCols = Math.ceil(maxDim / CELL_SIZE);
  const gridRows = Math.ceil(maxDim / CELL_SIZE);

  // Cache widget positions to prevent unnecessary re-renders
  const widgetPositions = useMemo(() => {
    const positions = new Map();
    controls.forEach(ctrl => {
      positions.set(ctrl.id, {
        x: ctrl.x * CELL_SIZE,
        y: ctrl.y * CELL_SIZE
      });
    });
    return positions;
  }, [controls]);

  // Load config from prop
  useEffect(() => {
    if (config) {
      setOrientation(config.orientation || 'portrait');
      setBoardType(config.boardType || 'esp32');
      setApSsid(config.apSsid || `ESP_Control_${deviceCode.slice(0, 8)}`);
      setApPassword(config.apPassword || '12345678');
      setServerPort(config.serverPort || 80);
      setServerEndpoint(config.serverEndpoint || 'control');
      setControls(config.controls || []);
      setDevicePreset(config.devicePreset || 'iphone-12');
      setCustomWidth(config.customWidth || 360);
      setCustomHeight(config.customHeight || 640);
      setApLocalIp(config.apLocalIp || '192.168.4.1');
      setApGateway(config.apGateway || '192.168.4.1');
      setApSubnet(config.apSubnet || '255.255.255.0');
    }
  }, [config, deviceCode]);

  // Convert grid to pixels
  const gridToPixels = useCallback((gridX, gridY) => ({
    x: gridX * CELL_SIZE,
    y: gridY * CELL_SIZE
  }), []);

  // Convert pixels to grid
  const pixelsToGrid = useCallback((pixelX, pixelY) => ({
    x: Math.max(0, Math.min(gridCols - 1, Math.floor(pixelX / CELL_SIZE))),
    y: Math.max(0, Math.min(gridRows - 1, Math.floor(pixelY / CELL_SIZE)))
  }), [gridCols, gridRows]);

  // Handle drag start from palette
  const handlePaletteDragStart = useCallback((e, widgetType) => {
    e.dataTransfer.setData('widgetType', widgetType);
    e.dataTransfer.effectAllowed = 'copy';
    setDraggingType('palette');
  }, []);

  // Handle canvas drag over
  const handleCanvasDragOver = useCallback((e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  }, []);

  // Handle drop on canvas
  const handleCanvasDrop = useCallback((e) => {
    e.preventDefault();
    const widgetType = e.dataTransfer.getData('widgetType');
    if (!widgetType || !canvasRef.current) return;

    const widgetInfo = WIDGET_TYPES.find(w => w.type === widgetType);
    if (!widgetInfo) return;

    const rect = canvasRef.current.getBoundingClientRect();
    const pixelX = e.clientX - rect.left;
    const pixelY = e.clientY - rect.top;

    // Adjust for notch area (skip first row for notch)
    const gridPos = pixelsToGrid(pixelX, Math.max(40, pixelY));
    const clampedX = Math.max(0, Math.min(gridCols - widgetInfo.width, gridPos.x));
    const clampedY = Math.max(0, Math.min(gridRows - widgetInfo.height, gridPos.y));

    const newControl = {
      id: `w_${Date.now()}_${Math.floor(Math.random() * 100000)}`,
      type: widgetType,
      label: widgetInfo.label,
      icon: widgetInfo.icon,
      x: clampedX,
      y: clampedY,
      width: widgetInfo.width,
      height: widgetInfo.height,
      pinType: 'virtual', // Mặc định là virtual pin
      virtualPin: widgetInfo.defaultVirtualPin ?? 0,
      gpio: [], // GPIO chỉ dùng khi pinType = 'physical'
      gpioName: `${widgetType}_${Date.now() % 10000}`,
      gpioMode: 'output',
      min: widgetInfo.min ?? 0,
      max: widgetInfo.max ?? 255,
      step: 1,
      value: 0,
      endpoints: widgetInfo.endpoints,
      onValue: 1,
      offValue: 0,
      invert: false,
      deadzone: 5,
      sensitivity: 1.0,
      customIcon: widgetInfo.icon,
      customColor: '#00e5ff',
      orientation: widgetType === 'joystick_x' ? 'horizontal' : (widgetType === 'joystick_y' ? 'vertical' : 'both'),
      autoCenter: true,
    };

    setControls(prev => [...prev, newControl]);
    setSelectedId(newControl.id);
    setDraggingType(null);
  }, [pixelsToGrid, gridCols, gridRows]);

  // Handle widget config update
  const handleUpdateControl = useCallback((ctrlId, updatedFields) => {
    setControls(prev => prev.map(c =>
      c.id === ctrlId
        ? { ...c, ...updatedFields }
        : c
    ));
  }, []);

  // Handle widget selection - stable callback for WidgetPreview
  const handleWidgetSelect = useCallback((ctrlId) => {
    setSelectedId(ctrlId);
  }, []);

  // Handle canvas widget drag start
  const handleCanvasWidgetMouseDown = useCallback((e, ctrlId) => {
    e.stopPropagation();
    const ctrl = controls.find(c => c.id === ctrlId);
    if (!ctrl) return;

    setSelectedId(ctrlId);
    setDraggingId(ctrlId);
    setDraggingType('canvas');

    const rect = canvasRef.current.getBoundingClientRect();
    const pixelPos = gridToPixels(ctrl.x, ctrl.y);

    dragStartRef.current = { x: e.clientX, y: e.clientY };
    dragWidgetStartRef.current = { x: pixelPos.x, y: pixelPos.y };

    document.body.style.userSelect = 'none';
  }, [controls, gridToPixels]);

  // Handle resize handle drag start
  const handleResizeStart = useCallback((e, ctrlId, corner) => {
    e.stopPropagation();
    e.preventDefault();
    const ctrl = controls.find(c => c.id === ctrlId);
    if (!ctrl) return;

    setSelectedId(ctrlId);
    setResizingId(ctrlId);
    setResizeCorner(corner);

    dragStartRef.current = { x: e.clientX, y: e.clientY };
    dragResizeStartRef.current = { w: ctrl.width, h: ctrl.height };

    document.body.style.userSelect = 'none';
  }, [controls]);

  // Handle touch resize start (for mobile)
  const handleTouchResizeStart = useCallback((e, ctrlId, corner) => {
    e.stopPropagation();
    e.preventDefault();
    const ctrl = controls.find(c => c.id === ctrlId);
    if (!ctrl || !e.touches?.[0]) return;

    setSelectedId(ctrlId);
    setResizingId(ctrlId);
    setResizeCorner(corner);

    const touch = e.touches[0];
    dragStartRef.current = { x: touch.clientX, y: touch.clientY };
    dragResizeStartRef.current = { w: ctrl.width, h: ctrl.height };

    document.body.style.userSelect = 'none';
  }, [controls]);

  // Handle mouse move for canvas widget dragging or resizing
  useEffect(() => {
    if (!draggingId && !resizingId) return;

    const getPoint = (e) => {
      if (e.touches && e.touches[0]) {
        return { x: e.touches[0].clientX, y: e.touches[0].clientY };
      }
      return { x: e.clientX, y: e.clientY };
    };

    const handleMouseMove = (e) => {
      if (rafRef.current) return;
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null;
        const point = getPoint(e);

        if (resizingId) {
          const ctrl = controls.find(c => c.id === resizingId);
          if (!ctrl) return;

          const minSize = MIN_SIZES[ctrl.type] || { w: 1, h: 1 };
          const deltaX = point.x - dragStartRef.current.x;
          const deltaY = point.y - dragStartRef.current.y;

          // For nw/sw corners, width grows negative→expanded when dragging right; for ne/se, grow positive.
          // For simplicity, all 4 corners extend toward bottom-right (matches natural mouse-drag-down behavior).
          const newW = Math.max(minSize.w, Math.min(gridCols - ctrl.x, dragResizeStartRef.current.w + Math.round(deltaX / CELL_SIZE)));
          const newH = Math.max(minSize.h, Math.min(gridRows - ctrl.y, dragResizeStartRef.current.h + Math.round(deltaY / CELL_SIZE)));

          setControls(prev => prev.map(c =>
            c.id === resizingId
              ? { ...c, width: newW, height: newH }
              : c
          ));
          return;
        }

        if (draggingType !== 'canvas' || !draggingId) return;
        const ctrl = controls.find(c => c.id === draggingId);
        if (!ctrl) return;

        const deltaX = point.x - dragStartRef.current.x;
        const deltaY = point.y - dragStartRef.current.y;

        let newPixelX = dragWidgetStartRef.current.x + deltaX;
        let newPixelY = dragWidgetStartRef.current.y + deltaY;

        const newGridPos = pixelsToGrid(newPixelX, newPixelY);
        const clampedX = Math.max(0, Math.min(gridCols - ctrl.width, newGridPos.x));
        const clampedY = Math.max(0, Math.min(gridRows - ctrl.height, newGridPos.y));

        setControls(prev => prev.map(c =>
          c.id === draggingId
            ? { ...c, x: clampedX, y: clampedY }
            : c
        ));
      });
    };

    const handleEnd = () => {
      document.body.style.userSelect = '';
      setDraggingId(null);
      setDraggingType(null);
      setResizingId(null);
      setResizeCorner(null);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleEnd);
    window.addEventListener('touchmove', handleMouseMove, { passive: false });
    window.addEventListener('touchend', handleEnd);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleEnd);
      window.removeEventListener('touchmove', handleMouseMove);
      window.removeEventListener('touchend', handleEnd);
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [draggingType, draggingId, resizingId, controls, pixelsToGrid, gridCols, gridRows]);

  // Delete control
  const deleteControl = useCallback((id) => {
    setControls(prev => prev.filter(c => c.id !== id));
    if (selectedId === id) setSelectedId(null);
  }, [selectedId]);

  // Clear canvas
  const clearCanvas = useCallback(() => {
    if (controls.length === 0) return;
    if (confirm('Xóa tất cả widget trên canvas?')) {
      setControls([]);
      setSelectedId(null);
    }
  }, [controls.length]);

  // Generate preview HTML
  const handlePreview = useCallback(() => {
    const html = generateStandaloneHTML(controls, { 
      ssid: apSsid, 
      devicePreset,
      customWidth,
      customHeight,
      orientation
    });
    setPreviewHtml(html);
    setShowPreview(true);
  }, [controls, apSsid, devicePreset, customWidth, customHeight, orientation]);

  // Export code
  const handleExport = useCallback(() => {
    if (controls.length === 0) {
      alert('Vui lòng thêm ít nhất một điều khiển');
      return;
    }
    const html = generateStandaloneHTML(controls, { 
      ssid: apSsid, 
      devicePreset,
      customWidth,
      customHeight,
      orientation
    });
    const inoCode = boardType === 'esp8266'
      ? generateStandaloneESP8266(controls, html, { ssid: apSsid, password: apPassword, serverPort, serverEndpoint, apLocalIp, apGateway, apSubnet })
      : generateStandaloneESP32(controls, html, { ssid: apSsid, password: apPassword, serverPort, serverEndpoint, apLocalIp, apGateway, apSubnet });

    const blob = new Blob([inoCode], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${deviceCode}_standalone_${boardType}.ino`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [controls, apSsid, apPassword, serverPort, serverEndpoint, deviceCode, orientation, boardType, apLocalIp, apGateway, apSubnet]);

  // Save config
  const handleSave = useCallback(async () => {
    if (controls.length === 0) {
      setSaveMsg({ type: 'error', text: 'Vui lòng thêm ít nhất một điều khiển' });
      return;
    }
    setSaving(true);
    setSaveMsg(null);
    try {
      const configData = {
        orientation,
        boardType,
        devicePreset,
        customWidth,
        customHeight,
        apSsid,
        apPassword,
        serverPort,
        serverEndpoint,
        apLocalIp,
        apGateway,
        apSubnet,
        controls,
        updatedAt: new Date().toISOString()
      };
      await onSave?.(configData);
      setSaveMsg({ type: 'success', text: 'Đã lưu cấu hình thành công!' });
      setTimeout(() => setSaveMsg(null), 3000);
    } catch (err) {
      const msg = err?.response?.data?.detail || err?.message || 'Lỗi không xác định';
      setSaveMsg({ type: 'error', text: 'Lưu thất bại: ' + msg });
    } finally {
      setSaving(false);
    }
  }, [orientation, boardType, apSsid, apPassword, serverPort, serverEndpoint, apLocalIp, apGateway, apSubnet, controls, onSave]);

  // Export JSON
  const handleExportJson = useCallback(() => {
    const configData = {
      schemaVersion: '1.0',
      version: '1.0',
      boardType,
      orientation,
      deviceCode,
      devicePreset,
      customWidth,
      customHeight,
      apSsid,
      apPassword,
      serverPort,
      serverEndpoint,
      apLocalIp,
      apGateway,
      apSubnet,
      controls,
      exportedAt: new Date().toISOString()
    };
    const blob = new Blob([JSON.stringify(configData, null, 2)], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${deviceCode}_standalone_config.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [orientation, boardType, deviceCode, devicePreset, customWidth, customHeight, apSsid, apPassword, serverPort, serverEndpoint, apLocalIp, apGateway, apSubnet, controls]);

  // Import JSON
  const handleImportJson = useCallback(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const data = JSON.parse(event.target.result);
          if (data.schemaVersion && data.schemaVersion !== '1.0') {
            setSaveMsg({ type: 'error', text: `Phiên bản schema không hỗ trợ: ${data.schemaVersion}` });
            setTimeout(() => setSaveMsg(null), 4000);
            return;
          }
          if (data.boardType) setBoardType(data.boardType);
          if (data.orientation) setOrientation(data.orientation);
          if (data.devicePreset) setDevicePreset(data.devicePreset);
          if (data.customWidth) setCustomWidth(data.customWidth);
          if (data.customHeight) setCustomHeight(data.customHeight);
          if (data.apSsid) setApSsid(data.apSsid);
          if (data.apPassword) setApPassword(data.apPassword);
          if (data.serverPort) setServerPort(data.serverPort);
          if (data.serverEndpoint) setServerEndpoint(data.serverEndpoint);
          if (data.apLocalIp) setApLocalIp(data.apLocalIp);
          if (data.apGateway) setApGateway(data.apGateway);
          if (data.apSubnet) setApSubnet(data.apSubnet);
          if (Array.isArray(data.controls)) setControls(data.controls);
          setSaveMsg({ type: 'success', text: 'Đã import cấu hình từ file!' });
          setTimeout(() => setSaveMsg(null), 3000);
        } catch (err) {
          setSaveMsg({ type: 'error', text: 'File không hợp lệ: ' + (err.message || 'Lỗi parse JSON') });
        }
      };
      reader.readAsText(file);
    };
    input.click();
  }, []);

  return (
    <div className="sc-builder">
        {/* Toolbar */}
        <div className="sc-toolbar">
          {/* Device preset selector */}
          <div className="sc-device-select">
            <select
              value={devicePreset}
              onChange={(e) => setDevicePreset(e.target.value)}
              title="Chọn thiết bị"
            >
              {DEVICE_PRESETS.map(preset => (
                <option key={preset.id} value={preset.id}>
                  {preset.label} ({preset.width}×{preset.height})
                </option>
              ))}
            </select>
            {devicePreset === 'custom' && (
              <div className="sc-device-custom">
                <input
                  type="number"
                  value={customWidth}
                  onChange={(e) => setCustomWidth(parseInt(e.target.value) || 360)}
                  min={200}
                  max={800}
                  title="Chiều rộng"
                />
                <span>×</span>
                <input
                  type="number"
                  value={customHeight}
                  onChange={(e) => setCustomHeight(parseInt(e.target.value) || 640)}
                  min={300}
                  max={1200}
                  title="Chiều cao"
                />
              </div>
            )}
          </div>

          {/* Orientation toggle */}
          <div className="sc-toolbar-group">
            <div className="sc-orientation-toggle">
              <button
                className={`sc-orientation-btn ${orientation === 'portrait' ? 'active' : ''}`}
                onClick={() => setOrientation('portrait')}
                title="Hướng dọc"
              >
                <span className="icon">📱</span>
              </button>
              <button
                className={`sc-orientation-btn ${orientation === 'landscape' ? 'active landscape' : ''}`}
                onClick={() => setOrientation('landscape')}
                title="Hướng ngang"
              >
                <span className="icon">📱</span>
              </button>
            </div>
          </div>

          <div className="sc-wifi-inputs">
            <div className="sc-wifi-input">
              <label>Board</label>
              <select
                value={boardType}
                onChange={(e) => setBoardType(e.target.value)}
                title="Select board type"
              >
                <option value="esp32">ESP32</option>
                <option value="esp8266">ESP8266</option>
              </select>
            </div>
            <div className="sc-wifi-input">
              <label>SSID</label>
              <input
                type="text"
                value={apSsid}
                placeholder="AP SSID"
                onChange={(e) => setApSsid(e.target.value)}
              />
            </div>
            <div className="sc-wifi-input">
              <label>Password</label>
              <input
                type="text"
                value={apPassword}
                placeholder="AP password"
                onChange={(e) => setApPassword(e.target.value)}
              />
            </div>
            <div className="sc-wifi-input">
              <label>Port</label>
              <input
                type="number"
                value={serverPort}
                onChange={(e) => setServerPort(parseInt(e.target.value) || 80)}
                placeholder="80"
                min={1}
                max={65535}
              />
            </div>
            <div className="sc-wifi-input sc-endpoint-input">
              <label>Endpoint</label>
              <input
                type="text"
                value={serverEndpoint}
                onChange={(e) => setServerEndpoint(e.target.value.replace(/[^a-zA-Z0-9_-]/g, ''))}
                placeholder="control"
              />
            </div>
            {(boardType === 'esp8266' || boardType === 'esp32') && (
              <>
                <div className="sc-wifi-input">
                  <label>Local IP</label>
                  <input
                    type="text"
                    value={apLocalIp}
                    onChange={(e) => setApLocalIp(e.target.value)}
                    placeholder="192.168.4.1"
                    pattern="^(192\.168\.\d{1,3}\.\d{1,3})$"
                    title="Local IP (192.168.x.x)"
                  />
                </div>
                <div className="sc-wifi-input">
                  <label>Gateway</label>
                  <input
                    type="text"
                    value={apGateway}
                    onChange={(e) => setApGateway(e.target.value)}
                    placeholder="192.168.4.1"
                    pattern="^(192\.168\.\d{1,3}\.\d{1,3})$"
                    title="Gateway IP"
                  />
                </div>
                <div className="sc-wifi-input">
                  <label>Subnet</label>
                  <input
                    type="text"
                    value={apSubnet}
                    onChange={(e) => setApSubnet(e.target.value)}
                    placeholder="255.255.255.0"
                    pattern="^(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$"
                    title="Subnet Mask"
                  />
                </div>
              </>
            )}
          </div>

          <button
            className="sc-btn sc-btn-secondary sc-btn-icon"
            onClick={clearCanvas}
            disabled={controls.length === 0}
            title="Xóa tất cả widget"
          >
            🗑️
          </button>

          <div className="sc-zoom-controls">
            <button onClick={zoomOut} title="Thu nhỏ">−</button>
            <span onClick={zoomReset} style={{ cursor: 'pointer' }}>{Math.round(zoom * 100)}%</span>
            <button onClick={zoomIn} title="Phóng to">+</button>
          </div>
        </div>

        {/* Main content */}
        <div className="sc-main">
          {/* Widget Palette */}
          <div className="sc-palette">
            <div className="sc-palette-title">Kéo widget vào màn hình</div>
            <div className="sc-palette-widgets">
              {WIDGET_TYPES.map(widget => (
                <div
                  key={widget.type}
                  className="sc-palette-widget"
                  draggable
                  onDragStart={(e) => handlePaletteDragStart(e, widget.type)}
                >
                  <span className="sc-palette-widget-icon">{widget.icon}</span>
                  <div className="sc-palette-widget-info">
                    <div className="sc-palette-widget-label">{widget.label}</div>
                    <div className="sc-palette-widget-size">{widget.width}×{widget.height}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Phone Canvas Area */}
          <div className="sc-canvas-area">
            <div
              className={`sc-phone-frame ${orientation}`}
              style={{
                width: effectiveWidth,
                height: effectiveHeight,
                transform: `scale(${zoom})`,
                transformOrigin: 'center center',
              }}
            >
              <div className="sc-phone-notch" />
              <div className="sc-phone-screen">
                <div
                  ref={canvasRef}
                  className="sc-phone-canvas"
                  onDragOver={handleCanvasDragOver}
                  onDrop={handleCanvasDrop}
                  onClick={() => setSelectedId(null)}
                  style={{
                    backgroundSize: `${CELL_SIZE}px ${CELL_SIZE}px`
                  }}
                >
                  {controls.length === 0 && (
                    <div className="sc-canvas-empty">
                      <div className="sc-canvas-empty-icon">📲</div>
                      <div className="sc-canvas-empty-text">
                        Kéo widget từ bảng bên trái vào đây
                      </div>
                    </div>
                  )}

                  {controls.map(ctrl => {
                    const pos = widgetPositions.get(ctrl.id) || { x: 0, y: 0 };
                    const isSelected = selectedId === ctrl.id;
                    const isDragging = draggingId === ctrl.id;

                    return (
                      <div
                        key={`widget-${ctrl.id}`}
                        className={`sc-canvas-widget ${isSelected ? 'selected' : ''} ${isDragging || resizingId === ctrl.id ? 'dragging' : ''}`}
                        onMouseDown={(e) => handleCanvasWidgetMouseDown(e, ctrl.id)}
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedId(ctrl.id);
                        }}
                        style={{
                          left: pos.x,
                          top: pos.y,
                          width: ctrl.width * CELL_SIZE,
                          height: ctrl.height * CELL_SIZE,
                          transform: isDragging ? 'scale(1.02)' : 'none'
                        }}
                      >
                        <button
                          className="sc-canvas-widget-delete"
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteControl(ctrl.id);
                          }}
                          onMouseDown={(e) => e.stopPropagation()}
                        >
                          ×
                        </button>
                        <WidgetPreview ctrl={ctrl} width={ctrl.width} height={ctrl.height} onSelect={handleWidgetSelect} />

                        {/* Pin Type Badge */}
                        <div
                          className="sc-pin-badge"
                          style={{
                            position: 'absolute',
                            top: '2px',
                            right: '24px',
                            fontSize: '8px',
                            padding: '1px 4px',
                            borderRadius: '3px',
                            backgroundColor: ctrl.pinType === 'virtual' ? '#22c55e' : '#3b82f6',
                            color: 'white',
                            fontWeight: 600,
                            zIndex: 5,
                          }}
                          title={ctrl.pinType === 'virtual'
                            ? `Virtual Pin VP${ctrl.virtualPin ?? 0}`
                            : `Physical GPIO${ctrl.gpio?.[0] ? ` ${ctrl.gpio[0]}` : ''}`}
                        >
                          {ctrl.pinType === 'virtual' ? `VP${ctrl.virtualPin ?? 0}` : `GPIO${ctrl.gpio?.[0] ? ctrl.gpio[0] : '-'}`}
                        </div>

                        {isSelected && (
                          <>
                            <div
                              className="resize-handle nw"
                              onMouseDown={(e) => handleResizeStart(e, ctrl.id, 'nw')}
                              onTouchStart={(e) => handleTouchResizeStart(e, ctrl.id, 'nw')}
                              title="Resize"
                            />
                            <div
                              className="resize-handle ne"
                              onMouseDown={(e) => handleResizeStart(e, ctrl.id, 'ne')}
                              onTouchStart={(e) => handleTouchResizeStart(e, ctrl.id, 'ne')}
                              title="Resize"
                            />
                            <div
                              className="resize-handle sw"
                              onMouseDown={(e) => handleResizeStart(e, ctrl.id, 'sw')}
                              onTouchStart={(e) => handleTouchResizeStart(e, ctrl.id, 'sw')}
                              title="Resize"
                            />
                            <div
                              className="resize-handle se"
                              onMouseDown={(e) => handleResizeStart(e, ctrl.id, 'se')}
                              onTouchStart={(e) => handleTouchResizeStart(e, ctrl.id, 'se')}
                              title="Resize"
                            />
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          {/* Widget Config Panel - Always visible */}
          {(() => {
            const selectedCtrl = selectedId ? controls.find(c => c.id === selectedId) : null;
            if (!selectedCtrl) {
              return (
                <div className="sc-config-placeholder">
                  Chọn một widget để cấu hình
                </div>
              );
            }
            return (
              <WidgetConfigPanel
                ctrl={selectedCtrl}
                onUpdate={handleUpdateControl}
                onDelete={() => {
                  deleteControl(selectedId);
                }}
                allControls={controls}
              />
            );
          })()}
        </div>

        {/* Footer */}
        <div className="sc-footer">
          <div className="sc-footer-left">
            {saveMsg && (
              <span className={`sc-msg ${saveMsg.type}`}>
                {saveMsg.text}
              </span>
            )}
            <span style={{ fontSize: '12px', color: 'var(--iot-outline)' }}>
              {controls.length} widget | Grid: {gridCols}×{gridRows}
            </span>
          </div>
          <div className="sc-footer-right">
            <button
              className="sc-btn sc-btn-secondary"
              onClick={() => setShowPreview(false)}
            >
              Đóng
            </button>
            <button
              className="sc-btn sc-btn-secondary"
              onClick={handleImportJson}
            >
              📥 Import
            </button>
            <button
              className="sc-btn sc-btn-secondary"
              onClick={handleExportJson}
              disabled={controls.length === 0}
            >
              📤 JSON
            </button>
            <button
              className="sc-btn sc-btn-secondary"
              onClick={handlePreview}
              disabled={controls.length === 0}
            >
              👁️ Preview
            </button>
            <button
              className="sc-btn sc-btn-export"
              onClick={handleSave}
              disabled={saving || controls.length === 0}
            >
              {saving ? 'Đang lưu...' : '💾 Lưu'}
            </button>
            <button
              className="sc-btn sc-btn-primary"
              onClick={handleExport}
              disabled={controls.length === 0}
            >
              ⚡ Xuất .ino
            </button>
          </div>
        </div>

        {/* Preview Modal */}
        {showPreview && previewHtml && (
          <div className="sc-preview-overlay">
            <div className="sc-preview-header">
              <span>Xem trước giao diện ESP</span>
              <button
                className="sc-preview-close"
                onClick={() => setShowPreview(false)}
              >
                ×
              </button>
            </div>
            <div className="sc-preview-content">
              <div className={`sc-preview-phone ${orientation}`}>
                <div className="sc-preview-screen">
                  <iframe
                    srcDoc={previewHtml}
                    style={{
                      width: '100%',
                      height: '100%',
                      border: 'none'
                    }}
                    title="ESP Preview"
                  />
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
  );
};

export default StandaloneControllerBuilder;
