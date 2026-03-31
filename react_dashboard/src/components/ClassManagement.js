import React, { useState, useEffect, useCallback } from 'react';
import { fetchClasses, createClass, deleteClass, fetchUsers, createUser, impersonateUser } from '../services';

export default function ClassManagement({ token, onBack }) {
  const [classes, setClasses] = useState([]);
  const [loading, setLoading] = useState(false);
  const [students, setStudents] = useState([]);

  // Tab state: 'classes' | 'students'
  const [activeTab, setActiveTab] = useState('classes');

  // Modal for creating a class
  const [showClassModal, setShowClassModal] = useState(false);
  const [newClassName, setNewClassName] = useState('');

  // Modal for adding a student
  const [showStudentModal, setShowStudentModal] = useState(false);
  const [studentForm, setStudentForm] = useState({
    ten: '', email: '', password: '', lop_hoc_id: ''
  });

  const loadClasses = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchClasses(token);
      setClasses(res.data.classes || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [token]);

  const loadStudents = useCallback(async () => {
    try {
      const res = await fetchUsers(token);
      setStudents((res.data.users || []).filter(u => u.vai_tro === 'student'));
    } catch (e) {
      console.error(e);
    }
  }, [token]);

  useEffect(() => {
    loadClasses();
    loadStudents();
  }, [loadClasses, loadStudents]);

  const handleCreateClass = async (e) => {
    e.preventDefault();
    if (!newClassName.trim()) return;
    try {
      await createClass({ ten_lop: newClassName }, token);
      setNewClassName('');
      setShowClassModal(false);
      loadClasses();
    } catch (e) {
      alert('Lỗi tạo lớp: ' + (e.response?.data?.detail || e.message));
    }
  };

  const handleDeleteClass = async (cls) => {
    if (!window.confirm(`Xóa lớp "${cls.ten_lop}"?`)) return;
    try {
      await deleteClass(cls.id, token);
      loadClasses();
    } catch (e) {
      alert('Lỗi xóa lớp: ' + (e.response?.data?.detail || e.message));
    }
  };

  const handleCreateStudent = async (e) => {
    e.preventDefault();
    if (!studentForm.ten || !studentForm.email || !studentForm.password || !studentForm.lop_hoc_id) {
      alert('Vui lòng điền đầy đủ thông tin');
      return;
    }
    try {
      await createUser({
        ten: studentForm.ten,
        email: studentForm.email,
        password: studentForm.password,
        vai_tro: 'student',
        lop_hoc_id: parseInt(studentForm.lop_hoc_id)
      }, token);
      setStudentForm({ ten: '', email: '', password: '', lop_hoc_id: '' });
      setShowStudentModal(false);
      loadStudents();
      loadClasses();
    } catch (e) {
      alert('Lỗi tạo học viên: ' + (e.response?.data?.detail || e.message));
    }
  };

  const handleImpersonate = async (student) => {
    if (!window.confirm(`Đăng nhập vào tài khoản "${student.ten}"?\n\nBạn sẽ cần đăng xuất và đăng nhập lại để quay về tài khoản của mình.`)) return;
    try {
      const res = await impersonateUser(student.id, token);
      // Save new token and user info
      localStorage.setItem('token', res.data.access_token);
      localStorage.setItem('userRole', res.data.vai_tro);
      localStorage.setItem('allowedPages', JSON.stringify(res.data.allowed_pages || []));
      // Reload page to apply new session
      window.location.reload();
    } catch (err) {
      console.error('Impersonate failed', err);
      alert('Đăng nhập thất bại: ' + (err.response?.data?.detail || err.message));
    }
  };

  const getClassName = (lop_hoc_id) => {
    const cls = classes.find(c => c.id === lop_hoc_id);
    return cls ? cls.ten_lop : '—';
  };

  return (
    <div className="rules-container">
      <div className="rules-header">
        <div>
          <h2>Quản lý lớp học</h2>
          <p className="muted">Tạo lớp, thêm học viên và quản lý phân công</p>
        </div>
        <div className="rules-actions">
          {activeTab === 'classes' ? (
            <button className="primary-btn" onClick={() => setShowClassModal(true)}>+ Thêm lớp</button>
          ) : (
            <button className="primary-btn" onClick={() => setShowStudentModal(true)}>+ Thêm học viên</button>
          )}
          <button className="secondary-btn" onClick={onBack}>Quay lại</button>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '4px', marginBottom: '20px', borderBottom: '1px solid #2d3748', paddingBottom: '0' }}>
        {['classes', 'students'].map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              padding: '8px 20px',
              background: 'none',
              border: 'none',
              borderBottom: activeTab === tab ? '2px solid #6366f1' : '2px solid transparent',
              color: activeTab === tab ? '#6366f1' : '#9ca3af',
              cursor: 'pointer',
              fontWeight: activeTab === tab ? '600' : '400',
              fontSize: '14px',
              transition: 'all 0.2s',
              marginBottom: '-1px',
            }}
          >
            {tab === 'classes' ? '🏫 Danh sách lớp' : '👤 Học viên'}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="loading">Đang tải...</div>
      ) : activeTab === 'classes' ? (
        <div className="devices-grid neo-grid">
          {classes.map(cls => (
            <div key={cls.id} className="neo-card">
              <div className="card-header">
                <div className="icon-wrap" style={{ fontSize: '24px' }}>🏫</div>
                <div className="card-meta">
                  <h3>{cls.ten_lop}</h3>
                  <p>Mã lớp: {cls.id}</p>
                </div>
                <button className="delete-device-btn" onClick={() => handleDeleteClass(cls)} title="Xóa lớp">×</button>
              </div>
              <div className="card-body">
                <div className="metric-row">
                  <span className="label">Giáo viên phụ trách</span>
                  <span className="value">{cls.giao_vien_ten || <span style={{ color: '#6b7280', fontSize: '14px' }}>Chưa phân công</span>}</span>
                </div>
                <div className="metric-row">
                  <span className="label">Số học viên</span>
                  <span className="value"><span className="role-badge student">{cls.so_luong_sv || 0} SV</span></span>
                </div>
                <div className="metric-row" style={{ borderBottom: 'none' }}>
                  <span className="label">Ngày tạo</span>
                  <span className="value">{cls.ngay_tao ? new Date(cls.ngay_tao).toLocaleDateString('vi-VN') : '—'}</span>
                </div>
              </div>
            </div>
          ))}
          {classes.length === 0 && (
             <div className="empty-state" style={{ width: '100%', gridColumn: '1 / -1' }}>
                <p>Chưa có lớp nào được tạo. Nhấn "+ Thêm lớp" để bắt đầu.</p>
             </div>
          )}
        </div>
      ) : (
        <div className="devices-grid neo-grid">
          {students.map(sv => (
            <div key={sv.id} className="neo-card">
              <div className="card-header">
                <div className="icon-wrap" style={{ fontSize: '24px' }}>👤</div>
                <div className="card-meta">
                  <h3>{sv.ten}</h3>
                  <p>{sv.email}</p>
                </div>
              </div>
              <div className="card-body">
                <div className="metric-row" style={{ borderBottom: 'none' }}>
                  <span className="label">Lớp</span>
                  <span className="value">
                    {sv.ten_lop
                      ? <span className="role-badge teacher">{sv.ten_lop}</span>
                      : <span style={{ color: '#6b7280', fontSize: '14px' }}>Chưa phân lớp</span>}
                  </span>
                </div>
              </div>
              <div className="card-footer" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
                  <span>ID: {sv.id}</span>
                  <button 
                    onClick={() => handleImpersonate(sv)}
                    style={{ 
                      background: '#10b981', 
                      color: 'white', 
                      border: 'none', 
                      padding: '6px 12px', 
                      borderRadius: '4px', 
                      cursor: 'pointer',
                      fontSize: '13px',
                      fontWeight: '500'
                    }}
                  >
                    Đăng nhập
                  </button>
              </div>
            </div>
          ))}
          {students.length === 0 && (
             <div className="empty-state" style={{ width: '100%', gridColumn: '1 / -1' }}>
                <p>Chưa có học viên nào được thêm.</p>
             </div>
          )}
        </div>
      )}

      {/* Modal: Thêm lớp */}
      {showClassModal && (
        <div className="modal-backdrop">
          <div className="modal-content" style={{ maxWidth: 420 }}>
            <div className="modal-header">
              <h3>Thêm lớp học</h3>
              <button onClick={() => { setShowClassModal(false); setNewClassName(''); }}>×</button>
            </div>
            <form className="rule-form" onSubmit={handleCreateClass}>
              <label>
                Tên lớp *
                <input
                  type="text"
                  value={newClassName}
                  onChange={e => setNewClassName(e.target.value)}
                  placeholder="VD: Lớp CNTT K20A"
                  required
                  autoFocus
                />
              </label>
              <div className="form-actions">
                <button type="submit">Tạo lớp</button>
                <button type="button" onClick={() => { setShowClassModal(false); setNewClassName(''); }}>Hủy</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Thêm học viên */}
      {showStudentModal && (
        <div className="modal-backdrop">
          <div className="modal-content" style={{ maxWidth: 460 }}>
            <div className="modal-header">
              <h3>Thêm học viên</h3>
              <button onClick={() => { setShowStudentModal(false); setStudentForm({ ten: '', email: '', password: '', lop_hoc_id: '' }); }}>×</button>
            </div>
            <form className="rule-form" onSubmit={handleCreateStudent}>
              <label>
                Lớp học *
                <select
                  value={studentForm.lop_hoc_id}
                  onChange={e => setStudentForm({ ...studentForm, lop_hoc_id: e.target.value })}
                  required
                >
                  <option value="">-- Chọn lớp --</option>
                  {classes.map(c => (
                    <option key={c.id} value={c.id}>{c.ten_lop}</option>
                  ))}
                </select>
              </label>
              <label>
                Tên học viên *
                <input
                  type="text"
                  value={studentForm.ten}
                  onChange={e => setStudentForm({ ...studentForm, ten: e.target.value })}
                  placeholder="Nguyễn Văn A"
                  required
                />
              </label>
              <label>
                Email *
                <input
                  type="email"
                  value={studentForm.email}
                  onChange={e => setStudentForm({ ...studentForm, email: e.target.value })}
                  placeholder="student@example.com"
                  required
                />
              </label>
              <label>
                Mật khẩu *
                <input
                  type="password"
                  value={studentForm.password}
                  onChange={e => setStudentForm({ ...studentForm, password: e.target.value })}
                  placeholder="Nhập mật khẩu"
                  required
                />
              </label>
              <div className="form-actions">
                <button type="submit">Tạo học viên</button>
                <button type="button" onClick={() => { setShowStudentModal(false); setStudentForm({ ten: '', email: '', password: '', lop_hoc_id: '' }); }}>Hủy</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
