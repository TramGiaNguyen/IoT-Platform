-- Hardware Component Detection Tables
-- Phase 2: Component-level hardware detection and health tracking

-- ============================================
-- 1. Device Components Registry
-- ============================================
CREATE TABLE IF NOT EXISTS device_components (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    device_id VARCHAR(100) NOT NULL COMMENT 'Device identifier',
    component_id VARCHAR(100) NOT NULL COMMENT 'Component identifier within device (e.g., temp_sensor_1)',
    component_type VARCHAR(50) NOT NULL COMMENT 'Sensor type: temperature, humidity, relay, etc.',
    field_name VARCHAR(100) NOT NULL COMMENT 'Original field name in payload',
    hardware_model VARCHAR(100) DEFAULT NULL COMMENT 'Detected hardware model (e.g., DHT22, BME280)',
    connection_type VARCHAR(20) DEFAULT NULL COMMENT 'I2C, SPI, OneWire, GPIO, Analog',
    detection_confidence FLOAT DEFAULT 0.0 COMMENT 'Confidence score 0-1 for hardware detection',
    device_type VARCHAR(50) DEFAULT NULL COMMENT 'Inferred device type (weather_station, smart_meter, etc.)',
    device_type_confidence FLOAT DEFAULT 0.0 COMMENT 'Confidence for device type inference',
    metadata JSON DEFAULT NULL COMMENT '{unit, typical_range, accuracy, observed_range}',
    detected_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    first_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    health_status ENUM('healthy', 'degraded', 'failed', 'unknown') DEFAULT 'unknown',
    health_score FLOAT DEFAULT 1.0 COMMENT 'Health score 0.0-1.0',
    health_history JSON DEFAULT NULL COMMENT '[{timestamp, status, score, reason}]',
    UNIQUE KEY uk_device_component (device_id, component_id),
    INDEX idx_device (device_id),
    INDEX idx_health (health_status),
    INDEX idx_type (component_type),
    INDEX idx_hardware_model (hardware_model)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- 2. Component Events Log
-- ============================================
CREATE TABLE IF NOT EXISTS component_events (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    device_id VARCHAR(100) NOT NULL,
    component_id VARCHAR(100) NOT NULL,
    event_type ENUM('detected', 'health_change', 'suspected_failure', 'recovered', 'schema_drift', 'component_added', 'component_removed') NOT NULL,
    severity ENUM('info', 'warning', 'critical') DEFAULT 'info',
    details JSON DEFAULT NULL COMMENT '{old_status, new_status, reason, value}',
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_device_component (device_id, component_id),
    INDEX idx_event_type (event_type),
    INDEX idx_timestamp (timestamp),
    INDEX idx_severity (severity)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- 3. Component Health Analysis
-- ============================================
CREATE TABLE IF NOT EXISTS component_health_analysis (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    component_id BIGINT NOT NULL COMMENT 'Reference to device_components.id',
    device_id VARCHAR(100) NOT NULL,
    analysis_type ENUM('battery', 'sensor_drift', 'sensor_stuck', 'connection', 'calibration', 'cross_validation') NOT NULL,
    health_score FLOAT DEFAULT 1.0 COMMENT 'Analysis result: 0.0-1.0',
    findings JSON DEFAULT NULL COMMENT '{issue_type, details, recommendation}',
    threshold_values JSON DEFAULT NULL COMMENT '{expected, actual, threshold}',
    is_resolved BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    resolved_at TIMESTAMP NULL,
    INDEX idx_component (component_id),
    INDEX idx_analysis_type (analysis_type),
    INDEX idx_health_score (health_score),
    INDEX idx_resolved (is_resolved)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- 4. Cross-Component Validation Rules
-- ============================================
CREATE TABLE IF NOT EXISTS component_validation_rules (
    id INT AUTO_INCREMENT PRIMARY KEY,
    device_type VARCHAR(50) DEFAULT NULL COMMENT 'Apply to specific device type or NULL for all',
    component_a_type VARCHAR(50) NOT NULL COMMENT 'First component type',
    component_b_type VARCHAR(50) NOT NULL COMMENT 'Second component type',
    validation_type ENUM('correlation', 'expected_range', 'time_series', 'causality') NOT NULL,
    correlation_threshold FLOAT DEFAULT 0.7 COMMENT 'Min correlation for validation',
    expected_correlation ENUM('positive', 'negative', 'any') DEFAULT 'any',
    description TEXT,
    enabled BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_device_type (device_type),
    INDEX idx_components (component_a_type, component_b_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- 5. Hardware Profile Snapshots
-- ============================================
CREATE TABLE IF NOT EXISTS hardware_profile_snapshots (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    device_id VARCHAR(100) NOT NULL,
    snapshot_type ENUM('initial', 'update', 'drift_detected') NOT NULL,
    components JSON NOT NULL COMMENT 'Snapshot of all detected components',
    device_type VARCHAR(50) DEFAULT NULL,
    hardware_model VARCHAR(100) DEFAULT NULL,
    payload_schema JSON DEFAULT NULL COMMENT 'Fields observed',
    update_interval_seconds FLOAT DEFAULT NULL,
    snapshot_hash VARCHAR(64) NOT NULL COMMENT 'Hash to detect changes',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_device (device_id),
    INDEX idx_snapshot_type (snapshot_type),
    INDEX idx_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- Add columns to existing metrics table
-- ============================================
-- This extends the metrics table with component linkage
ALTER TABLE metrics ADD COLUMN (
    component_id VARCHAR(100) DEFAULT NULL COMMENT 'Link to device_components.id for component-level tracking',
    hardware_model VARCHAR(100) DEFAULT NULL COMMENT 'Detected hardware model',
    connection_type VARCHAR(20) DEFAULT NULL COMMENT 'I2C, SPI, etc.'
);

-- Add index for component linkage
ALTER TABLE metrics ADD INDEX idx_component (component_id);

-- ============================================
-- Insert default validation rules
-- ============================================
INSERT INTO component_validation_rules (component_a_type, component_b_type, validation_type, expected_correlation, correlation_threshold, description) VALUES
-- Temperature-Humidity correlation (usually negative)
('temperature', 'humidity', 'correlation', 'negative', 0.5, 'Temperature and humidity typically have negative correlation'),
-- Pressure-Temperature correlation (positive in controlled env)
('pressure', 'temperature', 'correlation', 'positive', 0.3, 'Atmospheric pressure correlates with temperature'),
-- Battery-Signal correlation (positive - low battery affects transmission)
('battery', 'rssi', 'correlation', 'positive', 0.4, 'Battery level affects signal strength'),
-- Light-Humidity for greenhouse/watering systems
('light', 'soil_moisture', 'correlation', 'negative', 0.4, 'High light typically means lower soil moisture (evaporation)'),
-- CO2-Temperature in enclosed spaces
('co2', 'temperature', 'correlation', 'positive', 0.5, 'CO2 and temperature rise together in occupied spaces');
