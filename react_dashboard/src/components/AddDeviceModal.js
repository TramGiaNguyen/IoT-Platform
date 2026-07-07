import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import axios from 'axios';
import { API_BASE } from '../config/api';
import '../styles/Dashboard.css';

const Icon = ({ name, className = '' }) => (
  <span className={`material-symbols-outlined ${className}`}>{name}</span>
);

const getDefaultKeysForDeviceType = (type) => {
  if (type === 'smart_classroom_energy') {
    return [
      { khoa: 'Thoi_gian_bat_dau', don_vi: '', mo_ta: 'Thời gian bắt đầu' },
      { khoa: 'Thoi_gian_ket_thuc', don_vi: '', mo_ta: 'Thời gian kết thúc' },
      { khoa: 'Thoi_luong', don_vi: 's', mo_ta: 'Thời lượng' },
      { khoa: 'Nang_luong', don_vi: 'kWh', mo_ta: 'Năng lượng tiêu thụ' },
      { khoa: 'Dien_ap_TB', don_vi: 'V', mo_ta: 'Điện áp trung bình' },
      { khoa: 'Dien_ap_Max', don_vi: 'V', mo_ta: 'Điện áp tối đa' },
      { khoa: 'Dien_ap_Min', don_vi: 'V', mo_ta: 'Điện áp tối thiểu' },
      { khoa: 'Dong_dien_TB', don_vi: 'A', mo_vi: 'Dòng điện trung bình' },
      { khoa: 'Dong_dien_Max', don_vi: 'A', mo_ta: 'Dòng điện tối đa' },
      { khoa: 'Dong_dien_Min', don_vi: 'A', mo_ta: 'Dòng điện tối thiểu' },
      { khoa: 'Cong_suat_TB', don_vi: 'W', mo_ta: 'Công suất trung bình' },
      { khoa: 'Cong_suat_Max', don_vi: 'W', mo_ta: 'Công suất tối đa' },
      { khoa: 'Cong_suat_Min', don_vi: 'W', mo_ta: 'Công suất tối thiểu' },
      { khoa: 'He_so_cong_suat_TB', don_vi: '', mo_ta: 'Hệ số công suất TB' },
      { khoa: 'Tan_so_TB', don_vi: 'Hz', mo_ta: 'Tần số trung bình' },
      { khoa: 'Tien_dien', don_vi: 'VND', mo_ta: 'Tiền điện ước tính' }
    ];
  }
  return [];
};

export default function AddDeviceModal({ onClose, token, onDeviceAdded, workspaceContext = 'ca_nhan', userInfo = null }) {
  const isGroupContext = workspaceContext === 'nhom';
  const effectiveWorkspaceId = isGroupContext ? (userInfo?.primary_nhom_id || null) : null;

  const [modalTab, setModalTab] = useState('provision');
  const [provisionStep, setProvisionStep] = useState(1);
  const [provisionResult, setProvisionResult] = useState(null);
  const [provisionForm, setProvisionForm] = useState({
    ten_thiet_bi: '', phong_id: '', protocol: 'mqtt', device_type: 'sensor', loai_thiet_bi: '', data_keys: []
  });
  const [provisioning, setProvisioning] = useState(false);
  const [provisionError, setProvisionError] = useState('');
  const [rooms, setRooms] = useState([]);
  const [detectedKeys, setDetectedKeys] = useState([]);
  const [detecting, setDetecting] = useState(false);
  const [detectProgress, setDetectProgress] = useState(0);
  const [controlLines, setControlLines] = useState([]);
  const [controlLinesSaved, setControlLinesSaved] = useState(false);
  const [savingControlLines, setSavingControlLines] = useState(false);
  const [downloadingConfig, setDownloadingConfig] = useState(false);

  // Discover tab state
  const [discoveredDevices, setDiscoveredDevices] = useState([]);
  const [scanning, setScanning] = useState(false);
  const [registering, setRegistering] = useState(false);
  const [discoverError, setDiscoverError] = useState('');
  const [selectedDevices, setSelectedDevices] = useState({});

  // Import tab state
  const [importedDeviceConfig, setImportedDeviceConfig] = useState(null);

  useEffect(() => {
    const params = effectiveWorkspaceId ? { workspace_id: effectiveWorkspaceId } : {};
    axios.get(`${API_BASE}/rooms`, {
      headers: { Authorization: `Bearer ${token}` },
      params,
    })
      .then(res => setRooms(res.data.rooms || []))
      .catch(() => {});
  }, [token, effectiveWorkspaceId]);

  const handleClose = () => {
    onClose();
  };

  const handleImportConfig = (event) => {
    const file = event.target.files && event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const config = JSON.parse(e.target.result);
        if (!config.device?.device_id) {
          alert('File config không hợp lệ: thiếu device_id');
          return;
        }
        setImportedDeviceConfig(config);
        setProvisionForm(prev => ({
          ...prev,
          ten_thiet_bi: config.device.ten_thiet_bi || prev.ten_thiet_bi,
          phong_id: config.device.phong_id || prev.phong_id,
          protocol: config.device.protocol || prev.protocol,
          device_type: config.device.device_type || prev.device_type,
        }));
        alert(`Đã nhập config cho thiết bị: ${config.device.device_id}`);
      } catch (err) {
        alert('Đọc file config thất bại: ' + err.message);
      }
    };
    reader.readAsText(file);
    event.target.value = '';
  };

  const handleRegisterImportedDevice = async () => {
    if (!importedDeviceConfig) return;
    const cfg = importedDeviceConfig;
    setRegistering(true);
    setDiscoverError('');
    try {
      const payload = {
        device_id: cfg.credentials?.device_id || cfg.device?.device_id,
        ten_thiet_bi: provisionForm.ten_thiet_bi || cfg.device?.ten_thiet_bi || cfg.credentials?.device_id,
        loai_thiet_bi: cfg.device?.loai_thiet_bi || null,
        phong_id: provisionForm.phong_id || cfg.device?.phong_id || null,
        secret_key: cfg.credentials?.secret_key || null,
        http_api_key: cfg.credentials?.http_api_key || null,
        protocol: cfg.device?.protocol || 'mqtt',
        device_type: cfg.device?.device_type || 'sensor',
        edge_control_url: cfg.device?.edge_control_url || null,
        keys: cfg.data_keys || [],
        control_commands: cfg.control_commands || [],
        re_register: true,
      };
      const res = await axios.post(`${API_BASE}/devices/register`, payload, {
        headers: { Authorization: `Bearer ${token}` },
      });
      alert(res.data.is_reregister
        ? `Đã khôi phục thiết bị '${res.data.device?.ma_thiet_bi}' thành công.`
        : `Đăng ký thiết bị '${res.data.device?.ma_thiet_bi}' thành công.`);
      onDeviceAdded();
      handleClose();
    } catch (err) {
      setDiscoverError('Lỗi: ' + (err.response?.data?.detail || err.message));
    } finally {
      setRegistering(false);
    }
  };

  const handleFinish = () => {
    onDeviceAdded();
    handleClose();
  };

  const modalContent = (
    <div className="bdu-modal-overlay" onClick={handleClose}>
      <div className="bdu-modal-content" onClick={e => e.stopPropagation()}>

        {/* Modal Header */}
        <div className="bdu-modal-header">
          <div className="bdu-modal-tabs">
            <button className={`bdu-modal-tab ${modalTab === 'provision' ? 'active' : ''}`} onClick={() => setModalTab('provision')}>
              <Icon name="add_circle" className="bdu-tab-icon" /> Tạo thiết bị
            </button>
            <button className={`bdu-modal-tab ${modalTab === 'discover' ? 'active' : ''}`} onClick={() => setModalTab('discover')}>
              <Icon name="wifi_find" className="bdu-tab-icon" /> Quét thiết bị
            </button>
            <button className={`bdu-modal-tab ${modalTab === 'import' ? 'active' : ''}`} onClick={() => setModalTab('import')}>
              <Icon name="upload_file" className="bdu-tab-icon" /> Nhập config
            </button>
          </div>
          <button className="bdu-modal-close" onClick={handleClose}>
            <Icon name="close" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="bdu-modal-body">

          {/* ── TAB: Provision ── */}
          {modalTab === 'provision' && (
            <div className="bdu-provision">
              {provisionStep === 1 && (
                <>
                  <div className="bdu-form-group bdu-quick-template">
                    <label className="bdu-label"><Icon name="bolt" className="bdu-label-icon" /> Mẫu thiết bị</label>
                    <select className="bdu-select"
                      onChange={e => {
                        const val = e.target.value;
                        if (val === 'smart_classroom') {
                          setProvisionForm(prev => ({ ...prev, device_type: 'sensor', loai_thiet_bi: 'smart_classroom_energy', protocol: 'mqtt', data_keys: getDefaultKeysForDeviceType('smart_classroom_energy') }));
                        } else {
                          setProvisionForm(prev => ({ ...prev, device_type: 'sensor', loai_thiet_bi: '', protocol: 'mqtt', data_keys: [] }));
                        }
                      }}
                      defaultValue="custom"
                    >
                      <option value="custom">Tùy chỉnh (Tự nhập)</option>
                      <option value="smart_classroom">Lớp học thông minh (Smart Classroom)</option>
                    </select>
                  </div>

                  <div className="bdu-form-row">
                    <div className="bdu-form-group">
                      <label className="bdu-label">Tên thiết bị *</label>
                      <input className="bdu-input" type="text" value={provisionForm.ten_thiet_bi}
                        onChange={e => setProvisionForm({ ...provisionForm, ten_thiet_bi: e.target.value })}
                        placeholder="VD: Công tơ điện A101" />
                    </div>
                    <div className="bdu-form-group">
                      <label className="bdu-label">Phòng *</label>
                      <select className="bdu-select" value={provisionForm.phong_id}
                        onChange={e => setProvisionForm({ ...provisionForm, phong_id: e.target.value })}>
                        <option value="">-- Chọn phòng --</option>
                        {rooms.map(r => <option key={r.id} value={r.id}>{r.ten_phong || r.ma_phong}</option>)}
                      </select>
                    </div>
                  </div>

                  <div className="bdu-form-row">
                    <div className="bdu-form-group">
                      <label className="bdu-label">Giao thức</label>
                      <select className="bdu-select" value={provisionForm.protocol}
                        onChange={e => setProvisionForm({ ...provisionForm, protocol: e.target.value })}>
                        <option value="mqtt">MQTT</option>
                        <option value="http">HTTP</option>
                        <option value="both">Cả hai</option>
                      </select>
                    </div>
                    <div className="bdu-form-group">
                      <label className="bdu-label">Loại thiết bị</label>
                      <select className="bdu-select" value={provisionForm.device_type}
                        onChange={e => setProvisionForm({ ...provisionForm, device_type: e.target.value })}>
                        <option value="sensor">Cảm biến (Sensor)</option>
                        <option value="controller">Bộ điều khiển</option>
                        <option value="gateway">Gateway</option>
                      </select>
                    </div>
                  </div>

                  <div className="bdu-form-group">
                    <label className="bdu-label">Chi tiết loại (tùy chọn)</label>
                    <input className="bdu-input" type="text" value={provisionForm.loai_thiet_bi}
                      onChange={e => setProvisionForm({ ...provisionForm, loai_thiet_bi: e.target.value })}
                      placeholder="VD: power_meter, temperature_sensor..." />
                  </div>

                  {provisionError && <div className="bdu-error-msg">{provisionError}</div>}

                  <button className="bdu-btn-primary" disabled={provisioning}
                    onClick={async () => {
                      if (!provisionForm.ten_thiet_bi || !provisionForm.phong_id) {
                        setProvisionError('Vui lòng điền tên thiết bị và chọn phòng'); return;
                      }
                      setProvisioning(true); setProvisionError('');
                      try {
                        const res = await axios.post(`${API_BASE}/devices/provision`, {
                          ...provisionForm, phong_id: parseInt(provisionForm.phong_id)
                        }, { headers: { Authorization: `Bearer ${token}` } });
                        setProvisionResult(res.data); setProvisionStep(2);
                      } catch (err) {
                        setProvisionError('Lỗi: ' + (err.response?.data?.detail || err.message));
                      } finally { setProvisioning(false); }
                    }}>
                    <Icon name="build" className="bdu-btn-icon" />
                    {provisioning ? 'Đang tạo...' : 'Tạo thiết bị'}
                  </button>
                </>
              )}

              {provisionStep === 2 && provisionResult && (
                <div className="bdu-provision-result">
                  <div className="bdu-result-success">
                    <Icon name="check_circle" /> Thiết bị đã được tạo thành công!
                  </div>

                  <div className="bdu-result-section">
                    <h4><Icon name="info" className="bdu-result-icon" /> Thông tin thiết bị</h4>
                    <div className="bdu-result-item"><span className="bdu-result-label">Device ID:</span>
                      <code className="bdu-result-value">{provisionResult.credentials?.device_id}</code>
                      <button className="bdu-copy-btn" onClick={() => navigator.clipboard.writeText(provisionResult.credentials?.device_id)}>
                        <Icon name="content_copy" />
                      </button>
                    </div>
                    <div className="bdu-result-item"><span className="bdu-result-label">Tên:</span><span className="bdu-result-value">{provisionResult.device?.ten_thiet_bi}</span></div>
                  </div>

                  <div className="bdu-result-section bdu-credentials">
                    <h4><Icon name="key" className="bdu-result-icon bdu-icon-amber" /> Credentials (Lưu lại!)</h4>
                    <div className="bdu-result-item"><span className="bdu-result-label">Secret Key:</span>
                      <code className="bdu-result-value bdu-secret">{provisionResult.credentials?.secret_key}</code>
                      <button className="bdu-copy-btn" onClick={() => navigator.clipboard.writeText(provisionResult.credentials?.secret_key)}>
                        <Icon name="content_copy" />
                      </button>
                    </div>
                    {provisionResult.credentials?.http_api_key && (
                      <div className="bdu-result-item"><span className="bdu-result-label">HTTP API Key:</span>
                        <code className="bdu-result-value bdu-secret">{provisionResult.credentials?.http_api_key}</code>
                        <button className="bdu-copy-btn" onClick={() => navigator.clipboard.writeText(provisionResult.credentials?.http_api_key)}>
                          <Icon name="content_copy" />
                        </button>
                      </div>
                    )}
                  </div>

                  {provisionResult.mqtt_config && (
                    <div className="bdu-result-section">
                      <h4><Icon name="cell_tower" className="bdu-result-icon bdu-icon-cyan" /> MQTT Config</h4>
                      <div className="bdu-result-item"><span className="bdu-result-label">Broker:</span><code className="bdu-result-value">{provisionResult.mqtt_config.broker}:{provisionResult.mqtt_config.port}</code></div>
                      <div className="bdu-result-item"><span className="bdu-result-label">Topic Data:</span>
                        <code className="bdu-result-value">{provisionResult.mqtt_config.topic_data}</code>
                        <button className="bdu-copy-btn" onClick={() => navigator.clipboard.writeText(provisionResult.mqtt_config.topic_data)}>
                          <Icon name="content_copy" />
                        </button>
                      </div>
                    </div>
                  )}

                  <div className="bdu-result-section">
                    <h4><Icon name="analytics" className="bdu-result-icon bdu-icon-purple" /> Định nghĩa dữ liệu</h4>
                    <p className="bdu-result-hint">Gửi dữ liệu từ thiết bị → Nhấn "Lắng nghe" để detect keys</p>
                    {detectedKeys.length > 0 && (
                      <div className="bdu-detected-keys">
                        {detectedKeys.map(k => (
                          <span key={k.khoa} className="bdu-detected-key">
                            {k.khoa} {k.don_vi && `(${k.don_vi})`}
                          </span>
                        ))}
                      </div>
                    )}
                    <button className="bdu-btn-detect" disabled={detecting}
                      onClick={async () => {
                        setDetecting(true); setDetectProgress(0);
                        const interval = setInterval(() => setDetectProgress(p => Math.min(p + 10, 95)), 1000);
                        try {
                          const res = await axios.post(`${API_BASE}/devices/${provisionResult.credentials?.device_id}/detect-keys?listen_seconds=10`, {},
                            { headers: { Authorization: `Bearer ${token}` } });
                          setDetectedKeys(res.data.new_keys_added || []);
                          if (res.data.new_keys_added?.length > 0) alert(`Phát hiện ${res.data.new_keys_added.length} keys: ${res.data.new_keys_added.map(k => k.khoa).join(', ')}`);
                          else if (res.data.message_count === 0) alert('Không nhận được data từ thiết bị.');
                          else alert('Không có keys mới.');
                        } catch (err) { alert('Lỗi: ' + (err.response?.data?.detail || err.message)); }
                        finally { clearInterval(interval); setDetectProgress(100); setTimeout(() => setDetecting(false), 500); }
                      }}>
                      <Icon name="antenna" className="bdu-btn-icon" />
                      {detecting ? `Đang lắng nghe... ${detectProgress}%` : 'Lắng nghe & Detect (10s)'}
                    </button>
                  </div>

                  <div className="bdu-result-section">
                    <h4><Icon name="hardware" className="bdu-result-icon bdu-icon-amber" /> Đường điều khiển</h4>
                    {controlLines.map((line, idx) => (
                      <div key={idx} className="bdu-control-line-row">
                        <span className="bdu-control-relay">Relay {line.relay_number}</span>
                        <input className="bdu-input" type="text" value={line.ten_duong}
                          onChange={e => { const u = [...controlLines]; u[idx] = { ...u[idx], ten_duong: e.target.value }; setControlLines(u); setControlLinesSaved(false); }}
                          placeholder={`Tên đường ${line.relay_number}...`} />
                        <button className="bdu-control-remove" onClick={() => {
                          const u = controlLines.filter((_, i) => i !== idx).map((l, i) => ({ ...l, relay_number: i + 1 }));
                          setControlLines(u); setControlLinesSaved(false);
                        }}><Icon name="close" /></button>
                      </div>
                    ))}
                    <div className="bdu-control-line-actions">
                      <button className="bdu-btn-secondary" onClick={() => { setControlLines([...controlLines, { relay_number: controlLines.length + 1, ten_duong: '' }]); setControlLinesSaved(false); }}>
                        <Icon name="add" /> Thêm đường
                      </button>
                      {controlLines.length > 0 && (
                        <button className="bdu-btn-save" disabled={savingControlLines}
                          onClick={async () => {
                            setSavingControlLines(true);
                            try {
                              await axios.post(`${API_BASE}/devices/${provisionResult.credentials?.device_id}/control-lines`, { lines: controlLines },
                                { headers: { Authorization: `Bearer ${token}` } });
                              setControlLinesSaved(true);
                            } catch (err) { alert('Lỗi lưu: ' + (err.response?.data?.detail || err.message)); }
                            finally { setSavingControlLines(false); }
                          }}>
                          {savingControlLines ? '...' : controlLinesSaved ? 'Đã lưu' : 'Lưu đường điều khiển'}
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="bdu-result-actions">
                    <button className="bdu-btn-secondary" disabled={downloadingConfig}
                      onClick={async () => {
                        if (controlLines.length > 0 && !controlLinesSaved) {
                          if (!window.confirm('Có đường điều khiển chưa lưu! Lưu và download?')) return;
                          try { await axios.post(`${API_BASE}/devices/${provisionResult.credentials?.device_id}/control-lines`, { lines: controlLines }, { headers: { Authorization: `Bearer ${token}` } }); setControlLinesSaved(true); }
                          catch (err) { alert('Lỗi lưu: ' + (err.response?.data?.detail || err.message)); return; }
                        }
                        setDownloadingConfig(true);
                        try {
                          const res = await axios.get(`${API_BASE}/devices/${provisionResult.credentials?.device_id}/full-config`,
                            { headers: { Authorization: `Bearer ${token}` }, timeout: 30000 });
                          const blob = new Blob([JSON.stringify(res.data, null, 2)], { type: 'application/json' });
                          const url = URL.createObjectURL(blob);
                          const a = document.createElement('a'); a.href = url; a.download = `device-${provisionResult.credentials?.device_id}.json`; a.click();
                          URL.revokeObjectURL(url);
                        } catch (err) { alert('Lỗi tải config: ' + (err.response?.data?.detail || err.message)); }
                        finally { setDownloadingConfig(false); }
                      }}>
                      <Icon name="download" className="bdu-btn-icon" />
                      {downloadingConfig ? 'Đang tải...' : 'Tải Config'}
                    </button>
                    <button className="bdu-btn-primary" onClick={handleFinish}>
                      <Icon name="check" className="bdu-btn-icon" /> Hoàn tất
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── TAB: Import Config ── */}
          {modalTab === 'import' && (
            <div className="bdu-import-tab">
              <p className="bdu-import-desc">Tải lên file config JSON đã xuất trước đó để khôi phục thiết bị với cùng device_id và credentials.</p>
              <div className="bdu-dropzone">
                <Icon name="cloud_upload" className="bdu-dropzone-icon" />
                <p>Kéo thả file config JSON hoặc nhấn nút bên dưới</p>
                <label className="bdu-btn-secondary bdu-dropzone-label">
                  <Icon name="file_open" className="bdu-btn-icon" /> Chọn file config
                  <input type="file" accept=".json" style={{ display: 'none' }} onChange={handleImportConfig} />
                </label>
              </div>

              {importedDeviceConfig && (
                <div className="bdu-import-preview">
                  <h4>Config đã nhập — {importedDeviceConfig.device?.device_id}</h4>
                  {importedDeviceConfig.credentials && (
                    <div className="bdu-import-section">
                      <span className="bdu-import-section-label">Credentials</span>
                      <code className="bdu-import-code">device_id: {importedDeviceConfig.credentials.device_id}</code>
                    </div>
                  )}
                </div>
              )}

              {importedDeviceConfig && (
                <>
                  <div className="bdu-form-group">
                    <label className="bdu-label">Tên thiết bị *</label>
                    <input className="bdu-input" type="text" value={provisionForm.ten_thiet_bi}
                      onChange={e => setProvisionForm({ ...provisionForm, ten_thiet_bi: e.target.value })} />
                  </div>
                  <div className="bdu-form-group">
                    <label className="bdu-label">Phòng</label>
                    <select className="bdu-select" value={provisionForm.phong_id}
                      onChange={e => setProvisionForm({ ...provisionForm, phong_id: e.target.value })}>
                      <option value="">-- Chọn phòng --</option>
                      {rooms.map(r => <option key={r.id} value={r.id}>{r.ten_phong || r.ma_phong}</option>)}
                    </select>
                  </div>
                </>
              )}

              {discoverError && <div className="bdu-error-msg">{discoverError}</div>}

              <div className="bdu-import-actions">
                <button className="bdu-btn-secondary" disabled={registering}
                  onClick={() => { setImportedDeviceConfig(null); setProvisionForm({ ten_thiet_bi: '', phong_id: '', protocol: 'mqtt', device_type: 'sensor', loai_thiet_bi: '', data_keys: [] }); setDiscoverError(''); }}>
                  Hủy
                </button>
                <button className="bdu-btn-primary" disabled={!importedDeviceConfig || !provisionForm.ten_thiet_bi || registering}
                  onClick={handleRegisterImportedDevice}>
                  {registering ? 'Đang đăng ký...' : 'Khôi phục thiết bị'}
                </button>
              </div>
            </div>
          )}

          {/* ── TAB: Discover ── */}
          {modalTab === 'discover' && (
            <div className="bdu-discover-tab">
              <button className="bdu-btn-primary bdu-scan-btn" disabled={scanning}
                onClick={async () => {
                  setScanning(true); setDiscoverError('');
                  try {
                    const res = await axios.get(`${API_BASE}/devices/discover`, { headers: { Authorization: `Bearer ${token}` } });
                    const devs = res.data.discovered_devices || [];
                    setDiscoveredDevices(devs);
                    const newSelected = {};
                    devs.forEach(dev => {
                      const deviceId = dev.device_id;
                      const type = dev.suggested_type || 'sensor';
                      const keys = (dev.detected_fields || []).map(f => {
                        let unit = '';
                        if (f === 'temperature') unit = '°C';
                        else if (f === 'humidity') unit = '%';
                        else if (f === 'brightness') unit = '%';
                        else if (f === 'setpoint') unit = '°C';
                        else if (f === 'power') unit = 'W';
                        else if (f === 'voltage') unit = 'V';
                        else if (f === 'current') unit = 'A';
                        return { khoa: f, don_vi: unit };
                      });
                      newSelected[deviceId] = { device_id: deviceId, ten_thiet_bi: deviceId, loai_thiet_bi: type, phong_id: null, keys: keys.length > 0 ? keys : [{ khoa: 'value', don_vi: '' }] };
                    });
                    setSelectedDevices(newSelected);
                    if (devs.length === 0) setDiscoverError('Không tìm thấy thiết bị mới nào.');
                  } catch (err) { setDiscoverError('Lỗi: ' + (err.response?.data?.detail || err.message)); }
                  finally { setScanning(false); }
                }}>
                <Icon name="wifi_find" className="bdu-btn-icon" />
                {scanning ? 'Đang quét...' : 'Quét thiết bị (10s)'}
              </button>

              {discoverError && <div className="bdu-error-msg">{discoverError}</div>}

              {discoveredDevices.length > 0 && (
                <div className="bdu-discovered-list">
                  <h4>Tìm thấy {discoveredDevices.length} thiết bị:</h4>
                  {discoveredDevices.map(dev => {
                    const deviceId = dev.device_id;
                    const selectedDev = selectedDevices[deviceId] || {};
                    const suggestedType = dev.suggested_type || 'unknown';
                    return (
                      <div key={deviceId} className="bdu-discovered-item">
                        <div className="bdu-discovered-header">
                          <Icon name="memory" className="bdu-icon-cyan" />
                          <div>
                            <div className="bdu-discovered-name">{deviceId}</div>
                            <div className="bdu-discovered-type">Loại: {suggestedType}</div>
                          </div>
                        </div>
                        <select className="bdu-select" value={selectedDev.phong_id || ''}
                          onChange={e => setSelectedDevices(prev => ({ ...prev, [deviceId]: { ...prev[deviceId], phong_id: e.target.value ? parseInt(e.target.value) : null } }))}>
                          <option value="">-- Chọn phòng --</option>
                          {rooms.map(r => <option key={r.id} value={r.id}>{r.ten_phong || r.ma_phong}</option>)}
                        </select>
                      </div>
                    );
                  })}
                  <button className="bdu-btn-primary" disabled={registering}
                    onClick={async () => {
                      setRegistering(true); setDiscoverError('');
                      try {
                        await Promise.all(Object.values(selectedDevices).map(dev =>
                          axios.post(`${API_BASE}/devices/register`, dev, { headers: { Authorization: `Bearer ${token}` } })
                        ));
                        onDeviceAdded();
                        handleClose();
                      } catch (err) { setDiscoverError('Lỗi: ' + (err.response?.data?.detail || err.message)); }
                      finally { setRegistering(false); }
                    }}>
                    {registering ? 'Đang đăng ký...' : 'Đăng ký tất cả'}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}
