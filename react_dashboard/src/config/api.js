/**
 * Cấu hình API trung tâm cho IoT Platform
 * Tự động dùng hostname của server → hoạt động cả localhost lẫn LAN
 */

// Nếu có biến môi trường REACT_APP_API_BASE thì dùng (cho production/docker override)
// Nếu không: tự động lấy IP/hostname hiện tại của trình duyệt → hỗ trợ LAN
const _host = typeof window !== 'undefined'
  ? window.location.hostname
  : 'localhost';

export const API_BASE = process.env.REACT_APP_API_BASE || `http://${_host}:8000`;

const base = API_BASE.endsWith('/') ? API_BASE.slice(0, -1) : API_BASE;
export const WS_URL = process.env.REACT_APP_WS_URL || (
  base.startsWith('https')
    ? base.replace(/^https/i, 'wss') + '/ws/events'
    : base.replace(/^http/i, 'ws') + '/ws/events'
);
