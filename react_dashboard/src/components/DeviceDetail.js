import React, { useState, useEffect, useRef, useCallback } from 'react';
import { fetchDeviceKeys, createDeviceKey, updateDeviceKey, deleteDeviceKey, detectDeviceKeys, fetchControlLines, saveControlLines, controlRelay, updateEdgeControlUrl, fetchDeviceFullConfig } from '../services';
import axios from 'axios';
import SmartClassroomDashboard from './SmartClassroomDashboard';
import { API_BASE, WS_URL } from '../config/api';
import { useGlobalCache } from '../context/GlobalCache';
import '../styles/DeviceDetail.css';

const DEFAULT_EDGE_BODY_TEMPLATE = `{
  "control_commands": [
    { "relay": {{relay}}, "commands": { "{{cmd}}": { "relay": {{relay}}, "state": "{{state}}" } } }
  ]
}`;

const DEVICE_API_TIMEOUT_MS = 30000;

const DeviceDetail = ({ deviceId, token, onBack }) => {
  const tokenRef = useRef(token);
  useEffect(() => { tokenRef.current = token; }, [token]);

  const { cache } = useGlobalCache();
  const [device, setDevice] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [events, setEvents] = useState([]);
  const [chartData, setChartData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [chartKey, setChartKey] = useState('temperature');
  const [activeTab, setActiveTab] = useState('overview');

  // Data Keys
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
  const relayRangeTimersRef = useRef({});

  const CONTROL_TYPES = [
    { value: 'on_off', label: 'Công tắc ON/OFF', states: ['ON', 'OFF'] },
    { value: 'three_way', label: 'Công tắc gạt 3 trạng thái', states: ['LOW', 'MED', 'HIGH'] },
    { value: 'momentary', label: 'Công tắc hành trình nhấn thả', states: ['PRESS'] },
    { value: 'range', label: 'Núm vặn 0-100', states: Array.from({ length: 101 }, (_, i) => String(i)) },
  ];

  // Control lines
  const [controlLines, setControlLines] = useState([]);
  const [relayStates, setRelayStates] = useState({});
  const [relayControlError, setRelayControlError] = useState(null);
  const [editingRelay, setEditingRelay] = useState(null);
  const [editingLabel, setEditingLabel] = useState('');
  const [editingTopic, setEditingTopic] = useState('');
  const [editingHienThiTtcds, setEditingHienThiTtcds] = useState(true);
  const [editingControlType, setEditingControlType] = useState('on_off');

  // Edge
  const [edgeUrlDraft, setEdgeUrlDraft] = useState('');
  const [edgeBodyTemplateDraft, setEdgeBodyTemplateDraft] = useState(DEFAULT_EDGE_BODY_TEMPLATE);
  const [edgeUrlSaving, setEdgeUrlSaving] = useState(false);
  const [edgeUrlMsg, setEdgeUrlMsg] = useState(null);
  const [configDownloading, setConfigDownloading] = useState(false);
  const [sampleCopied, setSampleCopied] = useState(false);

  // --- Helpers ---
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

  const unwrapSeriesValue = (cell) => {
    if (cell != null && typeof cell === 'object' && !Array.isArray(cell) && 'value' in cell) {
      return cell.value;
    }
    return cell;
  };

  const coerceRelaysArray = (blob) => {
    if (blob == null) return null;
    if (Array.isArray(blob)) return blob;
    if (typeof blob === 'string') {
      try {
        const p = JSON.parse(blob);
        return Array.isArray(p) ? p : null;
      } catch { return null; }
    }
    return null;
  };

  const getRelayState = (d, relayNum) => {
    const data = d?.data || {};
    const n = Number(relayNum);
    let val = data[`relay_${n}`] ?? data[`relay${n}`];
    if (val == null || val === '') {
      const relayPrefix = `relay_${n}_`;
      const matchedKey = Object.keys(data).find(k => k.startsWith(relayPrefix));
      if (matchedKey) val = data[matchedKey];
    }
    val = unwrapSeriesValue(val);
    if (val == null || val === '') {
      const rCell = data.relays;
      let relaysBlob = unwrapSeriesValue(rCell);
      relaysBlob = coerceRelaysArray(relaysBlob) ?? relaysBlob;
      if (Array.isArray(relaysBlob)) {
        const item = relaysBlob.find(r =>
          Number(r?.relay) === n || Number(r?.relay_number) === n || Number(r?.id) === n
        );
        if (item != null) val = item.state ?? item.status;
      } else if (relaysBlob && typeof relaysBlob === 'object' && !Array.isArray(relaysBlob)) {
        val = relaysBlob[n] ?? relaysBlob[String(n)];
        val = unwrapSeriesValue(val);
      }
    }
    let raw = val != null && typeof val === 'object' && !Array.isArray(val)
      ? (val.value ?? val.state ?? val) : val;
    raw = (raw ?? '').toString();
    if (['1', 'true', 'on'].includes(raw.toLowerCase())) return 'ON';
    if (['0', 'false', 'off'].includes(raw.toLowerCase())) return 'OFF';
    return raw.toUpperCase() || relayStates[relayNum] || 'OFF';
  };

  // --- Data Keys handlers ---
  const loadDataKeys = useCallback(async () => {
    setKeysLoading(true);
    try {
      const res = await fetchDeviceKeys(deviceId, tokenRef.current);
      setDataKeys(res.data.keys || []);
    } catch (e) { console.error('Load keys failed', e); }
    finally { setKeysLoading(false); }
  }, [deviceId]);

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
      setKeyMsg({ type: 'error', text: err.response?.data?.detail || 'Thao tác thất bại' });
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
    } catch (e) { console.error('Load control lines failed', e); setControlLines([]); }
  }, [deviceId]);

  const handleStartEditLabel = (line) => {
    setEditingRelay(line.relay_number);
    setEditingLabel(line.ten_duong || `Relay ${line.relay_number}`);
    setEditingTopic(line.topic || '');
    setEditingHienThiTtcds(line.hien_thi_ttcds ?? true);
    setEditingControlType(line.control_type || 'on_off');
  };

  const handleSaveConfig = async () => {
    if (editingRelay == null) return;
    const updated = controlLines.map(l =>
      l.relay_number === editingRelay
        ? { ...l, ten_duong: editingLabel.trim(), topic: editingTopic.trim(), hien_thi_ttcds: editingHienThiTtcds, control_type: editingControlType }
        : l
    );
    setControlLines(updated);
    setEditingRelay(null);
    setEditingLabel(''); setEditingTopic(''); setEditingHienThiTtcds(true); setEditingControlType('on_off');
    try {
      await saveControlLines(deviceId, updated, token);
    } catch (err) {
      console.error('Save config failed', err);
      loadControlLines();
    }
  };

  const handleAddRelay = async () => {
    const nextRelayNum = controlLines.length > 0 ? Math.max(...controlLines.map(l => l.relay_number)) + 1 : 1;
    const newLine = { relay_number: nextRelayNum, ten_duong: `Relay ${nextRelayNum}`, topic: '', hien_thi_ttcds: true, control_type: 'on_off' };
    const updated = [...controlLines, newLine];
    setControlLines(updated);
    try {
      await saveControlLines(deviceId, updated, token);
    } catch (err) {
      console.error('Failed to add relay', err);
      setControlLines(prev => prev.filter(l => l.relay_number !== nextRelayNum));
    }
  };

  const handleDeleteRelay = async (relayNum) => {
    if (!window.confirm(`Xóa biến điều khiển Relay ${relayNum}?`)) return;
    const originalLines = controlLines;
    const updated = controlLines.filter(l => l.relay_number !== relayNum);
    setControlLines(updated);
    setEditingRelay(null);
    try {
      await saveControlLines(deviceId, updated, token);
    } catch (err) {
      console.error('Delete config failed', err);
      setControlLines(originalLines);
    }
  };

  useEffect(() => {
    if (!device) return;
    if (device.edge_control_url !== undefined) setEdgeUrlDraft(device.edge_control_url || '');
    if (device.edge_control_body_template !== undefined) {
      const t = device.edge_control_body_template;
      setEdgeBodyTemplateDraft(t != null && String(t).trim() ? String(t) : DEFAULT_EDGE_BODY_TEMPLATE);
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
      setDevice(prev => prev ? { ...prev, edge_control_url: edgeUrlDraft.trim() || null, edge_control_body_template: edgeBodyTemplateDraft.trim() || null } : prev);
    } catch (err) {
      setEdgeUrlMsg({ type: 'error', text: err.response?.data?.detail || err.message || 'Lưu thất bại' });
    } finally {
      setEdgeUrlSaving(false);
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

  // --- Sinh code mẫu ESP32 Arduino theo cấu hình thiết bị ---
  const buildSampleCode = useCallback(() => {
    const deviceCode = device?.ma_thiet_bi || device?.device_id || deviceId;
    if (!deviceCode) return '';
    const proto = (device?.protocol || 'mqtt').toLowerCase();
    const protocolHost = window.location.hostname || '192.168.1.1';
    const httpPort = 8000;
    const ingestUrl = `http://${protocolHost}:${httpPort}/api/v1/ingest`;
    const httpKey = device?.http_api_key || '<HTTP_API_KEY>';
    const mqttUser = deviceCode;
    const mqttPass = device?.secret_key || '<MQTT_PASSWORD>';
    const mqttBroker = protocolHost;
    const edgeUrl = device?.edge_control_url || `http://<ESP32_IP>/relay`;

    const keys = Array.isArray(dataKeys) ? dataKeys : [];
    const dataKeysCpp = keys.length
      ? keys.map(k => {
          const key = k.khoa || k.key || 'value';
          const unit = k.don_vi || '';
          return `  float ${key} = 0.0;  // ${unit}`;
        }).join('\n')
      : '  float temperature = 25.5;\n  int humidity = 60;';

    const dataPayloadCpp = keys.length
      ? keys.map(k => {
          const key = k.khoa || k.key || 'value';
          return `    "${key}":${key},`;
        }).join('\n')
      : `    "temperature":${'{'}temperature, 1{'}'},
    "humidity":${'{'}humidity{'}'},`;

    const lines = Array.isArray(controlLines) ? controlLines : [];
    const relayCpp = lines.length
      ? lines.map(l => {
          const n = l.relay_number || 1;
          return `  // Relay ${n}: ${l.ten_duong || ''} (topic: ${l.topic || 'devices/' + deviceCode + '/relay/' + n})\n  relayStates[${n}] = false;`;
        }).join('\n')
      : `  // Relay 1 (mặc định)
  relayStates[1] = false;`;

    const isMqtt = proto === 'mqtt' || proto === 'both';
    const isHttp = proto === 'http' || proto === 'both';

    const ingestHttpBlock = isHttp ? `// ================= HTTP INGEST =================
const char* INGEST_URL    = "${ingestUrl}";
const char* HTTP_API_KEY  = "${httpKey}";

void sendHttpData() {
  if (WiFi.status() != WL_CONNECTED) return;
  HTTPClient http;
  http.begin(INGEST_URL);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("X-API-Key", HTTP_API_KEY);

  String payload = "{";
  payload += "\\"device_id\\":\\"" + String(DEVICE_ID) + "\\",";
  payload += "\\"data\\":{";
${dataPayloadCpp}
  payload += "}}";

  int code = http.POST(payload);
  if (code > 0) {
    Serial.print("HTTP OK: ");
    Serial.println(code);
  } else {
    Serial.print("HTTP ERR: ");
    Serial.println(http.errorToString(code));
  }
  http.end();
}
` : '';

    const ingestMqttBlock = isMqtt ? `// ================= MQTT INGEST =================
const char* MQTT_BROKER  = "${mqttBroker}";
const int   MQTT_PORT    = 1883;
const char* MQTT_USER    = "${mqttUser}";
const char* MQTT_PASS    = "${mqttPass}";
const char* TOPIC_DATA   = "devices/${deviceCode}/data";
const char* TOPIC_STATUS = "devices/${deviceCode}/status";
const char* TOPIC_LWT    = "devices/${deviceCode}/lwt";

WiFiClient espClient;
PubSubClient mqtt(espClient);

void mqttCallback(char* topic, byte* payload, unsigned int length) {
  // Xử lý lệnh điều khiển từ server (bật/tắt relay...)
  Serial.print("MQTT msg [");
  Serial.print(topic);
  Serial.print("]: ");
  for (unsigned int i = 0; i < length; i++) Serial.print((char)payload[i]);
  Serial.println();
}

void connectMqtt() {
  while (!mqtt.connected()) {
    Serial.print("Connecting MQTT...");
    if (mqtt.connect(MQTT_USER, MQTT_USER, MQTT_PASS, TOPIC_LWT, 1, true, "offline")) {
      Serial.println("OK");
      mqtt.publish(TOPIC_LWT, "online", true);
      mqtt.subscribe("devices/${deviceCode}/control");
    } else {
      Serial.print("fail rc=");
      Serial.print(mqtt.state());
      delay(2000);
    }
  }
}

void sendMqttData() {
  if (!mqtt.connected()) connectMqtt();
  String payload = "{";
  payload += "\\"device_id\\":\\"" + String(DEVICE_ID) + "\\",";
  payload += "\\"data\\":{";
${dataPayloadCpp}
  payload += "}}";
  mqtt.publish(TOPIC_DATA, payload);
}
` : '';

    const relayBlock = lines.length ? `// ================= RELAY CONTROL (HTTP EDGE) =================
const char* EDGE_CONTROL_URL = "${edgeUrl}";
WebServer server(80);

void setup() {
  Serial.begin(115200);
  delay(1000);

  // Khởi tạo trạng thái relay
${relayCpp}

  pinMode(RELAY_PIN, OUTPUT);
  digitalWrite(RELAY_PIN, LOW);

  // Kết nối WiFi + (tùy chọn) IP tĩnh
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  while (WiFi.status() != WL_CONNECTED) delay(500);

  // Endpoint POST /relay  body: {"relay":1,"state":"ON"}
  server.on("/relay", HTTP_POST, []() {
    String body = server.arg("plain");
    // Ví dụ đơn giản: tìm "relay":N và "state":"ON|OFF"
    int r = 0; String st = "";
    int idx = body.indexOf("\\"relay\\":");
    if (idx >= 0) r = body.substring(idx + 8).toInt();
    if (body.indexOf("\\"state\\":\\"ON\\"") >= 0) st = "ON";
    if (body.indexOf("\\"state\\":\\"OFF\\"") >= 0) st = "OFF";
    if (r > 0 && st != "") {
      relayStates[r] = (st == "ON");
      digitalWrite(RELAY_PIN, relayStates[r] ? HIGH : LOW);
      server.send(200, "application/json", "{\\"success\\":true,\\"relay\\":" + String(r) + ",\\"state\\":\\"" + st + "\\"}");
    } else {
      server.send(400, "application/json", "{\\"success\\":false}");
    }
  });
  server.begin();
}
` : '';

    return `// Auto-generated sample code for device: ${deviceCode}
// Protocol: ${proto}
// Generated at: ${new Date().toISOString()}
// Lưu ý: chỉnh WIFI_SSID/PASSWORD và IP tĩnh trước khi flash

#include <WiFi.h>
${isHttp ? '#include <HTTPClient.h>\n' : ''}${isMqtt ? '#include <PubSubClient.h>\n' : ''}${lines.length ? '#include <WebServer.h>\n' : ''}

// ================= WIFI =================
const char* WIFI_SSID     = "FPT";
const char* WIFI_PASSWORD = "12345678";

// ================= STATIC IP (tùy chọn - bỏ nếu muốn DHCP) =================
IPAddress espStaticIP(192, 168, 69, 241);
IPAddress espGateway (192, 168, 69, 1);
IPAddress espSubnet  (255, 255, 255, 0);
IPAddress espDNS1    (192, 168, 69, 1);
IPAddress espDNS2    (8, 8, 8, 8);

// ================= IOT PLATFORM =================
const char* DEVICE_ID = "${deviceCode}";

${ingestHttpBlock}${ingestMqttBlock}
// ================= RELAY STATE =================
#define RELAY_PIN 26
bool relayStates[8] = { false };

${relayBlock}
// ================= DATA (đọc từ cảm biến thật) =================
${dataKeysCpp}

unsigned long lastSendTime = 0;
const unsigned long SEND_INTERVAL = 5000;

void setup() {
  Serial.begin(115200);
  delay(1000);
  pinMode(RELAY_PIN, OUTPUT);
  digitalWrite(RELAY_PIN, LOW);

  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  while (WiFi.status() != WL_CONNECTED) delay(500);
  Serial.print("WiFi OK, IP: ");
  Serial.println(WiFi.localIP());
${isMqtt ? `
  mqtt.setServer(MQTT_BROKER, MQTT_PORT);
  mqtt.setCallback(mqttCallback);
  connectMqtt();` : ''}
}

void loop() {
${isMqtt ? '  mqtt.loop();\n' : ''}${lines.length ? '  server.handleClient();\n' : ''}
  if (millis() - lastSendTime >= SEND_INTERVAL) {
    lastSendTime = millis();
${isHttp ? '    sendHttpData();\n' : ''}${isMqtt ? '    sendMqttData();\n' : ''}  }
}
`;
  }, [device, deviceId, dataKeys, controlLines]);

  const handleCopySample = async () => {
    const code = buildSampleCode();
    if (!code) return;
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(code);
      } else {
        const ta = document.createElement('textarea');
        ta.value = code;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      setSampleCopied(true);
      setTimeout(() => setSampleCopied(false), 2000);
    } catch (err) {
      console.error('Copy failed', err);
      alert('Copy code mẫu thất bại. Vui lòng thử lại.');
    }
  };

  const formatControlApiError = (err) => {
    const d = err.response?.data?.detail;
    if (typeof d === 'string') return d;
    if (Array.isArray(d)) return d.map((x) => x?.msg || JSON.stringify(x)).join('; ');
    return err.message || 'Điều khiển thất bại';
  };

  const handleThreeWayToggle = async (relayNumber, state) => {
    setRelayControlError(null);
    try {
      await controlRelay(deviceId, relayNumber, state, token);
    } catch (err) {
      setRelayControlError(formatControlApiError(err));
    }
  };

  const handleRelayToggle = async (relayNumber) => {
    const currentState = getRelayState(device, relayNumber);
    const nextState = currentState === 'ON' ? 'OFF' : 'ON';
    setRelayControlError(null);
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
      setDevice(prev => {
        if (!prev) return prev;
        const updatedData = { ...(prev.data || {}) };
        updatedData[`relay_${relayNumber}`] = currentState;
        return { ...prev, data: updatedData };
      });
      setRelayControlError(formatControlApiError(err));
    }
  };

  const handleRelayRangeChange = (relayNumber, value) => {
    const num = Math.max(0, Math.min(100, Math.round(Number(value) || 0)));
    const strValue = String(num);
    setRelayControlError(null);
    setDevice(prev => {
      if (!prev) return prev;
      const updatedData = { ...(prev.data || {}) };
      updatedData[`relay_${relayNumber}`] = strValue;
      return { ...prev, data: updatedData };
    });
    const timers = relayRangeTimersRef.current;
    if (timers[relayNumber]) clearTimeout(timers[relayNumber]);
    timers[relayNumber] = setTimeout(async () => {
      const deviceCode = device.ma_thiet_bi || device.device_id || deviceId;
      try {
        await controlRelay(deviceCode, relayNumber, strValue, token);
      } catch (err) {
        setRelayControlError(formatControlApiError(err));
      }
    }, 400);
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

  const handleTogglePower = async () => {
    if (!device) return;
    const currentState = (getStateValue(device) || '').toString().toUpperCase();
    const nextAction = currentState === 'ON' ? 'off' : 'on';
    const nowTs = Math.floor(Date.now() / 1000);
    setDevice(prev => ({
      ...prev,
      data: { ...prev.data, state: { ...(prev.data?.state || {}), value: nextAction.toUpperCase(), timestamp: nowTs } }
    }));
    const deviceCode = device.ma_thiet_bi || device.device_id || deviceId;
    try {
      await axios.post(`${API_BASE}/devices/${deviceCode}/control`, { action: nextAction }, { headers: { Authorization: `Bearer ${token}` } });
    } catch (err) {
      console.error('Toggle power failed', err);
    }
  };

  const handleBrightnessChange = async (e) => {
    const val = Number(e.target.value);
    const deviceCode = device.ma_thiet_bi || device.device_id || deviceId;
    const nowTs = Math.floor(Date.now() / 1000);
    setDevice(prev => ({
      ...prev,
      data: { ...prev.data, brightness: { ...(prev.data?.brightness || {}), value: val, timestamp: nowTs } }
    }));
    try {
      await axios.post(`${API_BASE}/devices/${deviceCode}/control`, { action: 'brightness', value: val }, { headers: { Authorization: `Bearer ${token}` } });
    } catch (err) { console.error('Set brightness failed', err); }
  };

  const handleTempChange = async (e) => {
    const val = Number(e.target.value);
    const deviceCode = device.ma_thiet_bi || device.device_id || deviceId;
    const nowTs = Math.floor(Date.now() / 1000);
    setDevice(prev => ({
      ...prev,
      data: { ...prev.data, setpoint: { ...(prev.data?.setpoint || {}), value: val, timestamp: nowTs } }
    }));
    try {
      await axios.post(`${API_BASE}/devices/${deviceCode}/control`, { action: 'set_ac_temp', value: val }, { headers: { Authorization: `Bearer ${token}` } });
    } catch (err) { console.error('Set temp failed', err); }
  };

  // --- Effects ---
  useEffect(() => {
    if (!cache.devices?.length || device) return;
    const found = cache.devices.find(d => String(d.ma_thiet_bi || d.id) === String(deviceId));
    if (found) setDevice(found);
  }, [cache.devices, deviceId]);

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
        const data = deviceRes.data || {};
        // Nếu thiếu protocol/http_api_key/secret_key (do cache cũ / cache.devices cũ),
        // fetch full-config để merge vào device state — tránh label nút copy bị fallback "MQTT" sai.
        if (!data.protocol) {
          fetchDeviceFullConfig(deviceId, tokenRef.current)
            .then((cfg) => {
              if (abortCtrl.signal.aborted) return;
              const merged = {
                ...data,
                protocol: cfg?.data?.device?.protocol || data.protocol,
                http_api_key: cfg?.data?.credentials?.http_api_key || data.http_api_key,
                secret_key: cfg?.data?.credentials?.secret_key || data.secret_key,
              };
              setDevice(merged);
              setLoading(false);
            })
            .catch(() => {
              if (!abortCtrl.signal.aborted) {
                setDevice(data);
                setLoading(false);
              }
            });
        } else {
          setDevice(data);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (err.name === 'CanceledError' || err.code === 'ERR_CANCELED') return;
        console.error('Error loading device data:', err);
        const st = err.response?.status;
        const detail = err.response?.data?.detail;
        const msg = typeof detail === 'string' ? detail : Array.isArray(detail) ? detail.map(d => d?.msg || JSON.stringify(d)).join('; ') : err.message || 'Lỗi không xác định';
        setLoadError({ status: st, message: msg });
        setDevice(null);
        setLoading(false);
      });
    Promise.all([loadKeys, loadLines]).catch(() => {});
    return () => { abortCtrl.abort(); };
  }, [deviceId]);

  useEffect(() => {
    if (!deviceId) return;
    loadEvents(1);
  }, [deviceId]);

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
          return { ...res.data, data: { ...prev.data, ...res.data.data } };
        });
      } catch (err) { /* ignore */ }
      loadEvents(1, true);
    };
    latestPollRef.current = setInterval(poll, 5000);
    return () => { if (latestPollRef.current) clearInterval(latestPollRef.current); };
  }, [deviceId]);

  const loadEvents = async (targetPage = 1, silent = false) => {
    try {
      const res = await axios.get(
        `${API_BASE}/events/${deviceId}?page=${targetPage}&page_size=${pageSize}`,
        { headers: { Authorization: `Bearer ${tokenRef.current}` }, timeout: DEVICE_API_TIMEOUT_MS }
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
    const data = [...eventsList]
      .sort((a, b) => a.timestamp - b.timestamp)
      .slice(-50)
      .map(e => ({
        ...e,
        timeStr: new Date(e.timestamp * 1000).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
      }));
    setChartData(data);
  };

  useEffect(() => {
    if (!deviceId) return;
    let cancelled = false;
    const ws = new WebSocket(WS_URL);
    ws.onopen = () => {
      if (cancelled) { try { ws.close(); } catch (_) { /* ignore */ } }
    };
    ws.onerror = () => { /* silent */ };
    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.device_id === deviceId) {
          setEvents(prev => {
            const newEvent = { ...data };
            return [newEvent, ...prev].slice(0, 100);
          });
          setChartData(prev => {
            const newPoint = {
              ...data,
              timeStr: data.timestamp
                ? new Date(data.timestamp * 1000).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
                : '',
            };
            return [...prev, newPoint].slice(-200);
          });
          if (data.timestamp) setDevice(prev => prev ? { ...prev, last_seen: data.timestamp } : prev);
        }
      } catch (e) { console.error('WS parse error', e); }
    };
    return () => {
      cancelled = true;
      if (ws.readyState === WebSocket.OPEN) { try { ws.close(); } catch (_) { /* ignore */ } }
      else if (ws.readyState === WebSocket.CONNECTING) {
        ws.addEventListener('open', () => { try { ws.close(); } catch (_) { /* ignore */ } }, { once: true });
      }
    };
  }, [deviceId]);

  // --- Status helpers ---
  const getStatus = (deviceObj) => {
    if (!deviceObj) return { status: 'offline' };
    const rawLastSeen = Number(deviceObj.last_seen ?? 0);
    if (!rawLastSeen) return { status: 'offline' };
    const lastSeen = rawLastSeen > 1e12 ? rawLastSeen : rawLastSeen * 1000;
    const diffMinutes = (Date.now() - lastSeen) / 1000 / 60;
    if (diffMinutes < 2) return { status: 'online' };
    if (diffMinutes < 10) return { status: 'warning' };
    return { status: 'offline' };
  };

  // --- Status Banner ---
  const renderStatusBanner = () => {
    const type = device.loai_thiet_bi;
    const statusInfo = getStatus(device);
    const typeIcon = type === 'sensor' ? '🌡️' : type === 'air_conditioner' ? '❄️' : '💡';
    const roomBadgeText = device.ten_phong || (device.phong_id != null && device.phong_id !== undefined ? `Phòng #${device.phong_id}` : '') || 'Chưa gắn phòng';
    return (
      <div className="status-banner">
        <div className="status-banner-left">
          <div className="status-banner-icon">{typeIcon}</div>
          <div className="status-banner-info">
            <div className="status-banner-name">{device.ten_thiet_bi || device.ma_thiet_bi}</div>
            <div className="status-banner-meta">
              <span style={{ fontFamily: 'var(--font-mono)', marginRight: '12px' }}>{device.ma_thiet_bi}</span>
              <span className="room-badge">{roomBadgeText}</span>
            </div>
          </div>
        </div>
        <div className="status-banner-right">
          <button
            className="btn-ghost"
            onClick={handleDownloadConfig}
            disabled={configDownloading}
            style={{ color: 'var(--iot-primary)', borderColor: 'rgba(0,229,255,0.3)' }}
          >
            {configDownloading ? '⏳ Đang tải...' : '⬇ Tải config'}
          </button>
          <button
            className="btn-ghost"
            onClick={handleCopySample}
            title={sampleCopied ? 'Đã copy vào clipboard!' : 'Copy code ESP32 Arduino mẫu'}
            style={{ color: 'var(--iot-success)', borderColor: 'rgba(16,185,129,0.3)' }}
          >
            {sampleCopied ? '✅ Đã copy!' : `📋 Copy code mẫu (${(device.protocol || 'mqtt').toUpperCase()})`}
          </button>
        </div>
      </div>
    );
  };

  // --- Relay Card ---
  const renderPowerButton = (line, relayState, onToggle, onThreeWay) => {
    const ctrlType = line.control_type || 'on_off';
    if (ctrlType === 'range') {
      const numeric = Number(relayState);
      const safeVal = Number.isFinite(numeric) ? Math.max(0, Math.min(100, numeric)) : 0;
      return (
        <div className="range-knob-group" style={{ display: 'flex', alignItems: 'center', gap: '10px', width: '100%' }}>
          <input
            type="range"
            min="0"
            max="100"
            step="1"
            value={safeVal}
            onChange={(e) => onToggle(Number(e.target.value))}
            className="slider-range"
            style={{ flex: 1 }}
          />
          <input
            type="number"
            min="0"
            max="100"
            step="1"
            value={safeVal}
            onChange={(e) => onToggle(Number(e.target.value))}
            style={{ width: '60px', padding: '6px 8px', borderRadius: '8px', border: '1px solid rgba(132,147,150,0.25)', background: 'var(--iot-surface)', color: 'var(--iot-on-surface)', textAlign: 'center' }}
          />
          <span style={{ minWidth: '32px', color: 'var(--iot-secondary)', fontSize: '13px' }}>{safeVal}</span>
        </div>
      );
    }
    if (ctrlType === 'momentary') {
      return (
        <button className="power-btn-large" onClick={onToggle} style={{ background: 'var(--iot-primary)', color: '#001f24' }}>
          NHẤN
        </button>
      );
    }
    if (ctrlType === 'three_way') {
      const states = ['LOW', 'MED', 'HIGH'];
      return (
        <div className="three-way-group">
          {states.map(s => (
            <button key={s} className={`three-way-btn${relayState === s ? ' active' : ''}`} onClick={() => onThreeWay(s)}>
              {relayState === s ? 'ĐANG ' + s : s}
            </button>
          ))}
        </div>
      );
    }
    const isOn = relayState === 'ON';
    return (
      <button className={`power-btn${isOn ? ' is-on' : ''}`} onClick={onToggle} title={isOn ? 'ĐANG BẬT' : 'ĐANG TẮT'}>
        <span className="material-symbols-outlined" style={{ fontSize: '22px' }}>{isOn ? 'power' : 'power_off'}</span>
      </button>
    );
  };

  // --- Control Panel ---
  const renderControlPanel = () => {
    const type = device.loai_thiet_bi;
    const idLower = String(device?.ma_thiet_bi || device?.device_id || '').toLowerCase();
    const showActuatorOrRelayUI =
      type !== 'sensor' || controlLines.length > 0 ||
      idLower.includes('gateway') || idLower.includes('controller');

    if (!showActuatorOrRelayUI) {
      return (
        <div className="detail-section control-card" style={{ gridColumn: 'span 12' }}>
          <div className="detail-section-title">Điều khiển</div>
          <div style={{ color: 'var(--iot-outline)', fontSize: '13px', textAlign: 'center', padding: '20px 0' }}>
            Thiết bị chỉ đọc — không có đầu ra điều khiển.
          </div>
        </div>
      );
    }

    const state = getStateValue(device);

    return (
      <div className="detail-section control-card" style={{ gridColumn: 'span 6' }}>
        <div className="detail-section-title">Điều khiển</div>

        {relayControlError && (
          <div className="relay-control-error">
            <span><strong>Lỗi điều khiển relay:</strong> {relayControlError}</span>
            <button className="relay-control-error-dismiss" onClick={() => setRelayControlError(null)}>✕</button>
          </div>
        )}

        <div className="control-row">
          {controlLines.length > 0 ? (
            <div className="control-relays-grid">
              {controlLines.map(line => {
                const rn = line.relay_number;
                const relayState = getRelayState(device, rn);
                const isOn = relayState === 'ON';
                const label = line.ten_duong || `Relay ${rn}`;
                const isEditing = editingRelay === rn;

                return (
                  <div key={rn} className="relay-card">
                    {isEditing ? (
                      <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <input
                          className="form-input"
                          type="text"
                          value={editingLabel}
                          onChange={e => setEditingLabel(e.target.value)}
                          placeholder={`Tên relay ${rn}`}
                          style={{ fontSize: '12px', padding: '7px 10px' }}
                        />
                        <input
                          className="form-input"
                          type="text"
                          value={editingTopic}
                          onChange={e => setEditingTopic(e.target.value)}
                          placeholder="MQTT Topic (để trống = mặc định)"
                          style={{ fontSize: '12px', padding: '7px 10px' }}
                        />
                        <select
                          className="form-select"
                          value={editingControlType}
                          onChange={e => setEditingControlType(e.target.value)}
                          style={{ fontSize: '12px', padding: '7px 10px' }}
                        >
                          {CONTROL_TYPES.map(ct => <option key={ct.value} value={ct.value}>{ct.label}</option>)}
                        </select>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: 'var(--iot-secondary)', cursor: 'pointer' }}>
                          <input type="checkbox" checked={editingHienThiTtcds} onChange={e => setEditingHienThiTtcds(e.target.checked)} />
                          Hiển thị trên TTCDS
                        </label>
                        <div style={{ display: 'flex', gap: '6px' }}>
                          <button className="btn-primary" onClick={handleSaveConfig} style={{ flex: 1, fontSize: '12px', padding: '7px' }}>Lưu</button>
                          <button className="btn-secondary" onClick={() => setEditingRelay(null)} style={{ flex: 1, fontSize: '12px', padding: '7px' }}>Hủy</button>
                          <button className="btn-danger-ghost" onClick={() => handleDeleteRelay(rn)} style={{ fontSize: '12px', padding: '7px 10px' }}>🗑</button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="relay-header">
                          <span className="relay-name" title={label}>{label}</span>
                          <span className={`relay-badge ${isOn ? 'on' : 'off'}`}>{isOn ? 'ON' : 'OFF'}</span>
                        </div>
                        {renderPowerButton(
                          line,
                          relayState,
                          line.control_type === 'range'
                            ? (val) => handleRelayRangeChange(rn, val)
                            : () => handleRelayToggle(rn),
                          (st) => handleThreeWayToggle(rn, st)
                        )}
                        <div className="relay-actions">
                          <button className="relay-action-btn" onClick={() => handleStartEditLabel(line)} title="Sửa cấu hình">✏️</button>
                          <button className="relay-action-btn" onClick={() => {
                            const updated = controlLines.map(l => l.relay_number === rn ? { ...l, hien_thi_ttcds: !l.hien_thi_ttcds } : l);
                            setControlLines(updated);
                            saveControlLines(deviceId, updated, token).catch(() => loadControlLines());
                          }} title={line.hien_thi_ttcds ? 'Ẩn trên TTCDS' : 'Hiện trên TTCDS'} style={{ opacity: line.hien_thi_ttcds ? 1 : 0.4 }}>👁</button>
                          <button className="relay-action-btn delete" onClick={() => handleDeleteRelay(rn)} title="Xóa">🗑</button>
                        </div>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="control-group">
              <label>Nguồn</label>
              <button className={`power-btn-large${state === 'ON' ? ' active' : ''}`} onClick={handleTogglePower}>
                {state === 'ON' ? 'ĐANG BẬT' : 'ĐANG TẮT'}
              </button>
            </div>
          )}

          {type === 'light' && (
            <div className="control-group">
              <label>Độ sáng: {getBrightnessValue(device)}%</label>
              <input type="range" min="0" max="100" value={getBrightnessValue(device)} onChange={handleBrightnessChange} className="slider-range" />
            </div>
          )}

          {type === 'air_conditioner' && (
            <div className="control-group">
              <label>Nhiệt độ đặt: {getSetpointValue(device)}°C</label>
              <input type="range" min="16" max="30" step="1" value={getSetpointValue(device)} onChange={handleTempChange} className="slider-range" />
              <div className="temp-marks"><span>16°C</span><span>30°C</span></div>
            </div>
          )}

          {/* Action buttons */}
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '4px' }}>
            <button className="btn-ghost" onClick={handleAddRelay} style={{ color: 'var(--iot-success)', borderColor: 'rgba(16,185,129,0.3)' }}>
              + Thêm nút
            </button>
          </div>
        </div>
      </div>
    );
  };

  // --- Webhook Config ---
  const renderWebhookConfig = () => (
    <div className="detail-section control-card" style={{ gridColumn: 'span 6' }}>
      <div className="detail-section-title">Webhook LAN</div>

      {edgeUrlMsg && (
        <div className={`alert-msg ${edgeUrlMsg.type}`}>{edgeUrlMsg.text}</div>
      )}

      <div className="webhook-form">
        <div>
          <label className="form-label">Edge Control URL (VD: http://192.168.1.100/relay):</label>
          <input
            className="form-input"
            type="text"
            value={edgeUrlDraft}
            onChange={e => setEdgeUrlDraft(e.target.value)}
            placeholder="http://IP_THIET_BI:PORT/endpoint"
          />
        </div>
        <div>
          <label className="form-label">Template Body (JSON):</label>
          <textarea
            className="form-textarea"
            value={edgeBodyTemplateDraft}
            onChange={e => setEdgeBodyTemplateDraft(e.target.value)}
            rows={5}
          />
        </div>
        <div className="webhook-actions">
          <button className="btn-primary" onClick={handleSaveEdgeUrl} disabled={edgeUrlSaving}>
            {edgeUrlSaving ? 'Đang lưu...' : 'Lưu cấu hình'}
          </button>
        </div>
      </div>
    </div>
  );

  // --- Event History ---
  const getEventType = (ev) => {
    if (ev.data_update) return 'data_update';
    if (ev.relay_toggle !== undefined) return 'relay_toggle';
    if (ev.event_type) return ev.event_type;
    return 'default';
  };

  const renderEventHistory = () => (
    <div className="detail-section history-card" style={{ gridColumn: 'span 12' }}>
      <div className="detail-section-title">Nhật ký hoạt động</div>
      <div className="table-responsive">
        <table className="dark-table">
          <thead>
            <tr>
              <th>Thời gian</th>
              <th>Loại</th>
              <th>Chi tiết</th>
            </tr>
          </thead>
          <tbody>
            {events.length === 0 ? (
              <tr>
                <td colSpan={3} style={{ textAlign: 'center', color: 'var(--iot-outline)', padding: '24px' }}>
                  Không có sự kiện nào
                </td>
              </tr>
            ) : (
              events.map((ev, i) => {
                const evType = getEventType(ev);
                return (
                  <tr key={i}>
                    <td className="timestamp-cell">
                      {ev.timestamp
                        ? new Date(ev.timestamp * 1000).toLocaleString('vi-VN')
                        : '—'}
                    </td>
                    <td>
                      <span className={`event-type-badge ${evType}`}>
                        {evType === 'data_update' ? 'Data Update'
                          : evType === 'relay_toggle' ? 'Relay Toggle'
                          : evType === 'event_log' ? 'Event Log'
                          : evType === 'system' ? 'System'
                          : 'Event'}
                      </span>
                    </td>
                    <td className="json-cell">
                      {Object.entries(ev)
                        .filter(([k]) => !['device_id', 'timestamp', '_id', 'data_update', 'relay_toggle', 'event_type'].includes(k))
                        .slice(0, 8)
                        .map(([k, v]) => (
                          <span key={k} className="kv-pair">
                            {k}: <b>{typeof v === 'object' && v !== null ? JSON.stringify(v).slice(0, 40) : String(v)}</b>
                          </span>
                        ))}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );

  // --- Data Keys tab ---
  const renderDataKeysTab = () => (
    <div className="detail-section" style={{ gridColumn: 'span 12' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <h2 style={{ margin: 0, fontSize: '15px', fontWeight: 600, color: 'var(--iot-on-surface)' }}>Trường dữ liệu thiết bị</h2>
        <div className="keys-toolbar" style={{ marginBottom: 0 }}>
          <button className="btn-ghost" onClick={handleDetectKeys} disabled={detecting}>
            {detecting ? '⏳ Đang nhận diện...' : '🔍 Tự động nhận diện'}
          </button>
          <button className="btn-secondary" onClick={() => {
            setKeyEditId(null); setKeyForm({ khoa: '', don_vi: '', mo_ta: '' });
            setKeyFormVisible(true); setKeyMsg(null);
          }}>
            + Thêm field
          </button>
        </div>
      </div>

      {keyMsg && (
        <div className={`alert-msg ${keyMsg.type}`}>{keyMsg.text}</div>
      )}

      {keysLoading ? (
        <p style={{ color: 'var(--iot-outline)' }}>Đang tải...</p>
      ) : dataKeys.length === 0 ? (
        <div className="empty-state">
          <span className="empty-state-icon">📭</span>
          <p>Chưa có trường dữ liệu nào được định nghĩa.</p>
          <p><small>Nhấn <b>"+ Thêm field"</b> hoặc <b>"Tự động nhận diện"</b> để bắt đầu.</small></p>
        </div>
      ) : (
        <div className="table-responsive">
          <table className="dark-table">
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
                  <td style={{ color: 'var(--iot-outline)' }}>{idx + 1}</td>
                  <td><span className="event-tag">{k.khoa}</span></td>
                  <td>{k.don_vi || <span style={{ color: 'var(--iot-outline)' }}>—</span>}</td>
                  <td style={{ color: 'var(--iot-secondary)', fontSize: '12px' }}>{k.mo_ta || '—'}</td>
                  <td>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <button className="btn-ghost" onClick={() => handleKeyEdit(k)} style={{ padding: '4px 10px', fontSize: '12px' }}>✏️ Sửa</button>
                      <button className="btn-danger-ghost" onClick={() => handleKeyDelete(k)} style={{ padding: '4px 10px', fontSize: '12px' }}>🗑 Xóa</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );

  // --- Main render ---
  if (loading) {
    return <div className="device-detail-loading"><div className="spinner neon"></div></div>;
  }

  if (!device) {
    const is404 = loadError?.status === 404;
    return (
      <div className="device-detail-error">
        <p style={{ marginBottom: 12 }}>{is404 ? 'Không tìm thấy thiết bị' : 'Không tải được chi tiết thiết bị'}</p>
        {loadError?.message && <p style={{ fontSize: '0.9rem', opacity: 0.7, maxWidth: 520, marginBottom: 12 }}>{loadError.message}</p>}
        {!is404 && loadError?.status && <p style={{ fontSize: '0.8rem', opacity: 0.5 }}>HTTP {loadError.status}</p>}
        <button className="btn-secondary" onClick={onBack}>Quay lai</button>
      </div>
    );
  }

  const type = device.loai_thiet_bi;

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
      {/* Header bar */}
      <div className="detail-header-bar">
        <button className="back-btn-ghost" onClick={onBack}>← Quay lại</button>
        <div className="detail-meta">
          <div className={`status-badge ${getStatus(device).status}`}>
            {getStatus(device).status.toUpperCase()}
          </div>
          <span className="last-seen">
            Cập nhật: {device.last_seen ? new Date(device.last_seen * 1000).toLocaleString('vi-VN') : 'N/A'}
          </span>
        </div>
      </div>

      {/* Status Banner */}
      {renderStatusBanner()}

      {/* Tab Navigation */}
      <div className="detail-tabs">
        <button className={`detail-tab${activeTab === 'overview' ? ' active' : ''}`} onClick={() => setActiveTab('overview')}>
          📊 Tổng quan
        </button>
        <button className={`detail-tab${activeTab === 'datakeys' ? ' active' : ''}`} onClick={() => { setActiveTab('datakeys'); setKeyMsg(null); }}>
          🔑 Trường dữ liệu ({dataKeys.length})
        </button>
      </div>

      {/* Hero — luon hien thi phia tren tabs */}
      <div className="detail-hero">
        <div className="hero-icon">
          {type === 'sensor' ? '🌡️' : type === 'air_conditioner' ? '❄️' : '💡'}
        </div>
        <div className="hero-info">
          <h1>{device.ten_thiet_bi || device.ma_thiet_bi}</h1>
          <p className="device-id-mono">{device.ma_thiet_bi}</p>
          <p className="room-badge">
            {device.ten_phong || (device.phong_id != null && device.phong_id !== undefined ? `Phòng #${device.phong_id}` : 'Chưa gắn phòng')}
          </p>
        </div>
      </div>

      {/* Grid */}
      <div className="detail-grid">
        {/* Tab: Truong du lieu */}
        {activeTab === 'datakeys' && renderDataKeysTab()}

        {/* Tab: Tong quan */}
        {activeTab === 'overview' && (
          <>
            {/* Control Panel */}
            {renderControlPanel()}

            {/* Webhook Config */}
            {renderWebhookConfig()}

            {/* Event History */}
            {renderEventHistory()}
          </>
        )}
      </div>

      {/* Modal — Add/Edit Key */}
      {keyFormVisible && (
        <div className="modal-backdrop">
          <div className="modal">
            <div className="modal-header">
              <h3>{keyEditId ? 'Sửa Field' : 'Thêm Field dữ liệu'}</h3>
              <button className="modal-close" onClick={() => setKeyFormVisible(false)}>✕</button>
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
                />
                {keyEditId && <small style={{ color: 'var(--iot-outline)', fontSize: '11px' }}>Tên field không thể thay đổi sau khi tạo</small>}
              </label>
              <label>
                Đơn vị
                <input
                  value={keyForm.don_vi}
                  onChange={e => setKeyForm({ ...keyForm, don_vi: e.target.value })}
                  placeholder="VD: C, %, W, V, ppm"
                />
              </label>
              <label>
                Mô tả
                <input
                  value={keyForm.mo_ta}
                  onChange={e => setKeyForm({ ...keyForm, mo_ta: e.target.value })}
                  placeholder="VD: Nhiệt độ phòng, Dòng CO2..."
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
