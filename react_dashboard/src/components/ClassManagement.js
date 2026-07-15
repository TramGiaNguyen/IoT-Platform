import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  fetchClasses, createClass, deleteClass, fetchUsers, createUser, impersonateUser,
  listClassStudents, addStudentToClass, removeStudentFromClass,
  listClassGroups, createClassGroup, updateGroup, deleteGroup,
  listGroupMembers, addGroupMember, removeGroupMember,
  bulkImportClassStudents, fetchUnassignedStudents,
} from '../services';
import { useCrudVersion } from '../context/RealtimeProvider';

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
  const groupMembersVersion = useCrudVersion('group_member');

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
  useEffect(() => {
    if (classesVersion > 0) loadClasses(currentPage);
  }, [classesVersion]);

  useEffect(() => {
    if (groupsVersion > 0 && selectedClass) {
      listClassGroups(selectedClass.id).then(r => setGroups(r.data.groups || r.data || [])).catch(() => {});
    }
  }, [groupsVersion]);

  useEffect(() => {
    if (classStudentsVersion > 0 && selectedClass) {
      listClassStudents(selectedClass.id).then(r => setStudents(r.data.students || r.data || [])).catch(() => {});
    }
  }, [classStudentsVersion]);

  useEffect(() => {
    if (groupMembersVersion > 0 && selectedGroup) {
      listGroupMembers(selectedGroup.id).then(r => setGroupMembers(r.data.members || r.data || [])).catch(() => {});
    }
  }, [groupMembersVersion]);

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
    <div className="rules-container">
      <div className="rules-header">
        <button type="button" className="back-btn-ghost" onClick={onBack}>← Quay lại</button>
        <div className="rules-actions">
          <button className="primary-btn" onClick={() => setShowClassModal(true)}>+ Thêm lớp</button>
        </div>
      </div>

      {loading ? (
        <div className="loading">Đang tải...</div>
      ) : (
        <>
        <div className="devices-grid neo-grid">
          {classes.map(cls => (
            <div
              key={cls.id}
              className="neo-card class-card-clickable"
              onClick={() => setSelectedClass(cls)}
            >
              <div className="card-header">
                <div className="icon-wrap" style={{ fontSize: '24px' }}>🏫</div>
                <div className="card-meta">
                  <h3>{cls.ten_lop}</h3>
                  <p>Mã lớp: {cls.id}</p>
                </div>
                <button className="delete-device-btn" onClick={(e) => handleDeleteClass(cls, e)} title="Xóa lớp">×</button>
              </div>
              <div className="card-body">
                <div className="metric-row">
                  <span className="label">Giáo viên phụ trách</span>
                  <span className="value">{cls.giao_vien_ten || <span className="cm-empty-teacher">Chưa phân công</span>}</span>
                </div>
                <div className="metric-row">
                  <span className="label">Sĩ số</span>
                  <span className="value">
                    <span className={`role-badge ${(cls.so_luong_sv || 0) >= MAX_STUDENTS_PER_CLASS ? 'student' : 'teacher'}`}>
                      {cls.so_luong_sv || 0} / {MAX_STUDENTS_PER_CLASS}
                    </span>
                  </span>
                </div>
                <div className="metric-row" style={{ borderBottom: 'none' }}>
                  <span className="label">Số nhóm</span>
                  <span className="value">
                    <span className="role-badge teacher">{cls.so_luong_nhom || 0}</span>
                  </span>
                </div>
                <div className="metric-row" style={{ borderBottom: 'none' }}>
                  <span className="label">Ngày tạo</span>
                  <span className="value">{cls.ngay_tao ? new Date(cls.ngay_tao).toLocaleDateString('vi-VN') : '—'}</span>
                </div>
              </div>
              <div className="card-footer" style={{ justifyContent: 'center' }}>
                <button
                  onClick={(e) => { e.stopPropagation(); setSelectedClass(cls); }}
                  className="cm-btn-detail"
                >
                  Xem chi tiết
                </button>
              </div>
            </div>
          ))}
          {classes.length === 0 && (
            <div className="empty-state" style={{ width: '100%', gridColumn: '1 / -1' }}>
              <p>Chưa có lớp nào được tạo. Nhấn "+ Thêm lớp" để bắt đầu.</p>
            </div>
          )}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="pagination-bar">
            <span className="pagination-info">
              Hiển thị {classes.length} / {totalClasses} lớp — Trang {currentPage} / {totalPages}
            </span>
            <div className="pagination-controls">
              <button onClick={() => loadClasses(1)} disabled={currentPage === 1}>«</button>
              <button onClick={() => loadClasses(currentPage - 1)} disabled={currentPage === 1}>‹</button>
              <div className="page-numbers">
                {pageNumbers.map(p => (
                  <button key={p} className={`page-num ${p === currentPage ? 'active' : ''}`} onClick={() => loadClasses(p)}>{p}</button>
                ))}
              </div>
              <button onClick={() => loadClasses(currentPage + 1)} disabled={currentPage === totalPages}>›</button>
              <button onClick={() => loadClasses(totalPages)} disabled={currentPage === totalPages}>»</button>
            </div>
          </div>
        )}
        </>
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
                <input type="text" value={newClassName}
                  onChange={e => setNewClassName(e.target.value)}
                  placeholder="VD: Lớp CNTT K20A" required autoFocus />
              </label>
              <p className="cm-help-text" style={{ margin: '8px 0 16px' }}>
                Sau khi tạo lớp, click vào thẻ lớp để thêm học viên và quản lý nhóm.
              </p>
              <div className="form-actions">
                <button type="submit">Tạo lớp</button>
                <button type="button" onClick={() => { setShowClassModal(false); setNewClassName(''); }}>Huỷ</button>
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
  );
}

// =========================================================
// ClassDetailPanel — tabbed panel for a class
// =========================================================
function ClassDetailPanel({ cls, token, onClose, onChanged }) {
  const [activeTab, setActiveTab] = useState('students'); // 'students' | 'groups'
  const [classData, setClassData] = useState(cls);

  return (
    <div className="modal-backdrop">
      <div className="modal-content class-detail-panel">
        <div className="modal-header">
          <h3>Lớp "{classData.ten_lop}"</h3>
          <button onClick={onClose}>×</button>
        </div>

        {/* Tabs */}
        <div className="class-detail-tabs">
          <button className={activeTab === 'students' ? 'active' : ''} onClick={() => setActiveTab('students')}>
            👤 Học viên ({classData.so_luong_sv || 0})
          </button>
          <button className={activeTab === 'groups' ? 'active' : ''} onClick={() => setActiveTab('groups')}>
            👥 Nhóm ({classData.so_luong_nhom || 0})
          </button>
        </div>

        {activeTab === 'students' ? (
          <StudentTab cls={classData} token={token} onChanged={onChanged} />
        ) : (
          <GroupTab cls={classData} token={token} onChanged={onChanged} />
        )}

        <div className="form-actions" style={{ marginTop: '16px' }}>
          <button type="button" onClick={onClose}>Đóng</button>
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

  const loadStudents = useCallback(async () => {
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
      localStorage.setItem('token', res.data.access_token);
      localStorage.setItem('userRole', res.data.vai_tro);
      localStorage.setItem('allowedPages', JSON.stringify(res.data.allowed_pages || []));
      window.location.reload();
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
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
        <p className="cm-help-text">
          Sĩ số tối đa <strong>{MAX_STUDENTS_PER_CLASS}</strong> học viên.
        </p>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button className="secondary-btn" onClick={() => setShowBulkModal(true)} style={{ fontSize: '13px', padding: '8px 14px' }}>
            Nhập file .xlsx
          </button>
          <button className="primary-btn" onClick={() => setShowPickerModal(true)} style={{ fontSize: '13px', padding: '8px 14px' }}>
            + Thêm học viên
          </button>
        </div>
      </div>

      {loading ? (
        <div className="loading">Đang tải học viên...</div>
      ) : students.length === 0 ? (
        <div className="empty-state"><p>Chưa có học viên nào trong lớp.</p></div>
      ) : (
        <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
          <table className="table cm-table" style={{ width: '100%' }}>
            <thead>
              <tr>
                <th>ID</th>
                <th>Tên</th>
                <th>Email</th>
                <th>Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {students.map(s => (
                <tr key={s.id}>
                  <td>{s.id}</td>
                  <td>{s.ten}</td>
                  <td className="cm-table-muted">{s.email || '—'}</td>
                  <td className="cm-table-actions">
                    <button className="btn-edit" onClick={() => handleImpersonate(s)} style={{ fontSize: '11px', padding: '4px 8px' }}>Đăng nhập</button>
                    <button className="btn-delete" onClick={() => handleRemoveStudent(s)} style={{ fontSize: '11px', padding: '4px 8px' }}>Xoá</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal: Picker chọn học viên chưa thuộc lớp nào */}
      {showPickerModal && (
        <StudentPickerModal
          cls={cls}
          token={token}
          onClose={() => setShowPickerModal(false)}
          onAdded={() => { loadStudents(); onChanged(); }}
        />
      )}

      {/* Modal: Bulk import xlsx */}
      {showBulkModal && (
        <div className="modal-backdrop" style={{ zIndex: 1100 }}>
          <div className="modal-content" style={{ maxWidth: 520 }}>
            <div className="modal-header">
              <h3>Nhập hàng loạt học viên từ file .xlsx</h3>
              <button onClick={() => { setShowBulkModal(false); setBulkFile(null); setBulkResult(null); setBulkError(null); }}>×</button>
            </div>
            <p className="cm-bulk-helper">
              File cần có cột <strong>"Mã SV"</strong>. Tài khoản tạo ra sẽ có mật khẩu <strong>111111</strong> và yêu cầu đổi mật khẩu khi đăng nhập lần đầu.
            </p>
            <div
              className="bulk-import-dropzone cm-bulk-dropzone"
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
                <p className="cm-bulk-file-name">{bulkFile.name}</p>
              ) : (
                <>
                  <p style={{ fontSize: '18px', margin: '0 0 4px' }}>📄</p>
                  <p>Kéo thả file .xlsx hoặc click để chọn</p>
                </>
              )}
              <p className="file-hint">Chỉ hỗ trợ định dạng .xlsx</p>
            </div>
            {bulkResult && <div className="bulk-import-result success"><p style={{ margin: 0 }}>{bulkResult.message}</p></div>}
            {bulkError && <div className="bulk-import-result error"><p style={{ margin: 0 }}>{bulkError}</p></div>}
            <div className="cm-bulk-footer">
              <button className="secondary-btn" onClick={() => setShowBulkModal(false)}>Huỷ</button>
              <button className="primary-btn" onClick={handleBulkImport} disabled={!bulkFile || bulkLoading}>
                {bulkLoading ? 'Đang xử lý...' : 'Nhập'}
              </button>
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
    const results = await Promise.allSettled(
      ids.map(id => addStudentToClass(cls.id, id, token))
    );
    const failed = results.filter(r => r.status === 'rejected');
    setPickerAdding(false);

    if (failed.length > 0) {
      const first = failed[0].reason;
      setPickerError((first?.response?.data?.detail || first?.message || 'Lỗi') +
        (failed.length > 1 ? ` (${failed.length}/${ids.length} thất bại)` : ''));
    }

    const successCount = ids.length - failed.length;
    if (successCount > 0) {
      onAdded();
      // Reload picker (bỏ những SV đã thêm) + clear selection
      setPickerSelected(new Set());
      loadPickerStudents(pickerSearch);
    }
  };

  return (
    <div className="modal-backdrop" style={{ zIndex: 1100 }}>
      <div className="modal-content" style={{ maxWidth: 720 }}>
        <div className="modal-header">
          <h3>Thêm học viên vào lớp "{cls.ten_lop}"</h3>
          <button onClick={onClose}>×</button>
        </div>
        <p className="cm-bulk-picker-helper">
          Chọn từ danh sách sinh viên chưa thuộc lớp học nào. Tick chọn rồi nhấn "Thêm vào lớp".
        </p>

        <div className="filter-bar" style={{ marginBottom: '12px' }}>
          <input
            type="text"
            placeholder="Tìm kiếm theo tên..."
            value={pickerSearch}
            onChange={e => handleSearchChange(e.target.value)}
            autoFocus
          />
          <span className="cm-help-text" style={{ whiteSpace: 'nowrap' }}>
            {pickerLoading ? 'Đang tải...' : `${pickerStudents.length} học viên`}
          </span>
        </div>

        {pickerError && <div className="bulk-import-result error" style={{ marginBottom: '8px' }}><p style={{ margin: 0 }}>{pickerError}</p></div>}

        {pickerStudents.length === 0 && !pickerLoading ? (
          <div className="empty-state"><p>Không có học viên nào chưa thuộc lớp.</p></div>
        ) : (
          <div className="cm-picker-table-wrap">
            <table className="table" style={{ width: '100%' }}>
              <thead className="cm-picker-thead">
                <tr>
                  <th>
                    <input
                      type="checkbox"
                      checked={allCurrentSelected}
                      onChange={toggleAllCurrent}
                      title="Chọn tất cả trên trang"
                    />
                  </th>
                  <th>ID</th>
                  <th>Ten</th>
                  <th>Email</th>
                </tr>
              </thead>
              <tbody>
                {pickerStudents.map(s => (
                  <tr key={s.id}
                      className={pickerSelected.has(s.id) ? 'cm-picker-row-selected' : ''}
                      onClick={() => toggleOne(s.id)}>
                    <td className="cm-picker-cell-center">
                      <input
                        type="checkbox"
                        checked={pickerSelected.has(s.id)}
                        onChange={() => toggleOne(s.id)}
                        onClick={e => e.stopPropagation()}
                      />
                    </td>
                    <td>{s.id}</td>
                    <td>{s.ten}</td>
                    <td className="cm-picker-muted">{s.email || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="form-actions" style={{ marginTop: '14px' }}>
          <span className="cm-picker-count">
            Đã chọn: <strong>{pickerSelected.size}</strong>
          </span>
          <button type="button" onClick={onClose}>Đóng</button>
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

  const loadGroups = useCallback(async () => {
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
    setOpenGroupId(g.id);
    setMemberLoading(true);
    try {
      const memRes = await listGroupMembers(g.id, token);
      setGroupMembers(memRes.data.members || []);
      const stuRes = await listClassStudents(cls.id, token);
      const allStu = stuRes.data.students || [];
      const inThisGroup = new Set((memRes.data.members || []).map(m => m.id));
      const otherGroupMembers = new Set();
      for (const grp of groups) {
        if (grp.id !== g.id) {
          try {
            const r = await listGroupMembers(grp.id, token);
            (r.data.members || []).forEach(m => otherGroupMembers.add(m.id));
          } catch (_) {}
        }
      }
      setGroupStudents(allStu.filter(s => !inThisGroup.has(s.id) && !otherGroupMembers.has(s.id)));
    } catch (err) {
      console.error('Load group members failed', err);
      setGroupMembers([]); setGroupStudents([]);
    } finally {
      setMemberLoading(false);
    }
  };

  const handleAddMember = async (studentId) => {
    if (!openGroupId) return;
    try {
      await addGroupMember(openGroupId, studentId, token);
      const memRes = await listGroupMembers(openGroupId, token);
      setGroupMembers(memRes.data.members || []);
      loadGroups(); onChanged();
      setGroupStudents(prev => prev.filter(s => s.id !== studentId));
    } catch (err) {
      alert('Lỗi thêm thành viên: ' + (err.response?.data?.detail || err.message));
    }
  };

  const handleRemoveMember = async (studentId, studentName) => {
    if (!openGroupId) return;
    if (!window.confirm(`Gỡ "${studentName}" khỏi nhóm?`)) return;
    try {
      await removeGroupMember(openGroupId, studentId, token);
      const memRes = await listGroupMembers(openGroupId, token);
      setGroupMembers(memRes.data.members || []);
      loadGroups(); onChanged();
    } catch (err) {
      alert('Lỗi gỡ thành viên: ' + (err.response?.data?.detail || err.message));
    }
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
        <p className="cm-help-text">
          Mỗi lớp có thể tạo nhiều nhóm, mỗi nhóm tối đa <strong>{MAX_MEMBERS_PER_GROUP}</strong> sinh viên.
        </p>
        <button className="primary-btn" onClick={() => setShowCreateGroup(true)} style={{ fontSize: '13px', padding: '8px 14px' }}>
          + Tạo nhóm
        </button>
      </div>

      {loading ? (
        <div className="loading">Đang tải nhóm...</div>
      ) : groups.length === 0 ? (
        <div className="empty-state"><p>Lớp chưa có nhóm nào. Nhấn "+ Tạo nhóm" để bắt đầu.</p></div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: '400px', overflowY: 'auto' }}>
          {groups.map(g => (
            <div key={g.id} className="neo-card" style={{ padding: '12px' }}>
              <div className="cm-group-row">
                <div className="cm-group-row-left">
                  <span className="cm-group-row-icon">👥</span>
                  {editingGroup && editingGroup.id === g.id ? (
                    <input type="text" value={editName} onChange={e => setEditName(e.target.value)}
                      className="cm-group-row-edit-input" autoFocus />
                  ) : (
                    <strong className="cm-group-row-name">{g.ten_nhom || g.ten_phong}</strong>
                  )}
                  <span className={`role-badge ${g.so_thanh_vien >= MAX_MEMBERS_PER_GROUP ? 'student' : 'teacher'}`}>
                    {g.so_thanh_vien}/{MAX_MEMBERS_PER_GROUP}
                  </span>
                </div>
                <div className="cm-group-actions">
                  {editingGroup && editingGroup.id === g.id ? (
                    <><button onClick={handleSaveEdit} className="cm-btn-save">Lưu</button><button onClick={() => setEditingGroup(null)} className="cm-btn-secondary">Huỷ</button></>
                  ) : (
                    <><button onClick={() => handleOpenGroup(g)} className="cm-btn-info">{openGroupId === g.id ? 'Đóng' : 'Thành viên'}</button><button onClick={() => handleStartEdit(g)} className="cm-btn-secondary">Sửa</button><button onClick={() => handleDeleteGroup(g)} className="cm-btn-danger">Xoá</button></>
                  )}
                </div>
              </div>

              {openGroupId === g.id && (
                <div className="cm-group-detail">
                  {memberLoading ? (
                    <div className="loading">Đang tải thành viên...</div>
                  ) : (
                    <>
                      <h4>Thành viên ({groupMembers.length}/{MAX_MEMBERS_PER_GROUP})</h4>
                      {groupMembers.length === 0 ? (
                        <p className="cm-group-empty-text">Chưa có thành viên nào.</p>
                      ) : (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '12px' }}>
                          {groupMembers.map(m => (
                            <div key={m.id} className="cm-member-chip">
                              <span>👤 {m.ten}</span>
                              <button onClick={() => handleRemoveMember(m.id, m.ten)} className="cm-member-chip-remove">×</button>
                            </div>
                          ))}
                        </div>
                      )}
                      {g.so_thanh_vien < MAX_MEMBERS_PER_GROUP && (
                        <div>
                          <h4>+ Thêm sinh viên (chưa ở nhóm nào trong lớp)</h4>
                          {groupStudents.length === 0 ? (
                            <p className="cm-group-empty-text">Tất cả sinh viên trong lớp đã thuộc nhóm khác.</p>
                          ) : (
                            <div className="cm-add-student-table">
                              <table className="table" style={{ width: '100%' }}>
                                <tbody>
                                  {groupStudents.map(s => (
                                    <tr key={s.id}>
                                      <td>{s.ten}</td>
                                      <td className="cm-cell-muted">{s.email || '—'}</td>
                                      <td className="cm-cell-right">
                                        <button onClick={() => handleAddMember(s.id)} className="cm-btn-add-student">Thêm</button>
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
        <div className="modal-backdrop" style={{ zIndex: 1100 }}>
          <div className="modal-content" style={{ maxWidth: 420 }}>
            <div className="modal-header">
              <h3>Tạo nhóm mới</h3>
              <button onClick={() => { setShowCreateGroup(false); setNewGroupName(''); setNewGroupDesc(''); }}>×</button>
            </div>
            <form className="rule-form" onSubmit={handleCreateGroup}>
              <label>Tên nhóm * <input type="text" value={newGroupName} onChange={e => setNewGroupName(e.target.value)} placeholder="VD: Nhóm 1, Nhóm Arduino" required autoFocus /></label>
              <label>Mô tả (tuỳ chọn) <input type="text" value={newGroupDesc} onChange={e => setNewGroupDesc(e.target.value)} placeholder="VD: Nhóm làm đồ án nhúng" /></label>
              <div className="form-actions">
                <button type="submit">Tạo</button>
                <button type="button" onClick={() => { setShowCreateGroup(false); setNewGroupName(''); setNewGroupDesc(''); }}>Huỷ</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
