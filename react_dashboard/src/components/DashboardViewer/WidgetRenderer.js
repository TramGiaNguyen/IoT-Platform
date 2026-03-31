import React, { useState, useEffect } from 'react';
import { ResponsiveContainer, LineChart, BarChart, PieChart, Pie, Cell, Line, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ComposedChart, Area } from 'recharts';
import { fetchWidgetData, controlRelay } from '../../services';
import { WS_URL } from '../../config/api';

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
  const timeRange = widget.cau_hinh?.time_range || '1h';

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

  // WebSocket for real-time updates
  useEffect(() => {
    if (!token || !deviceId || dataKeys.length === 0) return;

    const API_BASE = process.env.REACT_APP_API_BASE || 'http://localhost:8000';
    const WS_URL = `${API_BASE.replace(/^http/i, 'ws')}/ws/events`;
    
    let ws = null;
    let reconnectTimer = null;

    const connect = () => {
      try {
        ws = new WebSocket(WS_URL);
        
        ws.onopen = () => {
          console.log(`[LineChartWidget] WebSocket connected for ${deviceId}`);
        };

        ws.onmessage = (event) => {
          try {
            const newData = JSON.parse(event.data);
            if (newData.device_id === deviceId) {
              // Update chart data in real-time
              setData(prev => {
                // Check if this timestamp already exists
                const timestamp = newData.timestamp;
                const existingIndex = prev.findIndex(item => item.timestampValue === timestamp);
                
                if (existingIndex >= 0) {
                  // Update existing point
                  const updated = [...prev];
                  updated[existingIndex] = {
                    ...updated[existingIndex],
                    ...dataKeys.reduce((acc, key) => {
                      if (newData[key] !== undefined) {
                        acc[key] = newData[key];
                      }
                      return acc;
                    }, {})
                  };
                  return updated;
                } else {
                  // Add new point (keep within time range)
                  const newPoint = {
                    timestamp: new Date(timestamp * 1000).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
                    timestampValue: timestamp,
                    ...dataKeys.reduce((acc, key) => {
                      if (newData[key] !== undefined) {
                        acc[key] = newData[key];
                      }
                      return acc;
                    }, {})
                  };
                  
                  // Add to end and keep only recent data (within time range)
                  const updated = [...prev, newPoint]
                    .sort((a, b) => a.timestampValue - b.timestampValue);
                  
                  // Remove old data points outside time range
                  const now = Date.now() / 1000;
                  const rangeHours = timeRange.endsWith('h') ? parseInt(timeRange) : (timeRange.endsWith('d') ? parseInt(timeRange) * 24 : 1);
                  const cutoffTime = now - (rangeHours * 3600);
                  
                  return updated.filter(item => item.timestampValue >= cutoffTime);
                }
              });
            }
          } catch (err) {
            console.error('[LineChartWidget] WebSocket parse error:', err);
          }
        };

        ws.onerror = (err) => {
          console.error('[LineChartWidget] WebSocket error:', err);
        };

        ws.onclose = () => {
          console.log(`[LineChartWidget] WebSocket disconnected for ${deviceId}`);
          ws = null;
          // Reconnect after 3 seconds
          reconnectTimer = setTimeout(connect, 3000);
        };
      } catch (err) {
        console.error('[LineChartWidget] WebSocket connection error:', err);
      }
    };

    connect();

    return () => {
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (ws) {
        try {
          ws.close();
        } catch (e) {
          // Ignore
        }
      }
    };
  }, [token, deviceId, dataKeys, timeRange]);

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#9ca3af' }}>
        Đang tải...
      </div>
    );
  }

  const colors = widget.cau_hinh?.colors || {};

  return (
    <div style={{ width: '100%', height: '100%', padding: '12px' }}>
      {widget.ten_widget && (
        <h4 style={{ color: '#e5e7eb', margin: '0 0 12px 0', fontSize: '14px' }}>
          {widget.ten_widget}
        </h4>
      )}
      <ResponsiveContainer width="100%" height="100%">
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
          <Tooltip contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #1f2a44', color: '#e5e7eb' }} />
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

export function BarChartWidget({ widget, token, dashboardId }) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const deviceId = widget.cau_hinh?.device_id;
  const dataKeys = widget.cau_hinh?.data_keys || [];
  const timeRange = widget.cau_hinh?.time_range || '1h';

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

  // WebSocket for real-time updates
  useEffect(() => {
    if (!token || !deviceId || dataKeys.length === 0) return;

    const API_BASE = process.env.REACT_APP_API_BASE || 'http://localhost:8000';
    const WS_URL = `${API_BASE.replace(/^http/i, 'ws')}/ws/events`;
    
    let ws = null;
    let reconnectTimer = null;

    const connect = () => {
      try {
        ws = new WebSocket(WS_URL);
        
        ws.onmessage = (event) => {
          try {
            const newData = JSON.parse(event.data);
            if (newData.device_id === deviceId) {
              setData(prev => {
                const timestamp = newData.timestamp;
                const existingIndex = prev.findIndex(item => item.timestampValue === timestamp);
                
                if (existingIndex >= 0) {
                  const updated = [...prev];
                  updated[existingIndex] = {
                    ...updated[existingIndex],
                    ...dataKeys.reduce((acc, key) => {
                      if (newData[key] !== undefined) {
                        acc[key] = newData[key];
                      }
                      return acc;
                    }, {})
                  };
                  return updated;
                } else {
                  const newPoint = {
                    timestamp: new Date(timestamp * 1000).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
                    timestampValue: timestamp,
                    ...dataKeys.reduce((acc, key) => {
                      if (newData[key] !== undefined) {
                        acc[key] = newData[key];
                      }
                      return acc;
                    }, {})
                  };
                  
                  const updated = [...prev, newPoint]
                    .sort((a, b) => a.timestampValue - b.timestampValue);
                  
                  const now = Date.now() / 1000;
                  const rangeHours = timeRange.endsWith('h') ? parseInt(timeRange) : (timeRange.endsWith('d') ? parseInt(timeRange) * 24 : 1);
                  const cutoffTime = now - (rangeHours * 3600);
                  
                  return updated.filter(item => item.timestampValue >= cutoffTime);
                }
              });
            }
          } catch (err) {
            console.error('[BarChartWidget] WebSocket parse error:', err);
          }
        };

        ws.onclose = () => {
          reconnectTimer = setTimeout(connect, 3000);
        };
      } catch (err) {
        console.error('[BarChartWidget] WebSocket error:', err);
      }
    };

    connect();

    return () => {
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (ws) {
        try {
          ws.close();
        } catch (e) {}
      }
    };
  }, [token, deviceId, dataKeys, timeRange]);

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#9ca3af' }}>
        Đang tải...
      </div>
    );
  }



  return (
    <div style={{ width: '100%', height: '100%', padding: '12px' }}>
      {widget.ten_widget && (
        <h4 style={{ color: '#e5e7eb', margin: '0 0 12px 0', fontSize: '14px' }}>
          {widget.ten_widget}
        </h4>
      )}
      <ResponsiveContainer width="100%" height="100%">
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
          <Tooltip contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #1f2a44', color: '#e5e7eb' }} />
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

  const loadData = async () => {
    try {
      const res = await fetchWidgetData(
        dashboardId,
        widget.id,
        widget.cau_hinh?.time_range || '1h',
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
  }, [widget.id]);

  // WebSocket for real-time updates
  useEffect(() => {
    if (!token || !deviceId || !dataKey) return;

    const API_BASE = process.env.REACT_APP_API_BASE || 'http://localhost:8000';
    const WS_URL = `${API_BASE.replace(/^http/i, 'ws')}/ws/events`;
    
    let ws = null;
    let reconnectTimer = null;

    const connect = () => {
      try {
        ws = new WebSocket(WS_URL);
        
        ws.onmessage = (event) => {
          try {
            const newData = JSON.parse(event.data);
            if (newData.device_id === deviceId && newData[dataKey] !== undefined) {
              const rawValue = newData[dataKey];
              setData(unwrapValue(rawValue));
            }
          } catch (err) {
            console.error('[GaugeWidget] WebSocket parse error:', err);
          }
        };

        ws.onclose = () => {
          reconnectTimer = setTimeout(connect, 3000);
        };
      } catch (err) {
        console.error('[GaugeWidget] WebSocket error:', err);
      }
    };

    connect();

    return () => {
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (ws) {
        try {
          ws.close();
        } catch (e) {}
      }
    };
  }, [token, deviceId, dataKey]);

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#9ca3af' }}>
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
      {widget.ten_widget && (
        <h4 style={{ color: '#e5e7eb', margin: '0 0 16px 0', fontSize: '14px' }}>
          {widget.ten_widget}
        </h4>
      )}
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
          background: '#0b1224',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'column'
        }}>
          <div style={{ fontSize: '28px', fontWeight: 'bold', color: '#22d3ee' }}>
            {value?.toFixed(1) || '0'}
          </div>
          <div style={{ fontSize: '10px', color: '#9ca3af' }}>
            {widget.cau_hinh?.unit || ''}
          </div>
        </div>
      </div>
      <div style={{ marginTop: '12px', fontSize: '12px', color: '#9ca3af', textAlign: 'center' }}>
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

  const loadData = async () => {
    try {
      const res = await fetchWidgetData(
        dashboardId,
        widget.id,
        widget.cau_hinh?.time_range || '1h',
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
  }, [widget.id]);

  // WebSocket for real-time updates
  useEffect(() => {
    if (!token || !deviceId || !dataKey) return;

    const API_BASE = process.env.REACT_APP_API_BASE || 'http://localhost:8000';
    const WS_URL = `${API_BASE.replace(/^http/i, 'ws')}/ws/events`;
    
    let ws = null;
    let reconnectTimer = null;

    const connect = () => {
      try {
        ws = new WebSocket(WS_URL);
        
        ws.onmessage = (event) => {
          try {
            const newData = JSON.parse(event.data);
            if (newData.device_id === deviceId && newData[dataKey] !== undefined) {
              const rawValue = newData[dataKey];
              setData(unwrapValue(rawValue));
            }
          } catch (err) {
            console.error('[StatCardWidget] WebSocket parse error:', err);
          }
        };

        ws.onclose = () => {
          reconnectTimer = setTimeout(connect, 3000);
        };
      } catch (err) {
        console.error('[StatCardWidget] WebSocket error:', err);
      }
    };

    connect();

    return () => {
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (ws) {
        try {
          ws.close();
        } catch (e) {}
      }
    };
  }, [token, deviceId, dataKey]);

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#9ca3af' }}>
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
      <div style={{ fontSize: '40px', fontWeight: 'bold', color: '#22d3ee', marginBottom: '8px' }}>
        {data?.toFixed(1) || '--'}
      </div>
      <div style={{ fontSize: '14px', color: '#9ca3af' }}>
        {widget.cau_hinh?.label || widget.ten_widget || 'Value'}
      </div>
      <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>
        {widget.cau_hinh?.unit || ''}
      </div>
    </div>
  );
}

export function TableWidget({ widget, token, dashboardId }) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);

  const loadData = async () => {
    try {
      setLoading(true);
      const res = await fetchWidgetData(
        dashboardId,
        widget.id,
        widget.cau_hinh?.time_range || '1h',
        null,
        token
      );
      const tableData = (res.data.data || []).slice(-10).reverse().map(item => ({
        ...item,
        timestamp: new Date(item.timestamp * 1000).toLocaleString('vi-VN')
      }));
      setData(tableData);
    } catch (err) {
      console.error('Failed to load widget data:', err);
      setData([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 30000);
    return () => clearInterval(interval);
  }, [widget.id, widget.cau_hinh?.time_range]);

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#9ca3af' }}>
        Đang tải...
      </div>
    );
  }

  const dataKeys = widget.cau_hinh?.data_keys || [];

  return (
    <div style={{ width: '100%', height: '100%', padding: '12px', overflow: 'auto' }}>
      {widget.ten_widget && (
        <h4 style={{ color: '#e5e7eb', margin: '0 0 12px 0', fontSize: '14px' }}>
          {widget.ten_widget}
        </h4>
      )}
      <table style={{ width: '100%', fontSize: '12px', color: '#e5e7eb', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ borderBottom: '1px solid #1f2a44' }}>
            <th style={{ padding: '8px', textAlign: 'left', color: '#9ca3af', fontWeight: '600' }}>Thời gian</th>
            {dataKeys.map(key => (
              <th key={key} style={{ padding: '8px', textAlign: 'left', color: '#9ca3af', fontWeight: '600' }}>
                {key}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.length === 0 ? (
            <tr>
              <td colSpan={dataKeys.length + 1} style={{ padding: '20px', textAlign: 'center', color: '#9ca3af' }}>
                Chưa có dữ liệu
              </td>
            </tr>
          ) : (
            data.map((row, idx) => (
              <tr key={idx} style={{ borderBottom: '1px solid #1f2a44' }}>
                <td style={{ padding: '8px' }}>{row.timestamp}</td>
                {dataKeys.map(key => (
                  <td key={key} style={{ padding: '8px' }}>
                    {row[key]?.toFixed ? row[key].toFixed(2) : row[key] || '--'}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

export function PieChartWidget({ widget, token, dashboardId }) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);

  const loadData = async () => {
    try {
      const res = await fetchWidgetData(
        dashboardId,
        widget.id,
        widget.cau_hinh?.time_range || '24h',
        null,
        token
      );
      // Aggregate data for pie chart
      const chartData = (res.data.data || []).reduce((acc, item) => {
        const key = widget.cau_hinh?.data_keys?.[0];
        if (key && item[key]) {
          const value = parseFloat(item[key]);
          if (!isNaN(value)) {
            acc.push({ name: new Date(item.timestamp * 1000).toLocaleTimeString('vi-VN'), value });
          }
        }
        return acc;
      }, []).slice(-5); // Last 5 values
      setData(chartData);
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
  }, [widget.id, widget.cau_hinh?.time_range]);

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#9ca3af' }}>
        Đang tải...
      </div>
    );
  }

  return (
    <div style={{ width: '100%', height: '100%', padding: '12px' }}>
      {widget.ten_widget && (
        <h4 style={{ color: '#e5e7eb', margin: '0 0 12px 0', fontSize: '14px', textAlign: 'center' }}>
          {widget.ten_widget}
        </h4>
      )}
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            labelLine={false}
            label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
            outerRadius={80}
            fill="#8884d8"
            dataKey="value"
          >
            {data.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
            ))}
          </Pie>
          <Tooltip contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #1f2a44', color: '#e5e7eb' }} />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}

export default function WidgetRenderer({ widget, token, dashboardId }) {
  const renderWidget = () => {
    const style = {
      width: '100%',
      height: '100%',
      background: 'linear-gradient(145deg, rgba(15, 23, 42, 0.92), rgba(9, 12, 24, 0.95))',
      border: '1px solid #1f2a44',
      borderRadius: '8px',
      padding: '8px'
    };

    switch (widget.widget_type) {
      case 'line_chart':
        return <div style={style}><LineChartWidget widget={widget} token={token} dashboardId={dashboardId} /></div>;
      case 'bar_chart':
        return <div style={style}><BarChartWidget widget={widget} token={token} dashboardId={dashboardId} /></div>;
      case 'gauge':
        return <div style={style}><GaugeWidget widget={widget} token={token} dashboardId={dashboardId} /></div>;
      case 'stat_card':
        return <div style={style}><StatCardWidget widget={widget} token={token} dashboardId={dashboardId} /></div>;
      case 'table':
        return <div style={style}><TableWidget widget={widget} token={token} dashboardId={dashboardId} /></div>;
      case 'pie_chart':
        return <div style={style}><PieChartWidget widget={widget} token={token} dashboardId={dashboardId} /></div>;
      case 'scatter_plot':
        return <div style={style}><ScatterPlotWidget widget={widget} token={token} dashboardId={dashboardId} /></div>;
      case 'heatmap':
        return <div style={style}><HeatmapWidget widget={widget} token={token} dashboardId={dashboardId} /></div>;
      case 'event_timeline':
        return <div style={style}><EventTimelineWidget widget={widget} token={token} dashboardId={dashboardId} /></div>;
      case 'multi_axis_line':
        return <div style={style}><MultiAxisLineWidget widget={widget} token={token} dashboardId={dashboardId} /></div>;
      case 'relay_button':
        return <div style={style}><RelayButtonWidget widget={widget} token={token} dashboardId={dashboardId} /></div>;
      default:
        return <div style={style}>Unknown widget type: {widget.widget_type}</div>;
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
  const timeRange = widget.cau_hinh?.time_range || '1h';

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

  if (loading) return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#9ca3af' }}>Đang tải...</div>;
  if (!xKey || !yKey) return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#64748b', fontSize: 12 }}>⚠️ Chưa cấu hình X/Y key</div>;

  const xs = data.map(d => d.x), ys = data.map(d => d.y);
  const minX = xs.length ? Math.min(...xs) : 0, maxX = xs.length ? Math.max(...xs) : 1;
  const minY = ys.length ? Math.min(...ys) : 0, maxY = ys.length ? Math.max(...ys) : 1;
  const px = x => 8 + ((x - minX) / ((maxX - minX) || 1)) * 84;
  const py = y => 78 - ((y - minY) / ((maxY - minY) || 1)) * 68;

  return (
    <div style={{ width: '100%', height: '100%', padding: '12px' }}>
      {widget.ten_widget && <h4 style={{ color: '#e5e7eb', margin: '0 0 8px 0', fontSize: 14 }}>{widget.ten_widget}</h4>}
      <div style={{ fontSize: 11, color: '#64748b', marginBottom: 4 }}>{xKey} (X) vs {yKey} (Y) — {data.length} điểm</div>
      {data.length === 0 ? (
        <div style={{ textAlign: 'center', color: '#64748b', fontSize: 12, marginTop: 20 }}>Chưa có dữ liệu</div>
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

  if (loading) return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#9ca3af' }}>Đang tải...</div>;

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
      {widget.ten_widget && <h4 style={{ color: '#e5e7eb', margin: '0 0 8px 0', fontSize: 14 }}>{widget.ten_widget}</h4>}
      {data.length === 0 ? (
        <div style={{ textAlign: 'center', color: '#64748b', fontSize: 12, marginTop: 20 }}>Chưa có đủ dữ liệu heatmap</div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <div style={{ display: 'grid', gridTemplateColumns: `40px repeat(24, 18px)`, gap: 2, minWidth: 'max-content' }}>
            <div />
            {hours.map(h => <div key={h} style={{ color: '#64748b', fontSize: 8, textAlign: 'center' }}>{h}</div>)}
            {days.map(day => (
              <React.Fragment key={day}>
                <div style={{ color: '#9ca3af', fontSize: 9, display: 'flex', alignItems: 'center' }}>{day}</div>
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

  if (loading) return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#9ca3af' }}>Đang tải...</div>;

  if (data.length === 0) return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#64748b', fontSize: 12 }}>
      {widget.ten_widget && <h4 style={{ color: '#e5e7eb', margin: '0 0 8px 0' }}>{widget.ten_widget}</h4>}
      Chưa có event nào
    </div>
  );

  const minT = data[0].t, maxT = data[data.length - 1].t, range = maxT - minT || 1;
  const pxOf = t => ((t - minT) / range) * 100;

  return (
    <div style={{ width: '100%', height: '100%', padding: '12px' }}>
      {widget.ten_widget && <h4 style={{ color: '#e5e7eb', margin: '0 0 8px 0', fontSize: 14 }}>{widget.ten_widget}</h4>}
      <div style={{ position: 'relative', height: '36px', background: '#111a2d', borderRadius: 4, border: '1px solid #1f2a44', overflow: 'hidden' }}>
        {data.map((evt, i) => {
          const nextT = data[i + 1]?.t || maxT;
          const left = pxOf(evt.t), width = Math.max(0.3, pxOf(nextT) - left);
          return <div key={i} title={`${evt.ts}: ${evt.status}`} style={{ position: 'absolute', left: `${left}%`, width: `${width}%`, top: 4, height: 28, background: STATUS_COLORS[evt.status] || '#64748b', opacity: 0.85 }} />;
        })}
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 6 }}>
        {[...new Set(data.map(d => d.status))].map(s => (
          <span key={s} style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 10, color: '#9ca3af' }}>
            <span style={{ width: 8, height: 8, background: STATUS_COLORS[s] || '#64748b', display: 'inline-block', borderRadius: 2 }} />{s}
          </span>
        ))}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4, fontSize: 9, color: '#64748b' }}>
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

  if (loading) return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#9ca3af' }}>Đang tải...</div>;

  return (
    <div style={{ width: '100%', height: '100%', padding: '12px' }}>
      {widget.ten_widget && <h4 style={{ color: '#e5e7eb', margin: '0 0 12px 0', fontSize: 14 }}>{widget.ten_widget}</h4>}
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1f2a44" />
          <XAxis dataKey="timestamp" stroke="#64748b" tick={{ fontSize: 10 }} type="category" allowDuplicatedCategory={false} />
          {dataKeys.map((key, idx) => (
            <YAxis key={`y-${key}`} yAxisId={idx} orientation={idx % 2 === 0 ? 'left' : 'right'} stroke={COLORS[idx % COLORS.length]} tick={{ fontSize: 9 }} width={32} />
          ))}
          <Tooltip contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #1f2a44', color: '#e5e7eb' }} />
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
      {widget.ten_widget && <h4 style={{ color: '#e5e7eb', margin: 0, fontSize: 13, textAlign: 'center' }}>{widget.ten_widget}</h4>}
      <div style={{ fontSize: 10, color: '#64748b' }}>Relay {relayNumber}</div>
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
      {controlling && <div style={{ fontSize: 10, color: '#9ca3af' }}>Đang gửi...</div>}
    </div>
  );
}
