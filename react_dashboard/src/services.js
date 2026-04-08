import axios from 'axios';
import { API_BASE } from './config/api';

/** Default axios instance với interceptor xử lý 401. */
const api = axios.create({ baseURL: API_BASE, timeout: 30000 });

api.interceptors.response.use(
  response => response,
  error => {
    if (error.response?.status === 401) {
      localStorage.clear();
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export { api };

/** Timeout cho các API truy vấn MySQL/DB nặng (du_lieu_thiet_bi lớn, Docker LAN). */
const DEVICE_API_TIMEOUT_MS = 30000;

export const refreshToken = (refreshTokenValue, username, password) =>
  axios.post(`${API_BASE}/refresh`, {}, {
    headers: {
      'Content-Type': 'application/json',
      ...(refreshTokenValue ? { 'X-Refresh-Token': refreshTokenValue } : {}),
      ...(username && password ? { 'X-User': username, 'X-Password': password } : {}),
    },
  });

export const login = (username, password) =>
  axios.post(`${API_BASE}/token`, new URLSearchParams({ username, password }), {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  });

export const fetchDevices = (token) =>
  axios.get(`${API_BASE}/devices`, {
    headers: { Authorization: `Bearer ${token}` },
  });

export const fetchDevicesLatestAll = (token, workspaceId = null) =>
  axios.get(`${API_BASE}/devices/latest-all`, {
    headers: { Authorization: `Bearer ${token}` },
    params: workspaceId ? { workspace_id: workspaceId } : {},
    timeout: DEVICE_API_TIMEOUT_MS,
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

export const fetchRules = (token, status, workspaceId = null) =>
  axios.get(`${API_BASE}/rules`, {
    headers: { Authorization: `Bearer ${token}` },
    params: {
      ...(status ? { trang_thai: status } : {}),
      ...(workspaceId ? { workspace_id: workspaceId } : {})
    },
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

/** Lấy danh sách đường điều khiển (relay) của thiết bị */
export const fetchControlLines = (deviceId, token) =>
  axios.get(`${API_BASE}/devices/${deviceId}/control-lines`, {
    headers: { Authorization: `Bearer ${token}` },
  });

/** Lưu danh sách đường điều khiển (chỉ cập nhật ten_duong - tên hiển thị, relay_number giữ nguyên) */
export const saveControlLines = (deviceId, lines, token) =>
  axios.post(
    `${API_BASE}/devices/${deviceId}/control-lines`,
    { lines },
    { headers: { Authorization: `Bearer ${token}` } }
  );

/** Lấy config đầy đủ của thiết bị (mqtt, http, keys, commands) */
export const fetchDeviceFullConfig = (deviceId, token) =>
  axios.get(`${API_BASE}/devices/${deviceId}/full-config`, {
    headers: { Authorization: `Bearer ${token}` },
    timeout: DEVICE_API_TIMEOUT_MS,
  });

/** URL HTTP + template body (placeholder {{relay}} {{state}} {{cmd}}) — để trống template = format mặc định backend */
export const updateEdgeControlUrl = (deviceId, edgeControlUrl, edgeControlBodyTemplate, token) =>
  axios.put(
    `${API_BASE}/devices/${deviceId}/edge-control-url`,
    {
      edge_control_url: edgeControlUrl ?? '',
      edge_control_body_template: edgeControlBodyTemplate ?? '',
    },
    { headers: { Authorization: `Bearer ${token}` } }
  );

/** Gửi lệnh ON/OFF cho relay cụ thể (raw_payload: { relay, state }) */
export const controlRelay = (deviceId, relayNumber, state, token) =>
  axios.post(
    `${API_BASE}/devices/${deviceId}/control`,
    { action: 'relay', raw_payload: { relay: relayNumber, state } },
    { headers: { Authorization: `Bearer ${token}` } }
  );

export const fetchAcStatus = (token) =>
  axios.get(`${API_BASE}/ac/status`, {
    headers: { Authorization: `Bearer ${token}` },
  });

export const controlAcCommand = (command, token) =>
  axios.post(
    `${API_BASE}/ac/control`,
    { command },
    { headers: { Authorization: `Bearer ${token}` } }
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

export const impersonateUser = (userId, token) =>
  axios.post(`${API_BASE}/users/${userId}/impersonate`, {}, {
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

// =========================================================
// Dashboard Management APIs
// =========================================================

// List all dashboards
export const fetchDashboards = (token) =>
  axios.get(`${API_BASE}/dashboards`, {
    headers: { Authorization: `Bearer ${token}` },
  });

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
export const fetchWidgetData = (dashboardId, widgetId, timeRange, cauHinh = null, token) => {
  // Handle backwards compatibility where 4th arg is token
  const actualToken = typeof cauHinh === 'string' && cauHinh.length > 200 ? cauHinh : token;
  const actualCauHinh = typeof cauHinh === 'object' && cauHinh !== null ? cauHinh : null;
  
  return axios.post(`${API_BASE}/dashboards/${dashboardId}/widgets/${widgetId}/data`, 
    { time_range: timeRange, ...(actualCauHinh ? { cau_hinh: actualCauHinh } : {}) },
    { headers: { Authorization: `Bearer ${actualToken}` } }
  );
};
// Get device data keys
export const fetchDeviceDataKeys = (deviceId, token) =>
  axios.get(`${API_BASE}/devices/${deviceId}/data-keys`, {
    headers: { Authorization: `Bearer ${token}` },
  });

// =========================================================
// Alarms / Cảnh báo APIs
// =========================================================

export const fetchAlerts = (token, params = {}) =>
  axios.get(`${API_BASE}/alerts`, {
    headers: { Authorization: `Bearer ${token}` },
    params: { limit: 15, offset: 0, ...params },
  });

export const acknowledgeAlert = (alertId, token) =>
  axios.put(`${API_BASE}/alerts/${alertId}/acknowledge`, {}, {
    headers: { Authorization: `Bearer ${token}` },
  });

export const resolveAlert = (alertId, ghiChu, token) =>
  axios.put(`${API_BASE}/alerts/${alertId}/resolve`, null, {
    headers: { Authorization: `Bearer ${token}` },
    params: { ghi_chu: ghiChu || '' },
  });

// =========================================================
// Scheduled Rules APIs
// =========================================================

export const fetchScheduledRules = (token, params = {}, workspaceId = null) =>
  axios.get(`${API_BASE}/scheduled-rules`, {
    headers: { Authorization: `Bearer ${token}` },
    params: workspaceId ? { ...params, workspace_id: workspaceId } : params,
  });

export const createScheduledRule = (data, token) =>
  axios.post(`${API_BASE}/scheduled-rules`, data, {
    headers: { Authorization: `Bearer ${token}` },
  });

export const updateScheduledRule = (id, data, token) =>
  axios.put(`${API_BASE}/scheduled-rules/${id}`, data, {
    headers: { Authorization: `Bearer ${token}` },
  });

export const deleteScheduledRule = (id, token) =>
  axios.delete(`${API_BASE}/scheduled-rules/${id}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

// =========================================================
// Device Profiles APIs
// =========================================================

export const fetchDeviceProfiles = (token, deviceId) =>
  axios.get(`${API_BASE}/device-profiles`, {
    headers: { Authorization: `Bearer ${token}` },
    params: deviceId ? { device_id: deviceId } : {},
  });

export const createDeviceProfile = (data, token) =>
  axios.post(`${API_BASE}/device-profiles`, data, {
    headers: { Authorization: `Bearer ${token}` },
  });

export const updateDeviceProfile = (id, data, token) =>
  axios.put(`${API_BASE}/device-profiles/${id}`, data, {
    headers: { Authorization: `Bearer ${token}` },
  });

export const deleteDeviceProfile = (id, token) =>
  axios.delete(`${API_BASE}/device-profiles/${id}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

// =========================================================
// Device Data Keys (khoa_du_lieu) APIs
// =========================================================

export const fetchDeviceKeys = (deviceId, token) =>
  axios.get(`${API_BASE}/devices/${deviceId}/keys`, {
    headers: { Authorization: `Bearer ${token}` },
  });

export const createDeviceKey = (deviceId, data, token) =>
  axios.post(`${API_BASE}/devices/${deviceId}/keys`, data, {
    headers: { Authorization: `Bearer ${token}` },
  });

export const updateDeviceKey = (deviceId, keyId, data, token) =>
  axios.put(`${API_BASE}/devices/${deviceId}/keys/${keyId}`, data, {
    headers: { Authorization: `Bearer ${token}` },
  });

export const deleteDeviceKey = (deviceId, keyId, token) =>
  axios.delete(`${API_BASE}/devices/${deviceId}/keys/${keyId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

export const detectDeviceKeys = (deviceId, token) =>
  axios.post(`${API_BASE}/devices/${deviceId}/detect-keys`, {}, {
    headers: { Authorization: `Bearer ${token}` },
    timeout: 20000,
  });

export const fetchRoomDeviceData = (roomId, token) =>
  axios.get(`${API_BASE}/rooms/${roomId}/data`, {
    headers: { Authorization: `Bearer ${token}` },
  });

// =========================================================
// Camera management APIs
// =========================================================
export const fetchRoomCameras = (roomId, token) =>
  axios.get(`${API_BASE}/rooms/${roomId}/cameras`, {
    headers: { Authorization: `Bearer ${token}` },
  });

export const createRoomCamera = (roomId, data, token) =>
  axios.post(`${API_BASE}/rooms/${roomId}/cameras`, data, {
    headers: { Authorization: `Bearer ${token}` },
  });

export const updateRoomCamera = (roomId, cameraId, data, token) =>
  axios.put(`${API_BASE}/rooms/${roomId}/cameras/${cameraId}`, data, {
    headers: { Authorization: `Bearer ${token}` },
  });

export const deleteRoomCamera = (roomId, cameraId, token) =>
  axios.delete(`${API_BASE}/rooms/${roomId}/cameras/${cameraId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

// =========================================================
// Room occupancy APIs
// =========================================================
export const fetchRoomOccupancy = (roomId, token) =>
  axios.get(`${API_BASE}/rooms/${roomId}/occupancy`, {
    headers: { Authorization: `Bearer ${token}` },
  });

// =========================================================
// Class (lop_hoc) APIs
// =========================================================
export const fetchClasses = (token) =>
  axios.get(`${API_BASE}/classes`, {
    headers: { Authorization: `Bearer ${token}` },
  });

export const createClass = (data, token) =>
  axios.post(`${API_BASE}/classes`, data, {
    headers: { Authorization: `Bearer ${token}` },
  });

export const deleteClass = (classId, token) =>
  axios.delete(`${API_BASE}/classes/${classId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });