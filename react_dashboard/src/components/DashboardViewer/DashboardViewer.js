import React, { useState, useEffect, useCallback } from 'react';
import GridLayout, { WidthProvider } from 'react-grid-layout';
import { fetchDashboard } from '../../services';
import WidgetRenderer from './WidgetRenderer';
import { WS_URL } from '../../config/api';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';
import '../../styles/dashboard-builder.css';

const ResponsiveGridLayout = WidthProvider(GridLayout);

export default function DashboardViewer({ dashboardId, token, onBack }) {
  const [dashboard, setDashboard] = useState(null);
  const [widgets, setWidgets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editMode, setEditMode] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetchDashboard(dashboardId, token);
      setDashboard(res.data);
      setWidgets(res.data.widgets || []);
    } catch (err) {
      console.error('Failed to load dashboard:', err);
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
      <div className="db-viewer-loading">
        <p>Đang tải dashboard...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="db-viewer-loading">
        <p className="db-viewer-error">{error}</p>
        <button onClick={onBack} className="db-btn-primary" style={{ marginTop: '20px' }}>
          Quay lại
        </button>
      </div>
    );
  }

  // Convert widgets to grid layout format
  const layout = widgets.map(w => ({
    i: w.id.toString(),
    x: w.vi_tri_x || 0,
    y: w.vi_tri_y || 0,
    w: w.chieu_rong || 4,
    h: w.chieu_cao || 3,
    minW: 2,
    minH: 2,
    static: !editMode,
    isBounded: false
  }));

  const handleLayoutChange = (layout) => {
    if (!editMode) return;
    
    // Update widgets with new positions
    const updatedWidgets = widgets.map(widget => {
      const layoutItem = layout.find(item => item.i === widget.id.toString());
      if (layoutItem) {
        return {
          ...widget,
          vi_tri_x: layoutItem.x,
          vi_tri_y: layoutItem.y,
          chieu_rong: layoutItem.w,
          chieu_cao: layoutItem.h
        };
      }
      return widget;
    });
    
    setWidgets(updatedWidgets);
    setHasUnsavedChanges(true);
  };

  const handleSaveLayout = async () => {
    try {
      // Save all widget positions
      const { updateWidget } = await import('../../services');
      
      for (const widget of widgets) {
        await updateWidget(dashboardId, widget.id, {
          vi_tri_x: widget.vi_tri_x,
          vi_tri_y: widget.vi_tri_y,
          chieu_rong: widget.chieu_rong,
          chieu_cao: widget.chieu_cao
        }, token);
      }
      
      setHasUnsavedChanges(false);
      setEditMode(false);
      alert('Đã lưu layout thành công!');
    } catch (err) {
      console.error('Failed to save layout:', err);
      alert('Lưu layout thất bại: ' + (err.response?.data?.detail || err.message));
    }
  };

  const handleCancelEdit = () => {
    if (hasUnsavedChanges) {
      if (!window.confirm('Bạn có thay đổi chưa lưu. Bạn có chắc muốn hủy?')) {
        return;
      }
    }
    setEditMode(false);
    setHasUnsavedChanges(false);
    loadDashboard(); // Reload original layout
  };

  return (
    <div className="db-viewer">
      {/* Header */}
      <div className="db-viewer-header">
        <div className="db-viewer-header-left">
          <button
            onClick={onBack}
            className="db-btn-secondary"
          >
            ← Quay lại
          </button>
          <div>
            <h1 className="db-viewer-title">
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
              <p className="db-viewer-desc">{dashboard.mo_ta}</p>
            )}
          </div>
        </div>

        {/* Edit Mode Controls */}
        <div className="db-viewer-header-right">
          {editMode ? (
            <>
              {hasUnsavedChanges && (
                <span className="db-unsaved-badge">
                  ⚠️ Có thay đổi chưa lưu
                </span>
              )}
              <button
                onClick={handleCancelEdit}
                className="db-btn-danger"
              >
                Hủy
              </button>
              <button
                onClick={handleSaveLayout}
                disabled={!hasUnsavedChanges}
                className={`db-btn-save-layout${!hasUnsavedChanges ? ' disabled' : ''}`}
              >
                💾 Lưu Layout
              </button>
            </>
          ) : (
            <button
              onClick={() => setEditMode(true)}
              className="db-btn-primary"
            >
              ✏️ Chỉnh sửa Layout
            </button>
          )}
        </div>
      </div>

      {/* Canvas */}
      <div className="db-viewer-content">
        {editMode && (
          <div className="db-edit-mode-banner">
            <strong>📝 Chế độ chỉnh sửa:</strong> Kéo và thả các widget để sắp xếp lại. Kéo góc để thay đổi kích thước.
          </div>
        )}

        {widgets.length === 0 ? (
          <div className="db-viewer-empty">
            <div style={{ fontSize: '48px', marginBottom: '16px' }}>📊</div>
            <h3 className="db-viewer-empty-title">Dashboard trống</h3>
            <p>Chưa có widget nào trong dashboard này</p>
          </div>
        ) : (
          <ResponsiveGridLayout
            className="layout"
            layout={layout}
            cols={24}
            rowHeight={40}
            onLayoutChange={handleLayoutChange}
            isDraggable={editMode}
            isResizable={editMode}
            compactType={null}
            preventCollision={true}
            allowOverlap={true}
            style={{ minHeight: '100%' }}
          >
            {widgets.map(widget => (
              <div
                key={widget.id}
                className={`db-viewer-widget${editMode ? ' edit' : ''}`}
              >
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

