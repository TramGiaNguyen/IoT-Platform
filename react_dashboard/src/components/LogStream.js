import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useRealtime } from '../context/RealtimeProvider';

const severityFor = (key, value) => {
  if (key === 'state' || key === 'power') {
    const v = String(value).toUpperCase();
    if (v === 'ON' || v === '1' || v === 'TRUE') return 'success';
    if (v === 'OFF' || v === '0' || v === 'FALSE') return 'info';
    return 'info';
  }
  if (key === 'alert' || key === 'alarm' || key === 'error') return 'danger';
  if (key === 'warning' || key === 'warn') return 'warn';
  if (key === 'temperature' || key === 'Nhiet_do') {
    const n = Number(value);
    if (Number.isFinite(n)) {
      if (n > 50) return 'danger';
      if (n > 35) return 'warn';
    }
  }
  return 'info';
};

const iconForKey = (key) => {
  const k = String(key).toLowerCase();
  if (k.includes('temp') || k.includes('nhiet')) return 'thermostat';
  if (k.includes('humid') || k.includes('am')) return 'water_drop';
  if (k.includes('bright') || k.includes('lux')) return 'lightbulb';
  if (k.includes('power') || k.includes('cong_suat') || k.includes('energy')) return 'bolt';
  if (k.includes('volt') || k.includes('dien_ap')) return 'power';
  if (k.includes('current') || k.includes('dong_dien')) return 'electrical_services';
  if (k.includes('state') || k.includes('trang_thai')) return 'toggle_on';
  if (k.includes('alert') || k.includes('canh_bao')) return 'warning';
  if (k.includes('motion') || k.includes('chuyen_dong')) return 'motion_mode';
  return 'sensors';
};

const fmtTime = (ts) => {
  if (!ts) return '';
  const ms = Number(ts) > 1e12 ? Number(ts) : Number(ts) * 1000;
  const d = new Date(ms);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
};

const LogStream = ({ token, devices = [], maxEntries = 80, paused = false }) => {
  const [entries, setEntries] = useState([]);
  const { connected, latestByDevice } = useRealtime();
  const prevLatestRef = useRef({});
  const mountedRef = useRef(true);

  const deviceMap = useMemo(() => {
    const m = new Map();
    (devices || []).forEach(d => m.set(String(d.ma_thiet_bi), d));
    return m;
  }, [devices]);

  // Subscribe to latestByDevice changes from RealtimeProvider
  useEffect(() => {
    if (!mountedRef.current) return;

    const processDevice = (deviceId, data) => {
      if (!deviceId || !data || typeof data !== 'object') return;

      const keys = Object.keys(data).filter(k => !['device_id', 'timestamp', 'type', 'last_update'].includes(k));
      if (keys.length === 0) return;

      const newEntries = keys.map(k => {
        const v = data[k]?.value !== undefined ? data[k].value : data[k];
        const ts = data[k]?.ts || Date.now() / 1000;
        return {
          id: `${deviceId}-${k}-${ts}-${Math.random().toString(36).slice(2, 6)}`,
          timestamp: ts,
          deviceId,
          key: k,
          value: v,
          severity: severityFor(k, v)
        };
      });

      if (newEntries.length > 0) {
        setEntries(prev => [...newEntries, ...prev].slice(0, maxEntries));
      }
    };

    // Check all devices for updates
    const prev = prevLatestRef.current;
    for (const deviceId of Object.keys(latestByDevice)) {
      const current = latestByDevice[deviceId];
      const prevData = prev[deviceId];
      if (current !== prevData) {
        processDevice(deviceId, current);
        prevLatestRef.current[deviceId] = current;
      }
    }
  }, [latestByDevice, maxEntries]);

  const deviceName = (id) => {
    const d = deviceMap.get(String(id));
    return d?.ten_thiet_bi || d?.ma_thiet_bi || id;
  };

  return (
    <div className="log-stream-panel">
      <div className="log-stream-header">
        <div className="log-stream-title">
          <span className="material-symbols-outlined">timeline</span>
          Hoạt động hệ thống
        </div>
        <div className="log-stream-status">
          <span className={`header-ws-dot ${connected ? 'online' : 'offline'}`} />
          {connected ? 'Đang nghe' : 'Mất kết nối'}
        </div>
      </div>
      <div className="log-stream-body">
        {entries.length === 0 ? (
          <div className="log-empty">Đang chờ sự kiện real-time...</div>
        ) : (
          entries.map(e => (
            <div key={e.id} className={`log-row severity-${e.severity}`}>
              <span className="log-time">{fmtTime(e.timestamp)}</span>
              <div className="log-body">
                <span className={`log-icon severity-${e.severity} material-symbols-outlined`}>{iconForKey(e.key)}</span>
                <span className="log-text">
                  <span className="log-device">{deviceName(e.deviceId)}</span>
                  {' · '}
                  <span className="log-key">{e.key}</span>
                  {' = '}
                  <span className={`log-value severity-${e.severity}`}>{typeof e.value === 'object' ? JSON.stringify(e.value) : String(e.value)}</span>
                </span>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default LogStream;
