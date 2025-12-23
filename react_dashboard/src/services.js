import axios from 'axios';

const API_BASE = process.env.REACT_APP_API_BASE || 'http://localhost:8000';

export const login = (username, password) =>
  axios.post(`${API_BASE}/token`, new URLSearchParams({ username, password }), {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  });

export const fetchDevices = (token) =>
  axios.get(`${API_BASE}/devices`, {
    headers: { Authorization: `Bearer ${token}` },
  });

export const fetchDevicesLatestAll = (token) =>
  axios.get(`${API_BASE}/devices/latest-all`, {
    headers: { Authorization: `Bearer ${token}` },
  });

export const fetchDeviceLatest = (deviceId, token) =>
  axios.get(`${API_BASE}/devices/${deviceId}/latest`, {
    headers: { Authorization: `Bearer ${token}` },
  });

export const fetchDeviceEvents = (deviceId, token) =>
  axios.get(`${API_BASE}/events/${deviceId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

export const discoverDevices = (token) =>
  axios.get(`${API_BASE}/devices/discover`, {
    headers: { Authorization: `Bearer ${token}` },
  });

export const registerDevice = (deviceData, token) =>
  axios.post(`${API_BASE}/devices/register`, deviceData, {
    headers: { Authorization: `Bearer ${token}` },
  });

export const fetchRooms = (token) =>
  axios.get(`${API_BASE}/rooms`, {
    headers: { Authorization: `Bearer ${token}` },
  });

export const createRoom = (data, token) =>
  axios.post(`${API_BASE}/rooms`, data, {
    headers: { Authorization: `Bearer ${token}` },
  });

export const updateRoom = (roomId, data, token) =>
  axios.put(`${API_BASE}/rooms/${roomId}`, data, {
    headers: { Authorization: `Bearer ${token}` },
  });

export const deleteRoom = (roomId, token) =>
  axios.delete(`${API_BASE}/rooms/${roomId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

export const fetchDevicesByRoom = (roomId, token) =>
  axios.get(`${API_BASE}/rooms/${roomId}/devices`, {
    headers: { Authorization: `Bearer ${token}` },
  });

export const fetchRules = (token, status) =>
  axios.get(`${API_BASE}/rules`, {
    headers: { Authorization: `Bearer ${token}` },
    params: status ? { trang_thai: status } : {},
  });

export const createRule = (data, token) =>
  axios.post(`${API_BASE}/rules`, data, {
    headers: { Authorization: `Bearer ${token}` },
  });

export const updateRule = (ruleId, data, token) =>
  axios.put(`${API_BASE}/rules/${ruleId}`, data, {
    headers: { Authorization: `Bearer ${token}` },
  });

export const deleteRule = (ruleId, token) =>
  axios.delete(`${API_BASE}/rules/${ruleId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

export const updateDeviceRoom = (deviceId, phongId, token) =>
  axios.put(
    `${API_BASE}/devices/${deviceId}/room`,
    { phong_id: phongId },
    {
      headers: { Authorization: `Bearer ${token}` },
    }
  );

export const controlDevice = (deviceId, action, value, token) =>
  axios.post(
    `${API_BASE}/devices/${deviceId}/control`,
    { action, value },
    {
      headers: { Authorization: `Bearer ${token}` },
    }
  );

// User Management
export const fetchUsers = (token) =>
  axios.get(`${API_BASE}/users`, {
    headers: { Authorization: `Bearer ${token}` },
  });

export const createUser = (data, token) =>
  axios.post(`${API_BASE}/users`, data, {
    headers: { Authorization: `Bearer ${token}` },
  });

export const updateUser = (userId, data, token) =>
  axios.put(`${API_BASE}/users/${userId}`, data, {
    headers: { Authorization: `Bearer ${token}` },
  });

export const deleteUser = (userId, token) =>
  axios.delete(`${API_BASE}/users/${userId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

// User Permissions
export const fetchUserPermissions = (userId, token) =>
  axios.get(`${API_BASE}/users/${userId}/permissions`, {
    headers: { Authorization: `Bearer ${token}` },
  });

export const updateUserPermissions = (userId, pages, token) =>
  axios.put(`${API_BASE}/users/${userId}/permissions`, { pages }, {
    headers: { Authorization: `Bearer ${token}` },
  });

// Smart Garden
export const fetchGardenData = (token) =>
  axios.get(`${API_BASE}/garden/latest`, {
    headers: { Authorization: `Bearer ${token}` },
  });

export const sendGardenControl = (token, command) =>
  axios.post(`${API_BASE}/garden/control`, { command }, {
    headers: { Authorization: `Bearer ${token}` },
  });

// =========================================================
// Dashboard Management APIs
// =========================================================

// List all dashboards
export const fetchDashboards = (token) => {
  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/b79dabf1-b019-4647-a912-96914bd03449',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'services.js:152',message:'fetchDashboards entry',data:{hasToken:!!token},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
  // #endregion
  return axios.get(`${API_BASE}/dashboards`, {
    headers: { Authorization: `Bearer ${token}` },
  }).then(res => {
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/b79dabf1-b019-4647-a912-96914bd03449',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'services.js:156',message:'fetchDashboards success',data:{count:res.data?.dashboards?.length||0},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
    // #endregion
    return res;
  }).catch(err => {
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/b79dabf1-b019-4647-a912-96914bd03449',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'services.js:160',message:'fetchDashboards error',data:{error:err.message,status:err.response?.status},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
    // #endregion
    throw err;
  });
};

// Get dashboard detail with widgets
export const fetchDashboard = (dashboardId, token) =>
  axios.get(`${API_BASE}/dashboards/${dashboardId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

// Create new dashboard
export const createDashboard = (data, token) =>
  axios.post(`${API_BASE}/dashboards`, data, {
    headers: { Authorization: `Bearer ${token}` },
  });

// Update dashboard
export const updateDashboard = (dashboardId, data, token) =>
  axios.put(`${API_BASE}/dashboards/${dashboardId}`, data, {
    headers: { Authorization: `Bearer ${token}` },
  });

// Delete dashboard
export const deleteDashboard = (dashboardId, token) =>
  axios.delete(`${API_BASE}/dashboards/${dashboardId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

// Widget APIs
export const createWidget = (dashboardId, data, token) =>
  axios.post(`${API_BASE}/dashboards/${dashboardId}/widgets`, data, {
    headers: { Authorization: `Bearer ${token}` },
  });

export const updateWidget = (dashboardId, widgetId, data, token) =>
  axios.put(`${API_BASE}/dashboards/${dashboardId}/widgets/${widgetId}`, data, {
    headers: { Authorization: `Bearer ${token}` },
  });

export const deleteWidget = (dashboardId, widgetId, token) =>
  axios.delete(`${API_BASE}/dashboards/${dashboardId}/widgets/${widgetId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

// Get widget data (real-time)
export const fetchWidgetData = (dashboardId, widgetId, timeRange, token) =>
  axios.post(
    `${API_BASE}/dashboards/${dashboardId}/widgets/${widgetId}/data`,
    { time_range: timeRange },
    {
      headers: { Authorization: `Bearer ${token}` },
    }
  );

// Get device data keys
export const fetchDeviceDataKeys = (deviceId, token) => {
  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/b79dabf1-b019-4647-a912-96914bd03449',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'services.js:208',message:'fetchDeviceDataKeys entry',data:{deviceId,hasToken:!!token},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
  // #endregion
  return axios.get(`${API_BASE}/devices/${deviceId}/data-keys`, {
    headers: { Authorization: `Bearer ${token}` },
  }).then(res => {
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/b79dabf1-b019-4647-a912-96914bd03449',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'services.js:212',message:'fetchDeviceDataKeys success',data:{deviceId,keysCount:res.data?.data_keys?.length||0},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
    // #endregion
    return res;
  }).catch(err => {
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/b79dabf1-b019-4647-a912-96914bd03449',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'services.js:216',message:'fetchDeviceDataKeys error',data:{deviceId,error:err.message,status:err.response?.status},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
    // #endregion
    throw err;
  });
};