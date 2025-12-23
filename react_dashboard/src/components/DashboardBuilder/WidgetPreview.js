import React from 'react';
import { ResponsiveContainer, LineChart, BarChart, PieChart, Pie, Cell, Line, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';

// Mock data for preview
const mockData = [
  { timestamp: '10:00', temperature: 28, humidity: 65 },
  { timestamp: '11:00', temperature: 29, humidity: 66 },
  { timestamp: '12:00', temperature: 30, humidity: 67 },
  { timestamp: '13:00', temperature: 31, humidity: 68 },
];

const COLORS = ['#22d3ee', '#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b'];

export function LineChartPreview({ config }) {
  const dataKeys = config?.data_keys || ['temperature', 'humidity'];
  const colors = config?.colors || { temperature: '#f59e0b', humidity: '#06b6d4' };
  
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={mockData}>
        <CartesianGrid strokeDasharray="3 3" stroke="#1f2a44" />
        <XAxis dataKey="timestamp" stroke="#64748b" tick={{ fontSize: 10 }} />
        <YAxis stroke="#64748b" tick={{ fontSize: 10 }} />
        <Tooltip contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #1f2a44' }} />
        <Legend />
        {dataKeys.map(key => (
          <Line
            key={key}
            type="monotone"
            dataKey={key}
            stroke={colors[key] || COLORS[0]}
            dot={false}
            strokeWidth={2}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

export function BarChartPreview({ config }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={mockData}>
        <CartesianGrid strokeDasharray="3 3" stroke="#1f2a44" />
        <XAxis dataKey="timestamp" stroke="#64748b" tick={{ fontSize: 10 }} />
        <YAxis stroke="#64748b" tick={{ fontSize: 10 }} />
        <Tooltip contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #1f2a44' }} />
        <Legend />
        <Bar dataKey="temperature" fill="#f59e0b" />
        <Bar dataKey="humidity" fill="#06b6d4" />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function GaugePreview({ config }) {
  const value = config?.value || 75;
  const max = config?.max || 100;
  const percentage = (value / max) * 100;
  
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      height: '100%',
      padding: '20px'
    }}>
      <div style={{
        width: '120px',
        height: '120px',
        borderRadius: '50%',
        background: `conic-gradient(from 0deg, #22d3ee ${percentage * 3.6}deg, #1f2a44 ${percentage * 3.6}deg)`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative'
      }}>
        <div style={{
          width: '80px',
          height: '80px',
          borderRadius: '50%',
          background: '#0b1224',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'column'
        }}>
          <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#22d3ee' }}>{value}</div>
          <div style={{ fontSize: '10px', color: '#9ca3af' }}>{config?.unit || ''}</div>
        </div>
      </div>
      <div style={{ marginTop: '12px', fontSize: '12px', color: '#9ca3af' }}>
        {config?.label || 'Value'}
      </div>
    </div>
  );
}

export function StatCardPreview({ config }) {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      height: '100%',
      padding: '20px',
      textAlign: 'center'
    }}>
      <div style={{ fontSize: '36px', fontWeight: 'bold', color: '#22d3ee', marginBottom: '8px' }}>
        28.5
      </div>
      <div style={{ fontSize: '14px', color: '#9ca3af' }}>
        {config?.label || 'Temperature'}
      </div>
      <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>
        {config?.unit || '°C'}
      </div>
    </div>
  );
}

export function TablePreview({ config }) {
  const dataKeys = config?.data_keys || ['temperature', 'humidity'];
  
  return (
    <div style={{ padding: '12px', height: '100%', overflow: 'auto' }}>
      <table style={{ width: '100%', fontSize: '12px', color: '#e5e7eb' }}>
        <thead>
          <tr style={{ borderBottom: '1px solid #1f2a44' }}>
            <th style={{ padding: '8px', textAlign: 'left', color: '#9ca3af' }}>Time</th>
            {dataKeys.map(key => (
              <th key={key} style={{ padding: '8px', textAlign: 'left', color: '#9ca3af' }}>
                {key}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {mockData.slice(0, 3).map((row, idx) => (
            <tr key={idx} style={{ borderBottom: '1px solid #1f2a44' }}>
              <td style={{ padding: '8px' }}>{row.timestamp}</td>
              {dataKeys.map(key => (
                <td key={key} style={{ padding: '8px' }}>{row[key]}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function PieChartPreview({ config }) {
  const data = [
    { name: 'A', value: 35 },
    { name: 'B', value: 25 },
    { name: 'C', value: 40 },
  ];
  
  return (
    <ResponsiveContainer width="100%" height="100%">
      <PieChart>
        <Pie
          data={data}
          cx="50%"
          cy="50%"
          labelLine={false}
          label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
          outerRadius={80}
          fill="#8884d8"
          dataKey="value"
        >
          {data.map((entry, index) => (
            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
          ))}
        </Pie>
        <Tooltip contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #1f2a44' }} />
      </PieChart>
    </ResponsiveContainer>
  );
}

export default function WidgetPreview({ widget, onSelect, onDelete }) {
  const renderPreview = () => {
    const style = {
      width: '100%',
      height: '100%',
      background: 'linear-gradient(145deg, rgba(15, 23, 42, 0.92), rgba(9, 12, 24, 0.95))',
      border: '1px solid #1f2a44',
      borderRadius: '8px',
      padding: '12px',
      position: 'relative'
    };

    switch (widget.widget_type) {
      case 'line_chart':
        return <div style={style}><LineChartPreview config={widget.cau_hinh} /></div>;
      case 'bar_chart':
        return <div style={style}><BarChartPreview config={widget.cau_hinh} /></div>;
      case 'gauge':
        return <div style={style}><GaugePreview config={widget.cau_hinh} /></div>;
      case 'stat_card':
        return <div style={style}><StatCardPreview config={widget.cau_hinh} /></div>;
      case 'table':
        return <div style={style}><TablePreview config={widget.cau_hinh} /></div>;
      case 'pie_chart':
        return <div style={style}><PieChartPreview config={widget.cau_hinh} /></div>;
      default:
        return <div style={style}>Unknown widget type</div>;
    }
  };

  return (
    <div
      style={{
        position: 'relative',
        cursor: 'pointer'
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
        color: '#e5e7eb'
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
            fontSize: '11px'
          }}
        >
          ×
        </button>
      )}
    </div>
  );
}

