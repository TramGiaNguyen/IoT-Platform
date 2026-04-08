import React, { useEffect, useState, useCallback, useRef } from 'react';
import { fetchDevices, fetchDashboards, refreshToken } from './services';
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
import TTCDSDashboard from './components/TTCDSDashboard';
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

const REFRESH_BEFORE_SECS = 10 * 60; // refresh when < 10 minutes left
const PROACTIVE_CHECK_INTERVAL_MS = 60 * 1000; // check every 60s

function App() {
  const [token, setToken] = useState(() => localStorage.getItem('token') || '');
  const [devices, setDevices] = useState([]);
  const [isLoggedIn, setIsLoggedIn] = useState(() => !!localStorage.getItem('token'));
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

  const isAdmin = userRole === 'admin';

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
    if (!token || !isLoggedIn) return;
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

  const handleLoginSuccess = async (accessToken, refreshTk, vai_tro, pages) => {
    setToken(accessToken);
    setRefreshTokenValue(refreshTk || '');
    setUserRole(vai_tro || '');
    setAllowedPages(pages || []);
    setIsLoggedIn(true);
    localStorage.setItem('token', accessToken);
    localStorage.setItem('refreshToken', refreshTk || '');
    localStorage.setItem('userRole', vai_tro || '');
    localStorage.setItem('allowedPages', JSON.stringify(pages || []));
    // Pre-fetch dashboards cho sidebar menu (GlobalCache sẽ handle devices/rooms/rules tự động)
    await loadCustomDashboards(accessToken);
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('userRole');
    localStorage.removeItem('allowedPages');
    setToken('');
    setRefreshTokenValue('');
    setUserRole('');
    setAllowedPages([]);
    setIsLoggedIn(false);
    setDevices([]);
    setCustomDashboards([]);
    window.location.hash = '';
  };

  // Load on startup if already logged in — dashboards loaded here; devices/rooms/rules handled by GlobalCache
  // Đăng ký Service Worker ở startup
  useEffect(() => {
    if (token && isLoggedIn) {
      loadCustomDashboards(token);
    }
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch((err) => {
        console.warn('[App] SW registration failed:', err);
      });
    }
  }, []);

  if (!isLoggedIn) {
    return <Login setToken={handleLoginSuccess} />;
  }

  // GlobalCacheProvider wraps authenticated app.
  // Inside: GlobalCache.initialize() runs in its useEffect (1-time load of all data).
  return (
    <GlobalCacheProvider token={token}>
      {isLoggedIn && (
        <ActivityTracker
          onIdleTimeout={handleLogout}
        />
      )}
      <AppContent
        token={token}
        devices={devices}
        setDevices={setDevices}
        currentView={currentView}
        setCurrentView={setCurrentView}
        selectedDeviceId={selectedDeviceId}
        setSelectedDeviceId={setSelectedDeviceId}
        userRole={userRole}
        isAdmin={isAdmin}
        customDashboards={customDashboards}
        handleLogout={handleLogout}
      />
    </GlobalCacheProvider>
  );
}

// AppContent runs INSIDE GlobalCacheProvider — can call useGlobalCache()
function AppContent({
  token, devices, setDevices, currentView, setCurrentView,
  selectedDeviceId, setSelectedDeviceId, userRole, isAdmin,
  customDashboards, handleLogout,
}) {
  const { updateCache } = useGlobalCache();

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

  const openTTCDS = () => {
    window.location.hash = '#/ttcds';
    setCurrentView('ttcds');
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
      } else if (hash.startsWith('#/ttcds') || hash === '#ttcds') {
        setCurrentView('ttcds');
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
    content = <RoomManagement token={token} onBack={handleBackToDashboard} />;
    activeTab = 'rooms';
  } else if (currentView === 'room-detail' && selectedDeviceId) {
    content = <RoomDetail roomId={selectedDeviceId} token={token} />;
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
      content = <ClassManagement token={token} onBack={handleBackToDashboard} />;
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
  } else if (currentView === 'ttcds') {
    if (isAdmin) {
      content = <TTCDSDashboard token={token} />;
      activeTab = 'ttcds';
    } else {
      content = <Dashboard token={token} devices={devices} onOpenRules={openRules} onOpenRooms={openRooms} />;
      activeTab = 'dashboard';
    }
  } else {
    content = <Dashboard token={token} devices={devices} onOpenRules={openRules} onOpenRooms={openRooms} />;
    activeTab = 'dashboard';
  }

  return (
    <div className="app-shell">
      <aside className="app-sidebar">
        <div className="sidebar-logo">BDU IoT</div>
        <nav className="sidebar-nav">
          {canAccess('dashboard') && (
            <button className={activeTab === 'dashboard' ? 'active' : ''} onClick={handleBackToDashboard}>
              Dashboard
            </button>
          )}
          {canAccess('rooms') && (
            <button className={activeTab === 'rooms' ? 'active' : ''} onClick={openRooms}>
              Quan ly phong
            </button>
          )}
          {canAccess('rules') && (
            <button className={activeTab === 'rules' ? 'active' : ''} onClick={openRules}>
              Quan ly rule
            </button>
          )}
          {canAccess('alerts') && (
            <button className={activeTab === 'alerts' ? 'active' : ''} onClick={openAlerts}>
              Quan ly canh bao
            </button>
          )}
          {canAccess('device-profiles') && (
            <button className={activeTab === 'device-profiles' ? 'active' : ''} onClick={openDeviceProfiles}>
              Device Profiles
            </button>
          )}
          {canAccess('dashboards') && (
            <button className={activeTab === 'dashboards-manage' ? 'active' : ''} onClick={openDashboardsManage}>
              Quan ly Dashboard
            </button>
          )}
          {isAdmin && (
            <button className={activeTab === 'ttcds' ? 'active' : ''} onClick={openTTCDS}>
              Trung tam chuyen doi so
            </button>
          )}
          {isAdmin && (
            <button className={activeTab === 'users' ? 'active' : ''} onClick={openUsers}>
              Quan ly nguoi dung
            </button>
          )}
          {(isAdmin || userRole === 'teacher') && (
            <button className={activeTab === 'classes' ? 'active' : ''} onClick={() => {
              window.location.hash = '#/classes';
              setCurrentView('classes');
              setSelectedDeviceId(null);
            }}>
              Quan ly lop hoc
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
          <button
            onClick={handleLogout}
            style={{
              width: '100%', padding: '10px', background: '#ef4444', border: 'none',
              borderRadius: '6px', color: '#fff', fontWeight: '600', cursor: 'pointer',
              fontSize: '14px', display: 'flex', alignItems: 'center',
              justifyContent: 'center', gap: '8px',
            }}
          >
            Dang xuat
          </button>
        </div>
      </aside>
      <main className="app-main">{content}</main>
    </div>
  );
}

export default App;
