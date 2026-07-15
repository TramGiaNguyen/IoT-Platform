import React, { useState, useEffect, useRef } from 'react';
import { ResponsiveContainer, LineChart, AreaChart, BarChart, PieChart, Pie, Cell, Line, Area, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ComposedChart } from 'recharts';
import { fetchWidgetData, controlRelay } from '../../services';
import { API_BASE } from '../../config/api';
import { useRealtime } from '../../context/RealtimeProvider';
import '../../styles/dashboard-builder.css';

// ── Hook helper: subscribe realtime data tu RealtimeProvider ──────────────
function useDeviceRealtime(deviceId, dataKeys) {
  const { lastEventAt, getDeviceLatest } = useRealtime();
  const [latestValue, setLatestValue] = useState({});

  useEffect(() => {
    if (!deviceId || !lastEventAt) return;
    const latest = getDeviceLatest(deviceId);
    if (!latest) return;
    const extracted = {};
    for (const key of dataKeys) {
      if (latest[key] !== undefined) {
        const v = latest[key];
        extracted[key] = typeof v === 'object' ? v.value : v;
      }
    }
    setLatestValue((prev) => {
      // Chi update neu co thay doi that su
      let changed = false;
      for (const k of Object.keys(extracted)) {
        if (prev[k] !== extracted[k]) { changed = true; break; }
      }
      return changed ? extracted : prev;
    });
  }, [lastEventAt, deviceId]);

  return latestValue;
}

// ── Helper: merge realtime latest values vao series hien tai ─────────────
// Tra ve setDataMerged: cap nhat diem cuoi (hoac tao moi neu rong)
// voi value moi nhat + ts tu RealtimeProvider.
function makeRealtimeMerger(setData) {
  return (latest) => {
    if (!latest || Object.keys(latest).length === 0) return;
    setData(prev => {
      if (prev.length === 0) return prev; // doi polling load xong
      const last = prev[prev.length - 1];
      const merged = { ...last };
      for (const [k, v] of Object.entries(latest)) {
        if (v !== undefined) merged[k] = v;
      }
      return [...prev.slice(0, -1), merged];
    });
  };
}

const COLORS = ['#22d3ee', '#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981'];

// Helper function to unwrap value from API response
const unwrapValue = (val) => {
  if (val == null) return null;
  
  // Handle object with 'value' key
  if (typeof val === 'object' && !Array.isArray(val)) {
    // If it has 'value' key, return that
    if ('value' in val) {
      return val.value;
    }
    // If it has 'khoa' key (metadata object), return null (not a data value)
    if ('khoa' in val || 'don_vi' in val || 'mo_ta' in val) {
      return null;
    }
    // For other objects, try to extract a numeric value
    const keys = Object.keys(val);
    if (keys.length > 0) {
      const firstValue = val[keys[0]];
      if (typeof firstValue === 'number' || typeof firstValue === 'string') {
        return firstValue;
      }
    }
    return null;
  }
  
  return val;
};

export function LineChartWidget({ widget, token, dashboardId }) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const deviceId = widget.cau_hinh?.device_id;
  const dataKeys = widget.cau_hinh?.data_keys || [];
  const [timeRange, setTimeRange] = useState(widget.cau_hinh?.time_range || '1h');

  const loadData = async () => {
    try {
      const res = await fetchWidgetData(
        dashboardId,
        widget.id,
        timeRange,
        null,
        token
      );
      const chartData = (res.data.data || [])
        .map(item => ({
          ...item,
          timestamp: new Date(item.timestamp * 1000).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
          timestampValue: item.timestamp // Keep original timestamp for sorting
        }))
        .sort((a, b) => a.timestampValue - b.timestampValue); // Ensure ascending order (oldest to newest)
      setData(chartData);
    } catch (err) {
      console.error('Failed to load widget data:', err);
    } finally {
      setLoading(false);
    }
  };

  // Initial load and periodic refresh
  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 30000); // Refresh every 30s
    return () => clearInterval(interval);
  }, [widget.id, timeRange]);

  // Realtime: subscribe qua RealtimeProvider (1 WS shared cho toan app)
  const latest = useDeviceRealtime(deviceId, dataKeys);
  useEffect(() => {
    if (!latest || Object.keys(latest).length === 0) return;
    makeRealtimeMerger(setData)(latest);
  }, [latest]);

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--bdu-muted)' }}>
        Đang tải...
      </div>
    );
  }

  const colors = widget.cau_hinh?.colors || {};

  return (
    <div style={{ width: '100%', height: '100%', padding: '12px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
        {widget.ten_widget && (
          <h4 style={{ color: 'var(--bdu-text)', margin: '0', fontSize: '14px' }}>
            {widget.ten_widget}
          </h4>
        )}
        <select
          value={timeRange}
          onChange={(e) => setTimeRange(e.target.value)}
          className="widget-time-range-select"
          style={{ flexShrink: 0 }}
        >
          <option value="1h">1h</option>
          <option value="6h">6h</option>
          <option value="24h">24h</option>
          <option value="7d">7d</option>
          <option value="30d">30d</option>
        </select>
      </div>
      <ResponsiveContainer width="100%" height="calc(100% - 40px)">
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1f2a44" />
          <XAxis 
            dataKey="timestamp" 
            stroke="#64748b" 
            tick={{ fontSize: 10 }}
            type="category"
            allowDuplicatedCategory={false}
          />
          <YAxis stroke="#64748b" tick={{ fontSize: 10 }} />
          <Tooltip contentStyle={{ backgroundColor: 'var(--bdu-card)', border: '1px solid var(--bdu-card-border)', color: 'var(--bdu-text)' }} />
          <Legend />
          {dataKeys.map((key, idx) => (
            <Line
              key={key}
              type="monotone"
              dataKey={key}
              stroke={colors[key] || COLORS[idx % COLORS.length]}
              dot={false}
              strokeWidth={2}
              name={key}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function AreaChartWidget({ widget, token, dashboardId }) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const deviceId = widget.cau_hinh?.device_id;
  const dataKeys = widget.cau_hinh?.data_keys || [];
  const [timeRange, setTimeRange] = useState(widget.cau_hinh?.time_range || '1h');

  const loadData = async () => {
    try {
      const res = await fetchWidgetData(
        dashboardId,
        widget.id,
        timeRange,
        null,
        token
      );
      const chartData = (res.data.data || [])
        .map(item => ({
          ...item,
          timestamp: new Date(item.timestamp * 1000).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
          timestampValue: item.timestamp // Keep original timestamp for sorting
        }))
        .sort((a, b) => a.timestampValue - b.timestampValue); // Ensure ascending order (oldest to newest)
      setData(chartData);
    } catch (err) {
      console.error('Failed to load widget data:', err);
    } finally {
      setLoading(false);
    }
  };

  // Initial load and periodic refresh
  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 30000); // Refresh every 30s
    return () => clearInterval(interval);
  }, [widget.id, timeRange]);

  // Realtime: subscribe qua RealtimeProvider (1 WS shared cho toan app)
  const latestArea = useDeviceRealtime(deviceId, dataKeys);
  useEffect(() => {
    if (!latestArea || Object.keys(latestArea).length === 0) return;
    makeRealtimeMerger(setData)(latestArea);
  }, [latestArea]);
  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--bdu-muted)' }}>
        Đang tải...
      </div>
    );
  }

  const colors = widget.cau_hinh?.colors || {};

  return (
    <div style={{ width: '100%', height: '100%', padding: '12px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
        {widget.ten_widget && (
          <h4 style={{ color: 'var(--bdu-text)', margin: '0', fontSize: '14px' }}>
            {widget.ten_widget}
          </h4>
        )}
        <select
          value={timeRange}
          onChange={(e) => setTimeRange(e.target.value)}
          className="widget-time-range-select"
          style={{ flexShrink: 0 }}
        >
          <option value="1h">1h</option>
          <option value="6h">6h</option>
          <option value="24h">24h</option>
          <option value="7d">7d</option>
          <option value="30d">30d</option>
        </select>
      </div>
      <ResponsiveContainer width="100%" height="calc(100% - 40px)">
        <AreaChart data={data}>
          <defs>
            {dataKeys.map((key, idx) => {
              const color = colors[key] || COLORS[idx % COLORS.length];
              return (
                <linearGradient key={key} id={`area-fill-${widget.id}-${key}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={color} stopOpacity={0.4} />
                  <stop offset="100%" stopColor={color} stopOpacity={0.05} />
                </linearGradient>
              );
            })}
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#1f2a44" />
          <XAxis
            dataKey="timestamp"
            stroke="#64748b"
            tick={{ fontSize: 10 }}
            type="category"
            allowDuplicatedCategory={false}
          />
          <YAxis stroke="#64748b" tick={{ fontSize: 10 }} />
          <Tooltip contentStyle={{ backgroundColor: 'var(--bdu-card)', border: '1px solid var(--bdu-card-border)', color: 'var(--bdu-text)' }} />
          <Legend />
          {dataKeys.map((key, idx) => {
            const color = colors[key] || COLORS[idx % COLORS.length];
            return (
              <Area
                key={key}
                type="monotone"
                dataKey={key}
                stroke={color}
                fill={`url(#area-fill-${widget.id}-${key})`}
                strokeWidth={2}
                name={key}
              />
            );
          })}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export function BarChartWidget({ widget, token, dashboardId }) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const deviceId = widget.cau_hinh?.device_id;
  const dataKeys = widget.cau_hinh?.data_keys || [];
  const [timeRange, setTimeRange] = useState(widget.cau_hinh?.time_range || '1h');

  const loadData = async () => {
    try {
      const res = await fetchWidgetData(
        dashboardId,
        widget.id,
        timeRange,
        null,
        token
      );
      const chartData = (res.data.data || [])
        .map(item => ({
          ...item,
          timestamp: new Date(item.timestamp * 1000).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
          timestampValue: item.timestamp // Keep original timestamp for sorting
        }))
        .sort((a, b) => a.timestampValue - b.timestampValue); // Ensure ascending order (oldest to newest)
      setData(chartData);
    } catch (err) {
      console.error('Failed to load widget data:', err);
    } finally {
      setLoading(false);
    }
  };

  // Initial load and periodic refresh
  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 30000);
    return () => clearInterval(interval);
  }, [widget.id, timeRange]);

  // Realtime: subscribe qua RealtimeProvider (1 WS shared cho toan app)
  const latest = useDeviceRealtime(deviceId, dataKeys);
  useEffect(() => {
    if (!latest || Object.keys(latest).length === 0) return;
    makeRealtimeMerger(setData)(latest);
  }, [latest]);

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--bdu-muted)' }}>
        Đang tải...
      </div>
    );
  }

  return (
    <div style={{ width: '100%', height: '100%', padding: '12px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
        {widget.ten_widget && (
          <h4 style={{ color: 'var(--bdu-text)', margin: '0', fontSize: '14px' }}>
            {widget.ten_widget}
          </h4>
        )}
        <select
          value={timeRange}
          onChange={(e) => setTimeRange(e.target.value)}
          className="widget-time-range-select"
          style={{ flexShrink: 0 }}
        >
          <option value="1h">1h</option>
          <option value="6h">6h</option>
          <option value="24h">24h</option>
          <option value="7d">7d</option>
          <option value="30d">30d</option>
        </select>
      </div>
      <ResponsiveContainer width="100%" height="calc(100% - 40px)">
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1f2a44" />
          <XAxis 
            dataKey="timestamp" 
            stroke="#64748b" 
            tick={{ fontSize: 10 }}
            type="category"
            allowDuplicatedCategory={false}
          />
          <YAxis stroke="#64748b" tick={{ fontSize: 10 }} />
          <Tooltip contentStyle={{ backgroundColor: 'var(--bdu-card)', border: '1px solid var(--bdu-card-border)', color: 'var(--bdu-text)' }} />
          <Legend />
          {dataKeys.map((key, idx) => (
            <Bar key={key} dataKey={key} fill={COLORS[idx % COLORS.length]} name={key} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function GaugeWidget({ widget, token, dashboardId }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const deviceId = widget.cau_hinh?.device_id;
  const dataKey = widget.cau_hinh?.data_keys?.[0];
  const [timeRange, setTimeRange] = useState(widget.cau_hinh?.time_range || '1h');

  const loadData = async () => {
    try {
      const res = await fetchWidgetData(
        dashboardId,
        widget.id,
        timeRange,
        null,
        token
      );
      const latest = res.data.data?.[res.data.data.length - 1];
      if (latest && dataKey) {
        const rawValue = latest[dataKey];
        setData(unwrapValue(rawValue));
      }
    } catch (err) {
      console.error('Failed to load widget data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 10000); // Refresh every 10s for gauge
    return () => clearInterval(interval);
  }, [widget.id, timeRange]);

  // Realtime: subscribe qua RealtimeProvider (1 WS shared cho toan app)
  const latest = useDeviceRealtime(deviceId, dataKey ? [dataKey] : []);
  useEffect(() => {
    if (!latest || Object.keys(latest).length === 0) return;
    if (dataKey && latest[dataKey] !== undefined) {
      setData(unwrapValue(latest[dataKey]));
    }
  }, [latest]);

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--bdu-muted)' }}>
        Đang tải...
      </div>
    );
  }

  const value = data || 0;
  const min = widget.cau_hinh?.min || 0;
  const max = widget.cau_hinh?.max || 100;
  const percentage = Math.min(100, Math.max(0, ((value - min) / (max - min)) * 100));

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      height: '100%',
      padding: '20px'
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', marginBottom: '8px' }}>
        {widget.ten_widget && (
          <h4 style={{ color: 'var(--bdu-text)', margin: '0', fontSize: '14px' }}>
            {widget.ten_widget}
          </h4>
        )}
        <select
          value={timeRange}
          onChange={(e) => setTimeRange(e.target.value)}
          className="widget-time-range-select"
          style={{ flexShrink: 0 }}
        >
          <option value="1h">1h</option>
          <option value="6h">6h</option>
          <option value="24h">24h</option>
          <option value="7d">7d</option>
          <option value="30d">30d</option>
        </select>
      </div>
      <div style={{
        width: '140px',
        height: '140px',
        borderRadius: '50%',
        background: `conic-gradient(from 0deg, #22d3ee ${percentage * 3.6}deg, #1f2a44 ${percentage * 3.6}deg)`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative'
      }}>
        <div style={{
          width: '100px',
          height: '100px',
          borderRadius: '50%',
          background: 'var(--bdu-card)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'column'
        }}>
          <div style={{ fontSize: '28px', fontWeight: 'bold', color: 'var(--bdu-cyan)' }}>
            {value?.toFixed(1) || '0'}
          </div>
          <div style={{ fontSize: '10px', color: 'var(--bdu-muted)' }}>
            {widget.cau_hinh?.unit || ''}
          </div>
        </div>
      </div>
      <div style={{ marginTop: '12px', fontSize: '12px', color: 'var(--bdu-muted)', textAlign: 'center' }}>
        {min} - {max}
      </div>
    </div>
  );
}

export function StatCardWidget({ widget, token, dashboardId }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const deviceId = widget.cau_hinh?.device_id;
  const dataKey = widget.cau_hinh?.data_keys?.[0];
  const [timeRange, setTimeRange] = useState(widget.cau_hinh?.time_range || '1h');

  const loadData = async () => {
    try {
      const res = await fetchWidgetData(
        dashboardId,
        widget.id,
        timeRange,
        null,
        token
      );
      const latest = res.data.data?.[res.data.data.length - 1];
      if (latest && dataKey) {
        const rawValue = latest[dataKey];
        setData(unwrapValue(rawValue));
      }
    } catch (err) {
      console.error('Failed to load widget data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 10000);
    return () => clearInterval(interval);
  }, [widget.id, timeRange]);

  // Realtime: subscribe qua RealtimeProvider (1 WS shared cho toan app)
  const latest = useDeviceRealtime(deviceId, dataKey ? [dataKey] : []);
  useEffect(() => {
    if (!latest || dataKey === undefined) return;
    const v = latest[dataKey];
    if (v !== undefined) setData(unwrapValue(v));
  }, [latest]);

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--bdu-muted)' }}>
        Đang tải...
      </div>
    );
  }

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      height: '100%',
      padding: '20px',
      textAlign: 'center'
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', marginBottom: '8px' }}>
        <span style={{ fontSize: '12px', color: 'var(--bdu-muted)' }}>
          {widget.cau_hinh?.label || widget.ten_widget || 'Value'}
        </span>
        <select
          value={timeRange}
          onChange={(e) => setTimeRange(e.target.value)}
          className="widget-time-range-select"
          style={{ flexShrink: 0 }}
        >
          <option value="1h">1h</option>
          <option value="6h">6h</option>
          <option value="24h">24h</option>
          <option value="7d">7d</option>
          <option value="30d">30d</option>
        </select>
      </div>
      <div style={{ fontSize: '40px', fontWeight: 'bold', color: 'var(--bdu-cyan)', marginBottom: '8px' }}>
        {data?.toFixed(1) || '--'}
      </div>
      <div style={{ fontSize: '12px', color: 'var(--bdu-muted)', marginTop: '4px' }}>
        {widget.cau_hinh?.unit || ''}
      </div>
    </div>
  );
}

export function PieChartWidget({ widget, token, dashboardId }) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const pieLimit = widget.cau_hinh?.pie_limit || 5;
  const dataKeys = widget.cau_hinh?.data_keys || [];
  const useCategory = widget.cau_hinh?.pie_category === true;

  const loadData = async () => {
    try {
      const res = await fetchWidgetData(
        dashboardId,
        widget.id,
        widget.cau_hinh?.time_range || '24h',
        null,
        token
      );

      if (useCategory && dataKeys.length > 0) {
        // Mode 1: Pie chart by data keys (sum values of each key)
        const totals = {};
        dataKeys.forEach(key => { totals[key] = 0; });
        (res.data.data || []).forEach(item => {
          dataKeys.forEach(key => {
            const val = parseFloat(item[key]);
            if (!isNaN(val)) {
              totals[key] = (totals[key] || 0) + val;
            }
          });
        });
        const labels = (widget.cau_hinh?.labels || '').split(';').filter(Boolean);
        const chartData = dataKeys.map((key, i) => ({
          name: labels[i] || key,
          value: totals[key] || 0
        })).filter(d => d.value > 0);
        setData(chartData);
      } else {
        // Mode 2: Pie chart by time slices (last N values)
        const chartData = (res.data.data || []).reduce((acc, item) => {
          // Use first data_key for value
          const key = dataKeys[0];
          if (key && item[key] !== undefined) {
            const value = parseFloat(item[key]);
            if (!isNaN(value)) {
              acc.push({
                name: new Date(item.timestamp * 1000).toLocaleTimeString('vi-VN'),
                value
              });
            }
          }
          return acc;
        }, []).slice(-pieLimit);
        setData(chartData);
      }
    } catch (err) {
      console.error('Failed to load widget data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 30000);
    return () => clearInterval(interval);
  }, [widget.id, widget.cau_hinh?.time_range, widget.cau_hinh?.pie_category, pieLimit]);

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--bdu-muted)' }}>
        Đang tải...
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--bdu-muted)', fontSize: '12px' }}>
        Chưa có dữ liệu
      </div>
    );
  }

  // Build legend items from dataKeys with labels
  const labels = (widget.cau_hinh?.labels || '').split(';').filter(Boolean);
  const legendItems = dataKeys.map((key, i) => ({
    key,
    label: labels[i] || key,
    color: COLORS[i % COLORS.length]
  }));

  return (
    <div style={{ width: '100%', height: '100%', padding: '12px' }}>
      {widget.ten_widget && (
        <h4 style={{ color: 'var(--bdu-text)', margin: '0 0 12px 0', fontSize: '14px', textAlign: 'center' }}>
          {widget.ten_widget}
        </h4>
      )}
      <ResponsiveContainer width="100%" height="85%">
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            labelLine={false}
            label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
            outerRadius={60}
            fill="#8884d8"
            dataKey="value"
          >
            {data.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
            ))}
          </Pie>
          <Tooltip contentStyle={{ backgroundColor: 'var(--bdu-card)', border: '1px solid var(--bdu-card-border)', color: 'var(--bdu-text)' }} />
        </PieChart>
      </ResponsiveContainer>
      {/* Custom color legend below chart */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', justifyContent: 'center', padding: '4px 0' }}>
        {legendItems.map((item, index) => (
          <div key={index} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <div style={{
              width: '10px',
              height: '10px',
              borderRadius: '2px',
              backgroundColor: item.color
            }} />
            <span style={{ fontSize: '10px', color: 'var(--bdu-muted)' }}>{item.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---- ScadaSymbolWidget ----
function ScadaSymbolWidget({ widget, token, dashboardId }) {
  const [value, setValue] = useState(null);
  const deviceId = widget.cau_hinh?.device_id;
  const dataKey = widget.cau_hinh?.data_key || 'state';
  const symbolType = widget.cau_hinh?.symbol_type || 'light';

  const loadData = async () => {
    try {
      const res = await fetchWidgetData(dashboardId, widget.id, '1h', null, token);
      const latest = res.data.data?.[res.data.data.length - 1];
      if (latest && latest[dataKey] !== undefined) {
        setValue(unwrapValue(latest[dataKey]));
      }
    } catch (err) {
      console.error('Failed to load scada symbol data:', err);
    }
  };

  useEffect(() => { loadData(); }, [widget.id]);

  const latest = useDeviceRealtime(deviceId, dataKey ? [dataKey] : []);
  useEffect(() => {
    if (!latest || Object.keys(latest).length === 0) return;
    if (dataKey && latest[dataKey] !== undefined) {
      setValue(unwrapValue(latest[dataKey]));
    }
  }, [latest]);

  const isOn = value === 1 || value === '1' || value === true || value === 'ON';

  const handleClick = async () => {
    if (symbolType === 'sensor') return;
    const cmd = isOn ? '0' : '1';
    try {
      await fetch(`/api/devices/${deviceId}/command`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ command: cmd, pin: dataKey }),
      });
    } catch (err) {
      console.error('Failed to send command:', err);
    }
  };

  const iconColor = symbolType === 'sensor' ? '#38bdf8' : (isOn ? '#22c55e' : '#475569');
  const label = widget.cau_hinh?.label || dataKey;

  const renderSymbol = () => {
    switch (symbolType) {
      case 'light':
        return (
          <svg viewBox="0 0 24 24" width="64" height="64" fill="none" stroke={iconColor} strokeWidth="1.5">
            <path d="M9 18h6M10 22h4M12 2a7 7 0 0 1 4 12.9V17H8v-2.1A7 7 0 0 1 12 2z"
              fill={isOn ? '#facc15' : 'none'} opacity={isOn ? 0.3 : 1}/>
            {isOn && <path d="M9 18h6M10 22h4M12 2a7 7 0 0 1 4 12.9V17H8v-2.1A7 7 0 0 1 12 2z" stroke="#facc15"/>}
          </svg>
        );
      case 'ac':
        return (
          <svg viewBox="0 0 24 24" width="64" height="64" fill="none" stroke={iconColor} strokeWidth="1.5">
            <rect x="3" y="5" width="18" height="12" rx="2"/>
            <path d="M6 11h3M10 11h3M14 11h2" strokeLinecap="round"/>
            <path d="M3 9h18" strokeLinecap="round" opacity="0.5"/>
            {value !== null && (
              <text x="12" y="20" textAnchor="middle" fontSize="5" fill={iconColor} fontFamily="monospace">{value}°</text>
            )}
          </svg>
        );
      case 'sensor':
      default:
        return (
          <svg viewBox="0 0 24 24" width="64" height="64" fill="none" stroke={iconColor} strokeWidth="1.5">
            <circle cx="12" cy="12" r="5"/>
            <line x1="12" y1="2" x2="12" y2="5"/>
            <line x1="12" y1="19" x2="12" y2="22"/>
            <line x1="2" y1="12" x2="5" y2="12"/>
            <line x1="19" y1="12" x2="22" y2="12"/>
            <line x1="4.9" y1="4.9" x2="7" y2="7"/>
            <line x1="17" y1="17" x2="19.1" y2="19.1"/>
            <line x1="4.9" y1="19.1" x2="7" y2="17"/>
            <line x1="17" y1="7" x2="19.1" y2="4.9"/>
          </svg>
        );
    }
  };

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      height: '100%', cursor: symbolType === 'sensor' ? 'default' : 'pointer',
    }} onClick={handleClick}>
      {widget.ten_widget && (
        <div style={{ color: 'var(--bdu-text)', fontSize: '12px', marginBottom: '8px', textAlign: 'center' }}>
          {widget.ten_widget}
        </div>
      )}
      {renderSymbol()}
      <div style={{ color: iconColor, fontSize: '11px', marginTop: '6px', fontFamily: 'monospace' }}>
        {value !== null ? String(value) : '—'}
      </div>
      <div style={{ color: 'var(--bdu-muted)', fontSize: '10px', marginTop: '2px' }}>{label}</div>
    </div>
  );
}

export default function WidgetRenderer({ widget, token, dashboardId, isPreview }) {
  // Preview mode (build/edit): khong fetch, khong realtime, render placeholder
  if (isPreview) {
    return (
      <div style={{
        width: '100%', height: '100%', display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', color: 'var(--bdu-muted)',
        fontSize: '11px', textAlign: 'center', padding: '8px'
      }}>
        <div style={{ fontSize: '10px', color: 'var(--bdu-cyan)', marginBottom: '4px', fontWeight: 600 }}>
          {widget.widget_type}
        </div>
        <div style={{ opacity: 0.6 }}>Preview</div>
      </div>
    );
  }

  const renderWidget = () => {
    const style = {
      width: '100%',
      height: '100%',
      borderRadius: '8px',
      padding: '8px'
    };

    switch (widget.widget_type) {
      // Existing widgets
      case 'line_chart':
        return <div style={style} className="db-widget-wrap"><LineChartWidget widget={widget} token={token} dashboardId={dashboardId} /></div>;
      case 'area_chart':
        return <div style={style} className="db-widget-wrap"><AreaChartWidget widget={widget} token={token} dashboardId={dashboardId} /></div>;
      case 'bar_chart':
        return <div style={style} className="db-widget-wrap"><BarChartWidget widget={widget} token={token} dashboardId={dashboardId} /></div>;
      case 'gauge':
        return <div style={style} className="db-widget-wrap"><GaugeWidget widget={widget} token={token} dashboardId={dashboardId} /></div>;
      case 'stat_card':
        return <div style={style} className="db-widget-wrap"><StatCardWidget widget={widget} token={token} dashboardId={dashboardId} /></div>;
      case 'scada_symbol':
        return <div style={style} className="db-widget-wrap"><ScadaSymbolWidget widget={widget} token={token} dashboardId={dashboardId} /></div>;
      case 'pie_chart':
        return <div style={style} className="db-widget-wrap"><PieChartWidget widget={widget} token={token} dashboardId={dashboardId} /></div>;
      case 'scatter_plot':
        return <div style={style} className="db-widget-wrap"><ScatterPlotWidget widget={widget} token={token} dashboardId={dashboardId} /></div>;
      case 'heatmap':
        return <div style={style} className="db-widget-wrap"><HeatmapWidget widget={widget} token={token} dashboardId={dashboardId} /></div>;
      case 'event_timeline':
        return <div style={style} className="db-widget-wrap"><EventTimelineWidget widget={widget} token={token} dashboardId={dashboardId} /></div>;
      case 'multi_axis_line':
        return <div style={style} className="db-widget-wrap"><MultiAxisLineWidget widget={widget} token={token} dashboardId={dashboardId} /></div>;
      case 'relay_button':
        return <div style={style} className="db-widget-wrap"><RelayButtonWidget widget={widget} token={token} dashboardId={dashboardId} /></div>;

      // === Blynk-style Control Widgets ===
      case 'joystick':
        return <div style={style} className="db-widget-wrap"><JoystickWidget widget={widget} token={token} dashboardId={dashboardId} /></div>;
      case 'rgb_control':
        return <div style={style} className="db-widget-wrap"><RGBControlWidget widget={widget} token={token} dashboardId={dashboardId} /></div>;
      case 'segmented_switch':
        return <div style={style} className="db-widget-wrap"><SegmentedSwitchWidget widget={widget} token={token} dashboardId={dashboardId} /></div>;
      case 'numeric_input':
        return <div style={style} className="db-widget-wrap"><NumericInputWidget widget={widget} token={token} dashboardId={dashboardId} /></div>;
      case 'dropdown_menu':
        return <div style={style} className="db-widget-wrap"><DropdownMenuWidget widget={widget} token={token} dashboardId={dashboardId} /></div>;
      case 'text_input':
        return <div style={style} className="db-widget-wrap"><TextInputWidget widget={widget} token={token} dashboardId={dashboardId} /></div>;

      // === Blynk-style Display Widgets ===
      case 'lcd_display':
        return <div style={style} className="db-widget-wrap"><LCDDisplayWidget widget={widget} token={token} dashboardId={dashboardId} /></div>;
      case 'led_indicator':
        return <div style={style} className="db-widget-wrap"><LEDIndicatorWidget widget={widget} token={token} dashboardId={dashboardId} /></div>;
      case 'level_display':
        return <div style={style} className="db-widget-wrap"><LevelDisplayWidget widget={widget} token={token} dashboardId={dashboardId} /></div>;
      case 'gradient_ramp':
        return <div style={style} className="db-widget-wrap"><GradientRampWidget widget={widget} token={token} dashboardId={dashboardId} /></div>;

      // === Blynk-style Media Widgets ===
      case 'video_stream':
        return <div style={style} className="db-widget-wrap"><VideoStreamWidget widget={widget} token={token} dashboardId={dashboardId} /></div>;
      case 'image_gallery':
        return <div style={style} className="db-widget-wrap"><ImageGalleryWidget widget={widget} token={token} dashboardId={dashboardId} /></div>;

      // === Blynk-style Map Widget ===
      case 'map_widget':
        return <div style={style} className="db-widget-wrap"><MapWidget widget={widget} token={token} dashboardId={dashboardId} /></div>;

      default:
        return <div style={style} className="db-widget-wrap">Unknown widget type: {widget.widget_type}</div>;
    }
  };

  return renderWidget();
}

// ---- ScatterPlotWidget ----
export function ScatterPlotWidget({ widget, token, dashboardId }) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const xKey = widget.cau_hinh?.x_key;
  const yKey = widget.cau_hinh?.y_key;
  const [timeRange, setTimeRange] = useState(widget.cau_hinh?.time_range || '1h');

  const loadData = async () => {
    try {
      const res = await fetchWidgetData(dashboardId, widget.id, timeRange, widget.id.toString().startsWith('temp-') ? widget.cau_hinh : null, token);
      const pts = (res.data.data || [])
        .filter(d => d[xKey] != null && d[yKey] != null)
        .map(d => ({
          x: parseFloat(d[xKey]),
          y: parseFloat(d[yKey]),
          t: new Date(d.timestamp * 1000).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
        }));
      setData(pts);
    } catch (err) { console.error('ScatterPlot load err', err); } finally { setLoading(false); }
  };
  useEffect(() => { loadData(); const i = setInterval(loadData, 30000); return () => clearInterval(i); }, [widget.id, timeRange]);

  if (loading) return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--bdu-muted)' }}>Đang tải...</div>;
  if (!xKey || !yKey) return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--bdu-muted)', fontSize: 12 }}>⚠️ Chưa cấu hình X/Y key</div>;

  const xs = data.map(d => d.x), ys = data.map(d => d.y);
  const minX = xs.length ? Math.min(...xs) : 0, maxX = xs.length ? Math.max(...xs) : 1;
  const minY = ys.length ? Math.min(...ys) : 0, maxY = ys.length ? Math.max(...ys) : 1;
  const px = x => 8 + ((x - minX) / ((maxX - minX) || 1)) * 84;
  const py = y => 78 - ((y - minY) / ((maxY - minY) || 1)) * 68;

  return (
    <div style={{ width: '100%', height: '100%', padding: '12px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
        {widget.ten_widget && <h4 style={{ color: 'var(--bdu-text)', margin: '0', fontSize: 14 }}>{widget.ten_widget}</h4>}
        <select
          value={timeRange}
          onChange={(e) => setTimeRange(e.target.value)}
          className="widget-time-range-select"
          style={{ flexShrink: 0 }}
        >
          <option value="1h">1h</option>
          <option value="6h">6h</option>
          <option value="24h">24h</option>
          <option value="7d">7d</option>
          <option value="30d">30d</option>
        </select>
      </div>
      <div style={{ fontSize: 11, color: 'var(--bdu-muted)', marginBottom: 4 }}>{xKey} (X) vs {yKey} (Y) — {data.length} điểm</div>
      {data.length === 0 ? (
        <div style={{ textAlign: 'center', color: 'var(--bdu-muted)', fontSize: 12, marginTop: 20 }}>Chưa có dữ liệu</div>
      ) : (
        <svg viewBox="0 0 100 88" style={{ width: '100%', height: 'calc(100% - 44px)' }}>
          <line x1="8" y1="10" x2="8" y2="78" stroke="#1f2a44" strokeWidth="0.5"/>
          <line x1="8" y1="78" x2="92" y2="78" stroke="#1f2a44" strokeWidth="0.5"/>
          {data.map((d, i) => (
            <circle key={i} cx={px(d.x)} cy={py(d.y)} r="1.8" fill="#22d3ee" opacity="0.75">
              <title>{`${xKey}: ${d.x}, ${yKey}: ${d.y} @ ${d.t}`}</title>
            </circle>
          ))}
          <text x="8" y="85" fontSize="4" fill="#64748b">{minX.toFixed(1)}</text>
          <text x="85" y="85" fontSize="4" fill="#64748b">{maxX.toFixed(1)}</text>
        </svg>
      )}
    </div>
  );
}

// ---- HeatmapWidget ----
export function HeatmapWidget({ widget, token, dashboardId }) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const dataKey = widget.cau_hinh?.data_keys?.[0];
  const timeRange = widget.cau_hinh?.time_range || '24h';

  const loadData = async () => {
    try {
      const res = await fetchWidgetData(dashboardId, widget.id, timeRange, widget.id.toString().startsWith('temp-') ? widget.cau_hinh : null, token);
      const buckets = {};
      (res.data.data || []).forEach(d => {
        const dt = new Date(d.timestamp * 1000);
        const h = dt.getHours();
        const day = dt.toLocaleDateString('vi-VN', { weekday: 'short' });
        const k = `${day}|${h}`;
        if (!buckets[k]) buckets[k] = { day, hour: h, values: [] };
        const val = parseFloat(d[dataKey]);
        if (!isNaN(val)) buckets[k].values.push(val);
      });
      const cells = Object.values(buckets).map(b => ({ ...b, avg: b.values.reduce((s, v) => s + v, 0) / b.values.length }));
      setData(cells);
    } catch (err) { console.error('Heatmap load err', err); } finally { setLoading(false); }
  };
  useEffect(() => { loadData(); const i = setInterval(loadData, 60000); return () => clearInterval(i); }, [widget.id, timeRange]);

  if (loading) return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--bdu-muted)' }}>Đang tải...</div>;

  const vals = data.map(d => d.avg);
  const minV = vals.length ? Math.min(...vals) : 0, maxV = vals.length ? Math.max(...vals) : 1;
  const colorScale = v => {
    const pct = (v - minV) / ((maxV - minV) || 1);
    return `rgb(${Math.round(34 + pct * 205)},${Math.round(211 - pct * 143)},${Math.round(238 - pct * 170)})`;
  };
  const hours = Array.from({ length: 24 }, (_, i) => i);
  const days = [...new Set(data.map(d => d.day))];

  return (
    <div style={{ width: '100%', height: '100%', padding: '12px', overflow: 'auto' }}>
      {widget.ten_widget && <h4 style={{ color: 'var(--bdu-text)', margin: '0 0 8px 0', fontSize: 14 }}>{widget.ten_widget}</h4>}
      {data.length === 0 ? (
        <div style={{ textAlign: 'center', color: 'var(--bdu-muted)', fontSize: 12, marginTop: 20 }}>Chưa có đủ dữ liệu heatmap</div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <div style={{ display: 'grid', gridTemplateColumns: `40px repeat(24, 18px)`, gap: 2, minWidth: 'max-content' }}>
            <div />
            {hours.map(h => <div key={h} style={{ color: 'var(--bdu-muted)', fontSize: 8, textAlign: 'center' }}>{h}</div>)}
            {days.map(day => (
              <React.Fragment key={day}>
                <div style={{ color: 'var(--bdu-muted)', fontSize: 9, display: 'flex', alignItems: 'center' }}>{day}</div>
                {hours.map(h => {
                  const cell = data.find(d => d.day === day && d.hour === h);
                  return <div key={h} style={{ width: 18, height: 16, background: cell ? colorScale(cell.avg) : '#1f2a44', borderRadius: 2 }} title={cell ? `${cell.avg.toFixed(1)}` : 'N/A'} />;
                })}
              </React.Fragment>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ---- EventTimelineWidget ----
export function EventTimelineWidget({ widget, token, dashboardId }) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const statusKey = widget.cau_hinh?.data_keys?.[0] || 'state';
  const timeRange = widget.cau_hinh?.time_range || '6h';
  const STATUS_COLORS = { ON: '#22c55e', OFF: '#4b5563', ERROR: '#ef4444', ALARM: '#f59e0b', WARNING: '#f59e0b', RUNNING: '#22c55e', STOPPED: '#4b5563', MAINTENANCE: '#8b5cf6' };

  const loadData = async () => {
    try {
      const res = await fetchWidgetData(dashboardId, widget.id, timeRange, widget.id.toString().startsWith('temp-') ? widget.cau_hinh : null, token);
      const events = (res.data.data || [])
        .map(d => ({ t: d.timestamp, ts: new Date(d.timestamp * 1000).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }), status: String(d[statusKey] || 'OFF').toUpperCase() }))
        .sort((a, b) => a.t - b.t);
      setData(events);
    } catch (err) { console.error('EventTimeline load err', err); } finally { setLoading(false); }
  };
  useEffect(() => { loadData(); const i = setInterval(loadData, 15000); return () => clearInterval(i); }, [widget.id, timeRange]);

  if (loading) return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--bdu-muted)' }}>Đang tải...</div>;

  if (data.length === 0) return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--bdu-muted)', fontSize: 12 }}>
      {widget.ten_widget && <h4 style={{ color: 'var(--bdu-text)', margin: '0 0 8px 0' }}>{widget.ten_widget}</h4>}
      Chưa có event nào
    </div>
  );

  const minT = data[0].t, maxT = data[data.length - 1].t, range = maxT - minT || 1;
  const pxOf = t => ((t - minT) / range) * 100;

  return (
    <div style={{ width: '100%', height: '100%', padding: '12px' }}>
      {widget.ten_widget && <h4 style={{ color: 'var(--bdu-text)', margin: '0 0 8px 0', fontSize: 14 }}>{widget.ten_widget}</h4>}
      <div style={{ position: 'relative', height: '36px', background: 'var(--bdu-card-hover)', borderRadius: 4, border: '1px solid var(--bdu-card-border)', overflow: 'hidden' }}>
        {data.map((evt, i) => {
          const nextT = data[i + 1]?.t || maxT;
          const left = pxOf(evt.t), width = Math.max(0.3, pxOf(nextT) - left);
          return <div key={i} title={`${evt.ts}: ${evt.status}`} style={{ position: 'absolute', left: `${left}%`, width: `${width}%`, top: 4, height: 28, background: STATUS_COLORS[evt.status] || '#64748b', opacity: 0.85 }} />;
        })}
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 6 }}>
        {[...new Set(data.map(d => d.status))].map(s => (
          <span key={s} style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 10, color: 'var(--bdu-muted)' }}>
            <span style={{ width: 8, height: 8, background: STATUS_COLORS[s] || '#64748b', display: 'inline-block', borderRadius: 2 }} />{s}
          </span>
        ))}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4, fontSize: 9, color: 'var(--bdu-muted)' }}>
        <span>{data[0].ts}</span><span>{data[data.length - 1].ts}</span>
      </div>
    </div>
  );
}

// ---- MultiAxisLineWidget ----
export function MultiAxisLineWidget({ widget, token, dashboardId }) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const dataKeys = widget.cau_hinh?.data_keys || [];
  const timeRange = widget.cau_hinh?.time_range || '1h';

  const loadData = async () => {
    try {
      const res = await fetchWidgetData(dashboardId, widget.id, timeRange, widget.id.toString().startsWith('temp-') ? widget.cau_hinh : null, token);
      const chartData = (res.data.data || [])
        .map(item => ({ ...item, timestamp: new Date(item.timestamp * 1000).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }), timestampValue: item.timestamp }))
        .sort((a, b) => a.timestampValue - b.timestampValue);
      setData(chartData);
    } catch (err) { console.error('MultiAxisLine load err', err); } finally { setLoading(false); }
  };
  useEffect(() => { loadData(); const i = setInterval(loadData, 30000); return () => clearInterval(i); }, [widget.id, timeRange]);

  if (loading) return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--bdu-muted)' }}>Đang tải...</div>;

  return (
    <div style={{ width: '100%', height: '100%', padding: '12px' }}>
      {widget.ten_widget && <h4 style={{ color: 'var(--bdu-text)', margin: '0 0 12px 0', fontSize: 14 }}>{widget.ten_widget}</h4>}
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1f2a44" />
          <XAxis dataKey="timestamp" stroke="#64748b" tick={{ fontSize: 10 }} type="category" allowDuplicatedCategory={false} />
          {dataKeys.map((key, idx) => (
            <YAxis key={`y-${key}`} yAxisId={idx} orientation={idx % 2 === 0 ? 'left' : 'right'} stroke={COLORS[idx % COLORS.length]} tick={{ fontSize: 9 }} width={32} />
          ))}
          <Tooltip contentStyle={{ backgroundColor: 'var(--bdu-card)', border: '1px solid var(--bdu-card-border)', color: 'var(--bdu-text)' }} />
          <Legend />
          {dataKeys.map((key, idx) => (
            <Line key={key} yAxisId={idx} type="monotone" dataKey={key} stroke={COLORS[idx % COLORS.length]} dot={false} strokeWidth={2} name={key} />
          ))}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

// ---- RelayButtonWidget ----
export function RelayButtonWidget({ widget, token, dashboardId }) {
  const [relayState, setRelayState] = useState('OFF');
  const [loading, setLoading] = useState(true);
  const [controlling, setControlling] = useState(false);
  const deviceId = widget.cau_hinh?.device_id;
  const relayNumber = widget.cau_hinh?.relay_number || 1;

  const loadData = async () => {
    if (!deviceId) { setLoading(false); return; }
    try {
      const res = await fetchWidgetData(dashboardId, widget.id, '1h', widget.id.toString().startsWith('temp-') ? widget.cau_hinh : null, token);
      const latest = res.data.data?.[res.data.data.length - 1];
      if (latest) {
        // Tìm relay theo nhiều pattern
        let raw = latest[`relay_${relayNumber}`] ?? latest[`relay${relayNumber}`];

        // Nếu không tìm thấy, tìm các key bắt đầu bằng relay_N_
        if (raw == null) {
          const relayPrefix = `relay_${relayNumber}_`;
          const matchedKey = Object.keys(latest).find(k => k.startsWith(relayPrefix));
          if (matchedKey) {
            raw = latest[matchedKey];
          }
        }

        if (raw != null) setRelayState(['1', 'true', 'on'].includes(String(raw).toLowerCase()) ? 'ON' : 'OFF');
      }
    } catch (err) { console.error('RelayButton load', err); } finally { setLoading(false); }
  };
  useEffect(() => { loadData(); const i = setInterval(loadData, 5000); return () => clearInterval(i); }, [widget.id, deviceId, relayNumber]);

  // WebSocket realtime
  useEffect(() => {
    if (!deviceId || !token) return;
    let ws = null;
    const connect = () => {
      try {
        ws = new WebSocket(WS_URL);
        ws.onmessage = (event) => {
          try {
            const d = JSON.parse(event.data);
            if (d.device_id !== deviceId) return;

            // Tìm relay theo nhiều pattern: relay_1, relay1, relay_1_pump, relay_1_light, ...
            let raw = d[`relay_${relayNumber}`] ?? d[`relay${relayNumber}`];

            // Nếu không tìm thấy, tìm các key bắt đầu bằng relay_N_
            if (raw == null) {
              const relayPrefix = `relay_${relayNumber}_`;
              const matchedKey = Object.keys(d).find(k => k.startsWith(relayPrefix));
              if (matchedKey) {
                raw = d[matchedKey];
              }
            }

            if (raw != null) setRelayState(['1', 'true', 'on'].includes(String(raw).toLowerCase()) ? 'ON' : 'OFF');
          } catch (e) {}
        };
        ws.onclose = () => setTimeout(connect, 3000);
      } catch (e) {}
    };
    connect();
    return () => { if (ws) try { ws.close(); } catch (e) {} };
  }, [deviceId, token, relayNumber]);

  const handleToggle = async () => {
    if (!deviceId || controlling) return;
    setControlling(true);
    const nextState = relayState === 'ON' ? 'OFF' : 'ON';
    setRelayState(nextState); // optimistic
    try {
      await controlRelay(deviceId, relayNumber, nextState, token);
    } catch (err) {
      console.error('Relay toggle failed', err);
      setRelayState(relayState); // rollback
    } finally { setControlling(false); }
  };

  const isOn = relayState === 'ON';
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', padding: '16px', gap: '8px' }}>
      {widget.ten_widget && <h4 style={{ color: 'var(--bdu-text)', margin: 0, fontSize: 13, textAlign: 'center' }}>{widget.ten_widget}</h4>}
      <div style={{ fontSize: 10, color: 'var(--bdu-muted)' }}>Relay {relayNumber}</div>
      <button
        onClick={handleToggle}
        disabled={controlling || loading}
        style={{
          display: 'flex', alignItems: 'center',
          width: '60px', height: '32px', borderRadius: '16px',
          background: isOn ? '#22c55e' : '#374151',
          border: 'none',
          padding: '4px',
          cursor: controlling ? 'not-allowed' : 'pointer',
          transition: 'all 0.3s',
          boxShadow: isOn ? '0 0 12px rgba(34,197,94,0.5)' : 'none',
          outline: 'none',
          boxSizing: 'border-box'
        }}
        title={`Click để ${isOn ? 'tắt' : 'bật'} relay ${relayNumber}`}
      >
        <div style={{
          width: '24px', height: '24px', borderRadius: '50%', background: 'white',
          transition: 'all 0.3s', boxShadow: '0 1px 4px rgba(0,0,0,0.4)',
          transform: isOn ? 'translateX(28px)' : 'translateX(0)'
        }} />
      </button>
      <div style={{ fontSize: 12, fontWeight: 600, color: isOn ? '#22c55e' : '#64748b' }}>{isOn ? '● BẬT' : '○ TẮT'}</div>
      {controlling && <div style={{ fontSize: 10, color: 'var(--bdu-muted)' }}>Đang gửi...</div>}
    </div>
  );
}

// ==================== BLYNK-STYLE WIDGETS ====================

// ---- JoystickWidget ----
export function JoystickWidget({ widget, token, dashboardId }) {
  const [position, setPosition] = useState({ x: 50, y: 50 });
  const [isDragging, setIsDragging] = useState(false);
  const containerRef = useRef(null);
  const deviceId = widget.cau_hinh?.device_id;
  const xDataKey = widget.cau_hinh?.x_datakey || 'joystick_x';
  const yDataKey = widget.cau_hinh?.y_datakey || 'joystick_y';

  const handleMouseDown = (e) => {
    setIsDragging(true);
    updatePosition(e);
  };

  const updatePosition = (e) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100));
    const y = Math.max(0, Math.min(100, ((e.clientY - rect.top) / rect.height) * 100));
    setPosition({ x, y });
  };

  const handleMouseMove = (e) => {
    if (!isDragging) return;
    updatePosition(e);
  };

  const handleMouseUp = async () => {
    if (!isDragging) return;
    setIsDragging(false);
    // Gửi giá trị về server nếu có device_id
    if (deviceId) {
      try {
        await fetch(`${API_BASE}/api/device/${deviceId}/control`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({ [xDataKey]: position.x, [yDataKey]: position.y })
        });
      } catch (err) {
        console.error('Joystick control error:', err);
      }
    }
  };

  useEffect(() => {
    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      return () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isDragging, position]);

  return (
    <div style={{ width: '100%', height: '100%', padding: '12px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
      {widget.ten_widget && <h4 style={{ color: 'var(--bdu-text)', margin: '0 0 8px 0', fontSize: '14px' }}>{widget.ten_widget}</h4>}
      <div
        ref={containerRef}
        onMouseDown={handleMouseDown}
        style={{
          width: '100%',
          maxWidth: '160px',
          aspectRatio: '1',
          borderRadius: '50%',
          background: 'radial-gradient(circle, #1a2332 0%, #0b1224 100%)',
          border: '2px solid #1f2a44',
          position: 'relative',
          cursor: isDragging ? 'grabbing' : 'grab',
          boxShadow: isDragging ? '0 0 20px rgba(34, 211, 238, 0.3)' : 'none',
          transition: 'box-shadow 0.2s'
        }}
      >
        {/* Grid lines */}
        <div style={{ position: 'absolute', top: '50%', left: '10%', right: '10%', height: '1px', background: 'var(--bdu-card-border)' }} />
        <div style={{ position: 'absolute', left: '50%', top: '10%', bottom: '10%', width: '1px', background: 'var(--bdu-card-border)' }} />

        {/* Knob */}
        <div style={{
          position: 'absolute',
          left: `calc(${position.x}% - 20px)`,
          top: `calc(${position.y}% - 20px)`,
          width: '40px',
          height: '40px',
          borderRadius: '50%',
          background: 'linear-gradient(145deg, #22d3ee, #0ea5e9)',
          boxShadow: '0 2px 10px rgba(34, 211, 238, 0.5)',
          cursor: 'grab'
        }}>
          <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: '12px', height: '12px', borderRadius: '50%', background: 'white', opacity: 0.6 }} />
        </div>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', maxWidth: '160px', marginTop: '8px', fontSize: '11px', color: 'var(--bdu-muted)' }}>
        <span>X: {position.x.toFixed(0)}</span>
        <span>Y: {position.y.toFixed(0)}</span>
      </div>
    </div>
  );
}

// ---- RGBControlWidget ----
export function RGBControlWidget({ widget, token, dashboardId }) {
  const [color, setColor] = useState({ r: 255, g: 0, b: 0 });
  const [brightness, setBrightness] = useState(100);
  const deviceId = widget.cau_hinh?.device_id;
  const colorDataKey = widget.cau_hinh?.color_datakey || 'rgb_color';
  const brightnessDataKey = widget.cau_hinh?.brightness_datakey || 'rgb_brightness';

  const presets = widget.cau_hinh?.presets || [
    { name: 'Đỏ', r: 255, g: 0, b: 0 },
    { name: 'Xanh lá', r: 0, g: 255, b: 0 },
    { name: 'Xanh dương', r: 0, g: 0, b: 255 },
    { name: 'Trắng', r: 255, g: 255, b: 255 },
    { name: 'Vàng', r: 255, g: 255, b: 0 },
    { name: 'Tím', r: 128, g: 0, b: 128 },
  ];

  const handleColorChange = async (newColor) => {
    setColor(newColor);
    if (deviceId) {
      try {
        await fetch(`${API_BASE}/api/device/${deviceId}/control`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({ [colorDataKey]: `${newColor.r},${newColor.g},${newColor.b}`, [brightnessDataKey]: brightness })
        });
      } catch (err) {
        console.error('RGB control error:', err);
      }
    }
  };

  const handleBrightnessChange = async (newBrightness) => {
    setBrightness(newBrightness);
    if (deviceId) {
      try {
        await fetch(`${API_BASE}/api/device/${deviceId}/control`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({ [brightnessDataKey]: newBrightness })
        });
      } catch (err) {
        console.error('RGB brightness error:', err);
      }
    }
  };

  const rgbString = `rgb(${color.r}, ${color.g}, ${color.b})`;

  return (
    <div style={{ width: '100%', height: '100%', padding: '12px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
      {widget.ten_widget && <h4 style={{ color: 'var(--bdu-text)', margin: 0, fontSize: '14px' }}>{widget.ten_widget}</h4>}

      {/* Color preview */}
      <div style={{
        width: '100%',
        height: '60px',
        borderRadius: '8px',
        background: rgbString,
        filter: `brightness(${brightness}%)`,
        boxShadow: `0 0 20px ${rgbString}`,
        border: '2px solid rgba(255,255,255,0.1)'
      }} />

      {/* Color picker */}
      <div>
        <label style={{ color: 'var(--bdu-muted)', fontSize: '11px', marginBottom: '4px', display: 'block' }}>Màu sắc</label>
        <input
          type="color"
          value={`#${color.r.toString(16).padStart(2, '0')}${color.g.toString(16).padStart(2, '0')}${color.b.toString(16).padStart(2, '0')}`}
          onChange={(e) => {
            const hex = e.target.value.slice(1);
            setColor({
              r: parseInt(hex.slice(0, 2), 16),
              g: parseInt(hex.slice(2, 4), 16),
              b: parseInt(hex.slice(4, 6), 16)
            });
          }}
          onBlur={(e) => {
            const hex = e.target.value.slice(1);
            handleColorChange({
              r: parseInt(hex.slice(0, 2), 16),
              g: parseInt(hex.slice(2, 4), 16),
              b: parseInt(hex.slice(4, 6), 16)
            });
          }}
          style={{ width: '100%', height: '32px', cursor: 'pointer', border: 'none', background: 'transparent' }}
        />
      </div>

      {/* Brightness slider */}
      <div>
        <label style={{ color: 'var(--bdu-muted)', fontSize: '11px', marginBottom: '4px', display: 'block' }}>
          Độ sáng: {brightness}%
        </label>
        <input
          type="range"
          min="0"
          max="100"
          value={brightness}
          onChange={(e) => setBrightness(parseInt(e.target.value))}
          onMouseUp={(e) => handleBrightnessChange(parseInt(e.target.value))}
          style={{ width: '100%', cursor: 'pointer' }}
        />
      </div>

      {/* Presets */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
        {presets.map((preset) => (
          <button
            key={preset.name}
            onClick={() => handleColorChange(preset)}
            title={preset.name}
            style={{
              width: '28px',
              height: '28px',
              borderRadius: '50%',
              background: `rgb(${preset.r}, ${preset.g}, ${preset.b})`,
              border: color.r === preset.r && color.g === preset.g && color.b === preset.b ? '2px solid white' : '2px solid transparent',
              cursor: 'pointer',
              boxShadow: `0 0 8px rgba(${preset.r}, ${preset.g}, ${preset.b}, 0.5)`
            }}
          />
        ))}
      </div>
    </div>
  );
}

// ---- LCDDisplayWidget ----
export function LCDDisplayWidget({ widget, token, dashboardId }) {
  const [lines, setLines] = useState(['Line 1', 'Line 2']);
  const deviceId = widget.cau_hinh?.device_id;
  const dataKey = widget.cau_hinh?.data_keys?.[0] || 'lcd_text';
  const lineCount = widget.cau_hinh?.line_count || 2;
  const [timeRange, setTimeRange] = useState(widget.cau_hinh?.time_range || '1h');

  useEffect(() => {
    // Load data periodically
    const loadData = async () => {
      if (!deviceId) return;
      try {
        const res = await fetchWidgetData(dashboardId, widget.id, timeRange, null, token);
        const latest = res.data.data?.[res.data.data.length - 1];
        if (latest && latest[dataKey]) {
          const text = String(latest[dataKey]);
          setLines(text.split('|').slice(0, lineCount));
        }
      } catch (err) {
        console.error('LCD load error:', err);
      }
    };
    loadData();
    const interval = setInterval(loadData, 5000);
    return () => clearInterval(interval);
  }, [deviceId, dataKey, lineCount, timeRange]);

  const bgColor = widget.cau_hinh?.bg_color || '#1a3a2a';
  const textColor = widget.cau_hinh?.text_color || '#00ff88';

  return (
    <div style={{ width: '100%', height: '100%', padding: '12px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', marginBottom: '8px' }}>
        {widget.ten_widget && <h4 style={{ color: 'var(--bdu-text)', margin: '0', fontSize: '14px' }}>{widget.ten_widget}</h4>}
        <select
          value={timeRange}
          onChange={(e) => setTimeRange(e.target.value)}
          className="widget-time-range-select"
          style={{ flexShrink: 0 }}
        >
          <option value="1h">1h</option>
          <option value="6h">6h</option>
          <option value="24h">24h</option>
          <option value="7d">7d</option>
          <option value="30d">30d</option>
        </select>
      </div>
      <div style={{
        width: '100%',
        maxWidth: '280px',
        background: bgColor,
        borderRadius: '8px',
        padding: '12px',
        border: '3px solid #2a4a3a',
        boxShadow: 'inset 0 0 20px rgba(0,0,0,0.3), 0 4px 12px rgba(0,0,0,0.3)'
      }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          {Array.from({ length: lineCount }).map((_, i) => (
            <div key={i} style={{
              fontFamily: 'monospace',
              fontSize: lineCount > 2 ? '12px' : '16px',
              color: textColor,
              letterSpacing: '1px',
              textShadow: `0 0 5px ${textColor}`,
              padding: '2px 4px',
              background: 'rgba(0,0,0,0.2)',
              borderRadius: '2px',
              minHeight: lineCount > 2 ? '18px' : '24px'
            }}>
              {lines[i] || ''}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ---- LEDIndicatorWidget ----
export function LEDIndicatorWidget({ widget, token, dashboardId }) {
  const [isOn, setIsOn] = useState(false);
  const deviceId = widget.cau_hinh?.device_id;
  const dataKey = widget.cau_hinh?.data_keys?.[0] || 'led_state';
  const [timeRange, setTimeRange] = useState(widget.cau_hinh?.time_range || '1h');

  useEffect(() => {
    const loadData = async () => {
      if (!deviceId) return;
      try {
        const res = await fetchWidgetData(dashboardId, widget.id, timeRange, null, token);
        const latest = res.data.data?.[res.data.data.length - 1];
        if (latest && dataKey in latest) {
          const val = String(latest[dataKey]).toLowerCase();
          setIsOn(['1', 'true', 'on', 'active', 'running'].includes(val));
        }
      } catch (err) {
        console.error('LED load error:', err);
      }
    };
    loadData();
    const interval = setInterval(loadData, 3000);
    return () => clearInterval(interval);
  }, [deviceId, dataKey, timeRange]);

  const ledColor = widget.cau_hinh?.color || '#22c55e';

  return (
    <div style={{ width: '100%', height: '100%', padding: '12px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', marginBottom: '8px' }}>
        {widget.ten_widget && <h4 style={{ color: 'var(--bdu-text)', margin: '0', fontSize: '14px' }}>{widget.ten_widget}</h4>}
        <select
          value={timeRange}
          onChange={(e) => setTimeRange(e.target.value)}
          className="widget-time-range-select"
          style={{ flexShrink: 0 }}
        >
          <option value="1h">1h</option>
          <option value="6h">6h</option>
          <option value="24h">24h</option>
          <option value="7d">7d</option>
          <option value="30d">30d</option>
        </select>
      </div>
      <div style={{
        width: '48px',
        height: '48px',
        borderRadius: '50%',
        background: isOn ? ledColor : '#1f2a44',
        boxShadow: isOn ? `0 0 20px ${ledColor}, 0 0 40px ${ledColor}` : 'none',
        border: `3px solid ${isOn ? ledColor : '#374151'}`,
        transition: 'all 0.3s'
      }}>
        {isOn && (
          <div style={{
            width: '20px',
            height: '20px',
            borderRadius: '50%',
            background: 'white',
            opacity: 0.4,
            margin: '6px'
          }} />
        )}
      </div>
      <div style={{ marginTop: '8px', fontSize: '12px', color: isOn ? ledColor : '#64748b', fontWeight: 600 }}>
        {isOn ? 'ON' : 'OFF'}
      </div>
    </div>
  );
}

// ---- LevelDisplayWidget ----
export function LevelDisplayWidget({ widget, token, dashboardId }) {
  const [value, setValue] = useState(50);
  const deviceId = widget.cau_hinh?.device_id;
  const dataKey = widget.cau_hinh?.data_keys?.[0] || 'level';
  const orientation = widget.cau_hinh?.orientation || 'horizontal'; // horizontal or vertical
  const min = widget.cau_hinh?.min || 0;
  const max = widget.cau_hinh?.max || 100;
  const unit = widget.cau_hinh?.unit || '';

  useEffect(() => {
    const loadData = async () => {
      if (!deviceId) return;
      try {
        const res = await fetchWidgetData(dashboardId, widget.id, '1h', null, token);
        const latest = res.data.data?.[res.data.data.length - 1];
        if (latest && dataKey in latest) {
          setValue(parseFloat(latest[dataKey]) || 0);
        }
      } catch (err) {
        console.error('Level load error:', err);
      }
    };
    loadData();
    const interval = setInterval(loadData, 3000);
    return () => clearInterval(interval);
  }, [deviceId, dataKey]);

  const percentage = Math.min(100, Math.max(0, ((value - min) / (max - min)) * 100));

  return (
    <div style={{ width: '100%', height: '100%', padding: '12px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
      {widget.ten_widget && <h4 style={{ color: 'var(--bdu-text)', margin: '0 0 8px 0', fontSize: '14px' }}>{widget.ten_widget}</h4>}

      {orientation === 'horizontal' ? (
        <div style={{ width: '100%' }}>
          <div style={{
            width: '100%',
            height: '24px',
            background: 'var(--bdu-card-border)',
            borderRadius: '12px',
            overflow: 'hidden',
            position: 'relative'
          }}>
            <div style={{
              width: `${percentage}%`,
              height: '100%',
              background: `linear-gradient(90deg, #22d3ee, #8b5cf6)`,
              borderRadius: '12px',
              transition: 'width 0.3s',
              boxShadow: '0 0 10px rgba(34, 211, 238, 0.5)'
            }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '4px', fontSize: '11px', color: 'var(--bdu-muted)' }}>
            <span>{min}{unit}</span>
            <span style={{ fontWeight: 600, color: 'var(--bdu-cyan)' }}>{value?.toFixed(1)}{unit}</span>
            <span>{max}{unit}</span>
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', width: '100%' }}>
          <div style={{
            width: '24px',
            height: '100%',
            maxHeight: '120px',
            background: 'var(--bdu-card-border)',
            borderRadius: '12px',
            overflow: 'hidden',
            position: 'relative',
            flex: 1
          }}>
            <div style={{
              width: '100%',
              height: `${percentage}%`,
              background: `linear-gradient(0deg, #22d3ee, #8b5cf6)`,
              borderRadius: '12px',
              transition: 'height 0.3s',
              position: 'absolute',
              bottom: 0,
              boxShadow: '0 0 10px rgba(34, 211, 238, 0.5)'
            }} />
          </div>
          <div style={{ fontSize: '18px', fontWeight: 600, color: 'var(--bdu-cyan)' }}>
            {value?.toFixed(0)}<span style={{ fontSize: '10px', color: 'var(--bdu-muted)' }}>{unit}</span>
          </div>
        </div>
      )}
    </div>
  );
}

// ---- GradientRampWidget ----
export function GradientRampWidget({ widget, token, dashboardId }) {
  const [value, setValue] = useState(50);
  const deviceId = widget.cau_hinh?.device_id;
  const dataKey = widget.cau_hinh?.data_keys?.[0] || 'temperature';
  const min = widget.cau_hinh?.min || 0;
  const max = widget.cau_hinh?.max || 100;
  const unit = widget.cau_hinh?.unit || '°C';
  const lowColor = widget.cau_hinh?.low_color || '#22d3ee';
  const highColor = widget.cau_hinh?.high_color || '#ef4444';
  const [timeRange, setTimeRange] = useState(widget.cau_hinh?.time_range || '1h');

  useEffect(() => {
    const loadData = async () => {
      if (!deviceId) return;
      try {
        const res = await fetchWidgetData(dashboardId, widget.id, timeRange, null, token);
        const latest = res.data.data?.[res.data.data.length - 1];
        if (latest && dataKey in latest) {
          setValue(parseFloat(latest[dataKey]) || 0);
        }
      } catch (err) {
        console.error('GradientRamp load error:', err);
      }
    };
    loadData();
    const interval = setInterval(loadData, 5000);
    return () => clearInterval(interval);
  }, [deviceId, dataKey, timeRange]);

  const percentage = Math.min(100, Math.max(0, ((value - min) / (max - min)) * 100));

  const getColor = (pct) => {
    const r = Math.round(parseInt(lowColor.slice(1, 3), 16) + (parseInt(highColor.slice(1, 3), 16) - parseInt(lowColor.slice(1, 3), 16)) * pct / 100);
    const g = Math.round(parseInt(lowColor.slice(3, 5), 16) + (parseInt(highColor.slice(3, 5), 16) - parseInt(lowColor.slice(3, 5), 16)) * pct / 100);
    const b = Math.round(parseInt(lowColor.slice(5, 7), 16) + (parseInt(highColor.slice(5, 7), 16) - parseInt(lowColor.slice(5, 7), 16)) * pct / 100);
    return `rgb(${r}, ${g}, ${b})`;
  };

  return (
    <div style={{ width: '100%', height: '100%', padding: '12px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', marginBottom: '8px' }}>
        {widget.ten_widget && <h4 style={{ color: 'var(--bdu-text)', margin: '0', fontSize: '14px' }}>{widget.ten_widget}</h4>}
        <select
          value={timeRange}
          onChange={(e) => setTimeRange(e.target.value)}
          className="widget-time-range-select"
          style={{ flexShrink: 0 }}
        >
          <option value="1h">1h</option>
          <option value="6h">6h</option>
          <option value="24h">24h</option>
          <option value="7d">7d</option>
          <option value="30d">30d</option>
        </select>
      </div>
      <div style={{ width: '100%' }}>
        <div style={{
          width: '100%',
          height: '32px',
          borderRadius: '16px',
          background: `linear-gradient(90deg, ${lowColor}, ${highColor})`,
          position: 'relative',
          boxShadow: '0 0 15px rgba(34, 211, 238, 0.3)'
        }}>
          {/* Indicator */}
          <div style={{
            position: 'absolute',
            left: `calc(${percentage}% - 2px)`,
            top: '-4px',
            width: '4px',
            height: '40px',
            background: 'white',
            borderRadius: '2px',
            boxShadow: '0 0 10px rgba(255,255,255,0.8)'
          }} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '8px', fontSize: '11px', color: 'var(--bdu-muted)' }}>
          <span>{min}{unit}</span>
          <span style={{ fontWeight: 600, fontSize: '14px', color: getColor(percentage) }}>
            {value?.toFixed(1)}{unit}
          </span>
          <span>{max}{unit}</span>
        </div>
      </div>
    </div>
  );
}

// ---- VideoStreamWidget ----
export function VideoStreamWidget({ widget, token, dashboardId }) {
  const [error, setError] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamError, setStreamError] = useState(null);
  // Use ref for fullStreamId to avoid closure issues with React StrictMode
  const fullStreamIdRef = useRef(null); // Backend returns full stream_id with prefix
  const sourceType = widget.cau_hinh?.source_type || 'ip_camera';
  const streamUrl = widget.cau_hinh?.stream_url || '';
  const cameraId = widget.cau_hinh?.camera_id || '';
  const clientDeviceId = widget.cau_hinh?.client_device_id || '';
  const autoplay = widget.cau_hinh?.autoplay !== false;
  const muted = widget.cau_hinh?.muted !== false;
  const isWebcam = sourceType === 'webcam';
  const isClientWebcam = isWebcam && !!clientDeviceId;

  // Generate a unique stream ID for client webcam based on widget
  const getClientStreamId = () => {
    if (!isClientWebcam) return null;
    return `widget_${widget.id || widget.widget_id || 'unknown'}`;
  };

  const clientStreamId = getClientStreamId();

  // Build stream URL based on source type
  const getStreamUrl = () => {
    if (isClientWebcam && clientStreamId) {
      return `/api/webcam/client/${clientStreamId}/stream`;
    }
    if (isWebcam && cameraId) {
      return `/api/webcam/${cameraId}/stream`;
    }
    return streamUrl;
  };

  const activeStreamUrl = getStreamUrl();

  // Check if configured
  const isConfigured = isClientWebcam ? !!clientDeviceId : (isWebcam ? !!cameraId : !!streamUrl);

  // Refs for video element and media stream
  const videoRef = useRef(null);
  const mediaStreamRef = useRef(null);
  const captureIntervalRef = useRef(null);

  // Register and start streaming for client webcam
  useEffect(() => {
    if (!isClientWebcam || !clientStreamId || !token) return;

    let ignore = false;

    const startStreaming = async () => {
      console.log('[Webcam] Starting stream, clientDeviceId:', clientDeviceId, 'streamId:', clientStreamId);
      try {
        // Request camera access
        console.log('[Webcam] Requesting camera access...');
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            deviceId: clientDeviceId ? { exact: clientDeviceId } : undefined,
            width: { ideal: 640 },
            height: { ideal: 480 }
          }
        });
        console.log('[Webcam] Camera access granted!');

        mediaStreamRef.current = stream;

        // Attach stream to video element
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }

        // Register stream with backend
        console.log('[Webcam] Registering with backend...');
        const registerRes = await fetch(`${API_BASE}/webcam/client/register`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({
            stream_id: clientStreamId,
            device_label: 'Browser Camera'
          })
        });

        console.log('[Webcam] Register response status:', registerRes.status);

        // Parse response - handle both success and "already exists" case
        let data;
        try {
          data = await registerRes.json();
        } catch (e) {
          // Non-JSON response
          if (!registerRes.ok) {
            const text = await registerRes.text();
            console.error('[Webcam] Register failed:', text);
            throw new Error('register_failed: ' + text);
          }
          throw new Error('Invalid JSON response');
        }

        // Handle 409 Conflict - stream already exists, use existing stream_id
        if (registerRes.status === 409) {
          console.log('[Webcam] Stream already exists, using existing stream_id:', data.stream_id);
          fullStreamIdRef.current = data.stream_id;
        } else if (!registerRes.ok) {
          console.error('[Webcam] Register failed:', data.detail || data);
          throw new Error('register_failed: ' + JSON.stringify(data));
        } else {
          console.log('[Webcam] Full stream_id from backend:', data.stream_id);
          fullStreamIdRef.current = data.stream_id;
        }

        if (ignore) return;
        setIsStreaming(true);
        setStreamError(null);
        console.log('[Webcam] Streaming started successfully!');

        // Start capturing frames at regular intervals
        captureIntervalRef.current = setInterval(() => {
          captureAndPushFrame();
        }, 100); // ~10 FPS

      } catch (err) {
        console.error('[Webcam] Streaming error:', err);
        let errorMsg = 'Không thể truy cập camera. Vui lòng cho phép truy cập camera.';
        if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
          errorMsg = 'Camera bị từ chối. Vui lòng cho phép truy cập camera trong trình duyệt.';
        } else if (err.name === 'NotFoundError') {
          errorMsg = 'Không tìm thấy camera. Vui lòng kết nối camera.';
        } else if (err.name === 'NotReadableError') {
          errorMsg = 'Camera đang được sử dụng bởi ứng dụng khác.';
        } else if (err.message?.includes('register')) {
          errorMsg = 'Không thể kết nối server. Vui lòng kiểm tra kết nối.';
        }
        setStreamError(errorMsg);
        cleanup();
      }
    };

    const captureAndPushFrame = async () => {
      const video = videoRef.current;
      if (!video || video.readyState < 2) {
        return;
      }
      const streamId = fullStreamIdRef.current || clientStreamId;
      console.log('[Webcam] Capturing frame, streamId:', streamId);

      try {
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth || 640;
        canvas.height = video.videoHeight || 480;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(video, 0, 0);

        canvas.toBlob(async (blob) => {
          if (!blob) return;
          const reader = new FileReader();
          reader.onloadend = async () => {
            const base64 = reader.result.split(',')[1];
            try {
              const res = await fetch(`${API_BASE}/webcam/client/push`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                  stream_id: streamId,
                  frame_data: base64
                })
              });
              if (!res.ok) {
                console.warn('[Webcam] Push failed:', res.status);
              }
            } catch (e) {
              // Silent fail
            }
          };
          reader.readAsDataURL(blob);
        }, 'image/jpeg', 0.8);
      } catch (e) {
        // Silent fail
      }
    };

    const cleanup = async () => {
      console.log('[Webcam] Cleaning up...');
      if (captureIntervalRef.current) {
        clearInterval(captureIntervalRef.current);
        captureIntervalRef.current = null;
      }
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach(t => t.stop());
        mediaStreamRef.current = null;
      }
      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }
      setIsStreaming(false);
      console.log('[Webcam] Cleanup done.');
    };

    startStreaming();

    return () => {
      ignore = true; // Mark as ignored for async operations
      cleanup();
      // Unregister stream - use ref for closure safety
      const streamIdToDelete = fullStreamIdRef.current || clientStreamId;
      if (streamIdToDelete && token) {
        console.log('[Webcam] Unregistering stream:', streamIdToDelete);
        fetch(`${API_BASE}/webcam/client/${streamIdToDelete}`, {
          method: 'DELETE',
          headers: { 'Authorization': `Bearer ${token}` }
        }).catch(() => {});
      }
    };
  }, [isClientWebcam, clientStreamId, clientDeviceId, token]);

  if (!isConfigured) {
    return (
      <div style={{ width: '100%', height: '100%', padding: '12px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        {widget.ten_widget && <h4 style={{ color: 'var(--bdu-text)', margin: '0 0 8px 0', fontSize: '14px' }}>{widget.ten_widget}</h4>}
        <div style={{ color: 'var(--bdu-muted)', fontSize: '12px', textAlign: 'center' }}>
          <div style={{ fontSize: '32px', marginBottom: '8px' }}>📹</div>
          {isWebcam ? 'Chưa chọn camera' : 'Chưa cấu hình URL stream'}
        </div>
      </div>
    );
  }

  return (
    <div style={{ width: '100%', height: '100%', padding: '8px', display: 'flex', flexDirection: 'column' }}>
      {widget.ten_widget && <h4 style={{ color: 'var(--bdu-text)', margin: '0 0 4px 0', fontSize: '14px' }}>{widget.ten_widget}</h4>}
      {/* Hidden video element for capturing frames */}
      {isClientWebcam && (
        <video
          ref={videoRef}
          autoPlay
          muted
          playsInline
          style={{ display: 'none' }}
        />
      )}
      <div style={{ flex: 1, position: 'relative', borderRadius: '8px', overflow: 'hidden', background: '#000' }}>
        {isClientWebcam ? (
          // Client webcam: show local video + fetch from backend stream for others
          <>
            {isStreaming && (
              <div style={{
                position: 'absolute',
                top: '8px',
                left: '8px',
                background: 'rgba(34, 197, 94, 0.9)',
                color: 'white',
                padding: '2px 8px',
                borderRadius: '4px',
                fontSize: '10px',
                zIndex: 10
              }}>
                LIVE
              </div>
            )}
            {streamError ? (
              <div style={{
                width: '100%',
                height: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#ef4444',
                fontSize: '12px',
                textAlign: 'center',
                padding: '12px'
              }}>
                {streamError}
              </div>
            ) : (
              <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {/* Local preview */}
                <video
                  ref={videoRef}
                  autoPlay
                  muted
                  playsInline
                  style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                />
              </div>
            )}
          </>
        ) : isWebcam && cameraId ? (
          // Server-side webcam
          <img
            key={`webcam-${cameraId}`}
            src={activeStreamUrl}
            alt="Webcam Stream"
            style={{ width: '100%', height: '100%', objectFit: 'contain' }}
            onError={() => setError(true)}
          />
        ) : activeStreamUrl.toLowerCase().includes('.m3u8') ? (
          <video
            key={activeStreamUrl}
            style={{ width: '100%', height: '100%', objectFit: 'contain' }}
            autoPlay={autoplay}
            muted={muted}
            controls
            onError={() => setError(true)}
          >
            <source src={activeStreamUrl} type="application/x-mpegURL" />
          </video>
        ) : activeStreamUrl.toLowerCase().includes('.jpg') || activeStreamUrl.toLowerCase().includes('.jpeg') || activeStreamUrl.toLowerCase().includes('.png') ? (
          <img
            src={activeStreamUrl}
            alt="Stream"
            style={{ width: '100%', height: '100%', objectFit: 'contain' }}
            onError={() => setError(true)}
          />
        ) : (
          <img
            key={activeStreamUrl + Date.now()}
            src={`${activeStreamUrl}?t=${Date.now()}`}
            alt="MJPEG Stream"
            style={{ width: '100%', height: '100%', objectFit: 'contain' }}
            onError={() => setError(true)}
          />
        )}
        {error && (
          <div style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(0,0,0,0.8)',
            color: '#ef4444',
            fontSize: '12px'
          }}>
            Khong the ket noi stream
          </div>
        )}
      </div>
    </div>
  );
}

// ---- ImageGalleryWidget ----
export function ImageGalleryWidget({ widget, token, dashboardId }) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const images = widget.cau_hinh?.images || [];
  const interval = widget.cau_hinh?.interval || 5000;

  useEffect(() => {
    if (images.length <= 1) return;
    const timer = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % images.length);
    }, interval);
    return () => clearInterval(timer);
  }, [images.length, interval]);

  if (images.length === 0) {
    return (
      <div style={{ width: '100%', height: '100%', padding: '12px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        {widget.ten_widget && <h4 style={{ color: 'var(--bdu-text)', margin: '0 0 8px 0', fontSize: '14px' }}>{widget.ten_widget}</h4>}
        <div style={{ color: 'var(--bdu-muted)', fontSize: '12px', textAlign: 'center' }}>
          <div style={{ fontSize: '32px', marginBottom: '8px' }}>🖼️</div>
          Chưa có ảnh nào
        </div>
      </div>
    );
  }

  return (
    <div style={{ width: '100%', height: '100%', padding: '8px', display: 'flex', flexDirection: 'column' }}>
      {widget.ten_widget && <h4 style={{ color: 'var(--bdu-text)', margin: '0 0 4px 0', fontSize: '14px' }}>{widget.ten_widget}</h4>}
      <div style={{ flex: 1, position: 'relative', borderRadius: '8px', overflow: 'hidden', background: 'var(--bdu-card)' }}>
        <img
          src={images[currentIndex]}
          alt={`Gallery ${currentIndex + 1}`}
          style={{ width: '100%', height: '100%', objectFit: 'contain' }}
        />
        {images.length > 1 && (
          <>
            <button
              onClick={() => setCurrentIndex((prev) => (prev - 1 + images.length) % images.length)}
              style={{
                position: 'absolute',
                left: '8px',
                top: '50%',
                transform: 'translateY(-50%)',
                background: 'rgba(0,0,0,0.5)',
                border: 'none',
                borderRadius: '50%',
                width: '32px',
                height: '32px',
                color: 'white',
                cursor: 'pointer',
                fontSize: '16px'
              }}
            >
              ‹
            </button>
            <button
              onClick={() => setCurrentIndex((prev) => (prev + 1) % images.length)}
              style={{
                position: 'absolute',
                right: '8px',
                top: '50%',
                transform: 'translateY(-50%)',
                background: 'rgba(0,0,0,0.5)',
                border: 'none',
                borderRadius: '50%',
                width: '32px',
                height: '32px',
                color: 'white',
                cursor: 'pointer',
                fontSize: '16px'
              }}
            >
              ›
            </button>
            <div style={{
              position: 'absolute',
              bottom: '8px',
              left: '50%',
              transform: 'translateX(-50%)',
              display: 'flex',
              gap: '4px'
            }}>
              {images.map((_, i) => (
                <div
                  key={i}
                  onClick={() => setCurrentIndex(i)}
                  style={{
                    width: '8px',
                    height: '8px',
                    borderRadius: '50%',
                    background: i === currentIndex ? '#22d3ee' : 'rgba(255,255,255,0.3)',
                    cursor: 'pointer'
                  }}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ---- MapWidget ----
export function MapWidget({ widget, token, dashboardId }) {
  const [position, setPosition] = useState({ lat: 0, lng: 0 });
  const deviceId = widget.cau_hinh?.device_id;
  const latKey = widget.cau_hinh?.lat_key || 'lat';
  const lngKey = widget.cau_hinh?.lng_key || 'lng';
  const centerLat = widget.cau_hinh?.center_lat || 21.0285;
  const centerLng = widget.cau_hinh?.center_lng || 105.8522;
  const zoom = widget.cau_hinh?.zoom || 15;

  useEffect(() => {
    const loadData = async () => {
      if (!deviceId) return;
      try {
        const res = await fetchWidgetData(dashboardId, widget.id, '1h', null, token);
        const latest = res.data.data?.[res.data.data.length - 1];
        if (latest) {
          setPosition({
            lat: parseFloat(latest[latKey]) || centerLat,
            lng: parseFloat(latest[lngKey]) || centerLng
          });
        }
      } catch (err) {
        console.error('Map load error:', err);
      }
    };
    loadData();
    const interval = setInterval(loadData, 10000);
    return () => clearInterval(interval);
  }, [deviceId, latKey, lngKey]);

  return (
    <div style={{ width: '100%', height: '100%', padding: '8px', display: 'flex', flexDirection: 'column' }}>
      {widget.ten_widget && <h4 style={{ color: 'var(--bdu-text)', margin: '0 0 4px 0', fontSize: '14px' }}>{widget.ten_widget}</h4>}
      <div style={{
        flex: 1,
        background: 'var(--bdu-card-hover)',
        borderRadius: '8px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
        overflow: 'hidden'
      }}>
        {/* Simple map visualization */}
        <svg viewBox="0 0 200 150" style={{ width: '100%', height: '100%' }}>
          {/* Grid */}
          {Array.from({ length: 10 }).map((_, i) => (
            <line key={`h${i}`} x1="0" y1={i * 15} x2="200" y2={i * 15} stroke="#1f2a44" strokeWidth="0.5" />
          ))}
          {Array.from({ length: 14 }).map((_, i) => (
            <line key={`v${i}`} x1={i * 15} y1="0" x2={i * 15} y2="150" stroke="#1f2a44" strokeWidth="0.5" />
          ))}

          {/* Center marker */}
          <circle
            cx={100 + (position.lng - centerLng) * 1000}
            cy={75 - (position.lat - centerLat) * 1000}
            r="6"
            fill="#22d3ee"
            opacity="0.8"
          />
          <circle
            cx={100 + (position.lng - centerLng) * 1000}
            cy={75 - (position.lat - centerLat) * 1000}
            r="12"
            fill="none"
            stroke="#22d3ee"
            strokeWidth="2"
            opacity="0.4"
          />
        </svg>

        <div style={{
          position: 'absolute',
          bottom: '8px',
          left: '8px',
          background: 'rgba(0,0,0,0.7)',
          padding: '4px 8px',
          borderRadius: '4px',
          fontSize: '10px',
          color: 'var(--bdu-muted)'
        }}>
          {position.lat.toFixed(6)}, {position.lng.toFixed(6)}
        </div>
      </div>
    </div>
  );
}

// ---- DropdownMenuWidget ----
export function DropdownMenuWidget({ widget, token, dashboardId }) {
  const [selectedValue, setSelectedValue] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const deviceId = widget.cau_hinh?.device_id;
  const dataKey = widget.cau_hinh?.data_keys?.[0] || 'mode';
  const options = widget.cau_hinh?.options || ['Option 1', 'Option 2', 'Option 3'];

  const handleSelect = async (option) => {
    setSelectedValue(option);
    setIsOpen(false);
    if (deviceId) {
      try {
        await fetch(`${API_BASE}/api/device/${deviceId}/control`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({ [dataKey]: option })
        });
      } catch (err) {
        console.error('Dropdown control error:', err);
      }
    }
  };

  return (
    <div style={{ width: '100%', height: '100%', padding: '12px', display: 'flex', flexDirection: 'column' }}>
      {widget.ten_widget && <h4 style={{ color: 'var(--bdu-text)', margin: '0 0 8px 0', fontSize: '14px' }}>{widget.ten_widget}</h4>}
      <div style={{ position: 'relative' }}>
        <button
          onClick={() => setIsOpen(!isOpen)}
          style={{
            width: '100%',
            padding: '10px 12px',
            background: 'var(--bdu-card-hover)',
            border: '1px solid var(--bdu-card-border)',
            borderRadius: '6px',
            color: 'var(--bdu-text)',
            textAlign: 'left',
            cursor: 'pointer',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}
        >
          <span>{selectedValue || 'Chọn...'}</span>
          <span style={{ transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>▼</span>
        </button>

        {isOpen && (
          <div style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            right: 0,
            background: 'var(--bdu-card-hover)',
            border: '1px solid var(--bdu-card-border)',
            borderRadius: '6px',
            marginTop: '4px',
            zIndex: 100,
            maxHeight: '150px',
            overflowY: 'auto'
          }}>
            {options.map((option) => (
              <div
                key={option}
                onClick={() => handleSelect(option)}
                style={{
                  padding: '8px 12px',
                  cursor: 'pointer',
                  color: selectedValue === option ? 'var(--bdu-cyan)' : 'var(--bdu-text)',
                  background: selectedValue === option ? 'var(--bdu-cyan-dim)' : 'transparent'
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bdu-cyan-dim)'}
                onMouseLeave={(e) => e.currentTarget.style.background = selectedValue === option ? 'var(--bdu-cyan-dim)' : 'transparent'}
              >
                {option}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ---- TextInputWidget ----
export function TextInputWidget({ widget, token, dashboardId }) {
  const [value, setValue] = useState('');
  const [sending, setSending] = useState(false);
  const deviceId = widget.cau_hinh?.device_id;
  const dataKey = widget.cau_hinh?.data_keys?.[0] || 'text_command';
  const placeholder = widget.cau_hinh?.placeholder || 'Nhập text...';

  const handleSend = async () => {
    if (!value.trim() || !deviceId || sending) return;
    setSending(true);
    try {
      await fetch(`${API_BASE}/api/device/${deviceId}/control`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ [dataKey]: value.trim() })
      });
      setValue('');
    } catch (err) {
      console.error('TextInput error:', err);
    } finally {
      setSending(false);
    }
  };

  return (
    <div style={{ width: '100%', height: '100%', padding: '12px', display: 'flex', flexDirection: 'column' }}>
      {widget.ten_widget && <h4 style={{ color: 'var(--bdu-text)', margin: '0 0 8px 0', fontSize: '14px' }}>{widget.ten_widget}</h4>}
      <div style={{ display: 'flex', gap: '8px' }}>
        <input
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSend()}
          placeholder={placeholder}
          style={{
            flex: 1,
            padding: '8px 12px',
            background: 'var(--bdu-card-hover)',
            border: '1px solid var(--bdu-card-border)',
            borderRadius: '6px',
            color: 'var(--bdu-text)',
            fontSize: '13px'
          }}
        />
        <button
          onClick={handleSend}
          disabled={sending}
          style={{
            padding: '8px 16px',
            background: 'var(--bdu-cyan)',
            border: 'none',
            borderRadius: '6px',
            color: '#0b1224',
            fontWeight: 600,
            cursor: sending ? 'not-allowed' : 'pointer',
            opacity: sending ? 0.7 : 1
          }}
        >
          {sending ? '...' : 'Gửi'}
        </button>
      </div>
    </div>
  );
}

// ---- NumericInputWidget ----
export function NumericInputWidget({ widget, token, dashboardId }) {
  const [value, setValue] = useState(0);
  const [sending, setSending] = useState(false);
  const deviceId = widget.cau_hinh?.device_id;
  const dataKey = widget.cau_hinh?.data_keys?.[0] || 'numeric_value';
  const min = widget.cau_hinh?.min || 0;
  const max = widget.cau_hinh?.max || 100;
  const step = widget.cau_hinh?.step || 1;

  const handleChange = async (newValue) => {
    setValue(newValue);
  };

  const handleBlur = async () => {
    if (!deviceId || sending) return;
    setSending(true);
    try {
      await fetch(`${API_BASE}/api/device/${deviceId}/control`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ [dataKey]: value })
      });
    } catch (err) {
      console.error('NumericInput error:', err);
    } finally {
      setSending(false);
    }
  };

  return (
    <div style={{ width: '100%', height: '100%', padding: '12px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
      {widget.ten_widget && <h4 style={{ color: 'var(--bdu-text)', margin: '0 0 8px 0', fontSize: '14px' }}>{widget.ten_widget}</h4>}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <button
          onClick={() => setValue(Math.max(min, value - step))}
          style={{
            width: '32px',
            height: '32px',
            borderRadius: '6px',
            background: 'var(--bdu-card-hover)',
            border: '1px solid var(--bdu-card-border)',
            color: 'var(--bdu-text)',
            fontSize: '18px',
            cursor: 'pointer'
          }}
        >
          -
        </button>
        <input
          type="number"
          value={value}
          onChange={(e) => handleChange(parseFloat(e.target.value) || 0)}
          onBlur={handleBlur}
          min={min}
          max={max}
          step={step}
          style={{
            width: '80px',
            padding: '8px',
            background: 'var(--bdu-card-hover)',
            border: '1px solid var(--bdu-card-border)',
            borderRadius: '6px',
            color: 'var(--bdu-cyan)',
            fontSize: '16px',
            fontWeight: 600,
            textAlign: 'center'
          }}
        />
        <button
          onClick={() => setValue(Math.min(max, value + step))}
          style={{
            width: '32px',
            height: '32px',
            borderRadius: '6px',
            background: 'var(--bdu-card-hover)',
            border: '1px solid var(--bdu-card-border)',
            color: 'var(--bdu-text)',
            fontSize: '18px',
            cursor: 'pointer'
          }}
        >
          +
        </button>
      </div>
      <div style={{ fontSize: '11px', color: 'var(--bdu-muted)', marginTop: '4px' }}>
        {min} - {max}
      </div>
    </div>
  );
}

// ---- SegmentedSwitchWidget ----
export function SegmentedSwitchWidget({ widget, token, dashboardId }) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const deviceId = widget.cau_hinh?.device_id;
  const dataKey = widget.cau_hinh?.data_keys?.[0] || 'mode';
  const segments = widget.cau_hinh?.segments || ['Mode 1', 'Mode 2', 'Mode 3'];

  const handleSelect = async (index) => {
    setSelectedIndex(index);
    if (deviceId) {
      try {
        await fetch(`${API_BASE}/api/device/${deviceId}/control`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({ [dataKey]: segments[index] })
        });
      } catch (err) {
        console.error('SegmentedSwitch error:', err);
      }
    }
  };

  return (
    <div style={{ width: '100%', height: '100%', padding: '12px', display: 'flex', flexDirection: 'column' }}>
      {widget.ten_widget && <h4 style={{ color: 'var(--bdu-text)', margin: '0 0 8px 0', fontSize: '14px' }}>{widget.ten_widget}</h4>}
      <div style={{
        display: 'flex',
        background: 'var(--bdu-card-hover)',
        borderRadius: '8px',
        padding: '4px',
        border: '1px solid var(--bdu-card-border)'
      }}>
        {segments.map((segment, index) => (
          <button
            key={segment}
            onClick={() => handleSelect(index)}
            style={{
              flex: 1,
              padding: '8px 4px',
              background: selectedIndex === index ? 'var(--bdu-cyan)' : 'transparent',
              border: 'none',
              borderRadius: '6px',
              color: selectedIndex === index ? 'var(--bdu-bg)' : 'var(--bdu-text)',
              fontWeight: selectedIndex === index ? 600 : 400,
              fontSize: '11px',
              cursor: 'pointer',
              transition: 'all 0.2s'
            }}
          >
            {segment}
          </button>
        ))}
      </div>
    </div>
  );
}
