import React, { useState, useEffect, useRef, useCallback } from 'react';
import axios from 'axios';
import { API_BASE, AI_ANALYST_BASE } from '../config/api';
import {
  fetchRoomCameras,
  createRoomCamera,
  updateRoomCamera,
  deleteRoomCamera,
  fetchRoomOccupancy,
  fetchRoomDeviceData,
} from '../services';

/* ------------------------------------------------------------------ */
/* CSS classes for this component (appended to style.css)              */
/* ------------------------------------------------------------------ */
const _css = `
.room-detail-page { padding: 24px 32px; }
.room-detail-header { margin-bottom: 28px; }
.room-detail-header h2 { margin: 0 0 4px; color: #e2e8f0; font-size: 1.4rem; }
.room-detail-header .room-meta { color: #94a3b8; font-size: 0.9rem; }
.room-detail-devices { margin-bottom: 32px; }
.room-detail-devices h3 { color: #e2e8f0; margin-bottom: 12px; font-size: 1rem; }
.room-detail-section { margin-bottom: 32px; }
.room-detail-section h3 { color: #e2e8f0; margin-bottom: 12px; font-size: 1rem; }
.room-occupancy-banner {
  display: inline-flex; align-items: center; gap: 10px;
  background: rgba(34,211,238,0.08); border: 1px solid rgba(34,211,238,0.25);
  border-radius: 12px; padding: 10px 20px; margin-bottom: 24px;
}
.room-occupancy-count { font-size: 2.2rem; font-weight: 700; color: #22d3ee; line-height: 1; }
.room-occupancy-label { color: #94a3b8; font-size: 0.9rem; }
.camera-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(380px, 1fr)); gap: 20px; }
.camera-card {
  background: linear-gradient(145deg, rgba(15,23,42,0.8), rgba(9,12,24,0.9));
  border: 1px solid rgba(255,255,255,0.08); border-radius: 14px;
  overflow: hidden; transition: box-shadow 0.2s;
}
.camera-card.streaming { border-color: rgba(34,211,238,0.35); box-shadow: 0 0 20px rgba(34,211,238,0.1); }
.camera-card-header {
  display: flex; justify-content: space-between; align-items: center;
  padding: 12px 16px; border-bottom: 1px solid rgba(255,255,255,0.05);
}
.camera-card-header .cam-title { font-size: 0.95rem; font-weight: 600; color: #e2e8f0; }
.camera-card-header .cam-sub { font-size: 0.8rem; color: #64748b; }
.camera-stream-wrap { position: relative; background: #000; min-height: 200px; }
.camera-stream-wrap img { width: 100%; display: block; }
.camera-stream-placeholder {
  display: flex; align-items: center; justify-content: center;
  min-height: 200px; color: #475569; font-size: 0.85rem;
}
.camera-overlay {
  position: absolute; top: 8px; right: 8px;
  background: rgba(0,0,0,0.55); border-radius: 6px; padding: 4px 8px;
  font-size: 0.78rem; color: #fff; display: flex; align-items: center; gap: 6px;
}
.camera-count-badge {
  background: rgba(34,211,238,0.15); border: 1px solid rgba(34,211,238,0.4);
  border-radius: 50px; padding: 2px 8px; font-weight: 700; color: #22d3ee;
}
.camera-form { padding: 16px; }
.camera-form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.camera-form-grid .full { grid-column: 1 / -1; }
.camera-form input, .camera-form select {
  width: 100%; padding: 8px 10px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.12);
  background: rgba(255,255,255,0.06); color: #e2e8f0; font-size: 0.85rem;
  outline: none; transition: border-color 0.2s;
}
.camera-form input:focus, .camera-form select:focus { border-color: #22d3ee; }
.camera-form input::placeholder { color: #475569; }
.camera-form label { display: block; font-size: 0.78rem; color: #64748b; margin-bottom: 4px; }
.camera-form-actions { display: flex; gap: 8px; margin-top: 14px; }
.camera-form-actions button {
  flex: 1; padding: 8px; border-radius: 8px; border: none; cursor: pointer;
  font-size: 0.85rem; font-weight: 600; transition: opacity 0.2s;
}
.camera-form-actions button:hover { opacity: 0.85; }
.camera-form-actions .btn-confirm { background: #22d3ee; color: #0f172a; }
.camera-form-actions .btn-cancel { background: rgba(255,255,255,0.08); color: #94a3b8; }
.camera-form-actions .btn-delete { background: rgba(239,68,68,0.15); color: #fca5a5; }
.camera-form-actions .btn-edit { background: rgba(59,130,246,0.15); color: #93c5fd; }
.btn-add-camera {
  width: 100%; padding: 14px; border-radius: 10px;
  border: 1px dashed rgba(34,211,238,0.3); background: transparent;
  color: #22d3ee; cursor: pointer; font-size: 0.9rem;
  transition: background 0.2s, border-color 0.2s;
}
.btn-add-camera:hover { background: rgba(34,211,238,0.06); border-color: #22d3ee; }
.device-chip {
  display: inline-flex; align-items: center; gap: 4px; padding: 3px 8px;
  background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.1);
  border-radius: 6px; font-size: 0.78rem; color: #94a3b8; margin: 2px;
}
.status-dot { width: 7px; height: 7px; border-radius: 50%; }
.status-online { background: #22c55e; }
.status-offline { background: #475569; }
.no-device { color: #475569; font-size: 0.85rem; font-style: italic; }
`;
if (!document.getElementById('room-detail-css')) {
  const s = document.createElement('style');
  s.id = 'room-detail-css';
  s.textContent = _css;
  document.head.appendChild(s);
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */
function hdr(token) { return { headers: { Authorization: `Bearer ${token}` } }; }

function statusDot(status) {
  return <span className={`status-dot status-${status || 'offline'}`} />;
}

/* ------------------------------------------------------------------ */
/* CameraCard                                                          */
/* ------------------------------------------------------------------ */
function CameraCard({ camera, roomId, token, onDelete, onUpdate, onPeopleCount }) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    ten: camera.ten || '',
    ip_address: camera.ip_address || '',
    port: camera.port || 554,
    rtsp_path: camera.rtsp_path || '',
    username: camera.username || '',
    password: '',
    stream_url: camera.stream_url || '',
    is_active: camera.is_active !== false,
  });
  const [loading, setLoading] = useState(false);
  const [streamSessionId, setStreamSessionId] = useState(null);
  const [peopleCount, setPeopleCount] = useState(0);
  const [streamFps, setStreamFps] = useState(null);
  const [streamError, setStreamError] = useState(null);
  const [confirmLoading, setConfirmLoading] = useState(false);
  const imgRef = useRef(null);
  const pollRef = useRef(null);
  const [connected, setConnected] = useState(false);

  /* poll status while streaming */
  useEffect(() => {
    if (!streamSessionId) return;
    const poll = () => {
      axios.get(`${AI_ANALYST_BASE}/sessions/${streamSessionId}/status`)
        .then(r => {
          const cnt = r.data.so_nguoi;
          setPeopleCount(cnt);
          setStreamFps(r.data.fps);
          if (r.data.status === 'error') setStreamError(r.data.error);
          onPeopleCount && onPeopleCount(cnt);
        })
        .catch(() => {});
    };
    pollRef.current = setInterval(poll, 1000);
    return () => clearInterval(pollRef.current);
  }, [streamSessionId, onPeopleCount]);

  /* stop stream — KHÔNG auto-stop khi unmount (server giữ session nền 24/7) */
  const stopStream = useCallback(() => {
    if (streamSessionId) {
      axios.post(`${AI_ANALYST_BASE}/sessions/${streamSessionId}/stop`).catch(() => {});
      setStreamSessionId(null);
    }
    clearInterval(pollRef.current);
    setConnected(false);
    setStreamError(null);
    setPeopleCount(0);
    setStreamFps(null);
  }, [streamSessionId]);

  // Không auto-stop khi unmount — AI nền 24/7 vẫn chạy trên server

  /* Gắn vào session đã có khi mount (AI nền đã chạy sẵn) */
  useEffect(() => {
    if (streamSessionId || !camera.id) return;
    axios.get(`${AI_ANALYST_BASE}/sessions/lookup?room_id=${roomId}&camera_id=${camera.id}`)
      .then(r => {
        setStreamSessionId(r.data.session_id);
      })
      .catch(() => {});
  }, []); // chỉ chạy 1 lần khi mount

  /* reconnect img on session change */
  useEffect(() => {
    if (!streamSessionId || !imgRef.current) return;
    imgRef.current.src = `${AI_ANALYST_BASE}/sessions/${streamSessionId}/stream.mjpeg?t=${Date.now()}`;
    imgRef.current.onload = () => setConnected(true);
    imgRef.current.onerror = () => setConnected(false);
  }, [streamSessionId]);

  const handleConfirm = async () => {
    setConfirmLoading(true);
    try {
      // If camera already exists, just start AI session
      // If not, create camera first
      let cameraId = camera.id;
      
      if (!cameraId) {
        const res = await createRoomCamera(roomId, {
          ten: form.ten || `Camera ${camera.ten || ''}`,
          ip_address: form.ip_address,
          port: form.port || 554,
          rtsp_path: form.rtsp_path,
          username: form.username || undefined,
          password: form.password || undefined,
          stream_url: form.stream_url || undefined,
          thu_tu: camera.thu_tu || 0,
        }, token);
        cameraId = res.data.camera.id;
      }

      /* start AI session */
      const { session_id } = (await axios.post(
        `${AI_ANALYST_BASE}/sessions/start`,
        { room_id: Number(roomId), camera_id: cameraId }
      )).data;

      setStreamSessionId(session_id);
      setEditing(false);
      if (!camera.id) {
        // Only reload if we created a new camera
        onUpdate();
      }
    } catch (e) {
      alert('Khong the ket noi camera: ' + (e.response?.data?.detail || e.message));
    } finally {
      setConfirmLoading(false);
    }
  };

  const handleUpdate = async () => {
    setLoading(true);
    try {
      await updateRoomCamera(roomId, camera.id, {
        ten: form.ten,
        ip_address: form.ip_address,
        port: form.port,
        rtsp_path: form.rtsp_path,
        username: form.username || undefined,
        password: form.password || undefined,
        stream_url: form.stream_url || undefined,
        is_active: form.is_active,
      }, token);
      setEditing(false);
      onUpdate();
    } catch (e) {
      alert('Loi cap nhat: ' + (e.response?.data?.detail || e.message));
    } finally {
      setLoading(false);
    }
  };

  const handleStopStream = () => {
    stopStream();
  };

  const field = (name, label, placeholder, full = false) => (
    <div className={full ? 'full' : ''}>
      <label>{label}</label>
      <input
        placeholder={placeholder}
        value={form[name] ?? ''}
        onChange={e => setForm(f => ({ ...f, [name]: e.target.value }))}
      />
    </div>
  );

  return (
    <div className={`camera-card${streamSessionId ? ' streaming' : ''}`}>
      <div className="camera-card-header">
        <div>
          <div className="cam-title">{camera.ten || `Camera ${camera.id}`}</div>
          {camera.ip_address && <div className="cam-sub">{camera.ip_address}:{camera.port || 554}</div>}
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          {streamSessionId && (
            <span style={{ fontSize: '0.75rem', color: '#22c55e' }}>● LIVE</span>
          )}
          {!editing && (
            <button className="btn-icon" title="Sua" onClick={() => setEditing(!editing)}>
              {editing ? '✕' : '✎'}
            </button>
          )}
          <button className="btn-icon danger" title="Xoa camera" onClick={() => {
            stopStream();
            onDelete(camera.id);
          }}>✕</button>
        </div>
      </div>

      {/* Stream */}
      <div className="camera-stream-wrap">
        {streamSessionId ? (
          <>
            <img
              ref={imgRef}
              alt="Camera stream"
              onError={() => setConnected(false)}
              onLoad={() => setConnected(true)}
            />
            <div className="camera-overlay">
              {connected && <span style={{ color: '#22c55e' }}>●</span>}
              {!connected && <span>...</span>}
              <span className="camera-count-badge">{peopleCount} nguoi</span>
              {streamFps && <span style={{ color: '#94a3b8', fontSize: '0.72rem' }}>{streamFps}fps</span>}
            </div>
            <button
              onClick={handleStopStream}
              style={{
                position: 'absolute', bottom: 8, right: 8,
                background: 'rgba(239,68,68,0.8)', color: '#fff',
                border: 'none', borderRadius: 6, padding: '4px 10px',
                fontSize: '0.75rem', cursor: 'pointer',
              }}
            >Dung</button>
          </>
        ) : (
          <div className="camera-stream-placeholder">
            {streamError ? (
              <span style={{ color: '#fca5a5' }}>Loi: {streamError}</span>
            ) : (
              <div style={{ textAlign: 'center' }}>
                <div style={{ marginBottom: '12px', color: '#64748b' }}>
                  Chua ket noi camera
                </div>
                <button
                  onClick={handleConfirm}
                  disabled={confirmLoading}
                  style={{
                    background: '#22d3ee',
                    color: '#0f172a',
                    border: 'none',
                    borderRadius: '8px',
                    padding: '10px 24px',
                    fontSize: '0.9rem',
                    fontWeight: '600',
                    cursor: confirmLoading ? 'not-allowed' : 'pointer',
                    opacity: confirmLoading ? 0.6 : 1,
                  }}
                >
                  {confirmLoading ? 'Dang ket noi...' : '▶ Xac nhan & Mo camera'}
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Edit / Config form */}
      {editing && (
        <div className="camera-form">
          <div className="camera-form-grid">
            {field('ten', 'Ten hien thi', 'VD: Camera truoc cua so', true)}
            {field('ip_address', 'IP / Hostname', 'VD: 192.168.1.100')}
            {field('port', 'RTSP Port', '554')}
            {field('rtsp_path', 'RTSP Path', 'VD: /live/ch00_0')}
            {field('username', 'Username', 'VD: admin')}
            {field('password', camera.has_password ? 'Mat khau moi (neu doi)' : 'Mat khau', '******')}
            {field('stream_url', 'Full Stream URL (thay the IP)', 'VD: rtsp://...', true)}
          </div>
          <div className="camera-form-actions">
            <button className="btn-cancel" onClick={() => setEditing(false)}>Huy</button>
            <button className="btn-confirm" onClick={handleUpdate} disabled={loading}>
              {loading ? 'Dang luu...' : 'Luu'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* RoomDetail main component                                            */
/* ------------------------------------------------------------------ */
export default function RoomDetail({ roomId, token, onBack }) {
  const [room, setRoom] = useState(null);
  const [devices, setDevices] = useState([]);
  const [cameras, setCameras] = useState([]);
  const [occupancy, setOccupancy] = useState(null);
  // Số người tức thời từ CameraCard (AI đang chạy), đồng bộ với banner nhanh hơn poll DB
  const [liveOccupancy, setLiveOccupancy] = useState(null);

  const handleCameraPeopleCount = useCallback((count) => {
    setLiveOccupancy(count);
  }, []);

  // Banner: ưu tiên liveOccupancy (từ AI session đang chạy), fallback occupancy từ API
  const bannerCount = liveOccupancy !== null ? liveOccupancy : (occupancy?.so_nguoi ?? '—');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showAdd, setShowAdd] = useState(false);
  const [addForm, setAddForm] = useState({
    ten: '',
    ip_address: '',
    port: 554,
    rtsp_path: '',
    username: '',
    password: '',
    stream_url: '',
  });

  const loadData = useCallback(async () => {
    try {
      const [roomRes, devRes, camRes, occRes] = await Promise.all([
        axios.get(`${API_BASE}/rooms/${roomId}`, hdr(token)),
        fetchRoomDeviceData(roomId, token).catch(() => ({ data: { devices: [] } })),
        fetchRoomCameras(roomId, token).catch(() => ({ data: { cameras: [] } })),
        fetchRoomOccupancy(roomId, token).catch(() => ({ data: { so_nguoi: 0 } })),
      ]);
      setRoom(roomRes.data);
      setDevices(devRes.data.devices || []);
      setCameras(camRes.data.cameras || []);
      setOccupancy(occRes.data);
    } catch (e) {
      setError(e.response?.data?.detail || e.message);
    } finally {
      setLoading(false);
    }
  }, [roomId, token]);

  useEffect(() => { loadData(); }, [loadData]);

  /* poll occupancy every 3s */
  useEffect(() => {
    const id = setInterval(async () => {
      const r = await fetchRoomOccupancy(roomId, token).catch(() => ({ data: { so_nguoi: 0 } }));
      setOccupancy(r.data);
    }, 3000);
    return () => clearInterval(id);
  }, [roomId, token]);

  const handleDeleteCamera = async (cameraId) => {
    if (!window.confirm('Xoa camera nay?')) return;
    try {
      await deleteRoomCamera(roomId, cameraId, token);
      setCameras(cs => cs.filter(c => c.id !== cameraId));
    } catch (e) {
      alert('Loi xoa: ' + (e.response?.data?.detail || e.message));
    }
  };

  const handleAddCamera = async () => {
    try {
      await createRoomCamera(roomId, {
        ...addForm,
        port: Number(addForm.port) || 554,
        thu_tu: cameras.length,
      }, token);
      setShowAdd(false);
      setAddForm({ ten: '', ip_address: '', port: 554, rtsp_path: '', username: '', password: '', stream_url: '' });
      loadData();
    } catch (e) {
      alert('Loi tao camera: ' + (e.response?.data?.detail || e.message));
    }
  };

  if (loading) return <div className="room-detail-page"><p style={{ color: '#94a3b8' }}>Dang tai...</p></div>;
  if (error) return <div className="room-detail-page"><p style={{ color: '#fca5a5' }}>{error}</p><button onClick={onBack}>Quay lai</button></div>;

  return (
    <div className="room-detail-page">
      {/* Header */}
      <div className="room-detail-header">
        <button
          onClick={() => { window.location.hash = '#/rooms'; }}
          style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: '0.85rem', marginBottom: 8, padding: 0 }}
        >
          ← Quay lai Quan ly phong
        </button>
        <h2>{room?.ten_phong || `Phong #${roomId}`}</h2>
        {room?.vi_tri && <div className="room-meta">{room.vi_tri}</div>}
        {room?.mo_ta && <div className="room-meta">{room.mo_ta}</div>}
      </div>

      {/* Occupancy banner */}
      <div className="room-occupancy-banner">
        <div className="room-occupancy-count">{bannerCount}</div>
        <div className="room-occupancy-label">
          <div>nguoi trong phong</div>
          {occupancy?.cap_nhat_luc && (
            <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
              Cap nhat: {new Date(occupancy.cap_nhat_luc).toLocaleTimeString()}
            </div>
          )}
        </div>
      </div>

      {/* Devices */}
      <div className="room-detail-devices">
        <h3>Thiet bi ({devices.length})</h3>
        {devices.length === 0 ? (
          <p className="no-device">Chua co thiet bi nao</p>
        ) : (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {devices.map(d => (
              <div key={d.id} className="device-chip">
                {statusDot(d.trang_thai)}
                {d.ten_thiet_bi || d.ma_thiet_bi}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Cameras */}
      <div className="room-detail-section">
        <h3>Camera ({cameras.length})</h3>
        <div className="camera-grid">
          {cameras.map(cam => (
            <CameraCard
              key={cam.id}
              camera={cam}
              roomId={roomId}
              token={token}
              onDelete={handleDeleteCamera}
              onUpdate={loadData}
              onPeopleCount={handleCameraPeopleCount}
            />
          ))}

          {/* Add camera card */}
          {!showAdd ? (
            <button className="btn-add-camera" onClick={() => setShowAdd(true)}>
              + Them Camera
            </button>
          ) : (
            <div className="camera-card">
              <div className="camera-card-header">
                <div className="cam-title">Them Camera Moi</div>
                <button className="btn-icon" onClick={() => setShowAdd(false)}>✕</button>
              </div>
              <div className="camera-form">
                <div className="camera-form-grid">
                  <div className="full">
                    <label>Ten hien thi</label>
                    <input placeholder="VD: Camera truoc cua so"
                      value={addForm.ten} onChange={e => setAddForm(f => ({ ...f, ten: e.target.value }))} />
                  </div>
                  <div>
                    <label>IP / Hostname</label>
                    <input placeholder="VD: 192.168.1.100"
                      value={addForm.ip_address} onChange={e => setAddForm(f => ({ ...f, ip_address: e.target.value }))} />
                  </div>
                  <div>
                    <label>RTSP Port</label>
                    <input placeholder="554"
                      value={addForm.port} onChange={e => setAddForm(f => ({ ...f, port: e.target.value }))} />
                  </div>
                  <div>
                    <label>RTSP Path</label>
                    <input placeholder="VD: /live/ch00_0"
                      value={addForm.rtsp_path} onChange={e => setAddForm(f => ({ ...f, rtsp_path: e.target.value }))} />
                  </div>
                  <div>
                    <label>Username</label>
                    <input placeholder="VD: admin"
                      value={addForm.username} onChange={e => setAddForm(f => ({ ...f, username: e.target.value }))} />
                  </div>
                  <div>
                    <label>Mat khau</label>
                    <input type="password" placeholder="******"
                      value={addForm.password} onChange={e => setAddForm(f => ({ ...f, password: e.target.value }))} />
                  </div>
                  <div className="full">
                    <label>Full Stream URL (thay the IP/port/path)</label>
                    <input placeholder="VD: rtsp://user:pass@192.168.1.100:554/stream"
                      value={addForm.stream_url} onChange={e => setAddForm(f => ({ ...f, stream_url: e.target.value }))} />
                  </div>
                </div>
                <div className="camera-form-actions">
                  <button className="btn-cancel" onClick={() => setShowAdd(false)}>Huy</button>
                  <button className="btn-confirm" onClick={handleAddCamera}>Luu</button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
