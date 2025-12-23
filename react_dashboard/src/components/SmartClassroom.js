import React, { useState, useEffect } from 'react';
import { fetchDevicesLatestAll, fetchDeviceData } from '../services'; // Assuming fetchDeviceData exists or we use fetchDevicesLatestAll
import SmartClassroomDashboard from './SmartClassroomDashboard';
import axios from 'axios';

const API_BASE = process.env.REACT_APP_API_BASE || 'http://localhost:8000';

const SmartClassroom = ({ token, onBack }) => {
    const [devices, setDevices] = useState([]);
    const [selectedDevice, setSelectedDevice] = useState(null);
    const [logs, setLogs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    // 1. Fetch all devices and filter for 'smart_classroom_energy'
    useEffect(() => {
        const loadDevices = async () => {
            try {
                const res = await fetchDevicesLatestAll(token);
                const allDevices = res.data.devices || [];
                // Filter for Smart Classroom devices
                const classroomDevices = allDevices.filter(d => d.loai_thiet_bi === 'smart_classroom_energy');

                setDevices(classroomDevices);

                if (classroomDevices.length > 0) {
                    // Select the first one by default
                    setSelectedDevice(classroomDevices[0]);
                } else {
                    setLoading(false); // No devices found
                }
            } catch (err) {
                console.error('Failed to load devices', err);
                setError('Không thể tải danh sách thiết bị');
                setLoading(false);
            }
        };
        loadDevices();
    }, [token]);

    // 2. Load logs for selected device + WebSocket for real-time
    useEffect(() => {
        if (!selectedDevice) return;

        const loadLogs = async () => {
            try {
                const res = await axios.get(
                    `${API_BASE}/events/${selectedDevice.device_id || selectedDevice.ma_thiet_bi}?page=1&page_size=50`,
                    { headers: { Authorization: `Bearer ${token}` } }
                );
                const events = res.data.events || [];
                // Sort newest first
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
                    // Add new event to beginning of logs
                    setLogs(prev => {
                        const newEvent = { ...data };
                        const updated = [newEvent, ...prev].slice(0, 100); // Keep max 100
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

        // Fallback polling every 10s (in case WebSocket fails)
        const interval = setInterval(loadLogs, 10000);

        return () => {
            ws.close();
            clearInterval(interval);
        };

    }, [selectedDevice, token]);

    if (loading && !selectedDevice && devices.length === 0) {
        return (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', flexDirection: 'column', color: '#fff' }}>
                <div className="spinner neon"></div>
                <p style={{ marginTop: '20px' }}>Đang tải dữ liệu lớp học...</p>
            </div>
        );
    }

    if (devices.length === 0) {
        return (
            <div style={{ padding: '40px', color: '#fff', textAlign: 'center' }}>
                <h1>🏫 Lớp học thông minh</h1>
                <p>Chưa có thiết bị lớp học nào được đăng ký.</p>
                <button
                    className="primary-btn"
                    onClick={onBack}
                    style={{ marginTop: '20px' }}
                >
                    Quay lại Dashboard
                </button>
            </div>
        );
    }

    return (
        <div className="smart-classroom-container">
            {/* Toolbar if multiple devices */}
            {devices.length > 1 && (
                <div style={{ padding: '20px', background: '#1e293b', borderBottom: '1px solid #334155', display: 'flex', gap: '10px', alignItems: 'center' }}>
                    <span style={{ color: '#94a3b8' }}>Chọn phòng:</span>
                    {devices.map(dev => (
                        <button
                            key={dev.device_id || dev.ma_thiet_bi}
                            className={`btn ${selectedDevice?.device_id === dev.device_id ? 'active-room' : ''}`}
                            onClick={() => setSelectedDevice(dev)}
                            style={{
                                background: selectedDevice?.device_id === dev.device_id ? '#3b82f6' : 'transparent',
                                border: '1px solid #3b82f6',
                                color: '#fff',
                                padding: '5px 15px',
                                cursor: 'pointer',
                                borderRadius: '6px'
                            }}
                        >
                            {dev.ten_thiet_bi || dev.device_id}
                        </button>
                    ))}
                </div>
            )}

            {/* Render Dashboard */}
            {selectedDevice && (
                <div style={{ position: 'relative' }}>
                    <button
                        className="back-btn-ghost"
                        onClick={onBack}
                        style={{ position: 'absolute', top: '20px', right: '20px', zIndex: 100 }}
                    >
                        Email Report ✉️
                    </button>
                    <SmartClassroomDashboard device={selectedDevice} logs={logs} />
                </div>
            )}
        </div>
    );
};

export default SmartClassroom;
