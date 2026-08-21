import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { API_BASE } from '../config/api';
import { useRealtime } from '../context/RealtimeProvider';
import {
  fetchDeviceComponents,
  createDeviceComponent,
  updateDeviceComponent,
  deleteDeviceComponent,
  fetchDeviceAllFields,
  autoDetectComponents,
  assignFieldsToComponent,
  updateFieldUnit,
  deleteField,
  fetchComponentHealth,
  fetchComponentAnomalies,
  fetchComponentTrend,
} from '../services';

const COMPONENT_TYPES = [
  { value: 'temperature', label: 'Nhiệt độ', icon: '🌡️', hardwareModels: ['DHT11', 'DHT22', 'DS18B20', 'BMP280'] },
  { value: 'humidity', label: 'Độ ẩm', icon: '💧', hardwareModels: ['DHT11', 'DHT22'] },
  { value: 'soil_moisture', label: 'Độ ẩm đất', icon: '🌱', hardwareModels: ['Capacitive_Soil', 'Resistive_Soil'] },
  { value: 'light', label: 'Ánh sáng', icon: '☀️', hardwareModels: ['BH1750', 'LDR', 'TEMT6000'] },
  { value: 'pressure', label: 'Áp suất', icon: '📊', hardwareModels: ['BMP280', 'BMP180'] },
  { value: 'co2', label: 'CO2', icon: '🌬️', hardwareModels: ['MH_Z19', 'SGP30'] },
  { value: 'gas', label: 'Khí', icon: '💨', hardwareModels: ['MQ135', 'MQ2', 'MQ7'] },
  { value: 'motion', label: 'Chuyển động', icon: '🚶', hardwareModels: ['PIR', 'HC_SR501'] },
  { value: 'relay', label: 'Relay', icon: '⚡', hardwareModels: ['RELAY_MODULE', 'Single_Channel'] },
  { value: 'unknown', label: 'Không xác định', icon: '❓', hardwareModels: ['Unknown'] },
];

const UNIT_DATA = [
  { id: 'None', symbol: '—', name: 'None', description: 'Không có đơn vị' },
  { id: 'KilometerPerHour', symbol: 'km/h', name: 'Kilometer Per Hour', description: 'Kilômét trên giờ - Tốc độ' },
  { id: 'MillimeterPerHour', symbol: 'mm/h', name: 'Millimeter Per Hour', description: 'Milimét trên giờ - Cường độ mưa' },
  { id: 'InchesPerHour', symbol: 'in/h', name: 'Inches Per Hour', description: 'Inch trên giờ - Cường độ mưa (imperial)' },
  { id: 'CubicMetresPerHour', symbol: 'm³/h', name: 'Cubic Metres Per Hour', description: 'Mét khối trên giờ - Lưu lượng thể tích' },
  { id: 'MilePerHour', symbol: 'mph', name: 'Mile Per Hour', description: 'Dặm trên giờ - Tốc độ (imperial)' },
  { id: 'MilePerHour2', symbol: 'mph²', name: 'Mile Per Hour Squared', description: 'Dặm trên giờ bình phương - Gia tốc' },
  { id: 'GramPerSquareMeter', symbol: 'g/m²', name: 'Gram Per Square Meter', description: 'Gam trên mét vuông - Lượng mưa' },
  { id: 'MilliLitterPerSquareMeter', symbol: 'mL/m²', name: 'Milliliter Per Square Meter', description: 'Mililit trên mét vuông - Lượng mưa' },
  { id: 'LitterPerSquareMeter', symbol: 'L/m²', name: 'Liter Per Square Meter', description: 'Lít trên mét vuông - Lượng mưa' },
  { id: 'PoundPerSquareInch', symbol: 'psi', name: 'Pound Per Square Inch', description: 'Pound trên inch vuông - Áp suất' },
  { id: 'PoundPerSquareInch2', symbol: 'psi²', name: 'Pound Per Sq Inch (squared)', description: 'Psi bình phương - Áp suất động lực học' },
  { id: 'PoundPerCubicYard', symbol: 'lb/yd³', name: 'Pound Per Cubic Yard', description: 'Pound trên yard khối - Mật độ' },
  { id: 'OuncePerCubicYard', symbol: 'oz/yd³', name: 'Ounce Per Cubic Yard', description: 'Ounce trên yard khối - Mật độ' },
  { id: 'PoundPerCubicFoot', symbol: 'lb/ft³', name: 'Pound Per Cubic Foot', description: 'Pound trên feet khối - Mật độ' },
  { id: 'VolumeFlow', symbol: 'm³/s', name: 'Volume Flow Rate', description: 'Mét khối trên giây - Lưu lượng' },
  { id: 'CubicCentimetersPerMinute', symbol: 'cm³/min', name: 'Cubic Centimeters Per Minute', description: 'Centimet khối trên phút - Lưu lượng nhỏ' },
  { id: 'SignalStrength', symbol: 'dBm', name: 'Signal Strength', description: 'Decibel-milliwatt - Cường độ tín hiệu' },
  { id: 'DegreeDays', symbol: 'DD', name: 'Degree Days', description: 'Ngày độ - Tích lũy nhiệt' },
  { id: 'Millimeter', symbol: 'mm', name: 'Millimeter', description: 'Milimét - Chiều dài' },
  { id: 'Centimeter', symbol: 'cm', name: 'Centimeter', description: 'Centimét - Chiều dài' },
  { id: 'Meter', symbol: 'm', name: 'Meter', description: 'Mét - Chiều dài' },
  { id: 'Kilometer', symbol: 'km', name: 'Kilometer', description: 'Kilômét - Chiều dài' },
  { id: 'KiloBytes', symbol: 'KB', name: 'Kilobytes', description: 'Kilobyte - Dung lượng' },
  { id: 'MegaBytes', symbol: 'MB', name: 'Megabytes', description: 'Megabyte - Dung lượng' },
  { id: 'GigaBytes', symbol: 'GB', name: 'Gigabytes', description: 'Gigabyte - Dung lượng' },
  { id: 'Feet', symbol: 'ft', name: 'Feet', description: 'Feet - Chiều dài (imperial)' },
  { id: 'SquareFeet', symbol: 'ft²', name: 'Square Feet', description: 'Feet vuông - Diện tích' },
  { id: 'Inch', symbol: 'in', name: 'Inch', description: 'Inch - Chiều dài (imperial)' },
  { id: 'Foot', symbol: 'ft', name: 'Foot', description: 'Foot - Chiều dài (imperial)' },
  { id: 'Yard', symbol: 'yd', name: 'Yard', description: 'Yard - Chiều dài (imperial)' },
  { id: 'Mile', symbol: 'mi', name: 'Mile', description: 'Dặm - Chiều dài (imperial)' },
  { id: 'Milligram', symbol: 'mg', name: 'Milligram', description: 'Miligam - Khối lượng' },
  { id: 'Gram', symbol: 'g', name: 'Gram', description: 'Gam - Khối lượng' },
  { id: 'Kilogram', symbol: 'kg', name: 'Kilogram', description: 'Kilôgam - Khối lượng' },
  { id: 'Ton', symbol: 't', name: 'Ton', description: 'Tấn - Khối lượng lớn' },
  { id: 'Liter', symbol: 'L', name: 'Liter', description: 'Lít - Thể tích' },
  { id: 'Milliliter', symbol: 'mL', name: 'Milliliter', description: 'Mililit - Thể tích nhỏ' },
  { id: 'Ounce', symbol: 'oz', name: 'Ounce', description: 'Ounce - Thể tích/khối lượng' },
  { id: 'Pint', symbol: 'pt', name: 'Pint', description: 'Pint - Thể tích (imperial)' },
  { id: 'Gallon', symbol: 'gal', name: 'Gallon', description: 'Gallon - Thể tích (imperial)' },
  { id: 'Pound', symbol: 'lb', name: 'Pound', description: 'Pound - Khối lượng (imperial)' },
  { id: 'Stone', symbol: 'st', name: 'Stone', description: 'Stone - Khối lượng (imperial)' },
  { id: 'Quarter', symbol: 'qr', name: 'Quarter', description: 'Quarter - Khối lượng (imperial)' },
  { id: 'Hundredweight', symbol: 'cwt', name: 'Hundredweight', description: 'Hundredweight - Khối lượng' },
  { id: 'Celsius', symbol: '°C', name: 'Celsius', description: 'Độ Celsius - Nhiệt độ' },
  { id: 'Fahrenheit', symbol: '°F', name: 'Fahrenheit', description: 'Độ Fahrenheit - Nhiệt độ (imperial)' },
  { id: 'Kelvin', symbol: 'K', name: 'Kelvin', description: 'Kelvin - Nhiệt độ tuyệt đối' },
  { id: 'Percentage', symbol: '%', name: 'Percentage', description: 'Phần trăm' },
  { id: 'Degrees', symbol: '°', name: 'Degrees', description: 'Độ - Góc hoặc hướng' },
  { id: 'RPM', symbol: 'rpm', name: 'Revolutions Per Minute', description: 'Vòng trên phút - Tốc độ quay' },
  { id: 'Step', symbol: 'step', name: 'Step', description: 'Bước - Đếm sự kiện' },
  { id: 'Year', symbol: 'yr', name: 'Year', description: 'Năm - Thời gian' },
  { id: 'Month', symbol: 'mo', name: 'Month', description: 'Tháng - Thời gian' },
  { id: 'Week', symbol: 'wk', name: 'Week', description: 'Tuần - Thời gian' },
  { id: 'Day', symbol: 'd', name: 'Day', description: 'Ngày - Thời gian' },
  { id: 'Hour', symbol: 'h', name: 'Hour', description: 'Giờ - Thời gian' },
  { id: 'Minute', symbol: 'min', name: 'Minute', description: 'Phút - Thời gian' },
  { id: 'Second', symbol: 's', name: 'Second', description: 'Giây - Thời gian' },
  { id: 'Volt', symbol: 'V', name: 'Volt', description: 'Vôn - Điện áp' },
  { id: 'Ampere', symbol: 'A', name: 'Ampere', description: 'Ampe - Cường độ dòng điện' },
  { id: 'MilliAmpere', symbol: 'mA', name: 'Milliampere', description: 'Miliampe - Cường độ dòng điện nhỏ' },
  { id: 'MicroAmpere', symbol: 'µA', name: 'Microampere', description: 'Microampe - Cường độ dòng điện rất nhỏ' },
  { id: 'Ohm', symbol: 'Ω', name: 'Ohm', description: 'Ohm - Điện trở' },
  { id: 'Hertz', symbol: 'Hz', name: 'Hertz', description: 'Hertz - Tần số' },
  { id: 'Watts', symbol: 'W', name: 'Watts', description: 'Oát - Công suất' },
  { id: 'Farad', symbol: 'F', name: 'Farad', description: 'Farad - Điện dung' },
  { id: 'Siemen', symbol: 'S', name: 'Siemen', description: 'Siemens - Độ dẫn điện' },
  { id: 'Henry', symbol: 'H', name: 'Henry', description: 'Henry - Độ tự cảm' },
  { id: 'MicrogramPerCubicMeter', symbol: 'µg/m³', name: 'Microgram Per Cubic Meter', description: 'Microgam trên mét khối - Nồng độ' },
  { id: 'PartsPerMillion', symbol: 'ppm', name: 'Parts Per Million', description: 'Phần triệu - Nồng độ' },
  { id: 'PartsPerBillion', symbol: 'ppb', name: 'Parts Per Billion', description: 'Phần tỷ - Nồng độ' },
  { id: 'KiloWatts', symbol: 'kW', name: 'Kilowatts', description: 'Kilôwatt - Công suất lớn' },
  { id: 'HectoPascal', symbol: 'hPa', name: 'Hectopascal', description: 'Hectopascal - Áp suất khí quyển' },
  { id: 'Pascal', symbol: 'Pa', name: 'Pascal', description: 'Pascal - Áp suất' },
  { id: 'Lux', symbol: 'lx', name: 'Lux', description: 'Lux - Độ rọi ánh sáng' },
  { id: 'Pressure', symbol: 'bar', name: 'Pressure', description: 'Bar - Áp suất' },
  { id: 'PressureInBars', symbol: 'bar', name: 'Pressure In Bars', description: 'Bar - Áp suất (tương đương)' },
  { id: 'AirQualityIndex', symbol: 'AQI', name: 'Air Quality Index', description: 'Chỉ số chất lượng không khí' },
  { id: 'KiloWattHour', symbol: 'kWh', name: 'Kilowatt Hour', description: 'Kilôwatt giờ - Điện năng tiêu thụ' },
  { id: 'MilliSecond', symbol: 'ms', name: 'Millisecond', description: 'Miligiây - Thời gian ngắn' },
  { id: 'MilliSec', symbol: 'ms', name: 'MilliSec', description: 'Miligiây - Thời gian ngắn (viết tắt)' },
  { id: 'MeterPerSecond', symbol: 'm/s', name: 'Meter Per Second', description: 'Mét trên giây - Vận tốc' },
  { id: 'MilliGramPerCubicMeter', symbol: 'mg/m³', name: 'Milligram Per Cubic Meter', description: 'Miligam trên mét khối - Nồng độ' },
  { id: 'KiloPascal', symbol: 'kPa', name: 'Kilopascal', description: 'Kilopascal - Áp suất' },
  { id: 'CubicMeter', symbol: 'm³', name: 'Cubic Meter', description: 'Mét khối - Thể tích' },
  { id: 'CubicYard', symbol: 'yd³', name: 'Cubic Yard', description: 'Yard khối - Thể tích (imperial)' },
  { id: 'CubicFeetPerMinute', symbol: 'CFM', name: 'Cubic Feet Per Minute', description: 'Feet khối trên phút - Lưu lượng gió' },
  { id: 'SquareMeter', symbol: 'm²', name: 'Square Meter', description: 'Mét vuông - Diện tích' },
  { id: 'LitersPerSecond', symbol: 'L/s', name: 'Liters Per Second', description: 'Lít trên giây - Lưu lượng chất lỏng' },
  { id: 'WattHour', symbol: 'Wh', name: 'Watt Hour', description: 'Watt giờ - Điện năng' },
  { id: 'MilliWatt', symbol: 'mW', name: 'Milliwatt', description: 'Miliwatt - Công suất nhỏ' },
  { id: 'pH', symbol: 'pH', name: 'pH Value', description: 'Độ pH - Độ axit/kiềm' },
  { id: 'AmpereHour', symbol: 'Ah', name: 'Ampere Hour', description: 'Ampe giờ - Dung lượng pin' },
  { id: 'MilliAmpereHour', symbol: 'mAh', name: 'Milliampere Hour', description: 'Miliampe giờ - Dung lượng pin nhỏ' },
];

const HARDWARE_MODELS = [
  'DHT11', 'DHT22', 'DS18B20', 'BMP280', 'BMP180',
  'Capacitive_Soil', 'Resistive_Soil',
  'BH1750', 'LDR', 'TEMT6000',
  'MH_Z19', 'SGP30',
  'MQ135', 'MQ2', 'MQ7',
  'PIR', 'HC_SR501',
  'RELAY_MODULE', 'Single_Channel',
  'Unknown',
];

const CONNECTION_TYPES = [
  { value: 'I2C', label: 'I2C' },
  { value: 'SPI', label: 'SPI' },
  { value: 'OneWire', label: 'OneWire' },
  { value: 'GPIO', label: 'GPIO' },
  { value: 'Analog', label: 'Analog' },
  { value: 'UART', label: 'UART' },
];

const ComponentManager = ({ deviceId, token, onClose }) => {
  const [components, setComponents] = useState([]);
  const [allFields, setAllFields] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [detecting, setDetecting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);

  // Get realtime data directly from WebSocket
  // Try multiple ID formats to match Kafka events (which use ma_thiet_bi string)
  const { latestByDevice } = useRealtime();
  const deviceLatestData = latestByDevice[deviceId]
    || latestByDevice[String(deviceId)]
    || latestByDevice[Number(deviceId)]
    || {};

  // Modal state
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingComponent, setEditingComponent] = useState(null);
  const [componentForm, setComponentForm] = useState({
    component_id: '',
    component_type: 'temperature',
    field_name: '',
    hardware_model: '',
    connection_type: 'I2C',
  });

  // Field assignment state
  const [selectedFields, setSelectedFields] = useState({});
  const [fieldAssignments, setFieldAssignments] = useState({}); // componentId -> fieldNames[]

  // Field unit editing state
  const [editingField, setEditingField] = useState(null);
  const [editUnit, setEditUnit] = useState('');
  const [editDescription, setEditDescription] = useState('');

  // Health data state
  const [componentHealth, setComponentHealth] = useState({}); // componentId -> health data
  const [componentAnomalies, setComponentAnomalies] = useState({}); // componentId -> anomalies
  const [componentTrends, setComponentTrends] = useState({}); // componentId -> trend data
  const [loadingHealth, setLoadingHealth] = useState(false);
  const [showHealthPanel, setShowHealthPanel] = useState(false); // Toggle health panel

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [componentsRes, fieldsRes] = await Promise.all([
        fetchDeviceComponents(deviceId, token),
        fetchDeviceAllFields(deviceId, token),
      ]);
      setComponents(componentsRes.components || []);
      setAllFields(fieldsRes.fields || []);

      // Initialize field assignments from existing components
      const assignments = {};
      (componentsRes.components || []).forEach(comp => {
        if (comp.field_name) {
          const fields = comp.field_name.split(',').map(f => f.trim());
          fields.forEach(f => {
            assignments[f] = comp.component_id;
          });
        }
      });
      setFieldAssignments(assignments);
    } catch (err) {
      console.error('Error loading data:', err);
      setError(err.response?.data?.detail || err.message);
    } finally {
      setLoading(false);
    }
  }, [deviceId, token]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Load health data for all components
  const loadHealthData = useCallback(async () => {
    if (components.length === 0) return;
    setLoadingHealth(true);
    try {
      const healthPromises = components.map(async (comp) => {
        try {
          const [health, anomalies, trend] = await Promise.all([
            fetchComponentHealth(deviceId, comp.component_id, token),
            fetchComponentAnomalies(deviceId, comp.component_id, token, 24),
            fetchComponentTrend(deviceId, comp.component_id, token, 24),
          ]);
          return {
            componentId: comp.component_id,
            health: health || {},
            anomalies: anomalies || { anomalies: [], summary: { total: 0 } },
            trend: trend || { data: [], statistics: {} },
          };
        } catch (e) {
          console.error(`Error loading health for ${comp.component_id}:`, e);
          return null;
        }
      });

      const results = await Promise.all(healthPromises);
      const newHealth = {};
      const newAnomalies = {};
      const newTrends = {};

      results.forEach(r => {
        if (r) {
          newHealth[r.componentId] = r.health;
          newAnomalies[r.componentId] = r.anomalies;
          newTrends[r.componentId] = r.trend;
        }
      });

      setComponentHealth(prev => ({ ...prev, ...newHealth }));
      setComponentAnomalies(prev => ({ ...prev, ...newAnomalies }));
      setComponentTrends(prev => ({ ...prev, ...newTrends }));
    } finally {
      setLoadingHealth(false);
    }
  }, [components, deviceId, token]);

  useEffect(() => {
    if (components.length > 0) {
      loadHealthData();
    }
  }, [components.length, loadHealthData]);

  const getComponentTypeInfo = (type) => {
    return COMPONENT_TYPES.find(ct => ct.value === type) || COMPONENT_TYPES[COMPONENT_TYPES.length - 1];
  };

  const getUnitSymbol = (unitId) => {
    if (!unitId) return '';
    const unit = UNIT_DATA.find(u => u.id === unitId);
    return unit?.symbol || unitId;
  };

  const getFieldValue = (fieldName) => {
    if (!deviceLatestData || !fieldName) return null;
    const entry = deviceLatestData[fieldName]
      || deviceLatestData[fieldName.replace(/^\$/, '')]
      || deviceLatestData[fieldName.replace(/^\$\.?/, '')]
      || null;
    return entry?.value ?? null;
  };

  // Health helper functions
  const getHealthScore = (componentId) => {
    const health = componentHealth[componentId];
    return health?.health_score ?? (components.find(c => c.component_id === componentId)?.health_score != null
      ? Math.round(components.find(c => c.component_id === componentId).health_score * 100)
      : null);
  };

  const getHealthStatus = (componentId) => {
    const health = componentHealth[componentId];
    if (health?.health_status) return health.health_status;
    const score = getHealthScore(componentId);
    if (score === null) return 'unknown';
    if (score >= 80) return 'healthy';
    if (score >= 50) return 'degraded';
    return 'failed';
  };

  const getHealthStatusColor = (status) => {
    switch (status) {
      case 'healthy': return '#22c55e';
      case 'degraded': return '#eab308';
      case 'failed': return '#ef4444';
      default: return '#94a3b8';
    }
  };

  const getHealthStatusLabel = (status) => {
    switch (status) {
      case 'healthy': return 'Tot';
      case 'degraded': return 'Trung binh';
      case 'failed': return 'Loi';
      default: return 'Chua xac dinh';
    }
  };

  const getAlertsCount = (componentId) => {
    const anomalies = componentAnomalies[componentId];
    const health = componentHealth[componentId];
    return (anomalies?.summary?.total || 0) + (health?.alerts_count || 0);
  };

  const getIssuesCount = (componentId) => {
    const health = componentHealth[componentId];
    return health?.issues_count || 0;
  };

  const handleAutoDetect = async () => {
    setDetecting(true);
    setMessage(null);
    try {
      const res = await autoDetectComponents(deviceId, token);
      setMessage({
        type: 'success',
        text: `Đã tạo ${res.components_created || 0} linh kiện, cập nhật ${res.components_updated || 0} linh kiện`,
      });
      await loadData();
    } catch (err) {
      setMessage({ type: 'error', text: err.response?.data?.detail || 'Auto-detect thất bại' });
    } finally {
      setDetecting(false);
    }
  };

  const handleOpenAddModal = () => {
    setComponentForm({
      component_id: '',
      component_type: 'temperature',
      field_name: '',
      hardware_model: '',
      connection_type: 'I2C',
    });
    setEditingComponent(null);
    setShowAddModal(true);
  };

  const handleOpenEditModal = (comp) => {
    setComponentForm({
      component_id: comp.component_id,
      component_type: comp.component_type,
      field_name: comp.field_name || '',
      hardware_model: comp.hardware_model || '',
      connection_type: comp.connection_type || 'I2C',
    });
    setEditingComponent(comp);
    setShowAddModal(true);
  };

  const handleSaveComponent = async () => {
    if (!componentForm.component_id.trim()) {
      setMessage({ type: 'error', text: 'Vui lòng nhập ID linh kiện' });
      return;
    }

    setSaving(true);
    setMessage(null);
    try {
      if (editingComponent) {
        await updateDeviceComponent(deviceId, editingComponent.component_id, {
          component_type: componentForm.component_type,
          field_name: componentForm.field_name,
          hardware_model: componentForm.hardware_model,
          connection_type: componentForm.connection_type,
        }, token);
        setMessage({ type: 'success', text: 'Đã cập nhật linh kiện' });
      } else {
        await createDeviceComponent(deviceId, {
          component_id: componentForm.component_id,
          component_type: componentForm.component_type,
          field_name: componentForm.field_name,
          hardware_model: componentForm.hardware_model,
          connection_type: componentForm.connection_type,
        }, token);
        setMessage({ type: 'success', text: 'Đã thêm linh kiện mới' });
      }
      setShowAddModal(false);
      await loadData();
    } catch (err) {
      setMessage({ type: 'error', text: err.response?.data?.detail || 'Thao tác thất bại' });
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteComponent = async (comp) => {
    if (!window.confirm(`Xóa linh kiện "${comp.component_id}"?`)) return;

    setSaving(true);
    try {
      await deleteDeviceComponent(deviceId, comp.component_id, token);
      setMessage({ type: 'success', text: 'Đã xóa linh kiện' });
      await loadData();
    } catch (err) {
      setMessage({ type: 'error', text: err.response?.data?.detail || 'Xóa thất bại' });
    } finally {
      setSaving(false);
    }
  };

  const handleFieldAssignmentChange = async (fieldName, newComponentId) => {
    const oldComponentId = fieldAssignments[fieldName];

    // If assigning to same component, skip
    if (oldComponentId === newComponentId) return;

    // Optimistic update
    setFieldAssignments(prev => {
      const updated = { ...prev };
      delete updated[fieldName];
      if (newComponentId) {
        updated[fieldName] = newComponentId;
      }
      return updated;
    });

    try {
      if (newComponentId) {
        // Get current fields for target component
        const targetComp = components.find(c => c.component_id === newComponentId);
        const currentFields = targetComp?.field_name
          ? targetComp.field_name.split(',').map(f => f.trim()).filter(f => f !== fieldName)
          : [];
        currentFields.push(fieldName);

        await assignFieldsToComponent(deviceId, newComponentId, currentFields, token);
      }

      if (oldComponentId) {
        // Remove from old component
        const oldComp = components.find(c => c.component_id === oldComponentId);
        const remainingFields = oldComp?.field_name
          ? oldComp.field_name.split(',').map(f => f.trim()).filter(f => f !== fieldName)
          : [];
        if (remainingFields.length > 0) {
          await assignFieldsToComponent(deviceId, oldComponentId, remainingFields, token);
        } else {
          await assignFieldsToComponent(deviceId, oldComponentId, [], token);
        }
      }

      await loadData();
    } catch (err) {
      setMessage({ type: 'error', text: err.response?.data?.detail || 'Gán field thất bại' });
      // Revert on error
      setFieldAssignments(prev => {
        const reverted = { ...prev };
        delete reverted[fieldName];
        if (oldComponentId) reverted[fieldName] = oldComponentId;
        return reverted;
      });
    }
  };

  // Handle edit field unit
  const handleEditFieldUnit = (field) => {
    setEditingField(field.field_name);
    setEditUnit(field.unit || '');
    setEditDescription(field.description || '');
  };

  const handleSaveFieldUnit = async () => {
    if (!editingField) return;
    try {
      await updateFieldUnit(deviceId, editingField, editUnit, token);
      setMessage({ type: 'success', text: `Đã cập nhật đơn vị cho ${editingField}` });
      setEditingField(null);
      await loadData();
    } catch (err) {
      setMessage({ type: 'error', text: err.response?.data?.detail || 'Cập nhật thất bại' });
    }
  };

  const handleDeleteField = async (fieldName) => {
    if (!window.confirm(`Xóa field "${fieldName}"?`)) return;
    try {
      await deleteField(deviceId, fieldName, token);
      setMessage({ type: 'success', text: `Đã xóa field ${fieldName}` });
      await loadData();
    } catch (err) {
      setMessage({ type: 'error', text: err.response?.data?.detail || 'Xóa thất bại' });
    }
  };

  const getComponentFields = (compId) => {
    return Object.entries(fieldAssignments)
      .filter(([, cid]) => cid === compId)
      .map(([field]) => field);
  };

  const unassignedFields = allFields.filter(f => !fieldAssignments[f.field_name]);

  return (
    <div className="component-manager">
      <div className="component-manager-header">
        <h3>Quản lý Linh kiện thiết bị</h3>
        <div className="header-actions">
          <button
            className={`btn-secondary ${showHealthPanel ? 'active' : ''}`}
            onClick={() => setShowHealthPanel(!showHealthPanel)}
            disabled={loadingHealth}
          >
            {loadingHealth ? '⏳...' : '📊 Sức khỏe'}
          </button>
          <button className="btn-secondary" onClick={handleAutoDetect} disabled={detecting}>
            {detecting ? 'Đang phát hiện...' : '🔍 Auto Detect'}
          </button>
          <button className="btn-primary" onClick={handleOpenAddModal}>
            + Thêm Linh kiện
          </button>
        </div>
      </div>

      {message && (
        <div className={`alert-msg ${message.type}`}>
          {message.text}
          <button className="alert-dismiss" onClick={() => setMessage(null)}>×</button>
        </div>
      )}

      {loading ? (
        <div className="loading-spinner">Đang tải dữ liệu...</div>
      ) : error ? (
        <div className="error-banner">{error}</div>
      ) : (
        <>
          {/* Fields Table */}
          <div className="section-card">
            <h4>📡 Các trường dữ liệu của thiết bị</h4>
            {allFields.length === 0 ? (
              <p className="empty-text">Chưa có trường dữ liệu nào. Hãy thêm data keys trước.</p>
            ) : (
              <table className="dark-table">
                <thead>
                  <tr>
                    <th>Tên Field</th>
                    <th>Đơn vị</th>
                    <th>Linh kiện</th>
                    <th>Model</th>
                    <th>Thời gian</th>
                    <th>Giá trị mới nhất</th>
                    <th>Thao tác</th>
                  </tr>
                </thead>
                <tbody>
                  {allFields.map((field) => {
                    const assignedCompId = fieldAssignments[field.field_name];
                    const assignedComp = components.find(c => c.component_id === assignedCompId);
                    const value = getFieldValue(field.field_name);

                    return (
                      <tr key={field.field_name}>
                        <td>
                          <span className="event-tag">{field.field_name}</span>
                        </td>
                        <td>{field.unit ? getUnitSymbol(field.unit) : '-'}</td>
                        <td>
                          <select
                            className="form-select compact"
                            value={assignedCompId || ''}
                            onChange={(e) => handleFieldAssignmentChange(field.field_name, e.target.value)}
                          >
                            <option value="">-- Chưa gán --</option>
                            {components.map(comp => (
                              <option key={comp.component_id} value={comp.component_id}>
                                {comp.hardware_model || comp.component_type} ({comp.component_id})
                              </option>
                            ))}
                          </select>
                        </td>
                        <td>
                          {assignedComp?.hardware_model || '-'}
                        </td>
                        <td className="time-cell">
                          {(() => {
                            const ts = deviceLatestData[field.field_name]?.ts
                              || deviceLatestData[field.field_name.replace(/^\$/, '')]?.ts
                              || null;
                            return ts ? new Date(ts * 1000).toLocaleTimeString('vi-VN') : '-';
                          })()}
                        </td>
                        <td>
                          {value !== null && value !== undefined ? (
                            <span className="value-badge">
                              {typeof value === 'number' ? value.toFixed(1) : String(value)}
                              {field.unit && <span className="value-unit">{getUnitSymbol(field.unit)}</span>}
                            </span>
                          ) : (
                            <span className="text-muted">-</span>
                          )}
                        </td>
                        <td>
                          <div style={{ display: 'flex', gap: '4px' }}>
                            <button
                              className="btn-ghost compact"
                              onClick={() => handleEditFieldUnit(field)}
                              title="Sửa đơn vị"
                            >
                              ✎
                            </button>
                            <button
                              className="btn-danger-ghost compact"
                              onClick={() => handleDeleteField(field.field_name)}
                              title="Xóa field"
                            >
                              🗑
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>

          {/* Components List */}
          <div className="section-card">
            <h4>🧩 Danh sách Linh kiện ({components.length})</h4>
            {components.length === 0 ? (
              <p className="empty-text">Chưa có linh kiện nào. Nhấn "Auto Detect" hoặc "Thêm Linh kiện".</p>
            ) : (
              <div className="components-grid">
                {components.map((comp) => {
                  const typeInfo = getComponentTypeInfo(comp.component_type);
                  const compFields = getComponentFields(comp.component_id);
                  const healthScore = getHealthScore(comp.component_id);
                  const healthStatus = getHealthStatus(comp.component_id);
                  const healthStatusColor = getHealthStatusColor(healthStatus);
                  const healthStatusLabel = getHealthStatusLabel(healthStatus);
                  const alertsCount = getAlertsCount(comp.component_id);
                  const issuesCount = getIssuesCount(comp.component_id);
                  const healthData = componentHealth[comp.component_id];
                  const trendData = componentTrends[comp.component_id];
                  const anomalies = componentAnomalies[comp.component_id];

                  return (
                    <div key={comp.component_id} className={`component-card ${showHealthPanel ? 'with-health' : ''}`}>
                      <div className="component-header">
                        <span className="component-icon">{typeInfo.icon}</span>
                        <span className="component-name">{comp.hardware_model || comp.component_type}</span>
                        {healthScore !== null ? (
                          <span
                            className="health-score-badge"
                            style={{ backgroundColor: healthStatusColor }}
                            title={`Health: ${healthScore}%`}
                          >
                            {healthScore}%
                          </span>
                        ) : (
                          <span className="health-dot unknown" title="Health: Unknown"></span>
                        )}
                      </div>

                      <div className="component-body">
                        <div className="component-info">
                          <span className="info-label">ID:</span>
                          <span className="info-value">{comp.component_id}</span>
                        </div>
                        <div className="component-info">
                          <span className="info-label">Loại:</span>
                          <span className="info-value">{typeInfo.label}</span>
                        </div>
                        <div className="component-info">
                          <span className="info-label">Kết nối:</span>
                          <span className="info-value">{comp.connection_type || 'N/A'}</span>
                        </div>
                        <div className="component-info">
                          <span className="info-label">Độ tin:</span>
                          <span className="info-value">{Math.round((comp.detection_confidence || 0) * 100)}%</span>
                        </div>

                        {/* Health Panel - shown when enabled */}
                        {showHealthPanel && (
                          <div className="health-panel">
                            <div className="health-bar-container">
                              <div className="health-bar">
                                <div
                                  className="health-bar-fill"
                                  style={{
                                    width: `${healthScore ?? 50}%`,
                                    backgroundColor: healthStatusColor
                                  }}
                                />
                              </div>
                              <span className="health-bar-label">{healthStatusLabel}</span>
                            </div>

                            {/* Metrics */}
                            {healthData?.metrics && (
                              <div className="health-metrics">
                                {healthData.metrics.signal_strength && (
                                  <div className="health-metric">
                                    <span className="metric-label">Signal:</span>
                                    <span className="metric-value">{healthData.metrics.signal_strength} dBm</span>
                                  </div>
                                )}
                                {healthData.metrics.battery_level && (
                                  <div className="health-metric">
                                    <span className="metric-label">Pin:</span>
                                    <span className="metric-value">{healthData.metrics.battery_level}%</span>
                                  </div>
                                )}
                                {healthData.metrics.uptime_hours && (
                                  <div className="health-metric">
                                    <span className="metric-label">Uptime:</span>
                                    <span className="metric-value">{healthData.metrics.uptime_hours}h</span>
                                  </div>
                                )}
                              </div>
                            )}

                            {/* Alerts & Issues Badges */}
                            <div className="health-badges">
                              {alertsCount > 0 && (
                                <span className="health-badge alert">
                                  ⚠️ {alertsCount} canh bao
                                </span>
                              )}
                              {issuesCount > 0 && (
                                <span className="health-badge issue">
                                  🔴 {issuesCount} vu de
                                </span>
                              )}
                              {anomalies?.summary?.total > 0 && (
                                <span className="health-badge anomaly">
                                  ⚡ {anomalies.summary.total} bat thuong
                                </span>
                              )}
                              {trendData?.trend && trendData.trend !== 'stable' && (
                                <span className={`health-badge trend ${trendData.trend}`}>
                                  {trendData.trend === 'increasing' ? '📈' : '📉'} {trendData.trend}
                                </span>
                              )}
                            </div>

                            {/* Mini Trend Chart */}
                            {trendData?.data?.length > 0 && (
                              <div className="mini-trend">
                                <MiniTrendChart data={trendData.data} />
                              </div>
                            )}
                          </div>
                        )}

                        {compFields.length > 0 && (
                          <div className="component-fields">
                            <span className="info-label">Fields:</span>
                            <div className="fields-tags">
                              {compFields.map(f => (
                                <span key={f} className="field-tag">{f}</span>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>

                      <div className="component-actions">
                        <button className="btn-ghost compact" onClick={() => handleOpenEditModal(comp)}>
                          ✎ Sửa
                        </button>
                        <button className="btn-danger-ghost compact" onClick={() => handleDeleteComponent(comp)}>
                          🗑 Xóa
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Unassigned Fields */}
          {unassignedFields.length > 0 && (
            <div className="section-card warning">
              <h4>⚠️ Fields chưa gán ({unassignedFields.length})</h4>
              <div className="unassigned-fields">
                {unassignedFields.map(f => (
                  <span key={f.field_name} className="field-tag warning">{f.field_name}</span>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* Add/Edit Modal */}
      {showAddModal && (
        <div className="modal-backdrop" onClick={() => setShowAddModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{editingComponent ? 'Sửa Linh kiện' : 'Thêm Linh kiện mới'}</h3>
              <button className="modal-close" onClick={() => setShowAddModal(false)}>×</button>
            </div>

            <div className="modal-body">
              <label className="form-label">
                ID Linh kiện *
                <input
                  className="form-input"
                  type="text"
                  value={componentForm.component_id}
                  onChange={(e) => setComponentForm({ ...componentForm, component_id: e.target.value })}
                  placeholder="VD: dht_01, bmp_01"
                  disabled={!!editingComponent}
                />
              </label>

              <label className="form-label">
                Loại linh kiện
                <input
                  list="component-types-list"
                  className="form-input"
                  type="text"
                  value={componentForm.component_type}
                  onChange={(e) => setComponentForm({ ...componentForm, component_type: e.target.value })}
                  placeholder="Chọn hoặc nhập loại linh kiện"
                />
                <datalist id="component-types-list">
                  {COMPONENT_TYPES.map(ct => (
                    <option key={ct.value} value={ct.value}>{ct.icon} {ct.label}</option>
                  ))}
                </datalist>
              </label>

              <label className="form-label">
                Hardware Model
                <input
                  list="hardware-models-list"
                  className="form-input"
                  type="text"
                  value={componentForm.hardware_model}
                  onChange={(e) => setComponentForm({ ...componentForm, hardware_model: e.target.value })}
                  placeholder="Chọn hoặc nhập model"
                />
                <datalist id="hardware-models-list">
                  {HARDWARE_MODELS.map(model => (
                    <option key={model} value={model}>{model}</option>
                  ))}
                </datalist>
              </label>

              <label className="form-label">
                Tên Field (các field cách nhau bằng dấu phẩy)
                <input
                  className="form-input"
                  type="text"
                  value={componentForm.field_name}
                  onChange={(e) => setComponentForm({ ...componentForm, field_name: e.target.value })}
                  placeholder="VD: temperature,humidity"
                />
              </label>

              <label className="form-label">
                Kiểu kết nối
                <select
                  className="form-select"
                  value={componentForm.connection_type}
                  onChange={(e) => setComponentForm({ ...componentForm, connection_type: e.target.value })}
                >
                  {CONNECTION_TYPES.map(ct => (
                    <option key={ct.value} value={ct.value}>{ct.label}</option>
                  ))}
                </select>
              </label>
            </div>

            <div className="modal-footer">
              <button className="btn-primary" onClick={handleSaveComponent} disabled={saving}>
                {saving ? 'Đang lưu...' : (editingComponent ? 'Cập nhật' : 'Thêm mới')}
              </button>
              <button className="btn-secondary" onClick={() => setShowAddModal(false)}>Hủy</button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Field Unit Modal */}
      {editingField && (
        <div className="modal-backdrop" onClick={() => setEditingField(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Sửa đơn vị field</h3>
              <button className="modal-close" onClick={() => setEditingField(null)}>×</button>
            </div>
            <div className="modal-body">
              <p style={{ marginBottom: '12px', color: 'var(--iot-secondary)' }}>
                Field: <span className="event-tag">{editingField}</span>
              </p>
              <label className="form-label">
                Đơn vị
                <input
                  list="units-list"
                  className="form-input"
                  type="text"
                  value={editUnit}
                  onChange={(e) => setEditUnit(e.target.value)}
                  placeholder="Chọn hoặc nhập đơn vị"
                  autoFocus
                />
                <datalist id="units-list">
                  {UNIT_DATA.map(unit => (
                    <option key={unit.id} value={unit.id}>{unit.symbol} — {unit.name} ({unit.description})</option>
                  ))}
                </datalist>
              </label>
              {editUnit && (() => {
                const selected = UNIT_DATA.find(u => u.id === editUnit);
                if (!selected) return null;
                return (
                  <div className="unit-preview" title={selected.description}>
                    <span className="unit-preview-symbol">{selected.symbol}</span>
                    <span className="unit-preview-info">
                      <span className="unit-preview-name">{selected.name}</span>
                      <span className="unit-preview-desc">{selected.description}</span>
                    </span>
                  </div>
                );
              })()}
            </div>
            <div className="modal-footer">
              <button className="btn-primary" onClick={handleSaveFieldUnit}>
                Lưu
              </button>
              <button className="btn-secondary" onClick={() => setEditingField(null)}>Hủy</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// Mini Trend Chart Component
const MiniTrendChart = ({ data }) => {
  if (!data || data.length === 0) {
    return <div className="mini-trend-empty">Khong co du lieu</div>;
  }

  // Get values and filter valid ones
  const validData = data.filter(d => d.value != null);
  if (validData.length === 0) {
    return <div className="mini-trend-empty">Khong co du lieu</div>;
  }

  const values = validData.map(d => d.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;

  // Normalize values to 0-100%
  const normalize = (v) => ((v - min) / range) * 100;

  // Create SVG path
  const width = 200;
  const height = 40;
  const padding = 2;
  const innerWidth = width - padding * 2;
  const innerHeight = height - padding * 2;

  // Sample data if too many points
  const sampleRate = Math.max(1, Math.floor(validData.length / 50));
  const sampledData = validData.filter((_, i) => i % sampleRate === 0);

  const points = sampledData.map((d, i) => {
    const x = padding + (i / Math.max(sampledData.length - 1, 1)) * innerWidth;
    const y = padding + (1 - normalize(d.value)) * innerHeight;
    return `${x},${y}`;
  }).join(' ');

  const pathD = sampledData.length > 1
    ? `M${sampledData.map((d, i) => {
        const x = padding + (i / Math.max(sampledData.length - 1, 1)) * innerWidth;
        const y = padding + (1 - normalize(d.value)) * innerHeight;
        return `${x} ${y}`;
      }).join(' L')}`
    : '';

  // Find anomaly points
  const anomalyIndices = new Set();
  validData.forEach((d, i) => {
    if (d.is_anomaly) {
      anomalyIndices.add(Math.floor(i / sampleRate));
    }
  });

  return (
    <div className="mini-trend-chart">
      <svg width={width} height={height} className="trend-svg">
        {/* Gradient fill */}
        <defs>
          <linearGradient id="trendGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.3" />
            <stop offset="100%" stopColor="#3b82f6" stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* Background line */}
        <polyline
          points={points}
          fill="none"
          stroke="#e2e8f0"
          strokeWidth="1"
        />

        {/* Main trend line */}
        <path
          d={pathD}
          fill="none"
          stroke="#3b82f6"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Anomaly markers */}
        {sampledData.map((d, i) => {
          if (d.is_anomaly) {
            const x = padding + (i / Math.max(sampledData.length - 1, 1)) * innerWidth;
            const y = padding + (1 - normalize(d.value)) * innerHeight;
            return (
              <circle
                key={i}
                cx={x}
                cy={y}
                r="4"
                fill="#ef4444"
                stroke="#fff"
                strokeWidth="1"
              />
            );
          }
          return null;
        })}
      </svg>

      <div className="mini-trend-stats">
        <span>Min: {min.toFixed(1)}</span>
        <span>Max: {max.toFixed(1)}</span>
      </div>
    </div>
  );
};

export default ComponentManager;
