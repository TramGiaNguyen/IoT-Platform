import React, { useState } from 'react';
import WidgetRenderer from '../DashboardViewer/WidgetRenderer';
import '../../styles/dashboard-builder.css';

// Map widget_type -> ten_widget hien thi trong build mode
const WIDGET_LABELS = {
  line_chart: 'Line Chart',
  area_chart: 'Area Chart',
  bar_chart: 'Bar Chart',
  gauge: 'Gauge',
  stat_card: 'Stat Card',
  scada_symbol: 'SCADA Symbol',
  pie_chart: 'Pie Chart',
  scatter_plot: 'Scatter Plot',
  heatmap: 'Heatmap',
  event_timeline: 'Event Timeline',
  multi_axis_line: 'Multi-axis Line',
  relay_button: 'Relay Button',
  joystick: 'Joystick',
  rgb_control: 'RGB Light',
  segmented_switch: 'Segmented Switch',
  numeric_input: 'Numeric Input',
  dropdown_menu: 'Dropdown Menu',
  text_input: 'Text Input',
  lcd_display: 'LCD Display',
  led_indicator: 'LED Indicator',
  level_display: 'Level Display',
  gradient_ramp: 'Gradient Ramp',
  video_stream: 'Video Stream',
  image_gallery: 'Image Gallery',
  map_widget: 'Map Widget',
};

// SVG Icons
const EyeIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0z" fill="currentColor"/>
    <path d="M21.894 11.553C19.736 7.236 15.904 5 12 5c-3.903 0-7.736 2.236-9.894 6.553a1 1 0 0 0 0 .894C4.264 16.764 8.096 19 12 19c3.903 0 7.736-2.236 9.894-6.553a1 1 0 0 0 0-.894zM12 17c-2.969 0-6.002-1.62-7.87-5 1.868-3.38 4.901-5 7.87-5z" fill="currentColor"/>
  </svg>
);

const EyeOffIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path fillRule="evenodd" clipRule="evenodd" d="M20.707 20.707a1 1 0 0 0 0-1.414l-16-16a1 1 0 0 0-1.414 1.414L5.205 6.62C2.785 8.338 1.5 10.683 1.5 12c0 2.25 3.75 7.5 10.5 7.5 1.916 0 3.59-.423 5.006-1.08l2.287 2.287a1 1 0 0 0 1.414 0zM9.057 14.833l1.51 1.51a2.7 2.7 0 0 0 3.548 3.548l1.51 1.51a4.75 4.75 0 0 1-6.568-6.568zM22.5 12c0 1.005-.749 2.61-2.18 4.078l-3.594-3.595a4.75 4.75 0 0 0-5.209-5.209L9.088 4.846C9.985 4.626 10.957 4.5 12 4.5c6.75 0 10.5 5.25 10.5 7.5z" fill="currentColor"/>
  </svg>
);

function WidgetPreview({ widget, onSelect, onDelete, token, dashboardId, isPreview }) {
  const [isHovered, setIsHovered] = useState(false);
  // previewMode: true = hien thi placeholder, false = load du lieu that
  const [previewMode, setPreviewMode] = useState(true);
  // Check if widget is configured based on widget type
  const isConfigured = () => {
    const cfg = widget.cau_hinh || {};

    // Image gallery doesn't need device_id, just images array
    if (widget.widget_type === 'image_gallery') {
      return Array.isArray(cfg.images) && cfg.images.length > 0;
    }

    // Video stream doesn't need device_id or data_keys
    if (widget.widget_type === 'video_stream') {
      const sourceType = cfg.source_type;
      if (sourceType === 'webcam') {
        return !!cfg.client_device_id;
      }
      return !!cfg.stream_url;
    }

    if (!cfg.device_id) return false;

    // Widgets that need data_keys
    const needsDataKeys = ['line_chart', 'area_chart', 'bar_chart', 'gauge', 'stat_card', 'pie_chart', 'scatter_plot', 'heatmap', 'multi_axis_line', 'event_timeline'];
    if (needsDataKeys.includes(widget.widget_type) && !cfg.data_keys?.length) return false;

    // Widgets that need x_datakey/y_datakey
    if (widget.widget_type === 'joystick' && !cfg.x_datakey) return false;

    // Widgets that need color_datakey
    if (widget.widget_type === 'rgb_control' && !cfg.color_datakey) return false;

    // Widgets that need key (single key) - scada_symbol doesn't need data_keys
    const needsSingleKey = ['relay_button', 'lcd_display', 'led_indicator', 'level_display', 'gradient_ramp'];
    if (needsSingleKey.includes(widget.widget_type) && !cfg.data_keys?.length) return false;

    return true;
  };
  const isPlaceholder = !isConfigured();

  const handleEyeToggle = (e) => {
    e.stopPropagation();
    setPreviewMode(!previewMode);
  };

  const renderPreview = () => {
    // Trong build mode: hien thi placeholder khi previewMode=true, 
    // hoac widget chua cau hinh, hoac isPreview=true
    if (isPlaceholder || previewMode) {
      const widgetLabel = widget.ten_widget || WIDGET_LABELS[widget.widget_type] || widget.widget_type;
      return (
        <div className={`db-widget-preview-placeholder${isHovered ? ' hovered' : ''}`}>
          <div style={{ fontSize: '11px', color: 'var(--bdu-cyan)', marginBottom: '4px', fontWeight: 600 }}>
            {WIDGET_LABELS[widget.widget_type] || widget.widget_type}
          </div>
          <div style={{ fontSize: '10px', opacity: 0.7 }}>
            {isPlaceholder ? 'Chua cau hinh' : 'Preview (build mode)'}
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
          aria-label="Xoa widget"
        >
          X
        </button>
      )}

      {/* Eye toggle button - chi hien thi khi widget da duoc cau hinh */}
      {!isPlaceholder && (
        <button
          className={`db-widget-preview-eye-btn ${!previewMode ? 'active' : ''}`}
          onClick={handleEyeToggle}
          aria-label={previewMode ? 'Xem du lieu that' : 'An du lieu'}
          title={previewMode ? 'Xem du lieu that' : 'An du lieu'}
        >
          {previewMode ? <EyeIcon /> : <EyeOffIcon />}
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

// Custom comparator: chi re-render khi widget props thay doi that su
// Tranh render lai khi parent re-render nhung widget khong doi
export default React.memo(WidgetPreview, (prev, next) => {
  const pw = prev.widget;
  const nw = next.widget;
  return (
    prev.isPreview === next.isPreview &&
    prev.token === next.token &&
    prev.dashboardId === next.dashboardId &&
    pw.id === nw.id &&
    pw.vi_tri_x === nw.vi_tri_x &&
    pw.vi_tri_y === nw.vi_tri_y &&
    pw.chieu_rong === nw.chieu_rong &&
    pw.chieu_cao === nw.chieu_cao &&
    pw.ten_widget === nw.ten_widget &&
    pw.widget_type === nw.widget_type &&
    pw.cau_hinh?.device_id === nw.cau_hinh?.device_id &&
    pw.cau_hinh?.data_keys?.length === nw.cau_hinh?.data_keys?.length
  );
});