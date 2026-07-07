import React, { useEffect, useState } from 'react';
import {
  fetchDeviceProfiles,
  createDeviceProfile,
  updateDeviceProfile,
  deleteDeviceProfile,
  fetchDevices,
} from '../services';

export default function DeviceProfilesManagement({ token, onBack, workspaceContext = 'ca_nhan', userInfo = null }) {
  const [profiles, setProfiles] = useState([]);
  const [devices, setDevices] = useState([]);
  const [loading, setLoading] = useState(false);
  const [formVisible, setFormVisible] = useState(false);
  const [editId, setEditId] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState('all');

  const effectiveWorkspaceId = workspaceContext === 'nhom' ? (userInfo?.primary_nhom_id || null) : null;
  
  // Form state
  const [form, setForm] = useState({
    ten_profile: '',
    device_id: '',
    device_type: '',
    field_mapping: {},      // { "temp": "temperature", "hum": "humidity" }
    unit_convert: {},      // { "temperature": { "from": "raw", "to": "celsius", "factor": 0.1 } }
    timestamp_format: 'unix',
  });
  const [activeTab, setActiveTab] = useState('basic'); // basic | fields | units | advanced

  // Field mapping editor
  const [newMappingFrom, setNewMappingFrom] = useState('');
  const [newMappingTo, setNewMappingTo] = useState('');

  // Unit conversion editor
  const [newUnitField, setNewUnitField] = useState('');
  const [newUnitFactor, setNewUnitFactor] = useState('1');
  const [newUnitOffset, setNewUnitOffset] = useState('0');
  const [newUnitUnit, setNewUnitUnit] = useState('');

  const loadProfiles = async () => {
    setLoading(true);
    try {
      const res = await fetchDeviceProfiles(token);
      setProfiles(res.data.profiles || []);
    } catch (e) {
      console.error('Load profiles failed', e);
      setProfiles([]);
    } finally {
      setLoading(false);
    }
  };

  const loadDevices = async () => {
    try {
      const res = await fetchDevices(token, { params: effectiveWorkspaceId ? { workspace_id: effectiveWorkspaceId } : {} });
      setDevices(res.data.devices || []);
    } catch (e) {
      console.error('Load devices failed', e);
    }
  };

  useEffect(() => {
    loadProfiles();
    loadDevices();
  }, []);

  const parseConfig = (cfg) => {
    if (typeof cfg === 'string') {
      try { return JSON.parse(cfg); } catch { return {}; }
    }
    return cfg || {};
  };

  const buildConfig = () => ({
    field_mapping: form.field_mapping || {},
    unit_convert: form.unit_convert || {},
    timestamp_format: form.timestamp_format || 'unix',
  });

  const handleSave = async (e) => {
    e.preventDefault();
    if (!form.ten_profile.trim()) {
      alert('Vui lòng nhập tên profile');
      return;
    }
    const body = {
      ten_profile: form.ten_profile,
      device_id: form.device_id || null,
      device_type: form.device_type || null,
      config: buildConfig(),
    };
    try {
      if (editId) {
        await updateDeviceProfile(editId, body, token);
      } else {
        await createDeviceProfile(body, token);
      }
      setFormVisible(false);
      setEditId(null);
      resetForm();
      await loadProfiles();
    } catch (err) {
      console.error('Save profile failed', err);
      alert('Lưu thất bại');
    }
  };

  const resetForm = () => {
    setForm({
      ten_profile: '',
      device_id: '',
      device_type: '',
      field_mapping: {},
      unit_convert: {},
      timestamp_format: 'unix',
    });
    setActiveTab('basic');
    setNewMappingFrom('');
    setNewMappingTo('');
    setNewUnitField('');
    setNewUnitFactor('1');
    setNewUnitOffset('0');
    setNewUnitUnit('');
  };

  const handleEdit = (p) => {
    const cfg = parseConfig(p.config);
    setForm({
      ten_profile: p.ten_profile || '',
      device_id: p.device_id || '',
      device_type: p.device_type || '',
      field_mapping: cfg.field_mapping || {},
      unit_convert: cfg.unit_convert || {},
      timestamp_format: cfg.timestamp_format || 'unix',
    });
    setEditId(p.id);
    setFormVisible(true);
    setActiveTab('basic');
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Xóa profile này?')) return;
    try {
      await deleteDeviceProfile(id, token);
      await loadProfiles();
    } catch (e) {
      console.error('Delete failed', e);
      alert('Xóa thất bại');
    }
  };

  const addFieldMapping = () => {
    if (!newMappingFrom.trim()) return;
    setForm(prev => ({
      ...prev,
      field_mapping: { ...prev.field_mapping, [newMappingFrom.trim()]: newMappingTo.trim() || newMappingFrom.trim() }
    }));
    setNewMappingFrom('');
    setNewMappingTo('');
  };

  const removeFieldMapping = (key) => {
    setForm(prev => {
      const newMapping = { ...prev.field_mapping };
      delete newMapping[key];
      return { ...prev, field_mapping: newMapping };
    });
  };

  const addUnitConvert = () => {
    if (!newUnitField.trim()) return;
    setForm(prev => ({
      ...prev,
      unit_convert: {
        ...prev.unit_convert,
        [newUnitField.trim()]: {
          factor: parseFloat(newUnitFactor) || 1,
          offset: parseFloat(newUnitOffset) || 0,
          unit: newUnitUnit.trim(),
        }
      }
    }));
    setNewUnitField('');
    setNewUnitFactor('1');
    setNewUnitOffset('0');
    setNewUnitUnit('');
  };

  const removeUnitConvert = (key) => {
    setForm(prev => {
      const newConvert = { ...prev.unit_convert };
      delete newConvert[key];
      return { ...prev, unit_convert: newConvert };
    });
  };

  // Filter profiles
  const filteredProfiles = profiles.filter(p => {
    const matchesSearch = !searchTerm || 
      (p.ten_profile || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (p.device_id || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (p.device_type || '').toLowerCase().includes(searchTerm.toLowerCase());
    const matchesType = filterType === 'all' || 
      (filterType === 'device' && p.device_id) ||
      (filterType === 'type' && p.device_type && !p.device_id) ||
      (filterType === 'default' && !p.device_id && !p.device_type);
    return matchesSearch && matchesType;
  });

  // Get device type counts for filter
  const typeCounts = {
    all: profiles.length,
    device: profiles.filter(p => p.device_id).length,
    type: profiles.filter(p => p.device_type && !p.device_id).length,
    default: profiles.filter(p => !p.device_id && !p.device_type).length,
  };

  return (
    <div className="rules-page">
      {/* Header */}
      <div className="rules-header">
        <button type="button" className="back-btn-ghost" onClick={onBack}>← Quay lại</button>
        <div className="rules-actions">
          <button onClick={() => { setEditId(null); resetForm(); setFormVisible(true); }} className="primary">
            + Tạo Profile
          </button>
        </div>
      </div>

      {/* Search & Filter */}
      <div style={{ display: 'flex', gap: '12px', marginBottom: '20px', flexWrap: 'wrap' }}>
        <input
          type="text"
          placeholder="Tìm kiếm profile..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="dp-search-input"
          style={{
            flex: 1,
            minWidth: '200px',
            padding: '10px 14px',
            borderRadius: '8px',
            fontSize: '14px',
          }}
        />
        <div style={{ display: 'flex', gap: '6px' }}>
          {[
            { key: 'all', label: 'Tất cả' },
            { key: 'device', label: 'Theo thiết bị' },
            { key: 'type', label: 'Theo loại' },
            { key: 'default', label: 'Mặc định' },
          ].map(f => (
            <button
              key={f.key}
              onClick={() => setFilterType(f.key)}
              className={`dp-filter-btn${filterType === f.key ? ' active' : ''}`}
              style={{
                padding: '8px 14px',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '13px',
              }}
            >
              {f.label} ({typeCounts[f.key]})
            </button>
          ))}
        </div>
      </div>

      {/* Profile Grid */}
      {loading ? (
        <div className="dp-loading" style={{ textAlign: 'center', padding: '40px' }}>Đang tải...</div>
      ) : filteredProfiles.length === 0 ? (
        <div className="dp-loading" style={{ textAlign: 'center', padding: '40px' }}>
          {profiles.length === 0 ? 'Chưa có profile nào. Tạo profile để map field, convert unit.' : 'Không tìm thấy profile nào.'}
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '16px' }}>
          {filteredProfiles.map((p) => {
            const cfg = parseConfig(p.config);
            const fieldCount = Object.keys(cfg.field_mapping || {}).length;
            const unitCount = Object.keys(cfg.unit_convert || {}).length;
            return (
              <div key={p.id} className="rule-card" style={{ display: 'flex', flexDirection: 'column' }}>
                {/* Card Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                  <div>
                    <h4 className="dp-card-title" style={{ margin: 0, fontSize: '16px' }}>{p.ten_profile || `Profile #${p.id}`}</h4>
                    <div style={{ display: 'flex', gap: '8px', marginTop: '6px' }}>
                      {p.device_id && (
                        <span className="dp-chip-device" style={{ padding: '2px 8px', borderRadius: '4px', fontSize: '11px' }}>
                          📱 {p.device_id}
                        </span>
                      )}
                      {p.device_type && (
                        <span className="dp-chip-type" style={{ padding: '2px 8px', borderRadius: '4px', fontSize: '11px' }}>
                          🏷️ {p.device_type}
                        </span>
                      )}
                      {!p.device_id && !p.device_type && (
                        <span className="dp-chip-default" style={{ padding: '2px 8px', borderRadius: '4px', fontSize: '11px' }}>
                          ⭐ Mặc định
                        </span>
                      )}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <button onClick={() => handleEdit(p)} className="dp-btn-edit" style={{ padding: '6px 12px', fontSize: '12px', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
                      Sửa
                    </button>
                    <button onClick={() => handleDelete(p.id)} className="dp-btn-delete" style={{ padding: '6px 12px', fontSize: '12px', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
                      Xóa
                    </button>
                  </div>
                </div>

                {/* Config Summary */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginTop: 'auto' }}>
                  <div className="dp-summary" style={{ padding: '10px', borderRadius: '6px' }}>
                    <div className="dp-summary-label" style={{ fontSize: '11px', marginBottom: '4px' }}>Field Mapping</div>
                    <div className="dp-summary-value-blue" style={{ fontSize: '18px', fontWeight: '600' }}>{fieldCount}</div>
                    <div className="dp-summary-sub" style={{ fontSize: '10px' }}>fields mapped</div>
                  </div>
                  <div className="dp-summary" style={{ padding: '10px', borderRadius: '6px' }}>
                    <div className="dp-summary-label" style={{ fontSize: '11px', marginBottom: '4px' }}>Unit Convert</div>
                    <div className="dp-summary-value-green" style={{ fontSize: '18px', fontWeight: '600' }}>{unitCount}</div>
                    <div className="dp-summary-sub" style={{ fontSize: '10px' }}>units converted</div>
                  </div>
                </div>

                {/* Timestamp Format */}
                <div className="dp-timestamp-line" style={{ marginTop: '8px', fontSize: '12px' }}>
                  Timestamp: <code className="dp-timestamp-code" style={{ padding: '2px 6px', borderRadius: '3px' }}>{cfg.timestamp_format || 'unix'}</code>
                </div>

                {/* Preview Field Mappings */}
                {fieldCount > 0 && (
                  <div className="dp-preview" style={{ marginTop: '10px', padding: '8px', borderRadius: '4px', fontSize: '11px' }}>
                    <div className="dp-preview-muted" style={{ marginBottom: '4px' }}>Mappings:</div>
                    {Object.entries(cfg.field_mapping || {}).slice(0, 3).map(([k, v]) => (
                      <span key={k} className="dp-preview-arrow" style={{ marginRight: '8px' }}>
                        {k} → <span className="dp-preview-value">{v}</span>
                      </span>
                    ))}
                    {fieldCount > 3 && <span className="dp-preview-muted">+{fieldCount - 3} more</span>}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Modal Form */}
      {formVisible && (
        <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && setFormVisible(false)}>
          <div className="modal" style={{ maxWidth: '700px', maxHeight: '90vh', overflow: 'auto' }}>
            <div className="modal-header">
              <h3>{editId ? 'Sửa Profile' : 'Tạo Profile Mới'}</h3>
              <button onClick={() => setFormVisible(false)}>✕</button>
            </div>
            
            <form onSubmit={handleSave} className="rule-form">
              {/* Tab Navigation */}
              <div className="dp-modal-tabs" style={{ display: 'flex', marginBottom: '20px' }}>
                {[
                  { key: 'basic', label: '📋 Cơ bản', icon: '📋' },
                  { key: 'fields', label: '🔗 Field Mapping', icon: '🔗' },
                  { key: 'units', label: '⚡ Unit Convert', icon: '⚡' },
                  { key: 'advanced', label: '⚙️ Nâng cao', icon: '⚙️' },
                ].map(tab => (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => setActiveTab(tab.key)}
                    className={`dp-modal-tab${activeTab === tab.key ? ' active' : ''}`}
                    style={{
                      padding: '10px 16px',
                      background: 'none',
                      cursor: 'pointer',
                      fontSize: '13px',
                    }}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              {/* Tab: Basic */}
              {activeTab === 'basic' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  <label style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <span className="dp-form-label">Tên profile <span className="dp-required-mark">*</span></span>
                    <input
                      value={form.ten_profile}
                      onChange={(e) => setForm({ ...form, ten_profile: e.target.value })}
                      placeholder="VD: Cảm biến nhiệt độ"
                      className="dp-form-input"
                      style={{ padding: '10px', borderRadius: '6px' }}
                    />
                  </label>

                  <label style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <span className="dp-form-label">Áp dụng cho thiết bị cụ thể</span>
                    <select
                      value={form.device_id}
                      onChange={(e) => setForm({ ...form, device_id: e.target.value })}
                      className="dp-form-select"
                      style={{ padding: '10px', borderRadius: '6px' }}
                    >
                      <option value="">-- Tất cả thiết bị --</option>
                      {devices.map((d) => (
                        <option key={d.ma_thiet_bi} value={d.ma_thiet_bi}>{d.ten_thiet_bi || d.ma_thiet_bi}</option>
                      ))}
                    </select>
                    <small className="dp-form-help" style={{ fontSize: '12px' }}>Để trống nếu muốn áp dụng cho tất cả hoặc theo loại thiết bị</small>
                  </label>

                  <label style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <span className="dp-form-label">Áp dụng cho loại thiết bị</span>
                    <input
                      value={form.device_type}
                      onChange={(e) => setForm({ ...form, device_type: e.target.value })}
                      placeholder="VD: temperature_sensor, power_meter"
                      className="dp-form-input"
                      style={{ padding: '10px', borderRadius: '6px' }}
                    />
                    <small className="dp-form-help" style={{ fontSize: '12px' }}>Để trống nếu chỉ áp dụng cho thiết bị cụ thể</small>
                  </label>
                </div>
              )}

              {/* Tab: Field Mapping */}
              {activeTab === 'fields' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  <div className="dp-form-section" style={{ padding: '16px', borderRadius: '8px' }}>
                    <h4 style={{ margin: '0 0 12px 0' }}>Thêm Field Mapping</h4>
                    <p style={{ fontSize: '13px', marginBottom: '12px' }}>
                      Map field từ thiết bị sang tên chuẩn. VD: <code className="dp-form-section-code" style={{ padding: '2px 6px' }}>temp</code> → <code className="dp-form-section-code" style={{ padding: '2px 6px' }}>temperature</code>
                    </p>
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                      <input
                        value={newMappingFrom}
                        onChange={(e) => setNewMappingFrom(e.target.value)}
                        placeholder="Field gốc (VD: temp)"
                        className="dp-form-input"
                        style={{ flex: 1, minWidth: '120px', padding: '8px', borderRadius: '4px' }}
                      />
                      <span className="dp-form-section-arrow" style={{ display: 'flex', alignItems: 'center' }}>→</span>
                      <input
                        value={newMappingTo}
                        onChange={(e) => setNewMappingTo(e.target.value)}
                        placeholder="Field chuẩn (VD: temperature)"
                        className="dp-form-input"
                        style={{ flex: 1, minWidth: '120px', padding: '8px', borderRadius: '4px' }}
                      />
                      <button type="button" onClick={addFieldMapping} className="dp-btn-add" style={{ padding: '8px 16px', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
                        Thêm
                      </button>
                    </div>
                  </div>

                  {Object.keys(form.field_mapping).length > 0 && (
                    <div>
                      <h4 className="dp-form-label" style={{ marginBottom: '8px' }}>Danh sách Field Mapping ({Object.keys(form.field_mapping).length})</h4>
                      <table className="dp-list-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                        <thead>
                          <tr>
                            <th style={{ padding: '8px', textAlign: 'left' }}>Field gốc</th>
                            <th style={{ padding: '8px', textAlign: 'left' }}>Field chuẩn</th>
                            <th style={{ padding: '8px', width: '60px' }}></th>
                          </tr>
                        </thead>
                        <tbody>
                          {Object.entries(form.field_mapping).map(([from, to]) => (
                            <tr key={from}>
                              <td style={{ padding: '8px' }}>
                                <code className="dp-table-code" style={{ padding: '2px 6px', borderRadius: '3px' }}>{from}</code>
                              </td>
                              <td style={{ padding: '8px' }}>
                                <code className="dp-table-code dp-table-code-blue" style={{ padding: '2px 6px', borderRadius: '3px' }}>{to}</code>
                              </td>
                              <td style={{ padding: '8px' }}>
                                <button type="button" onClick={() => removeFieldMapping(from)} className="dp-table-row-delete" style={{ border: 'none', borderRadius: '4px', padding: '4px 8px', cursor: 'pointer', fontSize: '11px' }}>
                                  Xóa
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {Object.keys(form.field_mapping).length === 0 && (
                    <div className="dp-list-empty" style={{ textAlign: 'center', padding: '30px', borderRadius: '8px' }}>
                      Chưa có field mapping nào
                    </div>
                  )}
                </div>
              )}

              {/* Tab: Unit Convert */}
              {activeTab === 'units' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  <div className="dp-form-section" style={{ padding: '16px', borderRadius: '8px' }}>
                    <h4 style={{ margin: '0 0 12px 0' }}>Thêm Unit Conversion</h4>
                    <p style={{ fontSize: '13px', marginBottom: '12px' }}>
                      Chuyển đổi giá trị: <code className="dp-form-section-code" style={{ padding: '2px 6px' }}>value = raw * factor + offset</code>
                    </p>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr auto', gap: '8px', alignItems: 'end' }}>
                      <div>
                        <label className="dp-grid-label" style={{ fontSize: '11px', display: 'block', marginBottom: '4px' }}>Field</label>
                        <input
                          value={newUnitField}
                          onChange={(e) => setNewUnitField(e.target.value)}
                          placeholder="VD: temperature"
                          className="dp-form-input"
                          style={{ width: '100%', padding: '8px', borderRadius: '4px' }}
                        />
                      </div>
                      <div>
                        <label className="dp-grid-label" style={{ fontSize: '11px', display: 'block', marginBottom: '4px' }}>Factor</label>
                        <input
                          value={newUnitFactor}
                          onChange={(e) => setNewUnitFactor(e.target.value)}
                          placeholder="1"
                          type="number"
                          step="0.1"
                          className="dp-form-input"
                          style={{ width: '100%', padding: '8px', borderRadius: '4px' }}
                        />
                      </div>
                      <div>
                        <label className="dp-grid-label" style={{ fontSize: '11px', display: 'block', marginBottom: '4px' }}>Offset</label>
                        <input
                          value={newUnitOffset}
                          onChange={(e) => setNewUnitOffset(e.target.value)}
                          placeholder="0"
                          type="number"
                          step="0.1"
                          className="dp-form-input"
                          style={{ width: '100%', padding: '8px', borderRadius: '4px' }}
                        />
                      </div>
                      <div>
                        <label className="dp-grid-label" style={{ fontSize: '11px', display: 'block', marginBottom: '4px' }}>Unit</label>
                        <input
                          value={newUnitUnit}
                          onChange={(e) => setNewUnitUnit(e.target.value)}
                          placeholder="VD: °C"
                          className="dp-form-input"
                          style={{ width: '100%', padding: '8px', borderRadius: '4px' }}
                        />
                      </div>
                      <button type="button" onClick={addUnitConvert} className="dp-btn-add" style={{ padding: '8px 16px', border: 'none', borderRadius: '4px', cursor: 'pointer', height: '38px' }}>
                        Thêm
                      </button>
                    </div>
                    <div className="dp-example-box" style={{ marginTop: '12px', padding: '8px', borderRadius: '4px', fontSize: '12px' }}>
                      <strong>Ví dụ:</strong> Raw sensor = 320, factor = 0.1, offset = -50 → Output = 320 * 0.1 - 50 = -18 °C
                    </div>
                  </div>

                  {Object.keys(form.unit_convert).length > 0 && (
                    <div>
                      <h4 className="dp-form-label" style={{ marginBottom: '8px' }}>Danh sách Unit Conversion ({Object.keys(form.unit_convert).length})</h4>
                      <table className="dp-list-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                        <thead>
                          <tr>
                            <th style={{ padding: '8px', textAlign: 'left' }}>Field</th>
                            <th style={{ padding: '8px', textAlign: 'left' }}>Factor</th>
                            <th style={{ padding: '8px', textAlign: 'left' }}>Offset</th>
                            <th style={{ padding: '8px', textAlign: 'left' }}>Unit</th>
                            <th style={{ padding: '8px', width: '60px' }}></th>
                          </tr>
                        </thead>
                        <tbody>
                          {Object.entries(form.unit_convert).map(([field, conv]) => (
                            <tr key={field}>
                              <td style={{ padding: '8px' }}>
                                <code className="dp-table-code" style={{ padding: '2px 6px', borderRadius: '3px' }}>{field}</code>
                              </td>
                              <td className="dp-table-value-green" style={{ padding: '8px' }}>{conv.factor}</td>
                              <td className="dp-table-value-amber" style={{ padding: '8px' }}>{conv.offset}</td>
                              <td className="dp-table-value-purple" style={{ padding: '8px' }}>{conv.unit || '-'}</td>
                              <td style={{ padding: '8px' }}>
                                <button type="button" onClick={() => removeUnitConvert(field)} className="dp-table-row-delete" style={{ border: 'none', borderRadius: '4px', padding: '4px 8px', cursor: 'pointer', fontSize: '11px' }}>
                                  Xóa
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {Object.keys(form.unit_convert).length === 0 && (
                    <div className="dp-list-empty" style={{ textAlign: 'center', padding: '30px', borderRadius: '8px' }}>
                      Chưa có unit conversion nào
                    </div>
                  )}
                </div>
              )}

              {/* Tab: Advanced */}
              {activeTab === 'advanced' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  <label style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <span className="dp-form-label">Timestamp Format</span>
                    <select
                      value={form.timestamp_format}
                      onChange={(e) => setForm({ ...form, timestamp_format: e.target.value })}
                      className="dp-form-select"
                      style={{ padding: '10px', borderRadius: '6px' }}
                    >
                      <option value="unix">Unix timestamp (giây)</option>
                      <option value="unix_ms">Unix timestamp (milliseconds)</option>
                      <option value="iso8601">ISO 8601</option>
                    </select>
                    <small className="dp-form-help" style={{ fontSize: '12px' }}>Định dạng timestamp từ thiết bị</small>
                  </label>

                  {/* JSON Preview */}
                  <div className="dp-json-preview" style={{ padding: '16px', borderRadius: '8px' }}>
                    <h4 style={{ margin: '0 0 8px 0' }}>Config JSON Preview</h4>
                    <pre style={{ margin: 0, fontSize: '12px', overflow: 'auto', maxHeight: '200px' }}>
                      {JSON.stringify(buildConfig(), null, 2)}
                    </pre>
                  </div>
                </div>
              )}

              {/* Form Actions */}
              <div className="form-actions" style={{ marginTop: '24px', display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                <button type="button" onClick={() => setFormVisible(false)} className="dp-form-cancel" style={{ padding: '10px 20px', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>
                  Hủy
                </button>
                <button type="submit" className="dp-form-submit" style={{ padding: '10px 24px', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: '600' }}>
                  {editId ? 'Lưu thay đổi' : 'Tạo Profile'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
