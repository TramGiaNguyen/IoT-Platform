import React, { useEffect, useState } from 'react';
import {
  fetchDeviceProfiles,
  createDeviceProfile,
  updateDeviceProfile,
  deleteDeviceProfile,
  fetchDevices,
} from '../services';
import { useCrudVersion, useRealtimePolling } from '../context/RealtimeProvider';

export default function DeviceProfilesManagement({ token, onBack, workspaceContext = 'ca_nhan', userInfo = null }) {
  const [profiles, setProfiles] = useState([]);
  const [devices, setDevices] = useState([]);
  // Realtime: tu refetch khi co CRUD profile tu tab khac
  const profilesVersion = useCrudVersion('profile');
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

  // Realtime: refetch khi profile CRUD event den, hoac WS disconnected polling 30s
  useRealtimePolling(profilesVersion, loadProfiles, [token]);

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
    <div className="ai-page-container">
      <div className="ai-page-header">
        <div className="ai-page-header-left">
          <button type="button" className="back-btn" onClick={onBack}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>
            Quay lại
          </button>
          <div className="ai-page-header-title">
            <div className="ai-page-header-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="2" y="3" width="20" height="14" rx="2" ry="2"/>
                <line x1="8" y1="21" x2="16" y2="21"/>
                <line x1="12" y1="17" x2="12" y2="21"/>
              </svg>
            </div>
            <div>
              <h1>Quản lý Profile</h1>
              <p className="ai-page-subtitle-text">Map field, convert unit cho thiet bi</p>
            </div>
          </div>
        </div>
        <div className="rules-actions">
          <button onClick={() => { setEditId(null); resetForm(); setFormVisible(true); }} className="primary-btn">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            Tạo Profile
          </button>
        </div>
      </div>

      <div className="ai-page-content">
        <div className="ai-filter-bar">
          <input
            type="text"
            placeholder="Tìm kiếm profile..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
          <div className="tab-buttons">
            {[
              { key: 'all', label: 'Tất cả' },
              { key: 'device', label: 'Theo thiet bi' },
              { key: 'type', label: 'Theo loai' },
              { key: 'default', label: 'Mặc định' },
            ].map(f => (
              <button
                key={f.key}
                onClick={() => setFilterType(f.key)}
                className={filterType === f.key ? 'active' : ''}
              >
                {f.label} ({typeCounts[f.key]})
              </button>
            ))}
          </div>
        </div>

      {loading ? (
        <div className="ai-empty-state" style={{ padding: '40px' }}>Đang tải...</div>
      ) : filteredProfiles.length === 0 ? (
        <div className="ai-empty-state" style={{ padding: '40px' }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="2" y="3" width="20" height="14" rx="2" ry="2"/>
            <line x1="8" y1="21" x2="16" y2="21"/>
            <line x1="12" y1="17" x2="12" y2="21"/>
          </svg>
          <p>{profiles.length === 0 ? 'Chưa có profile nào. Tạo profile để map field, convert unit.' : 'Không tìm thấy profile nào.'}</p>
        </div>
      ) : (
        <div className="dp-profiles-grid">
          {filteredProfiles.map((p) => {
            const cfg = parseConfig(p.config);
            const fieldCount = Object.keys(cfg.field_mapping || {}).length;
            const unitCount = Object.keys(cfg.unit_convert || {}).length;
            return (
              <div key={p.id} className="dp-profile-card">
                <div className="dp-profile-header">
                  <div>
                    <h4 className="dp-profile-title">{p.ten_profile || `Profile #${p.id}`}</h4>
                    <div className="dp-profile-chips">
                      {p.device_id && (
                        <span className="dp-chip">📱 {p.device_id}</span>
                      )}
                      {p.device_type && (
                        <span className="dp-chip">🏷️ {p.device_type}</span>
                      )}
                      {!p.device_id && !p.device_type && (
                        <span className="dp-chip">⭐ Mặc định</span>
                      )}
                    </div>
                  </div>
                  <div className="dp-profile-actions">
                    <button onClick={() => handleEdit(p)} className="dp-btn-edit">Sửa</button>
                    <button onClick={() => handleDelete(p.id)} className="dp-btn-delete">Xóa</button>
                  </div>
                </div>

                <div className="dp-profile-stats">
                  <div className="dp-stat-box">
                    <div className="dp-stat-value" style={{ color: '#0ea5e9' }}>{fieldCount}</div>
                    <div className="dp-stat-label">Fields mapped</div>
                  </div>
                  <div className="dp-stat-box">
                    <div className="dp-stat-value" style={{ color: '#22c55e' }}>{unitCount}</div>
                    <div className="dp-stat-label">Units converted</div>
                  </div>
                </div>

                <div style={{ marginTop: '12px', fontSize: '0.8rem', color: 'var(--rules-text-muted)' }}>
                  Timestamp: <code style={{ padding: '2px 6px', borderRadius: '4px', background: 'var(--rules-chip-bg)' }}>{cfg.timestamp_format || 'unix'}</code>
                </div>

                {fieldCount > 0 && (
                  <div style={{ marginTop: '10px', padding: '10px', background: 'var(--rules-chip-bg)', borderRadius: '8px', fontSize: '0.75rem' }}>
                    <div style={{ marginBottom: '6px', color: 'var(--rules-text-muted)' }}>Mappings:</div>
                    {Object.entries(cfg.field_mapping || {}).slice(0, 3).map(([k, v]) => (
                      <span key={k} style={{ marginRight: '10px', color: 'var(--rules-text-secondary)' }}>
                        {k} → <span style={{ color: 'var(--rules-text)' }}>{v}</span>
                      </span>
                    ))}
                    {fieldCount > 3 && <span style={{ color: 'var(--rules-text-muted)' }}>+{fieldCount - 3} more</span>}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
      </div>

      {/* Modal Form */}
      {formVisible && (
        <div className="rules-modal-backdrop" onClick={(e) => e.target === e.currentTarget && setFormVisible(false)}>
          <div className="rules-modal" style={{ maxWidth: '700px', maxHeight: '90vh', overflow: 'auto' }}>
            <div className="rules-modal-header">
              <h3>{editId ? 'Sửa Profile' : 'Tạo Profile Mới'}</h3>
              <button className="rules-modal-close" onClick={() => setFormVisible(false)}>×</button>
            </div>
            
            <form onSubmit={handleSave} className="rules-form">
              <div className="modal-tabs">
                {[
                  { key: 'basic', label: 'Cơ bản' },
                  { key: 'fields', label: 'Field Mapping' },
                  { key: 'units', label: 'Unit Convert' },
                  { key: 'advanced', label: 'Nang cao' },
                ].map(tab => (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => setActiveTab(tab.key)}
                    className={activeTab === tab.key ? 'active' : ''}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              {activeTab === 'basic' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  <label>
                    Tên profile <span style={{ color: '#f87171' }}>*</span>
                    <input
                      value={form.ten_profile}
                      onChange={(e) => setForm({ ...form, ten_profile: e.target.value })}
                      placeholder="VD: Cam bien nhiet do"
                      style={{ padding: '12px', borderRadius: '10px' }}
                    />
                  </label>

                  <label>
                    Ap dung cho thiet bi cu the
                    <select
                      value={form.device_id}
                      onChange={(e) => setForm({ ...form, device_id: e.target.value })}
                      style={{ padding: '12px', borderRadius: '10px' }}
                    >
                      <option value="">-- Tất cả thiết bị --</option>
                      {devices.map((d) => (
                        <option key={d.ma_thiet_bi} value={d.ma_thiet_bi}>{d.ten_thiet_bi || d.ma_thiet_bi}</option>
                      ))}
                    </select>
                    <small className="help-text">De trong neu muon ap dung cho tat ca hoac theo loai thiet bi</small>
                  </label>

                  <label>
                    Ap dung cho loai thiet bi
                    <input
                      value={form.device_type}
                      onChange={(e) => setForm({ ...form, device_type: e.target.value })}
                      placeholder="VD: temperature_sensor, power_meter"
                      style={{ padding: '12px', borderRadius: '10px' }}
                    />
                    <small className="help-text">De trong neu chi ap dung cho thiet bi cu the</small>
                  </label>
                </div>
              )}

              {activeTab === 'fields' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  <div className="form-section">
                    <h4>Thêm Field Mapping</h4>
                    <p>Map field tu thiet bi sang ten chuan. VD: temp → temperature</p>
                    <div className="mapping-row">
                      <input
                        value={newMappingFrom}
                        onChange={(e) => setNewMappingFrom(e.target.value)}
                        placeholder="Field goc"
                        style={{ padding: '10px', borderRadius: '8px' }}
                      />
                      <span className="mapping-arrow">→</span>
                      <input
                        value={newMappingTo}
                        onChange={(e) => setNewMappingTo(e.target.value)}
                        placeholder="Field chuan"
                        style={{ padding: '10px', borderRadius: '8px' }}
                      />
                      <button type="button" onClick={addFieldMapping} className="primary-btn" style={{ padding: '10px 16px' }}>
                        Thêm
                      </button>
                    </div>
                  </div>

                  {Object.keys(form.field_mapping).length > 0 && (
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr>
                          <th style={{ padding: '10px', textAlign: 'left', color: 'var(--rules-text-secondary)' }}>Field goc</th>
                          <th style={{ padding: '10px', textAlign: 'left', color: 'var(--rules-text-secondary)' }}>Field chuan</th>
                          <th style={{ padding: '10px', width: '60px' }}></th>
                        </tr>
                      </thead>
                      <tbody>
                        {Object.entries(form.field_mapping).map(([from, to]) => (
                          <tr key={from}>
                            <td style={{ padding: '10px' }}>
                              <code style={{ padding: '4px 8px', borderRadius: '4px', background: 'var(--rules-chip-bg)' }}>{from}</code>
                            </td>
                            <td style={{ padding: '10px' }}>
                              <code style={{ padding: '4px 8px', borderRadius: '4px', background: 'rgba(14, 165, 233, 0.1)', color: '#0ea5e9' }}>{to}</code>
                            </td>
                            <td style={{ padding: '10px' }}>
                              <button type="button" onClick={() => removeFieldMapping(from)} className="dp-btn-delete" style={{ padding: '6px 12px' }}>
                                Xóa
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}

                  {Object.keys(form.field_mapping).length === 0 && (
                    <div className="ai-empty-state" style={{ padding: '40px' }}>
                      <p>Chua co field mapping nao</p>
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'units' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  <div className="form-section">
                    <h4>Thêm Unit Conversion</h4>
                    <p>Chuyen doi gia tri: value = raw * factor + offset</p>
                    <div className="unit-grid">
                      <label><span>Field</span>
                        <input
                          value={newUnitField}
                          onChange={(e) => setNewUnitField(e.target.value)}
                          placeholder="VD: temperature"
                          style={{ padding: '10px', borderRadius: '8px' }}
                        />
                      </label>
                      <label><span>Factor</span>
                        <input
                          value={newUnitFactor}
                          onChange={(e) => setNewUnitFactor(e.target.value)}
                          placeholder="1"
                          type="number"
                          step="0.1"
                          style={{ padding: '10px', borderRadius: '8px' }}
                        />
                      </label>
                      <label><span>Offset</span>
                        <input
                          value={newUnitOffset}
                          onChange={(e) => setNewUnitOffset(e.target.value)}
                          placeholder="0"
                          type="number"
                          step="0.1"
                          style={{ padding: '10px', borderRadius: '8px' }}
                        />
                      </label>
                      <label><span>Unit</span>
                        <input
                          value={newUnitUnit}
                          onChange={(e) => setNewUnitUnit(e.target.value)}
                          placeholder="VD: °C"
                          style={{ padding: '10px', borderRadius: '8px' }}
                        />
                      </label>
                      <button type="button" onClick={addUnitConvert} className="primary-btn">
                        Thêm
                      </button>
                    </div>
                    <div className="help-text" style={{ marginTop: '12px' }}>
                      <strong>Vi du:</strong> Raw sensor = 320, factor = 0.1, offset = -50 → Output = 320 * 0.1 - 50 = -18 °C
                    </div>
                  </div>

                  {Object.keys(form.unit_convert).length > 0 && (
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr>
                          <th style={{ padding: '10px', textAlign: 'left', color: 'var(--rules-text-secondary)' }}>Field</th>
                          <th style={{ padding: '10px', textAlign: 'left', color: 'var(--rules-text-secondary)' }}>Factor</th>
                          <th style={{ padding: '10px', textAlign: 'left', color: 'var(--rules-text-secondary)' }}>Offset</th>
                          <th style={{ padding: '10px', textAlign: 'left', color: 'var(--rules-text-secondary)' }}>Unit</th>
                          <th style={{ padding: '10px', width: '60px' }}></th>
                        </tr>
                      </thead>
                      <tbody>
                        {Object.entries(form.unit_convert).map(([field, conv]) => (
                          <tr key={field}>
                            <td style={{ padding: '10px' }}>
                              <code style={{ padding: '4px 8px', borderRadius: '4px', background: 'var(--rules-chip-bg)' }}>{field}</code>
                            </td>
                            <td style={{ padding: '10px', color: '#22c55e' }}>{conv.factor}</td>
                            <td style={{ padding: '10px', color: '#f59e0b' }}>{conv.offset}</td>
                            <td style={{ padding: '10px', color: '#a78bfa' }}>{conv.unit || '-'}</td>
                            <td style={{ padding: '10px' }}>
                              <button type="button" onClick={() => removeUnitConvert(field)} className="dp-btn-delete" style={{ padding: '6px 12px' }}>
                                Xóa
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}

                  {Object.keys(form.unit_convert).length === 0 && (
                    <div className="ai-empty-state" style={{ padding: '40px' }}>
                      <p>Chua co unit conversion nao</p>
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'advanced' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  <label>
                    Timestamp Format
                    <select
                      value={form.timestamp_format}
                      onChange={(e) => setForm({ ...form, timestamp_format: e.target.value })}
                      style={{ padding: '12px', borderRadius: '10px' }}
                    >
                      <option value="unix">Unix timestamp (giay)</option>
                      <option value="unix_ms">Unix timestamp (milliseconds)</option>
                      <option value="iso8601">ISO 8601</option>
                    </select>
                    <small className="help-text">Dinh dang timestamp tu thiet bi</small>
                  </label>

                  <div className="json-preview">
                    <h4 style={{ margin: '0 0 12px 0', color: 'var(--rules-text)' }}>Config JSON Preview</h4>
                    <pre>{JSON.stringify(buildConfig(), null, 2)}</pre>
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
