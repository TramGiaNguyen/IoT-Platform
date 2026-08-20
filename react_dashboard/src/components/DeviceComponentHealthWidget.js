import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { API_BASE } from '../../config/api';

const DeviceComponentHealthWidget = ({ deviceId, token, onClick }) => {
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const loadSummary = useCallback(async () => {
    if (!deviceId || !token) return;
    try {
      setLoading(true);
      const res = await axios.get(`${API_BASE}/ai/components/${deviceId}/widget-summary`, {
        headers: { Authorization: `Bearer ${token}` },
        timeout: 10000,
      });
      setSummary(res.data);
      setError(null);
    } catch (err) {
      console.error('Error loading health widget:', err);
      setError(err.response?.data?.detail || err.message);
    } finally {
      setLoading(false);
    }
  }, [deviceId, token]);

  useEffect(() => {
    loadSummary();
    // Auto-refresh every 60 seconds
    const interval = setInterval(loadSummary, 60000);
    return () => clearInterval(interval);
  }, [loadSummary]);

  const getStatusColor = (status) => {
    switch (status) {
      case 'healthy': return 'var(--iot-success, #10b981)';
      case 'warning': return 'var(--iot-warn, #f59e0b)';
      case 'critical': return 'var(--iot-danger, #ef4444)';
      default: return 'var(--iot-secondary, #c1c6d7)';
    }
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'healthy': return '✓';
      case 'warning': return '⚠';
      case 'critical': return '✕';
      default: return '?';
    }
  };

  if (loading && !summary) {
    return (
      <div className="health-widget loading">
        <div className="widget-spinner"></div>
        <span>Đang tải...</span>
      </div>
    );
  }

  if (error && !summary) {
    return (
      <div className="health-widget error" onClick={onClick} style={{ cursor: 'pointer' }}>
        <div className="widget-icon unknown">?</div>
        <div className="widget-content">
          <span className="widget-status unknown">Chưa có dữ liệu</span>
        </div>
      </div>
    );
  }

  const status = summary?.status || 'unknown';
  const score = summary?.overall_health_score;
  const components = summary?.top_components || [];
  const issues = summary?.issues_count || 0;

  return (
    <div className="health-widget" onClick={onClick} style={{ cursor: 'pointer' }}>
      <style>{`
        .health-widget {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 12px 16px;
          background: var(--iot-overlay, #171f33);
          border: 1px solid var(--iot-high, #222a3d);
          border-radius: 10px;
          transition: all 0.2s;
        }
        .health-widget:hover {
          border-color: var(--iot-primary, #00e5ff);
          background: var(--iot-panel, #131b2e);
        }
        .health-widget.loading {
          opacity: 0.7;
          cursor: default;
        }
        .widget-icon {
          width: 36px;
          height: 36px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 16px;
          font-weight: bold;
          flex-shrink: 0;
        }
        .widget-icon.healthy {
          background: rgba(16, 185, 129, 0.15);
          color: #10b981;
        }
        .widget-icon.warning {
          background: rgba(245, 158, 11, 0.15);
          color: #f59e0b;
        }
        .widget-icon.critical {
          background: rgba(239, 68, 68, 0.15);
          color: #ef4444;
        }
        .widget-icon.unknown {
          background: rgba(193, 198, 215, 0.15);
          color: #c1c6d7;
        }
        .widget-content {
          flex: 1;
          min-width: 0;
        }
        .widget-status {
          font-size: 13px;
          font-weight: 600;
          text-transform: capitalize;
        }
        .widget-status.healthy { color: #10b981; }
        .widget-status.warning { color: #f59e0b; }
        .widget-status.critical { color: #ef4444; }
        .widget-status.unknown { color: #c1c6d7; }
        .widget-details {
          font-size: 11px;
          color: var(--iot-secondary, #c1c6d7);
          margin-top: 2px;
        }
        .widget-score {
          font-size: 20px;
          font-weight: 700;
          font-family: var(--font-mono, monospace);
          text-align: right;
        }
        .widget-score.healthy { color: #10b981; }
        .widget-score.warning { color: #f59e0b; }
        .widget-score.critical { color: #ef4444; }
        .widget-score.unknown { color: #c1c6d7; }
        .widget-spinner {
          width: 16px;
          height: 16px;
          border: 2px solid var(--iot-high, #222a3d);
          border-top-color: var(--iot-primary, #00e5ff);
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
        }
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        .health-widget.loading {
          display: flex;
          align-items: center;
          gap: 8px;
          color: var(--iot-secondary, #c1c6d7);
          font-size: 12px;
        }
        .health-widget.error {
          border-color: rgba(239, 68, 68, 0.3);
        }
      `}</style>

      <div className={`widget-icon ${status}`}>
        {getStatusIcon(status)}
      </div>

      <div className="widget-content">
        <div className={`widget-status ${status}`}>
          {status === 'unknown' ? 'Chưa phân tích' :
           status === 'healthy' ? 'Tốt' :
           status === 'warning' ? 'Cảnh báo' :
           status === 'critical' ? 'Nguy hiểm' : status}
        </div>
        <div className="widget-details">
          {summary?.component_count || 0} linh kiện
          {issues > 0 && ` • ${issues} vấn đề`}
        </div>
      </div>

      {score !== null && score !== undefined && (
        <div className={`widget-score ${status}`}>
          {Math.round(score * 100)}%
        </div>
      )}
    </div>
  );
};

export default DeviceComponentHealthWidget;
