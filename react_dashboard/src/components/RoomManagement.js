import React, { useEffect, useState, useCallback, useRef } from 'react';
import { fetchRooms, fetchDevices, updateDeviceRoom, createRoom, updateRoom, deleteRoom } from '../services';
import { API_BASE } from '../config/api';
import { useCrudVersion, useRealtimePolling } from '../context/RealtimeProvider';
import { copyToClipboard } from '../utils/clipboard';

export default function RoomManagement({ token, onBack, workspaceContext = 'ca_nhan', userInfo = null }) {
  const [rooms, setRooms] = useState([]);
  const [devices, setDevices] = useState([]);
  const [selectedRoom, setSelectedRoom] = useState(null);
  const [formVisible, setFormVisible] = useState(false);
  const [roomForm, setRoomForm] = useState({
    ten_phong: '',
    ma_phong: '',
    vi_tri: '',
    mo_ta: '',
    nguoi_quan_ly_id: ''
  });

  const isGroupContext = workspaceContext === 'nhom';
  const effectiveWorkspaceId = isGroupContext ? (userInfo?.primary_nhom_id || null) : null;

  // Realtime: tu refresh khi co CRUD event "room" (tao/sua/xoa o tab khac)
  const roomsVersion = useCrudVersion('room');

  // Đánh dấu khi đang có optimistic update để tránh ghi đè state
  const pendingRef = useRef(false);

  const loadRooms = useCallback(async () => {
    try {
      const res = await fetchRooms(token, effectiveWorkspaceId);
      setRooms(res.data.rooms || []);
    } catch (e) {
      console.error('Load rooms failed', e);
    }
  }, [token, effectiveWorkspaceId]);

  const loadDevices = useCallback(async () => {
    try {
      const res = await fetchDevices(token, { params: effectiveWorkspaceId ? { workspace_id: effectiveWorkspaceId } : {} });
      setDevices(res.data.devices || []);
    } catch (e) {
      console.error('Load devices failed', e);
    }
  }, [token, effectiveWorkspaceId]);

  useEffect(() => {
    loadRooms();
    loadDevices();
  }, [loadRooms, loadDevices]);

  // Auto-refetch khi co CRUD event cho entity "room" tu tab khac
  // Hoac WS disconnected: polling moi 30s de bu events bi miss
  const refetchBoth = useCallback(() => {
    if (pendingRef.current) return;
    loadRooms();
    loadDevices();
  }, [loadRooms, loadDevices]);
  useRealtimePolling(roomsVersion, refetchBoth, [refetchBoth]);

  const resetForm = () => {
    setRoomForm({ ten_phong: '', ma_phong: '', vi_tri: '', mo_ta: '', nguoi_quan_ly_id: '' });
    setSelectedRoom(null);
  };

  const handleOpenAdd = () => {
    resetForm();
    setFormVisible(true);
  };

  const handleEditRoom = (room) => {
    setSelectedRoom(room);
    setRoomForm({
      ten_phong: room.ten_phong || '',
      ma_phong: room.ma_phong || '',
      vi_tri: room.vi_tri || '',
      mo_ta: room.mo_ta || '',
      nguoi_quan_ly_id: room.nguoi_quan_ly_id || '',
    });
    setFormVisible(true);
  };

  const handleSaveRoom = async (e) => {
    e.preventDefault();
    const payload = {
      ten_phong: roomForm.ten_phong,
      ma_phong: roomForm.ma_phong || null,
      vi_tri: roomForm.vi_tri || null,
      mo_ta: roomForm.mo_ta || null,
      nguoi_quan_ly_id: roomForm.nguoi_quan_ly_id ? Number(roomForm.nguoi_quan_ly_id) : null,
    };
    try {
      if (selectedRoom) {
        await updateRoom(selectedRoom.id, payload, token);
      } else {
        await createRoom(payload, token, effectiveWorkspaceId);
      }
      resetForm();
      setFormVisible(false);
      await loadRooms();
    } catch (e) {
      console.error('Save room failed', e);
      alert('Lưu phòng thất bại');
    }
  };

  const handleDeleteRoom = async (roomId) => {
    if (!window.confirm('Xóa phòng này? Lưu ý: Các thiết bị trong phòng sẽ bị bỏ gán.')) return;
    try {
      await deleteRoom(roomId, token);
      await loadRooms();
    } catch (e) {
      console.error('Delete room failed', e);
      alert('Xóa phòng thất bại');
    }
  };

  const handleAssign = async (deviceId, roomId) => {
    // 1. Optimistic update: thay đổi state NGAY để UI phản hồi tức thì
    const previousDevices = devices;
    setDevices(prev => prev.map(d =>
      String(d.ma_thiet_bi) === String(deviceId) ? { ...d, phong_id: roomId } : d
    ));
    // Đánh dấu đang có thao tác để skip refresh ngầm
    pendingRef.current = true;
    try {
      await updateDeviceRoom(deviceId, roomId, token);
      // 2. Refresh ngầm để đồng bộ với server (không block UI).
      //    Ghi đè state nếu server trả về khác; giữ nguyên nếu khớp.
      const [devList, roomList] = await Promise.all([
        fetchDevices(token, { params: effectiveWorkspaceId ? { workspace_id: effectiveWorkspaceId } : {} }).then(r => r.data.devices || []).catch(() => null),
        fetchRooms(token, effectiveWorkspaceId).then(r => r.data.rooms || []).catch(() => null),
      ]);
      pendingRef.current = false;
      if (devList) setDevices(devList);
      if (roomList) setRooms(roomList);
    } catch (e) {
      pendingRef.current = false;
      // Rollback về state cũ nếu server từ chối
      setDevices(previousDevices);
      console.error('Assign device failed', e);
      const msg = e.response?.data?.detail || e.message || 'Unknown error';
      alert('Gán thiết bị thất bại: ' + msg);
    }
  };

  const handleCopyApiUrl = async (roomId) => {
    // Build API URL with token
    const baseUrl = API_BASE.startsWith('http') ? API_BASE : `${window.location.origin}${API_BASE}`;
    const urlWithToken = `${baseUrl}/rooms/${roomId}/data?token=${token}`;

    const ok = await copyToClipboard(urlWithToken);
    if (ok) {
      alert('Đã copy API URL (có kèm token)!\n\nBạn có thể paste trực tiếp vào browser.');
    } else {
      alert('Copy thất bại. Vui lòng copy thủ công:\n\n' + urlWithToken);
    }
  };

  const handleDownloadApiDocs = async (room) => {
    try {
      // Lấy dữ liệu realtime của phòng
      const baseUrl = API_BASE.startsWith('http') ? API_BASE : `${window.location.origin}${API_BASE}`;
      const response = await fetch(`${baseUrl}/rooms/${room.id}/data`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      if (!response.ok) {
        throw new Error('Không thể lấy dữ liệu phòng');
      }
      
      const roomData = await response.json();
      const roomDevices = roomData.devices || [];
      
      // Tạo nội dung markdown
      let markdown = `# API Documentation - ${room.ten_phong}\n\n`;
      markdown += `**Mã phòng:** ${room.ma_phong || 'N/A'}  \n`;
      markdown += `**Vị trí:** ${room.vi_tri || 'N/A'}  \n`;
      markdown += `**Mô tả:** ${room.mo_ta || 'N/A'}  \n`;
      markdown += `**Số thiết bị:** ${roomDevices.length}  \n`;
      markdown += `**Ngày tạo:** ${new Date().toLocaleString('vi-VN')}  \n\n`;
      
      markdown += `---\n\n`;
      markdown += `## 🔐 Authentication\n\n`;
      markdown += `Tất cả API đều yêu cầu Bearer Token trong header:\n\n`;
      markdown += `\`\`\`\nAuthorization: Bearer <your_token>\n\`\`\`\n\n`;
      markdown += `**Lấy token:** \`POST ${baseUrl}/login\`\n\n`;
      
      markdown += `---\n\n`;
      markdown += `## 📊 Lấy dữ liệu phòng\n\n`;
      markdown += `### Endpoint\n\`\`\`\nGET ${baseUrl}/rooms/${room.id}/data\n\`\`\`\n\n`;
      markdown += `### Response hiện tại\n\`\`\`json\n${JSON.stringify(roomData, null, 2)}\n\`\`\`\n\n`;
      
      markdown += `---\n\n`;
      markdown += `## 🎛️ Điều khiển thiết bị\n\n`;
      
      if (roomDevices.length === 0) {
        markdown += `*Phòng chưa có thiết bị nào.*\n\n`;
      } else {
        roomDevices.forEach((device, index) => {
          markdown += `### ${index + 1}. ${device.ten_thiet_bi || device.device_id}\n\n`;
          markdown += `**Device ID:** \`${device.device_id}\`  \n`;
          markdown += `**Loại:** ${device.loai_thiet_bi || 'N/A'}  \n`;
          markdown += `**Trạng thái:** ${device.trang_thai === 'online' ? '🟢 Online' : '🔴 Offline'}  \n`;
          
          if (device.last_seen) {
            const lastSeen = typeof device.last_seen === 'number' 
              ? new Date(device.last_seen * 1000).toLocaleString('vi-VN')
              : device.last_seen;
            markdown += `**Lần cuối online:** ${lastSeen}  \n`;
          }
          
          markdown += `\n#### API điều khiển Relay\n\n`;
          markdown += `**Endpoint:**\n\`\`\`\nPOST ${baseUrl}/devices/${device.device_id}/control-relay\n\`\`\`\n\n`;
          
          markdown += `**Request Body:**\n\`\`\`json\n{\n  "relay": 1,\n  "state": "ON"\n}\n\`\`\`\n\n`;
          
          markdown += `**Tham số:**\n`;
          markdown += `- \`relay\`: Số relay (1-16)\n`;
          markdown += `- \`state\`: "ON" hoặc "OFF"\n\n`;
          
          // Hiển thị trạng thái relay - ƯU TIÊN relay config từ control_lines
          const relayConfig = device.relays || []; // Danh sách relay từ control_lines
          const relayStates = {};
          
          // Lấy trạng thái realtime từ device.data (nếu có)
          if (device.data && Object.keys(device.data).length > 0) {
            Object.entries(device.data).forEach(([key, info]) => {
              const match = key.match(/^relay_(\d+)_state$/);
              if (match) {
                const relayNum = parseInt(match[1]);
                relayStates[relayNum] = {
                  state: info.value || 'N/A',
                  timestamp: info.timestamp
                };
              }
            });
          }
          
          // Nếu có relay config từ control_lines, hiển thị bảng
          if (relayConfig.length > 0) {
            markdown += `**Trạng thái Relay hiện tại:**\n\n`;
            markdown += `| Relay | Tên | Trạng thái | Timestamp |\n`;
            markdown += `|-------|-----|------------|----------|\n`;
            
            // Sắp xếp theo số relay
            relayConfig.sort((a, b) => a.relay_number - b.relay_number).forEach(relay => {
              const relayNum = relay.relay_number;
              const relayName = relay.ten_relay || `Relay ${relayNum}`;
              const stateInfo = relayStates[relayNum];
              
              if (stateInfo) {
                // Có dữ liệu realtime
                const state = stateInfo.state;
                const timestamp = stateInfo.timestamp
                  ? (typeof stateInfo.timestamp === 'number' 
                      ? new Date(stateInfo.timestamp * 1000).toLocaleString('vi-VN')
                      : stateInfo.timestamp)
                  : 'N/A';
                const stateIcon = state === 'ON' ? '🟢' : (state === 'OFF' ? '⚫' : '❓');
                markdown += `| Relay ${relayNum} | ${relayName} | ${stateIcon} ${state} | ${timestamp} |\n`;
              } else {
                // Không có dữ liệu realtime
                markdown += `| Relay ${relayNum} | ${relayName} | ❓ N/A | Chưa có dữ liệu |\n`;
              }
            });
            markdown += `\n`;
          } else if (Object.keys(relayStates).length > 0) {
            // Fallback: Nếu không có relay config nhưng có relay states từ telemetry
            markdown += `**Trạng thái Relay hiện tại:**\n\n`;
            markdown += `| Relay | Trạng thái | Timestamp |\n`;
            markdown += `|-------|------------|----------|\n`;
            
            Object.keys(relayStates).sort((a, b) => parseInt(a) - parseInt(b)).forEach(relayNum => {
              const info = relayStates[relayNum];
              const state = info.state;
              const timestamp = info.timestamp
                ? (typeof info.timestamp === 'number' 
                    ? new Date(info.timestamp * 1000).toLocaleString('vi-VN')
                    : info.timestamp)
                : 'N/A';
              const stateIcon = state === 'ON' ? '🟢' : (state === 'OFF' ? '⚫' : '❓');
              markdown += `| Relay ${relayNum} | ${stateIcon} ${state} | ${timestamp} |\n`;
            });
            markdown += `\n`;
          }
          
          markdown += `**Ví dụ cURL - Bật Relay 1:**\n\`\`\`bash\n`;
          markdown += `curl -X POST "${baseUrl}/devices/${device.device_id}/control-relay" \\\n`;
          markdown += `  -H "Content-Type: application/json" \\\n`;
          markdown += `  -H "Authorization: Bearer YOUR_TOKEN" \\\n`;
          markdown += `  -d '{"relay": 1, "state": "ON"}'\n\`\`\`\n\n`;
          
          markdown += `**Ví dụ cURL - Tắt Relay 1:**\n\`\`\`bash\n`;
          markdown += `curl -X POST "${baseUrl}/devices/${device.device_id}/control-relay" \\\n`;
          markdown += `  -H "Content-Type: application/json" \\\n`;
          markdown += `  -H "Authorization: Bearer YOUR_TOKEN" \\\n`;
          markdown += `  -d '{"relay": 1, "state": "OFF"}'\n\`\`\`\n\n`;
          
          markdown += `**Ví dụ JavaScript/Fetch:**\n\`\`\`javascript\n`;
          markdown += `const response = await fetch('${baseUrl}/devices/${device.device_id}/control-relay', {\n`;
          markdown += `  method: 'POST',\n`;
          markdown += `  headers: {\n`;
          markdown += `    'Content-Type': 'application/json',\n`;
          markdown += `    'Authorization': 'Bearer YOUR_TOKEN'\n`;
          markdown += `  },\n`;
          markdown += `  body: JSON.stringify({ relay: 1, state: 'ON' })\n`;
          markdown += `});\n`;
          markdown += `const result = await response.json();\n`;
          markdown += `console.log(result);\n\`\`\`\n\n`;
          
          markdown += `---\n\n`;
        });
      }
      
      markdown += `## 📱 Flutter/Dart Example\n\n`;
      markdown += `\`\`\`dart\n`;
      markdown += `import 'package:http/http.dart' as http;\n`;
      markdown += `import 'dart:convert';\n\n`;
      markdown += `class IoTService {\n`;
      markdown += `  final String baseUrl = '${baseUrl}';\n`;
      markdown += `  String? token;\n\n`;
      markdown += `  Future<bool> controlRelay(String deviceId, int relay, String state) async {\n`;
      markdown += `    final response = await http.post(\n`;
      markdown += `      Uri.parse('\$baseUrl/devices/\$deviceId/control-relay'),\n`;
      markdown += `      headers: {\n`;
      markdown += `        'Content-Type': 'application/json',\n`;
      markdown += `        'Authorization': 'Bearer \$token',\n`;
      markdown += `      },\n`;
      markdown += `      body: jsonEncode({'relay': relay, 'state': state}),\n`;
      markdown += `    );\n`;
      markdown += `    return response.statusCode == 200;\n`;
      markdown += `  }\n`;
      markdown += `}\n\`\`\`\n\n`;
      
      markdown += `## 🔗 Tài liệu tham khảo\n\n`;
      markdown += `- **API Documentation:** ${baseUrl}/docs\n`;
      markdown += `- **Redoc:** ${baseUrl}/redoc\n`;
      markdown += `- **Base URL:** ${baseUrl}\n`;
      
      // Tạo file và download
      const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `API_${room.ma_phong || room.ten_phong}_${Date.now()}.md`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      
      alert('Đã tải xuống tài liệu API!');
    } catch (error) {
      console.error('Download API docs failed:', error);
      alert('Lỗi khi tải tài liệu: ' + error.message);
    }
  };

  // Helper to filter devices
  const unassignedDevices = devices.filter((d) => d.phong_id === null || d.phong_id === undefined);
  const devicesByRoom = (roomId) => devices.filter((d) => String(d.phong_id) === String(roomId));

  return (
    <div className="room-management">
      <div className="room-management-header">
        <div className="room-management-header-left">
          <div className="room-management-title">
            <div className="icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
                <polyline points="9 22 9 12 15 12 15 22"/>
              </svg>
            </div>
            <h1>Quản lý phòng</h1>
          </div>
          <div className="room-management-stats">
            <span><span className="count">{rooms.length}</span> phong</span>
            <span><span className="count">{devices.filter(d => d.phong_id !== null && d.phong_id !== undefined).length}</span> thiet bi</span>
          </div>
        </div>
        <div className="room-management-actions">
          <button className="back-btn" onClick={onBack}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>
            Quay lại
          </button>
          <button className="primary-btn" onClick={handleOpenAdd}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            Thêm phòng
          </button>
        </div>
      </div>

      <div className="room-management-content">
        <div className="room-grid">
          {rooms.map((room) => {
            const roomDevices = devicesByRoom(room.id);
            return (
              <div key={room.id} className="room-card">
                <div className="room-card-header">
                  <div className="room-card-header-top">
                    <div className="room-info">
                      <h3
                        className="room-card-title"
                        title="Nhập vào để xem chi tiết phòng"
                        onClick={() => window.location.hash = `#/rooms/${room.id}`}
                      >
                        {room.ten_phong}
                      </h3>
                      <div className="room-meta">
                        {room.ma_phong && <span className="room-meta-item"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/></svg>{room.ma_phong}</span>}
                        {room.vi_tri && <span className="room-meta-item"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>{room.vi_tri}</span>}
                      </div>
                    </div>
                    <div className="room-actions-btn">
                      <button className="btn-icon" onClick={() => handleDownloadApiDocs(room)} title="Tai API Docs">
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                      </button>
                      <button className="btn-icon" onClick={() => handleCopyApiUrl(room.id)} title="Copy API Data">
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                      </button>
                      <button className="btn-icon" onClick={() => handleEditRoom(room)} title="Sửa">
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                      </button>
                      <button className="btn-icon danger" onClick={() => handleDeleteRoom(room.id)} title="Xóa">
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                      </button>
                    </div>
                  </div>
                </div>

                <div className="room-card-body">
                  <div className="room-devices-section">
                    <div className="section-title">
                      Thiết bị
                      <span className="badge">{roomDevices.length}</span>
                    </div>
                    <div className="device-chips-container">
                      {roomDevices.length === 0 && <span className="no-devices">Chua co thiet bi</span>}
                      {roomDevices.map((d) => (
                        <div key={d.ma_thiet_bi} className="device-chip">
                          <span className={`status-dot ${d.trang_thai === 'online' ? 'online' : 'offline'}`}></span>
                          <span className="device-name" title={d.ten_thiet_bi || d.ma_thiet_bi}>{d.ten_thiet_bi || d.ma_thiet_bi}</span>
                          <button className="remove-device-btn" onClick={() => handleAssign(d.ma_thiet_bi, null)} title="Bo gan">×</button>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="room-assign-section">
                    <div className="room-assign-action">
                      <select
                        onChange={(e) => {
                          if (e.target.value) {
                            handleAssign(e.target.value, room.id);
                            e.target.value = "";
                          }
                        }}
                        defaultValue=""
                      >
                        <option value="" disabled>Gan thiet bi...</option>
                        {unassignedDevices.map((d) => (
                          <option key={d.ma_thiet_bi} value={d.ma_thiet_bi}>
                            {d.ten_thiet_bi || d.ma_thiet_bi}
                          </option>
                        ))}
                        {unassignedDevices.length === 0 && <option disabled>Het thiet bi trong</option>}
                      </select>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
          {rooms.length === 0 && (
            <div className="no-data-placeholder">
              <div className="icon" style={{ fontSize: '3rem' }}>🏠</div>
              <p>
                {isGroupContext
                  ? 'Ban chua tham gia nhom nao, hoac lop cua ban chua co phong nhom.'
                  : 'Chua co phong nao. Hay tao phong moi!'}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Modal Form */}
      {formVisible && (
        <div className="room-modal-backdrop">
          <div className="room-modal-content">
            <div className="room-modal-header">
              <h3>{selectedRoom ? 'Cập nhật phòng' : 'Thêm phòng mới'}</h3>
              <button className="room-modal-close" onClick={() => setFormVisible(false)}>×</button>
            </div>
            <form className="rule-form" onSubmit={handleSaveRoom}>
              <div className="form-row">
                <label>
                  Tên phòng *
                  <input
                    value={roomForm.ten_phong}
                    onChange={(e) => setRoomForm({ ...roomForm, ten_phong: e.target.value })}
                    placeholder="Ví dụ: Phòng Khách"
                    required
                  />
                </label>
                <label>
                  Mã phòng
                  <input
                    value={roomForm.ma_phong}
                    onChange={(e) => setRoomForm({ ...roomForm, ma_phong: e.target.value })}
                    placeholder="P101"
                  />
                </label>
              </div>

              <label>
                Vi tri
                <input
                  value={roomForm.vi_tri}
                  onChange={(e) => setRoomForm({ ...roomForm, vi_tri: e.target.value })}
                  placeholder="Tầng 1, Khu A..."
                />
              </label>

              <label>
                Mô tả
                <textarea
                  value={roomForm.mo_ta}
                  onChange={(e) => setRoomForm({ ...roomForm, mo_ta: e.target.value })}
                  placeholder="Mô tả thêm về phòng..."
                  rows={3}
                />
              </label>

              <div className="form-actions">
                <button type="button" onClick={() => setFormVisible(false)}>Hủy</button>
                <button type="submit">{selectedRoom ? 'Cập nhật' : 'Tạo mới'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}



