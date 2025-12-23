import React, { useState, useEffect, useRef } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import axios from 'axios';
import SmartClassroomDashboard from './SmartClassroomDashboard';
import '../styles/DeviceDetail.css';

const API_BASE = process.env.REACT_APP_API_BASE || 'http://localhost:8000';
const WS_URL =
  process.env.REACT_APP_WS_URL ||
  `${API_BASE.replace(/^http/i, 'ws')}${API_BASE.endsWith('/') ? '' : ''}/ws/events`;

const DeviceDetail = ({ deviceId, token, onBack }) => {
  const [device, setDevice] = useState(null);
  const [events, setEvents] = useState([]);
  const [chartData, setChartData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [chartKey, setChartKey] = useState('temperature'); // Default chart key

  const [page, setPage] = useState(1);
  const [pageSize] = useState(50);
  const latestPollRef = useRef(null);

  // Helper functions for values
  const getStateValue = (d) => {
    const val = d?.data?.state;
    if (val && typeof val === 'object') return val.value || '';
    return val || '';
  };

  const getBrightnessValue = (d) => {
    const val = d?.data?.brightness;
    if (val && typeof val === 'object') return Number(val.value ?? 0);
    return Number(val ?? 0);
  };

  const getSetpointValue = (d) => {
    const val = d?.data?.setpoint;
    if (val && typeof val === 'object') return Number(val.value ?? 25);
    return Number(val ?? 25);
  };

  const getSensorValue = (d, key) => {
    const val = d?.data?.[key];
    if (val && typeof val === 'object') return Number(val.value ?? 0);
    return Number(val ?? 0);
  };

  // Control Handlers
  const handleTogglePower = async () => {
    if (!device) return;
    const currentState = (getStateValue(device) || '').toString().toUpperCase();
    const nextAction = currentState === 'ON' ? 'off' : 'on';

    // Optimistic update
    const nowTs = Math.floor(Date.now() / 1000);
    setDevice(prev => ({
      ...prev,
      data: {
        ...prev.data,
        state: { ...(prev.data?.state || {}), value: nextAction.toUpperCase(), timestamp: nowTs }
      }
    }));

    try {
      await axios.post(
        `${API_BASE}/devices/${device.ma_thiet_bi}/control`,
        { action: nextAction },
        { headers: { Authorization: `Bearer ${token}` } }
      );
    } catch (err) {
      console.error('Toggle power failed', err);
    }
  };

  const handleBrightnessChange = async (e) => {
    const val = Number(e.target.value);
    // Optimistic update
    const nowTs = Math.floor(Date.now() / 1000);
    setDevice(prev => ({
      ...prev,
      data: {
        ...prev.data,
        brightness: { ...(prev.data?.brightness || {}), value: val, timestamp: nowTs }
      }
    }));

    try {
      await axios.post(
        `${API_BASE}/devices/${device.ma_thiet_bi}/control`,
        { action: 'brightness', value: val },
        { headers: { Authorization: `Bearer ${token}` } }
      );
    } catch (err) {
      console.error('Set brightness failed', err);
    }
  };

  const handleTempChange = async (e) => {
    const val = Number(e.target.value);
    const nowTs = Math.floor(Date.now() / 1000);
    setDevice(prev => ({
      ...prev,
      data: {
        ...prev.data,
        setpoint: { ...(prev.data?.setpoint || {}), value: val, timestamp: nowTs }
      }
    }));

    try {
      await axios.post(
        `${API_BASE}/devices/${device.ma_thiet_bi}/control`,
        { action: 'set_ac_temp', value: val },
        { headers: { Authorization: `Bearer ${token}` } }
      );
    } catch (err) {
      console.error('Set temp failed', err);
    }
  };

  // Load Data effects
  useEffect(() => {
    const loadDeviceData = async () => {
      try {
        const deviceRes = await axios.get(`${API_BASE}/devices/${deviceId}/latest`, {
          headers: { Authorization: `Bearer ${token}` },
          timeout: 5000,
        });
        setDevice(deviceRes.data);
        setLoading(false);
        loadEvents(1);
      } catch (err) {
        console.error('Error loading device data:', err);
        setLoading(false);
      }
    };
    loadDeviceData();
  }, [deviceId, token]);

  // Polling
  useEffect(() => {
    if (!deviceId || !token) return;
    const poll = async () => {
      try {
        const res = await axios.get(`${API_BASE}/devices/${deviceId}/latest`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        setDevice(res.data);
      } catch (err) { /* ignore */ }
    };
    latestPollRef.current = setInterval(poll, 5000);
    return () => {
      if (latestPollRef.current) clearInterval(latestPollRef.current);
    };
  }, [deviceId, token]);

  const loadEvents = async (targetPage = 1) => {
    try {
      const res = await axios.get(
        `${API_BASE}/events/${deviceId}?page=${targetPage}&page_size=${pageSize}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      // Sort newest first for history log display
      const sortedEvents = (res.data.events || []).sort((a, b) => b.timestamp - a.timestamp);
      setEvents(sortedEvents);
      setPage(res.data.page || targetPage);
      prepareChartData(res.data.events || []); // Chart uses original order
    } catch (err) {
      console.error('Error loading events:', err);
    }
  };

  const prepareChartData = (eventsList) => {
    // Chart needs ascending order (oldest to newest for timeline)
    const data = [...eventsList]
      .sort((a, b) => a.timestamp - b.timestamp)
      .slice(-50) // Last 50 points
      .map(e => ({
        ...e,
        timeStr: new Date(e.timestamp * 1000).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
      }));
    setChartData(data);
  };

  // WebSocket for realtime updates
  useEffect(() => {
    if (!token || !deviceId) return;
    const ws = new WebSocket(WS_URL);
    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.device_id === deviceId) {
          // Update device state
          setDevice((prev) => {
            if (!prev) return prev;
            const newData = { ...prev.data };
            Object.keys(data).forEach(k => {
              if (k !== 'device_id' && k !== 'timestamp') {
                newData[k] = { value: data[k], timestamp: data.timestamp };
              }
            });
            return { ...prev, data: newData, last_seen: data.timestamp };
          });

          // Update events list (add new event to beginning)
          setEvents(prev => {
            const newEvent = { ...data };
            const updated = [newEvent, ...prev].slice(0, 50); // Keep max 50
            return updated;
          });

          // Update chart data (add to end for timeline)
          setChartData(prev => {
            const newPoint = {
              ...data,
              timeStr: new Date(data.timestamp * 1000).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
            };
            const updated = [...prev, newPoint].slice(-50); // Keep last 50
            return updated;
          });
        }
      } catch (e) {
        console.error('WS parse error', e);
      }
    };
    return () => ws.close();
  }, [token, deviceId]);

  if (loading) {
    return <div className="device-detail-loading"><div className="spinner neon"></div></div>;
  }

  if (!device) {
    return <div className="device-detail-error">Không tìm thấy thiết bị <button onClick={onBack}>Quay lại</button></div>;
  }

  const isOnline = device.trang_thai === 'online';
  const type = device.loai_thiet_bi;
  const state = getStateValue(device);

  // Special Dashboard for Smart Classroom Energy
  if (type === 'smart_classroom_energy') {
    return (
      <>
        <button className="back-btn-ghost" onClick={onBack} style={{ position: 'absolute', top: '20px', left: '20px', zIndex: 1000 }}>← Quay lại</button>
        <SmartClassroomDashboard device={device} logs={events} />
      </>
    );
  }

  return (
    <div className="device-detail-page">
      <div className="detail-header-bar">
        <button className="back-btn-ghost" onClick={onBack}>← Quay lại</button>
        <div className="detail-meta">
          <span className={`status-badge ${isOnline ? 'online' : 'offline'}`}>
            {isOnline ? 'ONLINE' : 'OFFLINE'}
          </span>
          <span className="last-seen">
            Cập nhật: {device.last_seen ? new Date(device.last_seen * 1000).toLocaleString('vi-VN') : 'N/A'}
          </span>
        </div>
      </div>

      <div className="detail-hero">
        <div className="hero-icon">
          {type === 'sensor' ? '🌡️' : type === 'air_conditioner' ? '❄️' : '💡'}
        </div>
        <div className="hero-info">
          <h1>{device.ten_thiet_bi || device.ma_thiet_bi}</h1>
          <p className="device-id-mono">{device.ma_thiet_bi}</p>
          <p className="room-badge">{device.ten_phong || 'Chưa gán phòng'}</p>
        </div>
      </div>

      <div className="detail-grid">
        {/* Control Panel for Actuators */}
        {type !== 'sensor' && (
          <div className="detail-card control-card">
            <h2>Điều khiển</h2>
            <div className="control-row">
              <div className="control-group">
                <label>Nguồn</label>
                <button
                  className={`power-btn-large ${state === 'ON' ? 'active' : ''}`}
                  onClick={handleTogglePower}
                >
                  {state === 'ON' ? 'ĐANG BẬT' : 'ĐANG TẮT'}
                </button>
              </div>

              {type === 'light' && (
                <div className="control-group expanded">
                  <label>Độ sáng: {getBrightnessValue(device)}%</label>
                  <input
                    type="range"
                    min="0" max="100"
                    value={getBrightnessValue(device)}
                    onChange={handleBrightnessChange}
                    className="slider-range brightness"
                  />
                </div>
              )}

              {type === 'air_conditioner' && (
                <div className="control-group expanded">
                  <label>Nhiệt độ đặt: {getSetpointValue(device)}°C</label>
                  <input
                    type="range"
                    min="16" max="30" step="1"
                    value={getSetpointValue(device)}
                    onChange={handleTempChange}
                    className="slider-range temp"
                  />
                  <div className="temp-marks">
                    <span>16°C</span>
                    <span>30°C</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Sensor Metrics */}
        {(type === 'sensor' || type === 'air_conditioner') && (
          <div className="detail-card metrics-card">
            <h2>Thông số môi trường</h2>
            <div className="metrics-row">
              {/* Temp */}
              <div className="metric-box">
                <div className="metric-icon temp">🌡️</div>
                <div className="metric-val">
                  {getSensorValue(device, 'temperature').toFixed(1)} <span className="unit">°C</span>
                </div>
                <div className="metric-label">Nhiệt độ</div>
              </div>
              {/* Humidity */}
              <div className="metric-box">
                <div className="metric-icon humidity">💧</div>
                <div className="metric-val">
                  {getSensorValue(device, 'humidity').toFixed(1)} <span className="unit">%</span>
                </div>
                <div className="metric-label">Độ ẩm</div>
              </div>
            </div>
          </div>
        )}

        {/* Charts */}
        <div className="detail-card chart-card-lg">
          <div className="chart-header">
            <h2>Biểu đồ lịch sử</h2>
            <div className="chart-toggles">
              {['temperature', 'humidity', 'brightness']
                .filter(k => type === 'sensor' ? ['temperature', 'humidity'].includes(k) :
                  type === 'light' ? ['brightness'].includes(k) :
                    type === 'air_conditioner' ? ['temperature', 'humidity'].includes(k) : false)
                .map(key => (
                  <button
                    key={key}
                    className={chartKey === key ? 'active' : ''}
                    onClick={() => setChartKey(key)}
                  >
                    {key === 'temperature' ? 'Nhiệt độ' : key === 'humidity' ? 'Độ ẩm' : 'Độ sáng'}
                  </button>
                ))}
            </div>
          </div>
          <div className="chart-wrapper">
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="colorVal" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.8} />
                    <stop offset="95%" stopColor="#06b6d4" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1f2a44" />
                <XAxis dataKey="timeStr" stroke="#94a3b8" />
                <YAxis stroke="#94a3b8" />
                <Tooltip
                  contentStyle={{ backgroundColor: '#0b1224', borderColor: '#1f2a44', color: '#fff' }}
                />
                <Area
                  type="monotone"
                  dataKey={chartKey}
                  stroke="#06b6d4"
                  fillOpacity={1}
                  fill="url(#colorVal)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* History Table */}
        <div className="detail-card history-card">
          <h2>Nhật ký hoạt động</h2>
          <div className="table-responsive">
            <table className="dark-table">
              <thead>
                <tr>
                  <th>Thời gian</th>
                  <th>Sự kiện</th>
                  <th>Chi tiết</th>
                </tr>
              </thead>
              <tbody>
                {events.map((ev, i) => (
                  <tr key={i}>
                    <td>{new Date(ev.timestamp * 1000).toLocaleString('vi-VN')}</td>
                    <td><span className="event-tag">Data Update</span></td>
                    <td className="json-cell">
                      {Object.entries(ev).filter(([k]) => !['device_id', 'timestamp', '_id'].includes(k)).map(([k, v]) => (
                        <span key={k} className="kv-pair">{k}: <b>{v}</b></span>
                      ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DeviceDetail;
