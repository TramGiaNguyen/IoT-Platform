import React, { useState, useEffect } from 'react';
import { ResponsiveContainer, LineChart, BarChart, PieChart, Pie, Cell, Line, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ComposedChart, Area } from 'recharts';
import { fetchWidgetData, controlRelay } from '../../services';
import { WS_URL } from '../../config/api';
import '../../styles/dashboard-builder.css';

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
            console.log('[LineChartWidget] WS received:', newData);
            
            if (newData.device_id === deviceId) {
              // Extract all numeric values from the message
              const extractedData = {};
              Object.keys(newData).forEach(key => {
                if (key !== 'device_id' && key !== 'timestamp' && newData[key] != null) {
                  // Handle unwrapValue pattern: {value: number}
                  if (typeof newData[key] === 'object' && 'value' in newData[key]) {
                    extractedData[key] = newData[key].value;
                  } else if (typeof newData[key] === 'number') {
                    extractedData[key] = newData[key];
                  } else {
                    // Try to parse string numbers
                    const parsed = parseFloat(newData[key]);
                    if (!isNaN(parsed)) {
                      extractedData[key] = parsed;
                    }
                  }
                }
              });
              
              // Use configured dataKeys if available, otherwise use all extracted keys
              const keysToUse = dataKeys.length > 0 ? dataKeys : Object.keys(extractedData);
              
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
                    ...keysToUse.reduce((acc, key) => {
                      if (extractedData[key] !== undefined) {
                        acc[key] = extractedData[key];
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
                    ...keysToUse.reduce((acc, key) => {
                      if (extractedData[key] !== undefined) {
                        acc[key] = extractedData[key];
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
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--bdu-muted)' }}>
        Đang tải...
      </div>
    );
  }

  const colors = widget.cau_hinh?.colors || {};

  return (
    <div style={{ width: '100%', height: '100%', padding: '12px' }}>
      {widget.ten_widget && (
        <h4 style={{ color: 'var(--bdu-text)', margin: '0 0 12px 0', fontSize: '14px' }}>
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
            console.log('[BarChartWidget] WS received:', newData);
            
            if (newData.device_id === deviceId) {
              // Extract all numeric values
              const extractedData = {};
              Object.keys(newData).forEach(key => {
                if (key !== 'device_id' && key !== 'timestamp' && newData[key] != null) {
                  if (typeof newData[key] === 'object' && 'value' in newData[key]) {
                    extractedData[key] = newData[key].value;
                  } else if (typeof newData[key] === 'number') {
                    extractedData[key] = newData[key];
                  } else {
                    const parsed = parseFloat(newData[key]);
                    if (!isNaN(parsed)) extractedData[key] = parsed;
                  }
                }
              });
              
              const keysToUse = dataKeys.length > 0 ? dataKeys : Object.keys(extractedData);
              
              setData(prev => {
                const timestamp = newData.timestamp;
                const existingIndex = prev.findIndex(item => item.timestampValue === timestamp);
                
                if (existingIndex >= 0) {
                  const updated = [...prev];
                  updated[existingIndex] = {
                    ...updated[existingIndex],
                    ...keysToUse.reduce((acc, key) => {
                      if (extractedData[key] !== undefined) acc[key] = extractedData[key];
                      return acc;
                    }, {})
                  };
                  return updated;
                } else {
                  const newPoint = {
                    timestamp: new Date(timestamp * 1000).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
                    timestampValue: timestamp,
                    ...keysToUse.reduce((acc, key) => {
                      if (extractedData[key] !== undefined) acc[key] = extractedData[key];
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
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--bdu-muted)' }}>
        Đang tải...
      </div>
    );
  }



  return (
    <div style={{ width: '100%', height: '100%', padding: '12px' }}>
      {widget.ten_widget && (
        <h4 style={{ color: 'var(--bdu-text)', margin: '0 0 12px 0', fontSize: '14px' }}>
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
            console.log('[GaugeWidget] WS received:', newData);
            
            if (newData.device_id === deviceId) {
              // Try to find the dataKey value in various formats
              let rawValue = null;
              if (newData[dataKey] !== undefined) {
                rawValue = newData[dataKey];
              } else {
                // Search for the key in the object
                const foundKey = Object.keys(newData).find(k => k.toLowerCase() === dataKey.toLowerCase());
                if (foundKey) rawValue = newData[foundKey];
              }
              
              if (rawValue != null) {
                setData(unwrapValue(rawValue));
              }
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
      {widget.ten_widget && (
        <h4 style={{ color: 'var(--bdu-text)', margin: '0 0 16px 0', fontSize: '14px' }}>
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
            console.log('[StatCardWidget] WS received:', newData);
            
            if (newData.device_id === deviceId) {
              // Try to find the dataKey value in various formats
              let rawValue = null;
              if (newData[dataKey] !== undefined) {
                rawValue = newData[dataKey];
              } else {
                // Search for the key in the object
                const foundKey = Object.keys(newData).find(k => k.toLowerCase() === dataKey.toLowerCase());
                if (foundKey) rawValue = newData[foundKey];
              }
              
              if (rawValue != null) {
                setData(unwrapValue(rawValue));
              }
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
      <div style={{ fontSize: '40px', fontWeight: 'bold', color: 'var(--bdu-cyan)', marginBottom: '8px' }}>
        {data?.toFixed(1) || '--'}
      </div>
      <div style={{ fontSize: '14px', color: 'var(--bdu-muted)' }}>
        {widget.cau_hinh?.label || widget.ten_widget || 'Value'}
      </div>
      <div style={{ fontSize: '12px', color: 'var(--bdu-muted)', marginTop: '4px' }}>
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
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--bdu-muted)' }}>
        Đang tải...
      </div>
    );
  }

  const dataKeys = widget.cau_hinh?.data_keys || [];

  return (
    <div style={{ width: '100%', height: '100%', padding: '12px', overflow: 'auto' }}>
      {widget.ten_widget && (
        <h4 style={{ color: 'var(--bdu-text)', margin: '0 0 12px 0', fontSize: '14px' }}>
          {widget.ten_widget}
        </h4>
      )}
      <table style={{ width: '100%', fontSize: '12px', color: 'var(--bdu-text)', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ borderBottom: '1px solid #1f2a44' }}>
            <th style={{ padding: '8px', textAlign: 'left', color: 'var(--bdu-muted)', fontWeight: '600' }}>Thời gian</th>
            {dataKeys.map(key => (
              <th key={key} style={{ padding: '8px', textAlign: 'left', color: 'var(--bdu-muted)', fontWeight: '600' }}>
                {key}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.length === 0 ? (
            <tr>
              <td colSpan={dataKeys.length + 1} style={{ padding: '20px', textAlign: 'center', color: 'var(--bdu-muted)' }}>
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
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--bdu-muted)' }}>
        Đang tải...
      </div>
    );
  }

  return (
    <div style={{ width: '100%', height: '100%', padding: '12px' }}>
      {widget.ten_widget && (
        <h4 style={{ color: 'var(--bdu-text)', margin: '0 0 12px 0', fontSize: '14px', textAlign: 'center' }}>
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
          <Tooltip contentStyle={{ backgroundColor: 'var(--bdu-card)', border: '1px solid var(--bdu-card-border)', color: 'var(--bdu-text)' }} />
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
      borderRadius: '8px',
      padding: '8px'
    };

    switch (widget.widget_type) {
      // Existing widgets
      case 'line_chart':
        return <div style={style} className="db-widget-wrap"><LineChartWidget widget={widget} token={token} dashboardId={dashboardId} /></div>;
      case 'bar_chart':
        return <div style={style} className="db-widget-wrap"><BarChartWidget widget={widget} token={token} dashboardId={dashboardId} /></div>;
      case 'gauge':
        return <div style={style} className="db-widget-wrap"><GaugeWidget widget={widget} token={token} dashboardId={dashboardId} /></div>;
      case 'stat_card':
        return <div style={style} className="db-widget-wrap"><StatCardWidget widget={widget} token={token} dashboardId={dashboardId} /></div>;
      case 'table':
        return <div style={style} className="db-widget-wrap"><TableWidget widget={widget} token={token} dashboardId={dashboardId} /></div>;
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

  if (loading) return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--bdu-muted)' }}>Đang tải...</div>;
  if (!xKey || !yKey) return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--bdu-muted)', fontSize: 12 }}>⚠️ Chưa cấu hình X/Y key</div>;

  const xs = data.map(d => d.x), ys = data.map(d => d.y);
  const minX = xs.length ? Math.min(...xs) : 0, maxX = xs.length ? Math.max(...xs) : 1;
  const minY = ys.length ? Math.min(...ys) : 0, maxY = ys.length ? Math.max(...ys) : 1;
  const px = x => 8 + ((x - minX) / ((maxX - minX) || 1)) * 84;
  const py = y => 78 - ((y - minY) / ((maxY - minY) || 1)) * 68;

  return (
    <div style={{ width: '100%', height: '100%', padding: '12px' }}>
      {widget.ten_widget && <h4 style={{ color: 'var(--bdu-text)', margin: '0 0 8px 0', fontSize: 14 }}>{widget.ten_widget}</h4>}
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
  const deviceId = widget.cau_hinh?.device_id;
  const xDataKey = widget.cau_hinh?.x_datakey || 'joystick_x';
  const yDataKey = widget.cau_hinh?.y_datakey || 'joystick_y';

  const handleMouseDown = (e) => {
    setIsDragging(true);
    updatePosition(e);
  };

  const updatePosition = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
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
        await fetch(`${process.env.REACT_APP_API_BASE || 'http://localhost:8000'}/api/device/${deviceId}/control`, {
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
        await fetch(`${process.env.REACT_APP_API_BASE || 'http://localhost:8000'}/api/device/${deviceId}/control`, {
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
        await fetch(`${process.env.REACT_APP_API_BASE || 'http://localhost:8000'}/api/device/${deviceId}/control`, {
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

  useEffect(() => {
    // Load data periodically
    const loadData = async () => {
      if (!deviceId) return;
      try {
        const res = await fetchWidgetData(dashboardId, widget.id, '1h', null, token);
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
  }, [deviceId, dataKey, lineCount]);

  const bgColor = widget.cau_hinh?.bg_color || '#1a3a2a';
  const textColor = widget.cau_hinh?.text_color || '#00ff88';

  return (
    <div style={{ width: '100%', height: '100%', padding: '12px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
      {widget.ten_widget && <h4 style={{ color: 'var(--bdu-text)', margin: '0 0 8px 0', fontSize: '14px' }}>{widget.ten_widget}</h4>}
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

  useEffect(() => {
    const loadData = async () => {
      if (!deviceId) return;
      try {
        const res = await fetchWidgetData(dashboardId, widget.id, '1h', null, token);
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
  }, [deviceId, dataKey]);

  const ledColor = widget.cau_hinh?.color || '#22c55e';

  return (
    <div style={{ width: '100%', height: '100%', padding: '12px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
      {widget.ten_widget && <h4 style={{ color: 'var(--bdu-text)', margin: '0 0 8px 0', fontSize: '14px' }}>{widget.ten_widget}</h4>}
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
        console.error('GradientRamp load error:', err);
      }
    };
    loadData();
    const interval = setInterval(loadData, 5000);
    return () => clearInterval(interval);
  }, [deviceId, dataKey]);

  const percentage = Math.min(100, Math.max(0, ((value - min) / (max - min)) * 100));

  const getColor = (pct) => {
    const r = Math.round(parseInt(lowColor.slice(1, 3), 16) + (parseInt(highColor.slice(1, 3), 16) - parseInt(lowColor.slice(1, 3), 16)) * pct / 100);
    const g = Math.round(parseInt(lowColor.slice(3, 5), 16) + (parseInt(highColor.slice(3, 5), 16) - parseInt(lowColor.slice(3, 5), 16)) * pct / 100);
    const b = Math.round(parseInt(lowColor.slice(5, 7), 16) + (parseInt(highColor.slice(5, 7), 16) - parseInt(lowColor.slice(5, 7), 16)) * pct / 100);
    return `rgb(${r}, ${g}, ${b})`;
  };

  return (
    <div style={{ width: '100%', height: '100%', padding: '12px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
      {widget.ten_widget && <h4 style={{ color: 'var(--bdu-text)', margin: '0 0 8px 0', fontSize: '14px' }}>{widget.ten_widget}</h4>}
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
  const streamUrl = widget.cau_hinh?.stream_url || '';
  const autoplay = widget.cau_hinh?.autoplay !== false;
  const muted = widget.cau_hinh?.muted !== false;

  if (!streamUrl) {
    return (
      <div style={{ width: '100%', height: '100%', padding: '12px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        {widget.ten_widget && <h4 style={{ color: 'var(--bdu-text)', margin: '0 0 8px 0', fontSize: '14px' }}>{widget.ten_widget}</h4>}
        <div style={{ color: 'var(--bdu-muted)', fontSize: '12px', textAlign: 'center' }}>
          <div style={{ fontSize: '32px', marginBottom: '8px' }}>📹</div>
          Chưa cấu hình URL stream
        </div>
      </div>
    );
  }

  return (
    <div style={{ width: '100%', height: '100%', padding: '8px', display: 'flex', flexDirection: 'column' }}>
      {widget.ten_widget && <h4 style={{ color: 'var(--bdu-text)', margin: '0 0 4px 0', fontSize: '14px' }}>{widget.ten_widget}</h4>}
      <div style={{ flex: 1, position: 'relative', borderRadius: '8px', overflow: 'hidden', background: '#000' }}>
        {streamUrl.toLowerCase().includes('.m3u8') ? (
          <video
            key={streamUrl}
            style={{ width: '100%', height: '100%', objectFit: 'contain' }}
            autoPlay={autoplay}
            muted={muted}
            controls
            onError={() => setError(true)}
          >
            <source src={streamUrl} type="application/x-mpegURL" />
          </video>
        ) : streamUrl.toLowerCase().includes('.jpg') || streamUrl.toLowerCase().includes('.jpeg') || streamUrl.toLowerCase().includes('.png') ? (
          <img
            src={streamUrl}
            alt="Stream"
            style={{ width: '100%', height: '100%', objectFit: 'contain' }}
            onError={() => setError(true)}
          />
        ) : (
          <img
            key={streamUrl + Date.now()}
            src={`${streamUrl}?t=${Date.now()}`}
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
            Không thể kết nối stream
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
        await fetch(`${process.env.REACT_APP_API_BASE || 'http://localhost:8000'}/api/device/${deviceId}/control`, {
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
      await fetch(`${process.env.REACT_APP_API_BASE || 'http://localhost:8000'}/api/device/${deviceId}/control`, {
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
      await fetch(`${process.env.REACT_APP_API_BASE || 'http://localhost:8000'}/api/device/${deviceId}/control`, {
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
        await fetch(`${process.env.REACT_APP_API_BASE || 'http://localhost:8000'}/api/device/${deviceId}/control`, {
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
