import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  fetchClasses, createClass, deleteClass, fetchUsers, createUser, impersonateUser,
  listClassStudents, addStudentToClass, removeStudentFromClass,
  listClassGroups, createClassGroup, updateGroup, deleteGroup,
  listGroupMembers, addGroupMember, removeGroupMember,
  bulkImportClassStudents, fetchUnassignedStudents,
} from '../services';
import { useCrudVersion, useRealtimePolling } from '../context/RealtimeProvider';

const MAX_STUDENTS_PER_CLASS = 100;
const MAX_MEMBERS_PER_GROUP = 5;
const PAGE_SIZE = 15;

export default function ClassManagement({ token, onBack, onClassChanged, workspaceContext = 'ca_nhan', userInfo = null }) {
  const [classes, setClasses] = useState([]);
  const [loading, setLoading] = useState(false);

  // Realtime: tu refetch khi co CRUD class/group/student tu tab khac
  const classesVersion = useCrudVersion('class');
  const groupsVersion = useCrudVersion('group');
  const classStudentsVersion = useCrudVersion('class_student');

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalClasses, setTotalClasses] = useState(0);

  // Modal for creating a class
  const [showClassModal, setShowClassModal] = useState(false);
  const [newClassName, setNewClassName] = useState('');

  // Selected class detail panel
  const [selectedClass, setSelectedClass] = useState(null);

  const loadClasses = useCallback(async (page = 1) => {
    setLoading(true);
    try {
      const res = await fetchClasses(token, { page, page_size: PAGE_SIZE });
      const data = res.data;
      setClasses(data.classes || []);
      setTotalClasses(data.total || 0);
      setTotalPages(data.total_pages || 1);
      setCurrentPage(data.page || 1);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    loadClasses(1);
  }, [loadClasses]);

  // Realtime: refetch khi class/group/student CRUD event den
  // Hoac WS disconnected: polling 30s de bu CRUD events bi miss
  const refetchClassesCurrent = useCallback(() => loadClasses(currentPage), [loadClasses, currentPage]);
  useRealtimePolling(classesVersion, refetchClassesCurrent, [refetchClassesCurrent]);

  const refetchGroups = useCallback(() => {
    if (selectedClass) {
      listClassGroups(selectedClass.id).then(r => setGroups(r.data.groups || r.data || [])).catch(() => {});
    }
  }, [selectedClass]);
  useRealtimePolling(groupsVersion, refetchGroups, [refetchGroups]);

  const refetchStudents = useCallback(() => {
    if (selectedClass) {
      listClassStudents(selectedClass.id).then(r => setStudents(r.data.students || r.data || [])).catch(() => {});
    }
  }, [selectedClass]);
  useRealtimePolling(classStudentsVersion, refetchStudents, [refetchStudents]);

  const handleCreateClass = async (e) => {
    e.preventDefault();
    if (!newClassName.trim()) return;
    try {
      await createClass({ ten_lop: newClassName }, token);
      setNewClassName('');
      setShowClassModal(false);
      loadClasses(currentPage);
      if (onClassChanged) onClassChanged(token);
    } catch (e) {
      alert('Lỗi tạo lớp: ' + (e.response?.data?.detail || e.message));
    }
  };

  const handleDeleteClass = async (cls, e) => {
    e.stopPropagation();
    if (!window.confirm(`Xóa lớp "${cls.ten_lop}"?\n\nCác nhóm + thành viên nhóm của lớp cũng sẽ bị xóa theo.`)) return;
    try {
      await deleteClass(cls.id, token);
      if (selectedClass?.id === cls.id) setSelectedClass(null);
      loadClasses(currentPage);
    } catch (e) {
      alert('Lỗi xóa lớp: ' + (e.response?.data?.detail || e.message));
    }
  };

  // Page numbers
  const pageNumbers = [];
  const maxPageBtns = 5;
  let startPage = Math.max(1, currentPage - Math.floor(maxPageBtns / 2));
  let endPage = Math.min(totalPages, startPage + maxPageBtns - 1);
  if (endPage - startPage < maxPageBtns - 1) startPage = Math.max(1, endPage - maxPageBtns + 1);
  for (let p = startPage; p <= endPage; p++) pageNumbers.push(p);

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
                <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
                <polyline points="9 22 9 12 15 12 15 22"/>
              </svg>
            </div>
            <div>
<h1>Quản lý Lớp học</h1>
            <p className="ai-page-subtitle-text">Quản lý lớp học, học viên và nhóm</p>
            </div>
          </div>
        </div>
        <div className="rules-actions">
          <button className="primary-btn" onClick={() => setShowClassModal(true)}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            Thêm Lớp
          </button>
        </div>
      </div>

      <div className="ai-page-content">

      {loading ? (
        <div className="ai-empty-state">Đang tải...</div>
      ) : (
        <>
        <div className="classes-grid">
          {classes.map(cls => (
            <div
              key={cls.id}
              className="class-card"
              onClick={() => setSelectedClass(cls)}
            >
              <div className="class-card-header">
                <div className="class-card-icon">🏫</div>
                <div className="class-card-info">
                  <h3>{cls.ten_lop}</h3>
                  <p>Mã lớp: {cls.id}</p>
                </div>
              </div>
              <div className="class-card-stats">
                <div className="class-stat">
                  <div className="class-stat-value">{cls.so_luong_sv || 0}</div>
                  <div className="class-stat-label">Học viên</div>
                </div>
                <div className="class-stat">
                  <div className="class-stat-value">{cls.so_luong_nhom || 0}</div>
                  <div className="class-stat-label">Nhóm</div>
                </div>
                <div className="class-stat">
                  <div className="class-stat-value">{cls.giao_vien_ten || '—'}</div>
                  <div className="class-stat-label">Giáo viên</div>
                </div>
                <div className="class-stat">
                  <div className="class-stat-value">{cls.ngay_tao ? new Date(cls.ngay_tao).toLocaleDateString('vi-VN') : '—'}</div>
                  <div className="class-stat-label">Ngày tạo</div>
                </div>
              </div>
              <div className="class-card-footer">
                <button
                  onClick={(e) => { e.stopPropagation(); setSelectedClass(cls); }}
                  className="btn-detail"
                >
                  Xem chi tiet
                </button>
              </div>
            </div>
          ))}
          {classes.length === 0 && (
            <div className="ai-empty-state" style={{ gridColumn: '1 / -1' }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
                <polyline points="9 22 9 12 15 12 15 22"/>
              </svg>
              <p>Chưa có lớp nào được tạo. Nhấn "Thêm Lớp" để bắt đầu.</p>
            </div>
          )}
        </div>

        {totalPages > 1 && (
          <div className="pagination-container">
            <span className="pagination-info">
              Hiển thị {classes.length} / {totalClasses} lop — Trang {currentPage} / {totalPages}
            </span>
            <div className="pagination-controls">
              <button onClick={() => loadClasses(1)} disabled={currentPage === 1}>«</button>
              <button onClick={() => loadClasses(currentPage - 1)} disabled={currentPage === 1}>‹</button>
              {pageNumbers.map(p => (
                <button key={p} className={p === currentPage ? 'active' : ''} onClick={() => loadClasses(p)}>{p}</button>
              ))}
              <button onClick={() => loadClasses(currentPage + 1)} disabled={currentPage === totalPages}>›</button>
              <button onClick={() => loadClasses(totalPages)} disabled={currentPage === totalPages}>»</button>
            </div>
          </div>
        )}
        </>
      )}

      {/* Modal: Thêm lớp */}
      {showClassModal && (
        <div className="rules-modal-backdrop">
          <div className="rules-modal" style={{ maxWidth: 420 }}>
            <div className="rules-modal-header">
              <h3>Thêm lớp học</h3>
              <button className="rules-modal-close" onClick={() => { setShowClassModal(false); setNewClassName(''); }}>×</button>
            </div>
            <form className="rules-form" onSubmit={handleCreateClass}>
              <label>
                Tên lớp *
                <input type="text" value={newClassName}
                  onChange={e => setNewClassName(e.target.value)}
                  placeholder="VD: Lớp CNTT K20A" required autoFocus />
              </label>
              <p style={{ margin: '8px 0 16px', fontSize: '0.9rem', color: 'var(--rules-text-secondary)' }}>
                Sau khi tao lop, click vao the lop de them hoc vien va quan ly nhom.
              </p>
              <div className="form-actions">
                <button type="button" onClick={() => { setShowClassModal(false); setNewClassName(''); }}>Hủy</button>
                <button type="submit">Tao lop</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ClassDetailPanel */}
      {selectedClass && (
        <ClassDetailPanel
          cls={selectedClass}
          token={token}
          onClose={() => setSelectedClass(null)}
          onChanged={() => { loadClasses(currentPage); if (onClassChanged) onClassChanged(token); }}
        />
      )}
      </div>
    </div>
  );
}

// =========================================================
// ClassDetailPanel — tabbed panel for a class
// =========================================================
function ClassDetailPanel({ cls, token, onClose, onChanged }) {
  const [activeTab, setActiveTab] = useState('students'); // 'students' | 'groups'
  const [classData, setClassData] = useState(cls);
  const pendingRef = useRef(false); // Chan race condition voi realtime updates

  return (
    <div className="rules-modal-backdrop">
      <div className="rules-modal" style={{ maxWidth: 800 }}>
        <div className="rules-modal-header">
          <h3>Lớp "{classData.ten_lop}"</h3>
          <button className="rules-modal-close" onClick={onClose}>×</button>
        </div>

        <div style={{ padding: '16px' }}>
          <div className="ai-analytics-tabs">
            <button className={`tab-btn ${activeTab === 'students' ? 'active' : ''}`} onClick={() => setActiveTab('students')}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                <circle cx="12" cy="7" r="4"/>
              </svg>
              Hoc vien ({classData.so_luong_sv || 0})
            </button>
            <button className={`tab-btn ${activeTab === 'groups' ? 'active' : ''}`} onClick={() => setActiveTab('groups')}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                <circle cx="9" cy="7" r="4"/>
                <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
                <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
              </svg>
              Nhóm ({classData.so_luong_nhom || 0})
            </button>
          </div>

          {activeTab === 'students' ? (
            <StudentTab cls={classData} token={token} onChanged={onChanged} />
          ) : (
            <GroupTab cls={classData} token={token} onChanged={onChanged} />
          )}
        </div>

        <div className="rules-modal-footer">
          <button type="button" onClick={onClose} className="btn-cancel">Đóng</button>
        </div>
      </div>
    </div>
  );
}

// =========================================================
// StudentTab — manage students in a class
// =========================================================
function StudentTab({ cls, token, onChanged }) {
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showPickerModal, setShowPickerModal] = useState(false);
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [bulkFile, setBulkFile] = useState(null);
  const [bulkResult, setBulkResult] = useState(null);
  const [bulkError, setBulkError] = useState(null);
  const [bulkLoading, setBulkLoading] = useState(false);
  const pendingRef = useRef(false);

  const loadStudents = useCallback(async () => {
    if (pendingRef.current) return;
    setLoading(true);
    try {
      const res = await listClassStudents(cls.id, token);
      setStudents(res.data.students || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [cls.id, token]);

  useEffect(() => { loadStudents(); }, [loadStudents]);

  const handleRemoveStudent = async (student) => {
    if (!window.confirm(`Xoá học viên "${student.ten}" khỏi lớp?`)) return;
    try {
      await removeStudentFromClass(cls.id, student.id, token);
      loadStudents();
      onChanged();
    } catch (e) {
      alert('Lỗi xoá học viên: ' + (e.response?.data?.detail || e.message));
    }
  };

  const handleImpersonate = async (student) => {
    if (!window.confirm(`Đăng nhập vào tài khoản "${student.ten}"?`)) return;
    try {
      const res = await impersonateUser(student.id, token);
      // Dispatch event de App.js xu ly impersonate thay vi reload trang
      window.dispatchEvent(new CustomEvent('auth:impersonate', {
        detail: {
          token: res.data.access_token,
          role: res.data.vai_tro,
          pages: res.data.allowed_pages || []
        }
      }));
    } catch (err) {
      alert('Đăng nhập thất bại: ' + (err.response?.data?.detail || err.message));
    }
  };

  const handleBulkImport = async () => {
    if (!bulkFile) { alert('Vui lòng chọn file .xlsx'); return; }
    setBulkLoading(true);
    setBulkError(null);
    setBulkResult(null);
    try {
      const res = await bulkImportClassStudents(cls.id, bulkFile, token);
      setBulkResult(res.data);
      setBulkFile(null);
      loadStudents();
      onChanged();
    } catch (err) {
      setBulkError(err.response?.data?.detail || err.message);
    } finally {
      setBulkLoading(false);
    }
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <p className="help-text">
          Si so toi da <strong style={{ color: 'var(--rules-text-accent)' }}>{MAX_STUDENTS_PER_CLASS}</strong> hoc vien.
        </p>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button className="secondary-btn" onClick={() => setShowBulkModal(true)}>
            Nhap file .xlsx
          </button>
          <button className="primary-btn" onClick={() => setShowPickerModal(true)}>
            + Thêm học viên
          </button>
        </div>
      </div>

      {loading ? (
        <div className="ai-empty-state">Dang tai hoc vien...</div>
      ) : students.length === 0 ? (
        <div className="ai-empty-state" style={{ padding: '40px' }}>
          <p>Chua co hoc vien nao trong lop.</p>
        </div>
      ) : (
        <div className="users-table-container" style={{ maxHeight: '400px', overflowY: 'auto' }}>
          <table className="users-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Tên</th>
                <th>Email</th>
                <th>Thao tac</th>
              </tr>
            </thead>
            <tbody>
              {students.map(s => (
                <tr key={s.id}>
                  <td>{s.id}</td>
                  <td>
                    <div className="user-name-cell">
                      <div className="user-avatar">{(s.ten || 'S').charAt(0).toUpperCase()}</div>
                      <span className="user-name">{s.ten}</span>
                    </div>
                  </td>
                  <td style={{ color: 'var(--rules-text-muted)' }}>{s.email || '—'}</td>
                  <td>
                    <div className="user-actions">
                      <button className="btn-login" onClick={() => handleImpersonate(s)}>Đăng nhập</button>
                      <button className="btn-delete" onClick={() => handleRemoveStudent(s)}>Xóa</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showPickerModal && (
        <StudentPickerModal
          cls={cls}
          token={token}
          onClose={() => setShowPickerModal(false)}
          onAdded={() => { loadStudents(); onChanged(); }}
        />
      )}

      {showBulkModal && (
        <div className="rules-modal-backdrop" style={{ zIndex: 1100 }}>
          <div className="rules-modal" style={{ maxWidth: 520 }}>
            <div className="rules-modal-header">
              <h3>Nhập hàng loạt học viên từ file .xlsx</h3>
              <button className="rules-modal-close" onClick={() => { setShowBulkModal(false); setBulkFile(null); setBulkResult(null); setBulkError(null); }}>×</button>
            </div>
            <div style={{ padding: '20px' }}>
              <p className="help-text" style={{ marginBottom: '16px' }}>
                File can co cot <strong>"Mã SV"</strong>. Tài khoản tạo ra sẽ có mật khẩu <strong>111111</strong> và yêu cầu đổi mật khẩu khi đăng nhập lần đầu.
              </p>
              <div
                className={`bulk-dropzone ${bulkFile ? 'drag-over' : ''}`}
                onClick={() => document.getElementById('bulk-student-input').click()}
                onDragOver={e => { e.preventDefault(); e.currentTarget.classList.add('drag-over'); }}
                onDragLeave={e => e.currentTarget.classList.remove('drag-over')}
                onDrop={e => {
                  e.preventDefault();
                  e.currentTarget.classList.remove('drag-over');
                  const f = e.dataTransfer.files[0];
                  if (f && f.name.endsWith('.xlsx')) setBulkFile(f);
                }}
              >
                <input id="bulk-student-input" type="file" accept=".xlsx" style={{ display: 'none' }}
                  onChange={e => { const f = e.target.files[0]; if (f) setBulkFile(f); }} />
                {bulkFile ? (
                  <p style={{ color: 'var(--rules-text-accent)', fontWeight: 600 }}>{bulkFile.name}</p>
                ) : (
                  <>
                    <div className="bulk-dropzone-icon">📄</div>
                    <p>Keo tha file .xlsx hoac click de chon</p>
                  </>
                )}
                <p className="hint">Chi ho tro dinh dang .xlsx</p>
              </div>

              {bulkResult && <div className="import-result success"><p>{bulkResult.message}</p></div>}
              {bulkError && <div className="import-result error"><p>{bulkError}</p></div>}

              <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '16px' }}>
                <button className="secondary-btn" onClick={() => setShowBulkModal(false)}>Huy</button>
                <button className="primary-btn" onClick={handleBulkImport} disabled={!bulkFile || bulkLoading}>
                  {bulkLoading ? 'Đang xử lý...' : 'Nhập'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// =========================================================
// StudentPickerModal — chọn từ danh sách SV chưa thuộc lớp nào
// =========================================================
function StudentPickerModal({ cls, token, onClose, onAdded }) {
  const [pickerStudents, setPickerStudents] = useState([]);
  const [pickerLoading, setPickerLoading] = useState(false);
  const [pickerSearch, setPickerSearch] = useState('');
  const [pickerSelected, setPickerSelected] = useState(new Set());
  const [pickerAdding, setPickerAdding] = useState(false);
  const [pickerError, setPickerError] = useState(null);
  const debounceRef = useRef(null);

  const loadPickerStudents = useCallback(async (search) => {
    setPickerLoading(true);
    setPickerError(null);
    try {
      const res = await fetchUnassignedStudents(cls.id, search, token);
      setPickerStudents(res.data.students || []);
    } catch (e) {
      setPickerError(e.response?.data?.detail || e.message);
      setPickerStudents([]);
    } finally {
      setPickerLoading(false);
    }
  }, [cls.id, token]);

  useEffect(() => { loadPickerStudents(''); }, [loadPickerStudents]);

  const handleSearchChange = (val) => {
    setPickerSearch(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => loadPickerStudents(val), 300);
  };

  const toggleOne = (id) => {
    setPickerSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const allCurrentSelected = pickerStudents.length > 0 && pickerStudents.every(s => pickerSelected.has(s.id));
  const toggleAllCurrent = () => {
    setPickerSelected(prev => {
      const next = new Set(prev);
      if (allCurrentSelected) {
        pickerStudents.forEach(s => next.delete(s.id));
      } else {
        pickerStudents.forEach(s => next.add(s.id));
      }
      return next;
    });
  };

  const handleAdd = async () => {
    if (pickerSelected.size === 0) return;
    setPickerAdding(true);
    setPickerError(null);
    const ids = Array.from(pickerSelected);
    let has401 = false;
    let errorMessages = [];

    for (const id of ids) {
      try {
        await addStudentToClass(cls.id, id, token);
      } catch (err) {
        if (err.response?.status === 401) {
          has401 = true;
          break;
        } else {
          errorMessages.push(err.response?.data?.detail || err.message);
        }
      }
    }

    setPickerAdding(false);

    if (has401) {
      setPickerError('Phiên đăng nhập hết hạn. Vui lòng đăng nhập lại.');
      return;
    }

    if (errorMessages.length > 0) {
      setPickerError(errorMessages[0] + (errorMessages.length > 1 ? ` (+${errorMessages.length - 1} lỗi khác)` : ''));
    }

    // Thành công - reload picker + clear selection
    onAdded();
    setPickerSelected(new Set());
    loadPickerStudents(pickerSearch);
  };

  return (
    <div className="rules-modal-backdrop" style={{ zIndex: 1100 }}>
      <div className="rules-modal" style={{ maxWidth: 720 }}>
        <div className="rules-modal-header">
          <h3>Thêm học viên vào lớp "{cls.ten_lop}"</h3>
          <button className="rules-modal-close" onClick={onClose}>×</button>
        </div>
        <div style={{ padding: '20px' }}>
          <p className="help-text" style={{ marginBottom: '16px' }}>
            Chọn từ danh sách sinh viên chưa thuộc lớp học nào. Tick chọn rồi nhấn "Thêm vào lớp".
          </p>

          <div className="ai-filter-bar">
            <input
              type="text"
              placeholder="Tìm kiếm theo tên..."
              value={pickerSearch}
              onChange={e => handleSearchChange(e.target.value)}
              autoFocus
            />
            <span className="help-text" style={{ whiteSpace: 'nowrap' }}>
              {pickerLoading ? 'Đang tải...' : `${pickerStudents.length} học viên`}
            </span>
          </div>

          {pickerError && <div className="import-result error" style={{ marginBottom: '12px' }}>{pickerError}</div>}

          {pickerStudents.length === 0 && !pickerLoading ? (
            <div className="ai-empty-state" style={{ padding: '40px' }}>
              <p>Không có học viên nào chưa thuộc lớp.</p>
            </div>
          ) : (
            <div className="users-table-container" style={{ maxHeight: '400px', overflowY: 'auto' }}>
              <table className="users-table">
                <thead>
                  <tr>
                    <th style={{ width: '40px' }}>
                      <input
                        type="checkbox"
                        checked={allCurrentSelected}
                        onChange={toggleAllCurrent}
                        title="Chon tat ca tren trang"
                      />
                    </th>
                    <th>ID</th>
                    <th>Tên</th>
                    <th>Email</th>
                  </tr>
                </thead>
                <tbody>
                  {pickerStudents.map(s => (
                    <tr key={s.id}
                      style={{ background: pickerSelected.has(s.id) ? 'var(--rules-btn-hover-bg)' : 'transparent', cursor: 'pointer' }}
                      onClick={() => toggleOne(s.id)}>
                      <td style={{ textAlign: 'center' }}>
                        <input
                          type="checkbox"
                          checked={pickerSelected.has(s.id)}
                          onChange={() => toggleOne(s.id)}
                          onClick={e => e.stopPropagation()}
                        />
                      </td>
                      <td>{s.id}</td>
                      <td>{s.ten}</td>
                      <td style={{ color: 'var(--rules-text-muted)' }}>{s.email || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="form-actions">
            <span className="help-text">
              Đã chọn: <strong style={{ color: 'var(--rules-text-accent)' }}>{pickerSelected.size}</strong>
            </span>
            <button type="button" onClick={onClose} className="btn-cancel">Đóng</button>
            <button
              type="button"
              className="primary-btn"
              onClick={handleAdd}
              disabled={pickerSelected.size === 0 || pickerAdding}
            >
              {pickerAdding ? 'Đang thêm...' : `Thêm vào lớp${pickerSelected.size > 0 ? ` (${pickerSelected.size})` : ''}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// =========================================================
// GroupTab — manage groups in a class (refactored from GroupManagementPanel)
// =========================================================
function GroupTab({ cls, token, onChanged }) {
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupDesc, setNewGroupDesc] = useState('');
  const [editingGroup, setEditingGroup] = useState(null);
  const [editName, setEditName] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [openGroupId, setOpenGroupId] = useState(null);
  const [groupMembers, setGroupMembers] = useState([]);
  const [groupStudents, setGroupStudents] = useState([]);
  const [memberLoading, setMemberLoading] = useState(false);
  const pendingRef = useRef(false);

  const loadGroups = useCallback(async () => {
    if (pendingRef.current) return;
    setLoading(true);
    try {
      const res = await listClassGroups(cls.id, token);
      setGroups(res.data.groups || []);
    } catch (e) {
      console.error('Load groups failed', e);
      setGroups([]);
    } finally {
      setLoading(false);
    }
  }, [cls.id, token]);

  useEffect(() => { loadGroups(); }, [loadGroups]);

  const handleCreateGroup = async (e) => {
    e.preventDefault();
    if (!newGroupName.trim()) return;
    try {
      await createClassGroup(cls.id, { ten_nhom: newGroupName.trim(), mo_ta: newGroupDesc.trim() || null }, token);
      setNewGroupName(''); setNewGroupDesc(''); setShowCreateGroup(false);
      loadGroups(); onChanged();
    } catch (err) {
      alert('Lỗi tạo nhóm: ' + (err.response?.data?.detail || err.message));
    }
  };

  const handleStartEdit = (g) => {
    setEditingGroup(g);
    setEditName(g.ten_nhom || g.ten_phong || '');
    setEditDesc(g.mo_ta || '');
  };

  const handleSaveEdit = async () => {
    if (!editingGroup) return;
    try {
      await updateGroup(editingGroup.id, { ten_nhom: editName.trim() || undefined, mo_ta: editDesc }, token);
      setEditingGroup(null);
      loadGroups(); onChanged();
    } catch (err) {
      alert('Lỗi cập nhật: ' + (err.response?.data?.detail || err.message));
    }
  };

  const handleDeleteGroup = async (g) => {
    if (!window.confirm(`Xoá nhóm "${g.ten_nhom || g.ten_phong}"?\n\nTất cả thành viên trong nhóm sẽ bị gỡ khỏi nhóm (vẫn thuộc lớp).`)) return;
    try {
      await deleteGroup(g.id, token);
      if (openGroupId === g.id) { setOpenGroupId(null); setGroupMembers([]); setGroupStudents([]); }
      loadGroups(); onChanged();
    } catch (err) {
      alert('Lỗi xoá nhóm: ' + (err.response?.data?.detail || err.message));
    }
  };

  const handleOpenGroup = async (g) => {
    if (openGroupId === g.id) { setOpenGroupId(null); setGroupMembers([]); setGroupStudents([]); return; }
    pendingRef.current = true;
    setOpenGroupId(g.id);
    setMemberLoading(true);
    try {
      const memRes = await listGroupMembers(g.id, token);
      setGroupMembers(memRes.data.members || []);
      const stuRes = await listClassStudents(cls.id, token);
      const allStu = stuRes.data.students || [];
      const inThisGroup = new Set((memRes.data.members || []).map(m => m.id));
      // Lay member_ids tu groups state (da co san) thay vi goi API moi
      const otherGroupMembers = new Set();
      groups.forEach(grp => {
        if (grp.id !== g.id && grp.member_ids) {
          grp.member_ids.forEach(id => otherGroupMembers.add(id));
        }
      });
      setGroupStudents(allStu.filter(s => !inThisGroup.has(s.id) && !otherGroupMembers.has(s.id)));
    } catch (err) {
      console.error('Load group members failed', err);
      setGroupMembers([]); setGroupStudents([]);
    } finally {
      setMemberLoading(false);
      pendingRef.current = false;
    }
  };

  const handleAddMember = async (studentId) => {
    if (!openGroupId) return;
    pendingRef.current = true;
    try {
      await addGroupMember(openGroupId, studentId, token);
      const memRes = await listGroupMembers(openGroupId, token);
      setGroupMembers(memRes.data.members || []);
      loadGroups(); onChanged();
      setGroupStudents(prev => prev.filter(s => s.id !== studentId));
    } catch (err) {
      if (err.response?.status === 401) {
        alert('Phiên đăng nhập hết hạn. Vui lòng đăng nhập lại.');
      } else {
        alert('Lỗi thêm thành viên: ' + (err.response?.data?.detail || err.message));
      }
    } finally {
      pendingRef.current = false;
    }
  };

  const handleRemoveMember = async (studentId, studentName) => {
    if (!openGroupId) return;
    if (!window.confirm(`Gỡ "${studentName}" khỏi nhóm?`)) return;
    pendingRef.current = true;
    try {
      await removeGroupMember(openGroupId, studentId, token);
      const memRes = await listGroupMembers(openGroupId, token);
      setGroupMembers(memRes.data.members || []);
      loadGroups(); onChanged();
    } catch (err) {
      if (err.response?.status === 401) {
        alert('Phiên đăng nhập hết hạn. Vui lòng đăng nhập lại.');
      } else {
        alert('Lỗi gỡ thành viên: ' + (err.response?.data?.detail || err.message));
      }
    } finally {
      pendingRef.current = false;
    }
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <p className="help-text">
          Moi lop co the tao nhieu nhom, moi nhom toi da <strong style={{ color: 'var(--rules-text-accent)' }}>{MAX_MEMBERS_PER_GROUP}</strong> sinh vien.
        </p>
        <button className="primary-btn" onClick={() => setShowCreateGroup(true)}>
          + Tao nhom
        </button>
      </div>

      {loading ? (
        <div className="ai-empty-state">Dang tai nhom...</div>
      ) : groups.length === 0 ? (
        <div className="ai-empty-state" style={{ padding: '40px' }}>
          <p>Lớp chưa có nhóm nào. Nhấn "+ Tạo nhóm" để bắt đầu.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: '400px', overflowY: 'auto' }}>
          {groups.map(g => (
            <div key={g.id} className="group-card">
              <div className="group-card-header">
                <div className="group-card-title">
                  <span>👥</span>
                  {editingGroup && editingGroup.id === g.id ? (
                    <input type="text" value={editName} onChange={e => setEditName(e.target.value)}
                      style={{ padding: '6px 10px', borderRadius: '6px', border: '1px solid var(--rules-input-border)', background: 'var(--rules-input-bg)', color: 'var(--rules-input-text)' }} autoFocus />
                  ) : (
                    <strong>{g.ten_nhom || g.ten_phong}</strong>
                  )}
                  <span className={`role-badge ${g.so_thanh_vien >= MAX_MEMBERS_PER_GROUP ? 'student' : 'teacher'}`}>
                    {g.so_thanh_vien}/{MAX_MEMBERS_PER_GROUP}
                  </span>
                </div>
                <div className="group-actions">
                  {editingGroup && editingGroup.id === g.id ? (
                    <><button onClick={handleSaveEdit} className="primary-btn" style={{ padding: '6px 12px' }}>Lưu</button><button onClick={() => setEditingGroup(null)} className="secondary-btn" style={{ padding: '6px 12px' }}>Hủy</button></>
                  ) : (
                    <><button onClick={() => handleOpenGroup(g)} className="btn-edit">{openGroupId === g.id ? 'Đóng' : 'Thành viên'}</button><button onClick={() => handleStartEdit(g)} className="btn-edit">Sửa</button><button onClick={() => handleDeleteGroup(g)} className="btn-delete">Xóa</button></>
                  )}
                </div>
              </div>

              {openGroupId === g.id && (
                <div className="group-detail">
                  {memberLoading ? (
                    <div className="ai-empty-state">Dang tai thanh vien...</div>
                  ) : (
                    <>
                      <h4 style={{ color: 'var(--rules-text)', margin: '0 0 10px' }}>Thành viên ({groupMembers.length}/{MAX_MEMBERS_PER_GROUP})</h4>
                      {groupMembers.length === 0 ? (
                        <p style={{ color: 'var(--rules-text-muted)', fontSize: '0.85rem' }}>Chua co thanh vien nao.</p>
                      ) : (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '12px' }}>
                          {groupMembers.map(m => (
                            <div key={m.id} className="member-chip">
                              <span>👤 {m.ten}</span>
                              <button onClick={() => handleRemoveMember(m.id, m.ten)} className="member-chip-remove">×</button>
                            </div>
                          ))}
                        </div>
                      )}
                      {g.so_thanh_vien < MAX_MEMBERS_PER_GROUP && (
                        <div>
                          <h4 style={{ color: 'var(--rules-text)', margin: '12px 0 10px' }}>+ Thêm sinh viên (chưa ở nhóm nào trong lớp)</h4>
                          {groupStudents.length === 0 ? (
                            <p style={{ color: 'var(--rules-text-muted)', fontSize: '0.85rem' }}>Tất cả sinh viên trong lớp đã thuộc nhóm khác.</p>
                          ) : (
                            <div className="users-table-container" style={{ borderRadius: '8px' }}>
                              <table className="users-table">
                                <tbody>
                                  {groupStudents.map(s => (
                                    <tr key={s.id}>
                                      <td>{s.ten}</td>
                                      <td style={{ color: 'var(--rules-text-muted)' }}>{s.email || '—'}</td>
                                      <td>
                                        <button onClick={() => handleAddMember(s.id)} className="btn-login">Thêm</button>
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {showCreateGroup && (
        <div className="rules-modal-backdrop" style={{ zIndex: 1100 }}>
          <div className="rules-modal" style={{ maxWidth: 420 }}>
            <div className="rules-modal-header">
              <h3>Tao nhom moi</h3>
              <button className="rules-modal-close" onClick={() => { setShowCreateGroup(false); setNewGroupName(''); setNewGroupDesc(''); }}>×</button>
            </div>
            <form className="rules-form" onSubmit={handleCreateGroup}>
              <label>Tên nhóm * <input type="text" value={newGroupName} onChange={e => setNewGroupName(e.target.value)} placeholder="VD: Nhóm 1, Nhóm Arduino" required autoFocus /></label>
              <label>Mô tả (tùy chọn) <input type="text" value={newGroupDesc} onChange={e => setNewGroupDesc(e.target.value)} placeholder="VD: Nhóm làm đồ án nhúng" /></label>
              <div className="form-actions">
                <button type="button" onClick={() => { setShowCreateGroup(false); setNewGroupName(''); setNewGroupDesc(''); }}>Hủy</button>
                <button type="submit">Tạo</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
