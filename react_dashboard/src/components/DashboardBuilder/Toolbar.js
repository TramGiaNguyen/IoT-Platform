import React from 'react';

// SVG icon components
const Icons = {
  line_chart: (
    <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <polyline points="3,18 8,12 13,14 21,6"/>
    </svg>
  ),
  area_chart: (
    <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M3 18 L8 11 L13 13 L21 5 L21 18 Z" stroke="none" fill="currentColor" opacity="0.3"/>
      <polyline points="3,18 8,11 13,13 21,5" />
    </svg>
  ),
  bar_chart: (
    <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="3" y="10" width="4" height="10" fill="currentColor" opacity="0.7"/>
      <rect x="9" y="5" width="4" height="15" fill="currentColor" opacity="0.7"/>
      <rect x="15" y="13" width="4" height="7" fill="currentColor" opacity="0.7"/>
      <line x1="2" y1="20" x2="22" y2="20"/>
    </svg>
  ),
  gauge: (
    <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M5 18A8 8 0 0 1 19 18" strokeLinecap="round"/>
      <line x1="12" y1="18" x2="16" y2="10" strokeLinecap="round"/>
      <circle cx="12" cy="18" r="1.5" fill="currentColor"/>
    </svg>
  ),
  stat_card: (
    <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="3" y="5" width="18" height="14" rx="2"/>
      <text x="12" y="15" textAnchor="middle" fontSize="8" fill="currentColor" stroke="none" fontWeight="bold">42</text>
    </svg>
  ),
  scada_symbol: (
    <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="12" cy="12" r="5"/>
      <line x1="12" y1="2" x2="12" y2="5"/>
      <line x1="12" y1="19" x2="12" y2="22"/>
      <line x1="2" y1="12" x2="5" y2="12"/>
      <line x1="19" y1="12" x2="22" y2="12"/>
    </svg>
  ),
  table: (
    <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="3" y="4" width="18" height="16" rx="1"/>
      <line x1="3" y1="9" x2="21" y2="9"/>
      <line x1="3" y1="14" x2="21" y2="14"/>
      <line x1="9" y1="4" x2="9" y2="20"/>
    </svg>
  ),
  pie_chart: (
    <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M12 12 L12 3 A9 9 0 0 1 21 12 Z" fill="currentColor" opacity="0.5"/>
      <path d="M12 12 L21 12 A9 9 0 0 1 3.5 17 Z" fill="currentColor" opacity="0.3"/>
      <circle cx="12" cy="12" r="9"/>
    </svg>
  ),
  scatter_plot: (
    <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="6" cy="16" r="2" fill="currentColor"/>
      <circle cx="12" cy="9" r="2" fill="currentColor"/>
      <circle cx="17" cy="5" r="2" fill="currentColor"/>
      <circle cx="9" cy="13" r="2" fill="currentColor"/>
      <circle cx="15" cy="15" r="2" fill="currentColor"/>
      <line x1="3" y1="20" x2="21" y2="20" strokeDasharray="2 2"/>
      <line x1="3" y1="20" x2="3" y2="3" strokeDasharray="2 2"/>
    </svg>
  ),
  heatmap: (
    <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.2">
      <rect x="3" y="3" width="5" height="5" fill="currentColor" opacity="0.9"/>
      <rect x="9" y="3" width="5" height="5" fill="currentColor" opacity="0.4"/>
      <rect x="15" y="3" width="5" height="5" fill="currentColor" opacity="0.7"/>
      <rect x="3" y="9" width="5" height="5" fill="currentColor" opacity="0.3"/>
      <rect x="9" y="9" width="5" height="5" fill="currentColor" opacity="0.8"/>
      <rect x="15" y="9" width="5" height="5" fill="currentColor" opacity="0.5"/>
      <rect x="3" y="15" width="5" height="5" fill="currentColor" opacity="0.6"/>
      <rect x="9" y="15" width="5" height="5" fill="currentColor" opacity="1.0"/>
      <rect x="15" y="15" width="5" height="5" fill="currentColor" opacity="0.2"/>
    </svg>
  ),
  event_timeline: (
    <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <line x1="3" y1="12" x2="21" y2="12"/>
      <rect x="4" y="8" width="4" height="4" rx="1" fill="#22c55e" stroke="none"/>
      <rect x="10" y="9" width="5" height="4" rx="1" fill="#f59e0b" stroke="none"/>
      <rect x="17" y="8" width="3" height="4" rx="1" fill="#ef4444" stroke="none"/>
      <line x1="6" y1="20" x2="6" y2="16"/>
      <line x1="12.5" y1="20" x2="12.5" y2="16"/>
      <line x1="18.5" y1="20" x2="18.5" y2="16"/>
    </svg>
  ),
  multi_axis_line: (
    <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <polyline points="3,17 8,10 13,13 21,5" stroke="#22d3ee"/>
      <polyline points="3,19 7,15 12,17 21,12" stroke="#f59e0b"/>
      <line x1="3" y1="3" x2="3" y2="20" stroke="#9ca3af" strokeWidth="1"/>
      <line x1="21" y1="3" x2="21" y2="20" stroke="#f59e0b" strokeWidth="1"/>
      <line x1="3" y1="20" x2="21" y2="20" stroke="#9ca3af" strokeWidth="1"/>
    </svg>
  ),
  relay_button: (
    <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="4" y="7" width="16" height="10" rx="5"/>
      <circle cx="16" cy="12" r="3" fill="currentColor"/>
    </svg>
  ),
};

const WIDGET_TYPES = [
  {
    type: 'line_chart',
    name: 'Biểu đồ đường (Line)',
    description: 'Theo dõi xu hướng dữ liệu cảm biến theo thời gian. Tốt nhất cho dữ liệu liên tục.',
    defaultSize: { w: 6, h: 4 }
  },
  {
    type: 'area_chart',
    name: 'Biểu đồ vùng (Area)',
    description: 'Giống Line nhưng tô màu vùng bên dưới, thể hiện rõ khối lượng dữ liệu.',
    defaultSize: { w: 6, h: 4 }
  },
  {
    type: 'bar_chart',
    name: 'Biểu đồ cột (Bar)',
    description: 'So sánh giá trị giữa các khoảng thời gian hoặc các nhóm dữ liệu.',
    defaultSize: { w: 6, h: 4 }
  },
  {
    type: 'gauge',
    name: 'Gauge',
    description: 'Hiển thị giá trị đơn trên thang đo kim đồng hồ. Tốt cho nhiệt độ, độ ẩm, áp suất.',
    defaultSize: { w: 3, h: 3 }
  },
  {
    type: 'stat_card',
    name: 'Stat Card',
    description: 'Thẻ hiển thị một giá trị số quan trọng lớn, rõ ràng với nhãn và đơn vị.',
    defaultSize: { w: 3, h: 2 }
  },
  {
    type: 'scada_symbol',
    name: 'SCADA Symbol',
    description: 'Biểu tượng SCADA cho đèn, điều hòa, cảm biến. Có thể click để điều khiển bật/tắt.',
    defaultSize: { w: 2, h: 2 }
  },
  {
    type: 'table',
    name: 'Data Table',
    description: 'Bảng dữ liệu dạng bảng chi tiết với timestamp và nhiều cột key.',
    defaultSize: { w: 12, h: 6 }
  },
  {
    type: 'pie_chart',
    name: 'Pie Chart',
    description: 'Biểu đồ tròn phân phối tỷ lệ giữa các giá trị theo thời gian.',
    defaultSize: { w: 4, h: 4 }
  },
  {
    type: 'scatter_plot',
    name: 'Scatter Plot',
    description: 'Xem tương quan giữa 2 giá trị cảm biến. Rất hữu ích cho phân tích mối quan hệ trong IoT.',
    defaultSize: { w: 6, h: 4 }
  },
  {
    type: 'heatmap',
    name: 'Heatmap',
    description: 'Ma trận màu nhiệt thể hiện cường độ dữ liệu theo giờ/ngày. Tốt để phát hiện pattern.',
    defaultSize: { w: 8, h: 5 }
  },
  {
    type: 'event_timeline',
    name: 'Event Timeline',
    description: 'Timeline hiển thị trạng thái thiết bị theo thời gian: chạy, dừng, lỗi, bảo trì, alarm.',
    defaultSize: { w: 10, h: 3 }
  },
  {
    type: 'multi_axis_line',
    name: 'Multi-axis Line',
    description: 'Biểu đồ đường đa trục Y. Hiển thị nhiều tín hiệu IoT khác đơn vị (°C và %, V và A) cùng lúc.',
    defaultSize: { w: 8, h: 4 }
  },
  {
    type: 'relay_button',
    name: 'Relay Button',
    description: 'Nút điều khiển relay dạng toggle. Hiển thị trạng thái realtime qua WebSocket và bật/tắt trực tiếp.',
    defaultSize: { w: 3, h: 2 }
  },
];

export default function Toolbar({ onAddWidget }) {
  return (
    <div style={{
      width: '210px',
      background: '#0b1224',
      borderRight: '1px solid #1f2a44',
      padding: '16px',
      height: '100%',
      overflowY: 'auto'
    }}>
      <h3 style={{ color: '#e5e7eb', marginTop: 0, marginBottom: '16px', fontSize: '14px' }}>
        Widgets
      </h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        {WIDGET_TYPES.map(widget => (
          <button
            key={widget.type}
            onClick={() => onAddWidget(widget)}
            title={widget.description}
            style={{
              width: '100%',
              padding: '10px 12px',
              background: '#111a2d',
              border: '1px solid #1f2a44',
              borderRadius: '8px',
              color: '#e5e7eb',
              cursor: 'pointer',
              textAlign: 'left',
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
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
            <span style={{ color: '#22d3ee', flexShrink: 0 }}>
              {Icons[widget.type]}
            </span>
            <div>
              <div style={{ fontWeight: '500', fontSize: '13px' }}>{widget.name}</div>
              <div style={{ fontSize: '10px', color: '#9ca3af' }}>
                {widget.defaultSize.w}×{widget.defaultSize.h}
              </div>
            </div>
          </button>
        ))}
      </div>

      <div style={{ marginTop: '20px', paddingTop: '16px', borderTop: '1px solid #1f2a44' }}>
        <p style={{ color: '#9ca3af', fontSize: '11px', margin: 0 }}>
          💡 Click để thêm widget. Hover để xem mô tả.
        </p>
      </div>
    </div>
  );
}

export { WIDGET_TYPES };
