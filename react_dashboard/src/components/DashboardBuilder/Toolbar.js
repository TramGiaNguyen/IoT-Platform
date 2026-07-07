import React from 'react';
import '../../styles/dashboard-builder.css';

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
  // === Blynk-style widgets ===
  joystick: (
    <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="12" cy="12" r="9" strokeDasharray="4 2"/>
      <circle cx="12" cy="12" r="4" fill="currentColor" opacity="0.6"/>
      <circle cx="15" cy="9" r="2" fill="currentColor"/>
    </svg>
  ),
  rgb_control: (
    <svg viewBox="0 0 24 24" width="24" height="24" fill="none" strokeWidth="1.8">
      <defs>
        <linearGradient id="rgbGrad" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#ff0000"/>
          <stop offset="33%" stopColor="#00ff00"/>
          <stop offset="66%" stopColor="#0000ff"/>
          <stop offset="100%" stopColor="#ff0000"/>
        </linearGradient>
      </defs>
      <rect x="3" y="6" width="18" height="12" rx="3" fill="url(#rgbGrad)" opacity="0.8"/>
      <rect x="3" y="6" width="18" height="12" rx="3" stroke="currentColor"/>
    </svg>
  ),
  lcd_display: (
    <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="2" y="4" width="20" height="16" rx="2" fill="#1a3a2a"/>
      <text x="5" y="10" fontSize="5" fill="#00ff88" fontFamily="monospace">LCD</text>
      <text x="5" y="16" fontSize="5" fill="#00ff88" fontFamily="monospace">TEXT</text>
    </svg>
  ),
  video_stream: (
    <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="2" y="5" width="16" height="14" rx="2"/>
      <polygon points="18,9 22,12 18,15" fill="currentColor"/>
      <circle cx="6" cy="7" r="1.5" fill="#ef4444"/>
    </svg>
  ),
  map_widget: (
    <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <polygon points="3,6 3,20 12,24 21,20 21,6 12,2" fill="currentColor" opacity="0.2"/>
      <polygon points="3,6 3,20 12,24 21,20 21,6 12,2"/>
      <line x1="12" y1="2" x2="12" y2="24"/>
      <line x1="3" y1="6" x2="21" y2="6"/>
    </svg>
  ),
  image_gallery: (
    <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="3" y="4" width="8" height="8" rx="1" fill="currentColor" opacity="0.3"/>
      <rect x="13" y="4" width="8" height="8" rx="1" fill="currentColor" opacity="0.5"/>
      <rect x="3" y="14" width="8" height="8" rx="1" fill="currentColor" opacity="0.5"/>
      <rect x="13" y="14" width="8" height="8" rx="1" fill="currentColor" opacity="0.3"/>
    </svg>
  ),
  dropdown_menu: (
    <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="3" y="6" width="18" height="14" rx="2"/>
      <line x1="3" y1="10" x2="21" y2="10"/>
      <polyline points="16,14 12,18 8,14" fill="none" strokeWidth="2"/>
    </svg>
  ),
  text_input: (
    <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="2" y="6" width="20" height="12" rx="2"/>
      <line x1="5" y1="12" x2="12" y2="12" strokeWidth="1.5"/>
      <line x1="5" y1="15" x2="9" y2="15" strokeWidth="1.5" opacity="0.5"/>
    </svg>
  ),
  level_display: (
    <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="4" y="4" width="4" height="16" rx="1" fill="currentColor" opacity="0.8"/>
      <rect x="10" y="8" width="4" height="12" rx="1" fill="currentColor" opacity="0.6"/>
      <rect x="16" y="12" width="4" height="8" rx="1" fill="currentColor" opacity="0.4"/>
    </svg>
  ),
  led_indicator: (
    <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="12" cy="12" r="6" fill="#22c55e" opacity="0.8"/>
      <circle cx="12" cy="12" r="6"/>
      <circle cx="10" cy="10" r="2" fill="white" opacity="0.4"/>
    </svg>
  ),
  gradient_ramp: (
    <svg viewBox="0 0 24 24" width="24" height="24" fill="none">
      <defs>
        <linearGradient id="rampGrad" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#22d3ee"/>
          <stop offset="50%" stopColor="#8b5cf6"/>
          <stop offset="100%" stopColor="#ec4899"/>
        </linearGradient>
      </defs>
      <rect x="2" y="9" width="20" height="6" rx="3" fill="url(#rampGrad)"/>
    </svg>
  ),
  numeric_input: (
    <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="2" y="5" width="20" height="14" rx="2"/>
      <text x="12" y="15" textAnchor="middle" fontSize="8" fill="currentColor" fontWeight="bold">123</text>
      <line x1="6" y1="9" x2="6" y2="11" strokeWidth="1.5"/>
      <line x1="9" y1="9" x2="9" y2="11" strokeWidth="1.5"/>
    </svg>
  ),
  segmented_switch: (
    <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="2" y="8" width="20" height="8" rx="2"/>
      <rect x="3" y="9" width="8" height="6" rx="1" fill="currentColor" opacity="0.8"/>
      <line x1="10" y1="8" x2="10" y2="16"/>
      <line x1="14" y1="8" x2="14" y2="16"/>
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
  // === Blynk-style Control Widgets ===
  {
    type: 'joystick',
    name: 'Joystick',
    description: 'Bộ điều khiển 2 trục X/Y. Dùng để điều khiển robot, drone, hoặc thiết bị di chuyển.',
    defaultSize: { w: 3, h: 3 }
  },
  {
    type: 'rgb_control',
    name: 'RGB Light',
    description: 'Điều khiển đèn LED RGB với bảng màu và độ sáng. Hỗ trợ presets và hiệu ứng chuyển màu.',
    defaultSize: { w: 3, h: 4 }
  },
  {
    type: 'segmented_switch',
    name: 'Segmented Switch',
    description: 'Công tắc phân đoạn với nhiều tùy chọn. Dùng để chọn chế độ hoạt động.',
    defaultSize: { w: 4, h: 2 }
  },
  {
    type: 'numeric_input',
    name: 'Numeric Input',
    description: 'Ô nhập số với các nút tăng/giảm. Dùng để cài đặt giá trị cho thiết bị.',
    defaultSize: { w: 3, h: 2 }
  },
  {
    type: 'dropdown_menu',
    name: 'Dropdown Menu',
    description: 'Menu dropdown để chọn một tùy chọn từ danh sách. Dùng cho cấu hình thiết bị.',
    defaultSize: { w: 4, h: 2 }
  },
  {
    type: 'text_input',
    name: 'Text Input',
    description: 'Ô nhập văn bản để gửi message xuống thiết bị. Hỗ trợ string commands.',
    defaultSize: { w: 4, h: 2 }
  },
  // === Blynk-style Display Widgets ===
  {
    type: 'lcd_display',
    name: 'LCD Display',
    description: 'Màn hình LCD hiển thị text nhiều dòng. Phong cách retro, tốt cho thông tin cảm biến.',
    defaultSize: { w: 6, h: 4 }
  },
  {
    type: 'led_indicator',
    name: 'LED Indicator',
    description: 'Đèn LED indicator hiển thị trạng thái ON/OFF. Dùng để báo hiệu trạng thái thiết bị.',
    defaultSize: { w: 2, h: 2 }
  },
  {
    type: 'level_display',
    name: 'Level Display',
    description: 'Thanh mức độ hiển thị giá trị dạng thanh ngang/dọc. Tốt cho pin, volume, cường độ.',
    defaultSize: { w: 4, h: 2 }
  },
  {
    type: 'gradient_ramp',
    name: 'Gradient Ramp',
    description: 'Thanh gradient hiển thị giá trị với màu sắc chuyển tiếp. Dùng cho temperature gradient.',
    defaultSize: { w: 6, h: 2 }
  },
  // === Blynk-style Media Widgets ===
  {
    type: 'video_stream',
    name: 'Video Stream',
    description: 'Stream video từ camera IP/MJPEG. Hiển thị feed camera trực tiếp trên dashboard.',
    defaultSize: { w: 8, h: 6 }
  },
  {
    type: 'image_gallery',
    name: 'Image Gallery',
    description: 'Thư viện ảnh slideshow từ URLs. Hiển thị ảnh chụp từ camera hoặc hình ảnh thiết bị.',
    defaultSize: { w: 6, h: 4 }
  },
  // === Blynk-style Map Widget ===
  {
    type: 'map_widget',
    name: 'Map Widget',
    description: 'Bản đồ hiển thị vị trí thiết bị. Dùng cho tracking GPS, fleet management.',
    defaultSize: { w: 8, h: 6 }
  },
];

export default function Toolbar({ onAddWidget }) {
  const renderWidgetCard = (widget) => (
    <button
      key={widget.type}
      onClick={() => onAddWidget(widget)}
      title={widget.description}
      className="db-widget-card"
    >
      <span className="db-widget-card-icon">{Icons[widget.type]}</span>
      <div className="db-widget-card-info">
        <p className="db-widget-card-name">{widget.name}</p>
        <p className="db-widget-card-desc">
          {widget.defaultSize.w}×{widget.defaultSize.h}
        </p>
      </div>
    </button>
  );

  return (
    <div className="db-toolbar">
      <h3 className="db-toolbar-title">Widgets</h3>
      <div className="db-toolbar-section">
        {WIDGET_TYPES.map(renderWidgetCard)}
      </div>
      <div className="db-toolbar-section">
        <p className="db-widget-card-desc" style={{ margin: 0 }}>
          💡 Click để thêm widget. Hover để xem mô tả.
        </p>
      </div>
    </div>
  );
}

export { WIDGET_TYPES };
