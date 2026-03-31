import React, { useState, useEffect, useCallback } from 'react';
import { fetchDashboard, fetchDevices, createWidget, updateWidget, deleteWidget } from '../../services';
import Toolbar, { WIDGET_TYPES } from './Toolbar';
import Canvas from './Canvas';
import WidgetEditor from './WidgetEditor';

export default function DashboardBuilder({ dashboardId, token, onBack, onSave }) {
  const [dashboard, setDashboard] = useState(null);
  const [widgets, setWidgets] = useState([]);
  const [devices, setDevices] = useState([]);
  const [selectedWidget, setSelectedWidget] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Load dashboard and widgets
  const loadDashboard = useCallback(async () => {
    setLoading(true);
    try {
      const [dashboardRes, devicesRes] = await Promise.all([
        fetchDashboard(dashboardId, token),
        fetchDevices(token)
      ]);
      
      setDashboard(dashboardRes.data);
      setWidgets(dashboardRes.data.widgets || []);
      setDevices(devicesRes.data.devices || []);
    } catch (err) {
      console.error('Failed to load dashboard:', err);
      alert('Không thể tải dashboard');
    } finally {
      setLoading(false);
    }
  }, [dashboardId, token]);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  // Handle adding new widget from toolbar
  const handleAddWidget = async (widgetType) => {
    const newWidget = {
      id: `temp-${Date.now()}`,
      widget_type: widgetType.type,
      ten_widget: widgetType.name,
      vi_tri_x: 0,
      vi_tri_y: 0,
      chieu_rong: widgetType.defaultSize.w,
      chieu_cao: widgetType.defaultSize.h,
      cau_hinh: {
        device_id: '',
        data_keys: [],
        time_range: '1h'
      },
      thu_tu: widgets.length
    };

    setWidgets([...widgets, newWidget]);
    setSelectedWidget(newWidget);
  };

  // Handle widget selection
  const handleWidgetSelect = (widget) => {
    setSelectedWidget(widget);
  };

  // Handle widget save from editor
  const handleWidgetSave = async (updatedWidget) => {
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/b79dabf1-b019-4647-a912-96914bd03449',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'DashboardBuilder.js:100',message:'handleWidgetSave entry',data:{widget_id:updatedWidget.id,isTemp:updatedWidget.id.toString().startsWith('temp-'),dashboard_id:dashboardId},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
    // #endregion
    try {
      setSaving(true);
      
      if (updatedWidget.id.toString().startsWith('temp-')) {
        // New widget - create it
        const { id, ...widgetData } = updatedWidget;
        const res = await createWidget(dashboardId, {
          widget_type: widgetData.widget_type,
          ten_widget: widgetData.ten_widget,
          vi_tri_x: widgetData.vi_tri_x,
          vi_tri_y: widgetData.vi_tri_y,
          chieu_rong: widgetData.chieu_rong,
          chieu_cao: widgetData.chieu_cao,
          cau_hinh: widgetData.cau_hinh,
          thu_tu: widgetData.thu_tu
        }, token);
        
        // Replace temp widget with real one
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/b79dabf1-b019-4647-a912-96914bd03449',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'DashboardBuilder.js:115',message:'handleWidgetSave create success',data:{widget_id:res.data.widget?.id,dashboard_id:dashboardId},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
        // #endregion
        setWidgets(widgets.map(w => w.id === id ? res.data.widget : w));
        setSelectedWidget(null);
      } else {
        // Existing widget - update it
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/b79dabf1-b019-4647-a912-96914bd03449',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'DashboardBuilder.js:120',message:'handleWidgetSave update starting',data:{widget_id:updatedWidget.id,dashboard_id:dashboardId},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
        // #endregion
        await updateWidget(dashboardId, updatedWidget.id, {
          widget_type: updatedWidget.widget_type,
          ten_widget: updatedWidget.ten_widget,
          vi_tri_x: updatedWidget.vi_tri_x,
          vi_tri_y: updatedWidget.vi_tri_y,
          chieu_rong: updatedWidget.chieu_rong,
          chieu_cao: updatedWidget.chieu_cao,
          cau_hinh: updatedWidget.cau_hinh,
          thu_tu: updatedWidget.thu_tu
        }, token);
        
        setWidgets(widgets.map(w => w.id === updatedWidget.id ? updatedWidget : w));
        setSelectedWidget(null);
      }
    } catch (err) {
      console.error('Failed to save widget:', err);
      alert(err.response?.data?.detail || 'Lưu widget thất bại');
    } finally {
      setSaving(false);
    }
  };

  // Handle widget delete
  const handleWidgetDelete = async (widgetId) => {
    if (!window.confirm('Bạn có chắc muốn xóa widget này?')) {
      return;
    }

    try {
      // If it's a temp widget, just remove from state
      if (widgetId.toString().startsWith('temp-')) {
        setWidgets(widgets.filter(w => w.id !== widgetId));
        if (selectedWidget?.id === widgetId) {
          setSelectedWidget(null);
        }
        return;
      }

      // Real widget - delete from backend
      await deleteWidget(dashboardId, widgetId, token);
      setWidgets(widgets.filter(w => w.id !== widgetId));
      if (selectedWidget?.id === widgetId) {
        setSelectedWidget(null);
      }
    } catch (err) {
      console.error('Failed to delete widget:', err);
      alert(err.response?.data?.detail || 'Xóa widget thất bại');
    }
  };

  // Handle layout change (drag & drop)
  const handleLayoutChange = async (updatedWidgets) => {
    setWidgets(updatedWidgets);
    
    // Save layout changes to backend (only for existing widgets)
    try {
      const updatePromises = updatedWidgets
        .filter(w => !w.id.toString().startsWith('temp-'))
        .map(widget => 
          updateWidget(dashboardId, widget.id, {
            vi_tri_x: widget.vi_tri_x,
            vi_tri_y: widget.vi_tri_y,
            chieu_rong: widget.chieu_rong,
            chieu_cao: widget.chieu_cao
          }, token)
        );
      
      await Promise.all(updatePromises);
    } catch (err) {
      console.error('Failed to save layout:', err);
    }
  };

  if (loading) {
    return (
      <div style={{ padding: '40px', textAlign: 'center', color: '#e5e7eb' }}>
        <p>Đang tải...</p>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', height: '100vh', background: '#090f1f' }}>
      {/* Toolbar */}
      <Toolbar onAddWidget={handleAddWidget} />

      {/* Canvas */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        {/* Header */}
        <div style={{
          padding: '16px 20px',
          background: '#0b1224',
          borderBottom: '1px solid #1f2a44',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <div>
            <button
              onClick={onBack}
              style={{
                marginRight: '16px',
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
            <h2 style={{ display: 'inline', color: '#e5e7eb', margin: 0 }}>
              {dashboard?.ten_dashboard || 'Dashboard Builder'}
            </h2>
          </div>
          <div>
            {saving && <span style={{ color: '#9ca3af', marginRight: '16px' }}>Đang lưu...</span>}
            <button
              onClick={() => {
                if (onSave) onSave();
                else onBack();
              }}
              style={{
                padding: '10px 20px',
                background: 'linear-gradient(135deg, #0ea5e9, #22d3ee)',
                border: 'none',
                borderRadius: '6px',
                color: '#0b1224',
                fontWeight: '600',
                cursor: 'pointer'
              }}
            >
              Lưu Dashboard
            </button>
          </div>
        </div>

        {/* Canvas Area */}
        <Canvas
          widgets={widgets}
          onLayoutChange={handleLayoutChange}
          onWidgetSelect={handleWidgetSelect}
          onWidgetDelete={handleWidgetDelete}
          token={token}
          dashboardId={dashboardId}
        />
      </div>

      {/* Widget Editor Panel */}
      {selectedWidget && (
        <WidgetEditor
          widget={selectedWidget}
          devices={devices}
          token={token}
          onSave={handleWidgetSave}
          onCancel={() => setSelectedWidget(null)}
        />
      )}
    </div>
  );
}

