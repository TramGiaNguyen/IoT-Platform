import React, { useState, useEffect } from 'react';
import axios from 'axios';
import SmartGardenDashboard from './SmartGardenDashboard';

const API_BASE = process.env.REACT_APP_API_BASE || 'http://localhost:8000';

function SmartGarden({ token, onBack }) {
    const [devices, setDevices] = useState([]);
    const [selectedDevice, setSelectedDevice] = useState(null);
    const [logs, setLogs] = useState([]);
    const [loading, setLoading] = useState(true);

    // 1. Load all devices of type smart_garden
    useEffect(() => {
        const loadDevices = async () => {
            try {
                const res = await axios.get(`${API_BASE}/devices`, {
                    headers: { Authorization: `Bearer ${token}` }
                });
                const allDevices = res.data;
                // Filter for smart_garden devices
                const gardenDevices = allDevices.filter(d =>
                    d.loai_thiet_bi === 'smart_garden' ||
                    (d.ma_thiet_bi && d.ma_thiet_bi.toLowerCase().includes('garden'))
                );
                setDevices(gardenDevices);
                if (gardenDevices.length > 0) {
                    setSelectedDevice(gardenDevices[0]);
                }
            } catch (err) {
                console.error('Failed to load devices:', err);
            }
        };
        loadDevices();
    }, [token]);

    // 2. Load logs for selected device + WebSocket
    useEffect(() => {
        if (!selectedDevice) return;

        const loadLogs = async () => {
            try {
                const res = await axios.get(
                    `${API_BASE}/events/${selectedDevice.device_id || selectedDevice.ma_thiet_bi}?page=1&page_size=50`,
                    { headers: { Authorization: `Bearer ${token}` } }
                );
                const events = res.data.events || [];
                const sortedEvents = events.sort((a, b) => b.timestamp - a.timestamp);
                setLogs(sortedEvents);
                setLoading(false);
            } catch (err) {
                console.error('Failed to load logs', err);
                setLoading(false);
            }
        };

        loadLogs();

        // WebSocket for real-time updates
        const WS_URL = `${API_BASE.replace(/^http/i, 'ws')}/ws/events`;
        const ws = new WebSocket(WS_URL);

        ws.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                const deviceCode = selectedDevice.device_id || selectedDevice.ma_thiet_bi;

                if (data.device_id === deviceCode) {
                    setLogs(prev => {
                        const newEvent = { ...data };
                        const updated = [newEvent, ...prev].slice(0, 100);
                        return updated;
                    });
                }
            } catch (e) {
                console.error('WS parse error', e);
            }
        };

        ws.onerror = (err) => {
            console.error('WebSocket error:', err);
        };

        // Fallback polling every 10s
        const interval = setInterval(loadLogs, 10000);

        return () => {
            ws.close();
            clearInterval(interval);
        };
    }, [selectedDevice, token]);

    if (loading && devices.length === 0) {
        return (
            <div style={{ padding: '40px', textAlign: 'center', color: '#94a3b8' }}>
                <div>⏳ Đang tải...</div>
            </div>
        );
    }

    if (devices.length === 0) {
        return (
            <div style={{ padding: '40px', textAlign: 'center', color: '#94a3b8' }}>
                <button onClick={onBack} style={{ marginBottom: '20px', padding: '10px 20px', background: '#334155', border: 'none', borderRadius: '8px', color: '#e2e8f0', cursor: 'pointer' }}>
                    ← Quay lại
                </button>
                <div style={{ fontSize: '48px', marginBottom: '16px' }}>🌿</div>
                <h2>Chưa có thiết bị vườn thông minh</h2>
                <p>Vào Dashboard → Bấm "+" → Chọn "Vườn thông minh" để tạo thiết bị mới.</p>
            </div>
        );
    }

    return (
        <div style={{ minHeight: '100vh', background: '#0b1224' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 24px', borderBottom: '1px solid #1f2a44' }}>
                <button onClick={onBack} style={{ padding: '10px 20px', background: '#334155', border: 'none', borderRadius: '8px', color: '#e2e8f0', cursor: 'pointer' }}>
                    ← Quay lại
                </button>
                {devices.length > 1 && (
                    <select
                        value={selectedDevice?.ma_thiet_bi || ''}
                        onChange={(e) => {
                            const dev = devices.find(d => d.ma_thiet_bi === e.target.value);
                            setSelectedDevice(dev);
                            setLoading(true);
                        }}
                        style={{ padding: '10px 16px', background: '#1e293b', border: '1px solid #334155', borderRadius: '8px', color: '#e2e8f0' }}
                    >
                        {devices.map(d => (
                            <option key={d.ma_thiet_bi} value={d.ma_thiet_bi}>
                                {d.ten_thiet_bi || d.ma_thiet_bi}
                            </option>
                        ))}
                    </select>
                )}
            </div>

            <SmartGardenDashboard device={selectedDevice} logs={logs} />
        </div>
    );
}

export default SmartGarden;
