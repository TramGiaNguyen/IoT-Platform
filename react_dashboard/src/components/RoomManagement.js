import React, { useEffect, useState, useCallback } from 'react';
import { fetchRooms, fetchDevices, updateDeviceRoom, createRoom, updateRoom, deleteRoom } from '../services';

export default function RoomManagement({ token, onBack }) {
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

  const loadRooms = useCallback(async () => {
    try {
      const res = await fetchRooms(token);
      setRooms(res.data.rooms || []);
    } catch (e) {
      console.error('Load rooms failed', e);
    }
  }, [token]);

  const loadDevices = useCallback(async () => {
    try {
      const res = await fetchDevices(token);
      setDevices(res.data.devices || []);
    } catch (e) {
      console.error('Load devices failed', e);
    }
  }, [token]);

  useEffect(() => {
    loadRooms();
    loadDevices();
  }, [loadRooms, loadDevices]);

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
        await createRoom(payload, token);
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
    try {
      await updateDeviceRoom(deviceId, roomId, token);
      await loadDevices();
    } catch (e) {
      console.error('Assign device failed', e);
      alert('Gán thiết bị thất bại');
    }
  };

  // Helper to filter devices
  const unassignedDevices = devices.filter((d) => d.phong_id === null || d.phong_id === undefined);
  const devicesByRoom = (roomId) => devices.filter((d) => String(d.phong_id) === String(roomId));

  return (
    <div className="rules-container">
      <div className="rules-header">
        <div>
          <h2>Quản lý phòng</h2>
          <p className="muted">Tổ chức và gán thiết bị vào các phòng</p>
        </div>
        <div className="rules-actions">
          <button className="primary-btn" onClick={handleOpenAdd}>Thêm phòng</button>
          <button className="secondary-btn" onClick={onBack}>Quay lại</button>
        </div>
      </div>

      <div className="room-grid">
        {rooms.map((room) => (
          <div key={room.id} className="room-card">
            <div className="room-card-header">
              <div className="room-info">
                <h3>{room.ten_phong}</h3>
                <div className="room-meta">
                  {room.ma_phong && <span>Mã: {room.ma_phong}</span>}
                  {room.vi_tri && <span> • {room.vi_tri}</span>}
                </div>
              </div>
              <div className="room-actions-btn">
                <button className="btn-icon" onClick={() => handleEditRoom(room)} title="Sửa">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
                </button>
                <button className="btn-icon danger" onClick={() => handleDeleteRoom(room.id)} title="Xóa">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
                </button>
              </div>
            </div>

            <div className="room-devices-section">
              <div className="section-title">Thiết bị ({devicesByRoom(room.id).length})</div>
              <div className="device-chips-container">
                {devicesByRoom(room.id).length === 0 && <span className="no-devices">Trống</span>}
                {devicesByRoom(room.id).map((d) => (
                  <div key={d.ma_thiet_bi} className="device-chip">
                    <span className={`status-dot ${d.trang_thai === 'online' ? 'online' : 'offline'}`}></span>
                    <span className="device-name">{d.ten_thiet_bi || d.ma_thiet_bi}</span>
                    <button className="remove-device-btn" onClick={() => handleAssign(d.ma_thiet_bi, null)} title="Bỏ gán">×</button>
                  </div>
                ))}
              </div>
            </div>

            <div className="room-assign-action">
              <select
                onChange={(e) => {
                  if (e.target.value) {
                    handleAssign(e.target.value, room.id);
                    e.target.value = ""; // Reset select
                  }
                }}
                defaultValue=""
              >
                <option value="" disabled>Gán thiết bị...</option>
                {unassignedDevices.map((d) => (
                  <option key={d.ma_thiet_bi} value={d.ma_thiet_bi}>
                    {d.ten_thiet_bi || d.ma_thiet_bi}
                  </option>
                ))}
                {unassignedDevices.length === 0 && <option disabled>Hết thiết bị trống</option>}
              </select>
            </div>
          </div>
        ))}
        {rooms.length === 0 && (
          <div className="no-data-placeholder">
            <p>Chưa có phòng nào. Hãy tạo phòng mới!</p>
          </div>
        )}
      </div>

      {/* Modal Form */}
      {formVisible && (
        <div className="modal-backdrop">
          <div className="modal-content" style={{ maxWidth: 500 }}>
            <div className="modal-header">
              <h3>{selectedRoom ? 'Cập nhật phòng' : 'Thêm phòng mới'}</h3>
              <button onClick={() => setFormVisible(false)}>×</button>
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
                Vị trí
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
                <button type="submit">{selectedRoom ? 'Cập nhật' : 'Tạo mới'}</button>
                <button type="button" onClick={() => setFormVisible(false)}>Hủy</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}



