import React, { useEffect, useState, useCallback } from 'react';
import { fetchAlerts, fetchDevices, acknowledgeAlert, resolveAlert } from '../services';

const LOAI_LABELS = {
  device_offline: 'Thiết bị offline',
  threshold_exceeded: 'Vượt ngưỡng',
  rule_triggered: 'Rule kích hoạt',
  system_error: 'Lỗi hệ thống',
  emergency: 'Khẩn cấp',
};

const MUC_DO_LABELS = {
  low: 'Thấp',
  medium: 'Trung bình',
  high: 'Cao',
  critical: 'Nghiêm trọng',
};

const TRANG_THAI_LABELS = {
  new: 'Mới',
  acknowledged: 'Đã xác nhận',
  resolved: 'Đã xử lý',
};

export default function AlarmsManagement({ token, onBack }) {
  const [alerts, setAlerts] = useState([]);
  const [devices, setDevices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState('');
  const [filterDevice, setFilterDevice] = useState('');
  const [resolveModal, setResolveModal] = useState(null);
  const [resolveNote, setResolveNote] = useState('');

  const loadAlerts = useCallback(async () => {
    try {
      const params = {};
      if (filterStatus) params.trang_thai = filterStatus;
      if (filterDevice) params.device_id = filterDevice;
      const res = await fetchAlerts(token, params);
      setAlerts(res.data.alerts || []);
    } catch (e) {
      console.error('Load alerts failed', e);
      setAlerts([]);
    } finally {
      setLoading(false);
    }
  }, [token, filterStatus, filterDevice]);

  const loadDevices = useCallback(async () => {
    try {
      const res = await fetchDevices(token);
      setDevices(res.data.devices || []);
    } catch (e) {
      console.error('Load devices failed', e);
    }
  }, [token]);

  useEffect(() => {
    loadAlerts();
    const interval = setInterval(loadAlerts, 30000);
    return () => clearInterval(interval);
  }, [loadAlerts]);

  useEffect(() => {
    loadDevices();
  }, [loadDevices]);

  const handleAcknowledge = async (alertId) => {
    try {
      await acknowledgeAlert(alertId, token);
      await loadAlerts();
    } catch (e) {
      console.error('Acknowledge failed', e);
      alert('Xác nhận thất bại: ' + (e.response?.data?.detail || e.message));
    }
  };

  const handleResolve = async () => {
    if (!resolveModal) return;
    try {
      await resolveAlert(resolveModal.id, resolveNote, token);
      setResolveModal(null);
      setResolveNote('');
      await loadAlerts();
    } catch (e) {
      console.error('Resolve failed', e);
      alert('Xử lý thất bại: ' + (e.response?.data?.detail || e.message));
    }
  };

  const newCount = alerts.filter((a) => a.trang_thai === 'new').length;

  return (
    <div className="rules-container">
      <div className="rules-header">
        <div>
          <h2>Quản lý cảnh báo</h2>
          <p className="muted">
            Danh sách cảnh báo từ rule, thiết bị offline và ngưỡng. {newCount > 0 && (
              <span className="badge-new">{newCount} mới</span>
            )}
          </p>
        </div>
        <div className="rules-actions">
          <button className="secondary-btn" onClick={onBack}>
            Quay lại
          </button>
        </div>
      </div>

      <div className="alerts-filters">
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="filter-select"
        >
          <option value="">Tất cả trạng thái</option>
          <option value="new">Mới</option>
          <option value="acknowledged">Đã xác nhận</option>
          <option value="resolved">Đã xử lý</option>
        </select>
        <select
          value={filterDevice}
          onChange={(e) => setFilterDevice(e.target.value)}
          className="filter-select"
        >
          <option value="">Tất cả thiết bị</option>
          {devices.map((d) => (
            <option key={d.ma_thiet_bi} value={d.ma_thiet_bi}>
              {d.ten_thiet_bi || d.ma_thiet_bi}
            </option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="loading-placeholder">
          <p>Đang tải...</p>
        </div>
      ) : (
        <div className="alerts-table-wrapper">
          <table className="table alerts-table">
            <thead>
              <tr>
                <th>Thời gian</th>
                <th>Loại</th>
                <th>Thiết bị</th>
                <th>Mức độ</th>
                <th>Trạng thái</th>
                <th>Tin nhắn</th>
                <th>Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {alerts.length === 0 && (
                <tr>
                  <td colSpan="7" className="no-data-cell">
                    Chưa có cảnh báo nào
                  </td>
                </tr>
              )}
              {alerts.map((a) => (
                <tr
                  key={a.id}
                  className={`alert-row status-${a.trang_thai} muc-${a.muc_do}`}
                >
                  <td>{a.thoi_gian_tao || '-'}</td>
                  <td>
                    <span className="loai-badge">{LOAI_LABELS[a.loai] || a.loai}</span>
                  </td>
                  <td>{a.ten_thiet_bi || a.device_id || '-'}</td>
                  <td>
                    <span className={`muc-do-badge muc-${a.muc_do}`}>
                      {MUC_DO_LABELS[a.muc_do] || a.muc_do}
                    </span>
                  </td>
                  <td>
                    <span className={`trang-thai-badge status-${a.trang_thai}`}>
                      {TRANG_THAI_LABELS[a.trang_thai] || a.trang_thai}
                    </span>
                  </td>
                  <td className="tin-nhan-cell">{a.tin_nhan}</td>
                  <td>
                    {a.trang_thai === 'new' && (
                      <button
                        className="btn-sm primary-btn"
                        onClick={() => handleAcknowledge(a.id)}
                      >
                        Xác nhận
                      </button>
                    )}
                    {(a.trang_thai === 'new' || a.trang_thai === 'acknowledged') && (
                      <button
                        className="btn-sm secondary-btn"
                        onClick={() => setResolveModal(a)}
                      >
                        Xử lý xong
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {resolveModal && (
        <div className="modal-backdrop">
          <div className="modal-content" style={{ maxWidth: 500 }}>
            <div className="modal-header">
              <h3>Xử lý cảnh báo</h3>
              <button onClick={() => { setResolveModal(null); setResolveNote(''); }}>×</button>
            </div>
            <div className="modal-body">
              <p className="alert-preview">{resolveModal.tin_nhan}</p>
              <label>
                Ghi chú (tùy chọn)
                <textarea
                  value={resolveNote}
                  onChange={(e) => setResolveNote(e.target.value)}
                  placeholder="Ghi chú khi xử lý..."
                  rows={3}
                  style={{ width: '100%', marginTop: 8 }}
                />
              </label>
            </div>
            <div className="form-actions">
              <button className="primary-btn" onClick={handleResolve}>
                Xác nhận xử lý
              </button>
              <button onClick={() => { setResolveModal(null); setResolveNote(''); }}>
                Hủy
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
