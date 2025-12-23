import React, { useState, useEffect } from 'react';
import { fetchDevices, fetchDeviceDataKeys } from '../../services';

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

  useEffect(() => {
    if (widget) {
      setFormData({
        ten_widget: widget.ten_widget || '',
        device_id: widget.cau_hinh?.device_id || '',
        data_keys: widget.cau_hinh?.data_keys || [],
        time_range: widget.cau_hinh?.time_range || '1h',
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

  const handleSave = () => {
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/b79dabf1-b019-4647-a912-96914bd03449',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'WidgetEditor.js:50',message:'handleSave entry',data:{device_id:formData.device_id,data_keys_count:formData.data_keys?.length||0,hasWidget:!!widget},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
    // #endregion
    if (!formData.device_id) {
      alert('Vui lòng chọn thiết bị');
      return;
    }
    if (!formData.data_keys || formData.data_keys.length === 0) {
      alert('Vui lòng chọn ít nhất một data key');
      return;
    }

    const config = {
      device_id: formData.device_id,
      data_keys: formData.data_keys,
      time_range: formData.time_range,
      ...(formData.colors && { colors: formData.colors }),
      ...(formData.label && { label: formData.label }),
      ...(formData.unit && { unit: formData.unit }),
      ...(formData.min !== undefined && { min: formData.min }),
      ...(formData.max !== undefined && { max: formData.max }),
    };

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
    <div style={{
      width: '320px',
      background: '#0b1224',
      borderLeft: '1px solid #1f2a44',
      padding: '20px',
      height: '100%',
      overflowY: 'auto'
    }}>
      <h3 style={{ color: '#e5e7eb', marginTop: 0, marginBottom: '20px' }}>
        {widget ? 'Chỉnh sửa Widget' : 'Cấu hình Widget'}
      </h3>

      <div style={{ marginBottom: '16px' }}>
        <label style={{ display: 'block', color: '#9ca3af', marginBottom: '8px', fontSize: '13px' }}>
          Tên Widget
        </label>
        <input
          type="text"
          value={formData.ten_widget}
          onChange={(e) => setFormData({ ...formData, ten_widget: e.target.value })}
          placeholder="Ví dụ: Nhiệt độ & Độ ẩm"
          style={{
            width: '100%',
            padding: '10px',
            background: '#111a2d',
            border: '1px solid #1f2a44',
            borderRadius: '6px',
            color: '#e5e7eb',
            fontSize: '14px'
          }}
        />
      </div>

      <div style={{ marginBottom: '16px' }}>
        <label style={{ display: 'block', color: '#9ca3af', marginBottom: '8px', fontSize: '13px' }}>
          Thiết bị *
        </label>
        <select
          value={formData.device_id}
          onChange={(e) => setFormData({ ...formData, device_id: e.target.value, data_keys: [] })}
          style={{
            width: '100%',
            padding: '10px',
            background: '#111a2d',
            border: '1px solid #1f2a44',
            borderRadius: '6px',
            color: '#e5e7eb',
            fontSize: '14px'
          }}
        >
          <option value="">-- Chọn thiết bị --</option>
          {devices.map(device => (
            <option key={device.id} value={device.ma_thiet_bi}>
              {device.ten_thiet_bi || device.ma_thiet_bi}
            </option>
          ))}
        </select>
      </div>

      {formData.device_id && (
        <div style={{ marginBottom: '16px' }}>
          <label style={{ display: 'block', color: '#9ca3af', marginBottom: '8px', fontSize: '13px' }}>
            Data Keys * {loadingKeys && <span style={{ fontSize: '11px', color: '#64748b' }}>(Đang tải...)</span>}
          </label>
          {availableKeys.length === 0 && !loadingKeys ? (
            <div style={{ padding: '12px', background: '#111a2d', border: '1px solid #1f2a44', borderRadius: '6px', color: '#9ca3af', fontSize: '12px' }}>
              Chưa có data keys. Thiết bị cần gửi dữ liệu trước.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {availableKeys.map(keyInfo => {
                const key = keyInfo.khoa || keyInfo;
                const keyName = typeof keyInfo === 'string' ? keyInfo : keyInfo.khoa;
                const unit = typeof keyInfo === 'object' ? keyInfo.don_vi : '';
                const description = typeof keyInfo === 'object' ? keyInfo.mo_ta : '';
                return (
                  <label
                    key={key}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      padding: '8px',
                      background: formData.data_keys?.includes(keyName) ? '#1a2332' : '#111a2d',
                      border: `1px solid ${formData.data_keys?.includes(keyName) ? '#22d3ee' : '#1f2a44'}`,
                      borderRadius: '6px',
                      cursor: 'pointer',
                      fontSize: '13px',
                      color: '#e5e7eb'
                    }}
                    title={description || unit ? `${description || ''} ${unit ? `(${unit})` : ''}`.trim() : ''}
                  >
                    <input
                      type="checkbox"
                      checked={formData.data_keys?.includes(keyName) || false}
                      onChange={() => toggleDataKey(keyName)}
                      style={{ accentColor: '#22d3ee' }}
                    />
                    <span style={{ flex: 1 }}>
                      {keyName}
                      {unit && <span style={{ fontSize: '11px', color: '#64748b', marginLeft: '4px' }}>({unit})</span>}
                    </span>
                  </label>
                );
              })}
            </div>
          )}
        </div>
      )}

      <div style={{ marginBottom: '16px' }}>
        <label style={{ display: 'block', color: '#9ca3af', marginBottom: '8px', fontSize: '13px' }}>
          Time Range
        </label>
        <select
          value={formData.time_range}
          onChange={(e) => setFormData({ ...formData, time_range: e.target.value })}
          style={{
            width: '100%',
            padding: '10px',
            background: '#111a2d',
            border: '1px solid #1f2a44',
            borderRadius: '6px',
            color: '#e5e7eb',
            fontSize: '14px'
          }}
        >
          <option value="1h">1 giờ</option>
          <option value="6h">6 giờ</option>
          <option value="24h">24 giờ</option>
          <option value="7d">7 ngày</option>
          <option value="30d">30 ngày</option>
        </select>
      </div>

      {/* Widget-specific options */}
      {widget?.widget_type === 'gauge' && (
        <>
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', color: '#9ca3af', marginBottom: '8px', fontSize: '13px' }}>
              Min Value
            </label>
            <input
              type="number"
              value={formData.min || 0}
              onChange={(e) => setFormData({ ...formData, min: parseFloat(e.target.value) })}
              style={{
                width: '100%',
                padding: '10px',
                background: '#111a2d',
                border: '1px solid #1f2a44',
                borderRadius: '6px',
                color: '#e5e7eb',
                fontSize: '14px'
              }}
            />
          </div>
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', color: '#9ca3af', marginBottom: '8px', fontSize: '13px' }}>
              Max Value
            </label>
            <input
              type="number"
              value={formData.max || 100}
              onChange={(e) => setFormData({ ...formData, max: parseFloat(e.target.value) })}
              style={{
                width: '100%',
                padding: '10px',
                background: '#111a2d',
                border: '1px solid #1f2a44',
                borderRadius: '6px',
                color: '#e5e7eb',
                fontSize: '14px'
              }}
            />
          </div>
        </>
      )}

      {widget?.widget_type === 'stat_card' && (
        <>
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', color: '#9ca3af', marginBottom: '8px', fontSize: '13px' }}>
              Label
            </label>
            <input
              type="text"
              value={formData.label || ''}
              onChange={(e) => setFormData({ ...formData, label: e.target.value })}
              placeholder="Ví dụ: Nhiệt độ"
              style={{
                width: '100%',
                padding: '10px',
                background: '#111a2d',
                border: '1px solid #1f2a44',
                borderRadius: '6px',
                color: '#e5e7eb',
                fontSize: '14px'
              }}
            />
          </div>
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', color: '#9ca3af', marginBottom: '8px', fontSize: '13px' }}>
              Unit
            </label>
            <input
              type="text"
              value={formData.unit || ''}
              onChange={(e) => setFormData({ ...formData, unit: e.target.value })}
              placeholder="Ví dụ: °C"
              style={{
                width: '100%',
                padding: '10px',
                background: '#111a2d',
                border: '1px solid #1f2a44',
                borderRadius: '6px',
                color: '#e5e7eb',
                fontSize: '14px'
              }}
            />
          </div>
        </>
      )}

      <div style={{ display: 'flex', gap: '12px', marginTop: '24px' }}>
        <button
          onClick={onCancel}
          style={{
            flex: 1,
            padding: '10px',
            background: '#111a2d',
            border: '1px solid #1f2a44',
            borderRadius: '6px',
            color: '#e5e7eb',
            cursor: 'pointer'
          }}
        >
          Hủy
        </button>
        <button
          onClick={handleSave}
          style={{
            flex: 1,
            padding: '10px',
            background: 'linear-gradient(135deg, #0ea5e9, #22d3ee)',
            border: 'none',
            borderRadius: '6px',
            color: '#0b1224',
            fontWeight: '600',
            cursor: 'pointer'
          }}
        >
          Lưu
        </button>
      </div>
    </div>
  );
}

