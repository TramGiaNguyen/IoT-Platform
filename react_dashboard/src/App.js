import React, { useEffect, useState } from 'react';
import { fetchDevices, fetchDashboards } from './services';
import Login from './components/Login';
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
import { canAccessPage } from './config/pages';
import './styles/style.css';

function App() {
  // Initialize state from localStorage
  const [token, setToken] = useState(() => localStorage.getItem('token') || '');
  const [devices, setDevices] = useState([]);
  const [isLoggedIn, setIsLoggedIn] = useState(() => !!localStorage.getItem('token'));
  const [loadingDevices, setLoadingDevices] = useState(false);
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


  const isAdmin = userRole === 'admin';
  const canAccess = (pageId) => {
    return true;
  };

  const loadDevices = async (authToken = null) => {
    const tokenToUse = authToken || token;
    if (!tokenToUse) {
      console.warn('No token available to load devices');
      return;
    }

    setLoadingDevices(true);
    try {
      const r = await fetchDevices(tokenToUse);
      const devicesList = Array.isArray(r.data.devices)
        ? r.data.devices
        : [];
      setDevices(devicesList);
    } catch (err) {
      console.error('Không tải được danh sách thiết bị', err);
      setDevices([]);
    } finally {
      setLoadingDevices(false);
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

  const handleLoginSuccess = async (accessToken, vai_tro, pages) => {
    // Save to state
    setToken(accessToken);
    setUserRole(vai_tro || '');
    setAllowedPages(pages || []);
    setIsLoggedIn(true);

    // Persist to localStorage
    localStorage.setItem('token', accessToken);
    localStorage.setItem('userRole', vai_tro || '');
    localStorage.setItem('allowedPages', JSON.stringify(pages || []));

    await loadDevices(accessToken);
    await loadCustomDashboards(accessToken);
  };

  const handleWizardComplete = async () => {
    // Sau khi đăng ký thiết bị thành công, reload danh sách
    await loadDevices();
  };

  // Load custom dashboards when logged in
  useEffect(() => {
    if (isLoggedIn && token) {
      loadCustomDashboards();
    }
  }, [isLoggedIn, token]);

  // Load data on app startup if token exists
  useEffect(() => {
    if (token && isLoggedIn) {
      loadDevices(token);
      loadCustomDashboards(token);
    }
  }, []); // Run once on mount

  // Xử lý hash routing
  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash;
      if (hash.startsWith('#/rules')) {
        setCurrentView('rules');
        setSelectedDeviceId(null);
      } else       if (hash.startsWith('#/rooms')) {
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
        const dashboardId = hash.replace('#/dashboards/', '');
        setCurrentView('dashboard-viewer');
        setSelectedDeviceId(dashboardId);
      } else if (hash.startsWith('#/devices/')) {
        const deviceId = hash.replace('#/devices/', '');
        setSelectedDeviceId(deviceId);
        setCurrentView('device-detail');
      } else {
        setCurrentView('dashboard');
        setSelectedDeviceId(null);
      }
    };

    // Kiểm tra hash ban đầu
    handleHashChange();

    // Lắng nghe thay đổi hash
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

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

  const handleLogout = () => {
    // Clear localStorage
    localStorage.removeItem('token');
    localStorage.removeItem('userRole');
    localStorage.removeItem('allowedPages');
    
    // Clear state
    setToken('');
    setUserRole('');
    setAllowedPages([]);
    setIsLoggedIn(false);
    setDevices([]);
    setCustomDashboards([]);
    
    // Redirect to login
    window.location.hash = '';
  };


  if (!isLoggedIn) {
    return <Login setToken={handleLoginSuccess} />;
  }

  // Hiển thị loading khi đang tải danh sách thiết bị
  if (loadingDevices) {
    return (
      <div style={{ padding: '40px', textAlign: 'center' }}>
        <p>Đang tải...</p>
      </div>
    );
  }



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
    content = <DashboardManagement token={token} onBack={handleBackToDashboard} onDashboardsChange={loadCustomDashboards} />;
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
            <button className={activeTab === 'ttcds' ? 'active' : ''} onClick={openTTCDS}>
              Trung tâm chuyển đổi số
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
          {/* Custom Dashboards */}
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
        
        {/* Logout Button */}
        <div style={{ padding: '15px', marginTop: 'auto', borderTop: '1px solid #374151' }}>
          <button
            onClick={handleLogout}
            style={{
              width: '100%',
              padding: '10px',
              background: '#ef4444',
              border: 'none',
              borderRadius: '6px',
              color: '#fff',
              fontWeight: '600',
              cursor: 'pointer',
              fontSize: '14px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px'
            }}
          >
            🚪 Đăng xuất
          </button>
        </div>
      </aside>
      <main className="app-main">{content}</main>
    </div>
  );
}

export default App;
