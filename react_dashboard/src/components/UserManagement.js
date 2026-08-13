import React, { useEffect, useState, useCallback } from 'react';
import { fetchUsers, createUser, updateUser, deleteUser, impersonateUser, bulkImportUsers } from '../services';
import { useCrudVersion, useRealtimePolling } from '../context/RealtimeProvider';

const PAGE_SIZE = 15;

export default function UserManagement({ token, onBack }) {
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(false);
    // Realtime: tu refetch khi co CRUD user tu tab khac
    const usersVersion = useCrudVersion('user');
    const [formVisible, setFormVisible] = useState(false);
    const [editUserId, setEditUserId] = useState(null);
    const [bulkImportVisible, setBulkImportVisible] = useState(false);
    const [bulkFile, setBulkFile] = useState(null);
    const [bulkResult, setBulkResult] = useState(null);
    const [bulkError, setBulkError] = useState(null);
    const [bulkLoading, setBulkLoading] = useState(false);
    const [showPassword, setShowPassword] = useState(false);

    // Pagination & filter state
    const [currentPage, setCurrentPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [totalUsers, setTotalUsers] = useState(0);
    const [roleFilter, setRoleFilter] = useState('');
    const [searchQuery, setSearchQuery] = useState('');

    const [formData, setFormData] = useState({
        ten: '', email: '', password: '', vai_tro: 'student',
    });

    const loadUsers = useCallback(async (page = 1) => {
        setLoading(true);
        try {
            const params = { page, page_size: PAGE_SIZE };
            if (roleFilter) params.vai_tro = roleFilter;
            if (searchQuery.trim()) params.search = searchQuery.trim();
            const res = await fetchUsers(token, params);
            const data = res.data;
            setUsers(data.users || []);
            setTotalUsers(data.total || 0);
            setTotalPages(data.total_pages || 1);
            setCurrentPage(data.page || 1);
        } catch (err) {
            console.error('Load users failed', err);
        } finally {
            setLoading(false);
        }
    }, [token, roleFilter, searchQuery]);

    useEffect(() => {
        loadUsers(1);
    }, [loadUsers]);

    // Realtime: refetch khi user CRUD event den, hoac WS disconnected: polling 30s
    const refetchFirstPage = useCallback(() => loadUsers(1), [loadUsers]);
    useRealtimePolling(usersVersion, refetchFirstPage, [refetchFirstPage]);

    const resetForm = () => {
        setFormData({ ten: '', email: '', password: '', vai_tro: 'student' });
        setEditUserId(null);
    };

    const handleOpenAdd = () => { resetForm(); setFormVisible(true); };

    const handleEdit = (user) => {
        setFormData({ ten: user.ten, email: user.email, password: '', vai_tro: user.vai_tro });
        setEditUserId(user.id);
        setFormVisible(true);
    };

    const handleDelete = async (user) => {
        if (!window.confirm(`Xoa nguoi dung "${user.ten}"?`)) return;
        try {
            await deleteUser(user.id, token);
            await loadUsers(currentPage);
        } catch (err) {
            alert('Xoa that bai: ' + (err.response?.data?.detail || err.message));
        }
    };

    const handleImpersonate = async (user) => {
        if (!window.confirm(`Dang nhap vao tai khoan "${user.ten}"?\n\nBan se can dang xuat va dang nhap lai de quay ve tai khoan cua minh.`)) return;
        try {
            const res = await impersonateUser(user.id, token);
            localStorage.setItem('token', res.data.access_token);
            localStorage.setItem('userRole', res.data.vai_tro);
            localStorage.setItem('allowedPages', JSON.stringify(res.data.allowed_pages || []));
            window.location.reload();
        } catch (err) {
            alert('Dang nhap that bai: ' + (err.response?.data?.detail || err.message));
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!formData.ten || !formData.email) {
            alert('Vui long nhap ten va email');
            return;
        }
        if (!editUserId && !formData.password) {
            alert('Vui long nhap mat khau cho nguoi dung moi');
            return;
        }
        try {
            if (editUserId) {
                const updateData = { ten: formData.ten, email: formData.email, vai_tro: formData.vai_tro };
                if (formData.password) updateData.password = formData.password;
                await updateUser(editUserId, updateData, token);
            } else {
                await createUser({ ten: formData.ten, email: formData.email, password: formData.password, vai_tro: formData.vai_tro }, token);
            }
            resetForm();
            setFormVisible(false);
            await loadUsers(currentPage);
        } catch (err) {
            alert('Loi: ' + (err.response?.data?.detail || err.message));
        }
    };

    const handleBulkImport = async () => {
        if (!bulkFile) { alert('Vui long chon file .xlsx'); return; }
        setBulkLoading(true);
        setBulkError(null);
        setBulkResult(null);
        try {
            const res = await bulkImportUsers(bulkFile, null, token);
            setBulkResult(res.data);
            setBulkFile(null);
            await loadUsers(1);
        } catch (err) {
            setBulkError(err.response?.data?.detail || err.message);
        } finally {
            setBulkLoading(false);
        }
    };

    const handleDownloadTemplate = () => {
        const a = document.createElement('a');
        a.href = '/template_import.xlsx';
        a.download = 'template_import.xlsx';
        a.click();
    };

    // Debounce search
    const [searchTimeout, setSearchTimeout] = useState(null);
    useEffect(() => {
        return () => {
            if (searchTimeout) clearTimeout(searchTimeout);
        };
    }, [searchTimeout]);
    const handleSearchInput = (e) => {
        const val = e.target.value;
        setSearchQuery(val);
        if (searchTimeout) clearTimeout(searchTimeout);
        setSearchTimeout(setTimeout(() => loadUsers(1), 400));
    };

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
                    <button className="secondary-btn" onClick={() => setBulkImportVisible(true)}>Nhập file .xlsx</button>
                    <button className="primary-btn" onClick={handleOpenAdd}>+ Thêm người dùng</button>
                </div>
            </div>

            {/* Filter bar */}
            <div className="filter-bar">
                <input
                    type="text"
                    placeholder="Tim kiem theo ten..."
                    value={searchQuery}
                    onChange={handleSearchInput}
                />
                <select value={roleFilter} onChange={e => setRoleFilter(e.target.value)}>
                    <option value="">Tat ca vai tro</option>
                    <option value="admin">Admin</option>
                    <option value="teacher">Teacher</option>
                    <option value="student">Student</option>
                </select>
            </div>

            {loading ? (
                <div className="loading">Dang tai...</div>
            ) : (
                <>
                <div className="table-container">
                    <table className="user-table">
                        <thead>
                            <tr>
                                <th>ID</th>
                                <th>Ten</th>
                                <th>Email</th>
                                <th>Vai tro</th>
                                <th>Ngay tao</th>
                                <th>Thao tac</th>
                            </tr>
                        </thead>
                        <tbody>
                            {users.map((user) => (
                                <tr key={user.id}>
                                    <td>{user.id}</td>
                                    <td>
                                        {user.ten}
                                        {user.phai_doi_mat_khau ? (
                                            <span className="badge-new" style={{ marginLeft: 6 }}>Can doi MK</span>
                                        ) : null}
                                    </td>
                                    <td>{user.email}</td>
                                    <td>
                                        <span className={`role-badge ${user.vai_tro}`}>
                                            {user.vai_tro === 'admin' ? 'Admin' : user.vai_tro === 'teacher' ? 'Teacher' : 'Student'}
                                        </span>
                                    </td>
                                    <td>{user.ngay_tao ? new Date(user.ngay_tao).toLocaleDateString('vi-VN') : '-'}</td>
                                    <td>
                                        <button className="btn-edit" onClick={() => handleEdit(user)}>Sua</button>
                                        <button className="btn-delete" onClick={() => handleDelete(user)}>Xoa</button>
                                        <button className="btn-login" onClick={() => handleImpersonate(user)} style={{ marginLeft: '5px', background: '#10b981', color: 'white', border: 'none', padding: '5px 10px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}>Dang nhap</button>
                                    </td>
                                </tr>
                            ))}
                            {users.length === 0 && (
                                <tr><td colSpan="6" className="no-data">Chua co nguoi dung nao</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>

                {/* Pagination */}
                {totalPages > 1 && (
                    <div className="pagination-bar">
                        <span className="pagination-info">
                            Hien thi {users.length} / {totalUsers} nguoi dung — Trang {currentPage} / {totalPages}
                        </span>
                        <div className="pagination-controls">
                            <button onClick={() => loadUsers(1)} disabled={currentPage === 1}>«</button>
                            <button onClick={() => loadUsers(currentPage - 1)} disabled={currentPage === 1}>‹</button>
                            <div className="page-numbers">
                                {pageNumbers.map(p => (
                                    <button key={p} className={`page-num ${p === currentPage ? 'active' : ''}`} onClick={() => loadUsers(p)}>{p}</button>
                                ))}
                            </div>
                            <button onClick={() => loadUsers(currentPage + 1)} disabled={currentPage === totalPages}>›</button>
                            <button onClick={() => loadUsers(totalPages)} disabled={currentPage === totalPages}>»</button>
                        </div>
                    </div>
                )}
                </>
            )}

            {/* Modal: Add / Edit user */}
            {formVisible && (
                <div className="modal-backdrop">
                    <div className="modal-content" style={{ maxWidth: 500 }}>
                        <div className="modal-header">
                            <h3>{editUserId ? 'Sua nguoi dung' : 'Them nguoi dung'}</h3>
                            <button onClick={() => { resetForm(); setFormVisible(false); }}>×</button>
                        </div>
                        <form className="rule-form" onSubmit={handleSubmit}>
                            <label>
                                Ten nguoi dung *
                                <input type="text" value={formData.ten}
                                    onChange={e => setFormData({ ...formData, ten: e.target.value })}
                                    placeholder="Nguyen Van A" required />
                            </label>
                            <label>
                                Email *
                                <input type="email" value={formData.email}
                                    onChange={e => setFormData({ ...formData, email: e.target.value })}
                                    placeholder="user@example.com" required />
                            </label>
                            <label>
                                Mat khau {editUserId ? '(de trong neu khong doi)' : '*'}
                                <div style={{ position: 'relative' }}>
                                    <input
                                        type={showPassword ? 'text' : 'password'}
                                        value={formData.password}
                                        onChange={e => setFormData({ ...formData, password: e.target.value })}
                                        placeholder={editUserId ? '••••••••' : 'Nhap mat khau'}
                                        required={!editUserId}
                                        style={{ paddingRight: '40px', width: '100%' }}
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowPassword(v => !v)}
                                        style={{
                                            position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)',
                                            background: 'none', border: 'none', cursor: 'pointer', padding: '4px',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        }}
                                        title={showPassword ? 'An mat khau' : 'Hien mat khau'}
                                    >
                                        {showPassword ? (
                                            <svg width="18" height="18" viewBox="0 0 16 16" version="1.1" xmlns="http://www.w3.org/2000/svg">
                                                <path fill="#64748b" d="M8 3.5C5.5 3.5 3.8 5.6 2.1 7.5c0.2 0.3.2 0.7 0 1L3 9.3c0.1.2.2.3.4.3.1 0 .2 0 .3-.1C5.8 8.1 6.9 7.5 8 7.5s2.2.6 4.3 1.9c.1.1.2.1.3.1.1 0 .3-.1.4-.3L13.9 8.5c.2-.3.2-.7 0-1C12.2 5.6 10.5 3.5 8 3.5zM5.5 5.7c0.4-.2.9-.2 1.3-.2s0.9 0 1.3.2C6.4 6.2 5.5 7.5 5.5 8.5c0 1-.9 2.3-1.6 3.1-.4.2-.9.2-1.3.2s-.9 0-1.3-.2C1.9 10.8 1 9.5 1 8.5S2.3 5.7 5.5 5.7zM8 9.5c1.1 0 2-.4 2-.4s-.9.4-2 .4-2-.4-2-.4.9.4 2 .4z"/>
                                                <path fill="#64748b" d="M8 1.5C3.3 1.5 1 5.6 1 5.6s.8 2.5 4 3.6c0 0-.4-.6-.4-1.4 0-1.5 1.2-2.8 2.8-2.8s2.8 1.3 2.8 2.8c0 .8-.2 1.4-.4 1.4 3.2-1.1 4-3.6 4-3.6S12.7 1.5 8 1.5z"/>
                                            </svg>
                                        ) : (
                                            <svg width="18" height="18" viewBox="0 0 16 16" version="1.1" xmlns="http://www.w3.org/2000/svg">
                                                <path fill="#64748b" d="M8 3.5C5.5 3.5 3.8 5.6 2.1 7.5c0.2 0.3.2 0.7 0 1L3 9.3c0.1.2.2.3.4.3.1 0 .2 0 .3-.1C5.8 8.1 6.9 7.5 8 7.5s2.2.6 4.3 1.9c.1.1.2.1.3.1.1 0 .3-.1.4-.3L13.9 8.5c.2-.3.2-.7 0-1C12.2 5.6 10.5 3.5 8 3.5zM5.5 5.7c0.4-.2.9-.2 1.3-.2s0.9 0 1.3.2C6.4 6.2 5.5 7.5 5.5 8.5c0 1-.9 2.3-1.6 3.1-.4.2-.9.2-1.3.2s-.9 0-1.3-.2C1.9 10.8 1 9.5 1 8.5S2.3 5.7 5.5 5.7zM8 9.5c1.1 0 2-.4 2-.4s-.9.4-2 .4-2-.4-2-.4.9.4 2 .4z"/>
                                                <path fill="#64748b" d="M8 1.5C3.3 1.5 1 5.6 1 5.6s.8 2.5 4 3.6c0 0-.4-.6-.4-1.4 0-1.5 1.2-2.8 2.8-2.8s2.8 1.3 2.8 2.8c0 .8-.2 1.4-.4 1.4 3.2-1.1 4-3.6 4-3.6S12.7 1.5 8 1.5zM3.5 5.7c0.5-.3 1.3-.3 1.3-.3s-0.5.9-.5 1.6c0 .7.2 1.1.2 1.1l-1.1.2c0 0-.3-.5-.3-1.2 0-.8.4-1.4.4-1.4z"/>
                                            </svg>
                                        )}
                                    </button>
                                </div>
                            </label>
                            <label>
                                Vai tro
                                <select value={formData.vai_tro}
                                    onChange={e => setFormData({ ...formData, vai_tro: e.target.value })}>
                                    <option value="student">Student</option>
                                    <option value="teacher">Teacher</option>
                                    <option value="admin">Admin</option>
                                </select>
                            </label>
                            <div className="form-actions">
                                <button type="submit">{editUserId ? 'Cap nhat' : 'Tao nguoi dung'}</button>
                                <button type="button" onClick={() => { resetForm(); setFormVisible(false); }}>Huy</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Modal: Bulk import xlsx */}
            {bulkImportVisible && (
                <div className="modal-backdrop">
                    <div className="modal-content" style={{ maxWidth: 520 }}>
                        <div className="modal-header">
                            <h3>Nhap hang loat tu file .xlsx</h3>
                            <button onClick={() => { setBulkImportVisible(false); setBulkFile(null); setBulkResult(null); setBulkError(null); }}>×</button>
                        </div>
                        <div style={{ padding: '4px 0' }}>
                            <p style={{ fontSize: '13px', color: '#94a3b8', marginBottom: '16px' }}>
                                File can co cot <strong>"Ma SV"</strong>. Tai khoan tao ra se co mat khau mac dinh la <strong>111111</strong> va yeu cau doi mat khau khi dang nhap lan dau.
                            </p>
                            <div
                                className={`bulk-import-dropzone ${bulkFile ? 'drag-over' : ''}`}
                                onClick={() => document.getElementById('bulk-file-input').click()}
                                onDragOver={e => { e.preventDefault(); e.currentTarget.classList.add('drag-over'); }}
                                onDragLeave={e => e.currentTarget.classList.remove('drag-over')}
                                onDrop={e => {
                                    e.preventDefault();
                                    e.currentTarget.classList.remove('drag-over');
                                    const f = e.dataTransfer.files[0];
                                    if (f && f.name.endsWith('.xlsx')) setBulkFile(f);
                                }}
                            >
                                <input id="bulk-file-input" type="file" accept=".xlsx" style={{ display: 'none' }}
                                    onChange={e => { const f = e.target.files[0]; if (f) setBulkFile(f); }} />
                                {bulkFile ? (
                                    <p style={{ color: '#22d3ee', fontWeight: 600 }}>
                                        {bulkFile.name}
                                    </p>
                                ) : (
                                    <>
                                        <p style={{ fontSize: '18px', margin: '0 0 4px' }}>📄</p>
                                        <p>Kéo thả file .xlsx hoặc click để chọn</p>
                                    </>
                                )}
                                <p className="file-hint">Chi ho tro dinh dang .xlsx</p>
                            </div>

                            {bulkResult && (
                                <div className="bulk-import-result success">
                                    <p style={{ margin: 0 }}>{bulkResult.message}</p>
                                </div>
                            )}
                            {bulkError && (
                                <div className="bulk-import-result error">
                                    <p style={{ margin: 0 }}>{bulkError}</p>
                                </div>
                            )}

                            <div style={{ display: 'flex', gap: '10px', justifyContent: 'space-between', marginTop: '12px' }}>
                                <button className="secondary-btn" onClick={handleDownloadTemplate}
                                    style={{ fontSize: '13px', padding: '8px 14px' }}>
                                    Tai file mau
                                </button>
                                <div style={{ display: 'flex', gap: '10px' }}>
                                    <button className="secondary-btn" onClick={() => { setBulkImportVisible(false); setBulkFile(null); setBulkResult(null); setBulkError(null); }}>Huy</button>
                                    <button className="primary-btn" onClick={handleBulkImport}
                                        disabled={!bulkFile || bulkLoading}
                                        style={{ minWidth: '100px' }}>
                                        {bulkLoading ? 'Dang xu ly...' : 'Nhap'}
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
