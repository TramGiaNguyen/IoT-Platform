import React, { useEffect, useMemo, useState } from 'react';
import {
  fetchRules,
  fetchRooms,
  fetchDevicesByRoom,
  createRule,
  updateRule,
  deleteRule,
  createRoom,
  fetchDeviceLatest,
  fetchScheduledRules,
  fetchControlLines,
  createScheduledRule,
  updateScheduledRule,
  deleteScheduledRule,
} from '../services';
import RuleChainEditor from './RuleChainEditor';

const operatorOptions = ['>', '<', '>=', '<=', '!=', '=', '=='];
const commandOptions = [
  'turn_on',
  'turn_off',
  'toggle',
  'set_ac_temp',
  'set_mode',
  'set_fan_speed',
  'set_brightness',
  'set_humidity',
];

// Commands that need a numeric "target" value
const numericParamCommands = ['set_ac_temp', 'set_brightness', 'set_humidity', 'set_fan_speed'];

// Helper to get label for params based on command
const getParamLabel = (command) => {
  switch (command) {
    case 'set_ac_temp': return 'Nhiệt độ (°C)';
    case 'set_brightness': return 'Độ sáng (%)';
    case 'set_humidity': return 'Độ ẩm (%)';
    case 'set_fan_speed': return 'Tốc độ quạt';
    default: return 'Giá trị';
  }
};

const emptyAction = { device_id: '', action_command: '', action_params: '', delay_seconds: 0, thu_tu: 1 };
const emptyCondition = { field: 'temperature', operator: '>', value: '' };

// Cron presets - mẫu dễ chọn, không cần hiểu cú pháp
const CRON_PRESETS = [
  { label: '⏰ 6:00 sáng mỗi ngày', value: '0 6 * * *', description: 'Chạy lúc 6:00 AM hàng ngày' },
  { label: '⏰ 6:30 sáng mỗi ngày', value: '30 6 * * *', description: 'Chạy lúc 6:30 AM hàng ngày' },
  { label: '⏰ 7:00 sáng mỗi ngày', value: '0 7 * * *', description: 'Chạy lúc 7:00 AM hàng ngày' },
  { label: '⏰ 7:30 sáng mỗi ngày', value: '30 7 * * *', description: 'Chạy lúc 7:30 AM hàng ngày' },
  { label: '⏰ 8:00 sáng mỗi ngày', value: '0 8 * * *', description: 'Chạy lúc 8:00 AM hàng ngày' },
  { label: '⏰ 12:00 trưa mỗi ngày', value: '0 12 * * *', description: 'Chạy lúc 12:00 PM hàng ngày' },
  { label: '⏰ 13:00 chiều mỗi ngày', value: '0 13 * * *', description: 'Chạy lúc 1:00 PM hàng ngày' },
  { label: '⏰ 14:00 chiều mỗi ngày', value: '0 14 * * *', description: 'Chạy lúc 2:00 PM hàng ngày' },
  { label: '⏰ 14:45 chiều mỗi ngày', value: '45 14 * * *', description: 'Chạy lúc 2:45 PM hàng ngày' },
  { label: '⏰ 17:00 chiều mỗi ngày', value: '0 17 * * *', description: 'Chạy lúc 5:00 PM hàng ngày' },
  { label: '⏰ 18:00 chiều mỗi ngày', value: '0 18 * * *', description: 'Chạy lúc 6:00 PM hàng ngày' },
  { label: '⏰ 22:00 tối mỗi ngày', value: '0 22 * * *', description: 'Chạy lúc 10:00 PM hàng ngày' },
  { label: '🔄 Mỗi 5 phút', value: '*/5 * * * *', description: 'Chạy mỗi 5 phút' },
  { label: '🔄 Mỗi 10 phút', value: '*/10 * * * *', description: 'Chạy mỗi 10 phút' },
  { label: '🔄 Mỗi 15 phút', value: '*/15 * * * *', description: 'Chạy mỗi 15 phút' },
  { label: '🔄 Mỗi 30 phút', value: '*/30 * * * *', description: 'Chạy mỗi 30 phút' },
  { label: '🔄 Mỗi giờ', value: '0 * * * *', description: 'Chạy vào đầu mỗi giờ' },
  { label: '📅 6:30 sáng Thứ 2-6 (ngày làm việc)', value: '30 6 * * 1-5', description: 'Chạy lúc 6:30 AM từ Thứ 2 đến Thứ 6' },
  { label: '📅 7:00 sáng Thứ 2-6 (ngày làm việc)', value: '0 7 * * 1-5', description: 'Chạy lúc 7:00 AM từ Thứ 2 đến Thứ 6' },
  { label: '📅 8:00 sáng Thứ 2-6', value: '0 8 * * 1-5', description: 'Chạy lúc 8:00 AM từ Thứ 2 đến Thứ 6' },
  { label: '📅 14:45 chiều Thứ 2-6', value: '45 14 * * 1-5', description: 'Chạy lúc 2:45 PM từ Thứ 2 đến Thứ 6' },
  { label: '📅 17:00 chiều Thứ 2-6', value: '0 17 * * 1-5', description: 'Chạy lúc 5:00 PM từ Thứ 2 đến Thứ 6' },
  { label: '📅 22:00 tối Thứ 2-6', value: '0 22 * * 1-5', description: 'Chạy lúc 10:00 PM từ Thứ 2 đến Thứ 6' },
  { label: '📅 8:00 sáng Thứ 7, Chủ nhật', value: '0 8 * * 0,6', description: 'Chạy lúc 8:00 AM vào cuối tuần' },
];

// Helper function to get human-readable description from cron expression
const getCronDescription = (cronExpression) => {
  const preset = CRON_PRESETS.find(p => p.value === cronExpression);
  if (preset) return preset.description;
  
  // Parse custom cron
  const parts = cronExpression.trim().split(/\s+/);
  if (parts.length < 5) return cronExpression;
  
  const [min, hr, , , dow] = parts;
  
  // Interval patterns
  if (min.startsWith('*/') && hr === '*') {
    const interval = min.slice(2);
    return `Chạy mỗi ${interval} phút`;
  }
  if (min === '0' && hr === '*') {
    return `Chạy mỗi giờ`;
  }
  if (min === '0' && hr.startsWith('*/')) {
    const interval = hr.slice(2);
    return `Chạy mỗi ${interval} giờ`;
  }
  
  // Daily patterns
  const hourNum = parseInt(hr, 10);
  const minNum = parseInt(min, 10);
  const timeStr = `${hourNum.toString().padStart(2, '0')}:${minNum.toString().padStart(2, '0')}`;
  
  if (dow === '1-5') return `Chạy lúc ${timeStr} từ Thứ 2 đến Thứ 6`;
  if (dow === '0,6') return `Chạy lúc ${timeStr} vào Thứ 7 và Chủ nhật`;
  if (dow === '*') return `Chạy lúc ${timeStr} hàng ngày`;
  
  return cronExpression;
};

// Build cron từ lựa chọn trực quan
function buildCronFromPicker({ mode, hour, minute, dayOfWeek, intervalMinutes, intervalHours }) {
  if (mode === 'interval_min') {
    const n = Number(intervalMinutes);
    // 60 phút ≈ 1 giờ -> chạy ở phút 0 mỗi giờ
    if (n === 60) return `0 * * * *`;
    return `*/${n} * * * *`;
  }
  if (mode === 'interval_hour') return `0 */${intervalHours} * * *`;
  // mode === 'daily'
  const min = minute ?? 0;
  const hr = hour ?? 7;
  if (dayOfWeek === 'weekday') return `${min} ${hr} * * 1-5`;
  if (dayOfWeek === 'weekend') return `${min} ${hr} * * 0,6`;
  return `${min} ${hr} * * *`; // every day
}

export default function RulesManagement({ token, onBack }) {
  const [loading, setLoading] = useState(false);
  const [rooms, setRooms] = useState([]);
  const [rules, setRules] = useState([]);
  const [selectedRoom, setSelectedRoom] = useState('');
  const [roomDevices, setRoomDevices] = useState([]);
  const [roomModalVisible, setRoomModalVisible] = useState(false);
  const [roomForm, setRoomForm] = useState({
    ten_phong: '',
    mo_ta: '',
    vi_tri: '',
    nguoi_quan_ly_id: '',
    ma_phong: '',
  });
  const [conditionFields, setConditionFields] = useState([]);
  const [conditionCache, setConditionCache] = useState({});
  const [conditionLoading, setConditionLoading] = useState(false);
  const [deviceControlLinesCache, setDeviceControlLinesCache] = useState({});

  const loadDeviceControlLines = async (deviceId) => {
    if (!deviceId || deviceControlLinesCache[deviceId]) return;
    try {
      const res = await fetchControlLines(deviceId, token);
      const lines = res.data?.control_lines || [];
      setDeviceControlLinesCache(prev => ({ ...prev, [deviceId]: lines }));
    } catch (e) {
      console.error('Load control lines failed', e);
      setDeviceControlLinesCache(prev => ({ ...prev, [deviceId]: [] }));
    }
  };

  const getCommandSelectValue = (actionCommand, actionParamsStr) => {
    if (actionCommand === 'relay') {
      try {
        const p = JSON.parse(actionParamsStr);
        if (p && p.relay !== undefined && p.state) {
          return `relay_${p.state}_${p.relay}`;
        }
      } catch(e) {}
    }
    return commandOptions.includes(actionCommand) ? actionCommand : (actionCommand ? 'custom' : '');
  };

  const handleCommandSelectChange = (val, setCommand, setParams) => {
    if (val.startsWith('relay_')) {
      const parts = val.split('_'); // ['relay', 'ON', '1']
      setCommand('relay');
      setParams(JSON.stringify({ relay: Number(parts[2]), state: parts[1] }));
    } else if (val === 'custom') {
      setCommand('');
      setParams('');
    } else {
      setCommand(val);
      if (!numericParamCommands.includes(val) && val !== 'relay') {
        setParams(''); 
      }
    }
  };


  // Tab: rules | scheduled
  const [activeTab, setActiveTab] = useState('rules');

  // Scheduled rules state
  const [scheduledRules, setScheduledRules] = useState([]);
  const [scheduledLoading, setScheduledLoading] = useState(false);
  const [scheduledFormVisible, setScheduledFormVisible] = useState(false);
  const [editScheduledId, setEditScheduledId] = useState(null);
  const [scheduledForm, setScheduledForm] = useState({
    ten_rule: '',
    phong_id: '',
    cron_expression: '0 7 * * *',
    device_id: '',
    action_command: 'turn_on',
    action_params: '',
    trang_thai: 'enabled',
  });
  const [cronMode, setCronMode] = useState('preset'); // 'preset' | 'custom'
  const [cronPicker, setCronPicker] = useState({
    mode: 'daily',
    hour: 7,
    minute: 0,
    dayOfWeek: 'everyday',
    intervalMinutes: 15,
    intervalHours: 1,
  });

  // Form state
  const [formVisible, setFormVisible] = useState(false);
  const [editRuleId, setEditRuleId] = useState(null); // null = tạo mới, number = chỉnh sửa
  const [formMode, setFormMode] = useState('form'); // 'form' | 'visual'
  const [ruleGraph, setRuleGraph] = useState({ nodes: [], edges: [] });
  const ruleChainEditorRef = React.useRef(null);
  const [formData, setFormData] = useState({
    ten_rule: '',
    phong_id: '',
    condition_device_id: '',
    conditions: [emptyCondition],
    muc_do_uu_tien: 1,
    actions: [emptyAction],
  });

  const loadRooms = async () => {
    try {
      const res = await fetchRooms(token);
      setRooms(res.data.rooms || []);
    } catch (e) {
      console.error('Load rooms failed', e);
    }
  };

  const loadRules = async () => {
    setLoading(true);
    try {
      const res = await fetchRules(token);
      setRules(res.data.rules || []);
    } catch (e) {
      console.error('Load rules failed', e);
      setRules([]);
    } finally {
      setLoading(false);
    }
  };

  const loadDevicesByRoom = async (roomId) => {
    if (!roomId) {
      setRoomDevices([]);
      setConditionFields([]);
      setConditionLoading(false);
      return;
    }
    try {
      const res = await fetchDevicesByRoom(roomId, token);
      const devices = res.data.devices || [];
      setRoomDevices(devices);
      // Sử dụng latest_fields từ backend để có field ngay lập tức
      const cacheObj = {};
      devices.forEach((d) => {
        if (Array.isArray(d.latest_fields)) {
          cacheObj[d.ma_thiet_bi] = d.latest_fields;
        }
      });
      if (Object.keys(cacheObj).length) {
        setConditionCache((prev) => ({ ...prev, ...cacheObj }));
        if (formData.condition_device_id && cacheObj[formData.condition_device_id]) {
          setConditionFields(cacheObj[formData.condition_device_id]);
          setConditionLoading(false);
        }
      }
    } catch (e) {
      console.error('Load devices by room failed', e);
      setRoomDevices([]);
    }
  };

  const loadDeviceFields = async (deviceId) => {
    if (!deviceId) {
      setConditionFields([]);
      setConditionLoading(false);
      return;
    }
    // dùng cache để hiển thị ngay nếu đã load trước đó
    if (conditionCache[deviceId]) {
      setConditionFields(conditionCache[deviceId]);
    } else {
      setConditionFields([]);
    }
    setConditionLoading(true);
    try {
      const res = await fetchDeviceLatest(deviceId, token);
      const data = res.data?.data || {};
      const fields = Object.keys(data);
      setConditionFields(fields);
      setConditionCache((prev) => ({ ...prev, [deviceId]: fields }));
    } catch (e) {
      console.error('Load device fields failed', e);
      setConditionFields([]);
    } finally {
      setConditionLoading(false);
    }
  };

  const loadScheduledRules = async () => {
    setScheduledLoading(true);
    try {
      const res = await fetchScheduledRules(token);
      setScheduledRules(res.data.scheduled_rules || []);
    } catch (e) {
      console.error('Load scheduled rules failed', e);
      setScheduledRules([]);
    } finally {
      setScheduledLoading(false);
    }
  };

  useEffect(() => {
    loadRooms();
    loadRules();
  }, []);

  useEffect(() => {
    if (activeTab === 'scheduled') {
      loadScheduledRules();
    }
  }, [activeTab]);

  useEffect(() => {
    if (formVisible && formData.phong_id) {
      loadDevicesByRoom(formData.phong_id);
    }
  }, [formVisible, formData.phong_id]);

  useEffect(() => {
    if (scheduledFormVisible && scheduledForm.phong_id) {
      loadDevicesByRoom(scheduledForm.phong_id);
    }
  }, [scheduledFormVisible, scheduledForm.phong_id]);

  const filteredRules = useMemo(() => {
    if (!selectedRoom) return rules;
    return rules.filter((r) => String(r.phong_id || '') === String(selectedRoom));
  }, [rules, selectedRoom]);

  const handleAddAction = () => {
    setFormData((prev) => ({
      ...prev,
      actions: [...prev.actions, { ...emptyAction }],
    }));
  };

  const handleAddCondition = () => {
    setFormData((prev) => ({
      ...prev,
      conditions: [...prev.conditions, { ...emptyCondition }],
    }));
  };

  const handleActionChange = (idx, key, value) => {
    setFormData((prev) => {
      const updated = [...prev.actions];
      updated[idx] = { ...updated[idx], [key]: value };
      return { ...prev, actions: updated };
    });
  };

  const handleConditionChange = (idx, key, value) => {
    setFormData((prev) => {
      const updated = [...prev.conditions];
      updated[idx] = { ...updated[idx], [key]: value };
      return { ...prev, conditions: updated };
    });
  };

  const handleRemoveAction = (idx) => {
    setFormData((prev) => {
      const updated = prev.actions.filter((_, i) => i !== idx);
      return { ...prev, actions: updated.length ? updated : [{ ...emptyAction }] };
    });
  };

  const handleRemoveCondition = (idx) => {
    setFormData((prev) => {
      const updated = prev.conditions.filter((_, i) => i !== idx);
      return { ...prev, conditions: updated.length ? updated : [{ ...emptyCondition }] };
    });
  };

  const resetForm = () => {
    setFormData({
      ten_rule: '',
      phong_id: '',
      condition_device_id: '',
      conditions: [{ ...emptyCondition }],
      muc_do_uu_tien: 1,
      actions: [{ ...emptyAction }],
    });
    setEditRuleId(null);
    setFormMode('form');
    setRuleGraph({ nodes: [], edges: [] });
    setRoomDevices([]);
    setConditionFields([]);
  };

  const handleSaveRule = async (e) => {
    e.preventDefault();
    let body;
    if (formMode === 'visual') {
      const graph = ruleChainEditorRef.current?.getGraph?.();
      if (!graph?.nodes?.length) {
        alert('Thêm ít nhất một node Filter và Control');
        return;
      }
      const filterNode = graph.nodes.find((n) => n.type === 'filter');
      if (!filterNode?.data?.condition_device_id) {
        alert('Cấu hình Filter: chọn thiết bị điều kiện');
        return;
      }
      if (!formData.phong_id) {
        alert('Chọn phòng');
        return;
      }
      body = {
        ten_rule: formData.ten_rule || null,
        phong_id: Number(formData.phong_id),
        condition_device_id: filterNode.data.condition_device_id,
        conditions: filterNode.data.conditions?.length ? filterNode.data.conditions : [{ field: 'temperature', operator: '>', value: '0' }],
        muc_do_uu_tien: Number(formData.muc_do_uu_tien || 1),
        actions: graph.nodes
          .filter((n) => n.type === 'control' && n.data?.device_id && n.data?.action_command)
          .map((n, idx) => ({
            device_id: n.data.device_id,
            action_command: n.data.action_command,
            action_params: n.data.action_params || null,
            delay_seconds: n.data.delay_seconds || 0,
            thu_tu: idx + 1,
          })),
        rule_graph: graph,
      };
      if (!body.actions.length) {
        alert('Thêm ít nhất một node Control với thiết bị và lệnh');
        return;
      }
    } else {
      if (!formData.phong_id || !formData.condition_device_id) {
        alert('Chọn phòng và thiết bị điều kiện');
        return;
      }
      
      // Validate action_params JSON format
      for (let i = 0; i < formData.actions.length; i++) {
        const action = formData.actions[i];
        if (action.action_params) {
          const parsed = safeParseJson(action.action_params);
          if (parsed === null) {
            alert(`Action ${i + 1}: Params không phải JSON hợp lệ. Ví dụ: {"relay": 1, "state": "ON"}`);
            return;
          }
          if (typeof parsed !== 'object' || Array.isArray(parsed)) {
            alert(`Action ${i + 1}: Params phải là object JSON, không phải string hoặc array. Ví dụ: {"relay": 1, "state": "ON"}`);
            return;
          }
        }
      }
      
      body = {
        ten_rule: formData.ten_rule || null,
        phong_id: Number(formData.phong_id),
        condition_device_id: formData.condition_device_id,
        conditions: formData.conditions.map((c) => ({
          field: c.field,
          operator: c.operator,
          value: c.value,
        })),
        muc_do_uu_tien: Number(formData.muc_do_uu_tien || 1),
        actions: formData.actions.map((a, idx) => ({
          device_id: a.device_id,
          action_command: a.action_command,
          action_params: a.action_params ? safeParseJson(a.action_params) : null,
          delay_seconds: Number(a.delay_seconds || 0),
          thu_tu: Number(a.thu_tu || idx + 1),
        })),
      };
    }
    try {
      if (editRuleId) {
        await updateRule(editRuleId, body, token);
      } else {
        await createRule(body, token);
      }
      resetForm();
      setFormVisible(false);
      await loadRules();
    } catch (err) {
      console.error('Save rule failed', err);
      alert(editRuleId ? 'Cập nhật rule thất bại' : 'Tạo rule thất bại');
    }
  };

  const handleEditRule = async (rule) => {
    await loadDevicesByRoom(rule.phong_id);
    await loadDeviceFields(rule.condition_device_id);
    if (rule.actions && rule.actions.length > 0) {
      rule.actions.forEach(a => {
        if (a.device_id) loadDeviceControlLines(a.device_id);
      });
    }

    let conditions = [{ ...emptyCondition }];
    if (rule.conditions && Array.isArray(rule.conditions) && rule.conditions.length > 0) {
      conditions = rule.conditions.map(c => ({
        field: c.field || '',
        operator: c.operator || '>',
        value: c.value || '',
      }));
    } else if (rule.field && rule.operator && rule.value) {
      conditions = [{ field: rule.field, operator: rule.operator, value: rule.value }];
    }

    const actions = (rule.actions && rule.actions.length > 0)
      ? rule.actions.map(a => ({
        device_id: a.device_id || '',
        action_command: a.action_command || '',
        action_params: a.action_params ? JSON.stringify(a.action_params) : '',
        delay_seconds: a.delay_seconds || 0,
        thu_tu: a.thu_tu || 1,
      }))
      : [{ ...emptyAction }];

    setFormData({
      ten_rule: rule.ten_rule || '',
      phong_id: String(rule.phong_id || ''),
      condition_device_id: rule.condition_device_id || '',
      conditions: conditions,
      muc_do_uu_tien: rule.muc_do_uu_tien || 1,
      actions: actions,
    });
    setEditRuleId(rule.id);
    if (rule.rule_graph && rule.rule_graph.nodes && rule.rule_graph.nodes.length > 0) {
      setFormMode('visual');
      setRuleGraph(rule.rule_graph);
    } else {
      setFormMode('form');
      setRuleGraph({ nodes: [], edges: [] });
    }
    setFormVisible(true);
  };

  const handleCreateRoomFull = async (e) => {
    e.preventDefault();
    if (!roomForm.ten_phong.trim()) {
      alert('Nhập tên phòng');
      return;
    }
    try {
      const payload = {
        ten_phong: roomForm.ten_phong,
        mo_ta: roomForm.mo_ta || null,
        vi_tri: roomForm.vi_tri || null,
        nguoi_quan_ly_id: roomForm.nguoi_quan_ly_id ? Number(roomForm.nguoi_quan_ly_id) : null,
        ma_phong: roomForm.ma_phong || null,
      };
      await createRoom(payload, token);
      setRoomModalVisible(false);
      setRoomForm({ ten_phong: '', mo_ta: '', vi_tri: '', nguoi_quan_ly_id: '', ma_phong: '' });
      await loadRooms();
    } catch (e) {
      console.error('Create room failed', e);
      alert('Tạo phòng thất bại');
    }
  };

  const handleToggleStatus = async (rule) => {
    const next = rule.trang_thai === 'enabled' ? 'disabled' : 'enabled';
    try {
      await updateRule(rule.id, { trang_thai: next }, token);
      await loadRules();
    } catch (e) {
      console.error('Toggle rule failed', e);
      alert('Đổi trạng thái rule thất bại');
    }
  };

  const handleDelete = async (ruleId) => {
    if (!window.confirm('Xóa rule này?')) return;
    try {
      await deleteRule(ruleId, token);
      await loadRules();
    } catch (e) {
      console.error('Delete rule failed', e);
      alert('Xóa rule thất bại');
    }
  };

  const safeParseJson = (text) => {
    try {
      return JSON.parse(text);
    } catch (e) {
      return null;
    }
  };

  const handleSaveScheduledRule = async (e) => {
    e.preventDefault();
    if (!scheduledForm.cron_expression || !scheduledForm.device_id || !scheduledForm.action_command) {
      alert('Nhập cron, thiết bị và lệnh');
      return;
    }
    
    // Parse action_params if it's a string
    let parsedParams = null;
    if (scheduledForm.action_params) {
      parsedParams = safeParseJson(scheduledForm.action_params);
    }
    
    const body = {
      ten_rule: scheduledForm.ten_rule || null,
      phong_id: scheduledForm.phong_id ? Number(scheduledForm.phong_id) : null,
      cron_expression: scheduledForm.cron_expression,
      device_id: scheduledForm.device_id,
      action_command: scheduledForm.action_command,
      action_params: parsedParams,
      trang_thai: scheduledForm.trang_thai,
    };
    
    console.log('[SAVE_SCHEDULED_RULE]', editScheduledId ? 'UPDATE' : 'CREATE', body);
    
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/b79dabf1-b019-4647-a912-96914bd03449', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '7926b3' },
      body: JSON.stringify({
        sessionId: '7926b3',
        location: 'RulesManagement.js:handleSaveScheduledRule',
        message: 'scheduled_rule_save_payload',
        hypothesisId: 'H_scheduled_update_payload',
        data: {
          op: editScheduledId ? 'update' : 'create',
          editScheduledId,
          cronMode,
          cronPickerMode: cronPicker?.mode,
          cronPicker: {
            hour: cronPicker?.hour,
            minute: cronPicker?.minute,
            intervalMinutes: cronPicker?.intervalMinutes,
            intervalHours: cronPicker?.intervalHours,
            dayOfWeek: cronPicker?.dayOfWeek,
          },
          cron_expression: scheduledForm.cron_expression,
          device_id: scheduledForm.device_id,
          action_command: scheduledForm.action_command,
          action_params_type: parsedParams === null ? 'null' : typeof parsedParams,
          action_params: parsedParams,
          trang_thai: scheduledForm.trang_thai,
        },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion
    
    try {
      if (editScheduledId) {
        await updateScheduledRule(editScheduledId, body, token);
        console.log('[SAVE_SCHEDULED_RULE] Update successful');
      } else {
        await createScheduledRule(body, token);
        console.log('[SAVE_SCHEDULED_RULE] Create successful');
      }
      setScheduledFormVisible(false);
      setEditScheduledId(null);
      setScheduledForm({ ten_rule: '', phong_id: '', cron_expression: '0 7 * * *', device_id: '', action_command: 'turn_on', action_params: '', trang_thai: 'enabled' });
      await loadScheduledRules();
    } catch (err) {
      console.error('[SAVE_SCHEDULED_RULE] Error:', err);
      console.error('[SAVE_SCHEDULED_RULE] Response:', err.response?.data);
      
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/b79dabf1-b019-4647-a912-96914bd03449', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '7926b3' },
        body: JSON.stringify({
          sessionId: '7926b3',
          location: 'RulesManagement.js:handleSaveScheduledRule',
          message: 'scheduled_rule_save_error',
          hypothesisId: 'H_scheduled_update_payload',
          data: {
            op: editScheduledId ? 'update' : 'create',
            editScheduledId,
            http_status: err.response?.status,
            detail: err.response?.data?.detail,
            cron_expression: scheduledForm.cron_expression,
          },
          timestamp: Date.now(),
        }),
      }).catch(() => {});
      // #endregion
      
      const errorDetail = err.response?.data?.detail;
      const errorMsg = typeof errorDetail === 'object' 
        ? JSON.stringify(errorDetail) 
        : (errorDetail || err.message);
      alert(editScheduledId ? `Cập nhật thất bại: ${errorMsg}` : `Tạo thất bại: ${errorMsg}`);
    }
  };

  const parseCronToPicker = (cron) => {
    if (!cron) return { mode: 'daily', hour: 7, minute: 0, dayOfWeek: 'everyday', intervalMinutes: 15, intervalHours: 1 };
    const parts = cron.trim().split(/\s+/);
    if (parts.length < 5) return { mode: 'daily', hour: 7, minute: 0, dayOfWeek: 'everyday', intervalMinutes: 15, intervalHours: 1 };
    const [min, hr, , , dow] = parts;
    if (min.startsWith('*/') && hr === '*') return { mode: 'interval_min', hour: 7, minute: 0, dayOfWeek: 'everyday', intervalMinutes: parseInt(min.slice(2), 10) || 15, intervalHours: 1 };
    if (min === '0' && hr === '*') return { mode: 'interval_hour', hour: 7, minute: 0, dayOfWeek: 'everyday', intervalMinutes: 15, intervalHours: 1 };
    if (min === '0' && hr.startsWith('*/')) return { mode: 'interval_hour', hour: 7, minute: 0, dayOfWeek: 'everyday', intervalMinutes: 15, intervalHours: parseInt(hr.slice(2), 10) || 1 };
    const dayOfWeek = dow === '1-5' ? 'weekday' : (dow === '0,6' ? 'weekend' : 'everyday');
    return { mode: 'daily', hour: parseInt(hr, 10) || 7, minute: parseInt(min, 10) || 0, dayOfWeek, intervalMinutes: 15, intervalHours: 1 };
  };

  const handleEditScheduled = (sr) => {
    if (sr.device_id) loadDeviceControlLines(sr.device_id);
    const cron = sr.cron_expression || '0 7 * * *';
    const isPreset = CRON_PRESETS.some(p => p.value === cron);
    setScheduledForm({
      ten_rule: sr.ten_rule || '',
      phong_id: String(sr.phong_id || ''),
      cron_expression: cron,
      device_id: sr.device_id || '',
      action_command: sr.action_command || 'turn_on',
      action_params: sr.action_params ? JSON.stringify(sr.action_params) : '',
      trang_thai: sr.trang_thai || 'enabled',
    });
    setCronMode(isPreset ? 'preset' : 'custom');
    setCronPicker(parseCronToPicker(cron));
    setEditScheduledId(sr.id);
    setScheduledFormVisible(true);
  };

  const handleDeleteScheduled = async (id) => {
    if (!window.confirm('Xóa rule theo lịch này?')) return;
    try {
      await deleteScheduledRule(id, token);
      await loadScheduledRules();
    } catch (e) {
      console.error('Delete scheduled rule failed', e);
      alert('Xóa thất bại');
    }
  };

  const handleToggleScheduled = async (sr) => {
    const next = sr.trang_thai === 'enabled' ? 'disabled' : 'enabled';
    try {
      await updateScheduledRule(sr.id, { trang_thai: next }, token);
      await loadScheduledRules();
    } catch (e) {
      console.error('Toggle scheduled rule failed', e);
      alert('Đổi trạng thái thất bại');
    }
  };

  return (
    <div className="rules-page">
      <div className="rules-header">
        <div>
          <h2>Quản lý Rule</h2>
          <p>Tạo/sửa/xóa rule, lọc theo phòng · Rule theo lịch (cron)</p>
        </div>
        <div className="rules-actions">
          <div className="tab-buttons">
            <button className={activeTab === 'rules' ? 'active' : ''} onClick={() => setActiveTab('rules')}>Rule điều kiện</button>
            <button className={activeTab === 'scheduled' ? 'active' : ''} onClick={() => setActiveTab('scheduled')}>Rule theo lịch</button>
          </div>
          {activeTab === 'rules' && (
            <>
              <select value={selectedRoom} onChange={(e) => setSelectedRoom(e.target.value)}>
                <option value="">Tất cả phòng</option>
                {rooms.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.ten_phong || r.ma_phong || `Phòng ${r.id}`}
                  </option>
                ))}
              </select>
              <button onClick={() => { resetForm(); setFormVisible(true); }}>+ Tạo rule</button>
            </>
          )}
          {activeTab === 'scheduled' && (
            <button onClick={() => { setEditScheduledId(null); setScheduledForm({ ten_rule: '', phong_id: '', cron_expression: '0 7 * * *', device_id: '', action_command: 'turn_on', action_params: '', trang_thai: 'enabled' }); setCronMode('preset'); setCronPicker({ mode: 'daily', hour: 7, minute: 0, dayOfWeek: 'everyday', intervalMinutes: 15, intervalHours: 1 }); setScheduledFormVisible(true); }}>+ Tạo rule theo lịch</button>
          )}
          <button onClick={onBack}>← Về dashboard</button>
        </div>
      </div>

      {activeTab === 'scheduled' ? (
        <>
          {scheduledLoading ? (
            <p>Đang tải...</p>
          ) : (
            <div className="rules-list">
              {scheduledRules.length === 0 && <p>Chưa có rule theo lịch.</p>}
              {scheduledRules.map((sr) => (
                <div key={sr.id} className="rule-card">
                  <div className="rule-head">
                    <div>
                      <h4>{sr.ten_rule || `Rule #${sr.id}`}</h4>
                      <p className="muted">
                        ⏱️ {getCronDescription(sr.cron_expression)}
                      </p>
                      <p className="muted" style={{ fontSize: '0.85rem', marginTop: 4 }}>
                        🎯 Thiết bị: {sr.device_id} · Lệnh: {sr.action_command}
                        {sr.last_run_at && ` · Chạy lần cuối: ${sr.last_run_at}`}
                      </p>
                    </div>
                    <div className="rule-head-actions">
                      <span className={`pill tiny ${sr.trang_thai === 'enabled' ? 'pill-online' : 'pill-offline'}`}>{sr.trang_thai}</span>
                      <button onClick={() => handleToggleScheduled(sr)}>{sr.trang_thai === 'enabled' ? 'Tắt' : 'Bật'}</button>
                      <button onClick={() => handleEditScheduled(sr)}>Sửa</button>
                      <button className="danger" onClick={() => handleDeleteScheduled(sr.id)}>Xóa</button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
          {scheduledFormVisible && (
            <div className="modal-backdrop">
              <div className="modal">
                <div className="modal-header">
                  <h3>{editScheduledId ? 'Sửa Rule theo lịch' : 'Tạo Rule theo lịch'}</h3>
                  <button onClick={() => setScheduledFormVisible(false)}>✕</button>
                </div>
                <form onSubmit={handleSaveScheduledRule} className="rule-form">
                  <label>
                    Tên rule
                    <input value={scheduledForm.ten_rule} onChange={(e) => setScheduledForm({ ...scheduledForm, ten_rule: e.target.value })} placeholder="VD: Bật đèn 7h sáng" />
                  </label>
                  <label>
                    Phòng (tùy chọn)
                    <select value={scheduledForm.phong_id} onChange={(e) => setScheduledForm({ ...scheduledForm, phong_id: e.target.value })}>
                      <option value="">-- Không chọn --</option>
                      {rooms.map((r) => (
                        <option key={r.id} value={r.id}>{r.ten_phong || r.ma_phong || `Phòng ${r.id}`}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span style={{ display: 'block', marginBottom: 6, fontWeight: 600 }}>⏱️ Thời điểm chạy rule</span>
                    <small className="muted" style={{ display: 'block', marginBottom: 12 }}>Chọn thời điểm rule sẽ tự động thực hiện</small>
                    <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', padding: '8px 12px', background: cronMode === 'preset' ? 'rgba(59,130,246,0.2)' : 'rgba(30,41,59,0.5)', borderRadius: 8, border: cronMode === 'preset' ? '2px solid #3b82f6' : '2px solid transparent', transition: 'all 0.2s' }}>
                        <input type="radio" name="cronMode" checked={cronMode === 'preset'} onChange={() => setCronMode('preset')} />
                        <span>📋 Chọn mẫu có sẵn</span>
                      </label>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', padding: '8px 12px', background: cronMode === 'custom' ? 'rgba(59,130,246,0.2)' : 'rgba(30,41,59,0.5)', borderRadius: 8, border: cronMode === 'custom' ? '2px solid #3b82f6' : '2px solid transparent', transition: 'all 0.2s' }}>
                        <input type="radio" name="cronMode" checked={cronMode === 'custom'} onChange={() => setCronMode('custom')} />
                        <span>⚙️ Tùy chỉnh chi tiết</span>
                      </label>
                    </div>
                    {cronMode === 'preset' ? (
                      <>
                        <select
                          value={CRON_PRESETS.some(p => p.value === scheduledForm.cron_expression) ? scheduledForm.cron_expression : ''}
                          onChange={(e) => setScheduledForm({ ...scheduledForm, cron_expression: e.target.value })}
                          style={{ width: '100%', padding: '10px 12px', fontSize: '0.95rem' }}
                        >
                          <option value="">-- Chọn thời điểm --</option>
                          {CRON_PRESETS.map((ex) => (
                            <option key={ex.value} value={ex.value}>{ex.label}</option>
                          ))}
                        </select>
                        {scheduledForm.cron_expression && (
                          <div style={{ marginTop: 12, padding: '12px', background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.3)', borderRadius: 8 }}>
                            <div style={{ fontSize: '0.9rem', color: '#86efac', marginBottom: 4 }}>✓ {getCronDescription(scheduledForm.cron_expression)}</div>
                            <div style={{ fontSize: '0.75rem', color: '#64748b', fontFamily: 'monospace' }}>Cron: {scheduledForm.cron_expression}</div>
                          </div>
                        )}
                      </>
                    ) : (
                      <div style={{ background: 'rgba(30,41,59,0.5)', padding: 16, borderRadius: 8, border: '1px solid #334155' }}>
                        <div style={{ marginBottom: 16 }}>
                          <span style={{ fontSize: '0.9rem', color: '#cbd5e1', fontWeight: 600, display: 'block', marginBottom: 8 }}>Kiểu lặp:</span>
                          <select
                            value={cronPicker.mode}
                            onChange={(e) => {
                              const m = e.target.value;
                              setCronPicker(p => ({ ...p, mode: m }));
                              setScheduledForm({ ...scheduledForm, cron_expression: buildCronFromPicker({ ...cronPicker, mode: m }) });
                            }}
                            style={{ width: '100%', padding: '8px 12px', borderRadius: 6, background: '#1e293b', color: '#e2e8f0', border: '1px solid #475569', fontSize: '0.95rem' }}
                          >
                            <option value="daily">📅 Vào thời điểm cụ thể mỗi ngày</option>
                            <option value="interval_min">⏱️ Lặp mỗi X phút</option>
                            <option value="interval_hour">🕐 Lặp mỗi X giờ</option>
                          </select>
                        </div>
                        {cronPicker.mode === 'daily' && (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                              <span style={{ fontSize: '0.9rem', color: '#cbd5e1', minWidth: 80 }}>🕐 Thời gian:</span>
                              <select value={cronPicker.hour} onChange={(e) => { const h = Number(e.target.value); setCronPicker(p => ({ ...p, hour: h })); setScheduledForm({ ...scheduledForm, cron_expression: buildCronFromPicker({ ...cronPicker, hour: h }) }); }} style={{ padding: '6px 10px', borderRadius: 6, background: '#1e293b', color: '#e2e8f0', border: '1px solid #475569', fontSize: '0.95rem' }}>
                                {Array.from({ length: 24 }, (_, i) => <option key={i} value={i}>{i.toString().padStart(2, '0')} giờ</option>)}
                              </select>
                              <select value={cronPicker.minute} onChange={(e) => { const m = Number(e.target.value); setCronPicker(p => ({ ...p, minute: m })); setScheduledForm({ ...scheduledForm, cron_expression: buildCronFromPicker({ ...cronPicker, minute: m }) }); }} style={{ padding: '6px 10px', borderRadius: 6, background: '#1e293b', color: '#e2e8f0', border: '1px solid #475569', fontSize: '0.95rem' }}>
                                {Array.from({ length: 60 }, (_, i) => <option key={i} value={i}>{i.toString().padStart(2, '0')} phút</option>)}
                              </select>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                              <span style={{ fontSize: '0.9rem', color: '#cbd5e1', minWidth: 80 }}>📅 Ngày:</span>
                              <select value={cronPicker.dayOfWeek} onChange={(e) => { const d = e.target.value; setCronPicker(p => ({ ...p, dayOfWeek: d })); setScheduledForm({ ...scheduledForm, cron_expression: buildCronFromPicker({ ...cronPicker, dayOfWeek: d }) }); }} style={{ flex: 1, padding: '6px 10px', borderRadius: 6, background: '#1e293b', color: '#e2e8f0', border: '1px solid #475569', fontSize: '0.95rem' }}>
                                <option value="everyday">Mỗi ngày</option>
                                <option value="weekday">Thứ 2 - 6 (ngày làm việc)</option>
                                <option value="weekend">Thứ 7, Chủ nhật</option>
                              </select>
                            </div>
                          </div>
                        )}
                        {cronPicker.mode === 'interval_min' && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                            <span style={{ fontSize: '0.9rem', color: '#cbd5e1', minWidth: 80 }}>⏱️ Lặp mỗi:</span>
                            <select value={cronPicker.intervalMinutes} onChange={(e) => { const v = Number(e.target.value); setCronPicker(p => ({ ...p, intervalMinutes: v })); setScheduledForm({ ...scheduledForm, cron_expression: buildCronFromPicker({ ...cronPicker, intervalMinutes: v }) }); }} style={{ flex: 1, padding: '6px 10px', borderRadius: 6, background: '#1e293b', color: '#e2e8f0', border: '1px solid #475569', fontSize: '0.95rem' }}>
                              {Array.from({ length: 60 }, (_, i) => i + 1).map(n => (
                                <option key={n} value={n}>{n} phút</option>
                              ))}
                            </select>
                          </div>
                        )}
                        {cronPicker.mode === 'interval_hour' && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                            <span style={{ fontSize: '0.9rem', color: '#cbd5e1', minWidth: 80 }}>🕐 Lặp mỗi:</span>
                            <select value={cronPicker.intervalHours} onChange={(e) => { const v = Number(e.target.value); setCronPicker(p => ({ ...p, intervalHours: v })); setScheduledForm({ ...scheduledForm, cron_expression: buildCronFromPicker({ ...cronPicker, intervalHours: v }) }); }} style={{ flex: 1, padding: '6px 10px', borderRadius: 6, background: '#1e293b', color: '#e2e8f0', border: '1px solid #475569', fontSize: '0.95rem' }}>
                              {[1, 2, 6, 12].map(n => <option key={n} value={n}>{n} giờ</option>)}
                            </select>
                          </div>
                        )}
                        <div style={{ marginTop: 16, padding: '12px', background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.3)', borderRadius: 8 }}>
                          <div style={{ fontSize: '0.9rem', color: '#86efac', marginBottom: 4 }}>✓ {getCronDescription(scheduledForm.cron_expression)}</div>
                          <div style={{ fontSize: '0.75rem', color: '#64748b', fontFamily: 'monospace' }}>Cron expression: {scheduledForm.cron_expression}</div>
                        </div>
                      </div>
                    )}
                  </label>
                  <label>
                    Thiết bị
                    {scheduledForm.phong_id && roomDevices.length > 0 ? (
                      <select value={scheduledForm.device_id} onChange={(e) => {
                          const v = e.target.value;
                          setScheduledForm({ ...scheduledForm, device_id: v });
                          loadDeviceControlLines(v);
                      }} required>
                        <option value="">Chọn thiết bị</option>
                        {roomDevices.map((d) => (
                          <option key={d.ma_thiet_bi} value={d.ma_thiet_bi}>{d.ten_thiet_bi || d.ma_thiet_bi}</option>
                        ))}
                      </select>
                    ) : (
                      <input value={scheduledForm.device_id} onChange={(e) => {
                          const v = e.target.value;
                          setScheduledForm({ ...scheduledForm, device_id: v });
                          loadDeviceControlLines(v);
                      }} placeholder="Mã thiết bị (VD: device-001)" required />
                    )}
                    {scheduledForm.phong_id && roomDevices.length === 0 && <small className="muted">Đang tải thiết bị... Hoặc nhập mã thiết bị trực tiếp</small>}
                    {!scheduledForm.phong_id && <small className="muted">Để trống phòng và nhập mã thiết bị trực tiếp</small>}
                  </label>
                  <label>
                    Lệnh
                    <select 
                      value={getCommandSelectValue(scheduledForm.action_command, scheduledForm.action_params)} 
                      onChange={(e) => handleCommandSelectChange(
                        e.target.value, 
                        (cmd) => setScheduledForm(prev => ({ ...prev, action_command: cmd })),
                        (params) => setScheduledForm(prev => ({ ...prev, action_params: params }))
                      )}
                    >
                      <option value="">Chọn lệnh</option>
                      {deviceControlLinesCache[scheduledForm.device_id]?.map(line => {
                        const labelName = line.ten_duong || `Relay ${line.relay_number}`;
                        return [
                          <option key={`ON_${line.relay_number}`} value={`relay_ON_${line.relay_number}`}>🟢 Bật {labelName}</option>,
                          <option key={`OFF_${line.relay_number}`} value={`relay_OFF_${line.relay_number}`}>🔴 Tắt {labelName}</option>
                        ];
                      })}
                      {commandOptions.map((c) => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                      <option value="custom">Khác (nhập tay)</option>
                    </select>
                    {getCommandSelectValue(scheduledForm.action_command, scheduledForm.action_params) === 'custom' && (
                      <input value={scheduledForm.action_command} onChange={(e) => setScheduledForm({ ...scheduledForm, action_command: e.target.value })} placeholder="Lệnh tùy chỉnh" style={{marginTop: 8}} />
                    )}
                  </label>
                  <label>
                    Params (JSON, tùy chọn)
                    <input value={scheduledForm.action_params} onChange={(e) => setScheduledForm({ ...scheduledForm, action_params: e.target.value })} placeholder='{"target": 22}' />
                  </label>
                  <label>
                    Trạng thái
                    <select value={scheduledForm.trang_thai} onChange={(e) => setScheduledForm({ ...scheduledForm, trang_thai: e.target.value })}>
                      <option value="enabled">Bật</option>
                      <option value="disabled">Tắt</option>
                    </select>
                  </label>
                  <div className="form-actions">
                    <button type="submit">Lưu</button>
                    <button type="button" onClick={() => setScheduledFormVisible(false)}>Hủy</button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </>
      ) : loading ? (
        <p>Đang tải...</p>
      ) : (
        <div className="rules-list">
          {filteredRules.length === 0 && <p>Chưa có rule.</p>}
          {filteredRules.map((rule) => (
            <div key={rule.id} className="rule-card">
              <div className="rule-head">
                <div>
                  <h4>{rule.ten_rule || `Rule #${rule.id}`}</h4>
                  <p className="muted">
                    Phòng: {rule.ten_phong || rule.phong_id || 'N/A'} · Device: {rule.condition_device_id} · {rule.field} {rule.operator} {rule.value}
                  </p>
                </div>
                <div className="rule-head-actions">
                  <span className={`pill tiny ${rule.trang_thai === 'enabled' ? 'pill-online' : 'pill-offline'}`}>{rule.trang_thai}</span>
                  <button onClick={() => handleToggleStatus(rule)}>{rule.trang_thai === 'enabled' ? 'Disable' : 'Enable'}</button>
                  <button onClick={() => handleEditRule(rule)}>Sửa</button>
                  <button className="danger" onClick={() => handleDelete(rule.id)}>Xóa</button>
                </div>
              </div>
              <div className="rule-actions-list">
                {rule.actions && rule.actions.length > 0 ? (
                  rule.actions.map((a) => (
                    <div key={a.id} className="rule-action-chip">
                      <div>Thiết bị: {a.device_id}</div>
                      <div>Lệnh: {a.action_command}</div>
                      {a.action_params && <div>Params: {JSON.stringify(a.action_params)}</div>}
                      <div>Delay: {a.delay_seconds || 0}s · Thứ tự: {a.thu_tu || 1}</div>
                    </div>
                  ))
                ) : (
                  <div className="muted">Chưa có action</div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {roomModalVisible && (
        <div className="modal-backdrop">
          <div className="modal">
            <div className="modal-header">
              <h3>Tạo phòng</h3>
              <button onClick={() => setRoomModalVisible(false)}>✕</button>
            </div>
            <form className="rule-form" onSubmit={handleCreateRoomFull}>
              <label>
                Tên phòng
                <input
                  value={roomForm.ten_phong}
                  onChange={(e) => setRoomForm({ ...roomForm, ten_phong: e.target.value })}
                  placeholder="VD: Phòng Lab 1"
                  required
                />
              </label>
              <label>
                Mã phòng
                <input
                  value={roomForm.ma_phong}
                  onChange={(e) => setRoomForm({ ...roomForm, ma_phong: e.target.value })}
                  placeholder="VD: LAB-01"
                />
              </label>
              <label>
                Vị trí
                <input
                  value={roomForm.vi_tri}
                  onChange={(e) => setRoomForm({ ...roomForm, vi_tri: e.target.value })}
                  placeholder="Tầng 2, khu A"
                />
              </label>
              <label>
                Mô tả
                <input
                  value={roomForm.mo_ta}
                  onChange={(e) => setRoomForm({ ...roomForm, mo_ta: e.target.value })}
                  placeholder="Mô tả phòng"
                />
              </label>
              <label>
                Người quản lý ID
                <input
                  type="number"
                  value={roomForm.nguoi_quan_ly_id}
                  onChange={(e) => setRoomForm({ ...roomForm, nguoi_quan_ly_id: e.target.value })}
                  placeholder="ID user (tùy chọn)"
                  min={0}
                />
              </label>
              <div className="form-actions">
                <button type="submit">Lưu phòng</button>
                <button type="button" onClick={() => setRoomModalVisible(false)}>Hủy</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {formVisible && (
        <div className="modal-backdrop">
          <div className="modal rule-modal-large">
            <div className="modal-header">
              <h3>{editRuleId ? 'Sửa Rule' : 'Tạo Rule'}</h3>
              <div className="form-mode-toggle">
                <button type="button" className={formMode === 'form' ? 'active' : ''} onClick={() => setFormMode('form')}>Form</button>
                <button type="button" className={formMode === 'visual' ? 'active' : ''} onClick={() => setFormMode('visual')}>Visual (Rule Chain)</button>
              </div>
              <button onClick={() => setFormVisible(false)}>✕</button>
            </div>
            {formMode === 'visual' ? (
              <div className="rule-visual-form">
                <div className="rule-visual-meta">
                  <label>
                    Tên rule
                    <input value={formData.ten_rule} onChange={(e) => setFormData({ ...formData, ten_rule: e.target.value })} placeholder="VD: Bật AC khi nóng" />
                  </label>
                  <label>
                    Phòng
                    <select value={formData.phong_id} onChange={(e) => { const v = e.target.value; setFormData({ ...formData, phong_id: v }); loadDevicesByRoom(v); }}>
                      <option value="">Chọn phòng</option>
                      {rooms.map((r) => (
                        <option key={r.id} value={r.id}>{r.ten_phong || r.ma_phong || `Phòng ${r.id}`}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Mức độ ưu tiên
                    <input type="number" value={formData.muc_do_uu_tien} onChange={(e) => setFormData({ ...formData, muc_do_uu_tien: e.target.value })} min={1} />
                  </label>
                </div>
                <RuleChainEditor
                  ref={ruleChainEditorRef}
                  initialNodes={ruleGraph.nodes}
                  initialEdges={ruleGraph.edges}
                  onChange={setRuleGraph}
                  roomDevices={roomDevices}
                  conditionFields={conditionFields}
                  commandOptions={commandOptions}
                />
                <div className="form-actions">
                  <button type="button" onClick={handleSaveRule}>Lưu rule</button>
                  <button type="button" onClick={() => { resetForm(); setFormVisible(false); }}>Hủy</button>
                </div>
              </div>
            ) : (
            <form onSubmit={handleSaveRule} className="rule-form">
              <label>
                Tên rule
                <input
                  value={formData.ten_rule}
                  onChange={(e) => setFormData({ ...formData, ten_rule: e.target.value })}
                  placeholder="VD: Bật AC khi nóng"
                />
              </label>
              <label>
                Phòng
                <select
                  value={formData.phong_id}
                  onChange={(e) => {
                    const val = e.target.value;
                    setFormData({ ...formData, phong_id: val, condition_device_id: '' });
                    loadDevicesByRoom(val);
                    setConditionFields([]);
                  }}
                >
                  <option value="">Chọn phòng</option>
                  {rooms.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.ten_phong || r.ma_phong || `Phòng ${r.id}`}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Thiết bị điều kiện
                <select
                  value={formData.condition_device_id}
                  onChange={(e) => {
                    const val = e.target.value;
                    setFormData({ ...formData, condition_device_id: val });
                    loadDeviceFields(val);
                  }}
                  disabled={!formData.phong_id}
                >
                  <option value="">Chọn thiết bị</option>
                  {roomDevices.map((d) => (
                    <option key={d.ma_thiet_bi} value={d.ma_thiet_bi}>
                      {d.ten_thiet_bi || d.ma_thiet_bi}
                    </option>
                  ))}
                </select>
              </label>
              <div className="form-row">
                <label>
                  Điều kiện
                  <div className="conditions-block">
                    {formData.conditions.map((c, idx) => (
                      <div className="condition-row" key={idx}>
                        <select
                          value={c.field}
                          onChange={(e) => handleConditionChange(idx, 'field', e.target.value)}
                        >
                          <option value="">Chọn field</option>
                          {conditionLoading && <option disabled>Đang tải field...</option>}
                          {!conditionLoading && conditionFields.length === 0 && <option disabled>(Chưa có dữ liệu thiết bị)</option>}
                          {conditionFields.map((f) => (
                            <option key={f} value={f}>
                              {f}
                            </option>
                          ))}
                        </select>
                        <select value={c.operator} onChange={(e) => handleConditionChange(idx, 'operator', e.target.value)}>
                          {operatorOptions.map((op) => (
                            <option key={op} value={op}>
                              {op}
                            </option>
                          ))}
                        </select>
                        <input
                          value={c.value}
                          onChange={(e) => handleConditionChange(idx, 'value', e.target.value)}
                          placeholder="Giá trị"
                        />
                        <button type="button" className="danger" onClick={() => handleRemoveCondition(idx)}>
                          X
                        </button>
                      </div>
                    ))}
                    <button type="button" onClick={handleAddCondition}>
                      + Thêm điều kiện
                    </button>
                  </div>
                </label>
              </div>
              <label>
                Mức độ ưu tiên
                <input
                  type="number"
                  value={formData.muc_do_uu_tien}
                  onChange={(e) => setFormData({ ...formData, muc_do_uu_tien: e.target.value })}
                  min={1}
                />
              </label>

              <div className="actions-section">
                <div className="actions-header">
                  <h4>Actions</h4>
                  <button type="button" onClick={handleAddAction}>
                    + Thêm action
                  </button>
                </div>
                {formData.actions.map((a, idx) => (
                  <div key={idx} className="action-row">
                    <label>
                      Thiết bị đích
                      <select
                        value={a.device_id}
                        onChange={(e) => {
                          const v = e.target.value;
                          handleActionChange(idx, 'device_id', v);
                          loadDeviceControlLines(v);
                        }}
                        disabled={!formData.phong_id}
                      >
                        <option value="">Chọn thiết bị</option>
                        {roomDevices.map((d) => (
                          <option key={d.ma_thiet_bi} value={d.ma_thiet_bi}>
                            {d.ten_thiet_bi || d.ma_thiet_bi}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Command
                      <select
                        value={getCommandSelectValue(a.action_command, a.action_params)}
                        onChange={(e) => handleCommandSelectChange(
                          e.target.value,
                          (cmd) => handleActionChange(idx, 'action_command', cmd),
                          (params) => handleActionChange(idx, 'action_params', params)
                        )}
                      >
                        <option value="">Chọn lệnh</option>
                        {deviceControlLinesCache[a.device_id]?.map(line => {
                          const labelName = line.ten_duong || `Relay ${line.relay_number}`;
                          return [
                            <option key={`ON_${line.relay_number}`} value={`relay_ON_${line.relay_number}`}>🟢 Bật {labelName}</option>,
                            <option key={`OFF_${line.relay_number}`} value={`relay_OFF_${line.relay_number}`}>🔴 Tắt {labelName}</option>
                          ];
                        })}
                        {commandOptions.map((c) => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        ))}
                        <option value="custom">Khác (nhập tay)</option>
                      </select>
                      {getCommandSelectValue(a.action_command, a.action_params) === 'custom' && (
                        <input
                          style={{marginTop: 8}}
                          value={a.action_command}
                          onChange={(e) => handleActionChange(idx, 'action_command', e.target.value)}
                          placeholder="Nhập command tùy chỉnh"
                        />
                      )}
                    </label>
                    <label>
                      {numericParamCommands.includes(a.action_command)
                        ? getParamLabel(a.action_command)
                        : 'Params (JSON)'}
                      {numericParamCommands.includes(a.action_command) ? (
                        <input
                          type="number"
                          value={
                            // Extract numeric value from JSON or use raw value
                            (() => {
                              try {
                                const parsed = JSON.parse(a.action_params);
                                return parsed?.target ?? '';
                              } catch {
                                return a.action_params || '';
                              }
                            })()
                          }
                          onChange={(e) => {
                            // Store as JSON format internally
                            const val = e.target.value;
                            handleActionChange(idx, 'action_params', val ? `{"target":${val}}` : '');
                          }}
                          placeholder="Nhập giá trị"
                        />
                      ) : (
                        <input
                          value={a.action_params}
                          onChange={(e) => handleActionChange(idx, 'action_params', e.target.value)}
                          placeholder='{"key":"value"}'
                        />
                      )}
                    </label>
                    <label>
                      Delay (s)
                      <input
                        type="number"
                        value={a.delay_seconds}
                        onChange={(e) => handleActionChange(idx, 'delay_seconds', e.target.value)}
                        min={0}
                      />
                    </label>
                    <label>
                      Thứ tự
                      <input
                        type="number"
                        value={a.thu_tu}
                        onChange={(e) => handleActionChange(idx, 'thu_tu', e.target.value)}
                        min={1}
                      />
                    </label>
                    <button type="button" className="danger" onClick={() => handleRemoveAction(idx)}>
                      X
                    </button>
                  </div>
                ))}
              </div>

              <div className="form-actions">
                <button type="submit">{editRuleId ? 'Cập nhật rule' : 'Lưu rule'}</button>
                <button type="button" onClick={() => { resetForm(); setFormVisible(false); }}>
                  Hủy
                </button>
              </div>
            </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

