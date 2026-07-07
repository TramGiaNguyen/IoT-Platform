import React, { useEffect, useState, useCallback } from 'react';
import { fetchDashboards, createDashboard, updateDashboard, deleteDashboard, fetchRooms, fetchClasses } from '../services';
import DashboardBuilder from './DashboardBuilder/DashboardBuilder';
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
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/b79dabf1-b019-4647-a912-96914bd03449',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'DashboardManagement.js:105',message:'handleBuild called',data:{dashboardId},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
    // #endregion
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
      <div className="rules-container">
        <div style={{ textAlign: 'center', padding: '40px' }}>
          <p>Đang tải...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="rules-container">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <button className="back-btn-ghost" onClick={onBack}>
          ← Quay lại
        </button>
        <button
          onClick={handleOpenAdd}
          className="dm-create-btn"
        >
          + Tạo Dashboard Mới
        </button>
      </div>

      {error && (
        <div className="dm-error-box">
          {error}
        </div>
      )}

      {/* Filter chips - Phase 5 */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap' }}>
        {[
          { key: 'all', label: `Tất cả (${dashboards.length})` },
          { key: 'mine', label: `Cá nhân (${dashboards.filter(d => d.phong_id && !d.lop_hoc_id && !d.nhom_id).length})` },
          { key: 'group', label: `Nhóm (${dashboards.filter(d => d.nhom_id != null).length})` },
          { key: 'class', label: `Lớp (${dashboards.filter(d => d.lop_hoc_id).length})` },
        ].map((chip) => (
          <button
            key={chip.key}
            onClick={() => setContextFilter(chip.key)}
            className={`dm-filter-chip${contextFilter === chip.key ? ' active' : ''}`}
          >
            {chip.label}
          </button>
        ))}
      </div>

      {/* Dashboard Form Modal */}
      {formVisible && (
        <div className="dm-modal-backdrop">
          <div className="dm-modal">
            <h2>
              {editingDashboard ? 'Chỉnh sửa Dashboard' : 'Tạo Dashboard Mới'}
            </h2>
            <form onSubmit={handleSave}>
              <div className="dm-form-row">
                <label className="dm-form-label">
                  Tên Dashboard *
                </label>
                <input
                  type="text"
                  value={formData.ten_dashboard}
                  onChange={(e) => setFormData({ ...formData, ten_dashboard: e.target.value })}
                  required
                  className="dm-form-input"
                  placeholder="Ví dụ: Lớp học thông minh"
                />
              </div>

              <div className="dm-form-row">
                <label className="dm-form-label">
                  Mô tả
                </label>
                <textarea
                  value={formData.mo_ta}
                  onChange={(e) => setFormData({ ...formData, mo_ta: e.target.value })}
                  rows={3}
                  className="dm-form-textarea"
                  placeholder="Mô tả về dashboard này..."
                />
              </div>



              <div className="dm-form-row">
                <label className="dm-form-label">
                  Gắn với phòng (tuỳ chọn - để trống = cá nhân)
                </label>
                <select
                  value={formData.phong_id}
                  onChange={(e) => setFormData({ ...formData, phong_id: e.target.value, lop_hoc_id: '' })}
                  className="dm-form-select"
                >
                  <option value="">-- Không gắn với phòng cụ thể --</option>
                  {rooms.map((r) => (
                    <option key={r.id} value={r.id}>
                      [Cá nhân] {r.ten_phong || `Phòng #${r.id}`}
                    </option>
                  ))}
                </select>
              </div>

              <div className="dm-form-row">
                <label className="dm-form-label">
                  Gắn với lớp (tuỳ chọn - chia sẻ với cả lớp)
                </label>
                <select
                  value={formData.lop_hoc_id}
                  onChange={(e) => setFormData({ ...formData, lop_hoc_id: e.target.value, phong_id: '' })}
                  className="dm-form-select"
                >
                  <option value="">-- Không gắn với lớp --</option>
                  {classes.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.ten_lop || `Lớp #${c.id}`}
                    </option>
                  ))}
                </select>
              </div>
              <div className="dm-form-row">
                <label className="dm-form-label">
                  Màu sắc
                </label>
                <div className="dm-form-color">
                  <input
                    type="color"
                    value={formData.mau_sac}
                    onChange={(e) => setFormData({ ...formData, mau_sac: e.target.value })}
                    className="dm-form-color-picker"
                  />
                  <input
                    type="text"
                    value={formData.mau_sac}
                    onChange={(e) => setFormData({ ...formData, mau_sac: e.target.value })}
                    className="dm-form-color-text"
                    placeholder="#22d3ee"
                  />
                </div>
              </div>

              <div className="dm-form-actions">
                <button
                  type="button"
                  onClick={() => {
                    resetForm();
                    setFormVisible(false);
                  }}
                  className="dm-form-cancel"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="dm-form-submit"
                >
                  {editingDashboard ? 'Cập nhật' : 'Tạo'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Dashboards Grid */}
      {dashboards.length === 0 ? (
        <div className="dm-empty">
          <div className="dm-empty-icon">📊</div>
          <h3>Chưa có dashboard nào</h3>
          <p>Bấm nút "Tạo Dashboard Mới" để bắt đầu</p>
        </div>
      ) : filteredDashboards.length === 0 ? (
        <div className="dm-no-match">
          <p>Không có dashboard nào khớp với bộ lọc "{contextFilter}".</p>
        </div>
      ) : (
        <div className="dm-grid">
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
            <div key={dashboard.id} className="dm-card">
              <div className="dm-card-head">
                <div className="dm-card-head-left">
                  <div
                    className="dm-card-icon"
                    style={{
                      background: `${dashboard.mau_sac}20`,
                      border: `1px solid ${dashboard.mau_sac}40`,
                    }}
                  >
                    {dashboard.ten_dashboard ? dashboard.ten_dashboard.charAt(0).toUpperCase() : 'D'}
                  </div>
                  <div>
                    <h3 className="dm-card-title">
                      {dashboard.ten_dashboard}
                    </h3>
                    {dashboard.mo_ta && (
                      <p className="dm-card-desc">
                        {dashboard.mo_ta}
                      </p>
                    )}
                    <span
                      title={contextDetail || ''}
                      className={`dm-context-badge ${contextType}`}
                    >
                      {contextLabel}{contextDetail ? `: ${contextDetail}` : ''}
                    </span>
                  </div>
                </div>
              </div>

              <div className="dm-card-actions">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleBuild(dashboard.id);
                  }}
                  className="dm-action-btn"
                >
                  🛠️ Build
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleView(dashboard.id);
                  }}
                  className="dm-action-btn dm-action-teal"
                >
                  Xem
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleEdit(dashboard);
                  }}
                  className="dm-action-btn dm-action-teal"
                >
                  Sửa
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDelete(dashboard.id);
                  }}
                  className="dm-action-btn dm-action-danger"
                >
                  Xóa
                </button>
              </div>

              <div className="dm-card-date">
                {new Date(dashboard.ngay_tao).toLocaleDateString('vi-VN')}
              </div>
            </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

