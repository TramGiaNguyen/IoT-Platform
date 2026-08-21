import React, { useEffect, useState, useCallback } from 'react';
import {
    fetchUsers, createUser, updateUser, deleteUser, impersonateUser, bulkImportUsers,
    fetchUserAssignedRooms, updateUserAssignedRooms,
    fetchRooms,
} from '../services';
import { useCrudVersion, useRealtimePolling } from '../context/RealtimeProvider';

const PAGE_SIZE = 15;

export default function UserManagement({ token, onBack, userInfo }) {
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

    // State for room assignment (admin only)
    const [myRooms, setMyRooms] = useState([]);                  // rooms owned by current admin
    const [assignedRoomIds, setAssignedRoomIds] = useState([]); // ids assigned to edited user
    const [assignmentLoading, setAssignmentLoading] = useState(false);
    const [roomSearch, setRoomSearch] = useState('');

    // Pagination & filter state
    const [currentPage, setCurrentPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [totalUsers, setTotalUsers] = useState(0);
    const [roleFilter, setRoleFilter] = useState('');
    const [searchQuery, setSearchQuery] = useState('');

    const [formData, setFormData] = useState({
        ten: '', email: '', password: '', vai_tro: 'student',
    });

    // Load admin's own rooms (for the assignment picker). Admin sees all rooms,
    // so we filter client-side by nguoi_so_huu_id === current admin id.
    const loadMyRooms = useCallback(async () => {
        try {
            const res = await fetchRooms(token);
            const all = res.data?.rooms || [];
            const adminId = userInfo?.id;
            const owned = adminId ? all.filter(r => r.nguoi_so_huu_id === adminId) : all;
            setMyRooms(owned);
        } catch (err) {
            console.error('Load my rooms failed', err);
            setMyRooms([]);
        }
    }, [token, userInfo]);

    useEffect(() => {
        if (userInfo?.id) loadMyRooms();
    }, [loadMyRooms, userInfo]);

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
        setAssignedRoomIds([]);
        setRoomSearch('');
    };

    const handleOpenAdd = () => { resetForm(); setFormVisible(true); };

    const handleEdit = async (user) => {
        setFormData({ ten: user.ten, email: user.email, password: '', vai_tro: user.vai_tro });
        setEditUserId(user.id);
        setFormVisible(true);
        // Load existing assigned rooms for this user
        setAssignmentLoading(true);
        try {
            // Prefer embedded field from list payload; fall back to API call
            const initial = Array.isArray(user.assigned_room_ids) ? user.assigned_room_ids : null;
            if (initial !== null) {
                setAssignedRoomIds(initial);
            } else {
                const res = await fetchUserAssignedRooms(user.id, token);
                setAssignedRoomIds((res.data?.rooms || []).map(r => r.id));
            }
        } catch (err) {
            console.error('Load assigned rooms failed', err);
            setAssignedRoomIds([]);
        } finally {
            setAssignmentLoading(false);
        }
    };

    const toggleAssignedRoom = (roomId) => {
        setAssignedRoomIds(prev => prev.includes(roomId)
            ? prev.filter(id => id !== roomId)
            : [...prev, roomId]);
    };

    const handleDelete = async (user) => {
        if (!window.confirm(`Xóa người dùng "${user.ten}"?`)) return;
        try {
            await deleteUser(user.id, token);
            await loadUsers(currentPage);
        } catch (err) {
            alert('Xóa thất bại: ' + (err.response?.data?.detail || err.message));
        }
    };

    const handleImpersonate = async (user) => {
        if (!window.confirm(`Đăng nhập vào tài khoản "${user.ten}"?\n\nBạn sẽ cần đăng xuất và đăng nhập lại để quay về tài khoản của mình.`)) return;
        try {
            const res = await impersonateUser(user.id, token);
            localStorage.setItem('token', res.data.access_token);
            localStorage.setItem('userRole', res.data.vai_tro);
            localStorage.setItem('allowedPages', JSON.stringify(res.data.allowed_pages || []));
            window.location.reload();
        } catch (err) {
            alert('Đăng nhập thất bại: ' + (err.response?.data?.detail || err.message));
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!formData.ten || !formData.email) {
            alert('Vui lòng nhập tên và email');
            return;
        }
        if (!editUserId && !formData.password) {
            alert('Vui lòng nhập mật khẩu cho người dùng mới');
            return;
        }
        try {
            if (editUserId) {
                const updateData = { ten: formData.ten, email: formData.email, vai_tro: formData.vai_tro };
                if (formData.password) updateData.password = formData.password;
                await updateUser(editUserId, updateData, token);
                // Sync assigned rooms if user is teacher/student
                if (formData.vai_tro === 'teacher' || formData.vai_tro === 'student') {
                    await updateUserAssignedRooms(editUserId, assignedRoomIds, token, 'view');
                } else {
                    // Clear assignments if user is no longer teacher/student
                    await updateUserAssignedRooms(editUserId, [], token, 'view');
                }
            } else {
                await createUser({ ten: formData.ten, email: formData.email, password: formData.password, vai_tro: formData.vai_tro }, token);
            }
            resetForm();
            setFormVisible(false);
            await loadUsers(currentPage);
        } catch (err) {
            alert('Lỗi: ' + (err.response?.data?.detail || err.message));
        }
    };

    const handleBulkImport = async () => {
        if (!bulkFile) { alert('Vui lòng chọn file .xlsx'); return; }
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
                                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                                <circle cx="9" cy="7" r="4"/>
                                <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
                                <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
                            </svg>
                        </div>
                        <div>
                            <h1>Quản lý Người dùng</h1>
                            <p className="ai-page-subtitle-text">Quản lý tài khoản và phân quyền người dùng</p>
                        </div>
                    </div>
                </div>
                <div className="rules-actions">
                    <button className="secondary-btn" onClick={() => setBulkImportVisible(true)}>Nhập file .xlsx</button>
                    <button className="primary-btn" onClick={handleOpenAdd}>+ Thêm người dùng</button>
                </div>
            </div>

            <div className="ai-page-content">
                <div className="ai-filter-bar">
                    <input
                        type="text"
                        placeholder="Tìm kiếm theo tên..."
                        value={searchQuery}
                        onChange={handleSearchInput}
                    />
                    <select value={roleFilter} onChange={e => setRoleFilter(e.target.value)}>
                        <option value="">Tất cả vai trò</option>
                        <option value="admin">Admin</option>
                        <option value="teacher">Teacher</option>
                        <option value="student">Student</option>
                    </select>
                </div>

            {loading ? (
                <div className="ai-empty-state">Đang tải...</div>
            ) : (
                <>
                <div className="users-table-container">
                    <table className="users-table">
                        <thead>
                            <tr>
                                <th>ID</th>
                                <th>Tên</th>
                                <th>Email</th>
                                <th>Vai trò</th>
                                <th>Ngày tạo</th>
                                <th>Thao tac</th>
                            </tr>
                        </thead>
                        <tbody>
                            {users.map((user) => (
                                <tr key={user.id}>
                                    <td>{user.id}</td>
                                    <td>
                                        <div className="user-name-cell">
                                            <div className="user-avatar">{(user.ten || 'U').charAt(0).toUpperCase()}</div>
                                            <span className="user-name">{user.ten}</span>
                                            {user.phai_doi_mat_khau ? (
                                                <span className="badge-new">Can doi MK</span>
                                            ) : null}
                                        </div>
                                    </td>
                                    <td>{user.email}</td>
                                    <td>
                                        <span className={`role-badge ${user.vai_tro}`}>
                                            {user.vai_tro === 'admin' ? 'Admin' : user.vai_tro === 'teacher' ? 'Teacher' : 'Student'}
                                        </span>
                                    </td>
                                    <td>{user.ngay_tao ? new Date(user.ngay_tao).toLocaleDateString('vi-VN') : '-'}</td>
                                    <td>
                                        <div className="user-actions">
                                            <button className="btn-edit" onClick={() => handleEdit(user)}>Sửa</button>
                                            <button className="btn-delete" onClick={() => handleDelete(user)}>Xóa</button>
                                            <button className="btn-login" onClick={() => handleImpersonate(user)}>Đăng nhập</button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                            {users.length === 0 && (
                                <tr><td colSpan="6" style={{ textAlign: 'center', padding: '40px', color: 'var(--rules-empty-text)' }}>Chua co nguoi dung nao</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>

                {totalPages > 1 && (
                    <div className="pagination-container">
                        <span className="pagination-info">
                            Hiển thị {users.length} / {totalUsers} người dùng — Trang {currentPage} / {totalPages}
                        </span>
                        <div className="pagination-controls">
                            <button onClick={() => loadUsers(1)} disabled={currentPage === 1}>«</button>
                            <button onClick={() => loadUsers(currentPage - 1)} disabled={currentPage === 1}>‹</button>
                            {pageNumbers.map(p => (
                                <button key={p} className={p === currentPage ? 'active' : ''} onClick={() => loadUsers(p)}>{p}</button>
                            ))}
                            <button onClick={() => loadUsers(currentPage + 1)} disabled={currentPage === totalPages}>›</button>
                            <button onClick={() => loadUsers(totalPages)} disabled={currentPage === totalPages}>»</button>
                        </div>
                    </div>
                )}
                </>
            )}

            {/* Modal: Add / Edit user */}
            {formVisible && (
                <div className="rules-modal-backdrop">
                    <div className="rules-modal" style={{ maxWidth: 640, width: '90vw' }}>
                        <div className="rules-modal-header">
                            <h3>{editUserId ? 'Sửa người dùng' : 'Thêm người dùng'}</h3>
                            <button className="rules-modal-close" onClick={() => { resetForm(); setFormVisible(false); }}>×</button>
                        </div>
                        <form className="rules-form" onSubmit={handleSubmit}>
                            <label>
                                Tên người dùng *
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
                                Mật khẩu {editUserId ? '(để trống nếu không đổi)' : '*'}
                                <div style={{ position: 'relative' }}>
                                    <input
                                        type={showPassword ? 'text' : 'password'}
                                        value={formData.password}
                                        onChange={e => setFormData({ ...formData, password: e.target.value })}
                                        placeholder={editUserId ? '••••••••' : 'Nhập mật khẩu'}
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
                            {editUserId && (formData.vai_tro === 'teacher' || formData.vai_tro === 'student') && (() => {
                                const q = roomSearch.trim().toLowerCase();
                                const filteredRooms = q
                                    ? myRooms.filter(r => {
                                        const name = (r.ten_phong || r.name || '').toLowerCase();
                                        const code = (r.ma_phong || '').toLowerCase();
                                        const loc = (r.vi_tri || '').toLowerCase();
                                        return name.includes(q) || code.includes(q) || loc.includes(q);
                                    })
                                    : myRooms;
                                const visibleSelected = filteredRooms.filter(r => assignedRoomIds.includes(r.id)).length;
                                const allVisibleSelected = filteredRooms.length > 0 && visibleSelected === filteredRooms.length;
                                const CheckIcon = (
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                                        <polyline points="20 6 9 17 4 12"/>
                                    </svg>
                                );
                                const KeyIcon = (
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/>
                                    </svg>
                                );
                                const SearchIcon = (
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="room-assign-search-icon">
                                        <circle cx="11" cy="11" r="8"/>
                                        <line x1="21" y1="21" x2="16.65" y2="16.65"/>
                                    </svg>
                                );
                                const InboxIcon = (
                                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="room-assign-empty-icon">
                                        <polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/>
                                        <path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/>
                                    </svg>
                                );
                                const toggleAllVisible = () => {
                                    if (allVisibleSelected) {
                                        setAssignedRoomIds(prev => prev.filter(id => !filteredRooms.some(r => r.id === id)));
                                    } else {
                                        const ids = filteredRooms.map(r => r.id);
                                        setAssignedRoomIds(prev => Array.from(new Set([...prev, ...ids])));
                                    }
                                };
                                return (
                                    <div className="room-assign-panel">
                                        <div className="room-assign-panel-header">
                                            <div className="room-assign-panel-title">
                                                <span className="room-assign-panel-title-icon">{KeyIcon}</span>
                                                Phòng được gán quyền sử dụng
                                            </div>
                                            <span className="room-assign-panel-counter">
                                                <strong>{assignedRoomIds.length}</strong>
                                                <span>/ {myRooms.length}</span>
                                                <span>phòng</span>
                                            </span>
                                        </div>
                                        <div className="room-assign-panel-body">
                                            <p className="room-assign-hint">
                                                Chọn các phòng bạn sở hữu để cấp quyền sử dụng cho user này. User chỉ có quyền xem và tương tác thiết bị, không thể sửa hoặc xóa phòng.
                                            </p>
                                            {assignmentLoading ? (
                                                <div className="room-assign-empty">{InboxIcon}Đang tải danh sách phòng...</div>
                                            ) : myRooms.length === 0 ? (
                                                <div className="room-assign-empty">{InboxIcon}Bạn chưa sở hữu phòng nào để gán. Hãy tạo phòng trước.</div>
                                            ) : (
                                                <>
                                                    <div className="room-assign-toolbar">
                                                        <div className="room-assign-search">
                                                            {SearchIcon}
                                                            <input
                                                                type="text"
                                                                value={roomSearch}
                                                                onChange={e => setRoomSearch(e.target.value)}
                                                                placeholder="Tìm theo tên, mã hoặc vị trí..."
                                                            />
                                                        </div>
                                                        <button
                                                            type="button"
                                                            className="room-assign-select-all"
                                                            onClick={toggleAllVisible}
                                                            disabled={filteredRooms.length === 0}
                                                            title={allVisibleSelected ? 'Bỏ chọn tất cả (đang lọc)' : 'Chọn tất cả (đang lọc)'}
                                                        >
                                                            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                                                                {allVisibleSelected ? (
                                                                    <rect x="3" y="3" width="18" height="18" rx="3"/>
                                                                ) : (
                                                                    <polyline points="20 6 9 17 4 12"/>
                                                                )}
                                                            </svg>
                                                            {allVisibleSelected ? 'Bỏ chọn' : 'Chọn tất cả'}
                                                        </button>
                                                    </div>
                                                    {filteredRooms.length === 0 ? (
                                                        <div className="room-assign-empty">{InboxIcon}Không có phòng nào khớp với "{roomSearch}"</div>
                                                    ) : (
                                                        <div className="room-assign-grid">
                                                            {filteredRooms.map(room => {
                                                                const checked = assignedRoomIds.includes(room.id);
                                                                return (
                                                                    <div
                                                                        key={room.id}
                                                                        className={`room-assign-card${checked ? ' checked' : ''}`}
                                                                        onClick={() => toggleAssignedRoom(room.id)}
                                                                        role="checkbox"
                                                                        aria-checked={checked}
                                                                        tabIndex={0}
                                                                        onKeyDown={(e) => {
                                                                            if (e.key === ' ' || e.key === 'Enter') {
                                                                                e.preventDefault();
                                                                                toggleAssignedRoom(room.id);
                                                                            }
                                                                        }}
                                                                    >
                                                                        <span className="room-assign-card-check">
                                                                            {checked ? CheckIcon : null}
                                                                        </span>
                                                                        <span className="room-assign-card-content">
                                                                            <span className="room-assign-card-name" title={room.ten_phong || room.name}>
                                                                                {room.ten_phong || room.name || `Phòng #${room.id}`}
                                                                            </span>
                                                                            <span className="room-assign-card-meta">
                                                                                {room.ma_phong && <span className="room-assign-card-code">{room.ma_phong}</span>}
                                                                                {room.vi_tri && <span className="room-assign-card-location" title={room.vi_tri}>{room.vi_tri}</span>}
                                                                            </span>
                                                                        </span>
                                                                    </div>
                                                                );
                                                            })}
                                                        </div>
                                                    )}
                                                </>
                                            )}
                                        </div>
                                    </div>
                                );
                            })()}
                            <div className="form-actions">
                                <button type="button" onClick={() => { resetForm(); setFormVisible(false); }}>Hủy</button>
                                <button type="submit">{editUserId ? 'Cập nhật' : 'Tạo người dùng'}</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {bulkImportVisible && (
                <div className="rules-modal-backdrop">
                    <div className="rules-modal" style={{ maxWidth: 520 }}>
                        <div className="rules-modal-header">
                            <h3>Nhập hàng loạt từ file .xlsx</h3>
                            <button className="rules-modal-close" onClick={() => { setBulkImportVisible(false); setBulkFile(null); setBulkResult(null); setBulkError(null); }}>×</button>
                        </div>
                        <div style={{ padding: '4px 0' }}>
                            <p className="help-text" style={{ marginBottom: '16px' }}>
                                File can co cot <strong>"Ma SV"</strong>. Tài khoản tạo ra sẽ có mật khẩu mặc định là <strong>111111</strong> và yêu cầu đổi mật khẩu khi đăng nhập lần đầu.
                            </p>
                            <div
                                className={`bulk-dropzone ${bulkFile ? 'drag-over' : ''}`}
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
                                    <p style={{ color: 'var(--rules-text-accent)', fontWeight: 600 }}>
                                        {bulkFile.name}
                                    </p>
                                ) : (
                                    <>
                                        <div className="bulk-dropzone-icon">📄</div>
                                        <p>Keo tha file .xlsx hoac click de chon</p>
                                    </>
                                )}
                                <p className="hint">Chi ho tro dinh dang .xlsx</p>
                            </div>

                            {bulkResult && (
                                <div className="import-result success">
                                    <p style={{ margin: 0 }}>{bulkResult.message}</p>
                                </div>
                            )}
                            {bulkError && (
                                <div className="import-result error">
                                    <p style={{ margin: 0 }}>{bulkError}</p>
                                </div>
                            )}

                            <div style={{ display: 'flex', gap: '10px', justifyContent: 'space-between', marginTop: '12px' }}>
                                <button className="secondary-btn" onClick={handleDownloadTemplate}>
                                    Tai file mau
                                </button>
                                <div style={{ display: 'flex', gap: '10px' }}>
                                    <button className="secondary-btn" onClick={() => { setBulkImportVisible(false); setBulkFile(null); setBulkResult(null); setBulkError(null); }}>Hủy</button>
                                    <button className="primary-btn" onClick={handleBulkImport}
                                        disabled={!bulkFile || bulkLoading}
                                        style={{ minWidth: '100px' }}>
                                        {bulkLoading ? 'Đang xử lý...' : 'Nhập'}
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}
            </div>
        </div>
    );
}
