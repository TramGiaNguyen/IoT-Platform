import React, { useEffect, useState, useCallback, useRef } from 'react';
import { fetchDevices, fetchDashboards, refreshToken, fetchMe, changePassword } from './services';
import Login from './components/Login';
import ActivityTracker from './components/ActivityTracker';
import DeviceSetupWizard from './components/DeviceSetupWizard';
import Dashboard from './components/Dashboard';
import DeviceDetail from './components/DeviceDetail';
import RulesManagement from './components/RulesManagement';
import RoomManagement from './components/RoomManagement';
import AlarmsManagement from './components/AlarmsManagement';
import DeviceProfilesManagement from './components/DeviceProfilesManagement';
import UserManagement from './components/UserManagement';
import ClassManagement from './components/ClassManagement';
import DashboardManagement from './components/DashboardManagement';
import DashboardViewer from './components/DashboardViewer/DashboardViewer';
import RoomDetail from './components/RoomDetail';
import { canAccessPage } from './config/pages';
import { GlobalCacheProvider, useGlobalCache } from './context/GlobalCache';
import './styles/style.css';

// ── JWT helpers ────────────────────────────────────────────────────────────────

/** Decode a raw JWT (payload only) without signature verification. Returns null on failure. */
const decodeJWT = (token) => {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const raw = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(raw));
  } catch {
    return null;
  }
};

/**
 * Returns seconds until token expiry.
 * Returns a negative number if already expired; returns null if cannot decode.
 */
const getTokenTTL = (token) => {
  const payload = decodeJWT(token);
  if (!payload || !payload.exp) return null;
  return payload.exp - Math.floor(Date.now() / 1000);
};

const isTokenValid = (token) => {
  const payload = decodeJWT(token);
  if (!payload || !payload.exp) return false;
  return payload.exp * 1000 > Date.now();
};

const REFRESH_BEFORE_SECS = 10 * 60; // refresh when < 10 minutes left
const PROACTIVE_CHECK_INTERVAL_MS = 60 * 1000; // check every 60s

function App() {
  const [token, setToken] = useState(() => localStorage.getItem('token') || '');
  const [devices, setDevices] = useState([]);
  const savedToken = localStorage.getItem('token');
  const [isLoggedIn, setIsLoggedIn] = useState(() => !!savedToken && isTokenValid(savedToken));
  const [authChecked, setAuthChecked] = useState(false);
  const [currentView, setCurrentView] = useState('dashboard');
  const [selectedDeviceId, setSelectedDeviceId] = useState(null);
  const [userRole, setUserRole] = useState(() => localStorage.getItem('userRole') || '');
  const [allowedPages, setAllowedPages] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('allowedPages') || '[]');
    } catch {
      return [];
    }
  });
  const [customDashboards, setCustomDashboards] = useState([]);
  const [refreshTokenValue, setRefreshTokenValue] = useState(() => localStorage.getItem('refreshToken') || '');
  const [userInfo, setUserInfo] = useState(null);
  const [workspaceContext, setWorkspaceContext] = useState(
    () => localStorage.getItem('workspaceContext') || 'ca_nhan'
  );
  // Password change enforcement
  const [requirePasswordChange, setRequirePasswordChange] = useState(false);
  const [pendingAuth, setPendingAuth] = useState(null); // { token, refreshToken, vai_tro, pages, phai_doi_mat_khau, userId }

  const isAdmin = userRole === 'admin';

  // Persist workspaceContext
  useEffect(() => {
    localStorage.setItem('workspaceContext', workspaceContext);
  }, [workspaceContext]);

  // ── Token refresh: single-flight guard + JWT-exp check ───────────────────
  const refreshInFlightRef = useRef(false);
  /** Silently refreshes the access token only when it is close to expiry. */
  const refreshTokenSilently = useCallback(async () => {
    const access = localStorage.getItem('token');
    const rt = localStorage.getItem('refreshToken');
    if (!access || !rt) return;
    // No-op if another refresh is already in-flight
    if (refreshInFlightRef.current) return;
    // No-op if token still has enough time left
    const ttl = getTokenTTL(access);
    if (ttl !== null && ttl >= REFRESH_BEFORE_SECS) return;

    refreshInFlightRef.current = true;
    try {
      const res = await refreshToken(rt, null, null);
      const newAccess = res.data.access_token;
      const newRefresh = res.data.refresh_token;
      setToken(newAccess);
      setRefreshTokenValue(newRefresh);
      localStorage.setItem('token', newAccess);
      localStorage.setItem('refreshToken', newRefresh);
    } catch (e) {
      handleLogout();
    } finally {
      refreshInFlightRef.current = false;
    }
  }, []); // intentionally empty deps — reads from localStorage directly

  // ── Proactive check every 60s (independent of user activity) ─────────────
  useEffect(() => {
    if (!authChecked || !token || !isLoggedIn) return;
    const id = setInterval(refreshTokenSilently, PROACTIVE_CHECK_INTERVAL_MS);
    return () => clearInterval(id);
  }, [token, isLoggedIn, refreshTokenSilently]);

  const loadDevices = async (authToken = null) => {
    const tokenToUse = authToken || token;
    if (!tokenToUse) return;
    try {
      const r = await fetchDevices(tokenToUse);
      const devicesList = Array.isArray(r.data.devices) ? r.data.devices : [];
      setDevices(devicesList);
    } catch (err) {
      console.error('Khong tai duoc danh sach thiet bi', err);
      setDevices([]);
    }
  };

  const fetchUserInfo = useCallback(async (authToken) => {
    const tk = authToken || token;
    if (!tk) return;
    try {
      const res = await fetchMe(tk);
      setUserInfo(res.data);
    } catch (err) {
      console.error('Failed to fetch user info:', err);
      setUserInfo(null);
    }
  }, [token]);

  const loadCustomDashboards = async (authToken = null) => {
    const tokenToUse = authToken || token;
    if (!tokenToUse) return;
    try {
      const res = await fetchDashboards(tokenToUse);
      setCustomDashboards(res.data.dashboards || []);
    } catch (err) {
      console.error('Failed to load custom dashboards:', err);
      setCustomDashboards([]);
    }
  };

  const handleLoginSuccess = async (accessToken, refreshTk, vai_tro, pages, phaiDoiMatKhau, userId) => {
    setToken(accessToken);
    localStorage.setItem('token', accessToken);
    if (phaiDoiMatKhau) {
      // Resolve userId from /me if not provided by login response
      let resolvedUserId = userId;
      if (!resolvedUserId) {
        try {
          const meRes = await fetchMe(accessToken);
          resolvedUserId = meRes?.data?.id;
        } catch (e) {
          console.error('Cannot resolve userId from /me', e);
        }
      }
      if (!resolvedUserId) {
        alert('Khong the xac dinh user_id. Vui long dang nhap lai.');
        return;
      }
      setPendingAuth({ token: accessToken, refreshToken: refreshTk, vai_tro, pages, phaiDoiMatKhau, userId: resolvedUserId });
      setRequirePasswordChange(true);
      setIsLoggedIn(true);
      return;
    }
    setRefreshTokenValue(refreshTk || '');
    setUserRole(vai_tro || '');
    setAllowedPages(pages || []);
    setIsLoggedIn(true);
    setWorkspaceContext('ca_nhan');
    localStorage.setItem('workspaceContext', 'ca_nhan');
    localStorage.setItem('refreshToken', refreshTk || '');
    localStorage.setItem('userRole', vai_tro || '');
    localStorage.setItem('allowedPages', JSON.stringify(pages || []));
    localStorage.setItem('userId', userId || '');
    await loadCustomDashboards(accessToken);
    await fetchUserInfo(accessToken);
  };

  // Minimal logout: only clears auth state (used by refreshTokenSilently on token expiry)
  // Full logout with GlobalCache.clearCache() is handled by AppContentWithTracker.onLogout
  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('userRole');
    localStorage.removeItem('allowedPages');
    localStorage.removeItem('workspaceContext');
    setToken('');
    setRefreshTokenValue('');
    setUserRole('');
    setAllowedPages([]);
    setIsLoggedIn(false);
    setDevices([]);
    setCustomDashboards([]);
    setUserInfo(null);
    setWorkspaceContext('ca_nhan');
    window.location.hash = '';
  };

  // Load on startup if already logged in — dashboards loaded here; devices/rooms/rules handled by GlobalCache
  // Đăng ký Service Worker ở startup
  useEffect(() => {
    if (!authChecked) return;
    if (token && isLoggedIn) {
      loadCustomDashboards(token);
      fetchUserInfo(token);
    }
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch((err) => {
        console.warn('[App] SW registration failed:', err);
      });
    }
  }, [authChecked, token, isLoggedIn, fetchUserInfo]);

  // Verify token with backend on every page load / reload / access
  useEffect(() => {
    const verifyToken = async () => {
      const t = localStorage.getItem('token');
      if (!t) {
        setAuthChecked(true);
        return;
      }
      if (!isTokenValid(t)) {
        handleLogout();
        setAuthChecked(true);
        return;
      }
      try {
        const res = await fetchMe(t);
        setAuthChecked(true);
        if (res?.data?.phai_doi_mat_khau) {
          const storedToken = localStorage.getItem('token');
          const storedRefresh = localStorage.getItem('refreshToken');
          const storedRole = localStorage.getItem('userRole');
          const storedPages = JSON.parse(localStorage.getItem('allowedPages') || '[]');
          const storedId = localStorage.getItem('userId');
          setPendingAuth({
            token: storedToken,
            refreshToken: storedRefresh,
            vai_tro: storedRole,
            pages: storedPages,
            phaiDoiMatKhau: true,
            userId: storedId ? parseInt(storedId) : res.data.id,
          });
          setRequirePasswordChange(true);
          setIsLoggedIn(true);
        } else {
          setIsLoggedIn(true);
        }
      } catch (err) {
        handleLogout();
        setAuthChecked(true);
      }
    };
    verifyToken();
  }, []);

  if (!authChecked) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#1a1a2e', color: '#fff' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '24px', marginBottom: '12px' }}>BDU IoT Platform</div>
          <div style={{ color: '#888' }}>Dang kiem tra thong tin...</div>
        </div>
      </div>
    );
  }

  if (!isLoggedIn) {
    return <Login setToken={handleLoginSuccess} />;
  }

  if (requirePasswordChange && pendingAuth) {
    return (
      <PasswordChangeModal
        userId={pendingAuth.userId}
        token={pendingAuth.token}
        onSuccess={() => {
          const auth = pendingAuth;
          setRequirePasswordChange(false);
          setPendingAuth(null);
          setRefreshTokenValue(auth.refreshToken || '');
          setUserRole(auth.vai_tro || '');
          setAllowedPages(auth.pages || []);
          setIsLoggedIn(true);
          setWorkspaceContext('ca_nhan');
          localStorage.setItem('workspaceContext', 'ca_nhan');
          localStorage.setItem('refreshToken', auth.refreshToken || '');
          localStorage.setItem('userRole', auth.vai_tro || '');
          localStorage.setItem('allowedPages', JSON.stringify(auth.pages || []));
          localStorage.setItem('userId', auth.userId || '');
          loadCustomDashboards(auth.token);
          fetchUserInfo(auth.token);
        }}
        onSkip={() => {
          // User can still login without changing, but flag stays
          setRequirePasswordChange(false);
          setPendingAuth(null);
          setIsLoggedIn(true);
          const auth = pendingAuth;
          setRefreshTokenValue(auth.refreshToken || '');
          setUserRole(auth.vai_tro || '');
          setAllowedPages(auth.pages || []);
          setWorkspaceContext('ca_nhan');
          localStorage.setItem('workspaceContext', 'ca_nhan');
          localStorage.setItem('refreshToken', auth.refreshToken || '');
          localStorage.setItem('userRole', auth.vai_tro || '');
          localStorage.setItem('allowedPages', JSON.stringify(auth.pages || []));
          localStorage.setItem('userId', auth.userId || '');
          loadCustomDashboards(auth.token);
          fetchUserInfo(auth.token);
        }}
      />
    );
  }

  // GlobalCacheProvider wraps authenticated app.
  // Inside: GlobalCache.initialize() runs in its useEffect (1-time load of all data).
  return (
    <GlobalCacheProvider token={token}>
      <AppContentWithTracker
        token={token}
        devices={devices}
        setDevices={setDevices}
        currentView={currentView}
        setCurrentView={setCurrentView}
        selectedDeviceId={selectedDeviceId}
        setSelectedDeviceId={setSelectedDeviceId}
        userRole={userRole}
        isAdmin={isAdmin}
        isLoggedIn={isLoggedIn}
        customDashboards={customDashboards}
        userInfo={userInfo}
        setUserInfo={setUserInfo}
        workspaceContext={workspaceContext}
        setWorkspaceContext={setWorkspaceContext}
        fetchUserInfo={fetchUserInfo}
        setIsLoggedIn={setIsLoggedIn}
        setToken={setToken}
        setRefreshTokenValue={setRefreshTokenValue}
        setUserRole={setUserRole}
        setAllowedPages={setAllowedPages}
        setCustomDashboards={setCustomDashboards}
      />
    </GlobalCacheProvider>
  );
}

// AppContentWithTracker runs INSIDE GlobalCacheProvider — can call useGlobalCache() + uses onLogout
function AppContentWithTracker({
  token, devices, setDevices, currentView, setCurrentView,
  selectedDeviceId, setSelectedDeviceId, userRole, isAdmin, isLoggedIn,
  customDashboards,
  userInfo, setUserInfo, workspaceContext, setWorkspaceContext, fetchUserInfo,
  setIsLoggedIn, setToken, setRefreshTokenValue, setUserRole, setAllowedPages,
  setCustomDashboards,
}) {
  const { updateCache, refetch, clearCache } = useGlobalCache();

  // Clear GlobalCache + all App state on logout (Phase 5: fix stale device cache)
  const onLogout = useCallback(() => {
    clearCache();
    setIsLoggedIn(false);
    setToken('');
    setRefreshTokenValue('');
    setUserRole('');
    setAllowedPages([]);
    setDevices([]);
    setCustomDashboards([]);
    setUserInfo(null);
    setWorkspaceContext('ca_nhan');
    localStorage.removeItem('token');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('userRole');
    localStorage.removeItem('allowedPages');
    localStorage.removeItem('workspaceContext');
    window.location.hash = '';
  }, [clearCache, setIsLoggedIn, setToken, setRefreshTokenValue, setUserRole, setAllowedPages, setDevices, setCustomDashboards, setUserInfo, setWorkspaceContext]);

  // Refetch khi đổi workspace context
  useEffect(() => {
    if (refetch) {
      refetch({ context: workspaceContext });
    }
  }, [workspaceContext, refetch]);

  // Sync devices + dashboards into global cache when App.js finishes loading
  useEffect(() => {
    if (devices.length > 0) {
      updateCache({ devices });
    }
  }, [devices]);

  useEffect(() => {
    if (customDashboards.length > 0) {
      updateCache({ dashboards: customDashboards });
    }
  }, [customDashboards]);

  const handleBackToDashboard = () => {
    window.location.hash = '';
    setCurrentView('dashboard');
    setSelectedDeviceId(null);
  };

  const openRules = () => {
    window.location.hash = '#/rules';
    setCurrentView('rules');
    setSelectedDeviceId(null);
  };

  const openRooms = () => {
    window.location.hash = '#/rooms';
    setCurrentView('rooms');
    setSelectedDeviceId(null);
  };

  const openAlerts = () => {
    window.location.hash = '#/alerts';
    setCurrentView('alerts');
    setSelectedDeviceId(null);
  };

  const openDeviceProfiles = () => {
    window.location.hash = '#/device-profiles';
    setCurrentView('device-profiles');
    setSelectedDeviceId(null);
  };

  const openUsers = () => {
    window.location.hash = '#/users';
    setCurrentView('users');
    setSelectedDeviceId(null);
  };

  const openDashboardsManage = () => {
    window.location.hash = '#/dashboards-manage';
    setCurrentView('dashboards-manage');
    setSelectedDeviceId(null);
  };

  const canAccess = () => true;

  // Hash routing
  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash;
      if (hash.startsWith('#/rules')) {
        setCurrentView('rules');
        setSelectedDeviceId(null);
      } else if (hash.startsWith('#/rooms/') && hash !== '#/rooms') {
        setSelectedDeviceId(hash.replace('#/rooms/', ''));
        setCurrentView('room-detail');
      } else if (hash.startsWith('#/rooms')) {
        setCurrentView('rooms');
        setSelectedDeviceId(null);
      } else if (hash.startsWith('#/alerts')) {
        setCurrentView('alerts');
        setSelectedDeviceId(null);
      } else if (hash.startsWith('#/device-profiles')) {
        setCurrentView('device-profiles');
        setSelectedDeviceId(null);
      } else if (hash.startsWith('#/users')) {
        setCurrentView('users');
        setSelectedDeviceId(null);
      } else if (hash.startsWith('#/classes')) {
        setCurrentView('classes');
        setSelectedDeviceId(null);
      } else if (hash.startsWith('#/classroom') || hash === '#classroom') {
        setCurrentView('classroom');
        setSelectedDeviceId(null);
      } else if (hash.startsWith('#/dashboards-manage') || hash === '#dashboards-manage') {
        setCurrentView('dashboards-manage');
        setSelectedDeviceId(null);
      } else if (hash.startsWith('#/dashboards/')) {
        setCurrentView('dashboard-viewer');
        setSelectedDeviceId(hash.replace('#/dashboards/', ''));
      } else if (hash.startsWith('#/devices/')) {
        setSelectedDeviceId(hash.replace('#/devices/', ''));
        setCurrentView('device-detail');
      } else {
        setCurrentView('dashboard');
        setSelectedDeviceId(null);
      }
    };
    handleHashChange();
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  let content = null;
  let activeTab = 'dashboard';

  if (currentView === 'device-detail' && selectedDeviceId) {
    content = <DeviceDetail deviceId={selectedDeviceId} token={token} onBack={handleBackToDashboard} />;
    activeTab = 'dashboard';
  } else if (currentView === 'rules') {
    content = <RulesManagement token={token} onBack={handleBackToDashboard} />;
    activeTab = 'rules';
  } else if (currentView === 'rooms') {
    content = <RoomManagement token={token} onBack={handleBackToDashboard} workspaceContext={workspaceContext} />;
    activeTab = 'rooms';
  } else if (currentView === 'room-detail' && selectedDeviceId) {
    content = <RoomDetail roomId={selectedDeviceId} token={token} workspaceContext={workspaceContext} />;
    activeTab = 'rooms';
  } else if (currentView === 'alerts') {
    content = <AlarmsManagement token={token} onBack={handleBackToDashboard} />;
    activeTab = 'alerts';
  } else if (currentView === 'device-profiles') {
    content = <DeviceProfilesManagement token={token} onBack={handleBackToDashboard} />;
    activeTab = 'device-profiles';
  } else if (currentView === 'users') {
    if (isAdmin) {
      content = <UserManagement token={token} onBack={handleBackToDashboard} />;
      activeTab = 'users';
    } else {
      content = <Dashboard token={token} devices={devices} onOpenRules={openRules} onOpenRooms={openRooms} />;
      activeTab = 'dashboard';
    }
  } else if (currentView === 'classes') {
    if (isAdmin || userRole === 'teacher') {
      content = <ClassManagement token={token} onBack={handleBackToDashboard} onClassChanged={fetchUserInfo} />;
      activeTab = 'classes';
    } else {
      content = <Dashboard token={token} devices={devices} onOpenRules={openRules} onOpenRooms={openRooms} />;
      activeTab = 'dashboard';
    }
  } else if (currentView === 'dashboards-manage') {
    content = <DashboardManagement token={token} onBack={handleBackToDashboard} />;
    activeTab = 'dashboards-manage';
  } else if (currentView === 'dashboard-viewer' && selectedDeviceId) {
    content = <DashboardViewer dashboardId={parseInt(selectedDeviceId)} token={token} onBack={handleBackToDashboard} />;
    activeTab = 'dashboards-manage';
  } else {
    content = <Dashboard token={token} devices={devices} onOpenRules={openRules} onOpenRooms={openRooms} />;
    activeTab = 'dashboard';
  }

  return (
    <>
      {isLoggedIn && <ActivityTracker onIdleTimeout={onLogout} />}
      <div className="app-shell">
        <aside className="app-sidebar">
          <div className="sidebar-logo">BDU IoT</div>
        {userInfo && userInfo.group_room_id && (
          <div className="workspace-switcher">
            <button
              className={`workspace-tab ${workspaceContext === 'ca_nhan' ? 'active' : ''}`}
              onClick={() => setWorkspaceContext('ca_nhan')}
            >
              Cá nhân
            </button>
            <button
              className={`workspace-tab ${workspaceContext === 'nhom' ? 'active' : ''}`}
              onClick={() => setWorkspaceContext('nhom')}
            >
              Nhóm
            </button>
          </div>
        )}
        <nav className="sidebar-nav">
          {canAccess('dashboard') && (
            <button className={activeTab === 'dashboard' ? 'active' : ''} onClick={handleBackToDashboard}>
              Dashboard
            </button>
          )}
          {canAccess('rooms') && (
            <button className={activeTab === 'rooms' ? 'active' : ''} onClick={openRooms}>
              Quản lý phòng
            </button>
          )}
          {canAccess('rules') && (
            <button className={activeTab === 'rules' ? 'active' : ''} onClick={openRules}>
              Quản lý rule
            </button>
          )}
          {canAccess('alerts') && (
            <button className={activeTab === 'alerts' ? 'active' : ''} onClick={openAlerts}>
              Quản lý cảnh báo
            </button>
          )}
          {canAccess('device-profiles') && (
            <button className={activeTab === 'device-profiles' ? 'active' : ''} onClick={openDeviceProfiles}>
              Device Profiles
            </button>
          )}
          {canAccess('dashboards') && (
            <button className={activeTab === 'dashboards-manage' ? 'active' : ''} onClick={openDashboardsManage}>
              Quản lý Dashboard
            </button>
          )}
          {isAdmin && (
            <button className={activeTab === 'users' ? 'active' : ''} onClick={openUsers}>
              Quản lý người dùng
            </button>
          )}
          {(isAdmin || userRole === 'teacher') && (
            <button className={activeTab === 'classes' ? 'active' : ''} onClick={() => {
              window.location.hash = '#/classes';
              setCurrentView('classes');
              setSelectedDeviceId(null);
            }}>
              Quản lý lớp học
            </button>
          )}
          {customDashboards.map(dashboard => (
            <button
              key={dashboard.id}
              className={currentView === 'dashboard-viewer' && selectedDeviceId === dashboard.id.toString() ? 'active' : ''}
              onClick={() => {
                setCurrentView('dashboard-viewer');
                setSelectedDeviceId(dashboard.id.toString());
                window.location.hash = `#/dashboards/${dashboard.id}`;
              }}
            >
              {dashboard.ten_dashboard}
            </button>
          ))}
        </nav>
        <div style={{ padding: '15px', marginTop: 'auto', borderTop: '1px solid #374151' }}>
          <div style={{
            marginBottom: '10px',
            padding: '8px 10px',
            background: '#1f2937',
            borderRadius: '6px',
            color: '#9ca3af',
            fontSize: '12px',
          }}>
            <div style={{ color: '#f3f4f6', fontWeight: '600', marginBottom: '2px', fontSize: '13px' }}>
              {userInfo?.ho_ten || userInfo?.ten || '—'}
            </div>
            <div style={{ textTransform: 'capitalize' }}>
              {userInfo?.vai_tro === 'admin' ? 'Quản trị' : userInfo?.vai_tro === 'teacher' ? 'Giảng viên' : userInfo?.vai_tro === 'student' ? 'Sinh viên' : userInfo?.vai_tro || '—'}
            </div>
          </div>
          <button
            onClick={onLogout}
            style={{
              width: '100%', padding: '10px', background: '#ef4444', border: 'none',
              borderRadius: '6px', color: '#fff', fontWeight: '600', cursor: 'pointer',
              fontSize: '14px', display: 'flex', alignItems: 'center',
              justifyContent: 'center', gap: '8px',
            }}
          >
            Đăng xuất
          </button>
        </div>
      </aside>
      <main className="app-main">{content}</main>
      </div>
    </>
  );
}

function PasswordChangeModal({ userId, token, onSuccess, onSkip }) {
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNewPw, setShowNewPw] = useState(false);
  const [showConfirmPw, setShowConfirmPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (newPassword.length < 6) {
      setError('Mật khẩu phải ít nhất 6 ký tự'); return;
    }
    if (newPassword !== confirmPassword) {
      setError('Mật khẩu xác nhận không khớp'); return;
    }
    setLoading(true);
    try {
      await changePassword(userId, newPassword, token);
      onSuccess();
    } catch (err) {
      const raw = err.response?.data?.detail;
      let msg = 'Đổi mật khẩu thất bại';
      if (typeof raw === 'string') {
        msg = raw;
      } else if (Array.isArray(raw)) {
        msg = raw.map(e => typeof e === 'object' && e !== null ? e.msg || JSON.stringify(e) : e).join('; ');
      } else if (typeof raw === 'object' && raw !== null) {
        msg = raw.msg || JSON.stringify(raw);
      }
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="password-change-overlay">
      <div className="password-change-modal">
        <h2>Yêu cầu đổi mật khẩu</h2>
        <p>
          Đây là lần đầu bạn đăng nhập. Vui lòng đổi mật khẩu để tiếp tục sử dụng hệ thống.
        </p>
        {error && <div className="password-change-error">{error}</div>}
        <form onSubmit={handleSubmit}>
          <label>Mật khẩu mới</label>
          <div style={{ position: 'relative' }}>
            <input
              type={showNewPw ? 'text' : 'password'}
              value={newPassword}
              onChange={e => setNewPassword(e.target.value)}
              placeholder="Nhập mật khẩu mới (ít nhất 6 ký tự)"
              maxLength={18}
              autoFocus
              style={{ paddingRight: '36px', width: '100%' }}
            />
            <button
              type="button"
              onClick={() => setShowNewPw(v => !v)}
              style={{
                position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)',
                background: 'none', border: 'none', cursor: 'pointer', fontSize: '16px', padding: '2px',
              }}
              title={showNewPw ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
            >
              {showNewPw ? '🙈' : '👁'}
            </button>
          </div>
          <label>Xác nhận mật khẩu mới</label>
          <div style={{ position: 'relative' }}>
            <input
              type={showConfirmPw ? 'text' : 'password'}
              value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)}
              placeholder="Nhập lại mật khẩu mới"
              maxLength={18}
              style={{ paddingRight: '36px', width: '100%' }}
            />
            <button
              type="button"
              onClick={() => setShowConfirmPw(v => !v)}
              style={{
                position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)',
                background: 'none', border: 'none', cursor: 'pointer', fontSize: '16px', padding: '2px',
              }}
              title={showConfirmPw ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
            >
              {showConfirmPw ? '🙈' : '👁'}
            </button>
          </div>
          <div className="form-actions">
            <button type="submit" disabled={loading}>
              {loading ? 'Đang xử lý...' : 'Đổi mật khẩu'}
            </button>
            <button type="button" onClick={onSkip}>Bỏ qua</button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default App;
