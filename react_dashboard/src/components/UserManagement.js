import React, { useEffect, useState, useCallback } from 'react';
import { fetchUsers, createUser, updateUser, deleteUser, impersonateUser } from '../services';

export default function UserManagement({ token, onBack }) {
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(false);
    const [formVisible, setFormVisible] = useState(false);
    const [editUserId, setEditUserId] = useState(null);
    const [formData, setFormData] = useState({
        ten: '',
        email: '',
        password: '',
        vai_tro: 'student',
    });


    const loadUsers = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetchUsers(token);
            setUsers(res.data.users || []);
        } catch (err) {
            console.error('Load users failed', err);
        } finally {
            setLoading(false);
        }
    }, [token]);

    useEffect(() => {
        loadUsers();
    }, [loadUsers]);

    const resetForm = () => {
        setFormData({ ten: '', email: '', password: '', vai_tro: 'student' });
        setEditUserId(null);
    };

    const handleOpenAdd = () => {
        resetForm();
        setFormVisible(true);
    };

    const handleEdit = async (user) => {
        setFormData({
            ten: user.ten,
            email: user.email,
            password: '',
            vai_tro: user.vai_tro,
        });
        setEditUserId(user.id);
        setFormVisible(true);
    };

    const handleDelete = async (user) => {
        if (!window.confirm(`Xóa người dùng "${user.ten}"?`)) return;
        try {
            await deleteUser(user.id, token);
            await loadUsers();
        } catch (err) {
            console.error('Delete user failed', err);
            alert('Xóa người dùng thất bại: ' + (err.response?.data?.detail || err.message));
        }
    };

    const handleImpersonate = async (user) => {
        if (!window.confirm(`Đăng nhập vào tài khoản "${user.ten}"?\n\nBạn sẽ cần đăng xuất và đăng nhập lại để quay về tài khoản của mình.`)) return;
        try {
            const res = await impersonateUser(user.id, token);
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
                const updateData = {
                    ten: formData.ten,
                    email: formData.email,
                    vai_tro: formData.vai_tro,
                };
                if (formData.password) {
                    updateData.password = formData.password;
                }
                await updateUser(editUserId, updateData, token);
            } else {
                await createUser({
                    ten: formData.ten,
                    email: formData.email,
                    password: formData.password,
                    vai_tro: formData.vai_tro,
                }, token);
            }
            resetForm();
            setFormVisible(false);
            await loadUsers();
        } catch (err) {
            console.error('Save user failed', err);
            alert('Lỗi: ' + (err.response?.data?.detail || err.message));
        }
    };

    return (
        <div className="rules-container">
            <div className="rules-header">
                <div>
                    <h2>Quản lý người dùng</h2>
                    <p className="muted">Thêm, sửa, xóa và phân quyền người dùng</p>
                </div>
                <div className="rules-actions">
                    <button className="primary-btn" onClick={handleOpenAdd}>+ Thêm người dùng</button>
                    <button className="secondary-btn" onClick={onBack}>Quay lại</button>
                </div>
            </div>

            {loading ? (
                <div className="loading">Đang tải...</div>
            ) : (
                <div className="table-container">
                    <table className="user-table">
                        <thead>
                            <tr>
                                <th>ID</th>
                                <th>Tên</th>
                                <th>Email</th>
                                <th>Vai trò</th>
                                <th>Ngày tạo</th>
                                <th>Thao tác</th>
                            </tr>
                        </thead>
                        <tbody>
                            {users.map((user) => (
                                <tr key={user.id}>
                                    <td>{user.id}</td>
                                    <td>{user.ten}</td>
                                    <td>{user.email}</td>
                                    <td>
                                        <span className={`role-badge ${user.vai_tro}`}>
                                            {user.vai_tro === 'admin' ? 'Admin' : user.vai_tro === 'teacher' ? 'Teacher' : 'Student'}
                                        </span>
                                    </td>
                                    <td>{user.ngay_tao ? new Date(user.ngay_tao).toLocaleDateString('vi-VN') : '-'}</td>
                                    <td>
                                        <button className="btn-edit" onClick={() => handleEdit(user)}>Sửa</button>
                                        <button className="btn-delete" onClick={() => handleDelete(user)}>Xóa</button>
                                        <button className="btn-login" onClick={() => handleImpersonate(user)} style={{ marginLeft: '5px', background: '#10b981', color: 'white', border: 'none', padding: '5px 10px', borderRadius: '4px', cursor: 'pointer' }}>Đăng nhập</button>
                                    </td>
                                </tr>
                            ))}
                            {users.length === 0 && (
                                <tr>
                                    <td colSpan="6" className="no-data">Chưa có người dùng nào</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            )}

            {formVisible && (
                <div className="modal-backdrop">
                    <div className="modal-content" style={{ maxWidth: 500 }}>
                        <div className="modal-header">
                            <h3>{editUserId ? 'Sửa người dùng' : 'Thêm người dùng'}</h3>
                            <button onClick={() => { resetForm(); setFormVisible(false); }}>×</button>
                        </div>
                        <form className="rule-form" onSubmit={handleSubmit}>
                            <label>
                                Tên người dùng *
                                <input
                                    type="text"
                                    value={formData.ten}
                                    onChange={(e) => setFormData({ ...formData, ten: e.target.value })}
                                    placeholder="Nguyễn Văn A"
                                    required
                                />
                            </label>
                            <label>
                                Email *
                                <input
                                    type="email"
                                    value={formData.email}
                                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                                    placeholder="user@example.com"
                                    required
                                />
                            </label>
                            <label>
                                Mật khẩu {editUserId ? '(để trống nếu không đổi)' : '*'}
                                <input
                                    type="password"
                                    value={formData.password}
                                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                                    placeholder={editUserId ? '••••••••' : 'Nhập mật khẩu'}
                                    required={!editUserId}
                                />
                            </label>
                            <label>
                                Vai trò
                                <select
                                    value={formData.vai_tro}
                                    onChange={(e) => setFormData({ ...formData, vai_tro: e.target.value })}
                                >
                                    <option value="student">Student</option>
                                    <option value="teacher">Teacher</option>
                                    <option value="admin">Admin</option>
                                </select>
                            </label>



                            <div className="form-actions">
                                <button type="submit">{editUserId ? 'Cập nhật' : 'Tạo người dùng'}</button>
                                <button type="button" onClick={() => { resetForm(); setFormVisible(false); }}>Hủy</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
