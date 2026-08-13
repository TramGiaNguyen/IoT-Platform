import React, { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import { API_BASE } from '../../config/api';
import { fetchAIDevicesSummary } from '../../services';
import { useAIDeviceData } from '../../context/RealtimeProvider';
import { LineChart, Line, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import './AIAnalytics.css';

// ============================================
// Severity helpers (dùng chung cho list + detail)
// ============================================
function getSeverityColor(severity) {
  switch (severity) {
    case 'critical': return '#dc2626';
    case 'high': return '#ea580c';
    case 'medium': return '#ca8a04';
    case 'low': return '#65a30d';
    default: return '#6b7280';
  }
}

const STATUS_LABEL = {
  ACTIVE: 'Đã học',
  LEARNING: 'Đang học',
  DISCOVERED: 'Mới phát hiện',
  DRIFTED: 'Drift',
  DEGRADED: 'Suy giảm',
  NONE: 'Chưa phân tích',
};

// ============================================
// AIAnalytics wrapper — chọn list hoặc detail theo prop
// ============================================
const AIAnalytics = ({ token, devices, onBack, onOpenAlerts, selectedDeviceId, onSelectDevice }) => {
  if (!selectedDeviceId) {
    return (
      <AIDeviceList
        token={token}
        onBack={onBack}
        onSelectDevice={onSelectDevice}
        onOpenAlerts={onOpenAlerts}
      />
    );
  }
  return (
    <AIAnalyticsDetail
      token={token}
      deviceId={selectedDeviceId}
      onBack={() => onSelectDevice && onSelectDevice(null)}
      onOpenAlerts={onOpenAlerts}
    />
  );
};

// ============================================
// AIDeviceList — danh sách thiết bị (entry page)
// ============================================
const AIDeviceList = ({ token, onBack, onSelectDevice, onOpenAlerts }) => {
  const [summary, setSummary] = useState({ devices: [], total: 0, online_count: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all'); // all | analyzed | alerts | offline

  const loadSummary = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchAIDevicesSummary(token);
      setSummary({
        devices: data?.devices || [],
        total: data?.total || 0,
        online_count: data?.online_count || 0,
      });
    } catch (err) {
      console.error('Failed to load AI summary', err);
      setError('Không thể tải danh sách thiết bị. Vui lòng thử lại.');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { loadSummary(); }, [loadSummary]);

  // Update individual device in list when WebSocket event received (no full reload)
  const handleDeviceUpdate = useCallback((updatedDevice) => {
    setSummary(prev => ({
      ...prev,
      devices: prev.devices.map(d =>
        d.ma_thiet_bi === updatedDevice.ma_thiet_bi ? { ...d, ...updatedDevice } : d
      )
    }));
  }, []);

  const filtered = (summary.devices || []).filter(d => {
    if (search) {
      const q = search.toLowerCase();
      const hay = `${d.ma_thiet_bi || ''} ${d.ten_thiet_bi || ''} ${d.ten_phong || ''}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    if (filter === 'analyzed') return d.analyzed;
    if (filter === 'alerts') return (d.anomaly_count_24h > 0) || (d.alert_unresolved_count > 0);
    if (filter === 'offline') return d.trang_thai !== 'online';
    return true;
  });

  return (
    <div className="rules-container">
      <div className="rules-header">
        <button type="button" className="back-btn-ghost" onClick={onBack}>← Quay lại</button>
        <div className="rules-actions">
          <button
            type="button"
            className="primary-btn"
            onClick={loadSummary}
            disabled={loading}
            title="Tải lại"
          >
            <span className="material-symbols-outlined" style={{ fontSize: 16, verticalAlign: 'middle', marginRight: 4 }}>
              refresh
            </span>
            Làm mới
          </button>
        </div>
      </div>

      <div className="ai-page-title">
        <span className="material-symbols-outlined" style={{ color: '#8b5cf6' }}>psychology</span>
        <div>
          <h2>AI Analytics</h2>
          <div className="ai-page-subtitle">
            Phân tích thông minh, dự đoán xu hướng và phát hiện bất thường
          </div>
        </div>
      </div>

      <div className="ai-summary-stats">
        <div className="ai-stat-card">
          <span className="ai-stat-label">Tổng thiết bị</span>
          <span className="ai-stat-value">{summary.total}</span>
        </div>
        <div className="ai-stat-card online">
          <span className="ai-stat-label">Đang online</span>
          <span className="ai-stat-value">{summary.online_count}</span>
        </div>
        <div className="ai-stat-card alerts">
          <span className="ai-stat-label">Có cảnh báo</span>
          <span className="ai-stat-value">
            {(summary.devices || []).filter(d =>
              (d.anomaly_count_24h > 0) || (d.alert_unresolved_count > 0)
            ).length}
          </span>
        </div>
      </div>

      <div className="ai-filter-bar">
        <input
          type="text"
          className="filter-input"
          placeholder="Tìm theo tên, mã thiết bị hoặc phòng..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          className="filter-select"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        >
          <option value="all">Tất cả</option>
          <option value="analyzed">Đã phân tích</option>
          <option value="alerts">Có cảnh báo</option>
          <option value="offline">Offline</option>
        </select>
      </div>

      {loading ? (
        <div className="ai-device-grid">
          {[1, 2, 3, 4, 5, 6].map(i => (
            <div key={i} className="ai-device-card ai-skeleton">
              <div className="ai-skeleton-line" style={{ width: '60%' }} />
              <div className="ai-skeleton-line" style={{ width: '40%' }} />
              <div className="ai-skeleton-line" style={{ width: '80%' }} />
            </div>
          ))}
        </div>
      ) : error ? (
        <div className="empty-state">
          <span className="material-symbols-outlined" style={{ color: '#fca5a5' }}>error</span>
          <p>{error}</p>
          <button type="button" className="primary-btn" onClick={loadSummary}>Thử lại</button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="empty-state">
          <span className="material-symbols-outlined">devices</span>
          <p>
            {summary.total === 0
              ? 'Chưa có thiết bị nào. Hãy đăng ký thiết bị tại menu Thiết bị.'
              : 'Không có thiết bị nào khớp với bộ lọc.'}
          </p>
        </div>
      ) : (
        <div className="ai-device-grid">
          {filtered.map(d => (
            <AIDeviceCard
              key={d.ma_thiet_bi}
              device={d}
              onClick={() => onSelectDevice && onSelectDevice(d.ma_thiet_bi)}
              onOpenAlerts={onOpenAlerts}
            />
          ))}
        </div>
      )}
    </div>
  );
};

// ============================================
// AIDeviceCard — card hiển thị 1 thiết bị trong list (realtime update)
// ============================================
const AIDeviceCard = ({ device: initialDevice, onClick, onOpenAlerts }) => {
  const [device, setDevice] = useState(initialDevice);
  const aiData = useAIDeviceData(device.ma_thiet_bi);

  // Update device data when WebSocket event received
  useEffect(() => {
    if (aiData.lastUpdate && device.ma_thiet_bi) {
      // Fetch updated summary for this device
      const token = localStorage.getItem('token');
      if (token) {
        axios.get(`${API_BASE}/api/ai/devices/${device.ma_thiet_bi}/summary`, {
          headers: { Authorization: `Bearer ${token}` }
        }).then(res => {
          if (res.data) {
            setDevice(prev => ({ ...prev, ...res.data }));
          }
        }).catch(err => {
          console.debug('[AIDeviceCard] Failed to fetch update:', err.message);
        });
      }
    }
  }, [aiData.lastUpdate, device.ma_thiet_bi]);

  const sev = device.max_severity;
  const cardClass =
    sev === 'critical' ? 'has-critical'
    : sev === 'high' ? 'has-high'
    : sev === 'medium' ? 'has-medium'
    : '';

  const totalAlerts = (device.anomaly_count_24h || 0) + (device.alert_unresolved_count || 0);

  return (
    <div className={`ai-device-card ${cardClass}`} onClick={onClick} role="button" tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick && onClick(); } }}
    >
      <div className="ai-card-top">
        <div className="ai-card-title">
          <span className={`status-dot status-${device.trang_thai || 'offline'}`} />
          <span className="ai-card-name">{device.ten_thiet_bi || device.ma_thiet_bi}</span>
        </div>
        {sev && (
          <span className="severity-badge" style={{ backgroundColor: getSeverityColor(sev) }}>
            {sev}
          </span>
        )}
      </div>

      <div className="ai-card-meta">
        <code className="ai-card-code">{device.ma_thiet_bi}</code>
        {device.ten_phong && <span className="ai-card-room">{device.ten_phong}</span>}
      </div>

      <div className="ai-card-status">
        <span className={`status-badge ${device.analyzed ? 'status-active' : 'status-none'}`}>
          {STATUS_LABEL[device.status_overall] || STATUS_LABEL.NONE}
        </span>
        {device.last_seen && (
          <span className="ai-card-lastseen">
            {(() => {
              try { return new Date(device.last_seen).toLocaleString(); }
              catch { return device.last_seen; }
            })()}
          </span>
        )}
      </div>

      <div className="ai-card-pills">
        <span className="ai-stat-pill" title="Số metric đã được AI khám phá">
          <span className="material-symbols-outlined" style={{ fontSize: 14 }}>tune</span>
          {device.metrics_count || 0} metric
        </span>
        <span className={`ai-stat-pill ${totalAlerts > 0 ? 'has-alert' : ''}`} title="Anomaly 24h + AI alert đang mở">
          <span className="material-symbols-outlined" style={{ fontSize: 14 }}>warning</span>
          {totalAlerts} cảnh báo
        </span>
      </div>
    </div>
  );
};

// ============================================
// AIAnalyticsDetail — wrapper cho 5 tab (giữ logic cũ, bỏ auto-select)
// ============================================
const AIAnalyticsDetail = ({ token, deviceId, onBack, onOpenAlerts }) => {
  const [activeTab, setActiveTab] = useState('payload');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const [schema, setSchema] = useState(null);
  const [metrics, setMetrics] = useState([]);
  const [anomalies, setAnomalies] = useState([]);
  const [healthIssues, setHealthIssues] = useState([]);
  const [profiles, setProfiles] = useState({});
  const [forecast, setForecast] = useState(null);
  const [thresholdSuggestions, setThresholdSuggestions] = useState([]);

  const [severityFilter, setSeverityFilter] = useState('all');
  const [analyzing, setAnalyzing] = useState(false);

  // Individual fetch states for smooth updates
  const [anomaliesLoading, setAnomaliesLoading] = useState(false);
  const [healthLoading, setHealthLoading] = useState(false);
  const [profilesLoading, setProfilesLoading] = useState(false);

  // Ref to track if component is mounted (prevent state updates after unmount)
  const mountedRef = useRef(true);

  // Fetch functions for each data type (individual updates)
  const fetchSchema = useCallback(async () => {
    try {
      const res = await axios.get(`${API_BASE}/api/ai/devices/${deviceId}/schema`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setSchema(res.status === 200 ? res.data : null);
    } catch (err) {
      if (err.response?.status !== 404) {
        console.debug('[AIAnalytics] Schema fetch error:', err.message);
      }
    }
  }, [deviceId, token]);

  const fetchMetrics = useCallback(async () => {
    try {
      const res = await axios.get(`${API_BASE}/api/ai/devices/${deviceId}/metrics`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setMetrics(Array.isArray(res.data) ? res.data : []);
      return res.data;
    } catch (err) {
      console.debug('[AIAnalytics] Metrics fetch error:', err.message);
      return [];
    }
  }, [deviceId, token]);

  const fetchAnomalies = useCallback(async () => {
    setAnomaliesLoading(true);
    try {
      const res = await axios.get(`${API_BASE}/api/ai/devices/${deviceId}/anomalies`, {
        headers: { Authorization: `Bearer ${token}` },
        params: { limit: 50 }
      });
      setAnomalies(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      console.debug('[AIAnalytics] Anomalies fetch error:', err.message);
    } finally {
      setAnomaliesLoading(false);
    }
  }, [deviceId, token]);

  const fetchHealth = useCallback(async () => {
    setHealthLoading(true);
    try {
      const res = await axios.get(`${API_BASE}/api/ai/devices/${deviceId}/health`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setHealthIssues(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      console.debug('[AIAnalytics] Health fetch error:', err.message);
    } finally {
      setHealthLoading(false);
    }
  }, [deviceId, token]);

  const fetchMetricProfiles = useCallback(async (metricList) => {
    if (!metricList || metricList.length === 0) return;
    setProfilesLoading(true);
    const profilesData = { ...profiles };
    for (const metric of metricList) {
      try {
        const res = await axios.get(`${API_BASE}/api/ai/metrics/${metric.id}/profile`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        profilesData[metric.id] = res.data;
      } catch (err) {
        if (err.response?.status !== 400 && err.response?.status !== 404) {
          console.debug(`[AIAnalytics] Profile fetch error for ${metric.id}:`, err.message);
        }
        profilesData[metric.id] = null;
      }
    }
    setProfiles(profilesData);
    setProfilesLoading(false);
  }, [deviceId, token]);

  // Initial load - fetch all data once
  const fetchDeviceData = useCallback(async () => {
    if (!deviceId) return;
    setLoading(true);
    setError(null);
    try {
      const [schemaRes, metricsRes, anomaliesRes, healthRes] = await Promise.all([
        axios.get(`${API_BASE}/api/ai/devices/${deviceId}/schema`, {
          headers: { Authorization: `Bearer ${token}` }
        }),
        axios.get(`${API_BASE}/api/ai/devices/${deviceId}/metrics`, {
          headers: { Authorization: `Bearer ${token}` }
        }),
        axios.get(`${API_BASE}/api/ai/devices/${deviceId}/anomalies`, {
          headers: { Authorization: `Bearer ${token}` },
          params: { limit: 50 }
        }),
        axios.get(`${API_BASE}/api/ai/devices/${deviceId}/health`, {
          headers: { Authorization: `Bearer ${token}` }
        })
      ]);

      setSchema(schemaRes.status === 200 ? schemaRes.data : null);
      setMetrics(Array.isArray(metricsRes.data) ? metricsRes.data : []);
      setAnomalies(Array.isArray(anomaliesRes.data) ? anomaliesRes.data : []);
      setHealthIssues(Array.isArray(healthRes.data) ? healthRes.data : []);

      if (metricsRes.data && metricsRes.data.length > 0) {
        fetchMetricProfiles(metricsRes.data);
      }
    } catch (err) {
      console.error('Error fetching AI data:', err);
      if (err.response?.status === 401) {
        setError('Phiên đăng nhập hết hạn. Vui lòng đăng nhập lại.');
      } else {
        setError('Không thể tải dữ liệu AI. Vui lòng thử lại.');
      }
    } finally {
      setLoading(false);
    }
  }, [deviceId, token, fetchMetricProfiles]);

  // Initial mount
  useEffect(() => {
    mountedRef.current = true;
    fetchDeviceData();
    return () => {
      mountedRef.current = false;
    };
  }, [fetchDeviceData]);

  const fetchForecast = async (metricId) => {
    try {
      const res = await axios.get(`${API_BASE}/api/ai/metrics/${metricId}/forecast`, {
        headers: { Authorization: `Bearer ${token}` },
        params: { horizon: 60 }
      });
      setForecast(res.data);
    } catch (err) {
      setForecast(null);
    }
  };

  const fetchThresholdSuggestions = async (metricId) => {
    try {
      const res = await axios.get(`${API_BASE}/api/ai/metrics/${metricId}/threshold-suggestions`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setThresholdSuggestions(prev => [...prev.filter(t => t.metric_id !== metricId), res.data]);
    } catch (err) {
      // 400 = insufficient data - normal for new metrics
      if (err.response?.status === 400) {
        console.debug(`[AIAnalytics] No threshold suggestions for metric ${metricId}: insufficient data`);
      } else {
        console.warn(`[AIAnalytics] Failed to fetch threshold suggestions:`, err.message);
      }
    }
  };

  // Polling fallback (30s) - chỉ refresh anomalies và health để tránh nháy
  useEffect(() => {
    mountedRef.current = true;
    const interval = setInterval(() => {
      if (mountedRef.current) {
        fetchAnomalies();
        fetchHealth();
      }
    }, 30000);
    return () => {
      mountedRef.current = false;
      clearInterval(interval);
    };
  }, [fetchAnomalies, fetchHealth]);

  const handleAnalyzeNow = async () => {
    setAnalyzing(true);
    setError(null);
    try {
      await axios.post(`${API_BASE}/api/ai/devices/${deviceId}/discover-schema`, {}, {
        headers: { Authorization: `Bearer ${token}` }
      });
      await fetchDeviceData();
    } catch (err) {
      console.error('Analyze error:', err);
      setError(err.response?.data?.detail || 'Phân tích thất bại. Vui lòng thử lại.');
    } finally {
      setAnalyzing(false);
    }
  };

  const handleMetricClick = (metric) => {
    fetchForecast(metric.id);
    fetchThresholdSuggestions(metric.id);
    setActiveTab('trend');
  };

  const getSeverityBadge = (severity) => (
    <span className="severity-badge" style={{ backgroundColor: getSeverityColor(severity) }}>
      {severity}
    </span>
  );

  const getStatusBadge = (status) => {
    const colors = {
      'DISCOVERED': '#6b7280',
      'LEARNING': '#2563eb',
      'ACTIVE': '#16a34a',
      'DRIFTED': '#ea580c',
      'DEGRADED': '#dc2626'
    };
    return (
      <span
        className="status-badge"
        style={{ backgroundColor: colors[status] || '#6b7280' }}
      >
        {status}
      </span>
    );
  };

  const filteredAnomalies = anomalies.filter(a => {
    if (severityFilter === 'all') return true;
    return a.severity === severityFilter;
  });

  return (
    <div className="rules-container">
      <div className="rules-header">
        <button type="button" className="back-btn-ghost" onClick={onBack}>← Quay lại danh sách</button>
        <div className="rules-actions">
          <button
            type="button"
            className="primary-btn"
            onClick={fetchDeviceData}
            disabled={loading}
            title="Tải lại"
          >
            <span className="material-symbols-outlined" style={{ fontSize: 16, verticalAlign: 'middle', marginRight: 4 }}>
              refresh
            </span>
            Làm mới
          </button>
        </div>
      </div>

      <div className="ai-page-title">
        <span className="material-symbols-outlined" style={{ color: '#8b5cf6' }}>psychology</span>
        <div>
          <h2>{deviceId}</h2>
          <div className="ai-page-subtitle">Phân tích AI cho thiết bị</div>
        </div>
      </div>

      {error && (
        <div className="ai-analytics-error">
          <span className="material-symbols-outlined">error</span>
          {error}
        </div>
      )}

      <div className="ai-analytics-tabs">
        <button className={`tab-btn ${activeTab === 'payload' ? 'active' : ''}`} onClick={() => setActiveTab('payload')}>
          <span className="material-symbols-outlined">data_object</span>
          Dữ liệu
        </button>
        <button className={`tab-btn ${activeTab === 'anomaly' ? 'active' : ''}`} onClick={() => setActiveTab('anomaly')}>
          <span className="material-symbols-outlined">warning</span>
          Bất thường
          {anomalies.length > 0 && <span className="tab-badge">{anomalies.length}</span>}
        </button>
        <button className={`tab-btn ${activeTab === 'trend' ? 'active' : ''}`} onClick={() => setActiveTab('trend')}>
          <span className="material-symbols-outlined">trending_up</span>
          Xu hướng
        </button>
        <button className={`tab-btn ${activeTab === 'thresholds' ? 'active' : ''}`} onClick={() => setActiveTab('thresholds')}>
          <span className="material-symbols-outlined">tune</span>
          Ngưỡng
        </button>
        <button className={`tab-btn ${activeTab === 'health' ? 'active' : ''}`} onClick={() => setActiveTab('health')}>
          <span className="material-symbols-outlined">monitor_heart</span>
          Sức khỏe cảm biến
          {healthIssues.length > 0 && <span className="tab-badge warning">{healthIssues.length}</span>}
        </button>
      </div>

      {/* CTA: phan tich ngay khi chua co schema */}
      {activeTab === 'payload' && !schema && !loading && (
        <div className="ai-analyze-cta">
          <div className="ai-analyze-cta-icon">
            <span className="material-symbols-outlined">auto_awesome</span>
          </div>
          <div className="ai-analyze-cta-body">
            <h3>Thiết bị chưa được phân tích</h3>
            <p>
              Schema sẽ tự động được phát hiện khi thiết bị gửi telemetry.
              Bạn cũng có thể phân tích ngay để xem dữ liệu.
            </p>
          </div>
          <button
            className="primary-btn analyze-now-btn"
            onClick={handleAnalyzeNow}
            disabled={analyzing}
          >
            {analyzing ? (
              <>
                <div className="loading-spinner small"></div>
                Đang phân tích...
              </>
            ) : (
              <>
                <span className="material-symbols-outlined" style={{ fontSize: 16, verticalAlign: 'middle', marginRight: 6 }}>
                  psychology
                </span>
                Phân tích ngay
              </>
            )}
          </button>
        </div>
      )}

      <div className="ai-analytics-content">
        {loading ? (
          <div className="ai-analytics-loading">
            <div className="loading-spinner"></div>
            <span>Đang phân tích...</span>
          </div>
        ) : (
          <>
            {activeTab === 'payload' && (
              <PayloadTab
                schema={schema}
                metrics={metrics}
                onMetricClick={handleMetricClick}
                getStatusBadge={getStatusBadge}
              />
            )}

            {activeTab === 'anomaly' && (
              <AnomalyTab
                anomalies={filteredAnomalies}
                metrics={metrics}
                severityFilter={severityFilter}
                setSeverityFilter={setSeverityFilter}
                getSeverityBadge={getSeverityBadge}
                onOpenAlerts={onOpenAlerts}
              />
            )}

            {activeTab === 'trend' && (
              <TrendTab
                metrics={metrics}
                profiles={profiles}
                forecast={forecast}
                onMetricSelect={handleMetricClick}
              />
            )}

            {activeTab === 'thresholds' && (
              <ThresholdTab
                metrics={metrics}
                profiles={profiles}
                thresholdSuggestions={thresholdSuggestions}
                token={token}
              />
            )}

            {activeTab === 'health' && (
              <HealthTab
                issues={healthIssues}
                getSeverityBadge={getSeverityBadge}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
};

// export cho App.js dùng
export default AIAnalytics;

// ============================================
// Payload Tab Component
// ============================================
const PayloadTab = ({ schema, metrics, onMetricClick, getStatusBadge }) => {
  return (
    <div className="tab-content payload-tab">
      {schema ? (
        <>
          <div className="schema-info">
            <div className="schema-card">
              <h4>Dấu vân tay Schema</h4>
              <code className="schema-hash">{schema.schema_hash}</code>
              <span className="schema-version">v{schema.schema_version}</span>
            </div>
            <div className="schema-card">
              <h4>Định dạng</h4>
              <span className="format-badge">{schema.format}</span>
              <span className="confidence">Độ tin cậy: {(schema.format_confidence * 100).toFixed(0)}%</span>
            </div>
          </div>
          
          <h3>Trường đã khám phá ({schema.fields?.length || 0})</h3>
          <div className="fields-list">
            {schema.fields?.map((field, idx) => (
              <div key={idx} className="field-item">
                <div className="field-path">
                  <code>{field.path}</code>
                </div>
                <div className="field-info">
                  <span className="field-type">{field.data_type}</span>
                  <span className="field-role">{field.role}</span>
                  {field.semantic_type && field.semantic_type !== 'UNKNOWN_NUMERIC' && (
                    <span className="field-semantic" title={`Confidence: ${(field.semantic_confidence * 100).toFixed(0)}%`}>
                      {field.semantic_type}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </>
      ) : (
        <div className="empty-state">
          <span className="material-symbols-outlined">data_object</span>
          <p>Chưa có schema cho thiết bị này</p>
          <p className="hint">Schema sẽ được tự động phát hiện khi thiết bị gửi dữ liệu</p>
        </div>
      )}
      
      {metrics.length > 0 && (
        <>
          <h3>Chỉ số ({metrics.length})</h3>
          <div className="metrics-grid">
            {metrics.map(m => (
              <div 
                key={m.id} 
                className="metric-card"
                onClick={() => onMetricClick(m)}
              >
                <div className="metric-path">{m.source_path}</div>
                <div className="metric-info">
                  {getStatusBadge(m.status)}
                  <span className="metric-type">{m.data_type}</span>
                </div>
                {m.semantic_type && m.semantic_type !== 'UNKNOWN_NUMERIC' && (
                  <div className="metric-semantic">
                    {m.semantic_type} ({(m.semantic_confidence * 100).toFixed(0)}%)
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
};

// ============================================
// Anomaly Tab Component
// ============================================
const AnomalyTab = ({ anomalies, metrics, severityFilter, setSeverityFilter, getSeverityBadge, onOpenAlerts }) => {
  return (
    <div className="tab-content anomaly-tab">
      <div className="anomaly-filters">
        <label>Mức độ nghiêm trọng:</label>
        <select value={severityFilter} onChange={(e) => setSeverityFilter(e.target.value)}>
          <option value="all">Tất cả</option>
          <option value="critical">Nghiêm trọng</option>
          <option value="high">Cao</option>
          <option value="medium">Trung bình</option>
          <option value="low">Thấp</option>
        </select>
      </div>
      
      {anomalies.length > 0 ? (
        <>
          <div className="anomaly-chart">
            <h4>Dòng thời gian bất thường</h4>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={anomalies.slice(0, 50).reverse()}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis 
                  dataKey="timestamp" 
                  tickFormatter={(ts) => new Date(ts).toLocaleTimeString()}
                />
                <YAxis />
                <Tooltip 
                  labelFormatter={(ts) => new Date(ts).toLocaleString()}
                  formatter={(value, name) => [value.toFixed(3), 'Điểm']}
                />
                <Line 
                  type="monotone" 
                  dataKey="score" 
                  stroke="#ea580c" 
                  strokeWidth={2}
                  dot={(props) => {
                    const { cx, cy, payload } = props;
                    return (
                      <circle
                        cx={cx}
                        cy={cy}
                        r={6}
                        fill={getSeverityColor(payload.severity)}
                        stroke="#fff"
                        strokeWidth={2}
                      />
                    );
                  }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
          
          <div className="anomaly-list">
            <h4>Bất thường gần đây ({anomalies.length})</h4>
            {anomalies.map(a => (
              <div key={a.id} className="anomaly-item">
                <div className="anomaly-header">
                  {getSeverityBadge(a.severity)}
                  <span className="anomaly-type">{a.anomaly_type}</span>
                  <span className="anomaly-time">
                    {new Date(a.timestamp).toLocaleString()}
                  </span>
                </div>
                <div className="anomaly-body">
                  <span className="anomaly-value">
                    Giá trị: <strong>{a.value?.toFixed(3)}</strong>
                  </span>
                  <span className="anomaly-score">
                    Điểm: {(a.score * 100).toFixed(1)}%
                  </span>
                </div>
              </div>
            ))}
          </div>
          
          <div className="anomaly-actions">
            <button className="btn-primary" onClick={onOpenAlerts}>
              <span className="material-symbols-outlined">warning</span>
              Xem trong Cảnh báo
            </button>
          </div>
        </>
      ) : (
        <div className="empty-state">
          <span className="material-symbols-outlined">check_circle</span>
          <p>Không có bất thường nào được phát hiện</p>
          <p className="hint">Hệ thống đang theo dõi và phân tích dữ liệu thiết bị</p>
        </div>
      )}
    </div>
  );
};

// ============================================
// Trend Tab Component
// ============================================
const TrendTab = ({ metrics, profiles, forecast, onMetricSelect }) => {
  const selectedMetric = metrics[0]; // For demo, show first metric
  
  return (
    <div className="tab-content trend-tab">
      <div className="trend-header">
        <h4>Phân tích xu hướng</h4>
        <select onChange={(e) => {
          const m = metrics.find(m => m.id === parseInt(e.target.value));
          if (m) onMetricSelect(m);
        }}>
          <option value="">-- Chọn chỉ số --</option>
          {metrics.map(m => (
            <option key={m.id} value={m.id}>{m.source_path}</option>
          ))}
        </select>
      </div>
      
      {forecast ? (
        <div className="forecast-container">
          <div className="forecast-summary">
            <div className="forecast-current">
              <span className="label">Giá trị hiện tại</span>
              <span className="value">{forecast.current_value?.toFixed(2)}</span>
            </div>
            <div className="forecast-trend">
              <span className="label">Xu hướng</span>
              <span className={`trend-badge ${forecast.trend}`}>
                {forecast.trend === 'up' && '↑ Tăng'}
                {forecast.trend === 'down' && '↓ Giảm'}
                {forecast.trend === 'stable' && '→ Ổn định'}
              </span>
            </div>
            <div className="forecast-confidence">
              <span className="label">Độ tin cậy</span>
              <span className="value">{(forecast.confidence * 100).toFixed(0)}%</span>
            </div>
            <div className="forecast-model">
              <span className="label">Mô hình</span>
              <span className="value">{forecast.model}</span>
            </div>
          </div>
          
          {forecast.threshold_crossing && (
            <div className="threshold-alert">
              <span className="material-symbols-outlined">schedule</span>
              <div>
                <strong>Dự đoán vượt ngưỡng</strong>
                <p>
                  Ước tính vượt ngưỡng {forecast.threshold_crossing.threshold?.toFixed(1)} 
                  trong khoảng {forecast.threshold_crossing.estimated_minutes} phút
                  (Độ tin cậy: {forecast.threshold_crossing.confidence * 100}%)
                </p>
              </div>
            </div>
          )}
          
          <div className="forecast-chart">
            <h4>Dự báo</h4>
            <ResponsiveContainer width="100%" height={250}>
              <AreaChart data={Object.entries(forecast.forecast || {}).map(([key, value]) => ({
                time: key,
                value: value
              }))}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="time" />
                <YAxis />
                <Tooltip />
                <Area 
                  type="monotone" 
                  dataKey="value" 
                  stroke="#2563eb" 
                  fill="#2563eb" 
                  fillOpacity={0.3}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      ) : (
        <div className="empty-state">
          <span className="material-symbols-outlined">analytics</span>
          <p>Chưa có dữ liệu dự đoán</p>
          <p className="hint">Chọn một metric để xem phân tích xu hướng</p>
        </div>
      )}
    </div>
  );
};

// ============================================
// Threshold Tab Component
// ============================================
const ThresholdTab = ({ metrics, profiles, thresholdSuggestions, token }) => {
  return (
    <div className="tab-content threshold-tab">
      <h4>Gợi ý ngưỡng</h4>
      
      {thresholdSuggestions.length > 0 ? (
        <div className="threshold-list">
          {thresholdSuggestions.map(ts => (
            <div key={ts.metric_id} className="threshold-item">
              <div className="threshold-header">
                <code>{ts.source_path}</code>
                <span className="method">{ts.method}</span>
              </div>
              <div className="threshold-values">
                <div className="threshold-group">
                  <span className="threshold-label">Cảnh báo</span>
                  <span className="threshold-range">
                    {ts.suggested_warning.low?.toFixed(1)} - {ts.suggested_warning.high?.toFixed(1)}
                  </span>
                </div>
                <div className="threshold-group">
                  <span className="threshold-label">Nghiêm trọng</span>
                  <span className="threshold-range">
                    {ts.suggested_critical.low?.toFixed(1)} - {ts.suggested_critical.high?.toFixed(1)}
                  </span>
                </div>
              </div>
              <p className="threshold-reason">{ts.reason}</p>
              <button className="btn-secondary">
                Áp dụng ngưỡng gợi ý
              </button>
            </div>
          ))}
        </div>
      ) : (
        <div className="empty-state">
          <span className="material-symbols-outlined">tune</span>
          <p>Chưa có gợi ý ngưỡng</p>
          <p className="hint">Ngưỡng sẽ được đề xuất khi có đủ dữ liệu lịch sử</p>
        </div>
      )}
    </div>
  );
};

// ============================================
// Health Tab Component
// ============================================
const HealthTab = ({ issues, getSeverityBadge }) => {
  const getHealthIcon = (type) => {
    switch (type) {
      case 'flatline': return 'waves';
      case 'missing_data': return 'data_array';
      case 'schema_drift': return 'swap_horiz';
      case 'stale_profile': return 'schedule';
      case 'no_profile': return 'help';
      default: return 'warning';
    }
  };
  
  return (
    <div className="tab-content health-tab">
      <h4>Vấn đề sức khỏe cảm biến</h4>
      
      {issues.length > 0 ? (
        <div className="health-list">
          {issues.map((issue, idx) => (
            <div key={idx} className={`health-item ${issue.severity}`}>
              <span className="material-symbols-outlined health-icon">
                {getHealthIcon(issue.type)}
              </span>
              <div className="health-content">
                <div className="health-header">
                  {getSeverityBadge(issue.severity)}
                  <span className="health-type">{issue.type.replace('_', ' ')}</span>
                  {issue.source_path && (
                    <code className="health-path">{issue.source_path}</code>
                  )}
                </div>
                <p className="health-message">{issue.message}</p>
                <span className="health-time">
                  Phát hiện: {new Date(issue.detected_at).toLocaleString()}
                </span>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="empty-state success">
          <span className="material-symbols-outlined">verified</span>
          <p>Tất cả cảm biến đang hoạt động tốt</p>
          <p className="hint">Không phát hiện vấn đề về sức khỏe cảm biến</p>
        </div>
      )}
    </div>
  );
};

// Helper function for severity colors - REMOVED (defined at top for reuse)

