import React, { useState } from 'react';
import WidgetRenderer from '../DashboardViewer/WidgetRenderer';
import '../../styles/dashboard-builder.css';

export default function WidgetPreview({ widget, onSelect, onDelete, token, dashboardId }) {
  const [isHovered, setIsHovered] = useState(false);
  const isPlaceholder = !widget.cau_hinh?.device_id || (!widget.cau_hinh?.data_keys?.length && widget.widget_type !== 'scada_symbol');

  const renderPreview = () => {
    if (isPlaceholder) {
      return (
        <div className={`db-widget-preview-placeholder${isHovered ? ' hovered' : ''}`}>
          <div style={{ fontSize: '24px', marginBottom: '8px' }}>⚙️</div>
          <div style={{ fontSize: '12px' }}>Chưa cấu hình</div>
          <div style={{ fontSize: '10px', marginTop: '4px', opacity: 0.7 }}>
            Click để cấu hình
          </div>
        </div>
      );
    }
    return <WidgetRenderer widget={widget} token={token} dashboardId={dashboardId} />;
  };

  return (
    <div
      className="db-widget-preview-wrap"
      onClick={() => onSelect && onSelect(widget)}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {renderPreview()}

      {/* Widget label */}
      <div className={`db-widget-preview-label${isHovered ? ' hovered' : ''}`}>
        {widget.ten_widget || widget.widget_type}
      </div>

      {/* Delete button */}
      {onDelete && isHovered && (
        <button
          className="db-widget-preview-delete"
          onClick={(e) => {
            e.stopPropagation();
            onDelete(widget.id);
          }}
          aria-label="Xóa widget"
        >
          ✕
        </button>
      )}

      {/* Config status indicator */}
      <div
        className="db-widget-preview-status"
        style={{
          background: isPlaceholder ? '#f59e0b' : '#22c55e',
          boxShadow: isPlaceholder ? '0 0 6px #f59e0b' : '0 0 6px #22c55e',
        }}
      />

      {/* Hover overlay */}
      {isHovered && <div className="db-widget-preview-overlay" />}
    </div>
  );
}
