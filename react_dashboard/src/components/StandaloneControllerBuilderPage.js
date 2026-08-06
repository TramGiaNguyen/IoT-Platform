import React, { useState, useEffect, useCallback } from 'react';
import { fetchStandaloneConfig, saveStandaloneConfig, updateStandaloneConfig } from '../services';
import StandaloneControllerBuilder from './StandaloneControllerBuilder';
import '../styles/standalone-controller.css';

const StandaloneControllerBuilderPage = ({ device, token, onBack }) => {
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Extract device key and device name from nested structure
  const innerDevice = device?.device;
  const deviceKey = innerDevice?.device_id || device?.device_id || device?.id;
  const deviceName = innerDevice?.ten_thiet_bi || device?.ten_thiet_bi || innerDevice?.ma_thiet_bi || device?.ma_thiet_bi || 'Unknown Device';

  // Load standalone config
  useEffect(() => {
    if (!deviceKey) {
      setLoading(false);
      return;
    }

    const loadConfig = async () => {
      try {
        setLoading(true);
        const data = await fetchStandaloneConfig(deviceKey, token);
        setConfig(data || null);
      } catch (err) {
        console.error('Failed to load standalone config:', err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    loadConfig();
  }, [deviceKey, token]);

  // Save handler
  const handleSave = useCallback(async (configData) => {
    if (!deviceKey) {
      throw new Error('Không tìm thấy thiết bị. Vui lòng tải lại trang.');
    }
    try {
      await updateStandaloneConfig(deviceKey, configData, token);
      setConfig(configData);
    } catch (err) {
      await saveStandaloneConfig(deviceKey, configData, token);
      setConfig(configData);
    }
  }, [deviceKey, token]);

  if (loading) {
    return (
      <div className="sc-page">
        <div className="sc-page-loading">
          <div className="loading-spinner"></div>
          <span>Đang tải cấu hình...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="sc-page">
        <div className="sc-page-error">
          <span>Lỗi: {error}</span>
          <button className="sc-btn sc-btn-secondary" onClick={onBack}>
            Quay lại
          </button>
        </div>
      </div>
    );
  }

  if (!device) {
    return (
      <div className="sc-page">
        <div className="sc-page-error">
          <span>Không tìm thấy thiết bị. Vui lòng quay lại danh sách.</span>
          <button className="sc-btn sc-btn-secondary" onClick={onBack}>
            Quay lại
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="sc-page">
      {/* Page Header */}
      <div className="sc-page-header">
        <button className="sc-page-back-btn" onClick={onBack}>
          ← Quay lại
        </button>
        <div className="sc-page-title">
          <h2>Thiết lập điều khiển nội bộ</h2>
          {device && (
            <span className="sc-page-device-info">
              {deviceName}
            </span>
          )}
        </div>
      </div>

      {/* Builder Content */}
      <div className="sc-page-content">
        <StandaloneControllerBuilder
          device={device}
          config={config}
          onSave={handleSave}
          onBack={onBack}
        />
      </div>
    </div>
  );
};

export default StandaloneControllerBuilderPage;
