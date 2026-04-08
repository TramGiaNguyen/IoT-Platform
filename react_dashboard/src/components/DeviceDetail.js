import React, { useState, useEffect, useRef, useCallback } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { fetchDeviceKeys, createDeviceKey, updateDeviceKey, deleteDeviceKey, detectDeviceKeys, fetchControlLines, saveControlLines, controlRelay, updateEdgeControlUrl, fetchDeviceFullConfig } from '../services';
import axios from 'axios';
import SmartClassroomDashboard from './SmartClassroomDashboard';
import { API_BASE, WS_URL } from '../config/api';
import { useGlobalCache } from '../context/GlobalCache';
import '../styles/DeviceDetail.css';

/** Mẫu JSON POST edge; backend thay {{relay}} {{state}} {{cmd}} khi bấm relay */
const DEFAULT_EDGE_BODY_TEMPLATE = `{
  "control_commands": [
    { "relay": {{relay}}, "commands": { "{{cmd}}": { "relay": {{relay}}, "state": "{{state}}" } } }
  ]
}`;

/** Tránh ECONNABORTED khi MySQL/lan chậm (5s quá ngắn cho bảng du_lieu_thiet_bi lớn) */
const DEVICE_API_TIMEOUT_MS = 30000;

const DeviceDetail = ({ deviceId, token, onBack }) => {
  // Stable ref to the current token — updates without re-triggering effects.
  // This prevents data-load effects from restarting every time the JWT rotates.
  const tokenRef = useRef(token);
  useEffect(() => { tokenRef.current = token; }, [token]);

  // Global cache — đọc NGAY để resolve device metadata không cần chờ fetch
  const { cache } = useGlobalCache();
  const [device, setDevice] = useState(null);
  const [loadError, setLoadError] = useState(null); // { status, message } — phân biệt 404 vs lỗi server/DB
  const [events, setEvents] = useState([]);
  const [chartData, setChartData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [chartKey, setChartKey] = useState('temperature'); // Default chart key
  const [activeTab, setActiveTab] = useState('overview'); // 'overview' | 'datakeys'

  // Data Keys state
  const [dataKeys, setDataKeys] = useState([]);
  const [keysLoading, setKeysLoading] = useState(false);
  const [keyFormVisible, setKeyFormVisible] = useState(false);
  const [keyEditId, setKeyEditId] = useState(null);
  const [keyForm, setKeyForm] = useState({ khoa: '', don_vi: '', mo_ta: '' });
  const [keyMsg, setKeyMsg] = useState(null);
  const [detecting, setDetecting] = useState(false);

  const [page, setPage] = useState(1);
  const [pageSize] = useState(50);
  const latestPollRef = useRef(null);

  // Control lines (relays) - mỗi relay có nút ON/OFF riêng
  const [controlLines, setControlLines] = useState([]);
  const [relayStates, setRelayStates] = useState({}); // { 1: 'ON', 2: 'OFF', ... }
  const [relayControlError, setRelayControlError] = useState(null); // lỗi POST điều khiển (hiển thị cho user)
  const [editingRelay, setEditingRelay] = useState(null); // relay_number đang sửa tên
  const [editingLabel, setEditingLabel] = useState('');
  const [editingTopic, setEditingTopic] = useState('');
  const [editingHienThiTtcds, setEditingHienThiTtcds] = useState(true);

  // Edge HTTP relay control (POST JSON control_commands xuống thiết bị LAN)
  const [edgeUrlDraft, setEdgeUrlDraft] = useState('');
  const [edgeBodyTemplateDraft, setEdgeBodyTemplateDraft] = useState(DEFAULT_EDGE_BODY_TEMPLATE);
  const [edgeUrlSaving, setEdgeUrlSaving] = useState(false);
  const [edgeUrlMsg, setEdgeUrlMsg] = useState(null);
  const [configDownloading, setConfigDownloading] = useState(false);

  // Helper functions for values
  const getStateValue = (d) => {
    const val = d?.data?.state;
    if (val && typeof val === 'object') return val.value || '';
    return val || '';
  };

  const getBrightnessValue = (d) => {
    const val = d?.data?.brightness;
    if (val && typeof val === 'object') return Number(val.value ?? 0);
    return Number(val ?? 0);
  };

  const getSetpointValue = (d) => {
    const val = d?.data?.setpoint;
    if (val && typeof val === 'object') return Number(val.value ?? 25);
    return Number(val ?? 25);
  };

  const getSensorValue = (d, key) => {
    const val = d?.data?.[key];
    if (val && typeof val === 'object') return Number(val.value ?? 0);
    return Number(val ?? 0);
  };

  /** API /latest: mỗi khoa là { value, don_vi, mo_ta, timestamp } */
  const unwrapSeriesValue = (cell) => {
    if (cell != null && typeof cell === 'object' && !Array.isArray(cell) && 'value' in cell) {
      return cell.value;
    }
    return cell;
  };

  /** relays từ MySQL có thể là mảng object hoặc chuỗi JSON */
  const coerceRelaysArray = (blob) => {
    if (blob == null) return null;
    if (Array.isArray(blob)) return blob;
    if (typeof blob === 'string') {
      try {
        const p = JSON.parse(blob);
        return Array.isArray(p) ? p : null;
      } catch {
        return null;
      }
    }
    return null;
  };

  /**
   * Relay từ gateway: relays: [{ relay: 1, state: "ON", ... }, ...]
   * KHÔNG dùng relays[1] trên mảng (đó là phần tử thứ 2, không phải relay số 1).
   */
  const getRelayState = (d, relayNum) => {
    const data = d?.data || {};
    const n = Number(relayNum);

    // Tìm theo nhiều pattern: relay_1, relay1, relay_1_pump, relay_1_light, ...
    let val = data[`relay_${n}`] ?? data[`relay${n}`];
    
    // Nếu không tìm thấy, tìm các key bắt đầu bằng relay_N_
    if (val == null || val === '') {
      const relayPrefix = `relay_${n}_`;
      const matchedKey = Object.keys(data).find(k => k.startsWith(relayPrefix));
      if (matchedKey) {
        val = data[matchedKey];
      }
    }
    
    val = unwrapSeriesValue(val);

    if (val == null || val === '') {
      const rCell = data.relays;
      let relaysBlob = unwrapSeriesValue(rCell);
      relaysBlob = coerceRelaysArray(relaysBlob) ?? relaysBlob;

      if (Array.isArray(relaysBlob)) {
        const item = relaysBlob.find(
          (r) =>
            Number(r?.relay) === n ||
            Number(r?.relay_number) === n ||
            Number(r?.id) === n
        );
        if (item != null) val = item.state ?? item.status;
      } else if (relaysBlob && typeof relaysBlob === 'object' && !Array.isArray(relaysBlob)) {
        val = relaysBlob[n] ?? relaysBlob[String(n)];
        val = unwrapSeriesValue(val);
      }
    }

    let raw =
      val != null && typeof val === 'object' && !Array.isArray(val)
        ? (val.value ?? val.state ?? val)
        : val;
    raw = (raw ?? '').toString();
    if (['1', 'true', 'on'].includes(raw.toLowerCase())) return 'ON';
    if (['0', 'false', 'off'].includes(raw.toLowerCase())) return 'OFF';
    return raw.toUpperCase() || relayStates[relayNum] || 'OFF';
  };

  // Data Keys handlers
  const loadDataKeys = useCallback(async () => {
    setKeysLoading(true);
    try {
      const res = await fetchDeviceKeys(deviceId, tokenRef.current);
      setDataKeys(res.data.keys || []);
    } catch (e) {
      console.error('Load keys failed', e);
    } finally {
      setKeysLoading(false);
    }
  }, [deviceId]); // intentionally no token — uses tokenRef

  const handleKeySubmit = async (e) => {
    e.preventDefault();
    try {
      if (keyEditId) {
        await updateDeviceKey(deviceId, keyEditId, { don_vi: keyForm.don_vi, mo_ta: keyForm.mo_ta }, token);
        setKeyMsg({ type: 'success', text: 'Đã cập nhật field thành công!' });
      } else {
        await createDeviceKey(deviceId, keyForm, token);
        setKeyMsg({ type: 'success', text: `Đã thêm field "${keyForm.khoa}" thành công!` });
      }
      setKeyFormVisible(false);
      setKeyEditId(null);
      setKeyForm({ khoa: '', don_vi: '', mo_ta: '' });
      await loadDataKeys();
    } catch (err) {
      const msg = err.response?.data?.detail || 'Thao tác thất bại';
      setKeyMsg({ type: 'error', text: msg });
    }
  };

  const handleKeyEdit = (k) => {
    setKeyForm({ khoa: k.khoa, don_vi: k.don_vi || '', mo_ta: k.mo_ta || '' });
    setKeyEditId(k.id);
    setKeyFormVisible(true);
    setKeyMsg(null);
  };

  const handleKeyDelete = async (k) => {
    if (!window.confirm(`Xóa field "${k.khoa}"?`)) return;
    try {
      await deleteDeviceKey(deviceId, k.id, token);
      setKeyMsg({ type: 'success', text: `Đã xóa field "${k.khoa}"` });
      await loadDataKeys();
    } catch (err) {
      setKeyMsg({ type: 'error', text: err.response?.data?.detail || 'Xóa thất bại' });
    }
  };

  const loadControlLines = useCallback(async () => {
    try {
      const res = await fetchControlLines(deviceId, tokenRef.current);
      setControlLines(res.data.control_lines || []);
    } catch (e) {
      console.error('Load control lines failed', e);
      setControlLines([]);
    }
  }, [deviceId]); // intentionally no token — uses tokenRef

  const handleStartEditLabel = (line) => {
    setEditingRelay(line.relay_number);
    setEditingLabel(line.ten_duong || `Relay ${line.relay_number}`);
    setEditingTopic(line.topic || '');
    setEditingHienThiTtcds(line.hien_thi_ttcds ?? true);
  };

  const handleSaveConfig = async () => {
    if (editingRelay == null) return;
    const updated = controlLines.map(l =>
      l.relay_number === editingRelay 
      ? { ...l, ten_duong: editingLabel.trim(), topic: editingTopic.trim(), hien_thi_ttcds: editingHienThiTtcds } 
      : l
    );
    setControlLines(updated);
    setEditingRelay(null);
    setEditingLabel('');
    setEditingTopic('');
    setEditingHienThiTtcds(true);
    const deviceCode = device?.ma_thiet_bi || device?.device_id || deviceId;
    try {
      await saveControlLines(deviceCode, updated, token);
    } catch (err) {
      console.error('Save config failed', err);
      loadControlLines(); // Rollback
    }
  };

  const handleAddRelay = async () => {
    const nextRelayNum = controlLines.length > 0 ? Math.max(...controlLines.map(l => l.relay_number)) + 1 : 1;
    const newLine = {
      relay_number: nextRelayNum,
      ten_duong: `Relay ${nextRelayNum}`,
      topic: '',
      hien_thi_ttcds: true
    };
    const updated = [...controlLines, newLine];
    setControlLines(updated);
    
    const deviceCode = device?.ma_thiet_bi || device?.device_id || deviceId;
    try {
      await saveControlLines(deviceCode, updated, token);
    } catch (err) {
      console.error('Failed to add relay', err);
      loadControlLines(); // rollback
    }
  };

  const handleDeleteRelay = async (relayNum) => {
    if (!window.confirm(`Xóa biến điều khiển Relay ${relayNum}?`)) return;
    const updated = controlLines.filter(l => l.relay_number !== relayNum);
    setControlLines(updated);
    setEditingRelay(null);
    const deviceCode = device?.ma_thiet_bi || device?.device_id || deviceId;
    try {
      await saveControlLines(deviceCode, updated, token);
    } catch (err) {
      console.error('Delete config failed', err);
      loadControlLines(); // Rollback
    }
  };

  useEffect(() => {
    if (!device) return;
    if (device.edge_control_url !== undefined) {
      setEdgeUrlDraft(device.edge_control_url || '');
    }
    if (device.edge_control_body_template !== undefined) {
      const t = device.edge_control_body_template;
      setEdgeBodyTemplateDraft(
        t != null && String(t).trim() ? String(t) : DEFAULT_EDGE_BODY_TEMPLATE
      );
    } else {
      setEdgeBodyTemplateDraft(DEFAULT_EDGE_BODY_TEMPLATE);
    }
  }, [device?.ma_thiet_bi, device?.edge_control_url, device?.edge_control_body_template]);

  const handleSaveEdgeUrl = async () => {
    const deviceCode = device?.ma_thiet_bi || device?.device_id || deviceId;
    if (!deviceCode) return;
    setEdgeUrlSaving(true);
    setEdgeUrlMsg(null);
    try {
      await updateEdgeControlUrl(deviceCode, edgeUrlDraft, edgeBodyTemplateDraft, token);
      setEdgeUrlMsg({ type: 'success', text: 'Đã lưu URL và mẫu body điều khiển edge.' });
      setDevice((prev) =>
        prev
          ? {
              ...prev,
              edge_control_url: edgeUrlDraft.trim() || null,
              edge_control_body_template: edgeBodyTemplateDraft.trim() || null,
            }
          : prev
      );
    } catch (err) {
      setEdgeUrlMsg({
        type: 'error',
        text: err.response?.data?.detail || err.message || 'Lưu thất bại',
      });
    } finally {
      setEdgeUrlSaving(false);
    }
  };

  const handleEnsureEightRelays = async () => {
    const deviceCode = device?.ma_thiet_bi || device?.device_id || deviceId;
    if (!deviceCode) return;
    const lines = Array.from({ length: 8 }, (_, i) => {
      const n = i + 1;
      const existing = controlLines.find((l) => l.relay_number === n);
      return {
        relay_number: n,
        ten_duong: existing?.ten_duong || `Relay ${n}`,
        topic: existing?.topic || '',
        hien_thi_ttcds: existing?.hien_thi_ttcds ?? true,
      };
    });
    try {
      await saveControlLines(deviceCode, lines, token);
      await loadControlLines();
      setEdgeUrlMsg({ type: 'success', text: 'Đã tạo/cập nhật 8 relay (1–8).' });
    } catch (err) {
      setEdgeUrlMsg({
        type: 'error',
        text: err.response?.data?.detail || 'Không lưu được control lines',
      });
    }
  };

  const handleDownloadConfig = async () => {
    setConfigDownloading(true);
    try {
      const deviceCode = device?.ma_thiet_bi || device?.device_id || deviceId;
      const res = await fetchDeviceFullConfig(deviceCode, token);
      const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(res.data, null, 2));
      const dlAnchorElem = document.createElement('a');
      dlAnchorElem.setAttribute("href", dataStr);
      dlAnchorElem.setAttribute("download", `device_${deviceCode}_config.json`);
      dlAnchorElem.click();
    } catch (err) {
      console.error('Download config failed', err);
      alert('Tải cấu hình JSON thất bại. Vui lòng thử lại.');
    } finally {
      setConfigDownloading(false);
    }
  };

  const formatControlApiError = (err) => {
    const d = err.response?.data?.detail;
    if (typeof d === 'string') return d;
    if (Array.isArray(d)) return d.map((x) => x?.msg || JSON.stringify(x)).join('; ');
    return err.message || 'Điều khiển thất bại';
  };

  const handleRelayToggle = async (relayNumber) => {
    const currentState = getRelayState(device, relayNumber);
    const nextState = currentState === 'ON' ? 'OFF' : 'ON';
    setRelayControlError(null);
    
    // Optimistic UI update directly on device object so getRelayState catches it instantly
    setDevice(prev => {
      if (!prev) return prev;
      const updatedData = { ...(prev.data || {}) };
      updatedData[`relay_${relayNumber}`] = nextState;
      return { ...prev, data: updatedData };
    });

    const deviceCode = device.ma_thiet_bi || device.device_id || deviceId;
    try {
      await controlRelay(deviceCode, relayNumber, nextState, token);
    } catch (err) {
      console.error('Relay control failed', err);
      // Rollback
      setDevice(prev => {
        if (!prev) return prev;
        const updatedData = { ...(prev.data || {}) };
        updatedData[`relay_${relayNumber}`] = currentState;
        return { ...prev, data: updatedData };
      });
      setRelayControlError(formatControlApiError(err));
    }
  };

  const handleDetectKeys = async () => {
    if (!window.confirm('Hệ thống sẽ lắng nghe dữ liệu thiết bị gửi lên trong 10 giây để tự động phát hiện các field. Tiếp tục?')) return;
    setDetecting(true);
    setKeyMsg({ type: 'info', text: 'Đang lắng nghe dữ liệu thực tế (10 giây)...' });
    try {
      const res = await detectDeviceKeys(deviceId, token);
      const newKeys = res.data.new_keys_added || [];
      setKeyMsg({
        type: 'success',
        text: newKeys.length > 0
          ? `Phát hiện và thêm ${newKeys.length} field mới: ${newKeys.map(k => k.khoa).join(', ')}`
          : `Không phát hiện field mới (${res.data.detected_keys?.length || 0} field đã tồn tại)`,
      });
      await loadDataKeys();
    } catch (err) {
      setKeyMsg({ type: 'error', text: err.response?.data?.detail || 'Detect thất bại' });
    } finally {
      setDetecting(false);
    }
  };

  // Control Handlers
  const handleTogglePower = async () => {
    if (!device) return;
    const currentState = (getStateValue(device) || '').toString().toUpperCase();
    const nextAction = currentState === 'ON' ? 'off' : 'on';

    // Optimistic update
    const nowTs = Math.floor(Date.now() / 1000);
    setDevice(prev => ({
      ...prev,
      data: {
        ...prev.data,
        state: { ...(prev.data?.state || {}), value: nextAction.toUpperCase(), timestamp: nowTs }
      }
    }));

    const deviceCode = device.ma_thiet_bi || device.device_id || deviceId;
    try {
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/b79dabf1-b019-4647-a912-96914bd03449',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'6eeaf8'},body:JSON.stringify({sessionId:'6eeaf8',location:'DeviceDetail.js:toggle',message:'control_request',data:{deviceId:deviceCode,action:nextAction},hypothesisId:'C',timestamp:Date.now()})}).catch(()=>{});
      // #endregion
      const res = await axios.post(
        `${API_BASE}/devices/${deviceCode}/control`,
        { action: nextAction },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/b79dabf1-b019-4647-a912-96914bd03449',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'6eeaf8'},body:JSON.stringify({sessionId:'6eeaf8',location:'DeviceDetail.js:toggle',message:'control_response',data:{status:res?.status,deviceId:deviceCode},hypothesisId:'C',timestamp:Date.now()})}).catch(()=>{});
      // #endregion
    } catch (err) {
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/b79dabf1-b019-4647-a912-96914bd03449',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'6eeaf8'},body:JSON.stringify({sessionId:'6eeaf8',location:'DeviceDetail.js:toggle',message:'control_error',data:{deviceId:deviceCode,error:err?.message,status:err?.response?.status},hypothesisId:'C',timestamp:Date.now()})}).catch(()=>{});
      // #endregion
      console.error('Toggle power failed', err);
    }
  };

  const handleBrightnessChange = async (e) => {
    const val = Number(e.target.value);
    const deviceCode = device.ma_thiet_bi || device.device_id || deviceId;
    // Optimistic update
    const nowTs = Math.floor(Date.now() / 1000);
    setDevice(prev => ({
      ...prev,
      data: {
        ...prev.data,
        brightness: { ...(prev.data?.brightness || {}), value: val, timestamp: nowTs }
      }
    }));

    try {
      await axios.post(
        `${API_BASE}/devices/${deviceCode}/control`,
        { action: 'brightness', value: val },
        { headers: { Authorization: `Bearer ${token}` } }
      );
    } catch (err) {
      console.error('Set brightness failed', err);
    }
  };

  const handleTempChange = async (e) => {
    const val = Number(e.target.value);
    const deviceCode = device.ma_thiet_bi || device.device_id || deviceId;
    const nowTs = Math.floor(Date.now() / 1000);
    setDevice(prev => ({
      ...prev,
      data: {
        ...prev.data,
        setpoint: { ...(prev.data?.setpoint || {}), value: val, timestamp: nowTs }
      }
    }));

    try {
      await axios.post(
        `${API_BASE}/devices/${deviceCode}/control`,
        { action: 'set_ac_temp', value: val },
        { headers: { Authorization: `Bearer ${token}` } }
      );
    } catch (err) {
      console.error('Set temp failed', err);
    }
  };

  // Hydrate device metadata từ global cache — hiển thị header/icon ngay không cần fetch
  useEffect(() => {
    if (!cache.devices?.length || device) return;
    const found = cache.devices.find(
      d => String(d.ma_thiet_bi || d.id) === String(deviceId)
    );
    if (found) {
      setDevice(found);
    }
  }, [cache.devices, deviceId]);

  // Load Data effects
  useEffect(() => {
    setLoadError(null);
    const abortCtrl = new AbortController();

    const loadDeviceData = axios.get(`${API_BASE}/devices/${deviceId}/latest`, {
      headers: { Authorization: `Bearer ${tokenRef.current}` },
      timeout: DEVICE_API_TIMEOUT_MS,
      signal: abortCtrl.signal,
    });
    const loadKeys = loadDataKeys();
    const loadLines = loadControlLines();

    loadDeviceData
      .then((deviceRes) => {
        setDevice(deviceRes.data);
        setLoading(false);
      })
      .catch((err) => {
        if (err.name === 'CanceledError' || err.code === 'ERR_CANCELED') return;
        console.error('Error loading device data:', err);
        const st = err.response?.status;
        const detail = err.response?.data?.detail;
        const msg =
          typeof detail === 'string'
            ? detail
            : Array.isArray(detail)
              ? detail.map((d) => d?.msg || JSON.stringify(d)).join('; ')
              : err.message || 'Lỗi không xác định';
        setLoadError({ status: st, message: msg });
        setDevice(null);
        setLoading(false);
      });

    Promise.all([loadKeys, loadLines]).catch(() => {});

    return () => {
      abortCtrl.abort();
    };
  }, [deviceId]); // intentionally no token — uses tokenRef; refresh rotation won't restart this effect

  // Events được load ngay khi deviceId thay đổi (không phụ thuộc token)
  useEffect(() => {
    if (!deviceId) return;
    loadEvents(1);
  }, [deviceId]);

  // Polling: /devices/{id}/latest (metrics/relay) + /events (nhật ký) cùng 5s
  // WS là realtime layer phụ — poll là HTTP backup khi WS lỗi
  useEffect(() => {
    if (!deviceId) return;
    const poll = async () => {
      try {
        const res = await axios.get(`${API_BASE}/devices/${deviceId}/latest`, {
          headers: { Authorization: `Bearer ${tokenRef.current}` },
          timeout: DEVICE_API_TIMEOUT_MS,
        });
        setDevice(prev => {
          if (!prev) return res.data;
          return {
            ...res.data,
            data: {
              ...prev.data,
              ...res.data.data,
            }
          };
        });
      } catch (err) { /* ignore */ }

      loadEvents(1, true);
    };
    latestPollRef.current = setInterval(poll, 5000);
    return () => {
      if (latestPollRef.current) clearInterval(latestPollRef.current);
    };
  }, [deviceId]); // intentionally no token — uses tokenRef; refresh rotation won't restart polling

  const loadEvents = async (targetPage = 1, silent = false) => {
    try {
      const res = await axios.get(
        `${API_BASE}/events/${deviceId}?page=${targetPage}&page_size=${pageSize}`,
        {
          headers: { Authorization: `Bearer ${tokenRef.current}` },
          timeout: DEVICE_API_TIMEOUT_MS,
        }
      );
      const sortedEvents = (res.data.events || []).sort((a, b) => b.timestamp - a.timestamp);
      setEvents(sortedEvents);
      setPage(res.data.page || targetPage);
      prepareChartData(res.data.events || []);
    } catch (err) {
      if (!silent) console.error('Error loading events:', err);
    }
  };

  const prepareChartData = (eventsList) => {
    // Chart needs ascending order (oldest to newest for timeline)
    const data = [...eventsList]
      .sort((a, b) => a.timestamp - b.timestamp)
      .slice(-50) // Last 50 points
      .map(e => ({
        ...e,
        timeStr: new Date(e.timestamp * 1000).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
      }));
    setChartData(data);
  };

  // WebSocket for realtime updates — token removed from deps so it doesn't
  // reconnect every time the JWT rotates. WS payload does not include a Bearer token.
  useEffect(() => {
    if (!deviceId) return;
    let cancelled = false;
    const ws = new WebSocket(WS_URL);
    ws.onopen = () => {
      if (cancelled) {
        try {
          ws.close();
        } catch (_) {
          /* ignore */
        }
      }
    };
    ws.onerror = () => {
      /* Không log stack — backend tắt hoặc CORS/firewall là phổ biến; trang vẫn dùng polling */
    };
    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.device_id === deviceId) {
          // Append to events history log (newest first)
          setEvents(prev => {
            const newEvent = { ...data };
            const updated = [newEvent, ...prev].slice(0, 100); // Keep max 100
            return updated;
          });

          // Append to chart data (ascending time for timeline)
          setChartData(prev => {
            const newPoint = {
              ...data,
              timeStr: data.timestamp
                ? new Date(data.timestamp * 1000).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
                : '',
            };
            const updated = [...prev, newPoint].slice(-200); // Keep last 200 points
            return updated;
          });

          // Update last_seen display (NOT device.data — đó là nơi relay state sống)
          if (data.timestamp) {
            setDevice(prev => prev ? { ...prev, last_seen: data.timestamp } : prev);
          }
        }
      } catch (e) {
        console.error('WS parse error', e);
      }
    };
    return () => {
      cancelled = true;
      if (ws.readyState === WebSocket.OPEN) {
        try {
          ws.close();
        } catch (_) { /* ignore */ }
      } else if (ws.readyState === WebSocket.CONNECTING) {
        ws.addEventListener('open', () => {
          try {
            ws.close();
          } catch (_) { /* ignore */ }
        }, { once: true });
      }
    };
  }, [deviceId]); // intentionally no token — WS doesn't use Bearer auth

  if (loading) {
    return <div className="device-detail-loading"><div className="spinner neon"></div></div>;
  }

  if (!device) {
    const is404 = loadError?.status === 404;
    const hint =
      !is404 && loadError?.message
        ? loadError.message
        : is404
          ? 'Mã trên URL không khớp thiết bị đã đăng ký (hoặc thiết bị đã bị vô hiệu hoá).'
          : '';
    return (
      <div className="device-detail-error">
        <p style={{ marginBottom: 12 }}>
          {is404 ? 'Không tìm thấy thiết bị' : 'Không tải được chi tiết thiết bị'}
        </p>
        {hint && (
          <p style={{ fontSize: '0.9rem', opacity: 0.85, maxWidth: 520, marginBottom: 12 }}>
            {hint}
          </p>
        )}
        {!is404 && loadError?.status && (
          <p style={{ fontSize: '0.8rem', opacity: 0.7 }}>HTTP {loadError.status}</p>
        )}
        <button type="button" onClick={onBack}>
          Quay lại
        </button>
      </div>
    );
  }

  const getStatus = (deviceObj) => {
    if (!deviceObj) return { status: 'offline', color: '#ef4444' };
    const rawLastSeen = Number(deviceObj.last_seen ?? 0);
    if (!rawLastSeen) return { status: 'offline', color: '#ef4444' };

    const lastSeen = rawLastSeen > 1e12 ? rawLastSeen : rawLastSeen * 1000;
    const now = Date.now();
    const diffMinutes = (now - lastSeen) / 1000 / 60;

    if (diffMinutes < 2) {
      return { status: 'online', color: '#22c55e' };
    } else if (diffMinutes < 10) {
      return { status: 'warning', color: '#f59e0b' };
    } else {
      return { status: 'offline', color: '#ef4444' };
    }
  };
  const statusInfo = getStatus(device);
  const type = device.loai_thiet_bi;
  const roomBadgeText =
    device.ten_phong ||
    (device.phong_id != null && device.phong_id !== undefined
      ? `Phòng #${device.phong_id}`
      : '') ||
    'Chưa gán phòng';
  const state = getStateValue(device);
  // Hiển thị điều khiển + URL edge: không phải sensor, hoặc đã có relay, hoặc id gợi ý gateway/controller (trước khi load control_lines xong)
  const idLower = String(device?.ma_thiet_bi || device?.device_id || '').toLowerCase();
  const showActuatorOrRelayUI =
    type !== 'sensor' ||
    controlLines.length > 0 ||
    idLower.includes('gateway') ||
    idLower.includes('controller');

  // Special Dashboard for Smart Classroom Energy
  if (type === 'smart_classroom_energy') {
    return (
      <>
        <button className="back-btn-ghost" onClick={onBack} style={{ position: 'absolute', top: '20px', left: '20px', zIndex: 1000 }}>← Quay lại</button>
        <SmartClassroomDashboard device={device} logs={events} />
      </>
    );
  }

  return (
    <div className="device-detail-page">
      <div className="detail-header-bar">
        <button className="back-btn-ghost" onClick={onBack}>← Quay lại</button>
        <div className="detail-meta">
          <span className={`status-badge ${statusInfo.status}`}>
            {statusInfo.status.toUpperCase()}
          </span>
          <span className="last-seen">
            Cập nhật: {device.last_seen ? new Date(device.last_seen * 1000).toLocaleString('vi-VN') : 'N/A'}
          </span>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="detail-tabs">
        <button
          className={`detail-tab${activeTab === 'overview' ? ' active' : ''}`}
          onClick={() => setActiveTab('overview')}
        >📊 Tổng quan</button>
        <button
          className={`detail-tab${activeTab === 'datakeys' ? ' active' : ''}`}
          onClick={() => { setActiveTab('datakeys'); setKeyMsg(null); }}
        >🔑 Trường dữ liệu ({dataKeys.length})</button>
      </div>
      <div className="detail-hero">
        <div className="hero-icon">
          {type === 'sensor' ? '🌡️' : type === 'air_conditioner' ? '❄️' : '💡'}
        </div>
        <div className="hero-info">
          <h1>{device.ten_thiet_bi || device.ma_thiet_bi}</h1>
          <p className="device-id-mono">{device.ma_thiet_bi}</p>
          <p className="room-badge">{roomBadgeText}</p>
        </div>
      </div>

      {/* ====== DATA KEYS TAB ====== */}
      {activeTab === 'datakeys' && (
        <div className="detail-grid">
          <div className="detail-card" style={{ gridColumn: '1 / -1' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h2 style={{ margin: 0 }}>Trường dữ liệu thiết bị</h2>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button
                  className="btn-ghost"
                  onClick={handleDetectKeys}
                  disabled={detecting}
                  title="Lắng nghe dữ liệu thực tế từ thiết bị trong 10 giây và tự động thêm field mới"
                >
                  {detecting ? '⏳ Đang nhận diện...' : '🔍 Tự động nhận diện'}
                </button>
                <button
                  onClick={() => { setKeyEditId(null); setKeyForm({ khoa: '', don_vi: '', mo_ta: '' }); setKeyFormVisible(true); setKeyMsg(null); }}
                >+ Thêm field</button>
              </div>
            </div>

            {keyMsg && (
              <div className={`alert-msg ${keyMsg.type}`} style={{
                padding: '0.6rem 1rem',
                borderRadius: '8px',
                marginBottom: '1rem',
                background: keyMsg.type === 'success' ? 'rgba(34,197,94,0.15)' : keyMsg.type === 'error' ? 'rgba(239,68,68,0.15)' : 'rgba(96,165,250,0.15)',
                color: keyMsg.type === 'success' ? '#4ade80' : keyMsg.type === 'error' ? '#f87171' : '#93c5fd',
                border: `1px solid ${keyMsg.type === 'success' ? '#22c55e44' : keyMsg.type === 'error' ? '#ef444444' : '#3b82f644'}`
              }}>
                {keyMsg.text}
              </div>
            )}

            {keysLoading ? (
              <p style={{ color: '#94a3b8' }}>Đang tải...</p>
            ) : dataKeys.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '2rem', color: '#64748b' }}>
                <div style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>📭</div>
                <p>Chưa có trường dữ liệu nào được định nghĩa.</p>
                <p style={{ fontSize: '0.85rem' }}>Nhấn <b>"+ Thêm field"</b> hoặc <b>"Tự động nhận diện"</b> để bắt đầu.</p>
              </div>
            ) : (
              <div className="table-responsive">
                <table className="dark-table" style={{ width: '100%' }}>
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Tên field (khóa)</th>
                      <th>Đơn vị</th>
                      <th>Mô tả</th>
                      <th>Thao tác</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dataKeys.map((k, idx) => (
                      <tr key={k.id}>
                        <td style={{ color: '#64748b' }}>{idx + 1}</td>
                        <td><span className="event-tag">{k.khoa}</span></td>
                        <td>{k.don_vi || <span style={{ color: '#475569' }}>—</span>}</td>
                        <td style={{ color: '#94a3b8', fontSize: '0.85rem' }}>{k.mo_ta || '—'}</td>
                        <td>
                          <div style={{ display: 'flex', gap: '0.4rem' }}>
                            <button style={{ padding: '0.25rem 0.65rem', fontSize: '0.8rem' }} onClick={() => handleKeyEdit(k)}>✏️ Sửa</button>
                            <button style={{ padding: '0.25rem 0.65rem', fontSize: '0.8rem', background: 'rgba(239,68,68,0.15)', color: '#f87171', border: '1px solid #ef444444' }} onClick={() => handleKeyDelete(k)}>🗑️ Xóa</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ====== OVERVIEW TAB ====== */}
      {activeTab === 'overview' && (
      <div className="detail-grid">
        {/* Control Panel for Actuators */}
        {showActuatorOrRelayUI && (
          <div className="detail-card control-card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h2 style={{ margin: 0 }}>Điều khiển</h2>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  onClick={handleAddRelay}
                  className="btn-ghost"
                  style={{ fontSize: '0.8rem', padding: '4px 8px', color: '#4ade80', borderColor: '#4ade80' }}
                >
                  + Thêm nút
                </button>
                <button
                  onClick={handleDownloadConfig}
                  className="btn-ghost"
                  disabled={configDownloading}
                  style={{ fontSize: '0.8rem', padding: '4px 8px', color: '#60a5fa', borderColor: '#60a5fa', opacity: configDownloading ? 0.6 : 1 }}
                >
                  {configDownloading ? '⏳ Đang tải...' : '⬇ Tải config'}
                </button>
              </div>
            </div>
            {relayControlError && (
              <div
                role="alert"
                style={{
                  marginBottom: 12,
                  padding: '10px 12px',
                  borderRadius: 8,
                  background: 'rgba(248,113,113,0.12)',
                  border: '1px solid rgba(248,113,113,0.45)',
                  color: '#fecaca',
                  fontSize: '0.88rem',
                  lineHeight: 1.45,
                }}
              >
                <strong>Lỗi điều khiển relay:</strong> {relayControlError}
                <button
                  type="button"
                  onClick={() => setRelayControlError(null)}
                  className="btn-ghost"
                  style={{ marginLeft: 10, padding: '2px 8px', fontSize: '0.8rem' }}
                >
                  Đóng
                </button>
              </div>
            )}
            <div className="control-row">
              {/* Nếu có control_lines (relays) → hiển thị từng relay */}
              {controlLines.length > 0 ? (
                <div className="control-relays-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '12px', width: '100%' }}>
                  {controlLines.map((line) => {
                    const rn = line.relay_number;
                    const relayState = getRelayState(device, rn);
                    const isOn = relayState === 'ON';
                    const label = line.ten_duong || `Relay ${rn}`;
                    const isEditing = editingRelay === rn;
                    return (
                      <div key={rn} className="control-group" style={{ marginBottom: 0 }}>
                        {isEditing ? (
                          <div style={{ background: '#1e293b', padding: '12px', borderRadius: '8px', marginBottom: '8px', border: '1px solid #475569' }}>
                            <label style={{ fontSize: '0.75rem', color: '#94a3b8', display: 'block', marginBottom: '4px' }}>Tên hiển thị (TT CĐS):</label>
                            <input
                              type="text"
                              value={editingLabel}
                              onChange={(e) => setEditingLabel(e.target.value)}
                              placeholder={`Tên relay ${rn}`}
                              style={{ width: '100%', marginBottom: '10px', padding: '6px 8px', borderRadius: '6px', border: '1px solid #64748b', background: '#0b1224', color: '#e2e8f0', fontSize: '0.85rem' }}
                            />
                            <label style={{ fontSize: '0.75rem', color: '#94a3b8', display: 'block', marginBottom: '4px' }}>Chèn đè MQTT Topic riêng (nếu có):</label>
                            <input 
                              type="text"
                              value={editingTopic}
                              onChange={(e) => setEditingTopic(e.target.value)}
                              placeholder={`Để trống = dùng topic mặc định`}
                              style={{ width: '100%', marginBottom: '10px', padding: '6px 8px', borderRadius: '6px', border: '1px solid #64748b', background: '#0b1224', color: '#e2e8f0', fontSize: '0.85rem' }}
                            />

                            <label style={{ display: 'flex', alignItems: 'center', fontSize: '0.8rem', color: '#cbd5e1', marginBottom: '8px', cursor: 'pointer' }}>
                              <input 
                                type="checkbox" 
                                checked={editingHienThiTtcds} 
                                onChange={(e) => setEditingHienThiTtcds(e.target.checked)} 
                                style={{ marginRight: '6px' }}
                              />
                              Hiển thị trên TT CĐS
                            </label>
                            <div style={{ display: 'flex', gap: '6px' }}>
                              <button onClick={handleSaveConfig} style={{ padding: '2px 10px', fontSize: '0.8rem', background: '#0ea5e9', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>Lưu</button>
                              <button onClick={() => setEditingRelay(null)} style={{ padding: '2px 10px', fontSize: '0.8rem', background: 'transparent', color: '#94a3b8', border: 'none', cursor: 'pointer' }}>Hủy</button>
                              <button onClick={() => handleDeleteRelay(rn)} style={{ padding: '2px 10px', fontSize: '0.8rem', background: 'transparent', color: '#f87171', border: 'none', cursor: 'pointer', marginLeft: 'auto' }}>🗑 Xóa</button>
                            </div>
                          </div>
                        ) : (
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                            <span style={{ fontSize: '0.85rem', color: '#e2e8f0', fontWeight: 'bold' }}>{label}</span>
                            <div style={{ display: 'flex', gap: '4px' }}>
                              <button onClick={() => handleStartEditLabel(line)} title="Sửa cấu hình" style={{ padding: '2px 4px', fontSize: '0.9rem', cursor: 'pointer', background: 'transparent', border: 'none', color: '#60a5fa' }} type="button">✏️</button>
                              <button onClick={() => {
                                const updated = controlLines.map(l => l.relay_number === rn ? { ...l, hien_thi_ttcds: !l.hien_thi_ttcds } : l);
                                setControlLines(updated);
                                saveControlLines(device?.ma_thiet_bi || device?.device_id || deviceId, updated, token).catch(() => loadControlLines());
                              }} title="Ẩn/hiện trên bảng TTCDS" style={{ padding: '2px 4px', fontSize: '0.9rem', cursor: 'pointer', background: 'transparent', border: 'none', opacity: line.hien_thi_ttcds ? 1 : 0.4 }} type="button">{line.hien_thi_ttcds ? '👁️' : '🙈'}</button>
                              <button onClick={() => handleDeleteRelay(rn)} title="Xóa nút điều khiển" style={{ padding: '2px 4px', fontSize: '0.9rem', cursor: 'pointer', background: 'transparent', border: 'none', color: '#f87171' }} type="button">🗑️</button>
                            </div>
                          </div>
                        )}
                        <button
                          className={`power-btn-large ${isOn ? 'active' : ''}`}
                          onClick={() => handleRelayToggle(rn)}
                          style={{ width: '100%', padding: '10px 16px' }}
                        >
                          {isOn ? 'ĐANG BẬT' : 'ĐANG TẮT'}
                        </button>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="control-group">
                  <label>Nguồn</label>
                  <button
                    className={`power-btn-large ${state === 'ON' ? 'active' : ''}`}
                    onClick={handleTogglePower}
                  >
                    {state === 'ON' ? 'ĐANG BẬT' : 'ĐANG TẮT'}
                  </button>
                </div>
              )}

              {type === 'light' && (
                <div className="control-group expanded">
                  <label>Độ sáng: {getBrightnessValue(device)}%</label>
                  <input
                    type="range"
                    min="0" max="100"
                    value={getBrightnessValue(device)}
                    onChange={handleBrightnessChange}
                    className="slider-range brightness"
                  />
                </div>
              )}

              {type === 'air_conditioner' && (
                <div className="control-group expanded">
                  <label>Nhiệt độ đặt: {getSetpointValue(device)}°C</label>
                  <input
                    type="range"
                    min="16" max="30" step="1"
                    value={getSetpointValue(device)}
                    onChange={handleTempChange}
                    className="slider-range temp"
                  />
                  <div className="temp-marks">
                    <span>16°C</span>
                    <span>30°C</span>
                  </div>
                </div>
              )}
            </div>

            {/* EDGE HTTP CONFIG UI */}
            <div style={{ marginTop: '20px', paddingTop: '16px', borderTop: '1px solid #1f2a44' }}>
              <h4 style={{ marginBottom: '12px', color: '#e2e8f0', fontSize: '0.9rem' }}>🌐 Cấu hình Webhook Mạng LAN (Dành cho thiết bị dùng HTTP)</h4>
              <p style={{ fontSize: '0.8rem', color: '#94a3b8', marginBottom: '12px', lineHeight: 1.5 }}>Nếu thiết bị không kết nối MQTT, khai báo IP/Endpoint của mạch tại đây. Khi bấm nút điều khiển ở trên, Server sẽ thay thế {'{{relay}}'}, {'{{state}}'} và bắn tự động bảng dữ liệu JSON này thẳng xuống mạch.</p>
              
              {edgeUrlMsg && (
                <div style={{ padding: '8px', marginBottom: '12px', borderRadius: '4px', fontSize: '0.8rem', background: edgeUrlMsg.type === 'success' ? '#166534' : '#991b1b', color: '#fff' }}>
                  {edgeUrlMsg.text}
                </div>
              )}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <label style={{ fontSize: '0.8rem', color: '#94a3b8' }}>Edge Control URL (VD: http://192.168.1.100/relay):</label>
                <input
                  type="text"
                  value={edgeUrlDraft}
                  onChange={e => setEdgeUrlDraft(e.target.value)}
                  placeholder="http://IP_THIET_BI:PORT/endpoint"
                  style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #475569', background: '#0b1224', color: '#e2e8f0' }}
                />
                
                <label style={{ fontSize: '0.8rem', color: '#94a3b8', marginTop: '4px' }}>Template Body (JSON):</label>
                <textarea
                  value={edgeBodyTemplateDraft}
                  onChange={e => setEdgeBodyTemplateDraft(e.target.value)}
                  style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #475569', background: '#0b1224', color: '#e2e8f0', minHeight: '80px', fontFamily: 'monospace', fontSize: '12px' }}
                />
                
                <button
                  onClick={handleSaveEdgeUrl}
                  disabled={edgeUrlSaving}
                  style={{ marginTop: '4px', alignSelf: 'flex-start', padding: '6px 16px', background: '#0ea5e9', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '0.85rem' }}
                >
                  {edgeUrlSaving ? 'Đang lưu...' : 'Lưu thiết lập HTTP Webhook'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Sensor Metrics */}
        {(type === 'sensor' || type === 'air_conditioner') && (
          <div className="detail-card metrics-card">
            <h2>Thông số môi trường</h2>
            <div className="metrics-row">
              {/* Temp */}
              <div className="metric-box">
                <div className="metric-icon temp">🌡️</div>
                <div className="metric-val">
                  {getSensorValue(device, 'temperature').toFixed(1)} <span className="unit">°C</span>
                </div>
                <div className="metric-label">Nhiệt độ</div>
              </div>
              {/* Humidity */}
              <div className="metric-box">
                <div className="metric-icon humidity">💧</div>
                <div className="metric-val">
                  {getSensorValue(device, 'humidity').toFixed(1)} <span className="unit">%</span>
                </div>
                <div className="metric-label">Độ ẩm</div>
              </div>
            </div>
          </div>
        )}

        {/* History Table */}
        <div className="detail-card history-card" style={{ gridColumn: "1 / -1" }}>
          <h2>Nhật ký hoạt động</h2>
          <div className="table-responsive">
            <table className="dark-table">
              <thead>
                <tr>
                  <th>Thời gian</th>
                  <th>Sự kiện</th>
                  <th>Chi tiết</th>
                </tr>
              </thead>
              <tbody>
                {events.map((ev, i) => (
                  <tr key={i}>
                    <td>{new Date(ev.timestamp * 1000).toLocaleString('vi-VN')}</td>
                    <td><span className="event-tag">Data Update</span></td>
                    <td className="json-cell">
                      {Object.entries(ev).filter(([k]) => !['device_id', 'timestamp', '_id'].includes(k)).map(([k, v]) => (
                        <span key={k} className="kv-pair">{k}: <b>{typeof v === 'object' && v !== null ? JSON.stringify(v) : String(v)}</b></span>
                      ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
      )}

      {/* Modal Form - Add/Edit Key */}
      {keyFormVisible && (
        <div className="modal-backdrop">
          <div className="modal">
            <div className="modal-header">
              <h3>{keyEditId ? 'Sửa Field' : 'Thêm Field dữ liệu'}</h3>
              <button onClick={() => setKeyFormVisible(false)}>✕</button>
            </div>
            <form onSubmit={handleKeySubmit} className="rule-form">
              <label>
                Tên field (khóa) *
                <input
                  value={keyForm.khoa}
                  onChange={e => setKeyForm({ ...keyForm, khoa: e.target.value })}
                  placeholder="VD: temperature, humidity, co2, voltage"
                  required
                  disabled={!!keyEditId}
                  style={keyEditId ? { opacity: 0.6, cursor: 'not-allowed' } : {}}
                />
                {keyEditId && <small style={{ color: '#64748b' }}>Tên field không thể thay đổi sau khi tạo</small>}
              </label>
              <label>
                Đơn vị
                <input
                  value={keyForm.don_vi}
                  onChange={e => setKeyForm({ ...keyForm, don_vi: e.target.value })}
                  placeholder="VD: °C, %, W, V, ppm"
                />
              </label>
              <label>
                Mô tả
                <input
                  value={keyForm.mo_ta}
                  onChange={e => setKeyForm({ ...keyForm, mo_ta: e.target.value })}
                  placeholder="VD: Nhiệt độ phòng, Nồng độ CO2..."
                />
              </label>
              <div className="form-actions">
                <button type="submit">{keyEditId ? 'Cập nhật' : 'Thêm field'}</button>
                <button type="button" onClick={() => setKeyFormVisible(false)}>Hủy</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default DeviceDetail;
