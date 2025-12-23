import React, { useState, useEffect } from 'react';
import axios from 'axios';

const API_BASE = process.env.REACT_APP_API_BASE || 'http://localhost:8000';

// Simple icon helper to avoid extra dependencies
const deviceIcon = (id = '') => {
  // Đảm bảo id là string trước khi gọi includes
  const idStr = String(id || '');
  if (idStr.includes('light')) return '💡';
  if (idStr.includes('ac')) return '❄️';
  return '📟';
};

// Helper để lấy keys mặc định theo loại thiết bị (dựa trên simulator)
const getDefaultKeysForDeviceType = (deviceType, deviceId = '') => {
  switch (deviceType) {
    case 'sensor':
      return [
        { khoa: 'temperature', don_vi: '°C', mo_ta: 'Nhiệt độ' },
        { khoa: 'humidity', don_vi: '%', mo_ta: 'Độ ẩm' },
      ];
    case 'air_conditioner':
      return [
        { khoa: 'state', don_vi: '', mo_ta: 'Trạng thái (ON/OFF)' },
        { khoa: 'setpoint', don_vi: '°C', mo_ta: 'Nhiệt độ cài đặt' },
      ];
    case 'light':
      return [
        { khoa: 'state', don_vi: '', mo_ta: 'Trạng thái (ON/OFF)' },
        { khoa: 'brightness', don_vi: '%', mo_ta: 'Độ sáng (0-100)' },
      ];
    case 'smart_classroom_energy':
      return [
        { khoa: 'Thoi_gian_bat_dau', don_vi: '', mo_ta: 'Thời gian bắt đầu' },
        { khoa: 'Thoi_gian_ket_thuc', don_vi: '', mo_ta: 'Thời gian kết thúc' },
        { khoa: 'Thoi_luong', don_vi: 's', mo_ta: 'Thời lượng' },
        { khoa: 'Nang_luong', don_vi: 'kWh', mo_ta: 'Năng lượng tiêu thụ' },
        { khoa: 'Dien_ap_TB', don_vi: 'V', mo_ta: 'Điện áp trung bình' },
        { khoa: 'Dien_ap_Max', don_vi: 'V', mo_ta: 'Điện áp tối đa' },
        { khoa: 'Dien_ap_Min', don_vi: 'V', mo_ta: 'Điện áp tối thiểu' },
        { khoa: 'Dong_dien_TB', don_vi: 'A', mo_ta: 'Dòng điện trung bình' },
        { khoa: 'Dong_dien_Max', don_vi: 'A', mo_ta: 'Dòng điện tối đa' },
        { khoa: 'Dong_dien_Min', don_vi: 'A', mo_ta: 'Dòng điện tối thiểu' },
        { khoa: 'Cong_suat_TB', don_vi: 'W', mo_ta: 'Công suất trung bình' },
        { khoa: 'Cong_suat_Max', don_vi: 'W', mo_ta: 'Công suất tối đa' },
        { khoa: 'Cong_suat_Min', don_vi: 'W', mo_ta: 'Công suất tối thiểu' },
        { khoa: 'Tan_so_TB', don_vi: 'Hz', mo_ta: 'Tần số trung bình' },
        { khoa: 'Tan_so_Max', don_vi: 'Hz', mo_ta: 'Tần số tối đa' },
        { khoa: 'Tan_so_Min', don_vi: 'Hz', mo_ta: 'Tần số tối thiểu' },
        { khoa: 'He_so_cong_suat_TB', don_vi: '', mo_ta: 'Hệ số công suất TB' },
        { khoa: 'He_so_cong_suat_Max', don_vi: '', mo_ta: 'Hệ số công suất Max' },
        { khoa: 'He_so_cong_suat_Min', don_vi: '', mo_ta: 'Hệ số công suất Min' },
        { khoa: 'Tien_dien', don_vi: 'VND', mo_ta: 'Tiền điện' },
      ];
    default:
      // Mặc định cho sensor nếu không xác định được
      return [
        { khoa: 'temperature', don_vi: '°C', mo_ta: 'Nhiệt độ' },
        { khoa: 'humidity', don_vi: '%', mo_ta: 'Độ ẩm' },
      ];
  }
};

// Helper để tự động phát hiện loại thiết bị từ device_id
const detectDeviceType = (deviceId) => {
  // Đảm bảo deviceId là string trước khi gọi includes
  const idStr = String(deviceId || '');
  if (idStr.includes('sensor')) return 'sensor';
  if (idStr.includes('ac')) return 'air_conditioner';
  if (idStr.includes('light')) return 'light';
  if (idStr.includes('energy') || idStr.includes('meter') || idStr.includes('classroom')) return 'smart_classroom_energy';
  return 'sensor'; // Mặc định
};

const DeviceSetupWizard = ({ token, onComplete }) => {
  const [step, setStep] = useState(1);
  const [discoveredDevices, setDiscoveredDevices] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [selectedDevices, setSelectedDevices] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [scanning, setScanning] = useState(false);
  const [status, setStatus] = useState('Đang chờ...');

  // Load rooms khi component mount
  useEffect(() => {
    axios
      .get(`${API_BASE}/rooms`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      .then((res) => setRooms(res.data.rooms || []))
      .catch((err) => console.error('Không tải được danh sách phòng', err));
  }, [token]);

  // Bước 1: Quét thiết bị
  const handleScan = async () => {
    setScanning(true);
    setError('');
    setStatus('Đang quét...');
    try {
      const res = await axios.get(`${API_BASE}/devices/discover`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const devices = res.data.discovered_devices || [];
      setDiscoveredDevices(devices);

      // Khởi tạo selectedDevices với các device mới
      // API trả về mảng object: {device_id, detected_fields, sample_data, suggested_type, message_count}
      const newSelected = {};
      devices.forEach((device) => {
        const deviceId = device.device_id || device; // Hỗ trợ cả object và string (backward compatible)
        if (!selectedDevices[deviceId]) {
          // Sử dụng suggested_type từ API nếu có, nếu không thì tự detect
          const detectedType = device.suggested_type || detectDeviceType(deviceId);
          
          // Tạo keys từ detected_fields nếu có
          let keys = [];
          if (device.detected_fields && device.detected_fields.length > 0) {
            keys = device.detected_fields.map((field) => ({
              khoa: field,
              don_vi: '',
              mo_ta: '',
            }));
          } else {
            // Fallback về keys mặc định
            keys = getDefaultKeysForDeviceType(detectedType, deviceId);
          }
          
          newSelected[deviceId] = {
            device_id: deviceId,
            ten_thiet_bi: deviceId,
            loai_thiet_bi: detectedType,
            phong_id: null,
            keys: keys,
          };
        } else {
          newSelected[deviceId] = selectedDevices[deviceId];
        }
      });
      setSelectedDevices(newSelected);

      if (devices.length === 0) {
        setError('Không tìm thấy thiết bị mới. Vui lòng đảm bảo simulator đang chạy.');
        setStatus('Không tìm thấy thiết bị');
      } else {
        setStatus(`Đã tìm thấy ${devices.length} thiết bị`);
      }
    } catch (err) {
      setError('Lỗi khi quét thiết bị: ' + (err.response?.data?.detail || err.message));
      setStatus('Lỗi');
    } finally {
      setScanning(false);
    }
  };

  // Cập nhật thông tin thiết bị
  const updateDevice = (deviceId, field, value) => {
    setSelectedDevices((prev) => {
      const updated = {
        ...prev,
        [deviceId]: {
          ...prev[deviceId],
          [field]: value,
        },
      };

      // Nếu thay đổi loại thiết bị, tự động cập nhật keys mặc định
      if (field === 'loai_thiet_bi') {
        updated[deviceId].keys = getDefaultKeysForDeviceType(value, deviceId);
      }

      return updated;
    });
  };

  // Thêm key mới cho thiết bị
  const addKeyToDevice = (deviceId) => {
    setSelectedDevices((prev) => ({
      ...prev,
      [deviceId]: {
        ...prev[deviceId],
        keys: [
          ...(prev[deviceId].keys || []),
          { khoa: '', don_vi: '', mo_ta: '' },
        ],
      },
    }));
  };

  // Xóa key khỏi thiết bị
  const removeKeyFromDevice = (deviceId, keyIndex) => {
    setSelectedDevices((prev) => ({
      ...prev,
      [deviceId]: {
        ...prev[deviceId],
        keys: prev[deviceId].keys.filter((_, idx) => idx !== keyIndex),
      },
    }));
  };

  // Cập nhật một key cụ thể
  const updateDeviceKey = (deviceId, keyIndex, field, value) => {
    setSelectedDevices((prev) => {
      const newKeys = [...(prev[deviceId].keys || [])];
      newKeys[keyIndex] = {
        ...newKeys[keyIndex],
        [field]: value,
      };
      return {
        ...prev,
        [deviceId]: {
          ...prev[deviceId],
          keys: newKeys,
        },
      };
    });
  };

  // Bước 3: Đăng ký thiết bị
  const handleRegister = async () => {
    setLoading(true);
    setError('');

    const devicesToRegister = Object.values(selectedDevices).filter((dev) => dev.device_id && dev.ten_thiet_bi);

    if (devicesToRegister.length === 0) {
      setError('Vui lòng chọn ít nhất một thiết bị để đăng ký');
      setLoading(false);
      return;
    }

    try {
      // Đăng ký từng thiết bị, chỉ gửi keys hợp lệ (có khoa không rỗng)
      const promises = devicesToRegister.map((device) => {
        const validKeys = (device.keys || []).filter((key) => key.khoa && key.khoa.trim() !== '');
        const deviceToRegister = {
          ...device,
          keys: validKeys,
        };
        return axios.post(`${API_BASE}/devices/register`, deviceToRegister, { headers: { Authorization: `Bearer ${token}` } });
      });

      await Promise.all(promises);
      onComplete(); // Gọi callback để reload danh sách thiết bị
    } catch (err) {
      setError('Lỗi khi đăng ký thiết bị: ' + (err.response?.data?.detail || err.message));
    } finally {
      setLoading(false);
    }
  };

  const renderStep1 = () => (
    <div className="device-setup-card">
      <div className="device-setup-card-header">
        <div className="step-pill">Bước 1</div>
        <div>
          <div className="card-title">Quét thiết bị</div>
          <div className="card-subtitle">Hệ thống sẽ quét các thiết bị đang gửi dữ liệu trong mạng (5 giây)</div>
        </div>
      </div>

      <div className="device-setup-grid">
        <div className="device-setup-left">
          <button onClick={handleScan} disabled={scanning} className={`scan-btn ${scanning ? 'loading' : ''}`}>
            {scanning ? <div className="spinner" /> : '🔍'}
            {scanning ? 'Đang quét...' : 'Quét thiết bị'}
          </button>

          <input
            type="text"
            readOnly
            placeholder="Kết quả quét sẽ hiển thị tại đây..."
            className="status-input"
            value={discoveredDevices.length > 0 ? `Đã tìm thấy ${discoveredDevices.length} thiết bị` : ''}
          />

          {error && (
            <div className="error-box">
              <span className="error-icon">⚠️</span>
              <div>{error}</div>
            </div>
          )}

          {discoveredDevices.length > 0 && (
            <div className="success-box">
              <div className="success-title">✅ Tìm thấy {discoveredDevices.length} thiết bị:</div>
              <ul className="device-list">
                {discoveredDevices.map((device) => {
                  const deviceId = device.device_id || device; // Hỗ trợ cả object và string
                  return (
                    <li key={deviceId}>
                      <span className="device-badge">{deviceIcon(deviceId)}</span>
                      {deviceId}
                    </li>
                  );
                })}
              </ul>
              <button className="primary-btn" onClick={() => setStep(2)}>
                Tiếp theo →
              </button>
            </div>
          )}
        </div>

        <div className="device-setup-right">
          <div className="status-panel">
            <div className="status-label">Trạng thái</div>
            <div className="status-value">{status}</div>
            <p className="status-hint">Đảm bảo simulator đang chạy và Kafka/MQTT đã kết nối.</p>
          </div>
        </div>
      </div>

      {discoveredDevices.length > 0 && (
        <div className="device-modal">
          <div className="device-modal-header">Tìm thấy {discoveredDevices.length} thiết bị</div>
          <div className="device-modal-body">
            {discoveredDevices.map((device) => {
              const deviceId = device.device_id || device; // Hỗ trợ cả object và string
              return (
                <div className="device-modal-item" key={deviceId}>
                  <div className="device-icon">{deviceIcon(deviceId)}</div>
                  <span>{deviceId}</span>
                </div>
              );
            })}
          </div>
          <div className="device-modal-footer">
            <button className="secondary-btn" onClick={() => setStep(2)}>
              Tiếp theo
            </button>
          </div>
        </div>
      )}
    </div>
  );

  const renderStep2 = () => (
    <div className="device-setup-card">
      <div className="device-setup-card-header">
        <div className="step-pill">Bước 2</div>
        <div>
          <div className="card-title">Cấu hình thiết bị</div>
          <div className="card-subtitle">Điền thông tin cho các thiết bị đã tìm thấy</div>
        </div>
      </div>

      {discoveredDevices.map((deviceObj) => {
        const deviceId = deviceObj.device_id || deviceObj; // Hỗ trợ cả object và string
        const device = selectedDevices[deviceId] || {};
        return (
          <div className="device-config-card" key={deviceId}>
            <div className="config-header">
              <div className="device-icon">{deviceIcon(deviceId)}</div>
              <div className="config-title">{deviceId}</div>
            </div>

            <label className="config-label">Tên hiển thị</label>
            <input
              className="config-input"
              type="text"
              value={device.ten_thiet_bi || ''}
              onChange={(e) => updateDevice(deviceId, 'ten_thiet_bi', e.target.value)}
              placeholder="Nhập tên thiết bị"
            />

            <label className="config-label">Loại thiết bị</label>
            <select
              className="config-input"
              value={device.loai_thiet_bi || 'sensor'}
              onChange={(e) => updateDevice(deviceId, 'loai_thiet_bi', e.target.value)}
            >
              <option value="sensor">Sensor</option>
              <option value="actuator">Actuator</option>
              <option value="air_conditioner">Điều hòa</option>
              <option value="light">Đèn</option>
              <option value="smart_classroom_energy">Smart Classroom Energy</option>
            </select>

            <label className="config-label">Phòng</label>
            <select
              className="config-input"
              value={device.phong_id || ''}
              onChange={(e) => updateDevice(deviceId, 'phong_id', e.target.value ? parseInt(e.target.value) : null)}
            >
              <option value="">-- Chọn phòng (tùy chọn) --</option>
              {rooms.map((room) => (
                <option key={room.id} value={room.id}>
                  {room.ten_phong || room.ma_phong || `Phòng ${room.id}`}
                </option>
              ))}
            </select>

            <div className="config-keys">
              <div className="config-label">Các keys dữ liệu</div>
              <div className="keys-list">
                {(device.keys || []).map((key, idx) => (
                  <div key={idx} className="key-item">
                    <div className="key-row">
                      <input
                        className="config-input key-input"
                        type="text"
                        placeholder="Tên key (vd: temperature)"
                        value={key.khoa || ''}
                        onChange={(e) => updateDeviceKey(deviceId, idx, 'khoa', e.target.value)}
                        style={{ flex: '2' }}
                      />
                      <input
                        className="config-input key-input"
                        type="text"
                        placeholder="Đơn vị (vd: °C)"
                        value={key.don_vi || ''}
                        onChange={(e) => updateDeviceKey(deviceId, idx, 'don_vi', e.target.value)}
                        style={{ flex: '1', marginLeft: '8px' }}
                      />
                      <input
                        className="config-input key-input"
                        type="text"
                        placeholder="Mô tả"
                        value={key.mo_ta || ''}
                        onChange={(e) => updateDeviceKey(deviceId, idx, 'mo_ta', e.target.value)}
                        style={{ flex: '2', marginLeft: '8px' }}
                      />
                      <button
                        type="button"
                        className="remove-key-btn"
                        onClick={() => removeKeyFromDevice(deviceId, idx)}
                        title="Xóa key"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              <button
                type="button"
                className="add-key-btn"
                onClick={() => addKeyToDevice(deviceId)}
              >
                + Thêm key
              </button>
            </div>
          </div>
        );
      })}

      <div className="wizard-actions">
        <button className="ghost-btn" onClick={() => setStep(1)}>
          ← Quay lại
        </button>
        <button className="primary-btn" onClick={() => setStep(3)} disabled={discoveredDevices.length === 0}>
          Tiếp theo →
        </button>
      </div>
    </div>
  );

  const renderStep3 = () => (
    <div className="device-setup-card">
      <div className="device-setup-card-header">
        <div className="step-pill">Bước 3</div>
        <div>
          <div className="card-title">Xác nhận đăng ký</div>
          <div className="card-subtitle">Kiểm tra lại thông tin trước khi đăng ký</div>
        </div>
      </div>

      <div className="confirm-list">
        {discoveredDevices.map((deviceObj) => {
          const deviceId = deviceObj.device_id || deviceObj; // Hỗ trợ cả object và string
          const device = selectedDevices[deviceId] || {};
          return (
            <div className="confirm-card" key={deviceId}>
              <div className="confirm-title">
                <span className="device-icon">{deviceIcon(deviceId)}</span>
                {deviceId}
              </div>
              <p>
                <strong>Tên:</strong> {device.ten_thiet_bi || 'Chưa đặt'}
              </p>
              <p>
                <strong>Loại:</strong> {device.loai_thiet_bi}
              </p>
              <p>
                <strong>Phòng:</strong>{' '}
                {device.phong_id ? rooms.find((r) => r.id === device.phong_id)?.ten_phong || `Phòng ${device.phong_id}` : 'Chưa chọn'}
              </p>
              <p>
                <strong>Keys dữ liệu:</strong>
              </p>
              <ul style={{ marginTop: '4px', paddingLeft: '20px' }}>
                {(device.keys || []).map((key, idx) => (
                  <li key={idx}>
                    {key.khoa} {key.don_vi && `(${key.don_vi})`} {key.mo_ta && `- ${key.mo_ta}`}
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>

      {error && <div className="error-box">{error}</div>}

      <div className="wizard-actions">
        <button className="ghost-btn" onClick={() => setStep(2)} disabled={loading}>
          ← Quay lại
        </button>
        <button className="primary-btn" onClick={handleRegister} disabled={loading}>
          {loading ? 'Đang đăng ký...' : '✅ Xác nhận đăng ký'}
        </button>
      </div>
    </div>
  );

  return (
    <div className="device-setup-page">
      <div className="device-setup-bg" />
      <div className="device-setup-container">
        <div className="device-setup-header">
          <div className="device-setup-title">
            <span className="device-setup-icon">🔧</span>
            <div>
              <h2>Thiết lập Thiết bị</h2>
              <p>Bạn chưa có thiết bị nào được đăng ký. Hãy quét và đăng ký thiết bị để bắt đầu.</p>
            </div>
          </div>
        </div>

        {step === 1 && renderStep1()}
        {step === 2 && renderStep2()}
        {step === 3 && renderStep3()}
      </div>
    </div>
  );
};

export default DeviceSetupWizard;
