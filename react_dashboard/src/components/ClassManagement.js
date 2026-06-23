import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  fetchClasses, createClass, deleteClass, fetchUsers, createUser, impersonateUser,
  listClassStudents, addStudentToClass, removeStudentFromClass,
  listClassGroups, createClassGroup, updateGroup, deleteGroup,
  listGroupMembers, addGroupMember, removeGroupMember,
  bulkImportClassStudents, fetchUnassignedStudents,
} from '../services';

const MAX_STUDENTS_PER_CLASS = 100;
const MAX_MEMBERS_PER_GROUP = 5;
const PAGE_SIZE = 15;

export default function ClassManagement({ token, onBack, onClassChanged }) {
  const [classes, setClasses] = useState([]);
  const [loading, setLoading] = useState(false);

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
      alert('Loi tao lop: ' + (e.response?.data?.detail || e.message));
    }
  };

  const handleDeleteClass = async (cls, e) => {
    e.stopPropagation();
    if (!window.confirm(`Xoa lop "${cls.ten_lop}"?\n\nCac nhom + thanh vien nhom cua lop cung se bi xoa theo.`)) return;
    try {
      await deleteClass(cls.id, token);
      if (selectedClass?.id === cls.id) setSelectedClass(null);
      loadClasses(currentPage);
    } catch (e) {
      alert('Loi xoa lop: ' + (e.response?.data?.detail || e.message));
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
        <div>
          <h2>Quan ly lop hoc</h2>
          <p className="muted">Tao lop, them hoc vien va phan nhom lam viec</p>
        </div>
        <div className="rules-actions">
          <button className="primary-btn" onClick={() => setShowClassModal(true)}>+ Them lop</button>
          <button className="secondary-btn" onClick={onBack}>Quay lai</button>
        </div>
      </div>

      {loading ? (
        <div className="loading">Dang tai...</div>
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
                  <p>Ma lop: {cls.id}</p>
                </div>
                <button className="delete-device-btn" onClick={(e) => handleDeleteClass(cls, e)} title="Xoa lop">×</button>
              </div>
              <div className="card-body">
                <div className="metric-row">
                  <span className="label">Giao vien phu trach</span>
                  <span className="value">{cls.giao_vien_ten || <span style={{ color: '#6b7280', fontSize: '14px' }}>Chua phan cong</span>}</span>
                </div>
                <div className="metric-row">
                  <span className="label">Si so</span>
                  <span className="value">
                    <span className={`role-badge ${(cls.so_luong_sv || 0) >= MAX_STUDENTS_PER_CLASS ? 'student' : 'teacher'}`}>
                      {cls.so_luong_sv || 0} / {MAX_STUDENTS_PER_CLASS}
                    </span>
                  </span>
                </div>
                <div className="metric-row" style={{ borderBottom: 'none' }}>
                  <span className="label">So nhom</span>
                  <span className="value">
                    <span className="role-badge teacher">{cls.so_luong_nhom || 0}</span>
                  </span>
                </div>
                <div className="metric-row" style={{ borderBottom: 'none' }}>
                  <span className="label">Ngay tao</span>
                  <span className="value">{cls.ngay_tao ? new Date(cls.ngay_tao).toLocaleDateString('vi-VN') : '—'}</span>
                </div>
              </div>
              <div className="card-footer" style={{ justifyContent: 'center' }}>
                <button
                  onClick={(e) => { e.stopPropagation(); setSelectedClass(cls); }}
                  style={{
                    background: '#6366f1', color: 'white', border: 'none',
                    padding: '6px 16px', borderRadius: '4px', cursor: 'pointer',
                    fontSize: '13px', fontWeight: '600',
                  }}
                >
                  Xem chi tiet
                </button>
              </div>
            </div>
          ))}
          {classes.length === 0 && (
            <div className="empty-state" style={{ width: '100%', gridColumn: '1 / -1' }}>
              <p>Chua co lop nao duoc tao. Nhan "+ Them lop" de bat dau.</p>
            </div>
          )}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="pagination-bar">
            <span className="pagination-info">
              Hien thi {classes.length} / {totalClasses} lop — Trang {currentPage} / {totalPages}
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

      {/* Modal: Them lop */}
      {showClassModal && (
        <div className="modal-backdrop">
          <div className="modal-content" style={{ maxWidth: 420 }}>
            <div className="modal-header">
              <h3>Them lop hoc</h3>
              <button onClick={() => { setShowClassModal(false); setNewClassName(''); }}>×</button>
            </div>
            <form className="rule-form" onSubmit={handleCreateClass}>
              <label>
                Ten lop *
                <input type="text" value={newClassName}
                  onChange={e => setNewClassName(e.target.value)}
                  placeholder="VD: Lop CNTT K20A" required autoFocus />
              </label>
              <p style={{ fontSize: '12px', color: '#9ca3af', margin: '8px 0 16px' }}>
                Sau khi tao lop, click vao the lop de them hoc vien va quan ly nhom.
              </p>
              <div className="form-actions">
                <button type="submit">Tao lop</button>
                <button type="button" onClick={() => { setShowClassModal(false); setNewClassName(''); }}>Huy</button>
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
          <h3>Lop "{classData.ten_lop}"</h3>
          <button onClick={onClose}>×</button>
        </div>

        {/* Tabs */}
        <div className="class-detail-tabs">
          <button className={activeTab === 'students' ? 'active' : ''} onClick={() => setActiveTab('students')}>
            👤 Hoc vien ({classData.so_luong_sv || 0})
          </button>
          <button className={activeTab === 'groups' ? 'active' : ''} onClick={() => setActiveTab('groups')}>
            👥 Nhom ({classData.so_luong_nhom || 0})
          </button>
        </div>

        {activeTab === 'students' ? (
          <StudentTab cls={classData} token={token} onChanged={onChanged} />
        ) : (
          <GroupTab cls={classData} token={token} onChanged={onChanged} />
        )}

        <div className="form-actions" style={{ marginTop: '16px' }}>
          <button type="button" onClick={onClose}>Dong</button>
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
    if (!window.confirm(`Xoa hoc vien "${student.ten}" khoi lop?`)) return;
    try {
      await removeStudentFromClass(cls.id, student.id, token);
      loadStudents();
      onChanged();
    } catch (e) {
      alert('Loi xoa hoc vien: ' + (e.response?.data?.detail || e.message));
    }
  };

  const handleImpersonate = async (student) => {
    if (!window.confirm(`Dang nhap vao tai khoan "${student.ten}"?`)) return;
    try {
      const res = await impersonateUser(student.id, token);
      localStorage.setItem('token', res.data.access_token);
      localStorage.setItem('userRole', res.data.vai_tro);
      localStorage.setItem('allowedPages', JSON.stringify(res.data.allowed_pages || []));
      window.location.reload();
    } catch (err) {
      alert('Dang nhap that bai: ' + (err.response?.data?.detail || err.message));
    }
  };

  const handleBulkImport = async () => {
    if (!bulkFile) { alert('Vui long chon file .xlsx'); return; }
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
        <p style={{ color: '#9ca3af', fontSize: '13px', margin: 0 }}>
          Si so toi da <strong>{MAX_STUDENTS_PER_CLASS}</strong> hoc vien.
        </p>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button className="secondary-btn" onClick={() => setShowBulkModal(true)} style={{ fontSize: '13px', padding: '8px 14px' }}>
            Nhap file .xlsx
          </button>
          <button className="primary-btn" onClick={() => setShowPickerModal(true)} style={{ fontSize: '13px', padding: '8px 14px' }}>
            + Them hoc vien
          </button>
        </div>
      </div>

      {loading ? (
        <div className="loading">Dang tai hoc vien...</div>
      ) : students.length === 0 ? (
        <div className="empty-state"><p>Chua co hoc vien nao trong lop.</p></div>
      ) : (
        <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
          <table className="table" style={{ width: '100%' }}>
            <thead>
              <tr>
                <th>ID</th>
                <th>Ten</th>
                <th>Email</th>
                <th>Thao tac</th>
              </tr>
            </thead>
            <tbody>
              {students.map(s => (
                <tr key={s.id} style={{ borderBottom: '1px solid #1f2a44' }}>
                  <td style={{ padding: '8px' }}>{s.id}</td>
                  <td style={{ padding: '8px' }}>{s.ten}</td>
                  <td style={{ padding: '8px', color: '#9ca3af', fontSize: '13px' }}>{s.email || '—'}</td>
                  <td style={{ padding: '8px', whiteSpace: 'nowrap' }}>
                    <button className="btn-edit" onClick={() => handleImpersonate(s)} style={{ fontSize: '11px', padding: '4px 8px' }}>Dang nhap</button>
                    <button className="btn-delete" onClick={() => handleRemoveStudent(s)} style={{ fontSize: '11px', padding: '4px 8px' }}>Xoa</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal: Picker chon hoc vien chua thuoc lop nao */}
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
              <h3>Nhap hang loat hoc vien tu file .xlsx</h3>
              <button onClick={() => { setShowBulkModal(false); setBulkFile(null); setBulkResult(null); setBulkError(null); }}>×</button>
            </div>
            <p style={{ fontSize: '13px', color: '#94a3b8', marginBottom: '16px' }}>
              File can co cot <strong>"Ma SV"</strong>. Tai khoan tao ra se co mat khau <strong>111111</strong> va yeu cau doi mat khau khi dang nhap lan dau.
            </p>
            <div
              className="bulk-import-dropzone"
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
                <p style={{ color: '#22d3ee', fontWeight: 600 }}>{bulkFile.name}</p>
              ) : (
                <>
                  <p style={{ fontSize: '18px', margin: '0 0 4px' }}>📄</p>
                  <p>Keo tha file .xlsx hoac click de chon</p>
                </>
              )}
              <p className="file-hint">Chi ho tro dinh dang .xlsx</p>
            </div>
            {bulkResult && <div className="bulk-import-result success"><p style={{ margin: 0 }}>{bulkResult.message}</p></div>}
            {bulkError && <div className="bulk-import-result error"><p style={{ margin: 0 }}>{bulkError}</p></div>}
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '12px' }}>
              <button className="secondary-btn" onClick={() => setShowBulkModal(false)}>Huy</button>
              <button className="primary-btn" onClick={handleBulkImport} disabled={!bulkFile || bulkLoading}>
                {bulkLoading ? 'Dang xu ly...' : 'Nhap'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// =========================================================
// StudentPickerModal — chon tu danh sach SV chua thuoc lop nao
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
      setPickerError((first?.response?.data?.detail || first?.message || 'Loi') +
        (failed.length > 1 ? ` (${failed.length}/${ids.length} that bai)` : ''));
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
          <h3>Them hoc vien vao lop "{cls.ten_lop}"</h3>
          <button onClick={onClose}>×</button>
        </div>
        <p style={{ fontSize: '13px', color: '#94a3b8', margin: '0 0 12px' }}>
          Chon tu danh sach sinh vien chua thuoc lop hoc nao. Tick chon roi nhan "Them vao lop".
        </p>

        <div className="filter-bar" style={{ marginBottom: '12px' }}>
          <input
            type="text"
            placeholder="Tim kiem theo ten..."
            value={pickerSearch}
            onChange={e => handleSearchChange(e.target.value)}
            autoFocus
          />
          <span style={{ color: '#9ca3af', fontSize: '13px', whiteSpace: 'nowrap' }}>
            {pickerLoading ? 'Dang tai...' : `${pickerStudents.length} hoc vien`}
          </span>
        </div>

        {pickerError && <div className="bulk-import-result error" style={{ marginBottom: '8px' }}><p style={{ margin: 0 }}>{pickerError}</p></div>}

        {pickerStudents.length === 0 && !pickerLoading ? (
          <div className="empty-state"><p>Khong co hoc vien nao chua thuoc lop.</p></div>
        ) : (
          <div style={{ maxHeight: '400px', overflowY: 'auto', border: '1px solid #1f2a44', borderRadius: '8px' }}>
            <table className="table" style={{ width: '100%' }}>
              <thead style={{ position: 'sticky', top: 0, background: '#0f172a', zIndex: 1 }}>
                <tr>
                  <th style={{ width: '40px', textAlign: 'center' }}>
                    <input
                      type="checkbox"
                      checked={allCurrentSelected}
                      onChange={toggleAllCurrent}
                      title="Chon tat ca tren trang"
                    />
                  </th>
                  <th>ID</th>
                  <th>Ten</th>
                  <th>Email</th>
                </tr>
              </thead>
              <tbody>
                {pickerStudents.map(s => (
                  <tr key={s.id} style={{ borderBottom: '1px solid #1f2a44', cursor: 'pointer', background: pickerSelected.has(s.id) ? 'rgba(34, 211, 238, 0.08)' : 'transparent' }}
                      onClick={() => toggleOne(s.id)}>
                    <td style={{ padding: '8px', textAlign: 'center' }}>
                      <input
                        type="checkbox"
                        checked={pickerSelected.has(s.id)}
                        onChange={() => toggleOne(s.id)}
                        onClick={e => e.stopPropagation()}
                      />
                    </td>
                    <td style={{ padding: '8px' }}>{s.id}</td>
                    <td style={{ padding: '8px' }}>{s.ten}</td>
                    <td style={{ padding: '8px', color: '#9ca3af', fontSize: '13px' }}>{s.email || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="form-actions" style={{ marginTop: '14px' }}>
          <span style={{ color: '#9ca3af', fontSize: '13px', marginRight: 'auto' }}>
            Da chon: <strong style={{ color: '#22d3ee' }}>{pickerSelected.size}</strong>
          </span>
          <button type="button" onClick={onClose}>Dong</button>
          <button
            type="button"
            className="primary-btn"
            onClick={handleAdd}
            disabled={pickerSelected.size === 0 || pickerAdding}
          >
            {pickerAdding ? 'Dang them...' : `Them vao lop${pickerSelected.size > 0 ? ` (${pickerSelected.size})` : ''}`}
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
      alert('Loi tao nhom: ' + (err.response?.data?.detail || err.message));
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
      alert('Loi cap nhat: ' + (err.response?.data?.detail || err.message));
    }
  };

  const handleDeleteGroup = async (g) => {
    if (!window.confirm(`Xoa nhom "${g.ten_nhom || g.ten_phong}"?\n\nTat ca thanh vien trong nhom se bi go khoi nhom (van thuoc lop).`)) return;
    try {
      await deleteGroup(g.id, token);
      if (openGroupId === g.id) { setOpenGroupId(null); setGroupMembers([]); setGroupStudents([]); }
      loadGroups(); onChanged();
    } catch (err) {
      alert('Loi xoa nhom: ' + (err.response?.data?.detail || err.message));
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
      alert('Loi them thanh vien: ' + (err.response?.data?.detail || err.message));
    }
  };

  const handleRemoveMember = async (studentId, studentName) => {
    if (!openGroupId) return;
    if (!window.confirm(`Go "${studentName}" khoi nhom?`)) return;
    try {
      await removeGroupMember(openGroupId, studentId, token);
      const memRes = await listGroupMembers(openGroupId, token);
      setGroupMembers(memRes.data.members || []);
      loadGroups(); onChanged();
    } catch (err) {
      alert('Loi go thanh vien: ' + (err.response?.data?.detail || err.message));
    }
  };

  const btnPrimary = { background: '#6366f1', color: 'white', border: 'none', padding: '6px 12px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px', fontWeight: '500' };
  const btnSecondary = { background: '#4b5563', color: 'white', border: 'none', padding: '6px 12px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px', fontWeight: '500' };
  const btnInfo = { background: '#22d3ee', color: '#0f172a', border: 'none', padding: '6px 12px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px', fontWeight: '500' };
  const btnDanger = { background: '#ef4444', color: 'white', border: 'none', padding: '6px 12px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px', fontWeight: '500' };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
        <p style={{ color: '#9ca3af', fontSize: '13px', margin: 0 }}>
          Moi lop co the tao nhieu nhom, moi nhom toi da <strong>{MAX_MEMBERS_PER_GROUP}</strong> sinh vien.
        </p>
        <button className="primary-btn" onClick={() => setShowCreateGroup(true)} style={{ fontSize: '13px', padding: '8px 14px' }}>
          + Tao nhom
        </button>
      </div>

      {loading ? (
        <div className="loading">Dang tai nhom...</div>
      ) : groups.length === 0 ? (
        <div className="empty-state"><p>Lop chua co nhom nao. Nhan "+ Tao nhom" de bat dau.</p></div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: '400px', overflowY: 'auto' }}>
          {groups.map(g => (
            <div key={g.id} className="neo-card" style={{ padding: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1 }}>
                  <span style={{ fontSize: '20px' }}>👥</span>
                  {editingGroup && editingGroup.id === g.id ? (
                    <input type="text" value={editName} onChange={e => setEditName(e.target.value)}
                      style={{ flex: 1, padding: '6px 8px', background: '#0f172a', border: '1px solid #1f2a44', borderRadius: '8px', color: '#e2e8f0' }} autoFocus />
                  ) : (
                    <strong style={{ fontSize: '15px' }}>{g.ten_nhom || g.ten_phong}</strong>
                  )}
                  <span className={`role-badge ${g.so_thanh_vien >= MAX_MEMBERS_PER_GROUP ? 'student' : 'teacher'}`}>
                    {g.so_thanh_vien}/{MAX_MEMBERS_PER_GROUP}
                  </span>
                </div>
                <div style={{ display: 'flex', gap: '6px' }}>
                  {editingGroup && editingGroup.id === g.id ? (
                    <><button onClick={handleSaveEdit} style={btnPrimary}>Luu</button><button onClick={() => setEditingGroup(null)} style={btnSecondary}>Huy</button></>
                  ) : (
                    <><button onClick={() => handleOpenGroup(g)} style={btnInfo}>{openGroupId === g.id ? 'Dong' : 'Thanh vien'}</button><button onClick={() => handleStartEdit(g)} style={btnSecondary}>Sua</button><button onClick={() => handleDeleteGroup(g)} style={btnDanger}>Xoa</button></>
                  )}
                </div>
              </div>

              {openGroupId === g.id && (
                <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px solid #1f2a44' }}>
                  {memberLoading ? (
                    <div className="loading">Dang tai thanh vien...</div>
                  ) : (
                    <>
                      <h4 style={{ fontSize: '13px', color: '#9ca3af', marginBottom: '8px' }}>Thanh vien ({groupMembers.length}/{MAX_MEMBERS_PER_GROUP})</h4>
                      {groupMembers.length === 0 ? (
                        <p style={{ color: '#6b7280', fontSize: '13px' }}>Chua co thanh vien nao.</p>
                      ) : (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '12px' }}>
                          {groupMembers.map(m => (
                            <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'rgba(99, 102, 241, 0.15)', border: '1px solid #6366f1', borderRadius: '16px', padding: '4px 10px', fontSize: '13px' }}>
                              <span>👤 {m.ten}</span>
                              <button onClick={() => handleRemoveMember(m.id, m.ten)} style={{ background: 'transparent', border: 'none', color: '#fca5a5', cursor: 'pointer', fontSize: '14px', padding: 0, marginLeft: '4px' }}>×</button>
                            </div>
                          ))}
                        </div>
                      )}
                      {g.so_thanh_vien < MAX_MEMBERS_PER_GROUP && (
                        <div>
                          <h4 style={{ fontSize: '13px', color: '#9ca3af', marginBottom: '8px' }}>+ Them sinh vien (chua o nhom nao trong lop)</h4>
                          {groupStudents.length === 0 ? (
                            <p style={{ color: '#6b7280', fontSize: '13px' }}>Tat ca sinh vien trong lop da thuoc nhom khac.</p>
                          ) : (
                            <div style={{ maxHeight: '160px', overflowY: 'auto' }}>
                              <table className="table" style={{ width: '100%' }}>
                                <tbody>
                                  {groupStudents.map(s => (
                                    <tr key={s.id} style={{ borderBottom: '1px solid #1f2a44' }}>
                                      <td style={{ padding: '6px 8px', fontSize: '13px' }}>{s.ten}</td>
                                      <td style={{ padding: '6px 8px', fontSize: '12px', color: '#9ca3af' }}>{s.email || '—'}</td>
                                      <td style={{ padding: '6px 8px', textAlign: 'right' }}>
                                        <button onClick={() => handleAddMember(s.id)} style={{ background: '#10b981', color: 'white', border: 'none', padding: '4px 10px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}>Them</button>
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
              <h3>Tao nhom moi</h3>
              <button onClick={() => { setShowCreateGroup(false); setNewGroupName(''); setNewGroupDesc(''); }}>×</button>
            </div>
            <form className="rule-form" onSubmit={handleCreateGroup}>
              <label>Ten nhom * <input type="text" value={newGroupName} onChange={e => setNewGroupName(e.target.value)} placeholder="VD: Nhom 1, Nhom Arduino" required autoFocus /></label>
              <label>Mo ta (tuy chon) <input type="text" value={newGroupDesc} onChange={e => setNewGroupDesc(e.target.value)} placeholder="VD: Nhom lam do an nhung" /></label>
              <div className="form-actions">
                <button type="submit">Tao</button>
                <button type="button" onClick={() => { setShowCreateGroup(false); setNewGroupName(''); setNewGroupDesc(''); }}>Huy</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
