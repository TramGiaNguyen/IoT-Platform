import React, { useEffect, useState, useCallback } from 'react';
import { fetchDashboards, createDashboard, updateDashboard, deleteDashboard } from '../services';
import DashboardBuilder from './DashboardBuilder/DashboardBuilder';
import '../styles/style.css';

export default function DashboardManagement({ token, onBack }) {
  const [dashboards, setDashboards] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [formVisible, setFormVisible] = useState(false);
  const [editingDashboard, setEditingDashboard] = useState(null);
  const [buildingDashboardId, setBuildingDashboardId] = useState(null);
  const [formData, setFormData] = useState({
    ten_dashboard: '',
    mo_ta: '',
    icon: 'dashboard',
    mau_sac: '#22d3ee'
  });

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

  useEffect(() => {
    loadDashboards();
  }, [loadDashboards]);

  const resetForm = () => {
    setFormData({
      ten_dashboard: '',
      mo_ta: '',
      icon: 'dashboard',
      mau_sac: '#22d3ee'
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
      icon: dashboard.icon || 'dashboard',
      mau_sac: dashboard.mau_sac || '#22d3ee'
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
      if (editingDashboard) {
        await updateDashboard(editingDashboard.id, formData, token);
      } else {
        await createDashboard(formData, token);
      }
      resetForm();
      setFormVisible(false);
      await loadDashboards();
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

  const iconOptions = [
    { value: 'dashboard', label: '📊 Dashboard' },
    { value: 'chart', label: '📈 Chart' },
    { value: 'monitor', label: '🖥️ Monitor' },
    { value: 'home', label: '🏠 Home' },
    { value: 'building', label: '🏢 Building' },
    { value: 'garden', label: '🌿 Garden' },
    { value: 'classroom', label: '🏫 Classroom' },
    { value: 'factory', label: '🏭 Factory' },
  ];

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
                  Icon
                </label>
                <select
                  value={formData.icon}
                  onChange={(e) => setFormData({ ...formData, icon: e.target.value })}
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
                  {iconOptions.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>

              <div style={{ marginBottom: '24px' }}>
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
      ) : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
          gap: '20px'
        }}>
          {dashboards.map(dashboard => (
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
                    {dashboard.icon === 'dashboard' && '📊'}
                    {dashboard.icon === 'chart' && '📈'}
                    {dashboard.icon === 'monitor' && '🖥️'}
                    {dashboard.icon === 'home' && '🏠'}
                    {dashboard.icon === 'building' && '🏢'}
                    {dashboard.icon === 'garden' && '🌿'}
                    {dashboard.icon === 'classroom' && '🏫'}
                    {dashboard.icon === 'factory' && '🏭'}
                    {!['dashboard', 'chart', 'monitor', 'home', 'building', 'garden', 'classroom', 'factory'].includes(dashboard.icon) && '📊'}
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
          ))}
        </div>
      )}
    </div>
  );
}

