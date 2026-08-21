import React, { useEffect, useState, useCallback } from 'react';
import { fetchAlerts, fetchDevices, fetchRooms, fetchClasses, acknowledgeAlert, resolveAlert } from '../services';
import { useCrudVersion, useRealtimePolling } from '../context/RealtimeProvider';

const PAGE_SIZE = 15;

const LOAI_LABELS = {
  device_offline: 'Thiết bị offline',
  threshold_exceeded: 'Vượt ngưỡng',
  rule_triggered: 'Rule kích hoạt',
  system_error: 'Lỗi hệ thống',
  emergency: 'Khẩn cấp',
  ai_anomaly: 'Bất thường AI',
  ai_health: 'Sức khỏe cảm biến',
  ai_forecast: 'Dự đoán AI',
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

export default function AlarmsManagement({ token, onBack, workspaceContext = 'ca_nhan', userInfo = null }) {
  const [alerts, setAlerts] = useState([]);
  const [devices, setDevices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState('');
  const [filterDevice, setFilterDevice] = useState('');
  const [filterRoom, setFilterRoom] = useState('');
  const [filterClass, setFilterClass] = useState('');
  const [filterNguon, setFilterNguon] = useState('');
  const [rooms, setRooms] = useState([]);
  const [classes, setClasses] = useState([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalAlerts, setTotalAlerts] = useState(0);
  const [newCount, setNewCount] = useState(0);
  const [resolveModal, setResolveModal] = useState(null);
  const [resolveNote, setResolveNote] = useState('');
  const [detailModal, setDetailModal] = useState(null);

  const effectiveWorkspaceId = workspaceContext === 'nhom' ? (userInfo?.primary_nhom_id || null) : null;

  // Realtime: tu refresh khi co alert CRUD (acknowledge/resolve) tu tab khac
  const alertsVersion = useCrudVersion('alert');

  const loadAlerts = useCallback(async () => {
    try {
      const params = {
        limit: PAGE_SIZE,
        offset: (currentPage - 1) * PAGE_SIZE,
      };
      if (filterStatus) params.trang_thai = filterStatus;
      if (filterDevice) params.device_id = filterDevice;
      if (effectiveWorkspaceId) params.workspace_id = effectiveWorkspaceId;
      const res = await fetchAlerts(token, params);
      let rows = res.data.alerts || [];
      // Client-side filter theo phong/lop_hoc (server da scope theo role)
      if (filterRoom) {
        rows = rows.filter((a) => String(a.phong_id) === String(filterRoom));
      }
      if (filterClass) {
        rows = rows.filter((a) => String(a.lop_hoc_id) === String(filterClass));
      }
      setAlerts(rows);
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
  }, [token, filterStatus, filterDevice, filterRoom, filterClass, currentPage, effectiveWorkspaceId]);

  const loadDevices = useCallback(async () => {
    try {
      const res = await fetchDevices(token, { params: effectiveWorkspaceId ? { workspace_id: effectiveWorkspaceId } : {} });
      setDevices(res.data.devices || []);
    } catch (e) {
      console.error('Load devices failed', e);
    }
  }, [token, effectiveWorkspaceId]);

  const loadRooms = useCallback(async () => {
    try {
      const res = await fetchRooms(token, effectiveWorkspaceId);
      setRooms(res.data.rooms || res.data || []);
    } catch (e) {
      console.error('Load rooms failed', e);
    }
  }, [token, effectiveWorkspaceId]);

  const loadClasses = useCallback(async () => {
    try {
      const res = await fetchClasses(token);
      setClasses(res.data.classes || res.data || []);
    } catch (e) {
      console.error('Load classes failed', e);
    }
  }, [token]);

  useEffect(() => {
    loadAlerts();
  }, [loadAlerts]);

  // Realtime: refetch khi alert CRUD event den, hoac WS disconnected polling 30s
  useRealtimePolling(alertsVersion, loadAlerts, [loadAlerts]);

  useEffect(() => {
    loadDevices();
  }, [loadDevices]);

  useEffect(() => {
    loadRooms();
    loadClasses();
  }, [loadRooms, loadClasses]);

  useEffect(() => {
    setCurrentPage(1);
  }, [filterStatus, filterDevice, filterRoom, filterClass]);

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
    <div className="ai-page-container">
      <div className="ai-page-header">
        <div className="ai-page-header-left">
          <button type="button" className="back-btn" onClick={onBack}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>
            Quay lại
          </button>
          <div className="ai-page-header-title">
            <div className="ai-page-header-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                <line x1="12" y1="9" x2="12" y2="13"/>
                <line x1="12" y1="17" x2="12.01" y2="17"/>
              </svg>
            </div>
            <div>
              <h1>Quản lý Cảnh báo</h1>
              <p className="ai-page-subtitle-text">Theo doi va xu ly canh bao he thong</p>
            </div>
          </div>
        </div>
        <div className="rules-actions">
          {showNewBadge && (
            <span className="role-badge" style={{ background: 'rgba(239, 68, 68, 0.15)', color: '#ef4444', border: '1px solid rgba(239, 68, 68, 0.3)' }}>
              {newCount} canh bao moi
            </span>
          )}
        </div>
      </div>

      <div className="ai-page-content">

      <div className="ai-stats-grid">
        <div className="ai-stat-card alerts">
          <span className="ai-stat-label">Tổng cảnh báo</span>
          <span className="ai-stat-value">{totalAlerts}</span>
        </div>
        <div className="ai-stat-card">
          <span className="ai-stat-label">Moi</span>
          <span className="ai-stat-value">{newCount}</span>
        </div>
        <div className="ai-stat-card online">
          <span className="ai-stat-label">Đã xác nhận</span>
          <span className="ai-stat-value">{alerts.filter(a => a.trang_thai === 'acknowledged').length}</span>
        </div>
        <div className="ai-stat-card">
          <span className="ai-stat-label">Đã xử lý</span>
          <span className="ai-stat-value">{alerts.filter(a => a.trang_thai === 'resolved').length}</span>
        </div>
      </div>

      <div className="ai-filter-bar">
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="filter-select"
        >
          <option value="">Tất cả trạng thái</option>
          <option value="new">Moi</option>
          <option value="acknowledged">Đã xác nhận</option>
          <option value="resolved">Đã xử lý</option>
        </select>
        <select
          value={filterRoom}
          onChange={(e) => setFilterRoom(e.target.value)}
          className="filter-select"
        >
          <option value="">Tất cả phòng</option>
          {rooms.map((r) => (
            <option key={r.id} value={r.id}>
              {r.ten_phong || `Phòng #${r.id}`}
            </option>
          ))}
        </select>
        <select
          value={filterClass}
          onChange={(e) => setFilterClass(e.target.value)}
          className="filter-select"
        >
          <option value="">Tất cả lớp</option>
          {classes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.ten_lop || `Lớp #${c.id}`}
            </option>
          ))}
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
        <select
          value={filterNguon}
          onChange={(e) => setFilterNguon(e.target.value)}
          className="filter-select"
        >
          <option value="">Tất cả nguồn</option>
          <option value="ai">AI Analytics</option>
          <option value="device">Thiết bị</option>
          <option value="rule">Rule</option>
          <option value="system">Hệ thống</option>
        </select>
      </div>

      {loading ? (
        <div className="ai-empty-state" style={{ padding: '40px' }}>
          <p>Đang tải cảnh báo...</p>
        </div>
      ) : alerts.length === 0 ? (
        <div className="ai-empty-state" style={{ padding: '60px' }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
            <line x1="12" y1="9" x2="12" y2="13"/>
            <line x1="12" y1="17" x2="12.01" y2="17"/>
          </svg>
          <p>Chưa có cảnh báo nào. Hệ thống đang hoạt động ổn định.</p>
        </div>
      ) : (
        <>
          <div className="users-table-container">
            <table className="users-table">
              <thead>
                <tr>
                  <th>Thời gian</th>
                  <th>Loai</th>
                  <th>Thiết bị</th>
                  <th>Muc do</th>
                  <th>Trạng thái</th>
                  <th>Tin nhan</th>
                  <th>Thao tac</th>
                </tr>
              </thead>
              <tbody>
                {alerts.map((a) => (
                  <tr
                    key={a.id}
                    onClick={(e) => handleRowClick(e, a)}
                    style={{ cursor: 'pointer' }}
                    className={`status-${a.trang_thai} muc-${a.muc_do}`}
                    title="Xem chi tiet"
                  >
                    <td>{a.thoi_gian_tao || '-'}</td>
                    <td>
                      <span className="role-badge student">
                        {LOAI_LABELS[a.loai] || a.loai}
                      </span>
                      {(a.nguon === 'ai' || a.loai?.startsWith('ai_')) && (
                        <span style={{ marginLeft: '6px', fontSize: '0.7rem', color: 'var(--rules-text-accent)' }}>
                          AI
                        </span>
                      )}
                    </td>
                    <td>{a.ten_thiet_bi || a.device_id || '-'}</td>
                    <td>
                      <span className={`role-badge ${a.muc_do === 'critical' ? 'admin' : a.muc_do === 'high' ? 'teacher' : 'student'}`}>
                        {MUC_DO_LABELS[a.muc_do] || a.muc_do}
                      </span>
                    </td>
                    <td>
                      <span className={`role-badge ${a.trang_thai === 'new' ? 'admin' : a.trang_thai === 'acknowledged' ? 'teacher' : 'student'}`}>
                        {TRANG_THAI_LABELS[a.trang_thai] || a.trang_thai}
                      </span>
                    </td>
                    <td style={{ color: 'var(--rules-text-muted)', maxWidth: '300px', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {a.tin_nhan}
                    </td>
                    <td onClick={(e) => e.stopPropagation()}>
                      <div className="user-actions">
                        {a.trang_thai === 'new' && (
                          <button
                            type="button"
                            className="btn-edit"
                            onClick={() => handleAcknowledge(a.id)}
                          >
                            Xác nhận
                          </button>
                        )}
                        {(a.trang_thai === 'new' || a.trang_thai === 'acknowledged') && (
                          <button
                            type="button"
                            className="btn-edit"
                            onClick={() => setResolveModal(a)}
                          >
                            Xu ly xong
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {totalAlerts > 0 && (
            <div className="pagination-container">
              <span className="pagination-info">
                Hiển thị {(currentPage - 1) * PAGE_SIZE + 1}-
                {Math.min(currentPage * PAGE_SIZE, totalAlerts)} / {totalAlerts} canh bao
              </span>
              <div className="pagination-controls">
                <button className="secondary-btn" disabled={currentPage <= 1} onClick={goPrev}>
                  Truoc
                </button>
                <span style={{ padding: '6px 12px', color: 'var(--rules-text-secondary)' }}>
                  Trang {currentPage} / {totalPages}
                </span>
                <button className="secondary-btn" disabled={currentPage >= totalPages} onClick={goNext}>
                  Sau
                </button>
              </div>
            </div>
          )}
        </>
      )}
      </div>

      {detailModal && (
        <div
          className="rules-modal-backdrop"
          onClick={(e) => {
            if (e.target === e.currentTarget) setDetailModal(null);
          }}
        >
          <div className="rules-modal" style={{ maxWidth: 640 }}>
            <div className="rules-modal-header">
              <h3>Chi tiet canh bao #{detailModal.id}</h3>
              <button className="rules-modal-close" type="button" onClick={() => setDetailModal(null)}>×</button>
            </div>
            <div className="rules-form">
              <div className="alerts-detail-body">
                <dl className="alerts-detail-dl">
                  <dt>Thời gian</dt>
                  <dd>{detailModal.thoi_gian_tao || '—'}</dd>
                  <dt>Loai</dt>
                  <dd>{LOAI_LABELS[detailModal.loai] || detailModal.loai}</dd>
                  <dt>Thiết bị</dt>
                  <dd>{detailModal.ten_thiet_bi || detailModal.device_id || '—'}</dd>
                  <dt>Mã thiết bị</dt>
                  <dd>{detailModal.device_id || '—'}</dd>
                  {detailModal.ten_phong && (
                    <>
                      <dt>Phong</dt>
                      <dd>{detailModal.ten_phong}</dd>
                    </>
                  )}
                  {detailModal.ten_lop && (
                    <>
                      <dt>Lop</dt>
                      <dd>{detailModal.ten_lop}</dd>
                    </>
                  )}
                  {detailModal.rule_id != null && (
                    <>
                      <dt>Rule ID</dt>
                      <dd>{detailModal.rule_id}</dd>
                    </>
                  )}
                  <dt>Muc do</dt>
                  <dd>{MUC_DO_LABELS[detailModal.muc_do] || detailModal.muc_do}</dd>
                  <dt>Trạng thái</dt>
                  <dd>{TRANG_THAI_LABELS[detailModal.trang_thai] || detailModal.trang_thai}</dd>
                  {detailModal.thoi_gian_giai_quyet && (
                    <>
                      <dt>Thời gian xử lý</dt>
                      <dd>{detailModal.thoi_gian_giai_quyet}</dd>
                    </>
                  )}
                  <dt>Tin nhan</dt>
                  <dd className="alerts-detail-message">{detailModal.tin_nhan || '—'}</dd>
                  {formatDataContext(detailModal.data_context) && (
                    <>
                      <dt>Du lieu kem (data_context)</dt>
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
        </div>
      )}

      {resolveModal && (
        <div className="rules-modal-backdrop">
          <div className="rules-modal" style={{ maxWidth: 500 }}>
            <div className="rules-modal-header">
              <h3>Xu ly canh bao</h3>
              <button
                className="rules-modal-close"
                type="button"
                onClick={() => {
                  setResolveModal(null);
                  setResolveNote('');
                }}
              >
                ×
              </button>
            </div>
            <div className="rules-form">
              <p style={{ color: 'var(--rules-text)', padding: '8px 0' }}>{resolveModal.tin_nhan}</p>
              <label>
                Ghi chú (tùy chọn)
                <textarea
                  value={resolveNote}
                  onChange={(e) => setResolveNote(e.target.value)}
                  placeholder="Ghi chú khi xử lý..."
                  rows={3}
                  style={{ resize: 'vertical' }}
                />
              </label>
              <div className="form-actions">
                <button type="button" onClick={() => {
                  setResolveModal(null);
                  setResolveNote('');
                }}>Hủy</button>
                <button type="button" className="primary-btn" onClick={handleResolve}>Xác nhận xử lý</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
