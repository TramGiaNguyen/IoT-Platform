import React from 'react';

const WIDGET_TYPES = [
  { type: 'line_chart', name: 'Line Chart', icon: '📈', defaultSize: { w: 6, h: 4 } },
  { type: 'bar_chart', name: 'Bar Chart', icon: '📊', defaultSize: { w: 6, h: 4 } },
  { type: 'gauge', name: 'Gauge', icon: '🎯', defaultSize: { w: 3, h: 3 } },
  { type: 'stat_card', name: 'Stat Card', icon: '📦', defaultSize: { w: 3, h: 2 } },
  { type: 'table', name: 'Data Table', icon: '📋', defaultSize: { w: 12, h: 6 } },
  { type: 'pie_chart', name: 'Pie Chart', icon: '🥧', defaultSize: { w: 4, h: 4 } },
];

export default function Toolbar({ onAddWidget }) {
  return (
    <div style={{
      width: '200px',
      background: '#0b1224',
      borderRight: '1px solid #1f2a44',
      padding: '16px',
      height: '100%',
      overflowY: 'auto'
    }}>
      <h3 style={{ color: '#e5e7eb', marginTop: 0, marginBottom: '16px', fontSize: '14px' }}>
        Widgets
      </h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {WIDGET_TYPES.map(widget => (
          <button
            key={widget.type}
            onClick={() => onAddWidget(widget)}
            style={{
              width: '100%',
              padding: '12px',
              background: '#111a2d',
              border: '1px solid #1f2a44',
              borderRadius: '8px',
              color: '#e5e7eb',
              cursor: 'pointer',
              textAlign: 'left',
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              transition: 'all 0.2s'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = '#22d3ee';
              e.currentTarget.style.background = '#1a2332';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = '#1f2a44';
              e.currentTarget.style.background = '#111a2d';
            }}
          >
            <span style={{ fontSize: '24px' }}>{widget.icon}</span>
            <div>
              <div style={{ fontWeight: '500', fontSize: '14px' }}>{widget.name}</div>
              <div style={{ fontSize: '11px', color: '#9ca3af' }}>
                {widget.defaultSize.w}×{widget.defaultSize.h}
              </div>
            </div>
          </button>
        ))}
      </div>
      
      <div style={{ marginTop: '24px', paddingTop: '24px', borderTop: '1px solid #1f2a44' }}>
        <p style={{ color: '#9ca3af', fontSize: '12px', margin: 0 }}>
          💡 Kéo widget vào canvas để thêm
        </p>
      </div>
    </div>
  );
}

export { WIDGET_TYPES };

