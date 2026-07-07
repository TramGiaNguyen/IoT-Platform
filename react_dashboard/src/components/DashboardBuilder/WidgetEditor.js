import React, { useState, useEffect } from 'react';
import { fetchDevices, fetchDeviceDataKeys, fetchControlLines } from '../../services';
import '../../styles/dashboard-builder.css';

export default function WidgetEditor({ widget, devices, token, onSave, onCancel }) {
  const [formData, setFormData] = useState({
    ten_widget: '',
    device_id: '',
    data_keys: [],
    time_range: '1h',
    ...widget?.cau_hinh
  });
  const [availableKeys, setAvailableKeys] = useState([]);
  const [loadingKeys, setLoadingKeys] = useState(false);
  const [controlLines, setControlLines] = useState([]);

  useEffect(() => {
    if (widget) {
      setFormData({
        ten_widget: widget.ten_widget || '',
        device_id: widget.cau_hinh?.device_id || '',
        data_keys: widget.cau_hinh?.data_keys || [],
        time_range: widget.cau_hinh?.time_range || '1h',
        symbol_type: widget.cau_hinh?.symbol_type || 'light',
        data_key: widget.cau_hinh?.data_key || 'state',
        control_command: widget.cau_hinh?.control_command || 'toggle',
        relay_number: widget.cau_hinh?.relay_number || 1,
        x_key: widget.cau_hinh?.x_key || '',
        y_key: widget.cau_hinh?.y_key || '',
        ...widget.cau_hinh
      });
    }
  }, [widget]);

  // Load data keys when device is selected
  useEffect(() => {
    const loadDataKeys = async () => {
      if (!formData.device_id || !token) {
        setAvailableKeys([]);
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/b79dabf1-b019-4647-a912-96914bd03449',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'WidgetEditor.js:30',message:'loadDataKeys skipped',data:{device_id:formData.device_id,hasToken:!!token},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
        // #endregion
        return;
      }

      setLoadingKeys(true);
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/b79dabf1-b019-4647-a912-96914bd03449',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'WidgetEditor.js:35',message:'loadDataKeys starting',data:{device_id:formData.device_id},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
      // #endregion
      try {
        const res = await fetchDeviceDataKeys(formData.device_id, token);
        const keys = res.data.data_keys || [];
        setAvailableKeys(keys);
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/b79dabf1-b019-4647-a912-96914bd03449',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'WidgetEditor.js:38',message:'loadDataKeys success',data:{device_id:formData.device_id,keysCount:keys.length},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
        // #endregion
      } catch (err) {
        console.error('Failed to load data keys:', err);
        setAvailableKeys([]);
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/b79dabf1-b019-4647-a912-96914bd03449',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'WidgetEditor.js:42',message:'loadDataKeys error',data:{device_id:formData.device_id,error:err.message},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
        // #endregion
      } finally {
        setLoadingKeys(false);
      }
    };

    loadDataKeys();
  }, [formData.device_id, token]);

  // Load relay control lines when device changes (for relay_button widget)
  useEffect(() => {
    const loadRelayLines = async () => {
      if (!formData.device_id || !token || widget?.widget_type !== 'relay_button') return;
      try {
        const res = await fetchControlLines(formData.device_id, token);
        setControlLines(res.data.control_lines || []);
      } catch (err) {
        setControlLines([]);
      }
    };
    loadRelayLines();
  }, [formData.device_id, token, widget?.widget_type]);

  const handleSave = () => {
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/b79dabf1-b019-4647-a912-96914bd03449',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'WidgetEditor.js:50',message:'handleSave entry',data:{device_id:formData.device_id,data_keys_count:formData.data_keys?.length||0,hasWidget:!!widget},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
    // #endregion
    const widgetType = widget?.widget_type;

    // Handle widget types that don't require device_id
    const noDeviceRequired = ['video_stream', 'image_gallery', 'text_input', 'dropdown_menu', 'segmented_switch', 'numeric_input'];
    if (!noDeviceRequired.includes(widgetType) && !formData.device_id) {
      alert('Vui lòng chọn thiết bị');
      return;
    }

    const isScada = widgetType === 'scada_symbol';
    const isRelayButton = widgetType === 'relay_button';
    const isScatterPlot = widgetType === 'scatter_plot';
    const isVideoStream = widgetType === 'video_stream';
    const isImageGallery = widgetType === 'image_gallery';

    // Validate data keys for most widgets
    if (!isRelayButton && !isScada && !noDeviceRequired.includes(widgetType) && (!formData.data_keys || formData.data_keys.length === 0)) {
      if (!isScatterPlot || (!formData.x_key && !formData.y_key)) {
        alert('Vui lòng chọn ít nhất một data key');
        return;
      }
    }

    let config = {};

    if (isScada) {
      config = {
        device_id: formData.device_id,
        symbol_type: formData.symbol_type || 'light',
        data_key: formData.data_key || 'state',
        control_command: formData.control_command || 'toggle',
        time_range: formData.time_range || '1h',
        data_keys: [formData.data_key || 'state'],
      };
    } else if (isRelayButton) {
      config = {
        device_id: formData.device_id,
        relay_number: Number(formData.relay_number) || 1,
        data_keys: [`relay_${formData.relay_number || 1}`],
        time_range: formData.time_range || '1h',
      };
    } else if (isScatterPlot) {
      config = {
        device_id: formData.device_id,
        x_key: formData.x_key,
        y_key: formData.y_key,
        data_keys: [formData.x_key, formData.y_key].filter(Boolean),
        time_range: formData.time_range,
      };
    } else if (isVideoStream) {
      config = {
        stream_url: formData.stream_url || '',
        autoplay: formData.autoplay !== false,
        muted: formData.muted !== false,
      };
    } else if (isImageGallery) {
      config = {
        images: formData.images || [],
        interval: formData.interval || 5000,
      };
    } else if (widgetType === 'lcd_display') {
      config = {
        device_id: formData.device_id,
        data_keys: formData.data_keys,
        time_range: formData.time_range,
        line_count: formData.line_count || 2,
        bg_color: formData.bg_color || '#1a3a2a',
        text_color: formData.text_color || '#00ff88',
      };
    } else if (widgetType === 'led_indicator') {
      config = {
        device_id: formData.device_id,
        data_keys: formData.data_keys,
        time_range: formData.time_range,
        color: formData.color || '#22c55e',
      };
    } else if (widgetType === 'level_display') {
      config = {
        device_id: formData.device_id,
        data_keys: formData.data_keys,
        time_range: formData.time_range,
        orientation: formData.orientation || 'horizontal',
        min: formData.min || 0,
        max: formData.max || 100,
        unit: formData.unit || '',
      };
    } else if (widgetType === 'gradient_ramp') {
      config = {
        device_id: formData.device_id,
        data_keys: formData.data_keys,
        time_range: formData.time_range,
        min: formData.min || 0,
        max: formData.max || 100,
        unit: formData.unit || '°C',
        low_color: formData.low_color || '#22d3ee',
        high_color: formData.high_color || '#ef4444',
      };
    } else if (widgetType === 'map_widget') {
      config = {
        device_id: formData.device_id,
        lat_key: formData.lat_key || 'lat',
        lng_key: formData.lng_key || 'lng',
        center_lat: formData.center_lat || 21.0285,
        center_lng: formData.center_lng || 105.8522,
        zoom: formData.zoom || 15,
      };
    } else if (widgetType === 'joystick') {
      config = {
        device_id: formData.device_id,
        x_datakey: formData.x_datakey || 'joystick_x',
        y_datakey: formData.y_datakey || 'joystick_y',
      };
    } else if (widgetType === 'rgb_control') {
      config = {
        device_id: formData.device_id,
        color_datakey: formData.color_datakey || 'rgb_color',
        brightness_datakey: formData.brightness_datakey || 'rgb_brightness',
        presets: formData.presets,
      };
    } else if (widgetType === 'dropdown_menu') {
      config = {
        device_id: formData.device_id,
        data_keys: formData.data_keys,
        options: formData.options || ['Option 1', 'Option 2', 'Option 3'],
      };
    } else if (widgetType === 'segmented_switch') {
      config = {
        device_id: formData.device_id,
        data_keys: formData.data_keys,
        segments: formData.segments || ['Mode 1', 'Mode 2', 'Mode 3'],
      };
    } else if (widgetType === 'text_input') {
      config = {
        device_id: formData.device_id,
        data_keys: formData.data_keys,
        placeholder: formData.placeholder || 'Nhập text...',
      };
    } else if (widgetType === 'numeric_input') {
      config = {
        device_id: formData.device_id,
        data_keys: formData.data_keys,
        min: formData.min || 0,
        max: formData.max || 100,
        step: formData.step || 1,
      };
    } else {
      // Default config for line_chart, bar_chart, gauge, etc.
      config = {
        device_id: formData.device_id,
        data_keys: formData.data_keys,
        time_range: formData.time_range,
        ...(formData.colors && { colors: formData.colors }),
        ...(formData.label && { label: formData.label }),
        ...(formData.unit && { unit: formData.unit }),
        ...(formData.min !== undefined && { min: formData.min }),
        ...(formData.max !== undefined && { max: formData.max }),
      };
    }

    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/b79dabf1-b019-4647-a912-96914bd03449',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'WidgetEditor.js:71',message:'handleSave calling onSave',data:{widget_id:widget?.id,config_keys:Object.keys(config)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
    // #endregion
    onSave({
      ...widget,
      ten_widget: formData.ten_widget,
      cau_hinh: config
    });
  };

  const toggleDataKey = (key) => {
    const current = formData.data_keys || [];
    if (current.includes(key)) {
      setFormData({ ...formData, data_keys: current.filter(k => k !== key) });
    } else {
      setFormData({ ...formData, data_keys: [...current, key] });
    }
  };

  return (
    <div className="db-widget-editor-panel">
      <h3 className="db-builder-title">
        {widget ? 'Chỉnh sửa Widget' : 'Cấu hình Widget'}
      </h3>

      <div className="form-row">
        <label>Tên Widget</label>
        <input
          type="text"
          value={formData.ten_widget}
          onChange={(e) => setFormData({ ...formData, ten_widget: e.target.value })}
          placeholder="Ví dụ: Nhiệt độ & Độ ẩm"
        />
      </div>

      <div className="form-row">
        <label>Thiết bị *</label>
        <select
          value={formData.device_id}
          onChange={(e) => setFormData({ ...formData, device_id: e.target.value, data_keys: [] })}
        >
          <option value="">-- Chọn thiết bị --</option>
          {devices.map(device => (
            <option key={device.id} value={device.ma_thiet_bi}>
              {device.ten_thiet_bi || device.ma_thiet_bi}
            </option>
          ))}
        </select>
      </div>

      {formData.device_id && widget?.widget_type !== 'relay_button' && (
        <div className="form-row">
          <label>
            Data Keys * {loadingKeys && <span style={{ fontSize: '11px', color: 'var(--bdu-muted)' }}>(Đang tải...)</span>}
          </label>
          {availableKeys.length === 0 && !loadingKeys ? (
            <div className="db-empty-keys">
              Chưa có data keys. Thiết bị cần gửi dữ liệu trước.
            </div>
          ) : (
            <div className="db-keys-list">
              {availableKeys.map(keyInfo => {
                const key = keyInfo.khoa || keyInfo;
                const keyName = typeof keyInfo === 'string' ? keyInfo : keyInfo.khoa;
                const unit = typeof keyInfo === 'object' ? keyInfo.don_vi : '';
                const description = typeof keyInfo === 'object' ? keyInfo.mo_ta : '';
                const isSelected = formData.data_keys?.includes(keyName);
                return (
                  <label
                    key={key}
                    className={`db-key-option${isSelected ? ' selected' : ''}`}
                    title={description || unit ? `${description || ''} ${unit ? `(${unit})` : ''}`.trim() : ''}
                  >
                    <input
                      type="checkbox"
                      checked={isSelected || false}
                      onChange={() => toggleDataKey(keyName)}
                      style={{ accentColor: 'var(--bdu-cyan)' }}
                    />
                    <span style={{ flex: 1 }}>
                      {keyName}
                      {unit && <span style={{ fontSize: '11px', color: 'var(--bdu-muted)', marginLeft: '4px' }}>({unit})</span>}
                    </span>
                  </label>
                );
              })}
            </div>
          )}
        </div>
      )}

      {widget?.widget_type !== 'relay_button' && (
        <div className="form-row">
          <label>Time Range</label>
          <select
            value={formData.time_range}
            onChange={(e) => setFormData({ ...formData, time_range: e.target.value })}
          >
            <option value="1h">1 giờ</option>
            <option value="6h">6 giờ</option>
            <option value="24h">24 giờ</option>
            <option value="7d">7 ngày</option>
            <option value="30d">30 ngày</option>
          </select>
        </div>
      )}

      {/* Widget-specific options */}
      {widget?.widget_type === 'gauge' && (
        <>
          <div className="form-row">
            <label>Min Value</label>
            <input
              type="number"
              value={formData.min || 0}
              onChange={(e) => setFormData({ ...formData, min: parseFloat(e.target.value) })}
            />
          </div>
          <div className="form-row">
            <label>Max Value</label>
            <input
              type="number"
              value={formData.max || 100}
              onChange={(e) => setFormData({ ...formData, max: parseFloat(e.target.value) })}
            />
          </div>
        </>
      )}

      {widget?.widget_type === 'scada_symbol' && (
        <>
          <div className="form-row">
            <label>Loại symbol</label>
            <select value={formData.symbol_type || 'light'} onChange={(e) => setFormData({ ...formData, symbol_type: e.target.value })}>
              <option value="light">Đèn</option>
              <option value="ac">Điều hòa</option>
              <option value="sensor">Cảm biến</option>
            </select>
          </div>
          <div className="form-row">
            <label>Data key</label>
            <select value={formData.data_key || 'state'} onChange={(e) => setFormData({ ...formData, data_key: e.target.value })}>
              {availableKeys.map(k => {
                const key = typeof k === 'string' ? k : k.khoa;
                const label = typeof k === 'string' ? k : `${k.khoa}${k.don_vi ? ` (${k.don_vi})` : ''}`;
                return <option key={key} value={key}>{label}</option>;
              })}
              {availableKeys.length === 0 && <option value="state">state</option>}
            </select>
          </div>
        </>
      )}

      {/* Relay button config */}
      {widget?.widget_type === 'relay_button' && (
        <div className="form-row">
          <label>Số Relay</label>
          {controlLines.length > 0 ? (
            <select value={formData.relay_number || 1} onChange={(e) => setFormData({ ...formData, relay_number: Number(e.target.value) })}>
              {controlLines.map(l => (
                <option key={l.relay_number} value={l.relay_number}>{l.ten_duong || `Relay ${l.relay_number}`}</option>
              ))}
            </select>
          ) : (
            <input type="number" min="1" value={formData.relay_number || 1} onChange={(e) => setFormData({ ...formData, relay_number: Number(e.target.value) })} />
          )}
          <p style={{ color: 'var(--bdu-muted)', fontSize: '11px', marginTop: '6px' }}>
            Chọn relay cần điều khiển. Trạng thái realtime qua WebSocket.
          </p>
        </div>
      )}

      {/* Scatter plot config */}
      {widget?.widget_type === 'scatter_plot' && formData.device_id && (
        <>
          <div className="form-row">
            <label>Trục X (giá trị ngang) *</label>
            <select value={formData.x_key || ''} onChange={(e) => setFormData({ ...formData, x_key: e.target.value })}>
              <option value="">-- Chọn key --</option>
              {availableKeys.map(k => { const key = k.khoa || k; return <option key={key} value={key}>{key}</option>; })}
            </select>
          </div>
          <div className="form-row">
            <label>Trục Y (giá trị dọc) *</label>
            <select value={formData.y_key || ''} onChange={(e) => setFormData({ ...formData, y_key: e.target.value })}>
              <option value="">-- Chọn key --</option>
              {availableKeys.map(k => { const key = k.khoa || k; return <option key={key} value={key}>{key}</option>; })}
            </select>
          </div>
        </>
      )}

      {/* Joystick config */}
      {widget?.widget_type === 'joystick' && formData.device_id && (
        <>
          <div className="form-row">
            <label>X Data Key</label>
            <select value={formData.x_datakey || 'joystick_x'} onChange={(e) => setFormData({ ...formData, x_datakey: e.target.value })}>
              <option value="joystick_x">joystick_x</option>
              {availableKeys.map(k => { const key = k.khoa || k; return <option key={key} value={key}>{key}</option>; })}
            </select>
          </div>
          <div className="form-row">
            <label>Y Data Key</label>
            <select value={formData.y_datakey || 'joystick_y'} onChange={(e) => setFormData({ ...formData, y_datakey: e.target.value })}>
              <option value="joystick_y">joystick_y</option>
              {availableKeys.map(k => { const key = k.khoa || k; return <option key={key} value={key}>{key}</option>; })}
            </select>
          </div>
        </>
      )}

      {/* RGB Control config */}
      {widget?.widget_type === 'rgb_control' && formData.device_id && (
        <>
          <div className="form-row">
            <label>Color Data Key</label>
            <input type="text" value={formData.color_datakey || 'rgb_color'} onChange={(e) => setFormData({ ...formData, color_datakey: e.target.value })} placeholder="rgb_color" />
          </div>
          <div className="form-row">
            <label>Brightness Data Key</label>
            <input type="text" value={formData.brightness_datakey || 'rgb_brightness'} onChange={(e) => setFormData({ ...formData, brightness_datakey: e.target.value })} placeholder="rgb_brightness" />
          </div>
        </>
      )}

      {/* Video Stream config */}
      {widget?.widget_type === 'video_stream' && (
        <>
          <div className="form-row">
            <label>Stream URL</label>
            <input type="text" value={formData.stream_url || ''} onChange={(e) => setFormData({ ...formData, stream_url: e.target.value })} placeholder="http://camera:8080/stream" />
          </div>
          <div className="form-row" style={{ display: 'flex', gap: '16px' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--bdu-muted)' }}>
              <input type="checkbox" checked={formData.autoplay !== false} onChange={(e) => setFormData({ ...formData, autoplay: e.target.checked })} style={{ accentColor: 'var(--bdu-cyan)' }} />
              Autoplay
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--bdu-muted)' }}>
              <input type="checkbox" checked={formData.muted !== false} onChange={(e) => setFormData({ ...formData, muted: e.target.checked })} style={{ accentColor: 'var(--bdu-cyan)' }} />
              Muted
            </label>
          </div>
        </>
      )}

      {/* Map Widget config */}
      {widget?.widget_type === 'map_widget' && formData.device_id && (
        <>
          <div className="form-row">
            <label>Latitude Key</label>
            <input type="text" value={formData.lat_key || 'lat'} onChange={(e) => setFormData({ ...formData, lat_key: e.target.value })} placeholder="lat" />
          </div>
          <div className="form-row">
            <label>Longitude Key</label>
            <input type="text" value={formData.lng_key || 'lng'} onChange={(e) => setFormData({ ...formData, lng_key: e.target.value })} placeholder="lng" />
          </div>
          <div className="form-row form-row-flex">
            <div style={{ flex: 1 }}>
              <label>Center Lat</label>
              <input type="number" step="0.0001" value={formData.center_lat || 21.0285} onChange={(e) => setFormData({ ...formData, center_lat: parseFloat(e.target.value) })} />
            </div>
            <div style={{ flex: 1 }}>
              <label>Center Lng</label>
              <input type="number" step="0.0001" value={formData.center_lng || 105.8522} onChange={(e) => setFormData({ ...formData, center_lng: parseFloat(e.target.value) })} />
            </div>
          </div>
        </>
      )}

      {/* Image Gallery config */}
      {widget?.widget_type === 'image_gallery' && (
        <>
          <div className="form-row">
            <label>Image URLs (1 per line)</label>
            <textarea
              value={(formData.images || []).join('\n')}
              onChange={(e) => setFormData({ ...formData, images: e.target.value.split('\n').filter(Boolean) })}
              placeholder="https://example.com/image1.jpg&#10;https://example.com/image2.jpg"
              style={{ height: '80px', resize: 'vertical' }}
            />
          </div>
          <div className="form-row">
            <label>Slide Interval (ms)</label>
            <input type="number" value={formData.interval || 5000} onChange={(e) => setFormData({ ...formData, interval: parseInt(e.target.value) })} />
          </div>
        </>
      )}

      {/* LCD Display config */}
      {widget?.widget_type === 'lcd_display' && (
        <>
          <div className="form-row">
            <label>Line Count</label>
            <input type="number" min="1" max="4" value={formData.line_count || 2} onChange={(e) => setFormData({ ...formData, line_count: parseInt(e.target.value) })} />
          </div>
          <div className="form-row">
            <label>Background Color</label>
            <input type="color" value={formData.bg_color || '#1a3a2a'} onChange={(e) => setFormData({ ...formData, bg_color: e.target.value })} className="db-color-input" />
          </div>
          <div className="form-row">
            <label>Text Color</label>
            <input type="color" value={formData.text_color || '#00ff88'} onChange={(e) => setFormData({ ...formData, text_color: e.target.value })} className="db-color-input" />
          </div>
        </>
      )}

      {/* LED Indicator config */}
      {widget?.widget_type === 'led_indicator' && (
        <div className="form-row">
          <label>LED Color</label>
          <input type="color" value={formData.color || '#22c55e'} onChange={(e) => setFormData({ ...formData, color: e.target.value })} className="db-color-input" />
        </div>
      )}

      {/* Level Display config */}
      {widget?.widget_type === 'level_display' && (
        <>
          <div className="form-row">
            <label>Orientation</label>
            <select value={formData.orientation || 'horizontal'} onChange={(e) => setFormData({ ...formData, orientation: e.target.value })}>
              <option value="horizontal">Horizontal</option>
              <option value="vertical">Vertical</option>
            </select>
          </div>
          <div className="form-row form-row-flex">
            <div style={{ flex: 1 }}>
              <label>Min</label>
              <input type="number" value={formData.min || 0} onChange={(e) => setFormData({ ...formData, min: parseFloat(e.target.value) })} />
            </div>
            <div style={{ flex: 1 }}>
              <label>Max</label>
              <input type="number" value={formData.max || 100} onChange={(e) => setFormData({ ...formData, max: parseFloat(e.target.value) })} />
            </div>
          </div>
          <div className="form-row">
            <label>Unit</label>
            <input type="text" value={formData.unit || ''} onChange={(e) => setFormData({ ...formData, unit: e.target.value })} placeholder="%" />
          </div>
        </>
      )}

      {/* Gradient Ramp config */}
      {widget?.widget_type === 'gradient_ramp' && (
        <>
          <div className="form-row form-row-flex">
            <div style={{ flex: 1 }}>
              <label>Low Color</label>
              <input type="color" value={formData.low_color || '#22d3ee'} onChange={(e) => setFormData({ ...formData, low_color: e.target.value })} className="db-color-input" />
            </div>
            <div style={{ flex: 1 }}>
              <label>High Color</label>
              <input type="color" value={formData.high_color || '#ef4444'} onChange={(e) => setFormData({ ...formData, high_color: e.target.value })} className="db-color-input" />
            </div>
          </div>
          <div className="form-row form-row-flex">
            <div style={{ flex: 1 }}>
              <label>Min</label>
              <input type="number" value={formData.min || 0} onChange={(e) => setFormData({ ...formData, min: parseFloat(e.target.value) })} />
            </div>
            <div style={{ flex: 1 }}>
              <label>Max</label>
              <input type="number" value={formData.max || 100} onChange={(e) => setFormData({ ...formData, max: parseFloat(e.target.value) })} />
            </div>
          </div>
          <div className="form-row">
            <label>Unit</label>
            <input type="text" value={formData.unit || '°C'} onChange={(e) => setFormData({ ...formData, unit: e.target.value })} placeholder="°C" />
          </div>
        </>
      )}

      {/* Dropdown Menu config */}
      {widget?.widget_type === 'dropdown_menu' && (
        <div className="form-row">
          <label>Options (1 per line)</label>
          <textarea
            value={(formData.options || ['Option 1', 'Option 2', 'Option 3']).join('\n')}
            onChange={(e) => setFormData({ ...formData, options: e.target.value.split('\n').filter(Boolean) })}
            placeholder="Mode 1&#10;Mode 2&#10;Mode 3"
            style={{ height: '80px', resize: 'vertical' }}
          />
        </div>
      )}

      {/* Segmented Switch config */}
      {widget?.widget_type === 'segmented_switch' && (
        <div className="form-row">
          <label>Segments (1 per line)</label>
          <textarea
            value={(formData.segments || ['Mode 1', 'Mode 2', 'Mode 3']).join('\n')}
            onChange={(e) => setFormData({ ...formData, segments: e.target.value.split('\n').filter(Boolean) })}
            placeholder="Auto&#10;Manual&#10;Timer"
            style={{ height: '80px', resize: 'vertical' }}
          />
        </div>
      )}

      {/* Numeric Input config */}
      {widget?.widget_type === 'numeric_input' && (
        <div className="form-row form-row-flex">
          <div style={{ flex: 1 }}>
            <label>Min</label>
            <input type="number" value={formData.min || 0} onChange={(e) => setFormData({ ...formData, min: parseFloat(e.target.value) })} />
          </div>
          <div style={{ flex: 1 }}>
            <label>Max</label>
            <input type="number" value={formData.max || 100} onChange={(e) => setFormData({ ...formData, max: parseFloat(e.target.value) })} />
          </div>
          <div style={{ flex: 1 }}>
            <label>Step</label>
            <input type="number" value={formData.step || 1} onChange={(e) => setFormData({ ...formData, step: parseFloat(e.target.value) })} />
          </div>
        </div>
      )}

      {/* Stat card config */}
      {widget?.widget_type === 'stat_card' && (
        <>
          <div className="form-row">
            <label>Label</label>
            <input
              type="text"
              value={formData.label || ''}
              onChange={(e) => setFormData({ ...formData, label: e.target.value })}
              placeholder="Ví dụ: Nhiệt độ"
            />
          </div>
          <div className="form-row">
            <label>Unit</label>
            <input
              type="text"
              value={formData.unit || ''}
              onChange={(e) => setFormData({ ...formData, unit: e.target.value })}
              placeholder="Ví dụ: °C"
            />
          </div>
        </>
      )}

      <div className="db-form-actions-row">
        <button
          onClick={onCancel}
          className="db-btn-secondary"
          style={{ flex: 1 }}
        >
          Hủy
        </button>
        <button
          onClick={handleSave}
          className="db-btn-primary"
          style={{ flex: 1 }}
        >
          Lưu
        </button>
      </div>
    </div>
  );
}

