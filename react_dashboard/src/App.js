import React, { useEffect, useState, useCallback, useRef } from 'react';
import axios from 'axios';
import { fetchDevices, fetchDashboards, refreshToken, fetchMe, changePassword, fetchTeacherDevices } from './services';
import Login from './components/Login';
import ActivityTracker from './components/ActivityTracker';
import DeviceSetupWizard from './components/DeviceSetupWizard';
import Dashboard from './components/Dashboard';
import AppHeader from './components/AppHeader';
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
import { RealtimeProvider, useRealtime } from './context/RealtimeProvider';
import './styles/style.css';

// Sync realtime WS connection state len App-level `wsConnected` (cho AppHeader badge)
function useRealtimeSync(setWsConnected) {
  const { connected } = useRealtime();
  useEffect(() => {
    setWsConnected(connected);
  }, [connected, setWsConnected]);
  return { connected };
}

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
  // DEBUG: enable runtime logging when ?debug=ca9780 in URL
  if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('debug') === 'ca9780') {
    window.__ca9780_debug = true;
  }
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
  const [teacherRooms, setTeacherRooms] = useState([]); // [{id, name}, ...]
  // Password change enforcement
  const [requirePasswordChange, setRequirePasswordChange] = useState(false);
  const [pendingAuth, setPendingAuth] = useState(null); // { token, refreshToken, vai_tro, pages, phai_doi_mat_khau, userId }

  // Header / global UI state
  const [wsConnected, setWsConnected] = useState(false);
  const [theme, setTheme] = useState(() => {
    const t = localStorage.getItem('theme');
    return t === 'dark' ? 'dark' : 'light';
  });
  const [headerSearch, setHeaderSearch] = useState('');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

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
      const info = { ...res.data };
      // Derive group info from /auth/me response
      // group_nhom_ids is now returned directly by backend
      const groupNhomIds = info.group_nhom_ids || [];
      info.group_nhom_ids = groupNhomIds;
      info.primary_nhom_id = groupNhomIds.length > 0 ? groupNhomIds[0] : null;
      setUserInfo(info);
    } catch (err) {
      console.error('Failed to fetch user info:', err);
      setUserInfo(null);
    }
  }, [token]);

  const loadCustomDashboards = useCallback(async (authToken = null, workspaceId = null) => {
    const tokenToUse = authToken || token;
    if (!tokenToUse) return;
    try {
      const res = await fetchDashboards(tokenToUse, workspaceId);
      setCustomDashboards(res.data.dashboards || []);
    } catch (err) {
      console.error('Failed to load custom dashboards:', err);
      setCustomDashboards([]);
    }
  }, [token]);

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
    // Giữ nguyên workspaceContext đang chọn (nếu có trong localStorage) để không reset khi login
    const storedWs = localStorage.getItem('workspaceContext');
    const nextWs = storedWs === 'nhom' || storedWs === 'ca_nhan' ? storedWs : 'ca_nhan';
    setWorkspaceContext(nextWs);
    localStorage.setItem('refreshToken', refreshTk || '');
    localStorage.setItem('userRole', vai_tro || '');
    localStorage.setItem('allowedPages', JSON.stringify(pages || []));
    localStorage.setItem('userId', userId || '');
    await loadCustomDashboards(accessToken);
    await fetchUserInfo(accessToken);
    await loadDevices(accessToken);
    if (vai_tro === 'teacher') {
      try {
        const res = await fetchTeacherDevices(accessToken);
        setTeacherRooms(res.data?.roomIds || []);
      } catch (e) {
        console.error('Failed to load teacher devices:', e);
        setTeacherRooms([]);
      }
    }
  };

  // Minimal logout: only clears auth state (used by refreshTokenSilently on token expiry)
  // Full logout with GlobalCache.clearCache() is handled by AppContentWithTracker.onLogout
  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('userRole');
    localStorage.removeItem('allowedPages');
    localStorage.removeItem('workspaceContext');
    localStorage.removeItem('user');
    setToken('');
    setRefreshTokenValue('');
    setUserRole('');
    setAllowedPages([]);
    setIsLoggedIn(false);
    setTeacherRooms([]);
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
      if (userRole === 'teacher') {
        fetchTeacherDevices(token).then(res => setTeacherRooms(res.data?.roomIds || [])).catch(() => setTeacherRooms([]));
      }
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
          // Giữ nguyên workspaceContext đang chọn
          const storedWs = localStorage.getItem('workspaceContext');
          const nextWs = storedWs === 'nhom' || storedWs === 'ca_nhan' ? storedWs : 'ca_nhan';
          setWorkspaceContext(nextWs);
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
          // Giữ nguyên workspaceContext đang chọn
          const storedWsSkip = localStorage.getItem('workspaceContext');
          const nextWsSkip = storedWsSkip === 'nhom' || storedWsSkip === 'ca_nhan' ? storedWsSkip : 'ca_nhan';
          setWorkspaceContext(nextWsSkip);
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
  // RealtimeProvider: mo 1 WS chung (sensor + CRUD + control events).
  return (
    <RealtimeProvider>
      <GlobalCacheProvider token={token}>
        <AppContentWithTracker
          token={token}
          sidebarCollapsed={sidebarCollapsed}
          setSidebarCollapsed={setSidebarCollapsed}
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
          teacherRooms={teacherRooms}
          setTeacherRooms={setTeacherRooms}
          wsConnected={wsConnected}
          setWsConnected={setWsConnected}
          theme={theme}
          setTheme={setTheme}
          headerSearch={headerSearch}
          setHeaderSearch={setHeaderSearch}
          loadCustomDashboards={loadCustomDashboards}
        />
      </GlobalCacheProvider>
    </RealtimeProvider>
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
  teacherRooms, setTeacherRooms,
  wsConnected, setWsConnected, theme, setTheme, headerSearch, setHeaderSearch,
  sidebarCollapsed, setSidebarCollapsed,
  loadCustomDashboards,
}) {
  const { updateCache, refetch, clearCache } = useGlobalCache();
  // Realtime WS status (from RealtimeProvider)
  const { connected: realtimeConnected } = useRealtimeSync(setWsConnected);

  // Chỉ student mới có 2 workspace (cá nhân / nhóm). Admin và teacher quản lý
  // toàn bộ trong phạm vi quyền hạn của họ, không phân biệt personal/group.
  const isTeacher = userRole === 'teacher';
  const isStudent = userRole === 'student';
  const showWorkspaceSwitcher = isStudent && userInfo && userInfo.group_nhom_ids && userInfo.group_nhom_ids.length > 0;

  // Clear GlobalCache + all App state on logout
  const onLogout = useCallback(() => {
    axios.post('/auth/logout').catch(() => {});  // notify backend
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
    setTeacherRooms([]);
    localStorage.removeItem('token');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('userRole');
    localStorage.removeItem('allowedPages');
    localStorage.removeItem('workspaceContext');
    localStorage.removeItem('user');
    window.location.hash = '';
  }, [clearCache, setIsLoggedIn, setToken, setRefreshTokenValue, setUserRole, setAllowedPages, setDevices, setCustomDashboards, setUserInfo, setWorkspaceContext]);

  // Refetch khi đổi workspace context (devices via refetch, dashboards directly)
  useEffect(() => {
    if (refetch) {
      refetch({ context: workspaceContext, userInfo });
    }
    // Reload dashboards with workspace awareness
    const wsId = workspaceContext === 'nhom' ? userInfo?.primary_nhom_id : null;
    loadCustomDashboards(token, wsId);
  }, [workspaceContext, refetch, userInfo, loadCustomDashboards]);

  // Sync dashboards into global cache when App.js finishes loading.
  // NOTE [DBG-ca9780]: KHONG dong bo `devices` tu App.js devicesState vao cache.
  //   App.js load devices qua `loadDevices(token)` (API personal only, khong
  //   phan biet workspace context), nen se ghi de devices workspace-aware trong cache
  //   khi user chuyen workspaceContext. GlobalCache tu quan ly devices qua
  //   fetchFreshData(context, userInfo) nen can de no lam chu quan ly.
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

  const openDevice = (deviceId) => {
    if (!deviceId) return;
    window.location.hash = `#/devices/${deviceId}`;
    setSelectedDeviceId(String(deviceId));
    setCurrentView('device-detail');
  };

  const headerTitleForView = (() => {
    if (currentView === 'device-detail') return 'Chi tiết thiết bị';
    if (currentView === 'rules') return 'Quản lý rule';
    if (currentView === 'rooms') return 'Quản lý phòng';
    if (currentView === 'room-detail') return 'Chi tiết phòng';
    if (currentView === 'alerts') return 'Quản lý cảnh báo';
    if (currentView === 'device-profiles') return 'Device Profiles';
    if (currentView === 'dashboards-manage') return 'Quản lý Dashboard';
    if (currentView === 'dashboard-viewer') return 'Dashboard';
    if (currentView === 'users') return 'Quản lý người dùng';
    if (currentView === 'classes') return 'Quản lý lớp học';
    if (currentView === 'classroom') return 'Lớp học';
    if (currentView === 'device-setup') return 'Thiết lập thiết bị';
    return 'Tổng quan';
  })();

  const headerSubtitleForView = (() => {
    if (currentView === 'dashboard') return 'Giám sát & điều khiển thiết bị thời gian thực';
    if (currentView === 'device-detail') return 'Xem chi tiết dữ liệu, lịch sử và điều khiển thiết bị';
    if (currentView === 'rules') return 'Cấu hình rule tự động hóa cho thiết bị';
    if (currentView === 'rooms') return 'Quản lý các phòng và thiết bị trong phòng';
    if (currentView === 'alerts') return 'Theo dõi và xử lý cảnh báo hệ thống';
    if (currentView === 'users') return 'Quản lý tài khoản người dùng';
    if (currentView === 'classes') return 'Quản lý lớp học và sinh viên';
    return '';
  })();

  const handleHeaderSearch = useCallback((val) => {
    setHeaderSearch(val);
  }, []);

  const handleToggleTheme = useCallback(() => {
    setTheme(prev => {
      const next = prev === 'dark' ? 'light' : 'dark';
      localStorage.setItem('theme', next);
      return next;
    });
  }, []);

  useEffect(() => {
    if (theme === 'light') document.body.setAttribute('data-theme', 'light');
    else document.body.removeAttribute('data-theme');
  }, [theme]);

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
    content = <RulesManagement token={token} onBack={handleBackToDashboard} userInfo={userInfo} workspaceContext={workspaceContext} />;
    activeTab = 'rules';
  } else if (currentView === 'rooms') {
    content = <RoomManagement token={token} onBack={handleBackToDashboard} workspaceContext={workspaceContext} userInfo={userInfo} />;
    activeTab = 'rooms';
  } else if (currentView === 'room-detail' && selectedDeviceId) {
    content = <RoomDetail roomId={selectedDeviceId} token={token} workspaceContext={workspaceContext} />;
    activeTab = 'rooms';
  } else if (currentView === 'alerts') {
    content = <AlarmsManagement token={token} onBack={handleBackToDashboard} workspaceContext={workspaceContext} userInfo={userInfo} />;
    activeTab = 'alerts';
  } else if (currentView === 'device-profiles') {
    content = <DeviceProfilesManagement token={token} onBack={handleBackToDashboard} workspaceContext={workspaceContext} userInfo={userInfo} />;
    activeTab = 'device-profiles';
  } else if (currentView === 'users') {
    if (isAdmin) {
      content = <UserManagement token={token} onBack={handleBackToDashboard} />;
      activeTab = 'users';
    } else {
      content = <Dashboard token={token} devices={devices} onOpenRules={openRules} onOpenRooms={openRooms} workspaceContext={workspaceContext} userInfo={userInfo} userRole={userRole} isAdmin={isAdmin} isTeacher={isTeacher} teacherRooms={teacherRooms} />;
      activeTab = 'dashboard';
    }
  } else if (currentView === 'classes') {
    if (isAdmin || userRole === 'teacher') {
      content = <ClassManagement token={token} onBack={handleBackToDashboard} onClassChanged={fetchUserInfo} workspaceContext={workspaceContext} userInfo={userInfo} />;
      activeTab = 'classes';
    } else {
      content = <Dashboard token={token} devices={devices} onOpenRules={openRules} onOpenRooms={openRooms} workspaceContext={workspaceContext} userInfo={userInfo} userRole={userRole} isAdmin={isAdmin} isTeacher={isTeacher} teacherRooms={teacherRooms} />;
      activeTab = 'dashboard';
    }
  } else if (currentView === 'dashboards-manage') {
    content = <DashboardManagement token={token} onBack={handleBackToDashboard} userInfo={userInfo} workspaceContext={workspaceContext} onDashboardsChange={() => loadCustomDashboards(token, workspaceContext === 'nhom' ? userInfo?.primary_nhom_id : null)} />;
    activeTab = 'dashboards-manage';
  } else if (currentView === 'dashboard-viewer' && selectedDeviceId) {
    content = <DashboardViewer dashboardId={parseInt(selectedDeviceId)} token={token} onBack={handleBackToDashboard} />;
    activeTab = 'dashboards-manage';
  } else {
    const isTeacher = userRole === 'teacher';
content = <Dashboard token={token} devices={devices} onOpenRules={openRules} onOpenRooms={openRooms} workspaceContext={workspaceContext} userInfo={userInfo} userRole={userRole} isAdmin={isAdmin} isTeacher={isTeacher} teacherRooms={teacherRooms} onOpenDevice={openDevice} onOpenAlerts={openAlerts} onWsStatusChange={setWsConnected} headerSearch={headerSearch} />;
      activeTab = 'dashboard';
    }

  return (
    <>
      {isLoggedIn && <ActivityTracker onIdleTimeout={onLogout} />}
      <div className="app-shell">
        <aside className={`app-sidebar ${sidebarCollapsed ? 'collapsed' : ''}`}>
          <div className="sidebar-brand">
            <span className="sidebar-brand-icon">BDU</span>
            <div className="sidebar-brand-text">
              <span className="sidebar-logo-text">BDU IoT</span>
              <span className="sidebar-brand-sub">Platform</span>
            </div>
          </div>
        {showWorkspaceSwitcher && (
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
            <button className={`sidebar-item ${activeTab === 'dashboard' ? 'active' : ''}`} onClick={handleBackToDashboard}>
              <span className="material-symbols-outlined sidebar-icon">dashboard</span>
              <span>Dashboard</span>
            </button>
          )}
          {canAccess('rooms') && (
            <button className={`sidebar-item ${activeTab === 'rooms' ? 'active' : ''}`} onClick={openRooms}>
              <span className="material-symbols-outlined sidebar-icon">meeting_room</span>
              <span>Quản lý phòng</span>
            </button>
          )}
          {canAccess('rules') && (
            <button className={`sidebar-item ${activeTab === 'rules' ? 'active' : ''}`} onClick={openRules}>
              <span className="material-symbols-outlined sidebar-icon">rule</span>
              <span>Quản lý rule</span>
            </button>
          )}
          {canAccess('alerts') && (
            <button className={`sidebar-item ${activeTab === 'alerts' ? 'active' : ''}`} onClick={openAlerts}>
              <span className="material-symbols-outlined sidebar-icon">warning</span>
              <span>Quản lý cảnh báo</span>
            </button>
          )}
          {canAccess('device-profiles') && (
            <button className={`sidebar-item ${activeTab === 'device-profiles' ? 'active' : ''}`} onClick={openDeviceProfiles}>
              <span className="material-symbols-outlined sidebar-icon">settings_input_component</span>
              <span>Device Profiles</span>
            </button>
          )}
          {canAccess('dashboards') && (
            <button className={`sidebar-item ${activeTab === 'dashboards-manage' ? 'active' : ''}`} onClick={openDashboardsManage}>
              <span className="material-symbols-outlined sidebar-icon">monitoring</span>
              <span>Quản lý Dashboard</span>
            </button>
          )}
          {isAdmin && (
            <button className={`sidebar-item ${activeTab === 'users' ? 'active' : ''}`} onClick={openUsers}>
              <span className="material-symbols-outlined sidebar-icon">group</span>
              <span>Quản lý người dùng</span>
            </button>
          )}
          {(isAdmin || userRole === 'teacher') && (
            <button className={`sidebar-item ${activeTab === 'classes' ? 'active' : ''}`} onClick={() => {
              window.location.hash = '#/classes';
              setCurrentView('classes');
              setSelectedDeviceId(null);
            }}>
              <span className="material-symbols-outlined sidebar-icon">school</span>
              <span>Quản lý lớp học</span>
            </button>
          )}
        </nav>
        <button
          className="sidebar-collapse-btn"
          onClick={() => setSidebarCollapsed(prev => !prev)}
          title={sidebarCollapsed ? 'Mở rộng sidebar' : 'Thu nhỏ sidebar'}
        >
          <span className="material-symbols-outlined">
            {sidebarCollapsed ? 'chevron_right' : 'chevron_left'}
          </span>
        </button>
        <div className="sidebar-footer">
          <button
            className="sidebar-item sidebar-item-cta"
            onClick={() => {
              handleBackToDashboard();
              window.dispatchEvent(new CustomEvent('bdu-open-add-device'));
            }}
          >
            <span className="material-symbols-outlined sidebar-icon">add_circle</span>
            <span>+ Khai Báo Thiết Bị</span>
          </button>
          <a
            className="sidebar-item sidebar-item-link"
            href="/docs.html"
            target="_blank"
            rel="noopener noreferrer"
          >
            <span className="material-symbols-outlined sidebar-icon">menu_book</span>
            <span>Tải liệu hướng dẫn</span>
          </a>
        </div>
      </aside>
      <main className="app-main">
        <AppHeader
          title={headerTitleForView}
          subtitle={headerSubtitleForView}
          searchValue={headerSearch}
          onSearchChange={handleHeaderSearch}
          wsConnected={wsConnected}
          userInfo={userInfo}
          onLogout={onLogout}
          onChangePassword={() => {
            if (userInfo?.id) {
              const ev = new CustomEvent('bdu-open-password-change', { detail: { userId: userInfo.id } });
              window.dispatchEvent(ev);
            }
          }}
          theme={theme}
          onToggleTheme={handleToggleTheme}
          devices={devices}
          onNavigate={(target) => {
            if (target === 'rules') openRules();
            else openDevice(target);
          }}
          currentView={currentView}
        />
        {content}
      </main>
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
