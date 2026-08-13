/**
 * Cấu hình API trung tâm cho IoT Platform
 * Tự động dùng hostname của server → hoạt động cả localhost lẫn LAN
 */

// Nếu có biến môi trường REACT_APP_API_BASE thì dùng (cho production/docker override)
// Nếu không: tự động lấy IP/hostname hiện tại của trình duyệt → hỗ trợ LAN
const _initialHost = typeof window !== 'undefined'
  ? window.location.hostname
  : 'localhost';

export const API_BASE = process.env.REACT_APP_API_BASE || `http://${_initialHost}:8000`;

if (typeof window !== 'undefined') {
  console.info('[IoT] API_BASE =', API_BASE, '| hostname =', _initialHost);
}

const initialBase = API_BASE.endsWith('/') ? API_BASE.slice(0, -1) : API_BASE;
export const WS_URL = process.env.REACT_APP_WS_URL || (
  initialBase.startsWith('https')
    ? initialBase.replace(/^https/i, 'wss') + '/ws/events'
    : initialBase.replace(/^http/i, 'ws') + '/ws/events'
);

/**
 * Lay WS_URL dong, re-read window.location.hostname moi lan goi.
 * Dung de RealtimeProvider reconnect voi hostname moi neu user chuyen
 * tu localhost -> LAN IP giua cac lan reconnect.
 */
export function getWsUrl() {
  if (typeof window === 'undefined') return WS_URL;
  const envUrl = process.env.REACT_APP_WS_URL;
  if (envUrl) return envUrl;
  // Re-derive tu hostname hien tai (khong capture luc module load)
  const host = window.location.hostname || 'localhost';
  const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
  // Mac dinh backend listen port 8000 (cung voi API_BASE)
  return `${proto}://${host}:8000/ws/events`;
}

/**
 * Lay API_BASE dong, re-read window.location.hostname moi lan goi.
 */
export function getApiBase() {
  if (typeof window === 'undefined') return API_BASE;
  const envUrl = process.env.REACT_APP_API_BASE;
  if (envUrl) return envUrl;
  const host = window.location.hostname || 'localhost';
  const proto = window.location.protocol === 'https:' ? 'https' : 'http';
  return `${proto}://${host}:8000`;
}

// AI Analyst service base URL (YOLO11s GPU service for camera analytics)
// ai_analyst runs on port 8101; same hostname resolution as API_BASE
export const AI_ANALYST_BASE = process.env.REACT_APP_AI_ANALYST_BASE || `http://${_initialHost}:8101`;
