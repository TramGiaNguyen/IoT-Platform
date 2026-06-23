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

export default function DashboardManagement({ token, onBack, onDashboardsChange }) {
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

  const loadDashboards = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetchDashboards(token);
      setDashboards(res.data.dashboards || []);
    } catch (err) {
      console.error('Failed to load dashboards:', err);
      setError('Không thể tải danh sách dashboard');
    } finally {
      setLoading(false);
    }
  }, [token]);

  const loadRoomsAndClasses = useCallback(async () => {
    try {
      const [r, c] = await Promise.all([
        fetchRooms(token).catch(() => ({ data: { rooms: [] } })),
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
    if (contextFilter === 'mine') return d.phong_id && !d.lop_hoc_id && d.loai_phong === 'ca_nhan';
    if (contextFilter === 'group') return d.phong_id && d.loai_phong === 'nhom';
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
        await createDashboard(payload, token);
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
        <div>
          <button onClick={onBack} style={{ marginBottom: '16px', padding: '8px 16px', background: '#1f2a44', border: '1px solid #22d3ee', color: '#22d3ee', borderRadius: '6px', cursor: 'pointer' }}>
            ← Quay lại
          </button>
          <h1 style={{ color: '#e5e7eb', margin: 0 }}>Quản lý Dashboard</h1>
          <p style={{ color: '#9ca3af', marginTop: '8px' }}>Tạo và quản lý các dashboard tùy chỉnh</p>
        </div>
        <button
          onClick={handleOpenAdd}
          style={{
            padding: '12px 24px',
            background: 'linear-gradient(135deg, #0ea5e9, #22d3ee)',
            border: 'none',
            borderRadius: '8px',
            color: '#0b1224',
            fontWeight: '600',
            cursor: 'pointer',
            fontSize: '14px'
          }}
        >
          + Tạo Dashboard Mới
        </button>
      </div>

      {error && (
        <div style={{
          padding: '12px',
          background: 'rgba(239, 68, 68, 0.1)',
          border: '1px solid rgba(239, 68, 68, 0.3)',
          borderRadius: '8px',
          color: '#fca5a5',
          marginBottom: '16px'
        }}>
          {error}
        </div>
      )}

      {/* Filter chips - Phase 5 */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap' }}>
        {[
          { key: 'all', label: `Tất cả (${dashboards.length})` },
          { key: 'mine', label: `Cá nhân (${dashboards.filter(d => d.phong_id && d.loai_phong === 'ca_nhan').length})` },
          { key: 'group', label: `Nhóm (${dashboards.filter(d => d.phong_id && d.loai_phong === 'nhom').length})` },
          { key: 'class', label: `Lớp (${dashboards.filter(d => d.lop_hoc_id).length})` },
        ].map((chip) => (
          <button
            key={chip.key}
            onClick={() => setContextFilter(chip.key)}
            style={{
              padding: '6px 14px',
              background: contextFilter === chip.key ? '#22d3ee' : '#111a2d',
              color: contextFilter === chip.key ? '#0b1224' : '#9ca3af',
              border: '1px solid ' + (contextFilter === chip.key ? '#22d3ee' : '#1f2a44'),
              borderRadius: '999px',
              cursor: 'pointer',
              fontSize: '13px',
              fontWeight: contextFilter === chip.key ? '600' : '400',
            }}
          >
            {chip.label}
          </button>
        ))}
      </div>

      {/* Dashboard Form Modal */}
      {formVisible && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.7)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000
        }}>
          <div style={{
            background: '#0b1224',
            border: '1px solid #1f2a44',
            borderRadius: '12px',
            padding: '24px',
            width: '90%',
            maxWidth: '500px',
            maxHeight: '90vh',
            overflow: 'auto'
          }}>
            <h2 style={{ color: '#e5e7eb', marginTop: 0 }}>
              {editingDashboard ? 'Chỉnh sửa Dashboard' : 'Tạo Dashboard Mới'}
            </h2>
            <form onSubmit={handleSave}>
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', color: '#9ca3af', marginBottom: '8px', fontSize: '14px' }}>
                  Tên Dashboard *
                </label>
                <input
                  type="text"
                  value={formData.ten_dashboard}
                  onChange={(e) => setFormData({ ...formData, ten_dashboard: e.target.value })}
                  required
                  style={{
                    width: '100%',
                    padding: '10px',
                    background: '#111a2d',
                    border: '1px solid #1f2a44',
                    borderRadius: '6px',
                    color: '#e5e7eb',
                    fontSize: '14px'
                  }}
                  placeholder="Ví dụ: Lớp học thông minh"
                />
              </div>

              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', color: '#9ca3af', marginBottom: '8px', fontSize: '14px' }}>
                  Mô tả
                </label>
                <textarea
                  value={formData.mo_ta}
                  onChange={(e) => setFormData({ ...formData, mo_ta: e.target.value })}
                  rows={3}
                  style={{
                    width: '100%',
                    padding: '10px',
                    background: '#111a2d',
                    border: '1px solid #1f2a44',
                    borderRadius: '6px',
                    color: '#e5e7eb',
                    fontSize: '14px',
                    resize: 'vertical'
                  }}
                  placeholder="Mô tả về dashboard này..."
                />
              </div>



              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', color: '#9ca3af', marginBottom: '8px', fontSize: '14px' }}>
                  Gắn với phòng (tuỳ chọn - để trống = cá nhân)
                </label>
                <select
                  value={formData.phong_id}
                  onChange={(e) => setFormData({ ...formData, phong_id: e.target.value, lop_hoc_id: '' })}
                  style={{
                    width: '100%',
                    padding: '10px',
                    background: '#111a2d',
                    border: '1px solid #1f2a44',
                    borderRadius: '6px',
                    color: '#e5e7eb',
                    fontSize: '14px'
                  }}
                >
                  <option value="">-- Không gắn với phòng cụ thể --</option>
                  {rooms.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.loai_phong === 'nhom' ? `[${r.ten_nhom || 'Nhóm'}] ` : '[Cá nhân] '}
                      {r.ten_phong || `Phòng #${r.id}`}
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', color: '#9ca3af', marginBottom: '8px', fontSize: '14px' }}>
                  Gắn với lớp (tuỳ chọn - chia sẻ với cả lớp)
                </label>
                <select
                  value={formData.lop_hoc_id}
                  onChange={(e) => setFormData({ ...formData, lop_hoc_id: e.target.value, phong_id: '' })}
                  style={{
                    width: '100%',
                    padding: '10px',
                    background: '#111a2d',
                    border: '1px solid #1f2a44',
                    borderRadius: '6px',
                    color: '#e5e7eb',
                    fontSize: '14px'
                  }}
                >
                  <option value="">-- Không gắn với lớp --</option>
                  {classes.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.ten_lop || `Lớp #${c.id}`}
                    </option>
                  ))}
                </select>
              </div>
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', color: '#9ca3af', marginBottom: '8px', fontSize: '14px' }}>
                  Màu sắc
                </label>
                <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                  <input
                    type="color"
                    value={formData.mau_sac}
                    onChange={(e) => setFormData({ ...formData, mau_sac: e.target.value })}
                    style={{
                      width: '60px',
                      height: '40px',
                      border: '1px solid #1f2a44',
                      borderRadius: '6px',
                      cursor: 'pointer'
                    }}
                  />
                  <input
                    type="text"
                    value={formData.mau_sac}
                    onChange={(e) => setFormData({ ...formData, mau_sac: e.target.value })}
                    style={{
                      flex: 1,
                      padding: '10px',
                      background: '#111a2d',
                      border: '1px solid #1f2a44',
                      borderRadius: '6px',
                      color: '#e5e7eb',
                      fontSize: '14px'
                    }}
                    placeholder="#22d3ee"
                  />
                </div>
              </div>

              <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  onClick={() => {
                    resetForm();
                    setFormVisible(false);
                  }}
                  style={{
                    padding: '10px 20px',
                    background: '#111a2d',
                    border: '1px solid #1f2a44',
                    borderRadius: '6px',
                    color: '#e5e7eb',
                    cursor: 'pointer'
                  }}
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  style={{
                    padding: '10px 20px',
                    background: 'linear-gradient(135deg, #0ea5e9, #22d3ee)',
                    border: 'none',
                    borderRadius: '6px',
                    color: '#0b1224',
                    fontWeight: '600',
                    cursor: 'pointer'
                  }}
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
        <div style={{
          textAlign: 'center',
          padding: '60px 20px',
          background: 'rgba(15, 23, 42, 0.5)',
          border: '1px dashed #1f2a44',
          borderRadius: '12px',
          color: '#9ca3af'
        }}>
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>📊</div>
          <h3 style={{ color: '#e5e7eb', marginBottom: '8px' }}>Chưa có dashboard nào</h3>
          <p>Bấm nút "Tạo Dashboard Mới" để bắt đầu</p>
        </div>
      ) : filteredDashboards.length === 0 ? (
        <div style={{
          textAlign: 'center',
          padding: '40px 20px',
          color: '#9ca3af',
        }}>
          <p>Không có dashboard nào khớp với bộ lọc "{contextFilter}".</p>
        </div>
      ) : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
          gap: '20px'
        }}>
          {filteredDashboards.map(dashboard => {
            const contextType = dashboard.lop_hoc_id
              ? 'lop_hoc'
              : dashboard.loai_phong === 'nhom'
                ? 'nhom'
                : dashboard.phong_id
                  ? 'ca_nhan'
                  : 'none';
            const contextLabel = CONTEXT_LABELS[contextType];
            const contextDetail = dashboard.ten_lop
              ? dashboard.ten_lop
              : dashboard.ten_phong
                ? (dashboard.loai_phong === 'nhom'
                    ? `[${dashboard.ten_nhom || 'Nhóm'}] ${dashboard.ten_phong}`
                    : dashboard.ten_phong)
                : null;
            return (
            <div
              key={dashboard.id}
              style={{
                background: 'linear-gradient(145deg, rgba(15, 23, 42, 0.92), rgba(9, 12, 24, 0.95))',
                border: '1px solid #1f2a44',
                borderRadius: '12px',
                padding: '20px',
                transition: 'all 0.2s',
                cursor: 'pointer',
                position: 'relative'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = '#22d3ee';
                e.currentTarget.style.transform = 'translateY(-2px)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = '#1f2a44';
                e.currentTarget.style.transform = 'translateY(0)';
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div style={{
                    fontSize: '32px',
                    width: '48px',
                    height: '48px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: `${dashboard.mau_sac}20`,
                    borderRadius: '8px',
                    border: `1px solid ${dashboard.mau_sac}40`
                  }}>
                    {dashboard.ten_dashboard ? dashboard.ten_dashboard.charAt(0).toUpperCase() : 'D'}
                  </div>
                  <div>
                    <h3 style={{ color: '#e5e7eb', margin: 0, fontSize: '18px' }}>
                      {dashboard.ten_dashboard}
                    </h3>
                    {dashboard.mo_ta && (
                      <p style={{ color: '#9ca3af', margin: '4px 0 0 0', fontSize: '13px' }}>
                        {dashboard.mo_ta}
                      </p>
                    )}
                    <span
                      title={contextDetail || ''}
                      style={{
                        display: 'inline-block',
                        marginTop: '6px',
                        padding: '2px 8px',
                        fontSize: '11px',
                        fontWeight: '600',
                        borderRadius: '4px',
                        background:
                          contextType === 'lop_hoc' ? 'rgba(168, 85, 247, 0.15)' :
                          contextType === 'nhom' ? 'rgba(34, 211, 238, 0.15)' :
                          contextType === 'ca_nhan' ? 'rgba(74, 222, 128, 0.15)' :
                          'rgba(156, 163, 175, 0.15)',
                        color:
                          contextType === 'lop_hoc' ? '#c4b5fd' :
                          contextType === 'nhom' ? '#67e8f9' :
                          contextType === 'ca_nhan' ? '#86efac' :
                          '#9ca3af',
                        border: '1px solid ' + (
                          contextType === 'lop_hoc' ? 'rgba(168, 85, 247, 0.4)' :
                          contextType === 'nhom' ? 'rgba(34, 211, 238, 0.4)' :
                          contextType === 'ca_nhan' ? 'rgba(74, 222, 128, 0.4)' :
                          'rgba(156, 163, 175, 0.4)'
                        ),
                      }}
                    >
                      {contextLabel}{contextDetail ? `: ${contextDetail}` : ''}
                    </span>
                  </div>
                </div>
              </div>

              <div style={{
                marginTop: '16px',
                paddingTop: '16px',
                borderTop: '1px solid #1f2a44',
                display: 'flex',
                gap: '8px',
                justifyContent: 'flex-end'
              }}>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleBuild(dashboard.id);
                  }}
                  style={{
                    padding: '6px 12px',
                    background: '#111a2d',
                    border: '1px solid #22d3ee',
                    borderRadius: '6px',
                    color: '#22d3ee',
                    cursor: 'pointer',
                    fontSize: '12px',
                    fontWeight: '600'
                  }}
                >
                  🛠️ Build
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleView(dashboard.id);
                  }}
                  style={{
                    padding: '6px 12px',
                    background: '#111a2d',
                    border: '1px solid #4ecdc4',
                    borderRadius: '6px',
                    color: '#4ecdc4',
                    cursor: 'pointer',
                    fontSize: '12px'
                  }}
                >
                  Xem
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleEdit(dashboard);
                  }}
                  style={{
                    padding: '6px 12px',
                    background: '#111a2d',
                    border: '1px solid #4ecdc4',
                    borderRadius: '6px',
                    color: '#4ecdc4',
                    cursor: 'pointer',
                    fontSize: '12px'
                  }}
                >
                  Sửa
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDelete(dashboard.id);
                  }}
                  style={{
                    padding: '6px 12px',
                    background: '#111a2d',
                    border: '1px solid #ef4444',
                    borderRadius: '6px',
                    color: '#ef4444',
                    cursor: 'pointer',
                    fontSize: '12px'
                  }}
                >
                  Xóa
                </button>
              </div>

              <div style={{
                position: 'absolute',
                top: '12px',
                right: '12px',
                fontSize: '11px',
                color: '#6b7280',
                background: '#111a2d',
                padding: '4px 8px',
                borderRadius: '4px'
              }}>
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

