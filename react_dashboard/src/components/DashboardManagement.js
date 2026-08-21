import React, { useEffect, useState, useCallback } from 'react';
import { fetchDashboards, createDashboard, updateDashboard, deleteDashboard, fetchRooms, fetchClasses } from '../services';
import DashboardBuilder from './DashboardBuilder/DashboardBuilder';
import { useCrudVersion, useRealtimePolling } from '../context/RealtimeProvider';
import '../styles/style.css';

const CONTEXT_LABELS = {
  ca_nhan: 'Cá nhân',
  nhom: 'Nhóm',
  lop_hoc: 'Lớp',
  none: 'Chung',
};

export default function DashboardManagement({ token, onBack, onDashboardsChange, userInfo = null, workspaceContext = 'ca_nhan' }) {
  const [dashboards, setDashboards] = useState([]);
  const [loading, setLoading] = useState(true);
  // Realtime: tu refetch khi co CRUD dashboard/widget tu tab khac
  const dashboardsVersion = useCrudVersion('dashboard');
  const widgetsVersion = useCrudVersion('widget');
  const [error, setError] = useState('');
  const [formVisible, setFormVisible] = useState(false);
  const [editingDashboard, setEditingDashboard] = useState(null);
  const [buildingDashboardId, setBuildingDashboardId] = useState(null);
  const [formData, setFormData] = useState({
    ten_dashboard: '',
    mo_ta: '',
    mau_sac: '#22d3ee',
    phong_id: '',
    lop_hoc_id: '',
  });
  const [contextFilter, setContextFilter] = useState('all'); // 'all' | 'mine' | 'group' | 'class'
  const [rooms, setRooms] = useState([]);
  const [classes, setClasses] = useState([]);

  const effectiveWorkspaceId = workspaceContext === 'nhom' ? (userInfo?.primary_nhom_id || null) : null;

  const loadDashboards = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetchDashboards(token, effectiveWorkspaceId);
      setDashboards(res.data.dashboards || []);
    } catch (err) {
      console.error('Failed to load dashboards:', err);
      setError('Không thể tải danh sách dashboard');
    } finally {
      setLoading(false);
    }
  }, [token, effectiveWorkspaceId]);

  const loadRoomsAndClasses = useCallback(async () => {
    try {
      const [r, c] = await Promise.all([
        fetchRooms(token, effectiveWorkspaceId).catch(() => ({ data: { rooms: [] } })),
        fetchClasses(token).catch(() => ({ data: { classes: [] } })),
      ]);
      setRooms(r.data.rooms || r.data || []);
      setClasses(c.data.classes || c.data || []);
    } catch (e) {
      console.error('Load rooms/classes failed:', e);
    }
  }, [token]);

  useEffect(() => {
    loadDashboards();
  }, [loadDashboards]);

  // Realtime: refetch khi dashboard hoặc widget CRUD event den, hoac WS disconnected polling 30s
  useRealtimePolling(dashboardsVersion, loadDashboards, [loadDashboards]);
  useRealtimePolling(widgetsVersion, loadDashboards, [loadDashboards]);

  useEffect(() => {
    loadRoomsAndClasses();
  }, [loadRoomsAndClasses]);

  // Client-side filter theo context
  const filteredDashboards = dashboards.filter((d) => {
    if (contextFilter === 'all') return true;
    if (contextFilter === 'mine') return d.phong_id && !d.lop_hoc_id && !d.nhom_id;
    if (contextFilter === 'group') return d.nhom_id != null;
    if (contextFilter === 'class') return d.lop_hoc_id != null;
    return true;
  });

  const resetForm = () => {
    setFormData({
      ten_dashboard: '',
      mo_ta: '',
      mau_sac: '#22d3ee',
      phong_id: '',
      lop_hoc_id: '',
    });
    setEditingDashboard(null);
  };

  const handleOpenAdd = () => {
    resetForm();
    setFormVisible(true);
  };

  const handleEdit = (dashboard) => {
    setEditingDashboard(dashboard);
    setFormData({
      ten_dashboard: dashboard.ten_dashboard || '',
      mo_ta: dashboard.mo_ta || '',
      mau_sac: dashboard.mau_sac || '#22d3ee',
      phong_id: dashboard.phong_id || '',
      lop_hoc_id: dashboard.lop_hoc_id || '',
    });
    setFormVisible(true);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!formData.ten_dashboard.trim()) {
      alert('Vui lòng nhập tên dashboard');
      return;
    }

    try {
      const payload = {
        ten_dashboard: formData.ten_dashboard,
        mo_ta: formData.mo_ta,
        mau_sac: formData.mau_sac,
        phong_id: formData.phong_id ? Number(formData.phong_id) : null,
        lop_hoc_id: formData.lop_hoc_id ? Number(formData.lop_hoc_id) : null,
      };
      if (editingDashboard) {
        await updateDashboard(editingDashboard.id, payload, token);
      } else {
        const wsId = workspaceContext === 'nhom' ? (userInfo?.primary_nhom_id || null) : null;
        await createDashboard(payload, token, wsId);
      }
      resetForm();
      setFormVisible(false);
      await loadDashboards();
      if (onDashboardsChange) onDashboardsChange();
    } catch (err) {
      console.error('Save dashboard failed:', err);
      alert(err.response?.data?.detail || 'Lưu dashboard thất bại');
    }
  };

  const handleDelete = async (dashboardId) => {
    if (!window.confirm('Bạn có chắc muốn xóa dashboard này? Tất cả widgets sẽ bị xóa.')) {
      return;
    }

    try {
      await deleteDashboard(dashboardId, token);
      await loadDashboards();
      if (onDashboardsChange) onDashboardsChange();
    } catch (err) {
      console.error('Delete dashboard failed:', err);
      alert(err.response?.data?.detail || 'Xóa dashboard thất bại');
    }
  };

  const handleView = (dashboardId) => {
    // Navigate to dashboard viewer (will be implemented in Phase 4)
    window.location.hash = `#/dashboards/${dashboardId}`;
  };

  const handleBuild = (dashboardId) => {
    console.log('[DashboardManagement] handleBuild called with dashboardId:', dashboardId);
    setBuildingDashboardId(dashboardId);
  };



  // Show builder if building a dashboard
  if (buildingDashboardId) {
    return (
      <DashboardBuilder
        dashboardId={buildingDashboardId}
        token={token}
        onBack={() => {
          setBuildingDashboardId(null);
          loadDashboards();
        }}
        onSave={() => {
          setBuildingDashboardId(null);
          loadDashboards();
        }}
      />
    );
  }

  if (loading) {
    return (
      <div className="ai-page-container">
        <div className="ai-empty-state" style={{ padding: '40px' }}>
          <p>Đang tải dashboard...</p>
        </div>
      </div>
    );
  }

  const totalDashboards = dashboards.length;
  const totalMine = dashboards.filter(d => d.phong_id && !d.lop_hoc_id && !d.nhom_id).length;
  const totalGroup = dashboards.filter(d => d.nhom_id != null).length;
  const totalClass = dashboards.filter(d => d.lop_hoc_id).length;

  return (
    <div className="ai-page-container">
      <div className="ai-page-header">
        <div className="ai-page-header-left">
          <button type="button" className="back-btn" onClick={onBack}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>
            Quay lại
          </button>
          <div className="ai-page-header-title">
            <div
              className="ai-page-header-icon"
              style={{
                background: 'linear-gradient(135deg, rgba(6, 182, 212, 0.15), rgba(6, 182, 212, 0.05))',
                color: '#0891b2',
                border: '1px solid rgba(6, 182, 212, 0.2)',
              }}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="3" width="7" height="9"/>
                <rect x="14" y="3" width="7" height="5"/>
                <rect x="14" y="12" width="7" height="9"/>
                <rect x="3" y="16" width="7" height="5"/>
              </svg>
            </div>
            <div>
              <h1>Quản lý Dashboard</h1>
              <p className="ai-page-subtitle-text">Tạo, chỉnh sửa và chia sẻ dashboard với lớp/nhóm</p>
            </div>
          </div>
        </div>
        <div className="rules-actions">
          <button onClick={handleOpenAdd} className="primary-btn" style={{ padding: '10px 18px' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            Tạo Dashboard
          </button>
        </div>
      </div>

      <div className="ai-page-content">

      {error && (
        <div className="import-result error" style={{ marginBottom: '16px' }}>
          <p>{error}</p>
        </div>
      )}

      <div className="ai-stats-grid">
        <div className="ai-stat-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <span className="ai-stat-label">Tổng dashboard</span>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: 'var(--rules-text-accent)' }}>
              <rect x="3" y="3" width="7" height="9"/>
              <rect x="14" y="3" width="7" height="5"/>
              <rect x="14" y="12" width="7" height="9"/>
              <rect x="3" y="16" width="7" height="5"/>
            </svg>
          </div>
          <span className="ai-stat-value">{totalDashboards}</span>
        </div>
        <div className="ai-stat-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <span className="ai-stat-label">Cá nhân</span>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: '#22c55e' }}>
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
              <circle cx="12" cy="7" r="4"/>
            </svg>
          </div>
          <span className="ai-stat-value" style={{ color: '#22c55e' }}>{totalMine}</span>
        </div>
        <div className="ai-stat-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <span className="ai-stat-label">Nhóm</span>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: '#8b5cf6' }}>
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
              <circle cx="9" cy="7" r="4"/>
              <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
              <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
            </svg>
          </div>
          <span className="ai-stat-value" style={{ color: '#8b5cf6' }}>{totalGroup}</span>
        </div>
        <div className="ai-stat-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <span className="ai-stat-label">Lớp học</span>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: '#f59e0b' }}>
              <path d="M22 10v6M2 10l10-5 10 5-10 5z"/>
              <path d="M6 12v5c3 3 9 3 12 0v-5"/>
            </svg>
          </div>
          <span className="ai-stat-value" style={{ color: '#f59e0b' }}>{totalClass}</span>
        </div>
      </div>

      <div className="ai-filter-bar" style={{ background: 'transparent', padding: 0, marginBottom: '20px' }}>
        {[
          { key: 'all', label: `Tất cả (${totalDashboards})` },
          { key: 'mine', label: `Cá nhân (${totalMine})` },
          { key: 'group', label: `Nhóm (${totalGroup})` },
          { key: 'class', label: `Lớp (${totalClass})` },
        ].map((chip) => (
          <button
            key={chip.key}
            onClick={() => setContextFilter(chip.key)}
            className={`secondary-btn ${contextFilter === chip.key ? 'active' : ''}`}
            style={{
              padding: '8px 16px',
              fontSize: '0.85rem',
              borderRadius: '20px',
              background: contextFilter === chip.key ? 'var(--rules-text-accent)' : 'var(--rules-card-bg)',
              borderColor: contextFilter === chip.key ? 'var(--rules-text-accent)' : 'var(--rules-card-border)',
              color: contextFilter === chip.key ? '#ffffff' : 'var(--rules-text-secondary)',
              fontWeight: contextFilter === chip.key ? 600 : 500,
              boxShadow: contextFilter === chip.key ? '0 2px 8px rgba(8, 145, 178, 0.25)' : 'none',
              transition: 'all 0.2s',
            }}
          >
            {chip.label}
          </button>
        ))}
      </div>

      {formVisible && (
        <div className="rules-modal-backdrop">
          <div className="rules-modal" style={{ maxWidth: 600 }}>
            <div className="rules-modal-header">
              <h3>{editingDashboard ? 'Chỉnh sửa Dashboard' : 'Tạo Dashboard Mới'}</h3>
              <button className="rules-modal-close" onClick={() => { resetForm(); setFormVisible(false); }}>×</button>
            </div>
            <form className="rules-form" onSubmit={handleSave}>
              <label>
                Tên Dashboard *
                <input
                  type="text"
                  value={formData.ten_dashboard}
                  onChange={(e) => setFormData({ ...formData, ten_dashboard: e.target.value })}
                  required
                  placeholder="Ví dụ: Lớp học thông minh"
                />
              </label>

              <label>
                Mô tả
                <textarea
                  value={formData.mo_ta}
                  onChange={(e) => setFormData({ ...formData, mo_ta: e.target.value })}
                  rows={3}
                  placeholder="Mô tả về dashboard này..."
                  style={{ resize: 'vertical' }}
                />
              </label>

              <label>
                Gan voi phong (tuy chon - de trong = ca nhan)
                <select
                  value={formData.phong_id}
                  onChange={(e) => setFormData({ ...formData, phong_id: e.target.value, lop_hoc_id: '' })}
                >
                  <option value="">-- Không gắn với phòng cụ thể --</option>
                  {rooms.map((r) => (
                    <option key={r.id} value={r.id}>
                      [Cá nhân] {r.ten_phong || `Phòng #${r.id}`}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                Gan voi lop (tuy chon - chia se voi ca lop)
                <select
                  value={formData.lop_hoc_id}
                  onChange={(e) => setFormData({ ...formData, lop_hoc_id: e.target.value, phong_id: '' })}
                >
                  <option value="">-- Không gắn với lớp --</option>
                  {classes.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.ten_lop || `Lop #${c.id}`}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                Màu sắc
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <input
                    type="color"
                    value={formData.mau_sac}
                    onChange={(e) => setFormData({ ...formData, mau_sac: e.target.value })}
                    style={{ width: '50px', height: '40px', padding: '4px', borderRadius: '8px' }}
                  />
                  <input
                    type="text"
                    value={formData.mau_sac}
                    onChange={(e) => setFormData({ ...formData, mau_sac: e.target.value })}
                    placeholder="#22d3ee"
                    style={{ flex: 1 }}
                  />
                </div>
              </label>

              <div className="form-actions">
                <button type="button" onClick={() => { resetForm(); setFormVisible(false); }}>Hủy</button>
                <button type="submit">{editingDashboard ? 'Cập nhật' : 'Tạo'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {dashboards.length === 0 ? (
        <div className="ai-empty-state" style={{ padding: '80px 24px', background: 'var(--rules-card-bg)', borderRadius: '16px', border: '1px dashed var(--rules-card-border)' }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ width: '80px', height: '80px', color: 'var(--rules-text-accent)', opacity: 0.6, marginBottom: '20px' }}>
            <rect x="3" y="3" width="7" height="9"/>
            <rect x="14" y="3" width="7" height="5"/>
            <rect x="14" y="12" width="7" height="9"/>
            <rect x="3" y="16" width="7" height="5"/>
          </svg>
          <h3 style={{ margin: '0 0 8px', color: 'var(--rules-text)', fontSize: '1.2rem', fontWeight: 600 }}>
            Chưa có dashboard nào
          </h3>
          <p style={{ margin: '0', fontSize: '0.95rem', color: 'var(--rules-text-secondary)' }}>
            Hãy tạo dashboard đầu tiên để bắt đầu theo dõi dữ liệu IoT
          </p>
        </div>
      ) : filteredDashboards.length === 0 ? (
        <div className="ai-empty-state" style={{ padding: '60px 24px', background: 'var(--rules-card-bg)', borderRadius: '16px', border: '1px dashed var(--rules-card-border)' }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ width: '64px', height: '64px', color: 'var(--rules-text-muted)', opacity: 0.5, marginBottom: '16px' }}>
            <circle cx="11" cy="11" r="8"/>
            <line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <p style={{ color: 'var(--rules-text-secondary)', fontSize: '0.95rem' }}>
            Không có dashboard nào khớp với bộ lọc đã chọn
          </p>
        </div>
      ) : (
        <div className="dp-profiles-grid">
          {filteredDashboards.map(dashboard => {
            const contextType = dashboard.lop_hoc_id
              ? 'lop_hoc'
              : dashboard.nhom_id
                ? 'nhom'
                : dashboard.phong_id
                  ? 'ca_nhan'
                  : 'none';
            const contextLabel = CONTEXT_LABELS[contextType];
            const contextDetail = dashboard.ten_lop
              ? dashboard.ten_lop
              : dashboard.ten_phong
                ? dashboard.ten_phong
                : null;
            return (
              <div key={dashboard.id} className="dp-profile-card" style={{ position: 'relative' }}>
                <div className="dp-profile-header">
                  <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start', flex: 1 }}>
                    <div
                      style={{
                        width: '48px',
                        height: '48px',
                        borderRadius: '12px',
                        background: `linear-gradient(135deg, ${dashboard.mau_sac}30, ${dashboard.mau_sac}10)`,
                        border: `1px solid ${dashboard.mau_sac}50`,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                      }}
                    >
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={dashboard.mau_sac} strokeWidth="2">
                        <rect x="3" y="3" width="7" height="9"/>
                        <rect x="14" y="3" width="7" height="5"/>
                        <rect x="14" y="12" width="7" height="9"/>
                        <rect x="3" y="16" width="7" height="5"/>
                      </svg>
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <h4 className="dp-profile-title" style={{ margin: 0, fontSize: '1rem', fontWeight: 600, color: 'var(--rules-text)' }}>
                        {dashboard.ten_dashboard}
                      </h4>
                      {dashboard.mo_ta && (
                        <p style={{ margin: '4px 0 8px', color: 'var(--rules-text-muted)', fontSize: '0.8rem', overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                          {dashboard.mo_ta}
                        </p>
                      )}
                      <span className={`role-badge ${contextType === 'lop_hoc' ? 'admin' : contextType === 'nhom' ? 'teacher' : 'student'}`}>
                        {contextLabel}{contextDetail ? `: ${contextDetail}` : ''}
                      </span>
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '14px', paddingTop: '12px', borderTop: '1px solid var(--rules-card-border)', fontSize: '0.75rem', color: 'var(--rules-text-muted)' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
                      <line x1="16" y1="2" x2="16" y2="6"/>
                      <line x1="8" y1="2" x2="8" y2="6"/>
                      <line x1="3" y1="10" x2="21" y2="10"/>
                    </svg>
                    {new Date(dashboard.ngay_tao).toLocaleDateString('vi-VN')}
                  </span>
                </div>

                <div className="dp-profile-actions" style={{ marginTop: '12px', gap: '8px' }}>
                  <button
                    onClick={() => handleBuild(dashboard.id)}
                    className="btn-edit"
                    title="Build dashboard"
                    style={{ flex: 1, padding: '8px 10px', fontSize: '0.8rem' }}
                  >
                    Build
                  </button>
                  <button
                    onClick={() => handleView(dashboard.id)}
                    className="btn-edit"
                    title="Xem dashboard"
                    style={{ flex: 1, padding: '8px 10px', fontSize: '0.8rem' }}
                  >
                    Xem
                  </button>
                  <button
                    onClick={() => handleEdit(dashboard)}
                    className="btn-edit"
                    title="Sửa"
                    style={{ padding: '8px 10px', fontSize: '0.8rem' }}
                  >
                    Sửa
                  </button>
                  <button
                    onClick={() => handleDelete(dashboard.id)}
                    className="btn-delete"
                    title="Xóa"
                    style={{ padding: '8px 10px', fontSize: '0.8rem' }}
                  >
                    Xóa
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
      </div>
    </div>
  );
}

