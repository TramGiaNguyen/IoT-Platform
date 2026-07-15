import React, { useState, useEffect, useCallback } from 'react';
import { fetchDashboard, fetchDevices, fetchMe, createWidget, updateWidget, deleteWidget } from '../../services';
import Toolbar, { WIDGET_TYPES } from './Toolbar';
import Canvas from './Canvas';
import WidgetEditor from './WidgetEditor';
import '../../styles/dashboard-builder.css';

export default function DashboardBuilder({ dashboardId, token, onBack, onSave }) {
  const [dashboard, setDashboard] = useState(null);
  const [widgets, setWidgets] = useState([]);
  const [devices, setDevices] = useState([]);
  const [selectedWidget, setSelectedWidget] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [canEdit, setCanEdit] = useState(true); // Phase 5: set from permission check

  // Load dashboard and widgets
  const loadDashboard = useCallback(async () => {
    setLoading(true);
    try {
      const [dashboardRes, devicesRes, meRes] = await Promise.all([
        fetchDashboard(dashboardId, token),
        fetchDevices(token),
        fetchMe(token),
      ]);

      setDashboard(dashboardRes.data);
      setWidgets(dashboardRes.data.widgets || []);
      setDevices(devicesRes.data.devices || []);

      // Phase 5: owner or admin can edit
      const currentUserId = meRes.data.id;
      const currentUserRole = meRes.data.vai_tro;
      const isOwner = dashboardRes.data.nguoi_tao_id === currentUserId;
      setCanEdit(isOwner || currentUserRole === 'admin');
    } catch (err) {
      console.error('Failed to load dashboard:', err);
      setCanEdit(false); // no permission or error
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
        setWidgets(widgets.map(w => w.id === id ? res.data.widget : w));
        setSelectedWidget(null);
      } else {
        // Existing widget - update it
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
        setWidgets(prevWidgets => prevWidgets.filter(w => w.id !== widgetId));
        if (selectedWidget?.id === widgetId) {
          setSelectedWidget(null);
        }
        return;
      }

      // Real widget - delete from backend
      await deleteWidget(dashboardId, widgetId, token);
      setWidgets(prevWidgets => prevWidgets.filter(w => w.id !== widgetId));
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
      <div className="db-builder-loading">
        <p>Đang tải...</p>
      </div>
    );
  }

  return (
    <div className="db-builder">
      {/* Toolbar */}
      {canEdit && <Toolbar onAddWidget={handleAddWidget} />}

      {/* Canvas */}
      <div className="db-builder-main">
        {/* Header */}
        <div className="db-builder-header">
          {!canEdit && (
            <span className="db-view-only-badge">
              Chỉ xem (không có quyền chỉnh sửa)
            </span>
          )}
          <div className="db-builder-header-left">
            <button
              onClick={onBack}
              className="db-btn-secondary"
            >
              ← Quay lại
            </button>
            <h2 className="db-builder-title">
              {dashboard?.ten_dashboard || 'Dashboard Builder'}
            </h2>
          </div>
          <div className="db-builder-header-right">
            {saving && <span className="db-saving-text">Đang lưu...</span>}
            {canEdit ? (
              <button
                onClick={() => {
                  if (onSave) onSave();
                  else onBack();
                }}
                className="db-btn-primary"
              >
                Lưu Dashboard
              </button>
            ) : (
              <span className="db-view-only-text">Chỉ xem</span>
            )}
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

