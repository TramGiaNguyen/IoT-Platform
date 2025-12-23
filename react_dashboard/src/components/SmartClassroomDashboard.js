import React, { useMemo } from 'react';
import {
    LineChart,
    Line,
    AreaChart,
    Area,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    Legend,
    ResponsiveContainer,
    BarChart,
    Bar,
    ComposedChart,
} from 'recharts';

import '../styles/Dashboard.css'; // Reuse existing styles

const SmartClassroomDashboard = ({ device, logs }) => {
    // Pre-process data
    const processedData = useMemo(() => {
        if (!logs || logs.length === 0) return [];

        return logs.map(log => {
            // Parse values, handle errors/defaults
            const parse = (val) => {
                const num = parseFloat(val);
                // Filter out default values 999 or 999999
                if (isNaN(num) || num > 100000) return 0; // Heuristic for bad data
                return num;
            };

            return {
                timestamp: new Date(log.timestamp * 1000).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
                fullTime: new Date(log.timestamp * 1000),

                // Power & Energy
                Cong_suat_TB: parse(log.Cong_suat_TB),
                Dong_dien_TB: parse(log.Dong_dien_TB),
                Nang_luong: parse(log.Nang_luong),
                Tien_dien: parse(log.Tien_dien),

                // Quality
                Dien_ap_TB: parse(log.Dien_ap_TB),
                Dien_ap_Max: parse(log.Dien_ap_Max) > 500 ? parse(log.Dien_ap_TB) + 5 : parse(log.Dien_ap_Max), // Fallback if crazy value
                Dien_ap_Min: parse(log.Dien_ap_Min) > 500 ? parse(log.Dien_ap_TB) - 5 : parse(log.Dien_ap_Min),

                Tan_so_TB: parse(log.Tan_so_TB),
                He_so_cong_suat_TB: parse(log.He_so_cong_suat_TB),
            };
        }).reverse(); // Sort logging chronological if needed, usually logs are new->old
    }, [logs]);

    // Calculate KPIs - Use latest values from edge device (already calculated)
    const kpis = useMemo(() => {
        if (processedData.length === 0) return { totalKWh: 0, totalCost: 0, currentPower: 0, voltStatus: 'N/A' };

        const latest = processedData[0]; // First item is latest (sorted desc)

        // Edge device đã tính sẵn tổng, chỉ cần lấy giá trị mới nhất
        const totalKWh = latest.Nang_luong || 0;
        const totalCost = latest.Tien_dien || 0;

        return {
            totalKWh: totalKWh.toFixed(3),
            totalCost: totalCost.toLocaleString('vi-VN'),
            currentPower: latest.Cong_suat_TB,
            currentVolt: latest.Dien_ap_TB,
            currentPF: latest.He_so_cong_suat_TB,
            voltStatus: (latest.Dien_ap_TB > 210 && latest.Dien_ap_TB < 240) ? 'Ổn định' : 'Cảnh báo'
        };
    }, [processedData]);

    // Chart data (reverse order for chart: old -> new)
    const chartData = useMemo(() => [...processedData].reverse(), [processedData]);

    return (
        <div className="smart-classroom-dashboard" style={{ padding: '20px', color: '#e0e0e0' }}>

            {/* Header */}
            <div style={{ marginBottom: '20px', borderBottom: '1px solid #333', paddingBottom: '10px' }}>
                <h2 style={{ margin: 0 }}>📊 Giám sát Năng lượng: {device.ten_thiet_bi || device.device_id}</h2>
                <span style={{ color: '#888', fontSize: '0.9em' }}>Cập nhật lúc: {new Date().toLocaleTimeString('vi-VN')}</span>
            </div>

            {/* KPI Cards */}
            <div className="summary-cards" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '15px', marginBottom: '20px' }}>
                <div className="card" style={{ background: 'linear-gradient(135deg, #1e293b, #0f172a)', padding: '20px', borderRadius: '12px', border: '1px solid #334155' }}>
                    <div style={{ fontSize: '2em', marginBottom: '5px' }}>⚡</div>
                    <div style={{ color: '#94a3b8', fontSize: '0.9em' }}>Tiêu thụ phiên này</div>
                    <div style={{ fontSize: '1.5em', fontWeight: 'bold', color: '#f59e0b' }}>{kpis.totalKWh} <small>kWh</small></div>
                </div>

                <div className="card" style={{ background: 'linear-gradient(135deg, #1e293b, #0f172a)', padding: '20px', borderRadius: '12px', border: '1px solid #334155' }}>
                    <div style={{ fontSize: '2em', marginBottom: '5px' }}>💰</div>
                    <div style={{ color: '#94a3b8', fontSize: '0.9em' }}>Chi phí tạm tính</div>
                    <div style={{ fontSize: '1.5em', fontWeight: 'bold', color: '#10b981' }}>{kpis.totalCost} <small>đ</small></div>
                </div>

                <div className="card" style={{ background: 'linear-gradient(135deg, #1e293b, #0f172a)', padding: '20px', borderRadius: '12px', border: '1px solid #334155' }}>
                    <div style={{ fontSize: '2em', marginBottom: '5px' }}>🔌</div>
                    <div style={{ color: '#94a3b8', fontSize: '0.9em' }}>Công suất hiện tại</div>
                    <div style={{ fontSize: '1.5em', fontWeight: 'bold', color: '#3b82f6' }}>{kpis.currentPower} <small>W</small></div>
                </div>

                <div className="card" style={{ background: 'linear-gradient(135deg, #1e293b, #0f172a)', padding: '20px', borderRadius: '12px', border: '1px solid #334155' }}>
                    <div style={{ fontSize: '2em', marginBottom: '5px' }}>{kpis.voltStatus === 'Ổn định' ? '✅' : '⚠️'}</div>
                    <div style={{ color: '#94a3b8', fontSize: '0.9em' }}>Điện áp ({kpis.voltStatus})</div>
                    <div style={{ fontSize: '1.5em', fontWeight: 'bold', color: kpis.voltStatus === 'Ổn định' ? '#10b981' : '#ef4444' }}>{kpis.currentVolt} <small>V</small></div>
                </div>
            </div>

            {/* Charts Section */}
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '20px', marginBottom: '20px' }}>

                {/* Power & Current Chart */}
                <div style={{ background: '#1e293b', padding: '15px', borderRadius: '12px', border: '1px solid #334155' }}>
                    <h3 style={{ marginTop: 0, marginBottom: '15px', color: '#e2e8f0' }}>📈 Biểu đồ Phụ tải (Power & Current)</h3>
                    <ResponsiveContainer width="100%" height={300}>
                        <ComposedChart data={chartData}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                            <XAxis dataKey="timestamp" stroke="#94a3b8" tick={{ fontSize: 11 }} />
                            <YAxis yAxisId="power" orientation="left" stroke="#3b82f6" label={{ value: 'W', angle: -90, position: 'insideLeft', fill: '#3b82f6' }} />
                            <YAxis yAxisId="current" orientation="right" stroke="#f59e0b" label={{ value: 'A', angle: 90, position: 'insideRight', fill: '#f59e0b' }} />
                            <Tooltip contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', color: '#fff' }} />
                            <Legend />
                            <Area yAxisId="power" type="monotone" dataKey="Cong_suat_TB" name="Công suất (W)" fill="#3b82f6" fillOpacity={0.2} stroke="#3b82f6" />
                            <Line yAxisId="current" type="monotone" dataKey="Dong_dien_TB" name="Dòng điện (A)" stroke="#f59e0b" dot={false} strokeWidth={2} />
                        </ComposedChart>
                    </ResponsiveContainer>
                </div>

                {/* Quality Chart */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                    {/* Voltage */}
                    <div style={{ background: '#1e293b', padding: '15px', borderRadius: '12px', border: '1px solid #334155', flex: 1 }}>
                        <h4 style={{ margin: '0 0 10px 0' }}>⚡ Điện áp (V)</h4>
                        <ResponsiveContainer width="100%" height={120}>
                            <LineChart data={chartData}>
                                <CartesianGrid stroke="#334155" strokeDasharray="3 3" />
                                <XAxis dataKey="timestamp" hide />
                                <YAxis domain={['auto', 'auto']} stroke="#10b981" width={40} />
                                <Tooltip contentStyle={{ backgroundColor: '#0f172a' }} />
                                <Line type="monotone" dataKey="Dien_ap_TB" stroke="#10b981" dot={false} strokeWidth={2} />
                            </LineChart>
                        </ResponsiveContainer>
                    </div>

                    {/* PF & Frequency */}
                    <div style={{ background: '#1e293b', padding: '15px', borderRadius: '12px', border: '1px solid #334155', flex: 1 }}>
                        <h4 style={{ margin: '0 0 10px 0' }}>📊 Power Factor & Hz</h4>
                        <div style={{ display: 'flex', justifyContent: 'space-around', alignItems: 'center', height: '100px' }}>
                            <div style={{ textAlign: 'center' }}>
                                <div style={{ fontSize: '2em', fontWeight: 'bold', color: kpis.currentPF > 0.9 ? '#10b981' : '#f59e0b' }}>{kpis.currentPF}</div>
                                <div style={{ fontSize: '0.8em', color: '#94a3b8' }}>Power Factor</div>
                            </div>
                            <div style={{ width: '1px', height: '50px', background: '#334155' }}></div>
                            <div style={{ textAlign: 'center' }}>
                                <div style={{ fontSize: '2em', fontWeight: 'bold', color: '#fff' }}>{processedData[0]?.Tan_so_TB}</div>
                                <div style={{ fontSize: '0.8em', color: '#94a3b8' }}>Hz</div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Data Table */}
            <div style={{ background: '#1e293b', padding: '20px', borderRadius: '12px', border: '1px solid #334155' }}>
                <h3 style={{ marginTop: 0, marginBottom: '15px' }}>📜 Lịch sử ghi nhận chi tiết</h3>
                <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9em' }}>
                        <thead>
                            <tr style={{ background: '#0f172a', color: '#94a3b8' }}>
                                <th style={{ padding: '10px', textAlign: 'left' }}>Thời gian</th>
                                <th style={{ padding: '10px', textAlign: 'right' }}>Điện áp (V)</th>
                                <th style={{ padding: '10px', textAlign: 'right' }}>Dòng (A)</th>
                                <th style={{ padding: '10px', textAlign: 'right' }}>Công suất (W)</th>
                                <th style={{ padding: '10px', textAlign: 'center' }}>PF</th>
                                <th style={{ padding: '10px', textAlign: 'right' }}>Năng lượng (kWh)</th>
                                <th style={{ padding: '10px', textAlign: 'right' }}>Tiền điện (đ)</th>
                            </tr>
                        </thead>
                        <tbody>
                            {processedData.slice(0, 10).map((row, idx) => (
                                <tr key={idx} style={{ borderBottom: '1px solid #334155' }}>
                                    <td style={{ padding: '10px' }}>{row.timestamp}</td>
                                    <td style={{ padding: '10px', textAlign: 'right', color: '#10b981' }}>{row.Dien_ap_TB}</td>
                                    <td style={{ padding: '10px', textAlign: 'right', color: '#f59e0b' }}>{row.Dong_dien_TB}</td>
                                    <td style={{ padding: '10px', textAlign: 'right', color: '#3b82f6', fontWeight: 'bold' }}>{row.Cong_suat_TB}</td>
                                    <td style={{ padding: '10px', textAlign: 'center' }}>{row.He_so_cong_suat_TB}</td>
                                    <td style={{ padding: '10px', textAlign: 'right' }}>{row.Nang_luong.toFixed(4)}</td>
                                    <td style={{ padding: '10px', textAlign: 'right' }}>{row.Tien_dien}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    <div style={{ textAlign: 'center', padding: '10px', color: '#64748b', fontSize: '0.9em' }}>
                        Hiển thị 10/ {processedData.length} bản ghi mới nhất
                    </div>
                </div>
            </div>

        </div>
    );
};

export default SmartClassroomDashboard;
