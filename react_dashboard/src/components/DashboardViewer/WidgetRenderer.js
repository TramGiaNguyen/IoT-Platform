import React, { useState, useEffect } from 'react';
import { ResponsiveContainer, LineChart, BarChart, PieChart, Pie, Cell, Line, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ComposedChart, Area } from 'recharts';
import { fetchWidgetData } from '../../services';

const COLORS = ['#22d3ee', '#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981'];

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

  const dataKeys = widget.cau_hinh?.data_keys || [];

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

  const loadData = async () => {
    try {
      const res = await fetchWidgetData(
        dashboardId,
        widget.id,
        widget.cau_hinh?.time_range || '1h',
        token
      );
      const latest = res.data.data?.[res.data.data.length - 1];
      if (latest && widget.cau_hinh?.data_keys?.[0]) {
        setData(latest[widget.cau_hinh.data_keys[0]]);
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

  const loadData = async () => {
    try {
      const res = await fetchWidgetData(
        dashboardId,
        widget.id,
        widget.cau_hinh?.time_range || '1h',
        token
      );
      const latest = res.data.data?.[res.data.data.length - 1];
      if (latest && widget.cau_hinh?.data_keys?.[0]) {
        setData(latest[widget.cau_hinh.data_keys[0]]);
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
      default:
        return <div style={style}>Unknown widget type: {widget.widget_type}</div>;
    }
  };

  return renderWidget();
}

