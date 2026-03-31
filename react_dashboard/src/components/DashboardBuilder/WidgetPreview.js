import React from 'react';
import WidgetRenderer from '../DashboardViewer/WidgetRenderer';

export default function WidgetPreview({ widget, onSelect, onDelete, token, dashboardId }) {
  const isPlaceholder = !widget.cau_hinh?.device_id || (!widget.cau_hinh?.data_keys?.length && widget.widget_type !== 'scada_symbol');

  const renderPreview = () => {
    if (isPlaceholder) {
      return (
        <div style={{
          width: '100%',
          height: '100%',
          background: 'linear-gradient(145deg, rgba(15, 23, 42, 0.92), rgba(9, 12, 24, 0.95))',
          border: '1px dashed #3b82f6',
          borderRadius: '8px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#64748b'
        }}>
          <div style={{ fontSize: '24px', marginBottom: '8px' }}>⚙️</div>
          <div style={{ fontSize: '12px' }}>Chưa cấu hình thiết bị</div>
        </div>
      );
    }
    
    // Valid Config - Call Real Renderer
    return <WidgetRenderer widget={widget} token={token} dashboardId={dashboardId} />;
  };

  return (
    <div
      style={{
        position: 'relative',
        cursor: 'pointer',
        height: '100%'
      }}
      onClick={() => onSelect(widget)}
    >
      {renderPreview()}
      <div style={{
        position: 'absolute',
        top: '8px',
        left: '8px',
        background: 'rgba(0, 0, 0, 0.7)',
        padding: '4px 8px',
        borderRadius: '4px',
        fontSize: '11px',
        color: '#e5e7eb',
        zIndex: 10
      }}>
        {widget.ten_widget || widget.widget_type}
      </div>
      {onDelete && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete(widget.id);
          }}
          style={{
            position: 'absolute',
            top: '8px',
            right: '8px',
            background: 'rgba(239, 68, 68, 0.8)',
            border: 'none',
            borderRadius: '4px',
            padding: '4px 8px',
            color: 'white',
            cursor: 'pointer',
            fontSize: '11px',
            zIndex: 10
          }}
        >
          ×
        </button>
      )}
    </div>
  );
}
