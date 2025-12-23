import React, { useEffect, useState } from 'react';
import { fetchDevices, fetchDashboards } from './services';
import Login from './components/Login';
import DeviceSetupWizard from './components/DeviceSetupWizard';
import Dashboard from './components/Dashboard';
import DeviceDetail from './components/DeviceDetail';
import RulesManagement from './components/RulesManagement';
import RoomManagement from './components/RoomManagement';
import UserManagement from './components/UserManagement';
import SmartGarden from './components/SmartGarden';
import SmartClassroom from './components/SmartClassroom';
import DashboardManagement from './components/DashboardManagement';
import DashboardViewer from './components/DashboardViewer/DashboardViewer';
import { canAccessPage } from './config/pages';
import './styles/style.css';

function App() {
  const [token, setToken] = useState('');
  const [devices, setDevices] = useState([]);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [loadingDevices, setLoadingDevices] = useState(false);
  const [currentView, setCurrentView] = useState('dashboard');
  const [selectedDeviceId, setSelectedDeviceId] = useState(null);
  const [userRole, setUserRole] = useState('');
  const [allowedPages, setAllowedPages] = useState([]);
  const [customDashboards, setCustomDashboards] = useState([]);

  // Debug logs
  console.log('[App] userRole:', userRole, 'allowedPages:', allowedPages);

  const isAdmin = userRole === 'admin';
  const canAccess = (pageId) => {
    if (isAdmin) return true;
    if (allowedPages && allowedPages.includes('*')) return true;
    return allowedPages && allowedPages.includes(pageId);
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
      // API trả về {devices: [{id, ma_thiet_bi, ten_thiet_bi, ...}, ...]}
      const devicesList = Array.isArray(r.data.devices)
        ? r.data.devices
        : [];
      setDevices(devicesList);
      console.log('Loaded devices:', devicesList, 'Count:', devicesList.length);
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
    setToken(accessToken);
    setUserRole(vai_tro || '');
    setAllowedPages(pages || []);
    setIsLoggedIn(true);
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

  // Xử lý hash routing
  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash;
      if (hash.startsWith('#/rules')) {
        setCurrentView('rules');
        setSelectedDeviceId(null);
      } else if (hash.startsWith('#/rooms')) {
        setCurrentView('rooms');
        setSelectedDeviceId(null);
      } else if (hash.startsWith('#/users')) {
        setCurrentView('users');
        setSelectedDeviceId(null);
      } else if (hash.startsWith('#/garden') || hash === '#garden') {
        setCurrentView('garden');
        setSelectedDeviceId(null);
      } else if (hash.startsWith('#/classroom') || hash === '#classroom') {
        setCurrentView('classroom');
        setSelectedDeviceId(null);
      } else if (hash.startsWith('#/dashboards-manage') || hash === '#dashboards-manage') {
        setCurrentView('dashboards-manage');
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

  // Kiểm tra nếu chưa có thiết bị nào → hiển thị wizard
  if (devices.length === 0) {
    return <DeviceSetupWizard token={token} onComplete={handleWizardComplete} />;
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
  } else if (currentView === 'users') {
    content = <UserManagement token={token} onBack={handleBackToDashboard} />;
    activeTab = 'users';
  } else if (currentView === 'garden') {
    content = <SmartGarden token={token} onBack={handleBackToDashboard} />;
    activeTab = 'garden';
  } else if (currentView === 'classroom') {
    content = <SmartClassroom token={token} onBack={handleBackToDashboard} />;
    activeTab = 'classroom';
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
          {canAccess('classroom') && (
            <button className={activeTab === 'classroom' ? 'active' : ''} onClick={() => window.location.hash = '#classroom'}>
              Lớp học thông minh
            </button>
          )}
          {canAccess('garden') && (
            <button className={activeTab === 'garden' ? 'active' : ''} onClick={() => { setCurrentView('garden'); window.location.hash = '#/garden'; }}>
              Vườn thông minh
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
              {dashboard.icon === 'dashboard' && '📊'}
              {dashboard.icon === 'chart' && '📈'}
              {dashboard.icon === 'monitor' && '🖥️'}
              {dashboard.icon === 'home' && '🏠'}
              {dashboard.icon === 'building' && '🏢'}
              {dashboard.icon === 'garden' && '🌿'}
              {dashboard.icon === 'classroom' && '🏫'}
              {dashboard.icon === 'factory' && '🏭'}
              {' '}
              {dashboard.ten_dashboard}
            </button>
          ))}
        </nav>
      </aside>
      <main className="app-main">{content}</main>
    </div>
  );
}

export default App;
