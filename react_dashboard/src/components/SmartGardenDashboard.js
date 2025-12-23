import React, { useMemo } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';

const SmartGardenDashboard = ({ device, logs }) => {
    // Process logs data
    const processedData = useMemo(() => {
        if (!logs || logs.length === 0) return [];

        return logs.map(log => {
            const parse = (val) => {
                if (val === null || val === undefined) return null;
                const num = parseFloat(val);
                if (isNaN(num)) return null;
                return num;
            };

            const parseStatus = (val) => {
                if (val === 'ON' || val === true || val === 1 || val === '1') return 'ON';
                if (val === 'OFF' || val === false || val === 0 || val === '0') return 'OFF';
                return val || '--';
            };

            return {
                timestamp: log.timestamp
                    ? new Date(log.timestamp * 1000).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
                    : '--',
                rawTimestamp: log.timestamp,
                temperature: parse(log.temperature),
                humidity: parse(log.humidity),
                soil_moisture: parse(log.soil_moisture),
                light_level: parse(log.light_level),
                pump_status: parseStatus(log.pump_status),
                lamp_status: parseStatus(log.lamp_status),
                fan_status: parseStatus(log.fan_status),
                plant_count: parse(log.plant_count),
                prediction: log.prediction || '--',
                confidence: parse(log.confidence)
            };
        });
    }, [logs]);

    // Get latest values for KPI
    const kpis = useMemo(() => {
        if (processedData.length === 0) {
            return { temperature: 0, humidity: 0, soil_moisture: 0, light_level: 0, pump_status: '--', lamp_status: '--', fan_status: '--' };
        }
        const latest = processedData[0]; // First is latest (sorted desc)
        return {
            temperature: latest.temperature ?? 0,
            humidity: latest.humidity ?? 0,
            soil_moisture: latest.soil_moisture ?? 0,
            light_level: latest.light_level ?? 0,
            pump_status: latest.pump_status,
            lamp_status: latest.lamp_status,
            fan_status: latest.fan_status,
            plant_count: latest.plant_count ?? '--',
            prediction: latest.prediction,
            confidence: latest.confidence ?? 0
        };
    }, [processedData]);

    // Chart data (reverse for timeline: old -> new)
    const chartData = useMemo(() => [...processedData].reverse().slice(-30), [processedData]);

    const getSoilStatus = (val) => {
        if (!val) return { text: '--', class: 'neutral' };
        if (val < 30) return { text: 'Cần tưới', class: 'warning' };
        if (val > 70) return { text: 'Đủ ẩm', class: 'success' };
        return { text: 'Bình thường', class: 'good' };
    };

    const getLightStatus = (val) => {
        if (!val) return { text: '--', class: 'neutral' };
        if (val < 300) return { text: 'Thiếu sáng', class: 'warning' };
        if (val > 800) return { text: 'Rất sáng', class: 'success' };
        return { text: 'Đủ sáng', class: 'good' };
    };

    const soilStatus = getSoilStatus(kpis.soil_moisture);
    const lightStatus = getLightStatus(kpis.light_level);

    return (
        <div className="smart-garden-dashboard" style={{ padding: '20px', color: '#e2e8f0' }}>
            {/* Header */}
            <div style={{ marginBottom: '20px' }}>
                <h1 style={{ margin: 0, fontSize: '24px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                    🌿 Giám sát Vườn thông minh: {device?.ten_thiet_bi || device?.device_id || 'garden'}
                </h1>
                <p style={{ margin: '5px 0 0', color: '#94a3b8', fontSize: '13px' }}>
                    Cập nhật lúc: {new Date().toLocaleTimeString('vi-VN')}
                </p>
            </div>

            {/* KPI Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '20px' }}>
                {/* Temperature */}
                <div style={{ background: 'linear-gradient(135deg, #1e293b, #0f172a)', border: '1px solid #334155', borderRadius: '12px', padding: '16px' }}>
                    <div style={{ fontSize: '24px', marginBottom: '8px' }}>🌡️</div>
                    <div style={{ color: '#94a3b8', fontSize: '12px', marginBottom: '4px' }}>Nhiệt độ</div>
                    <div style={{ fontSize: '28px', fontWeight: 'bold', color: '#f87171' }}>
                        {kpis.temperature.toFixed(1)} <span style={{ fontSize: '16px' }}>°C</span>
                    </div>
                </div>

                {/* Humidity */}
                <div style={{ background: 'linear-gradient(135deg, #1e293b, #0f172a)', border: '1px solid #334155', borderRadius: '12px', padding: '16px' }}>
                    <div style={{ fontSize: '24px', marginBottom: '8px' }}>💧</div>
                    <div style={{ color: '#94a3b8', fontSize: '12px', marginBottom: '4px' }}>Độ ẩm không khí</div>
                    <div style={{ fontSize: '28px', fontWeight: 'bold', color: '#60a5fa' }}>
                        {kpis.humidity.toFixed(1)} <span style={{ fontSize: '16px' }}>%</span>
                    </div>
                </div>

                {/* Soil Moisture */}
                <div style={{ background: 'linear-gradient(135deg, #1e293b, #0f172a)', border: '1px solid #334155', borderRadius: '12px', padding: '16px' }}>
                    <div style={{ fontSize: '24px', marginBottom: '8px' }}>🌱</div>
                    <div style={{ color: '#94a3b8', fontSize: '12px', marginBottom: '4px' }}>Độ ẩm đất</div>
                    <div style={{ fontSize: '28px', fontWeight: 'bold', color: '#10b981' }}>
                        {kpis.soil_moisture.toFixed(0)} <span style={{ fontSize: '16px' }}>%</span>
                    </div>
                    <div style={{ fontSize: '12px', color: soilStatus.class === 'warning' ? '#fbbf24' : '#34d399', marginTop: '4px' }}>
                        {soilStatus.text}
                    </div>
                </div>

                {/* Light Level */}
                <div style={{ background: 'linear-gradient(135deg, #1e293b, #0f172a)', border: '1px solid #334155', borderRadius: '12px', padding: '16px' }}>
                    <div style={{ fontSize: '24px', marginBottom: '8px' }}>☀️</div>
                    <div style={{ color: '#94a3b8', fontSize: '12px', marginBottom: '4px' }}>Ánh sáng</div>
                    <div style={{ fontSize: '28px', fontWeight: 'bold', color: '#fbbf24' }}>
                        {kpis.light_level} <span style={{ fontSize: '16px' }}>Lux</span>
                    </div>
                    <div style={{ fontSize: '12px', color: lightStatus.class === 'warning' ? '#fbbf24' : '#34d399', marginTop: '4px' }}>
                        {lightStatus.text}
                    </div>
                </div>
            </div>

            {/* Charts + Device Status Row */}
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '16px', marginBottom: '20px' }}>
                {/* Chart */}
                <div style={{ background: 'linear-gradient(135deg, #1e293b, #0f172a)', border: '1px solid #334155', borderRadius: '12px', padding: '16px' }}>
                    <h3 style={{ margin: '0 0 12px', fontSize: '14px', color: '#94a3b8' }}>📊 Biểu đồ Sensor</h3>
                    <ResponsiveContainer width="100%" height={200}>
                        <LineChart data={chartData}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                            <XAxis dataKey="timestamp" tick={{ fill: '#64748b', fontSize: 10 }} />
                            <YAxis tick={{ fill: '#64748b', fontSize: 10 }} />
                            <Tooltip contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '8px' }} />
                            <Legend />
                            <Line type="monotone" dataKey="temperature" stroke="#f87171" name="Nhiệt độ (°C)" dot={false} strokeWidth={2} />
                            <Line type="monotone" dataKey="humidity" stroke="#60a5fa" name="Độ ẩm (%)" dot={false} strokeWidth={2} />
                            <Line type="monotone" dataKey="soil_moisture" stroke="#10b981" name="Độ ẩm đất (%)" dot={false} strokeWidth={2} />
                        </LineChart>
                    </ResponsiveContainer>
                </div>

                {/* Device Status */}
                <div style={{ background: 'linear-gradient(135deg, #1e293b, #0f172a)', border: '1px solid #334155', borderRadius: '12px', padding: '16px' }}>
                    <h3 style={{ margin: '0 0 12px', fontSize: '14px', color: '#94a3b8' }}>🔌 Trạng thái thiết bị</h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px', background: '#0f172a', borderRadius: '8px' }}>
                            <span>⚡ Máy bơm</span>
                            <span style={{
                                padding: '4px 12px', borderRadius: '20px', fontSize: '12px', fontWeight: 'bold',
                                background: kpis.pump_status === 'ON' ? 'rgba(34, 197, 94, 0.2)' : 'rgba(239, 68, 68, 0.2)',
                                color: kpis.pump_status === 'ON' ? '#22c55e' : '#ef4444'
                            }}>
                                {kpis.pump_status}
                            </span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px', background: '#0f172a', borderRadius: '8px' }}>
                            <span>💡 Đèn</span>
                            <span style={{
                                padding: '4px 12px', borderRadius: '20px', fontSize: '12px', fontWeight: 'bold',
                                background: kpis.lamp_status === 'ON' ? 'rgba(34, 197, 94, 0.2)' : 'rgba(239, 68, 68, 0.2)',
                                color: kpis.lamp_status === 'ON' ? '#22c55e' : '#ef4444'
                            }}>
                                {kpis.lamp_status}
                            </span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px', background: '#0f172a', borderRadius: '8px' }}>
                            <span>🌀 Quạt</span>
                            <span style={{
                                padding: '4px 12px', borderRadius: '20px', fontSize: '12px', fontWeight: 'bold',
                                background: kpis.fan_status === 'ON' ? 'rgba(34, 197, 94, 0.2)' : 'rgba(239, 68, 68, 0.2)',
                                color: kpis.fan_status === 'ON' ? '#22c55e' : '#ef4444'
                            }}>
                                {kpis.fan_status}
                            </span>
                        </div>
                    </div>
                </div>
            </div>

            {/* AI Detection + Data Table Row */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '16px' }}>
                {/* AI Detection */}
                <div style={{ background: 'linear-gradient(135deg, #1e293b, #0f172a)', border: '1px solid #334155', borderRadius: '12px', padding: '16px' }}>
                    <h3 style={{ margin: '0 0 12px', fontSize: '14px', color: '#94a3b8' }}>🤖 AI Nhận diện (Jetson)</h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        <div style={{ padding: '12px', background: '#0f172a', borderRadius: '8px' }}>
                            <div style={{ color: '#64748b', fontSize: '12px' }}>Số cây phát hiện</div>
                            <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#10b981' }}>🌱 {kpis.plant_count}</div>
                        </div>
                        <div style={{ padding: '12px', background: '#0f172a', borderRadius: '8px' }}>
                            <div style={{ color: '#64748b', fontSize: '12px' }}>Kết quả nhận diện</div>
                            <div style={{ fontSize: '14px', color: '#e2e8f0', marginTop: '4px' }}>{kpis.prediction}</div>
                        </div>
                        <div style={{ padding: '12px', background: '#0f172a', borderRadius: '8px' }}>
                            <div style={{ color: '#64748b', fontSize: '12px' }}>Độ tin cậy</div>
                            <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#8b5cf6' }}>
                                {typeof kpis.confidence === 'number' ? `${(kpis.confidence * 100).toFixed(1)}%` : '--'}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Data Table */}
                <div style={{ background: 'linear-gradient(135deg, #1e293b, #0f172a)', border: '1px solid #334155', borderRadius: '12px', padding: '16px', maxHeight: '300px', overflowY: 'auto' }}>
                    <h3 style={{ margin: '0 0 12px', fontSize: '14px', color: '#94a3b8' }}>📋 Lịch sử ghi nhận</h3>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                        <thead>
                            <tr style={{ borderBottom: '1px solid #334155' }}>
                                <th style={{ padding: '8px', textAlign: 'left', color: '#64748b' }}>Thời gian</th>
                                <th style={{ padding: '8px', textAlign: 'right', color: '#64748b' }}>Nhiệt độ</th>
                                <th style={{ padding: '8px', textAlign: 'right', color: '#64748b' }}>Độ ẩm</th>
                                <th style={{ padding: '8px', textAlign: 'right', color: '#64748b' }}>Đất</th>
                                <th style={{ padding: '8px', textAlign: 'right', color: '#64748b' }}>Ánh sáng</th>
                            </tr>
                        </thead>
                        <tbody>
                            {processedData.slice(0, 20).map((row, idx) => (
                                <tr key={idx} style={{ borderBottom: '1px solid #1f2937' }}>
                                    <td style={{ padding: '8px', color: '#94a3b8' }}>{row.timestamp}</td>
                                    <td style={{ padding: '8px', textAlign: 'right', color: '#f87171' }}>{row.temperature?.toFixed(1) ?? '--'}°C</td>
                                    <td style={{ padding: '8px', textAlign: 'right', color: '#60a5fa' }}>{row.humidity?.toFixed(1) ?? '--'}%</td>
                                    <td style={{ padding: '8px', textAlign: 'right', color: '#10b981' }}>{row.soil_moisture?.toFixed(0) ?? '--'}%</td>
                                    <td style={{ padding: '8px', textAlign: 'right', color: '#fbbf24' }}>{row.light_level ?? '--'}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

export default SmartGardenDashboard;
