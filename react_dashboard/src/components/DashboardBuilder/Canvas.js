import React from 'react';
import { Responsive, WidthProvider } from 'react-grid-layout';
import WidgetPreview from './WidgetPreview';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';

const ResponsiveGridLayout = WidthProvider(Responsive);

export default function Canvas({ widgets, onLayoutChange, onWidgetSelect, onWidgetDelete }) {
  // Convert widgets to grid layout format
  const layouts = {
    lg: widgets.map(w => ({
      i: w.id.toString(),
      x: w.vi_tri_x || 0,
      y: w.vi_tri_y || 0,
      w: w.chieu_rong || 4,
      h: w.chieu_cao || 3,
      minW: 2,
      minH: 2
    }))
  };

  const handleLayoutChange = (layout, layouts) => {
    // Convert layout changes back to widget format
    const updatedWidgets = layout.map(item => {
      const widget = widgets.find(w => w.id.toString() === item.i);
      return {
        ...widget,
        vi_tri_x: item.x,
        vi_tri_y: item.y,
        chieu_rong: item.w,
        chieu_cao: item.h
      };
    });
    onLayoutChange(updatedWidgets);
  };

  return (
    <div style={{
      flex: 1,
      padding: '20px',
      background: '#090f1f',
      overflow: 'auto',
      minHeight: '100vh'
    }}>
      {widgets.length === 0 ? (
        <div style={{
          textAlign: 'center',
          padding: '60px 20px',
          color: '#9ca3af'
        }}>
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>📊</div>
          <h3 style={{ color: '#e5e7eb', marginBottom: '8px' }}>Canvas trống</h3>
          <p>Kéo widget từ thanh công cụ bên trái vào đây để bắt đầu</p>
        </div>
      ) : (
        <ResponsiveGridLayout
          className="layout"
          layouts={layouts}
          breakpoints={{ lg: 1200, md: 996, sm: 768, xs: 480, xxs: 0 }}
          cols={{ lg: 12, md: 10, sm: 6, xs: 4, xxs: 2 }}
          rowHeight={60}
          onLayoutChange={handleLayoutChange}
          isDraggable={true}
          isResizable={true}
          style={{ minHeight: '100%' }}
        >
          {widgets.map(widget => (
            <div key={widget.id} style={{ background: 'transparent' }}>
              <WidgetPreview
                widget={widget}
                onSelect={onWidgetSelect}
                onDelete={onWidgetDelete}
              />
            </div>
          ))}
        </ResponsiveGridLayout>
      )}
    </div>
  );
}

