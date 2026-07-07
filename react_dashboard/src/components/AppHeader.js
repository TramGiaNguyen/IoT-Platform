import React, { useState, useRef, useEffect } from 'react';

const AppHeader = ({
  title = 'Tổng quan',
  subtitle = 'Giám sát & điều khiển thiết bị thời gian thực',
  searchValue = '',
  onSearchChange,
  onSearchSubmit,
  wsConnected = false,
  userInfo,
  onLogout,
  onChangePassword,
  notificationCount = 0,
  theme = 'dark',
  onToggleTheme,
  devices = [],
  onNavigate,
  currentView = 'dashboard'
}) => {
  const [openMenu, setOpenMenu] = useState(null); // 'avatar' | 'notif' | 'theme' | null
  const menuRef = useRef(null);
  const notifRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setOpenMenu(prev => prev === 'avatar' ? null : prev);
      if (notifRef.current && !notifRef.current.contains(e.target)) setOpenMenu(prev => prev === 'notif' ? null : prev);
    };
    document.addEventListener('mousedown', handleClickOutside);

    const handleOpenAvatar = () => setOpenMenu('avatar');
    window.addEventListener('bdu-open-header-avatar', handleOpenAvatar);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('bdu-open-header-avatar', handleOpenAvatar);
    };
  }, []);

  const userName = userInfo?.ho_ten || userInfo?.ten || userInfo?.username || 'Người dùng';
  const userRole = userInfo?.vai_tro || 'user';
  const userInitial = (userName || '?').trim().charAt(0).toUpperCase();
  const roleLabel = userRole === 'admin' ? 'Quản trị' : userRole === 'teacher' ? 'Giảng viên' : userRole === 'student' ? 'Sinh viên' : userRole;

  const offlineDevices = (devices || []).filter(d => {
    const data = d.last_seen;
    if (!data) return true;
    const ts = Number(data) > 1e12 ? Number(data) : Number(data) * 1000;
    return (Date.now() - ts) / 1000 / 60 > 2;
  });

  return (
    <header className="app-header">
      <div className="app-header-left">
        <h1>{title}</h1>
        <p>{subtitle}</p>
      </div>

      <div className="app-header-right">
        <div ref={notifRef} style={{ position: 'relative' }}>
          <button
            className="header-icon-btn"
            onClick={() => setOpenMenu(openMenu === 'notif' ? null : 'notif')}
            title="Thông báo"
            aria-label="Thông báo"
          >
            <span className="material-symbols-outlined">notifications</span>
            {notificationCount > 0 && <span className="header-notif-badge">{notificationCount > 9 ? '9+' : notificationCount}</span>}
          </button>
          {openMenu === 'notif' && (
            <div className="header-dropdown" style={{ minWidth: 320, right: 0 }}>
              <div className="header-dropdown-header">
                <span className="header-dropdown-name">Thông báo</span>
                <span className="header-dropdown-role">Cập nhật real-time</span>
              </div>
              {offlineDevices.length === 0 ? (
                <div style={{ padding: '20px 14px', textAlign: 'center', color: '#64748b', fontSize: 13 }}>
                  Không có thông báo mới
                </div>
              ) : (
                <>
                  {offlineDevices.slice(0, 5).map((d, i) => (
                    <div key={i} className="header-dropdown-item" onClick={() => { setOpenMenu(null); onNavigate?.(d.ma_thiet_bi); }}>
                      <span className="material-symbols-outlined" style={{ color: '#ef4444' }}>sensors_off</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, color: '#e2e8f0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {d.ten_thiet_bi || d.ma_thiet_bi}
                        </div>
                        <div style={{ fontSize: 11, color: '#94a3b8', fontFamily: 'JetBrains Mono, monospace' }}>Mất kết nối</div>
                      </div>
                    </div>
                  ))}
                </>
              )}
            </div>
          )}
        </div>

        <button
          className="header-icon-btn"
          onClick={() => onToggleTheme?.()}
          title="Đổi giao diện"
          aria-label="Đổi giao diện"
        >
          <span className="material-symbols-outlined">{theme === 'dark' ? 'light_mode' : 'dark_mode'}</span>
        </button>

        <div ref={menuRef} style={{ position: 'relative' }}>
          <button
            className="header-avatar-btn"
            onClick={() => setOpenMenu(openMenu === 'avatar' ? null : 'avatar')}
            title="Tài khoản"
          >
            <span className="header-avatar">{userInitial}</span>
            <span className="header-avatar-name">{userName}</span>
            <span className="material-symbols-outlined sidebar-user-chev">expand_more</span>
          </button>
          {openMenu === 'avatar' && (
            <div className="header-dropdown">
              <div className="header-dropdown-header">
                <span className="header-dropdown-name">{userName}</span>
                <span className="header-dropdown-role">{roleLabel}</span>
              </div>
              <button className="header-dropdown-item" onClick={() => { setOpenMenu(null); onChangePassword?.(); }}>
                <span className="material-symbols-outlined">lock_reset</span>
                Đổi mật khẩu
              </button>
              <button className="header-dropdown-item" onClick={() => { setOpenMenu(null); onNavigate?.('rules'); }}>
                <span className="material-symbols-outlined">rule</span>
                Quản lý rule
              </button>
              <div className="header-dropdown-divider" />
              <button className="header-dropdown-item danger" onClick={() => { setOpenMenu(null); onLogout?.(); }}>
                <span className="material-symbols-outlined">logout</span>
                Đăng xuất
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};

export default AppHeader;
