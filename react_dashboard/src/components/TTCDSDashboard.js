import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { API_BASE } from '../config/api';
import { controlRelay, fetchAcStatus, controlAcCommand } from '../services';

const TTCDSDashboard = ({ token }) => {
  const [deviceData, setDeviceData] = useState(null);
  const [envDeviceData, setEnvDeviceData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [controlLoading, setControlLoading] = useState({});
  const [availableDevices, setAvailableDevices] = useState([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState('gateway-701e68b1');
  const [envDeviceId, setEnvDeviceId] = useState('gateway-701e68b1');
  const [dashboardRelays, setDashboardRelays] = useState([]);
  const [acStatus, setAcStatus] = useState(null);
  const [acControlLoading, setAcControlLoading] = useState(false);

  const ROOM_ID = 2; // TTCDS room ID

  useEffect(() => {
    if (!selectedDeviceId) return;
    const loadRelays = async () => {
      try {
        const res = await axios.get(`${API_BASE}/devices/${selectedDeviceId}/control-lines?t=${Date.now()}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        const lines = res.data.control_lines || [];
        const visible = lines.filter(l => l.hien_thi_ttcds === true || l.hien_thi_ttcds === 1);
        setDashboardRelays(visible);
      } catch (e) {
        console.error('Load control lines failed', e);
      }
    };
    loadRelays();
  }, [selectedDeviceId, token]);

  const syncEnvFromAc = (ac) => {
    if (!ac) return;
    setEnvDeviceData(prev => {
      if (!prev) return prev;
      const next = { ...prev, data: { ...(prev.data || {}) } };
      if (typeof ac.indoorTemp !== 'undefined') {
        next.data.indoorTemp = { value: ac.indoorTemp };
      }
      if (typeof ac.humidity !== 'undefined') {
        next.data.humidity = { value: ac.humidity };
      }
      if (typeof ac.temp !== 'undefined') {
        next.data.temp = { value: ac.temp };
      }
      if (typeof ac.on !== 'undefined') {
        next.data.on = { value: ac.on };
      }
      return next;
    });
  };

  const parseAcOnState = (value) => {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return value === 1;
    if (typeof value === 'string') {
      const v = value.trim().toLowerCase();
      return v === 'on' || v === 'true' || v === '1';
    }
    return false;
  };

  useEffect(() => {
    loadData();
    
    // Connect WebSocket cho real-time update
    const WS_URL = API_BASE.replace('http', 'ws') + '/ws/events';
    let ws = null;
    let reconnectTimer = null;

    const connectWS = () => {
      try {
        ws = new WebSocket(WS_URL);
        
        ws.onmessage = (event) => {
          try {
            const wsData = JSON.parse(event.data);
            
            // Xử lý ping
            if (wsData.type === 'ping') return;

            const mergeWsDataIntoDevice = (prev) => {
              if (!prev) return prev;
              const updatedDevice = { ...prev };
              const updatedData = { ...(updatedDevice.data || {}) };

              // Lặp qua dữ liệu mới để đè vào state
              Object.keys(wsData).forEach(key => {
                if (key !== 'device_id' && key !== 'type' && key !== 'timestamp' && key !== '_internal_id') {
                  // Phòng trường hợp backend Kafka đẩy về format tên key rút gọn
                  if (key.match(/^relay_\d+$/)) {
                    updatedData[`${key}_state`] = { value: wsData[key] };
                  }
                  updatedData[key] = { value: wsData[key], last_update: wsData.timestamp };
                }
              });

              updatedDevice.data = updatedData;
              updatedDevice.last_seen = wsData.timestamp || (Date.now() / 1000);
              return updatedDevice;
            };

            // Nếu đúng thiết bị đang chọn (power/relay)
            if (wsData.device_id === selectedDeviceId) {
              setDeviceData(prev => mergeWsDataIntoDevice(prev));
            }

            // Nếu đúng thiết bị môi trường (nhiệt độ/độ ẩm)
            if (wsData.device_id === envDeviceId) {
              setEnvDeviceData(prev => mergeWsDataIntoDevice(prev));
            }
          } catch (e) {
            console.error('Lỗi parse WS message:', e);
          }
        };

        ws.onclose = () => {
          // Tự động kết nối lại sau 3s nếu đứt
          reconnectTimer = setTimeout(connectWS, 3000);
        };
      } catch (err) {
        console.error('Lỗi khởi tạo WebSocket:', err);
      }
    };

    connectWS();

    return () => {
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (ws) ws.close();
    };
  }, [selectedDeviceId, envDeviceId, token]);

  const loadData = async () => {
    try {
      const res = await axios.get(`${API_BASE}/rooms/${ROOM_ID}/data`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.data.devices && res.data.devices.length > 0) {
        const devices = res.data.devices.map(d => d.device_id);
        setAvailableDevices(devices);

        const pickDifferentDevice = (baseId) => {
          if (!Array.isArray(devices) || devices.length === 0) return baseId;
          if (devices.length === 1) return baseId;
          return devices.find(id => id !== baseId) || baseId;
        };
        
        // Nếu selectedDeviceId / envDeviceId không nằm trong list, ưu tiên thiết bị đầu tiên
        let currentDeviceId = selectedDeviceId;
        if (!devices.includes(selectedDeviceId)) currentDeviceId = devices[0];

        let currentEnvDeviceId = envDeviceId;
        if (!devices.includes(envDeviceId)) currentEnvDeviceId = devices[0];

        // Tránh trùng thiết bị giữa 2 dropdown
        if (devices.length > 1 && currentEnvDeviceId === currentDeviceId) {
          currentEnvDeviceId = pickDifferentDevice(currentDeviceId);
        }

        if (currentDeviceId !== selectedDeviceId) setSelectedDeviceId(currentDeviceId);
        if (currentEnvDeviceId !== envDeviceId) setEnvDeviceId(currentEnvDeviceId);

        const device = res.data.devices.find(d => d.device_id === currentDeviceId);
        if (device) setDeviceData(device);

        const envDevice = res.data.devices.find(d => d.device_id === currentEnvDeviceId);
        if (envDevice) setEnvDeviceData(envDevice);
      }

      try {
        const acRes = await fetchAcStatus(token);
        setAcStatus(acRes.data || null);
        syncEnvFromAc(acRes.data || null);
      } catch (acErr) {
        console.error('Load AC status failed', acErr);
      }
    } catch (err) {
      console.error('Load data failed', err);
    } finally {
      setLoading(false);
    }
  };

  const handleAcControl = async (command) => {
    if (acControlLoading) return;
    setAcControlLoading(true);
    try {
      await controlAcCommand(command, token);

      // Một số gateway phản hồi lệnh nhanh hơn trạng thái thực tế,
      // nên đọc lại /ac/status sau nhịp ngắn để UI không bị "kẹt" trạng thái cũ.
      const refreshStatus = async () => {
        const statusRes = await fetchAcStatus(token);
        const nextAc = statusRes.data || null;
        setAcStatus(nextAc);
        syncEnvFromAc(nextAc);
      };

      await refreshStatus();
      await new Promise((resolve) => setTimeout(resolve, 600));
      await refreshStatus();
    } catch (err) {
      alert('Điều khiển máy lạnh thất bại: ' + (err.response?.data?.detail || err.message));
    } finally {
      setAcControlLoading(false);
    }
  };

  const handleRelayControl = async (deviceId, relayNum, state) => {
    const key = `${deviceId}_relay_${relayNum}`;
    setControlLoading(prev => ({ ...prev, [key]: true }));
    
    // Optimistic update - cập nhật UI ngay lập tức
    const optimisticUpdate = (prev) => {
      if (!prev) return prev;
      const newData = { ...prev };
      if (!newData.data) newData.data = {};
      newData.data[`relay_${relayNum}_state`] = { value: state };
      return newData;
    };

    if (deviceId === selectedDeviceId) {
      setDeviceData(prev => optimisticUpdate(prev));
    }
    if (deviceId === envDeviceId) {
      setEnvDeviceData(prev => optimisticUpdate(prev));
    }
    
    try {
      await controlRelay(deviceId, relayNum, state, token);
      // Ghi chú: Không cần gọi lại loadData() hay setTimeout nữa, 
      // vì WebSocket Server sẽ nhận ACK từ thiết bị và bắn ngược lại UI màu xanh/đỏ một cách vô cùng chính xác gần như tức thì.
    } catch (err) {
      alert('Điều khiển thất bại: ' + (err.response?.data?.detail || err.message));
      // Nếu HTTP lỗi, load lại từ DB để khôi phục trạng thái cũ (tuột Optimistic UI)
      loadData();
    } finally {
      setControlLoading(prev => ({ ...prev, [key]: false }));
    }
  };

  if (loading) {
    return (
      <div style={{ padding: '40px', textAlign: 'center', color: '#fff' }}>
        <h2>Đang tải dữ liệu...</h2>
      </div>
    );
  }

  if (!deviceData) {
    return (
      <div style={{ padding: '20px', color: '#fff', minHeight: '100vh', background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)' }}>
        <div style={{ maxWidth: '1400px', margin: '0 auto' }}>
          <div style={{ marginBottom: '30px', textAlign: 'center' }}>
            <h1 style={{ fontSize: '2.5rem', fontWeight: 'bold', marginBottom: '10px', background: 'linear-gradient(135deg, #22d3ee 0%, #3b82f6 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
              🏢 Trung tâm Chuyển đổi Số
            </h1>
            <p style={{ color: '#94a3b8', fontSize: '1.1rem', marginBottom: '20px' }}>Giám sát và điều khiển hệ thống điện TTCDS</p>
            <div style={{ display: 'inline-block', position: 'relative' }}>
              <span style={{ color: '#22d3ee', marginRight: '10px', fontSize: '1.1rem' }}>Thiết bị:</span>
              <select
                value={selectedDeviceId}
                onChange={(e) => {
                  const nextId = e.target.value;
                  setDeviceData(null);
                  setSelectedDeviceId(nextId);

                  // Nếu trùng envDeviceId thì tự nhảy qua thiết bị khác
                  if (nextId && nextId === envDeviceId && availableDevices.length > 1) {
                    const otherId = availableDevices.find(id => id !== nextId);
                    if (otherId) {
                      setEnvDeviceData(null);
                      setEnvDeviceId(otherId);
                    }
                  }
                }}
                style={{ background: 'rgba(15, 23, 42, 0.8)', color: '#fff', border: '1px solid #3b82f6', borderRadius: '8px', padding: '10px 16px', fontSize: '1rem', cursor: 'pointer', outline: 'none', minWidth: '250px' }}
              >
                {availableDevices.map(id => <option key={id} value={id}>{id}</option>)}
              </select>
            </div>
          </div>
          <div style={{ padding: '40px', textAlign: 'center', color: '#fff' }}>
            <h2>Đang tải hoặc không tìm thấy thiết bị TTCDS</h2>
          </div>
        </div>
      </div>
    );
  }

  const data = deviceData.data || {};
  const envData = envDeviceData?.data || {};
  
  // Extract relay states dynamically based on backend configurations
  const relays = dashboardRelays.map(line => ({
    num: line.relay_number,
    state: data[`relay_${line.relay_number}_state`]?.value || 'OFF',
    name: line.ten_duong || `Relay ${line.relay_number}`,
  }));

  // Extract power data
  const voltage = data.voltage?.value || 0;
  const current = data.current?.value || 0;
  const power = data.power?.value || 0;
  const energy = data.energy?.value || 0;
  const frequency = data.frequency?.value || 0;
  const powerFactor = data.power_factor?.value || 0;
  
  // Extract môi trường: chỉ lấy đúng 2 key theo yêu cầu: indoorTemp, humidity
  const temperature = Number(acStatus?.indoorTemp ?? envData.indoorTemp?.value ?? 0) || 0;
  const humidity = Number(acStatus?.humidity ?? envData.humidity?.value ?? 0) || 0;
  const targetTemp = Number(acStatus?.temp ?? envData.temp?.value ?? 0) || 0;
  const acOn = parseAcOnState(acStatus?.on ?? envData.on?.value ?? false);

  return (
    <div style={{ padding: '20px', color: '#fff', minHeight: '100vh', background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)' }}>
      <div style={{ maxWidth: '1400px', margin: '0 auto' }}>
        {/* Header */}
        <div style={{ marginBottom: '30px', textAlign: 'center' }}>
          <h1 style={{ fontSize: '2.5rem', fontWeight: 'bold', marginBottom: '10px', background: 'linear-gradient(135deg, #22d3ee 0%, #3b82f6 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            🏢 Trung tâm Chuyển đổi Số
          </h1>
          <p style={{ color: '#94a3b8', fontSize: '1.1rem', marginBottom: '20px' }}>Giám sát và điều khiển hệ thống điện TTCDS</p>
          <div style={{ display: 'inline-block', position: 'relative' }}>
            <span style={{ color: '#22d3ee', marginRight: '10px', fontSize: '1.1rem' }}>Thiết bị:</span>
            <select value={selectedDeviceId} onChange={(e) => { setDeviceData(null); setSelectedDeviceId(e.target.value); }} style={{ background: 'rgba(15, 23, 42, 0.8)', color: '#fff', border: '1px solid #3b82f6', borderRadius: '8px', padding: '10px 16px', fontSize: '1rem', cursor: 'pointer', outline: 'none', minWidth: '250px' }}>
              {availableDevices.map(id => <option key={id} value={id}>{id}</option>)}
            </select>
          </div>
        </div>

        {/* Relay Control Section */}
        <div style={{ background: 'rgba(30, 41, 59, 0.6)', borderRadius: '16px', padding: '24px', marginBottom: '24px', border: '1px solid rgba(148, 163, 184, 0.1)' }}>
          <h3 style={{ fontSize: '1.3rem', marginBottom: '20px', color: '#22d3ee' }}>⚡ Điều khiển</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '16px' }}>
            {relays.map(relay => {
              const isOn = relay.state === 'ON';
              const isLoading = controlLoading[`${selectedDeviceId}_relay_${relay.num}`];
              return (
                <div key={relay.num} style={{ background: 'rgba(15, 23, 42, 0.8)', borderRadius: '12px', padding: '20px', border: `2px solid ${isOn ? '#22c55e' : '#475569'}`, transition: 'all 0.3s' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '1.5rem' }}>💡</span>
                      <span style={{ fontSize: '1.1rem', fontWeight: '600', color: isOn ? '#22c55e' : '#94a3b8' }}>{relay.name}</span>
                    </div>
                    <span style={{ fontSize: '0.75rem', padding: '4px 8px', borderRadius: '6px', background: isOn ? 'rgba(34, 197, 94, 0.2)' : 'rgba(71, 85, 105, 0.3)', color: isOn ? '#22c55e' : '#94a3b8', fontWeight: '600' }}>
                      {isOn ? 'ĐANG BẬT' : 'ĐANG TẮT'}
                    </span>
                  </div>
                  <button
                    onClick={() => handleRelayControl(selectedDeviceId, relay.num, isOn ? 'OFF' : 'ON')}
                    disabled={isLoading}
                    style={{
                      width: '100%',
                      padding: '12px',
                      borderRadius: '8px',
                      border: 'none',
                      background: isOn ? 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)' : 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)',
                      color: '#fff',
                      fontSize: '0.95rem',
                      fontWeight: '600',
                      cursor: isLoading ? 'not-allowed' : 'pointer',
                      opacity: isLoading ? 0.6 : 1,
                      transition: 'all 0.2s',
                      boxShadow: '0 4px 12px rgba(0,0,0,0.3)'
                    }}
                  >
                    {isLoading ? '⏳ Đang xử lý...' : isOn ? '🔴 TẮT' : '🟢 BẬT'}
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        {/* Power Monitoring Section */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px', marginBottom: '24px' }}>
          {/* Voltage */}
          <div style={{ background: 'rgba(30, 41, 59, 0.6)', borderRadius: '12px', padding: '20px', border: '1px solid rgba(148, 163, 184, 0.1)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
              <span style={{ fontSize: '2rem' }}>⚡</span>
              <span style={{ color: '#94a3b8', fontSize: '0.9rem' }}>Điện áp</span>
            </div>
            <div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#22d3ee' }}>{voltage.toFixed(1)} <span style={{ fontSize: '1rem', color: '#94a3b8' }}>V</span></div>
          </div>

          {/* Current */}
          <div style={{ background: 'rgba(30, 41, 59, 0.6)', borderRadius: '12px', padding: '20px', border: '1px solid rgba(148, 163, 184, 0.1)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
              <span style={{ fontSize: '2rem' }}>🔌</span>
              <span style={{ color: '#94a3b8', fontSize: '0.9rem' }}>Dòng điện</span>
            </div>
            {/* raw `current` từ backend đang là Ampere (A) */}
            <div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#f59e0b' }}>{current.toFixed(2)} <span style={{ fontSize: '1rem', color: '#94a3b8' }}>A</span></div>
          </div>

          {/* Power */}
          <div style={{ background: 'rgba(30, 41, 59, 0.6)', borderRadius: '12px', padding: '20px', border: '1px solid rgba(148, 163, 184, 0.1)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
              <span style={{ fontSize: '2rem' }}>⚙️</span>
              <span style={{ color: '#94a3b8', fontSize: '0.9rem' }}>Công suất</span>
            </div>
            <div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#8b5cf6' }}>{(power / 1000).toFixed(2)} <span style={{ fontSize: '1rem', color: '#94a3b8' }}>kW</span></div>
          </div>

          {/* Energy */}
          <div style={{ background: 'rgba(30, 41, 59, 0.6)', borderRadius: '12px', padding: '20px', border: '1px solid rgba(148, 163, 184, 0.1)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
              <span style={{ fontSize: '2rem' }}>📊</span>
              <span style={{ color: '#94a3b8', fontSize: '0.9rem' }}>Năng lượng</span>
            </div>
            {/* raw `energy` từ backend đang là kWh */}
            <div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#22c55e' }}>{energy.toFixed(2)} <span style={{ fontSize: '1rem', color: '#94a3b8' }}>kWh</span></div>
          </div>

          {/* Frequency */}
          <div style={{ background: 'rgba(30, 41, 59, 0.6)', borderRadius: '12px', padding: '20px', border: '1px solid rgba(148, 163, 184, 0.1)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
              <span style={{ fontSize: '2rem' }}>📡</span>
              <span style={{ color: '#94a3b8', fontSize: '0.9rem' }}>Tần số</span>
            </div>
            <div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#06b6d4' }}>{frequency.toFixed(1)} <span style={{ fontSize: '1rem', color: '#94a3b8' }}>Hz</span></div>
          </div>

          {/* Power Factor */}
          <div style={{ background: 'rgba(30, 41, 59, 0.6)', borderRadius: '12px', padding: '20px', border: '1px solid rgba(148, 163, 184, 0.1)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
              <span style={{ fontSize: '2rem' }}>📈</span>
              <span style={{ color: '#94a3b8', fontSize: '0.9rem' }}>Hệ số công suất</span>
            </div>
            <div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#ec4899' }}>{powerFactor.toFixed(2)}</div>
          </div>
        </div>

        {/* Bottom Monitoring Section (Temperature/Humidity) */}
        <div style={{ marginBottom: '24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px', marginBottom: '12px' }}>
            <h3 style={{ fontSize: '1.3rem', margin: 0, color: '#22d3ee' }}>🌡️ Theo dõi môi trường</h3>
            <div style={{ display: 'inline-block', position: 'relative' }}>
              <span style={{ color: '#22d3ee', marginRight: '10px', fontSize: '1rem' }}>Thiết bị:</span>
              <select
                value={envDeviceId}
                onChange={(e) => {
                  const nextEnvId = e.target.value;
                  setEnvDeviceData(null);
                  setEnvDeviceId(nextEnvId);

                  // Nếu trùng selectedDeviceId thì tự nhảy qua thiết bị khác
                  if (nextEnvId && nextEnvId === selectedDeviceId && availableDevices.length > 1) {
                    const otherId = availableDevices.find(id => id !== nextEnvId);
                    if (otherId) {
                      setDeviceData(null);
                      setSelectedDeviceId(otherId);
                    }
                  }
                }}
                style={{
                  background: 'rgba(15, 23, 42, 0.8)',
                  color: '#fff',
                  border: '1px solid #3b82f6',
                  borderRadius: '8px',
                  padding: '10px 16px',
                  fontSize: '1rem',
                  cursor: 'pointer',
                  outline: 'none',
                  minWidth: '250px'
                }}
              >
                {availableDevices.map(id => <option key={id} value={id}>{id}</option>)}
              </select>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px' }}>
            <div style={{ background: 'rgba(30, 41, 59, 0.6)', borderRadius: '12px', padding: '20px', border: '1px solid rgba(148, 163, 184, 0.1)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
                <span style={{ fontSize: '2rem' }}>🌡️</span>
                <span style={{ color: '#94a3b8', fontSize: '0.9rem' }}>Nhiệt độ</span>
              </div>
              <div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#f97316' }}>
                {temperature.toFixed(1)} <span style={{ fontSize: '1rem', color: '#94a3b8' }}>°C</span>
              </div>
            </div>

            <div style={{ background: 'rgba(30, 41, 59, 0.6)', borderRadius: '12px', padding: '20px', border: '1px solid rgba(148, 163, 184, 0.1)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
                <span style={{ fontSize: '2rem' }}>💧</span>
                <span style={{ color: '#94a3b8', fontSize: '0.9rem' }}>Độ ẩm</span>
              </div>
              <div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#38bdf8' }}>
                {humidity.toFixed(1)} <span style={{ fontSize: '1rem', color: '#94a3b8' }}>%</span>
              </div>
            </div>
          </div>

          {/* AC Control */}
          <div style={{ background: 'rgba(30, 41, 59, 0.35)', borderRadius: '12px', padding: '16px', border: '1px solid rgba(148, 163, 184, 0.1)', marginTop: '18px' }}>
            <h3 style={{ fontSize: '1.1rem', marginBottom: '12px', color: '#22d3ee' }}>❄️ Điều khiển máy lạnh</h3>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px', color: '#cbd5e1' }}>
              <span>Nhiệt độ cài đặt: <b style={{ color: '#fff' }}>{targetTemp.toFixed(0)}°C</b></span>
              <span>Trạng thái: <b style={{ color: acOn ? '#22c55e' : '#ef4444' }}>{acOn ? 'ĐANG BẬT' : 'ĐANG TẮT'}</b></span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(180px, 1fr))', gap: '12px' }}>
              <button
                onClick={() => handleAcControl('on')}
                disabled={acControlLoading}
                style={{ width: '100%', padding: '12px', borderRadius: '8px', border: 'none', background: '#22c55e', color: '#fff', fontSize: '0.95rem', fontWeight: '700', cursor: acControlLoading ? 'not-allowed' : 'pointer', opacity: acControlLoading ? 0.6 : 1 }}
              >
                BẬT MÁY
              </button>
              <button
                onClick={() => handleAcControl('off')}
                disabled={acControlLoading}
                style={{ width: '100%', padding: '12px', borderRadius: '8px', border: 'none', background: '#ef4444', color: '#fff', fontSize: '0.95rem', fontWeight: '700', cursor: acControlLoading ? 'not-allowed' : 'pointer', opacity: acControlLoading ? 0.6 : 1 }}
              >
                TẮT MÁY
              </button>
              <button
                onClick={() => handleAcControl('up')}
                disabled={acControlLoading}
                style={{ width: '100%', padding: '12px', borderRadius: '8px', border: 'none', background: '#334155', color: '#fff', fontSize: '0.95rem', fontWeight: '700', cursor: acControlLoading ? 'not-allowed' : 'pointer', opacity: acControlLoading ? 0.6 : 1 }}
              >
                TĂNG +
              </button>
              <button
                onClick={() => handleAcControl('down')}
                disabled={acControlLoading}
                style={{ width: '100%', padding: '12px', borderRadius: '8px', border: 'none', background: '#334155', color: '#fff', fontSize: '0.95rem', fontWeight: '700', cursor: acControlLoading ? 'not-allowed' : 'pointer', opacity: acControlLoading ? 0.6 : 1 }}
              >
                GIẢM -
              </button>
            </div>
          </div>
        </div>

        {/* Status */}
        <div style={{ background: 'rgba(30, 41, 59, 0.6)', borderRadius: '12px', padding: '16px', border: '1px solid rgba(148, 163, 184, 0.1)', textAlign: 'center' }}>
          <span style={{ color: '#94a3b8', fontSize: '0.85rem' }}>
            Trạng thái: <span style={{ color: '#22c55e', fontWeight: '600' }}>● {deviceData.trang_thai?.toUpperCase()}</span>
            {' • '}
            Cập nhật: {new Date(deviceData.last_seen * 1000).toLocaleString('vi-VN')}
          </span>
        </div>
      </div>
    </div>
  );
};

export default TTCDSDashboard;
