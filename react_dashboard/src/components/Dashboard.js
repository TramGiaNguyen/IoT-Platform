import React, { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import { PieChart, Pie, Cell, LineChart, Line, AreaChart, Area, BarChart, Bar, ComposedChart, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { fetchDevicesLatestAll } from '../services';
import '../styles/Dashboard.css';

const API_BASE = process.env.REACT_APP_API_BASE || 'http://localhost:8000';
const WS_URL =
  process.env.REACT_APP_WS_URL ||
  `${API_BASE.replace(/^http/i, 'ws')}${API_BASE.endsWith('/') ? '' : ''}/ws/events`;

// Một vài icon dạng SVG nhỏ để mô phỏng phong cách trong sample
const Icon = {
  sensor: (
    <svg viewBox="0 0 24 24" className="icon">
      <rect x="6" y="3" width="12" height="18" rx="2" ry="2" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="12" cy="8" r="1.2" fill="currentColor" />
      <circle cx="12" cy="12" r="1.2" fill="currentColor" />
      <circle cx="12" cy="16" r="1.2" fill="currentColor" />
    </svg>
  ),
  ac: (
    <svg viewBox="0 0 24 24" className="icon">
      <rect x="3" y="6" width="18" height="6" rx="2" ry="2" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <path d="M6 14l3 4m6-4l-3 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  ),
  light: (
    <svg viewBox="0 0 24 24" className="icon">
      <path d="M12 3a6 6 0 00-3 11.2V17a1 1 0 001 1h4a1 1 0 001-1v-2.8A6 6 0 0012 3z" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <path d="M9 21h6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  ),
  default: (
    <svg viewBox="0 0 24 24" className="icon">
      <circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  ),
};

// Helper keys definition (similar to DeviceSetupWizard)
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
      { khoa: 'Dong_dien_TB', don_vi: 'A', mo_ta: 'Dòng điện trung bình' },
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
  if (type === 'smart_garden') {
    return [
      { khoa: 'temperature', don_vi: '°C', mo_ta: 'Nhiệt độ' },
      { khoa: 'humidity', don_vi: '%', mo_ta: 'Độ ẩm không khí' },
      { khoa: 'soil_moisture', don_vi: '%', mo_ta: 'Độ ẩm đất' },
      { khoa: 'light_level', don_vi: 'Lux', mo_ta: 'Cường độ ánh sáng' },
      { khoa: 'pump_status', don_vi: '', mo_ta: 'Trạng thái máy bơm' },
      { khoa: 'lamp_status', don_vi: '', mo_ta: 'Trạng thái đèn' },
      { khoa: 'fan_status', don_vi: '', mo_ta: 'Trạng thái quạt' },
      { khoa: 'plant_count', don_vi: '', mo_ta: 'Số cây phát hiện (AI)' },
      { khoa: 'prediction', don_vi: '', mo_ta: 'Kết quả nhận diện (AI)' },
      { khoa: 'confidence', don_vi: '%', mo_ta: 'Độ tin cậy AI' }
    ];
  }
  return [];
};

const Dashboard = ({ token, devices: initialDevices = [], onOpenRules, onOpenRooms }) => {
  const [devices, setDevices] = useState(initialDevices);
  const [deviceData, setDeviceData] = useState({});
  const [loading, setLoading] = useState(true);
  const [wsConnected, setWsConnected] = useState(false);

  // State cho discovery modal
  const [showDiscoveryModal, setShowDiscoveryModal] = useState(false);
  const [modalTab, setModalTab] = useState('provision'); // 'provision' or 'discover'
  const [discoveredDevices, setDiscoveredDevices] = useState([]);
  const [scanning, setScanning] = useState(false);
  const [registering, setRegistering] = useState(false);
  const [discoverError, setDiscoverError] = useState('');
  const [rooms, setRooms] = useState([]);
  const [selectedDevices, setSelectedDevices] = useState({});

  // State cho provisioning wizard
  const [provisionStep, setProvisionStep] = useState(1); // 1: Form, 2: Result
  const [provisionForm, setProvisionForm] = useState({
    ten_thiet_bi: '',
    phong_id: '',
    protocol: 'mqtt',
    device_type: 'sensor',
    loai_thiet_bi: '',
    data_keys: []
  });
  const [provisionResult, setProvisionResult] = useState(null);
  const [provisioning, setProvisioning] = useState(false);
  const [provisionError, setProvisionError] = useState('');
  // State cho detect-keys
  const [detecting, setDetecting] = useState(false);
  const [detectProgress, setDetectProgress] = useState(0);
  const [detectedKeys, setDetectedKeys] = useState([]);

  // Statistics state
  const [hourlyStats, setHourlyStats] = useState([]);
  const [dailyStats, setDailyStats] = useState([]);

  const loadLatestAll = async () => {
    try {
      const res = await fetchDevicesLatestAll(token);
      const payload = res.data.devices || [];
      // Cập nhật list devices theo payload (để đồng bộ với latest-all)
      const mappedDevices = payload.map((d) => ({
        ma_thiet_bi: d.device_id,
        ten_thiet_bi: d.ten_thiet_bi,
        loai_thiet_bi: d.loai_thiet_bi,
        trang_thai: d.trang_thai,
        last_seen: d.last_seen,
        phong_id: d.phong_id,
      }));
      setDevices(mappedDevices);

      // Merge deviceData - keep newer last_seen from WebSocket
      setDeviceData((prev) => {
        const newDeviceData = {};
        payload.forEach((item) => {
          const existing = prev[item.device_id] || {};
          const existingLastSeen = Number(existing.last_seen || 0);
          const newLastSeen = Number(item.last_seen || 0);

          // Use the more recent last_seen between API and existing (from WebSocket)
          newDeviceData[item.device_id] = {
            ...item,
            last_seen: Math.max(existingLastSeen, newLastSeen),
            // Also preserve existing data that might be newer
            data: { ...item.data, ...existing.data },
          };
        });
        return newDeviceData;
      });
    } catch (err) {
      console.error('Error loading latest all:', err);
    } finally {
      setLoading(false);
    }
  };

  // Load statistics data
  const loadStats = async () => {
    try {
      const [hourlyRes, dailyRes] = await Promise.all([
        axios.get(`${API_BASE}/stats/hourly?hours=24`, {
          headers: { Authorization: `Bearer ${token}` }
        }),
        axios.get(`${API_BASE}/stats/daily?days=7`, {
          headers: { Authorization: `Bearer ${token}` }
        })
      ]);
      setHourlyStats(hourlyRes.data.stats || []);
      setDailyStats(dailyRes.data.stats || []);
    } catch (err) {
      console.error('Error loading stats:', err);
    }
  };

  // Đồng bộ prop devices từ App xuống state cục bộ
  useEffect(() => {
    setDevices(initialDevices);
    if (initialDevices.length === 0) {
      setLoading(false);
    }
  }, [initialDevices]);

  // Load stats on mount and every 1 minute for responsive updates
  useEffect(() => {
    if (!token) return;
    loadStats();
    const interval = setInterval(loadStats, 60000); // 1 minute
    return () => clearInterval(interval);
  }, [token]);

  useEffect(() => {
    if (!token || devices.length === 0) return;

    let ws;
    let reconnectTimer;

    const connectWs = () => {
      ws = new WebSocket(WS_URL);

      ws.onopen = () => {
        setWsConnected(true);
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.device_id) {
            // Chỉ update data cho các thiết bị đã đăng ký
            const registeredDeviceIds = devices.map(d => d.ma_thiet_bi);
            if (!registeredDeviceIds.includes(data.device_id)) {
              // Thiết bị chưa đăng ký, bỏ qua
              return;
            }

            setDeviceData((prev) => {
              const currentDeviceData = prev[data.device_id] || {};
              const currentData = currentDeviceData.data || {};
              const newData = { ...currentData };
              Object.keys(data).forEach((key) => {
                if (key !== 'device_id' && key !== 'timestamp' && key !== 'type') {
                  newData[key] = {
                    ...currentData[key],
                    value: data[key],
                    timestamp: data.timestamp,
                  };
                }
              });

              return {
                ...prev,
                [data.device_id]: {
                  ...currentDeviceData,
                  device_id: data.device_id,
                  last_seen: data.timestamp,
                  data: newData,
                },
              };
            });
          }
        } catch (err) {
          console.error('Error parsing WebSocket message:', err);
        }
      };

      ws.onerror = () => {
        setWsConnected(false);
      };

      ws.onclose = () => {
        setWsConnected(false);
        reconnectTimer = setTimeout(connectWs, 3000);
      };
    };

    connectWs();

    return () => {
      if (reconnectTimer) clearTimeout(reconnectTimer);
      try {
        ws && ws.close();
      } catch (e) {
        /* ignore */
      }
    };
  }, [token, devices.length]);

  useEffect(() => {
    if (!token) return;
    loadLatestAll();
    const interval = setInterval(loadLatestAll, 5000);
    return () => clearInterval(interval);
  }, [token]);

  const formatValue = (value, unit = '') => {
    if (value === null || value === undefined) return 'N/A';
    if (typeof value === 'number') {
      return `${value.toFixed(1)}${unit}`;
    }
    return `${value}${unit}`;
  };

  const getStateValue = (deviceKeys) => {
    const stateObj = deviceKeys['state'];
    if (stateObj && typeof stateObj === 'object') return stateObj.value || stateObj;
    return stateObj || '';
  };

  const getBrightnessValue = (deviceKeys) => {
    const b = deviceKeys['brightness'];
    if (b && typeof b === 'object') return Number(b.value ?? 0);
    return Number(b ?? 0);
  };

  const handleTogglePower = async (device) => {
    const data = deviceData[device.ma_thiet_bi] || {};
    const deviceKeys = data.data || {};
    const currentState = (getStateValue(deviceKeys) || '').toString().toUpperCase();
    const nextAction = currentState === 'ON' ? 'off' : 'on';
    try {
      await axios.post(
        `${API_BASE}/devices/${device.ma_thiet_bi}/control`,
        { action: nextAction },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const nowTs = Math.floor(Date.now() / 1000);
      setDeviceData((prev) => {
        const current = prev[device.ma_thiet_bi] || {};
        const currentData = current.data || {};
        return {
          ...prev,
          [device.ma_thiet_bi]: {
            ...current,
            data: {
              ...currentData,
              state: { ...(currentData.state || {}), value: nextAction.toUpperCase(), timestamp: nowTs },
            },
            last_seen: Math.max(current.last_seen || 0, nowTs),
          },
        };
      });
    } catch (err) {
      console.error('Toggle power failed', err);
    }
  };

  const handleBrightnessChange = async (device, value) => {
    const numeric = Number(value);
    const nowTs = Math.floor(Date.now() / 1000);
    setDeviceData((prev) => {
      const current = prev[device.ma_thiet_bi] || {};
      const currentData = current.data || {};
      return {
        ...prev,
        [device.ma_thiet_bi]: {
          ...current,
          data: {
            ...currentData,
            brightness: { ...(currentData.brightness || {}), value: numeric, timestamp: nowTs },
          },
          last_seen: Math.max(current.last_seen || 0, nowTs),
        },
      };
    });
    try {
      await axios.post(
        `${API_BASE}/devices/${device.ma_thiet_bi}/control`,
        { action: 'brightness', value: numeric },
        { headers: { Authorization: `Bearer ${token}` } }
      );
    } catch (err) {
      console.error('Set brightness failed', err);
    }
  };

  const handleDeleteDevice = async (device) => {
    if (!window.confirm(`Bạn có chắc muốn xóa thiết bị "${device.ten_thiet_bi || device.ma_thiet_bi}" khỏi hệ thống?`)) {
      return;
    }
    try {
      await axios.delete(
        `${API_BASE}/devices/${device.ma_thiet_bi}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      // Xóa khỏi state
      setDevices(prev => prev.filter(d => d.ma_thiet_bi !== device.ma_thiet_bi));
      setDeviceData(prev => {
        const updated = { ...prev };
        delete updated[device.ma_thiet_bi];
        return updated;
      });
    } catch (err) {
      console.error('Delete device failed', err);
      alert('Xóa thiết bị thất bại: ' + (err.response?.data?.detail || err.message));
    }
  };

  const formatTime = (timestamp) => {
    if (!timestamp) return 'Chưa có dữ liệu';
    const date = new Date(timestamp * 1000);
    return date.toLocaleString('vi-VN');
  };

  const getStatus = (device) => {
    const data = deviceData[device.ma_thiet_bi] || {};
    const rawLastSeen =
      Number(data.last_seen ?? device.last_seen ?? data.timestamp ?? 0);
    if (!rawLastSeen) return { status: 'offline', color: '#ef4444' };

    // Nếu đã là ms thì giữ nguyên, nếu là giây thì nhân 1000
    const lastSeen = rawLastSeen > 1e12 ? rawLastSeen : rawLastSeen * 1000;
    const now = Date.now();
    const diffMinutes = (now - lastSeen) / 1000 / 60;

    // Thresholds: online < 2min, warning 2-10min, offline > 10min
    if (diffMinutes < 2) {
      return { status: 'online', color: '#22c55e' };
    } else if (diffMinutes < 10) {
      return { status: 'warning', color: '#f59e0b' };
    } else {
      return { status: 'offline', color: '#ef4444' };
    }
  };

  const getDeviceIcon = (loaiThietBi) => {
    if (loaiThietBi === 'sensor') return Icon.sensor;
    if (loaiThietBi === 'air_conditioner') return Icon.ac;
    if (loaiThietBi === 'light') return Icon.light;
    return Icon.default;
  };

  // Computed stats for charts
  const chartStats = useMemo(() => {
    const onlineCount = devices.filter(d => getStatus(d).status === 'online').length;
    const offlineCount = devices.filter(d => getStatus(d).status === 'offline').length;
    const warningCount = devices.filter(d => getStatus(d).status === 'warning').length;

    // Get sensor data for temperature/humidity
    let currentTemp = null;
    let currentHumidity = null;
    let tempHistory = [];

    Object.values(deviceData).forEach(device => {
      const data = device.data || {};
      if (data.temperature) {
        const val = typeof data.temperature === 'object' ? data.temperature.value : data.temperature;
        if (val !== null && val !== undefined) currentTemp = parseFloat(val);
      }
      if (data.humidity) {
        const val = typeof data.humidity === 'object' ? data.humidity.value : data.humidity;
        if (val !== null && val !== undefined) currentHumidity = parseFloat(val);
      }
    });

    // Device status pie data
    const pieData = [
      { name: 'Online', value: onlineCount, color: '#22c55e' },
      { name: 'Warning', value: warningCount, color: '#f59e0b' },
      { name: 'Offline', value: offlineCount, color: '#ef4444' },
    ].filter(d => d.value > 0);

    return {
      onlineCount,
      offlineCount,
      warningCount,
      totalDevices: devices.length,
      currentTemp,
      currentHumidity,
      pieData,
    };
  }, [devices, deviceData]);

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="spinner neon"></div>
        <p>Đang tải dữ liệu...</p>
      </div>
    );
  }

  return (
    <div className="page-bg">
      <div className="grid-overlay" />
      <div className="pcb-lines">
        <svg viewBox="0 0 200 200">
          <path fill="none" stroke="#06b6d4" strokeWidth="1" d="M200,200 L150,200 L140,190 L140,150 L100,150 L80,130 M200,180 L160,180 L160,160 L120,160" />
          <rect x="10" y="100" width="20" height="20" fill="none" stroke="#06b6d4" strokeWidth="1" />
          <rect x="15" y="105" width="10" height="10" fill="#06b6d4" />
        </svg>
      </div>

      <div className="dashboard-shell">
        <header className="header-bar">
          <div className="brand">
            <div className="brand-logo">
              <img src="/bdu-logo.png" alt="BDU logo" />
            </div>
            <div>
              <p className="eyebrow">BDU IoT</p>
              <h1>BDU IoT Dashboard</h1>
            </div>
          </div>
          <div className="header-right">
            <div className={`pill ${wsConnected ? 'pill-online' : 'pill-offline'}`}>
              <span className="dot" />
              <span>{wsConnected ? 'Real-time' : 'Disconnected'}</span>
            </div>
          </div>
        </header>

        {devices.length === 0 ? (
          <div className="empty-state">
            <p>Chưa có thiết bị nào được đăng ký.</p>
          </div>
        ) : (
          <>
            {/* Dashboard Charts Section */}
            <div className="dashboard-charts">
              {/* Stats Cards */}
              <div className="chart-card stat-card">
                <div className="stat-icon online">🟢</div>
                <div className="stat-info">
                  <span className="stat-value">{chartStats.onlineCount}</span>
                  <span className="stat-label">Online</span>
                </div>
              </div>
              <div className="chart-card stat-card">
                <div className="stat-icon offline">🔴</div>
                <div className="stat-info">
                  <span className="stat-value">{chartStats.offlineCount + chartStats.warningCount}</span>
                  <span className="stat-label">Offline/Warning</span>
                </div>
              </div>

              {/* Temperature Gauge Card */}
              <div className="chart-card gauge-card">
                <h4>Nhiệt độ</h4>
                <div className="gauge-value temp">
                  {chartStats.currentTemp !== null ? chartStats.currentTemp.toFixed(1) : '--'}
                  <span className="unit">°C</span>
                </div>
                <div className="gauge-bar">
                  <div
                    className="gauge-fill temp"
                    style={{ width: `${Math.min(100, Math.max(0, ((chartStats.currentTemp || 0) - 15) / 25 * 100))}%` }}
                  />
                </div>
              </div>

              {/* Humidity Gauge Card */}
              <div className="chart-card gauge-card">
                <h4>Độ ẩm</h4>
                <div className="gauge-value humidity">
                  {chartStats.currentHumidity !== null ? chartStats.currentHumidity.toFixed(1) : '--'}
                  <span className="unit">%</span>
                </div>
                <div className="gauge-bar">
                  <div
                    className="gauge-fill humidity"
                    style={{ width: `${chartStats.currentHumidity || 0}%` }}
                  />
                </div>
              </div>

              {/* Device Status Donut */}
              <div className="chart-card donut-card">
                <h4>Trạng thái thiết bị</h4>
                <ResponsiveContainer width="100%" height={120}>
                  <PieChart>
                    <Pie
                      data={chartStats.pieData}
                      cx="50%"
                      cy="50%"
                      innerRadius={30}
                      outerRadius={50}
                      paddingAngle={2}
                      dataKey="value"
                    >
                      {chartStats.pieData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
                <div className="donut-legend">
                  {chartStats.pieData.map((entry, index) => (
                    <span key={index} style={{ color: entry.color }}>
                      ● {entry.name}: {entry.value}
                    </span>
                  ))}
                </div>
              </div>

              {/* Total Devices Card */}
              <div className="chart-card stat-card total">
                <div className="stat-icon total">📱</div>
                <div className="stat-info">
                  <span className="stat-value">{chartStats.totalDevices}</span>
                  <span className="stat-label">Tổng thiết bị</span>
                </div>
              </div>

              {/* Hourly Stats - Area Chart (24h) */}
              <div className="chart-card wide-chart">
                <h4>📊 Thống kê 24 giờ qua</h4>
                {hourlyStats.length > 0 ? (
                  <ResponsiveContainer width="100%" height={180}>
                    <AreaChart data={hourlyStats}>
                      <defs>
                        <linearGradient id="colorTemp" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.8} />
                          <stop offset="95%" stopColor="#f59e0b" stopOpacity={0.1} />
                        </linearGradient>
                        <linearGradient id="colorHum" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.8} />
                          <stop offset="95%" stopColor="#06b6d4" stopOpacity={0.1} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1f2a44" />
                      <XAxis dataKey="label" stroke="#64748b" tick={{ fontSize: 10 }} />
                      <YAxis yAxisId="temp" orientation="left" stroke="#f59e0b" domain={[20, 40]} tick={{ fontSize: 10 }} />
                      <YAxis yAxisId="hum" orientation="right" stroke="#06b6d4" domain={[40, 80]} tick={{ fontSize: 10 }} />
                      <Tooltip
                        contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #1f2a44' }}
                        labelStyle={{ color: '#94a3b8' }}
                      />
                      <Legend />
                      <Area yAxisId="temp" type="monotone" dataKey="nhiet_do_tb" name="Nhiệt độ (°C)" stroke="#f59e0b" fill="url(#colorTemp)" />
                      <Area yAxisId="hum" type="monotone" dataKey="do_am_tb" name="Độ ẩm (%)" stroke="#06b6d4" fill="url(#colorHum)" />
                    </AreaChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="no-data">Chưa có dữ liệu thống kê giờ</div>
                )}
              </div>

              {/* Daily Stats - Combo Chart (7 days) */}
              <div className="chart-card wide-chart">
                <h4>📈 Thống kê 7 ngày qua</h4>
                {dailyStats.length > 0 ? (
                  <ResponsiveContainer width="100%" height={180}>
                    <ComposedChart data={dailyStats}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1f2a44" />
                      <XAxis dataKey="label" stroke="#64748b" tick={{ fontSize: 11 }} />
                      <YAxis yAxisId="temp" orientation="left" stroke="#f59e0b" domain={[20, 40]} tick={{ fontSize: 10 }} />
                      <YAxis yAxisId="hum" orientation="right" stroke="#06b6d4" domain={[40, 80]} tick={{ fontSize: 10 }} />
                      <Tooltip
                        contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #1f2a44' }}
                        labelStyle={{ color: '#94a3b8' }}
                      />
                      <Legend />
                      <Bar yAxisId="hum" dataKey="do_am_tb" name="Độ ẩm (%)" fill="#06b6d4" radius={[4, 4, 0, 0]} />
                      <Line yAxisId="temp" type="monotone" dataKey="nhiet_do_tb" name="Nhiệt độ (°C)" stroke="#f59e0b" strokeWidth={2} dot={{ r: 4 }} />
                    </ComposedChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="no-data">Chưa có dữ liệu thống kê ngày</div>
                )}
              </div>
            </div>

            <div className="devices-grid neo-grid">
              {devices.map((device) => {
                const data = deviceData[device.ma_thiet_bi] || {};
                const status = getStatus(device);
                const deviceKeys = data.data || {};

                return (
                  <div key={device.id || device.ma_thiet_bi} className="neo-card">
                    <div className="card-header">
                      <div className="icon-wrap">{getDeviceIcon(device.loai_thiet_bi)}</div>
                      <div className="card-meta">
                        <h3>{device.ten_thiet_bi || device.ma_thiet_bi}</h3>
                        <p>{device.ma_thiet_bi}</p>
                      </div>
                      <div className={`status-chip ${status.status}`}>
                        <span className="status-dot" />
                        {status.status}
                      </div>
                      <button
                        className="delete-device-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteDevice(device);
                        }}
                        title="Xóa thiết bị"
                      >
                        ×
                      </button>
                    </div>

                    <div className="card-body">
                      {Object.keys(deviceKeys).length === 0 ? (
                        <p className="no-data">Chưa có dữ liệu</p>
                      ) : (
                        Object.entries(deviceKeys)
                          .filter(([key]) => {
                            if (key === 'brightness' && device.loai_thiet_bi !== 'light') return false;
                            if (key === 'setpoint' && device.loai_thiet_bi === 'light') return false;
                            return true;
                          })
                          .map(([key, valueObj]) => {
                            const value = typeof valueObj === 'object' ? valueObj.value : valueObj;
                            const unit = typeof valueObj === 'object' ? valueObj.don_vi || '' : '';
                            const label = key; // Luôn hiển thị tên key (temperature, humidity...) thay vì mo_ta
                            return (
                              <div key={key} className="metric-row">
                                <span className="label">{label}</span>
                                <span className="value">{formatValue(value, unit)}</span>
                              </div>
                            );
                          })
                      )}
                    </div>

                    {(device.loai_thiet_bi === 'air_conditioner' || device.loai_thiet_bi === 'light') && (
                      <div className="controls">
                        <button
                          className="btn"
                          onClick={() => handleTogglePower(device)}
                        >
                          {(getStateValue(deviceKeys) || '').toString().toUpperCase() === 'ON' ? 'Tắt' : 'Bật'}
                        </button>
                        {device.loai_thiet_bi === 'light' && (
                          <div className="slider">
                            <label>Độ sáng</label>
                            <input
                              type="range"
                              min="0"
                              max="100"
                              value={getBrightnessValue(deviceKeys)}
                              onChange={(e) => handleBrightnessChange(device, e.target.value)}
                            />
                            <span>{getBrightnessValue(deviceKeys)}</span>
                          </div>
                        )}
                      </div>
                    )}

                    <div className="card-footer">
                      <span>{data.last_seen ? `Cập nhật: ${formatTime(data.last_seen)}` : 'Chưa có dữ liệu'}</span>
                      {device.phong_id && (
                        <span className="room">📍 {device.ten_phong || `Phòng ${device.phong_id}`}</span>
                      )}
                    </div>

                    <button
                      className="ghost-btn"
                      onClick={() => {
                        window.location.hash = `#/devices/${device.ma_thiet_bi}`;
                      }}
                    >
                      Xem chi tiết
                    </button>
                  </div>
                );
              })}
            </div>
          </>
        )}

        {/* FAB Button - Add device */}
        <button
          className="fab-btn"
          onClick={() => {
            setShowDiscoveryModal(true);
            setDiscoveredDevices([]);
            setDiscoverError('');
            // Load rooms
            axios.get(`${API_BASE}/rooms`, { headers: { Authorization: `Bearer ${token}` } })
              .then(res => setRooms(res.data.rooms || []))
              .catch(err => console.error('Error loading rooms:', err));
          }}
          title="Thêm thiết bị mới"
        >
          <svg viewBox="0 0 24 24" width="28" height="28">
            <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
          </svg>
        </button>

        {/* Device Modal - Provision/Discover */}
        {showDiscoveryModal && (
          <div className="modal-overlay" onClick={() => { setShowDiscoveryModal(false); setProvisionStep(1); setProvisionResult(null); }}>
            <div className="modal-content modal-lg" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <div className="modal-tabs">
                  <button
                    className={`modal-tab ${modalTab === 'provision' ? 'active' : ''}`}
                    onClick={() => setModalTab('provision')}
                  >
                    ➕ Tạo thiết bị
                  </button>
                  <button
                    className={`modal-tab ${modalTab === 'discover' ? 'active' : ''}`}
                    onClick={() => setModalTab('discover')}
                  >
                    🔍 Quét thiết bị
                  </button>
                </div>
                <button className="modal-close" onClick={() => { setShowDiscoveryModal(false); setProvisionStep(1); setProvisionResult(null); }}>✕</button>
              </div>
              <div className="modal-body">

                {/* TAB: Provision Device */}
                {modalTab === 'provision' && (
                  <div className="provision-wizard">
                    {provisionStep === 1 && (
                      <>
                        <div className="form-group" style={{ marginBottom: '15px', background: '#334155', padding: '10px', borderRadius: '6px' }}>
                          <label style={{ color: '#60a5fa' }}>⚡ Mẫu thiết bị (Chọn nhanh)</label>
                          <select
                            onChange={(e) => {
                              const val = e.target.value;
                              if (val === 'smart_classroom') {
                                setProvisionForm(prev => ({
                                  ...prev,
                                  device_type: 'sensor',
                                  loai_thiet_bi: 'smart_classroom_energy',
                                  protocol: 'mqtt',
                                  data_keys: getDefaultKeysForDeviceType('smart_classroom_energy')
                                }));
                              } else if (val === 'smart_garden') {
                                setProvisionForm(prev => ({
                                  ...prev,
                                  device_type: 'sensor',
                                  loai_thiet_bi: 'smart_garden',
                                  protocol: 'mqtt',
                                  data_keys: getDefaultKeysForDeviceType('smart_garden')
                                }));
                              } else if (val === 'custom') {
                                setProvisionForm(prev => ({
                                  ...prev,
                                  device_type: 'sensor',
                                  loai_thiet_bi: '',
                                  protocol: 'mqtt',
                                  data_keys: []
                                }));
                              }
                            }}
                            defaultValue="custom"
                          >
                            <option value="custom">Tùy chỉnh (Tự nhập)</option>
                            <option value="smart_classroom">🏫 Lớp học thông minh (Smart Classroom)</option>
                            <option value="smart_garden">🌿 Vườn thông minh (Smart Garden)</option>
                          </select>
                        </div>

                        <div className="form-group">
                          <label>Tên thiết bị *</label>
                          <input
                            type="text"
                            value={provisionForm.ten_thiet_bi}
                            onChange={(e) => setProvisionForm({ ...provisionForm, ten_thiet_bi: e.target.value })}
                            placeholder="VD: Công tơ điện A101"
                          />
                        </div>

                        <div className="form-group">
                          <label>Phòng *</label>
                          <select
                            value={provisionForm.phong_id}
                            onChange={(e) => setProvisionForm({ ...provisionForm, phong_id: e.target.value })}
                          >
                            <option value="">-- Chọn phòng --</option>
                            {rooms.map(r => <option key={r.id} value={r.id}>{r.ten_phong || r.ma_phong}</option>)}
                          </select>
                        </div>

                        <div className="form-row">
                          <div className="form-group">
                            <label>Giao thức</label>
                            <select
                              value={provisionForm.protocol}
                              onChange={(e) => setProvisionForm({ ...provisionForm, protocol: e.target.value })}
                            >
                              <option value="mqtt">MQTT</option>
                              <option value="http">HTTP</option>
                              <option value="both">Cả hai</option>
                            </select>
                          </div>

                          <div className="form-group">
                            <label>Loại thiết bị</label>
                            <select
                              value={provisionForm.device_type}
                              onChange={(e) => setProvisionForm({ ...provisionForm, device_type: e.target.value })}
                            >
                              <option value="sensor">Cảm biến (Sensor)</option>
                              <option value="controller">Bộ điều khiển (Controller)</option>
                              <option value="gateway">Gateway</option>
                            </select>
                          </div>
                        </div>

                        <div className="form-group">
                          <label>Chi tiết loại (tùy chọn)</label>
                          <input
                            type="text"
                            value={provisionForm.loai_thiet_bi}
                            onChange={(e) => setProvisionForm({ ...provisionForm, loai_thiet_bi: e.target.value })}
                            placeholder="VD: power_meter, temperature_sensor..."
                          />
                        </div>

                        {provisionError && <div className="modal-error">{provisionError}</div>}

                        <button
                          className="register-btn-modal"
                          onClick={async () => {
                            if (!provisionForm.ten_thiet_bi || !provisionForm.phong_id) {
                              setProvisionError('Vui lòng điền tên thiết bị và chọn phòng');
                              return;
                            }
                            setProvisioning(true);
                            setProvisionError('');
                            try {
                              const res = await axios.post(`${API_BASE}/devices/provision`, {
                                ...provisionForm,
                                phong_id: parseInt(provisionForm.phong_id)
                              }, {
                                headers: { Authorization: `Bearer ${token}` }
                              });
                              setProvisionResult(res.data);
                              setProvisionStep(2);
                            } catch (err) {
                              setProvisionError('Lỗi: ' + (err.response?.data?.detail || err.message));
                            } finally {
                              setProvisioning(false);
                            }
                          }}
                          disabled={provisioning}
                        >
                          {provisioning ? '⏳ Đang tạo...' : '🔧 Tạo thiết bị'}
                        </button>
                      </>
                    )}

                    {provisionStep === 2 && provisionResult && (
                      <div className="provision-result">
                        <div className="result-success">✅ Thiết bị đã được tạo thành công!</div>

                        <div className="result-section">
                          <h4>📋 Thông tin thiết bị</h4>
                          <div className="result-item">
                            <span className="label">Device ID:</span>
                            <code className="value">{provisionResult.credentials?.device_id}</code>
                            <button className="copy-btn" onClick={() => navigator.clipboard.writeText(provisionResult.credentials?.device_id)}>📋</button>
                          </div>
                          <div className="result-item">
                            <span className="label">Tên:</span>
                            <span className="value">{provisionResult.device?.ten_thiet_bi}</span>
                          </div>
                        </div>

                        <div className="result-section credentials-section">
                          <h4>🔐 Credentials (Lưu lại!)</h4>
                          <div className="result-item">
                            <span className="label">Secret Key:</span>
                            <code className="value secret">{provisionResult.credentials?.secret_key}</code>
                            <button className="copy-btn" onClick={() => navigator.clipboard.writeText(provisionResult.credentials?.secret_key)}>📋</button>
                          </div>
                          {provisionResult.credentials?.http_api_key && (
                            <div className="result-item">
                              <span className="label">HTTP API Key:</span>
                              <code className="value secret">{provisionResult.credentials?.http_api_key}</code>
                              <button className="copy-btn" onClick={() => navigator.clipboard.writeText(provisionResult.credentials?.http_api_key)}>📋</button>
                            </div>
                          )}
                        </div>

                        {provisionResult.mqtt_config && (
                          <div className="result-section">
                            <h4>📡 MQTT Config</h4>
                            <div className="result-item">
                              <span className="label">Broker:</span>
                              <code className="value">{provisionResult.mqtt_config.broker}:{provisionResult.mqtt_config.port}</code>
                            </div>
                            <div className="result-item">
                              <span className="label">Topic Data:</span>
                              <code className="value">{provisionResult.mqtt_config.topic_data}</code>
                              <button className="copy-btn" onClick={() => navigator.clipboard.writeText(provisionResult.mqtt_config.topic_data)}>📋</button>
                            </div>
                          </div>
                        )}

                        {/* Detect Keys Section */}
                        <div className="result-section detect-section">
                          <h4>📊 Định nghĩa dữ liệu</h4>
                          <p style={{ fontSize: '0.85rem', color: '#888', marginBottom: '12px' }}>
                            Gửi dữ liệu từ thiết bị → Nhấn "Lắng nghe" để tự động detect
                          </p>
                          {detectedKeys.length > 0 && (
                            <div className="detected-keys-list">
                              {detectedKeys.map(k => (
                                <div key={k.khoa} className="detected-key-item">
                                  <span className="key-name">{k.khoa}</span>
                                  <span className="key-unit">{k.don_vi}</span>
                                </div>
                              ))}
                            </div>
                          )}
                          <button
                            className="btn-detect"
                            disabled={detecting}
                            onClick={async () => {
                              setDetecting(true);
                              setDetectProgress(0);
                              // Progress animation
                              const interval = setInterval(() => {
                                setDetectProgress(p => Math.min(p + 10, 95));
                              }, 1000);
                              try {
                                const res = await axios.post(
                                  `${API_BASE}/devices/${provisionResult.credentials?.device_id}/detect-keys?listen_seconds=10`,
                                  {},
                                  { headers: { Authorization: `Bearer ${token}` } }
                                );
                                setDetectedKeys(res.data.new_keys_added || []);
                                if (res.data.new_keys_added?.length > 0) {
                                  alert(`Đã phát hiện ${res.data.new_keys_added.length} keys mới: ${res.data.new_keys_added.map(k => k.khoa).join(', ')}`);
                                } else if (res.data.message_count === 0) {
                                  alert('Không nhận được data từ thiết bị. Hãy publish data từ MQTTBox trước.');
                                } else {
                                  alert('Không có keys mới (có thể đã được định nghĩa trước đó).');
                                }
                              } catch (err) {
                                alert('Lỗi detect: ' + (err.response?.data?.detail || err.message));
                              } finally {
                                clearInterval(interval);
                                setDetectProgress(100);
                                setTimeout(() => setDetecting(false), 500);
                              }
                            }}
                          >
                            {detecting ? `⏳ Đang lắng nghe... ${detectProgress}%` : '📡 Lắng nghe & Detect (10s)'}
                          </button>
                        </div>

                        <div className="result-actions">
                          <button
                            className="btn-secondary"
                            onClick={() => {
                              const configJson = JSON.stringify(provisionResult, null, 2);
                              const blob = new Blob([configJson], { type: 'application/json' });
                              const url = URL.createObjectURL(blob);
                              const a = document.createElement('a');
                              a.href = url;
                              a.download = `device-${provisionResult.credentials?.device_id}.json`;
                              a.click();
                            }}
                          >
                            📥 Download Config
                          </button>
                          <button
                            className="register-btn-modal"
                            onClick={() => {
                              setShowDiscoveryModal(false);
                              setProvisionStep(1);
                              setProvisionResult(null);
                              setProvisionForm({ ten_thiet_bi: '', phong_id: '', protocol: 'mqtt', device_type: 'sensor', loai_thiet_bi: '', data_keys: [] });
                              setDetectedKeys([]);
                              loadLatestAll();
                            }}
                          >
                            ✅ Hoàn tất
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* TAB: Discover Device */}
                {modalTab === 'discover' && (
                  <>
                    <button
                      className="scan-btn-modal"
                      onClick={async () => {
                        setScanning(true);
                        setDiscoverError('');
                        try {
                          const res = await axios.get(`${API_BASE}/devices/discover`, {
                            headers: { Authorization: `Bearer ${token}` }
                          });
                          const devs = res.data.discovered_devices || [];
                          setDiscoveredDevices(devs);
                          // Initialize selected devices using detected info
                          const newSelected = {};
                          devs.forEach(dev => {
                            const deviceId = dev.device_id;
                            const type = dev.suggested_type || 'sensor';
                            const detectedFields = dev.detected_fields || [];

                            // Build keys from detected fields
                            const keys = detectedFields.map(field => {
                              let unit = '';
                              if (field === 'temperature') unit = '°C';
                              else if (field === 'humidity') unit = '%';
                              else if (field === 'brightness') unit = '%';
                              else if (field === 'setpoint') unit = '°C';
                              else if (field === 'power') unit = 'W';
                              else if (field === 'voltage') unit = 'V';
                              else if (field === 'current') unit = 'A';
                              return { khoa: field, don_vi: unit };
                            });

                            newSelected[deviceId] = {
                              device_id: deviceId,
                              ten_thiet_bi: deviceId,
                              loai_thiet_bi: type,
                              phong_id: null,
                              keys: keys.length > 0 ? keys : [{ khoa: 'value', don_vi: '' }]
                            };
                          });
                          setSelectedDevices(newSelected);
                          if (devs.length === 0) {
                            setDiscoverError('Không tìm thấy thiết bị mới nào.');
                          }
                        } catch (err) {
                          setDiscoverError('Lỗi khi quét: ' + (err.response?.data?.detail || err.message));
                        } finally {
                          setScanning(false);
                        }
                      }}
                      disabled={scanning}
                    >
                      {scanning ? '⏳ Đang quét...' : '🔍 Quét thiết bị (10s)'}
                    </button>

                    {discoverError && <div className="modal-error">{discoverError}</div>}

                    {discoveredDevices.length > 0 && (
                      <div className="discovered-list">
                        <h3>Tìm thấy {discoveredDevices.length} thiết bị:</h3>
                        {discoveredDevices.map(dev => {
                          const deviceId = dev.device_id;
                          const selectedDev = selectedDevices[deviceId] || {};
                          const detectedFields = dev.detected_fields || [];
                          const sampleData = dev.sample_data || {};
                          const suggestedType = dev.suggested_type || 'unknown';
                          const typeIcons = {
                            sensor: '📟',
                            air_conditioner: '❄️',
                            light: '💡',
                            power_meter: '⚡',
                            motion_sensor: '👁️',
                            door_sensor: '🚪',
                            unknown: '❓'
                          };

                          return (
                            <div key={deviceId} className="discovered-item">
                              <div className="discovered-header">
                                <span className="discovered-icon">
                                  {typeIcons[suggestedType] || '❓'}
                                </span>
                                <div className="discovered-title">
                                  <span className="discovered-name">{deviceId}</span>
                                  <span className="discovered-type">Loại: {suggestedType}</span>
                                </div>
                              </div>

                              {/* Hiển thị các fields phát hiện được */}
                              {detectedFields.length > 0 && (
                                <div className="detected-fields">
                                  <strong>Dữ liệu phát hiện:</strong>
                                  <div className="fields-grid">
                                    {detectedFields.map(field => (
                                      <span key={field} className="field-tag">
                                        {field}: {sampleData[field] !== undefined ?
                                          (typeof sampleData[field] === 'number' ? sampleData[field].toFixed(2) : sampleData[field])
                                          : 'N/A'}
                                      </span>
                                    ))}
                                  </div>
                                </div>
                              )}

                              <div className="discovered-fields">
                                <select
                                  value={selectedDev.phong_id || ''}
                                  onChange={(e) => setSelectedDevices(prev => ({
                                    ...prev,
                                    [deviceId]: { ...prev[deviceId], phong_id: e.target.value ? parseInt(e.target.value) : null }
                                  }))}
                                >
                                  <option value="">-- Chọn phòng --</option>
                                  {rooms.map(r => <option key={r.id} value={r.id}>{r.ten_phong || r.ma_phong}</option>)}
                                </select>
                              </div>
                            </div>
                          );
                        })}
                        <button
                          className="register-btn-modal"
                          onClick={async () => {
                            setRegistering(true);
                            setDiscoverError('');
                            try {
                              const promises = Object.values(selectedDevices).map(dev =>
                                axios.post(`${API_BASE}/devices/register`, dev, {
                                  headers: { Authorization: `Bearer ${token}` }
                                })
                              );
                              await Promise.all(promises);
                              setShowDiscoveryModal(false);
                              // Reload devices
                              loadLatestAll();
                            } catch (err) {
                              setDiscoverError('Lỗi đăng ký: ' + (err.response?.data?.detail || err.message));
                            } finally {
                              setRegistering(false);
                            }
                          }}
                          disabled={registering}
                        >
                          {registering ? '⏳ Đang đăng ký...' : '✅ Đăng ký tất cả'}
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Dashboard;
