import React, { useState, useEffect, useCallback } from 'react';
import { Responsive, WidthProvider } from 'react-grid-layout';
import { fetchDashboard } from '../../services';
import WidgetRenderer from './WidgetRenderer';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';

const ResponsiveGridLayout = WidthProvider(Responsive);

const API_BASE = process.env.REACT_APP_API_BASE || 'http://localhost:8000';
const WS_URL = `${API_BASE.replace(/^http/i, 'ws')}/ws/events`;

export default function DashboardViewer({ dashboardId, token, onBack }) {
  const [dashboard, setDashboard] = useState(null);
  const [widgets, setWidgets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadDashboard = useCallback(async () => {
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/b79dabf1-b019-4647-a912-96914bd03449',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'DashboardViewer.js:20',message:'loadDashboard entry',data:{dashboard_id:dashboardId,hasToken:!!token},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'})}).catch(()=>{});
    // #endregion
    setLoading(true);
    setError('');
    try {
      const res = await fetchDashboard(dashboardId, token);
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/b79dabf1-b019-4647-a912-96914bd03449',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'DashboardViewer.js:25',message:'loadDashboard success',data:{dashboard_id:dashboardId,widgets_count:res.data?.widgets?.length||0},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'})}).catch(()=>{});
      // #endregion
      setDashboard(res.data);
      setWidgets(res.data.widgets || []);
    } catch (err) {
      console.error('Failed to load dashboard:', err);
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/b79dabf1-b019-4647-a912-96914bd03449',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'DashboardViewer.js:30',message:'loadDashboard error',data:{dashboard_id:dashboardId,error:err.message,status:err.response?.status},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'})}).catch(()=>{});
      // #endregion
      setError('Không thể tải dashboard');
    } finally {
      setLoading(false);
    }
  }, [dashboardId, token]);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  // WebSocket for real-time updates with reconnection
  useEffect(() => {
    if (!token || widgets.length === 0) return;

    let ws = null;
    let reconnectTimer = null;
    let reconnectAttempts = 0;
    const MAX_RECONNECT_ATTEMPTS = 5;
    const RECONNECT_DELAY = 3000;

    const connect = () => {
      try {
        ws = new WebSocket(WS_URL);
        
        ws.onopen = () => {
          console.log('[DashboardViewer] WebSocket connected');
          reconnectAttempts = 0;
        };

        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            // WebSocket data will trigger widget re-fetch automatically
            // Widgets have their own refresh intervals
          } catch (err) {
            console.error('WebSocket parse error:', err);
          }
        };

        ws.onerror = (err) => {
          console.error('WebSocket error:', err);
        };

        ws.onclose = () => {
          console.log('[DashboardViewer] WebSocket disconnected');
          ws = null;
          
          // Reconnect logic
          if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
            reconnectAttempts++;
            reconnectTimer = setTimeout(() => {
              console.log(`[DashboardViewer] Reconnecting... (${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})`);
              connect();
            }, RECONNECT_DELAY);
          } else {
            console.warn('[DashboardViewer] Max reconnection attempts reached');
          }
        };
      } catch (err) {
        console.error('[DashboardViewer] WebSocket connection error:', err);
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
  }, [token, widgets.length]);

  if (loading) {
    return (
      <div style={{ padding: '40px', textAlign: 'center', color: '#e5e7eb' }}>
        <p>Đang tải dashboard...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: '40px', textAlign: 'center', color: '#e5e7eb' }}>
        <p style={{ color: '#ef4444' }}>{error}</p>
        <button
          onClick={onBack}
          style={{
            marginTop: '20px',
            padding: '10px 20px',
            background: '#22d3ee',
            border: 'none',
            borderRadius: '6px',
            color: '#0b1224',
            cursor: 'pointer'
          }}
        >
          Quay lại
        </button>
      </div>
    );
  }

  // Convert widgets to grid layout format
  const layouts = {
    lg: widgets.map(w => ({
      i: w.id.toString(),
      x: w.vi_tri_x || 0,
      y: w.vi_tri_y || 0,
      w: w.chieu_rong || 4,
      h: w.chieu_cao || 3,
      static: true // Read-only mode - no drag/resize
    }))
  };

  return (
    <div style={{ minHeight: '100vh', background: '#090f1f' }}>
      {/* Header */}
      <div style={{
        padding: '16px 24px',
        background: '#0b1224',
        borderBottom: '1px solid #1f2a44',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <button
            onClick={onBack}
            style={{
              padding: '8px 16px',
              background: '#111a2d',
              border: '1px solid #1f2a44',
              borderRadius: '6px',
              color: '#22d3ee',
              cursor: 'pointer'
            }}
          >
            ← Quay lại
          </button>
          <div>
            <h1 style={{ color: '#e5e7eb', margin: 0, fontSize: '20px' }}>
              {dashboard?.icon && (
                <span style={{ marginRight: '8px' }}>
                  {dashboard.icon === 'dashboard' && '📊'}
                  {dashboard.icon === 'chart' && '📈'}
                  {dashboard.icon === 'monitor' && '🖥️'}
                  {dashboard.icon === 'home' && '🏠'}
                  {dashboard.icon === 'building' && '🏢'}
                  {dashboard.icon === 'garden' && '🌿'}
                  {dashboard.icon === 'classroom' && '🏫'}
                  {dashboard.icon === 'factory' && '🏭'}
                </span>
              )}
              {dashboard?.ten_dashboard || 'Dashboard'}
            </h1>
            {dashboard?.mo_ta && (
              <p style={{ color: '#9ca3af', margin: '4px 0 0 0', fontSize: '13px' }}>
                {dashboard.mo_ta}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Canvas */}
      <div style={{ padding: '20px' }}>
        {widgets.length === 0 ? (
          <div style={{
            textAlign: 'center',
            padding: '60px 20px',
            color: '#9ca3af',
            background: 'rgba(15, 23, 42, 0.5)',
            border: '1px dashed #1f2a44',
            borderRadius: '12px'
          }}>
            <div style={{ fontSize: '48px', marginBottom: '16px' }}>📊</div>
            <h3 style={{ color: '#e5e7eb', marginBottom: '8px' }}>Dashboard trống</h3>
            <p>Chưa có widget nào trong dashboard này</p>
          </div>
        ) : (
          <ResponsiveGridLayout
            className="layout"
            layouts={layouts}
            breakpoints={{ lg: 1200, md: 996, sm: 768, xs: 480, xxs: 0 }}
            cols={{ lg: 12, md: 10, sm: 6, xs: 4, xxs: 2 }}
            rowHeight={60}
            isDraggable={false}
            isResizable={false}
            style={{ minHeight: '100%' }}
          >
            {widgets.map(widget => (
              <div key={widget.id} style={{ background: 'transparent' }}>
                <WidgetRenderer
                  widget={widget}
                  token={token}
                  dashboardId={dashboardId}
                />
              </div>
            ))}
          </ResponsiveGridLayout>
        )}
      </div>
    </div>
  );
}

