import React, { useEffect, useState } from 'react';
import {
  fetchDeviceProfiles,
  createDeviceProfile,
  updateDeviceProfile,
  deleteDeviceProfile,
  fetchDevices,
} from '../services';

export default function DeviceProfilesManagement({ token, onBack }) {
  const [profiles, setProfiles] = useState([]);
  const [devices, setDevices] = useState([]);
  const [loading, setLoading] = useState(false);
  const [formVisible, setFormVisible] = useState(false);
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState({
    ten_profile: '',
    device_id: '',
    device_type: '',
    config: '{"field_mapping":{},"unit_convert":{},"timestamp_format":"unix"}',
  });

  const loadProfiles = async () => {
    setLoading(true);
    try {
      const res = await fetchDeviceProfiles(token);
      setProfiles(res.data.profiles || []);
    } catch (e) {
      console.error('Load profiles failed', e);
      setProfiles([]);
    } finally {
      setLoading(false);
    }
  };

  const loadDevices = async () => {
    try {
      const res = await fetchDevices(token);
      setDevices(res.data.devices || []);
    } catch (e) {
      console.error('Load devices failed', e);
    }
  };

  useEffect(() => {
    loadProfiles();
    loadDevices();
  }, []);

  const parseConfig = (str) => {
    try {
      return JSON.parse(str || '{}');
    } catch {
      return {};
    }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    const config = parseConfig(form.config);
    const body = {
      ten_profile: form.ten_profile || null,
      device_id: form.device_id || null,
      device_type: form.device_type || null,
      config,
    };
    try {
      if (editId) {
        await updateDeviceProfile(editId, body, token);
      } else {
        await createDeviceProfile(body, token);
      }
      setFormVisible(false);
      setEditId(null);
      setForm({ ten_profile: '', device_id: '', device_type: '', config: '{"field_mapping":{},"unit_convert":{},"timestamp_format":"unix"}' });
      await loadProfiles();
    } catch (err) {
      console.error('Save profile failed', err);
      alert('Lưu thất bại');
    }
  };

  const handleEdit = (p) => {
    const cfg = typeof p.config === 'string' ? p.config : JSON.stringify(p.config || {}, null, 2);
    setForm({
      ten_profile: p.ten_profile || '',
      device_id: p.device_id || '',
      device_type: p.device_type || '',
      config: cfg,
    });
    setEditId(p.id);
    setFormVisible(true);
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Xóa profile này?')) return;
    try {
      await deleteDeviceProfile(id, token);
      await loadProfiles();
    } catch (e) {
      console.error('Delete failed', e);
      alert('Xóa thất bại');
    }
  };

  return (
    <div className="rules-page">
      <div className="rules-header">
        <div>
          <h2>Device Profiles</h2>
          <p>Field mapping, unit conversion, timestamp format cho từng thiết bị/loại</p>
        </div>
        <div className="rules-actions">
          <button onClick={() => { setEditId(null); setForm({ ten_profile: '', device_id: '', device_type: '', config: '{"field_mapping":{},"unit_convert":{},"timestamp_format":"unix"}' }); setFormVisible(true); }}>+ Tạo profile</button>
          <button onClick={onBack}>← Về dashboard</button>
        </div>
      </div>

      {loading ? (
        <p>Đang tải...</p>
      ) : (
        <div className="rules-list">
          {profiles.length === 0 && <p>Chưa có profile. Tạo profile để map field, convert unit.</p>}
          {profiles.map((p) => (
            <div key={p.id} className="rule-card">
              <div className="rule-head">
                <div>
                  <h4>{p.ten_profile || `Profile #${p.id}`}</h4>
                  <p className="muted">
                    Device: {p.device_id || '(tất cả)'} · Type: {p.device_type || '(tất cả)'}
                  </p>
                  <pre className="config-preview">{JSON.stringify(p.config)}</pre>
                </div>
                <div className="rule-head-actions">
                  <button onClick={() => handleEdit(p)}>Sửa</button>
                  <button className="danger" onClick={() => handleDelete(p.id)}>Xóa</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {formVisible && (
        <div className="modal-backdrop">
          <div className="modal">
            <div className="modal-header">
              <h3>{editId ? 'Sửa Profile' : 'Tạo Profile'}</h3>
              <button onClick={() => setFormVisible(false)}>✕</button>
            </div>
            <form onSubmit={handleSave} className="rule-form">
              <label>
                Tên profile
                <input value={form.ten_profile} onChange={(e) => setForm({ ...form, ten_profile: e.target.value })} placeholder="VD: Garden sensor" />
              </label>
              <label>
                Device ID (để trống = áp dụng theo type)
                <select value={form.device_id} onChange={(e) => setForm({ ...form, device_id: e.target.value })}>
                  <option value="">-- Không chọn --</option>
                  {devices.map((d) => (
                    <option key={d.ma_thiet_bi} value={d.ma_thiet_bi}>{d.ten_thiet_bi || d.ma_thiet_bi}</option>
                  ))}
                </select>
              </label>
              <label>
                Device type (để trống = áp dụng theo device_id)
                <input value={form.device_type} onChange={(e) => setForm({ ...form, device_type: e.target.value })} placeholder="VD: temperature_sensor" />
              </label>
              <label>
                Config (JSON)
                <textarea value={form.config} onChange={(e) => setForm({ ...form, config: e.target.value })} rows={10} placeholder='{"field_mapping":{"temp":"temperature"},"unit_convert":{},"timestamp_format":"unix"}' />
                <small className="muted">field_mapping: map key tới key chuẩn. unit_convert: {'{"temperature": {"factor": 0.1}}'}. timestamp_format: unix | unix_ms | iso8601</small>
              </label>
              <div className="form-actions">
                <button type="submit">Lưu</button>
                <button type="button" onClick={() => setFormVisible(false)}>Hủy</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
