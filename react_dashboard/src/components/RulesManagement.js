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
} from '../services';

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

  // Form state
  const [formVisible, setFormVisible] = useState(false);
  const [editRuleId, setEditRuleId] = useState(null); // null = tạo mới, number = chỉnh sửa
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

  useEffect(() => {
    loadRooms();
    loadRules();
  }, []);

  useEffect(() => {
    if (formVisible && formData.phong_id) {
      loadDevicesByRoom(formData.phong_id);
    }
  }, [formVisible, formData.phong_id]);

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
    setRoomDevices([]);
    setConditionFields([]);
  };

  const handleSaveRule = async (e) => {
    e.preventDefault();
    if (!formData.phong_id || !formData.condition_device_id) {
      alert('Chọn phòng và thiết bị điều kiện');
      return;
    }
    const body = {
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
    // Load devices trong phòng của rule
    await loadDevicesByRoom(rule.phong_id);
    await loadDeviceFields(rule.condition_device_id);

    // Parse conditions từ rule
    let conditions = [{ ...emptyCondition }];
    if (rule.conditions && Array.isArray(rule.conditions) && rule.conditions.length > 0) {
      conditions = rule.conditions.map(c => ({
        field: c.field || '',
        operator: c.operator || '>',
        value: c.value || '',
      }));
    } else if (rule.field && rule.operator && rule.value) {
      // Fallback: dùng field/operator/value legacy
      conditions = [{ field: rule.field, operator: rule.operator, value: rule.value }];
    }

    // Parse actions từ rule
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

  return (
    <div className="rules-page">
      <div className="rules-header">
        <div>
          <h2>Quản lý Rule</h2>
          <p>Tạo/sửa/xóa rule, lọc theo phòng</p>
        </div>
        <div className="rules-actions">
          <select value={selectedRoom} onChange={(e) => setSelectedRoom(e.target.value)}>
            <option value="">Tất cả phòng</option>
            {rooms.map((r) => (
              <option key={r.id} value={r.id}>
                {r.ten_phong || r.ma_phong || `Phòng ${r.id}`}
              </option>
            ))}
          </select>
          <button onClick={() => { resetForm(); setFormVisible(true); }}>+ Tạo rule</button>
          <button onClick={onBack}>← Về dashboard</button>
        </div>
      </div>

      {loading ? (
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
          <div className="modal">
            <div className="modal-header">
              <h3>{editRuleId ? 'Sửa Rule' : 'Tạo Rule'}</h3>
              <button onClick={() => setFormVisible(false)}>✕</button>
            </div>
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
                        onChange={(e) => handleActionChange(idx, 'device_id', e.target.value)}
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
                        value={commandOptions.includes(a.action_command) ? a.action_command : a.action_command ? 'custom' : ''}
                        onChange={(e) => {
                          const val = e.target.value;
                          if (val === 'custom') {
                            handleActionChange(idx, 'action_command', '');
                          } else {
                            handleActionChange(idx, 'action_command', val);
                          }
                        }}
                      >
                        <option value="">Chọn command</option>
                        {commandOptions.map((c) => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        ))}
                        <option value="custom">Khác (nhập tay)</option>
                      </select>
                      {!commandOptions.includes(a.action_command) && (
                        <input
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
          </div>
        </div>
      )}
    </div>
  );
}

