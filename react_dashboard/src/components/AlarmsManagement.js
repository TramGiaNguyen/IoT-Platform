import React, { useEffect, useState, useCallback } from 'react';
import { fetchAlerts, fetchDevices, acknowledgeAlert, resolveAlert } from '../services';

const PAGE_SIZE = 15;

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

function formatDataContext(raw) {
  if (raw == null || raw === '') return null;
  if (typeof raw === 'object') {
    try {
      return JSON.stringify(raw, null, 2);
    } catch {
      return String(raw);
    }
  }
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return JSON.stringify(parsed, null, 2);
    } catch {
      return raw;
    }
  }
  return String(raw);
}

export default function AlarmsManagement({ token, onBack }) {
  const [alerts, setAlerts] = useState([]);
  const [devices, setDevices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState('');
  const [filterDevice, setFilterDevice] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalAlerts, setTotalAlerts] = useState(0);
  const [newCount, setNewCount] = useState(0);
  const [resolveModal, setResolveModal] = useState(null);
  const [resolveNote, setResolveNote] = useState('');
  const [detailModal, setDetailModal] = useState(null);

  const loadAlerts = useCallback(async () => {
    try {
      const params = {
        limit: PAGE_SIZE,
        offset: (currentPage - 1) * PAGE_SIZE,
      };
      if (filterStatus) params.trang_thai = filterStatus;
      if (filterDevice) params.device_id = filterDevice;
      const res = await fetchAlerts(token, params);
      setAlerts(res.data.alerts || []);
      setTotalAlerts(
        typeof res.data.total === 'number' ? res.data.total : (res.data.alerts || []).length
      );
      if (typeof res.data.new_count === 'number') {
        setNewCount(res.data.new_count);
      } else {
        setNewCount((res.data.alerts || []).filter((a) => a.trang_thai === 'new').length);
      }
    } catch (e) {
      console.error('Load alerts failed', e);
      setAlerts([]);
      setTotalAlerts(0);
      setNewCount(0);
    } finally {
      setLoading(false);
    }
  }, [token, filterStatus, filterDevice, currentPage]);

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

  useEffect(() => {
    setCurrentPage(1);
  }, [filterStatus, filterDevice]);

  useEffect(() => {
    const tp = Math.max(1, Math.ceil(totalAlerts / PAGE_SIZE));
    if (currentPage > tp) setCurrentPage(tp);
  }, [totalAlerts, currentPage]);

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

  const totalPages = Math.max(1, Math.ceil(totalAlerts / PAGE_SIZE));
  const showNewBadge =
    newCount > 0 && (filterStatus === '' || filterStatus === 'new');

  const handleRowClick = (e, alert) => {
    if (e.target.closest('button')) return;
    setDetailModal(alert);
  };

  const goPrev = () => setCurrentPage((p) => Math.max(1, p - 1));
  const goNext = () => setCurrentPage((p) => Math.min(totalPages, p + 1));

  return (
    <div className="rules-container">
      <div className="rules-header">
        <div>
          <h2>Quản lý cảnh báo</h2>
          <p className="muted">
            Danh sách cảnh báo từ rule, thiết bị offline và ngưỡng.{' '}
            {showNewBadge && <span className="badge-new">{newCount} mới</span>}
          </p>
          <p className="muted alerts-hint">Bấm vào một dòng để xem đầy đủ tin nhắn và dữ liệu kèm theo.</p>
        </div>
        <div className="rules-actions">
          <button type="button" className="secondary-btn" onClick={onBack}>
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
        <>
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
                    role="button"
                    tabIndex={0}
                    onClick={(e) => handleRowClick(e, a)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        if (!e.target.closest('button')) setDetailModal(a);
                      }
                    }}
                    className={`alert-row alert-row-clickable status-${a.trang_thai} muc-${a.muc_do}`}
                    title="Xem chi tiết"
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
                    <td className="alert-actions-cell" onClick={(e) => e.stopPropagation()}>
                      {a.trang_thai === 'new' && (
                        <button
                          type="button"
                          className="btn-sm primary-btn"
                          onClick={() => handleAcknowledge(a.id)}
                        >
                          Xác nhận
                        </button>
                      )}
                      {(a.trang_thai === 'new' || a.trang_thai === 'acknowledged') && (
                        <button
                          type="button"
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

          {totalAlerts > 0 && (
            <div className="alerts-pagination">
              <span className="alerts-pagination-info">
                Hiển thị {(currentPage - 1) * PAGE_SIZE + 1}–
                {Math.min(currentPage * PAGE_SIZE, totalAlerts)} / {totalAlerts} cảnh báo
              </span>
              <div className="alerts-pagination-buttons">
                <button
                  type="button"
                  className="secondary-btn"
                  disabled={currentPage <= 1}
                  onClick={goPrev}
                >
                  Trước
                </button>
                <span className="alerts-pagination-page">
                  Trang {currentPage} / {totalPages}
                </span>
                <button
                  type="button"
                  className="secondary-btn"
                  disabled={currentPage >= totalPages}
                  onClick={goNext}
                >
                  Sau
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {detailModal && (
        <div
          className="modal-backdrop"
          onClick={(e) => {
            if (e.target === e.currentTarget) setDetailModal(null);
          }}
        >
          <div className="modal-content alerts-detail-modal">
            <div className="modal-header">
              <h3>Chi tiết cảnh báo #{detailModal.id}</h3>
              <button type="button" onClick={() => setDetailModal(null)} aria-label="Đóng">
                ×
              </button>
            </div>
            <div className="modal-body alerts-detail-body">
              <dl className="alerts-detail-dl">
                <dt>Thời gian</dt>
                <dd>{detailModal.thoi_gian_tao || '—'}</dd>
                <dt>Loại</dt>
                <dd>{LOAI_LABELS[detailModal.loai] || detailModal.loai}</dd>
                <dt>Thiết bị</dt>
                <dd>{detailModal.ten_thiet_bi || detailModal.device_id || '—'}</dd>
                <dt>Mã thiết bị</dt>
                <dd>{detailModal.device_id || '—'}</dd>
                {detailModal.rule_id != null && (
                  <>
                    <dt>Rule ID</dt>
                    <dd>{detailModal.rule_id}</dd>
                  </>
                )}
                <dt>Mức độ</dt>
                <dd>{MUC_DO_LABELS[detailModal.muc_do] || detailModal.muc_do}</dd>
                <dt>Trạng thái</dt>
                <dd>{TRANG_THAI_LABELS[detailModal.trang_thai] || detailModal.trang_thai}</dd>
                {detailModal.thoi_gian_giai_quyet && (
                  <>
                    <dt>Thời gian xử lý</dt>
                    <dd>{detailModal.thoi_gian_giai_quyet}</dd>
                  </>
                )}
                <dt>Tin nhắn</dt>
                <dd className="alerts-detail-message">{detailModal.tin_nhan || '—'}</dd>
                {formatDataContext(detailModal.data_context) && (
                  <>
                    <dt>Dữ liệu kèm (data_context)</dt>
                    <dd>
                      <pre className="alerts-detail-pre">
                        {formatDataContext(detailModal.data_context)}
                      </pre>
                    </dd>
                  </>
                )}
              </dl>
            </div>
            <div className="form-actions">
              <button type="button" className="primary-btn" onClick={() => setDetailModal(null)}>
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}

      {resolveModal && (
        <div className="modal-backdrop">
          <div className="modal-content" style={{ maxWidth: 500 }}>
            <div className="modal-header">
              <h3>Xử lý cảnh báo</h3>
              <button
                type="button"
                onClick={() => {
                  setResolveModal(null);
                  setResolveNote('');
                }}
              >
                ×
              </button>
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
              <button type="button" className="primary-btn" onClick={handleResolve}>
                Xác nhận xử lý
              </button>
              <button
                type="button"
                onClick={() => {
                  setResolveModal(null);
                  setResolveNote('');
                }}
              >
                Hủy
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
