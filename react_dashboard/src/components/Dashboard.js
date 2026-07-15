import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import axios from 'axios';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, AreaChart, Area, LineChart, Line } from 'recharts';
import { fetchDevicesLatestAll, fetchRooms } from '../services';
import { API_BASE, WS_URL } from '../config/api';
import { useGlobalCache } from '../context/GlobalCache';
import { useRealtime } from '../context/RealtimeProvider';
import LogStream from './LogStream';
import AddDeviceModal from './AddDeviceModal';
import '../styles/Dashboard.css';

// Material Symbols helper component
const Icon = ({ name, className = '' }) => (
  <span className={`material-symbols-outlined ${className}`}>{name}</span>
);

const Dashboard = ({ token, devices: initialDevices = [], onOpenRules, onOpenRooms, onOpenDevice, onOpenAlerts, onWsStatusChange, headerSearch = '', workspaceId, workspaceContext, userInfo, userRole = '', isAdmin = false, isTeacher = false, teacherRooms = [] }) => {
  const { cache, updateCache } = useGlobalCache();
  const { connected: wsConnected, lastEventAt, getDeviceLatest } = useRealtime();
  // Admin/teacher không phân biệt workspace cá nhân / nhóm — chỉ student mới có
  // 2 tab. isStudent = role chính xác là student.
  const isStudent = userRole === 'student';
  // Only seed local state from cache when the cached workspace matches the
  // current workspace — otherwise the cache belongs to the previous tab and
  // would briefly render stale devices after a workspace switch.
  const cacheMatchesWorkspace = !cache?.workspaceContext || cache.workspaceContext === workspaceContext;
  const initialFromCache = (cache.devices?.length > 0 && cacheMatchesWorkspace) ? cache.devices : [];

  const [devices, setDevices] = useState(initialFromCache);
  const [deviceData, setDeviceData] = useState({});
  const [loading, setLoading] = useState(true);
  // wsConnected duoc cung cap boi useRealtime() (line 17) va sync len App qua onWsStatusChange effect.

  const getScopeFilteredDevices = useCallback((allDevices, scope, uid, isAdmin = false, isTeacher = false, teacherRooms = [], cacheWorkspaceContext = null) => {
    if (!allDevices?.length) return [];
    if (!scope) return [];
    // If userInfo is not yet hydrated, we cannot safely apply the per-user
    // scope filter. Returning allDevices here would briefly leak devices from
    // another workspace on reload. Wait until uid is known.
    if (!uid) return [];
    // Stale-cache guard: if the cache was populated for a different workspace
    // than the one currently selected, ignore it until a fresh fetch resolves.
    if (cacheWorkspaceContext && cacheWorkspaceContext !== scope) return [];
    if (isAdmin) {
      // Admin có toàn quyền, không phân biệt workspace — thấy mọi thiết bị
      return allDevices;
    }
    if (isTeacher) {
      // Teacher quản lý lớp mình dạy, không phân biệt workspace — chỉ thấy
      // devices ở các phòng thuộc lớp mình phụ trách (cá nhân lẫn nhóm)
      const teacherRoomSet = new Set(teacherRooms);
      return allDevices.filter(d =>
        teacherRoomSet.has(d.phong_id) || d.nguoi_so_huu_id === uid
      );
    }
    if (scope === 'ca_nhan') {
      // ca_nhan = personal devices only. A device that belongs to a group
      // (nhom_id set) is a group device regardless of who created it; it must
      // never appear on the personal tab even if the current user is the
      // creator.
      const isPersonalDevice = (d) =>
        d.nguoi_so_huu_id === uid && d.nhom_id == null;
      return allDevices.filter(isPersonalDevice);
    }
    if (scope === 'nhom') {
      return allDevices.filter(d => d.nhom_id != null);
    }
    return allDevices;
  }, []);

  const scopedDevices = getScopeFilteredDevices(cache.devices, workspaceContext, userInfo?.id, isAdmin, isTeacher, teacherRooms, cache?.workspaceContext);
  const [showDeviceModal, setShowDeviceModal] = useState(false);

  const [hourlyStats, setHourlyStats] = useState([]);
  const [dailyStats, setDailyStats] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const devicesPerPage = 12;

  const devicesIdsRef = useRef([]);

  // Convert workspaceContext string to workspaceId integer for API calls.
  // Student tab Nhóm: truyền primary_nhom_id. Các role khác (admin/teacher) luôn null.
  const effectiveWorkspaceId =
    isStudent && workspaceContext === 'nhom' && userInfo?.primary_nhom_id
      ? userInfo.primary_nhom_id
      : null;

  const loadLatestAll = async (silent = false) => {
    try {
      const res = await fetchDevicesLatestAll(token, effectiveWorkspaceId);
      const payload = res.data.devices || [];
      const mappedDevices = payload.map((d) => ({
        ma_thiet_bi: d.device_id, ten_thiet_bi: d.ten_thiet_bi,
        loai_thiet_bi: d.loai_thiet_bi, trang_thai: d.trang_thai,
        last_seen: d.last_seen, phong_id: d.phong_id,
        ten_phong: d.ten_phong, ma_phong: d.ma_phong,
        nhom_id: d.nhom_id,
      }));
      devicesIdsRef.current = mappedDevices.map(d => String(d.ma_thiet_bi));
      setDevices(mappedDevices);
      updateCache({ devices: mappedDevices });
      setDeviceData((prev) => {
        const newDeviceData = {};
        payload.forEach((item) => {
          const existing = prev[item.device_id] || {};
          const existingLastSeen = Number(existing.last_seen || 0);
          const newLastSeen = Number(item.last_seen || 0);
          newDeviceData[item.device_id] = {
            ...item,
            last_seen: Math.max(existingLastSeen, newLastSeen),
            data: { ...(existing.data || {}), ...(item.data || {}) },
          };
        });
        return newDeviceData;
      });
    } catch (err) {
      console.error('Error loading latest all:', err);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  const [roomsCount, setRoomsCount] = useState(0);

  const loadRoomsCount = useCallback(async () => {
    try {
      const res = await fetchRooms(token, effectiveWorkspaceId);
      setRoomsCount((res.data.rooms || []).length);
    } catch (err) {
      console.error('Error loading rooms count:', err);
    }
  }, [token, effectiveWorkspaceId]);

  useEffect(() => {
    if (!token) {
      setDevices([]); setDeviceData({}); setLoading(false); return;
    }
    if (cache.devices && cache.devices.length > 0 && cacheMatchesWorkspace) {
      const mappedDevices = cache.devices.map((d) => ({
        ma_thiet_bi: d.ma_thiet_bi || d.device_id,
        ten_thiet_bi: d.ten_thiet_bi || d.ten_thiet_bi,
        loai_thiet_bi: d.loai_thiet_bi, trang_thai: d.trang_thai,
        last_seen: d.last_seen, phong_id: d.phong_id,
        ten_phong: d.ten_phong, ma_phong: d.ma_phong,
        nhom_id: d.nhom_id,
      }));
      devicesIdsRef.current = mappedDevices.map(d => String(d.ma_thiet_bi));
      setDevices(mappedDevices);
      const newDeviceData = {};
      (cache.devices || []).forEach((item) => {
        const id = item.ma_thiet_bi || item.device_id;
        newDeviceData[id] = { ...item, nhom_id: item.nhom_id };
      });
      setDeviceData(newDeviceData);
      setLoading(false);
      loadLatestAll(true);
      return;
    }
    loadLatestAll(false);
  }, [token, workspaceContext, userInfo?.primary_nhom_id, cacheMatchesWorkspace]);

  const loadStats = async () => {
    try {
      const [hourlyRes, dailyRes] = await Promise.all([
        axios.get(`${API_BASE}/stats/hourly`, {
          headers: { Authorization: `Bearer ${token}` },
          params: { hours: 24, ...(effectiveWorkspaceId ? { workspace_id: effectiveWorkspaceId } : {}) }
        }),
        axios.get(`${API_BASE}/stats/daily`, {
          headers: { Authorization: `Bearer ${token}` },
          params: { days: 7, ...(effectiveWorkspaceId ? { workspace_id: effectiveWorkspaceId } : {}) }
        })
      ]);
      setHourlyStats(hourlyRes.data.stats || []);
      setDailyStats(dailyRes.data.stats || []);
    } catch (err) {
      console.error('Error loading stats:', err);
    }
  };

  const formatValue = (value, unit = '') => {
    if (value === null || value === undefined) return 'N/A';
    if (typeof value === 'number') return `${value.toFixed(1)}${unit}`;
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
    if (!window.confirm(`Xóa thiết bị "${device.ten_thiet_bi || device.ma_thiet_bi}"?`)) return;

      setDevices((prev) => prev.filter((d) => d.ma_thiet_bi !== device.ma_thiet_bi));
      setDeviceData((prev) => {
        const next = { ...prev };
        delete next[device.ma_thiet_bi];
        return next;
      });

    try {
      await axios.delete(`${API_BASE}/devices/${device.ma_thiet_bi}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch (err) {
      console.error('Delete device failed', err);
      setDevices((prev) => [...prev, device]);
      alert('Xóa thiết bị thất bại. Vui lòng thử lại.');
    }
  };

  useEffect(() => {
    if (typeof onWsStatusChange === 'function') onWsStatusChange(wsConnected);
  }, [wsConnected, onWsStatusChange]);

  useEffect(() => {
    if (headerSearch !== undefined) {
      setSearchQuery(headerSearch);
      setCurrentPage(1);
    }
  }, [headerSearch]);

  useEffect(() => {
    if (!token) return;
    loadStats();
    loadLatestAll();
    loadRoomsCount();
    const statsInterval = setInterval(loadStats, 60000);
    const latestInterval = setInterval(() => loadLatestAll(true), 10000);
    const roomsInterval = setInterval(loadRoomsCount, 60000);
    return () => {
      clearInterval(statsInterval);
      clearInterval(latestInterval);
      clearInterval(roomsInterval);
    };
  }, [token, workspaceContext, userInfo?.primary_nhom_id]);

  // Realtime: lang nghe tu RealtimeProvider (WS chung da mo o App).
  // Khi co sensor event cho 1 deviceId trong devicesIdsRef, cap nhat deviceData.
  useEffect(() => {
    if (!lastEventAt) return;
    const allowedIds = devicesIdsRef.current;
    if (!allowedIds || allowedIds.length === 0) return;

    setDeviceData((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const devId of allowedIds) {
        const latest = getDeviceLatest(devId);
        if (!latest || Object.keys(latest).length === 0) continue;
        const cur = next[devId] || { device_id: devId, data: {} };
        const newData = { ...(cur.data || {}) };
        let maxTs = 0;
        for (const [k, v] of Object.entries(latest)) {
          newData[k] = { ...(newData[k] || {}), value: v.value, timestamp: v.ts };
          if (v.ts > maxTs) maxTs = v.ts;
        }
        const curLastSeen = cur.last_seen || 0;
        const newLastSeen = maxTs > curLastSeen ? maxTs : curLastSeen;
        next[devId] = { ...cur, device_id: devId, data: newData, last_seen: newLastSeen };
        changed = true;
      }
      return changed ? next : prev;
    });
  }, [lastEventAt]);

  // Forward WS status den AppHeader badge
  useEffect(() => {
    if (onWsStatusChange) onWsStatusChange(wsConnected);
  }, [wsConnected, onWsStatusChange]);

  const formatTime = (timestamp) => {
    if (!timestamp) return 'Chưa có dữ liệu';
    const date = new Date(timestamp * 1000);
    return date.toLocaleString('vi-VN');
  };

  const getStatus = (device) => {
    const data = deviceData[device.ma_thiet_bi] || {};
    const rawLastSeen = Number(data.last_seen ?? device.last_seen ?? data.timestamp ?? 0);
    if (!rawLastSeen) return { status: 'offline', color: '#ef4444' };
    const lastSeen = rawLastSeen > 1e12 ? rawLastSeen : rawLastSeen * 1000;
    const diffMinutes = (Date.now() - lastSeen) / 1000 / 60;
    if (diffMinutes < 2) return { status: 'online', color: '#22c55e' };
    if (diffMinutes < 10) return { status: 'warning', color: '#f59e0b' };
      return { status: 'offline', color: '#ef4444' };
  };

  const getDeviceIcon = (loaiThietBi) => {
    if (loaiThietBi === 'sensor') return 'memory';
    if (loaiThietBi === 'air_conditioner') return 'ac_unit';
    if (loaiThietBi === 'light') return 'lightbulb';
    return 'sensors';
  };

  const chartStats = useMemo(() => {
    const onlineCount = scopedDevices.filter(d => getStatus(d).status === 'online').length;
    const offlineCount = scopedDevices.filter(d => getStatus(d).status === 'offline').length;
    const warningCount = scopedDevices.filter(d => getStatus(d).status === 'warning').length;
    const pieData = [
      { name: 'Online', value: onlineCount, color: '#22c55e' },
      { name: 'Warning', value: warningCount, color: '#f59e0b' },
      { name: 'Offline', value: offlineCount, color: '#ef4444' },
    ].filter(d => d.value > 0);
    return { onlineCount, offlineCount, warningCount, totalDevices: scopedDevices.length, pieData };
  }, [scopedDevices, deviceData]);

  // Radial progress SVG helper
  const RadialProgress = ({ value, max, color, size = 64, stroke = 6 }) => {
    const r = (size - stroke) / 2;
    const circ = 2 * Math.PI * r;
    const pct = Math.min(value / max, 1);
    const offset = circ * (1 - pct);
    return (
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#1e293b" strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke}
          strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round"
          style={{ transition: 'stroke-dashoffset 0.5s ease' }} />
      </svg>
    );
  };

  // ── Derived metrics for overview stats ──
  const overviewMsgs = useMemo(() => {
    if (!Array.isArray(hourlyStats) || hourlyStats.length === 0) return 0;
    for (let i = hourlyStats.length - 1; i >= 0; i--) {
      const v = Number(hourlyStats[i]?.so_mau ?? hourlyStats[i]?.msg_count ?? hourlyStats[i]?.messages ?? 0);
      if (v > 0) return v;
    }
    return 0;
  }, [hourlyStats]);

  const [activeAlertsCount, setActiveAlertsCount] = useState(0);
  useEffect(() => {
    let cancelled = false;
    if (!token) return undefined;
    (async () => {
      try {
        const res = await axios.get(`${API_BASE}/alerts`, {
          headers: { Authorization: `Bearer ${token}` },
          params: { ...(effectiveWorkspaceId ? { workspace_id: effectiveWorkspaceId } : {}), trang_thai: 'new', limit: 1 }
        });
        if (!cancelled) setActiveAlertsCount(res.data?.new_count ?? res.data?.total ?? 0);
      } catch (e) { if (!cancelled) setActiveAlertsCount(0); }
    })();
    return () => { cancelled = true; };
  }, [token, workspaceContext, userInfo?.primary_nhom_id]);

  // Listen for sidebar "Add new device" trigger
  useEffect(() => {
    const openAdd = () => {
      setShowDeviceModal(true);
    };
    window.addEventListener('bdu-open-add-device', openAdd);
    return () => window.removeEventListener('bdu-open-add-device', openAdd);
  }, [token]);

  const sparkMsgs = useMemo(() => {
    if (!Array.isArray(hourlyStats) || hourlyStats.length === 0) return [];
    return hourlyStats.map((s, i) => ({ i, v: Number(s.so_mau ?? s.msg_count ?? s.messages ?? 0) }));
  }, [hourlyStats]);

  if (loading) {
    return (
      <div className="bdu-loading">
        <div className="bdu-spinner" />
        <p>Đang tải dữ liệu...</p>
      </div>
    );
  }

  const onlinePct = scopedDevices.length === 0 ? 0 : Math.round((chartStats.onlineCount / scopedDevices.length) * 100);

  return (
    <div className="bdu-page">
      <div className="bdu-grid-overlay" />
      <div className="bdu-container">

        {/* ── Overview Stats (4 cards) ── */}
        <div className="bdu-overview-stats">
          <div className="bdu-stat-overview">
            <div className="bdu-stat-overview-head">
              <div className="bdu-stat-overview-icon tone-cyan">
                <span className="material-symbols-outlined">devices_other</span>
              </div>
              <span className="bdu-stat-overview-pill up">+{chartStats.onlineCount}</span>
            </div>
            <div>
              <div className="bdu-stat-overview-value">
                {chartStats.onlineCount}
                <span className="bdu-stat-overview-unit">/ {scopedDevices.length}</span>
              </div>
              <div className="bdu-stat-overview-label">Online Devices · {onlinePct}%</div>
            </div>
            <div className="bdu-stat-overview-spark bdu-stat-overview-spark-corner">
              <PieChart width={72} height={72}>
                <Pie data={chartStats.pieData} dataKey="value" nameKey="name"
                     cx="50%" cy="50%"
                     innerRadius={20} outerRadius={32} paddingAngle={2} stroke="none">
                  {chartStats.pieData.map((entry, i) => (
                    <Cell key={i} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{ background: 'var(--bdu-card)', border: '1px solid var(--bdu-card-border)', borderRadius: 8, fontSize: 12 }}
                  formatter={(value, name) => [value, name]}
                  />
                </PieChart>
            </div>
      </div>

          <div className="bdu-stat-overview">
            <div className="bdu-stat-overview-head">
              <div className="bdu-stat-overview-icon tone-amber">
                <span className="material-symbols-outlined">meeting_room</span>
              </div>
              <span className="bdu-stat-overview-pill up">
                {isAdmin ? 'Toàn hệ thống' : isTeacher ? 'Lớp của tôi' : workspaceContext === 'nhom' ? 'Nhóm' : 'Cá nhân'}
              </span>
            </div>
            <div>
              <div className="bdu-stat-overview-value">
                {roomsCount}
                <span className="bdu-stat-overview-unit">phòng</span>
            </div>
              <div className="bdu-stat-overview-label">Tổng số phòng</div>
          </div>
            <div className="bdu-stat-overview-spark bdu-stat-overview-spark-corner">
              <span className="material-symbols-outlined bdu-overview-spark-icon">home_work</span>
            </div>
          </div>

          <div className="bdu-stat-overview">
            <div className="bdu-stat-overview-head">
              <div className="bdu-stat-overview-icon tone-red">
                <span className="material-symbols-outlined">notifications_active</span>
          </div>
              {activeAlertsCount > 0
                ? <span className="bdu-stat-overview-pill down">Cần xử lý</span>
                : <span className="bdu-stat-overview-pill up">Ổn định</span>}
                </div>
            <div>
              <div className="bdu-stat-overview-value">
                {activeAlertsCount}
                <span className="bdu-stat-overview-unit">alerts</span>
              </div>
              <div className="bdu-stat-overview-label">Active Alerts</div>
            </div>
            <div className="bdu-stat-overview-spark" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => {
                const h = 8 + (i % 4) * 4;
                return <span key={i} className={`bdu-alerts-bar ${i < activeAlertsCount ? 'active' : 'inactive'}`} style={{ flex: 1, height: h }} />;
              })}
                </div>
              </div>

          <div className="bdu-stat-overview">
            <div className="bdu-stat-overview-head">
              <div className="bdu-stat-overview-icon tone-purple">
                <span className="material-symbols-outlined">speed</span>
              </div>
              <span className="bdu-stat-overview-pill up">Live</span>
            </div>
            <div>
              <div className="bdu-stat-overview-value">
                {overviewMsgs}
                <span className="bdu-stat-overview-unit">msg</span>
              </div>
              <div className="bdu-stat-overview-label">Data Throughput · giờ gần nhất</div>
            </div>
            <div className="bdu-stat-overview-spark">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={sparkMsgs.length > 0 ? sparkMsgs : [{i:0,v:0},{i:1,v:0}]}>
                  <Line type="monotone" dataKey="v" stroke="#a78bfa" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* ── Overview Main Grid: Devices + LogStream ── */}
        <div className="bdu-overview-grid">
          <div>
            <div className="bdu-section-header">
              <h2 className="bdu-section-title">
                <span className="material-symbols-outlined">memory</span>
                Thiết bị gần đây
              </h2>
              <button className="bdu-section-link" onClick={() => {
                const el = document.getElementById('bdu-all-devices');
                if (el) el.scrollIntoView({ behavior: 'smooth' });
              }}>
                Xem tất cả
                <span className="material-symbols-outlined">arrow_forward</span>
              </button>
            </div>
            {scopedDevices.length === 0 ? (
              <div className="bdu-device-list">
                <div className="bdu-device-list-empty">Chưa có thiết bị nào.</div>
              </div>
            ) : (
              <div className="bdu-device-list">
                {scopedDevices.slice(0, 8).map((device) => {
                  const data = deviceData[device.ma_thiet_bi] || {};
                  const status = getStatus(device);
                  const deviceKeys = data.data || {};
                  // Lấy metric "đầu tiên" làm số hiển thị
                  const firstKey = Object.keys(deviceKeys)[0];
                  const firstVal = firstKey
                    ? (typeof deviceKeys[firstKey] === 'object' ? deviceKeys[firstKey].value : deviceKeys[firstKey])
                    : null;
                  const firstUnit = firstKey && typeof deviceKeys[firstKey] === 'object' ? (deviceKeys[firstKey].don_vi || '') : '';
                  return (
                    <div
                      key={device.id || device.ma_thiet_bi}
                      className={`bdu-device-row status-${status.status}`}
                      onClick={() => onOpenDevice?.(device.ma_thiet_bi)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => { if (e.key === 'Enter') onOpenDevice?.(device.ma_thiet_bi); }}
                    >
                      <div className={`bdu-row-icon status-${status.status}`}>
                        <span className="material-symbols-outlined">{getDeviceIcon(device.loai_thiet_bi)}</span>
                      </div>
                      <div className="bdu-row-meta">
                        <span className="bdu-row-name">{device.ten_thiet_bi || device.ma_thiet_bi}</span>
                        <span className="bdu-row-sub">
                          {device.ma_thiet_bi}
                          {device.ten_phong ? ` · ${device.ten_phong}` : ''}
                    </span>
                </div>
                      <div className="bdu-row-metric">
                        {firstVal === null || firstVal === undefined ? '—' : `${typeof firstVal === 'number' ? firstVal.toFixed(1) : firstVal}${firstUnit}`}
                      </div>
                      <span className={`bdu-status-chip ${status.status}`}>
                        <span className="bdu-status-dot" style={{ background: status.color }} />
                        {status.status.toUpperCase()}
                      </span>
                      <span className="material-symbols-outlined bdu-row-arrow">chevron_right</span>
                    </div>
                  );
                })}
              </div>
            )}
              </div>

          <div>
            <div className="bdu-section-header">
              <h2 className="bdu-section-title">
                <span className="material-symbols-outlined">timeline</span>
                Hoạt động hệ thống
              </h2>
            </div>
            <LogStream token={token} wsUrl={WS_URL} devices={scopedDevices} maxEntries={80} />
                </div>
              </div>

        {/* ── All Devices Section ── */}
        <div id="bdu-all-devices" className="bdu-section-header" style={{ marginTop: 12 }}>
          <h2 className="bdu-section-title">
            <span className="material-symbols-outlined">grid_view</span>
            Tất cả thiết bị
          </h2>
          <span className="bdu-section-link" style={{ color: 'var(--bdu-muted)' }}>
            {scopedDevices.length} thiết bị
          </span>
            </div>

        {/* ── Search Bar ── */}
        {scopedDevices.length > 0 && (
          <div className="bdu-search-bar">
            <Icon name="search" className="bdu-search-icon" />
              <input 
                type="text" 
              className="bdu-search-input"
              placeholder="Tìm kiếm thiết bị (Tên / Mã)..."
                value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
              />
            </div>
        )}

        {/* ── Device Grid ── */}
        {scopedDevices.length === 0 ? (
          <div className="bdu-empty-state">
            <Icon name="sensors_off" className="bdu-empty-icon" />
            <p>Chưa có thiết bị nào được đăng ký.</p>
          </div>
        ) : (
          <>
            <div className="bdu-devices-grid">
              {(() => {
                const filtered = scopedDevices.filter(d =>
                  (d.ten_thiet_bi || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
                  (d.ma_thiet_bi || '').toLowerCase().includes(searchQuery.toLowerCase())
                );
                const totalPages = Math.ceil(filtered.length / devicesPerPage);
                const validPage = Math.min(currentPage, Math.max(1, totalPages));
                const start = (validPage - 1) * devicesPerPage;
                const currentDevices = filtered.slice(start, start + devicesPerPage);
                return currentDevices.map((device) => {
                const data = deviceData[device.ma_thiet_bi] || {};
                const status = getStatus(device);
                const deviceKeys = data.data || {};
                  const isOn = (getStateValue(deviceKeys) || '').toString().toUpperCase() === 'ON';
                return (
                    <div
                      key={device.id || device.ma_thiet_bi}
                      className={`bdu-device-card ${status.status}`}
                      onClick={() => onOpenDevice?.(device.ma_thiet_bi)}
                      style={{ cursor: onOpenDevice ? 'pointer' : 'default' }}
                    >
                      {/* Top bar */}
                      <div className="bdu-card-header">
                        <div className="bdu-device-icon-wrap">
                          <Icon name={getDeviceIcon(device.loai_thiet_bi)} className="bdu-device-icon" />
                      </div>
                        <div className="bdu-device-meta">
                          <h3 className="bdu-device-name">{device.ten_thiet_bi || device.ma_thiet_bi}</h3>
                          <span className="bdu-device-id">{device.ma_thiet_bi}</span>
                      </div>
                        <div className={`bdu-status-chip ${status.status}`}>
                          <span className="bdu-status-dot" style={{ background: status.color }} />
                          {status.status.toUpperCase()}
                        </div>
                        <button className="bdu-delete-btn" onClick={(e) => { e.stopPropagation(); handleDeleteDevice(device); }} title="Xóa thiết bị">
                          <Icon name="close" />
                      </button>
                    </div>

                      {/* Metrics */}
                      <div className="bdu-card-body">
                      {Object.keys(deviceKeys).length === 0 ? (
                          <p className="bdu-no-data">Chưa có dữ liệu</p>
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
                            return (
                                <div key={key} className="bdu-metric-row">
                                  <span className="bdu-metric-label">{key}</span>
                                  <span className="bdu-metric-value">{formatValue(value, unit)}</span>
                              </div>
                            );
                          })
                      )}
                    </div>

                      {/* Controls */}
                    {(device.loai_thiet_bi === 'air_conditioner' || device.loai_thiet_bi === 'light') && (
                        <div className="bdu-card-controls">
                          <button className={`bdu-power-btn ${isOn ? 'on' : 'off'}`} onClick={() => handleTogglePower(device)}>
                            <Icon name="power_settings_new" />
                            {isOn ? 'Tắt' : 'Bật'}
                        </button>
                        {device.loai_thiet_bi === 'light' && (
                            <div className="bdu-brightness">
                              <Icon name="brightness_6" className="bdu-bright-icon" />
                              <input type="range" min="0" max="100" value={getBrightnessValue(deviceKeys)}
                                onChange={(e) => handleBrightnessChange(device, e.target.value)} className="bdu-range" />
                              <span className="bdu-bright-val">{getBrightnessValue(deviceKeys)}</span>
                          </div>
                        )}
                      </div>
                    )}

                      {/* Footer */}
                      <div className="bdu-card-footer">
                        <span className="bdu-last-seen">
                          <Icon name="schedule" className="bdu-footer-icon" />
                          {data.last_seen ? `Cập nhật: ${formatTime(data.last_seen)}` : 'Chưa có dữ liệu'}
                        </span>
                      {device.phong_id && (
                          <span className="bdu-room-tag">
                            <Icon name="location_on" className="bdu-footer-icon" />
                            {device.ten_phong || `Phòng ${device.phong_id}`}
                          </span>
                      )}
                    </div>
                  </div>
                );
                });
              })()}
            </div>

            {/* Pagination */}
            {(() => {
              const filtered = scopedDevices.filter(d =>
                (d.ten_thiet_bi || '').toLowerCase().includes(searchQuery.toLowerCase()) || 
                (d.ma_thiet_bi || '').toLowerCase().includes(searchQuery.toLowerCase())
              );
              const totalPages = Math.ceil(filtered.length / devicesPerPage);
              const validPage = Math.min(currentPage, Math.max(1, totalPages));
              if (totalPages <= 1) return null;
                return (
                <div className="bdu-pagination">
                  <button className="bdu-page-btn" disabled={validPage === 1}
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}>‹ Trước</button>
                  <span className="bdu-page-info">Trang {validPage} / {totalPages}</span>
                  <button className="bdu-page-btn" disabled={validPage === totalPages}
                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}>Sau ›</button>
                  </div>
                );
            })()}
          </>
        )}

        {/* ── FAB Button ── */}
        <button className="bdu-fab"
          onClick={() => setShowDeviceModal(true)}
          title="Thêm thiết bị mới"
        >
          <Icon name="add" />
        </button>

        {/* ── Device Modal (Portal) ── */}
        {showDeviceModal && (
          <AddDeviceModal
            onClose={() => setShowDeviceModal(false)}
            token={token}
            onDeviceAdded={() => loadLatestAll()}
            workspaceContext={workspaceContext}
            userInfo={userInfo}
          />
        )}
                          </div>
                          </div>
  );
};

export default Dashboard;
