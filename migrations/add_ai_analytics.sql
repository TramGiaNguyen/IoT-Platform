-- AI Analytics Tables for IoT Platform
-- Phase 1: Core Infrastructure

-- ============================================
-- 1. Payload Schemas per device
-- ============================================
CREATE TABLE IF NOT EXISTS device_payload_schemas (
    id INT AUTO_INCREMENT PRIMARY KEY,
    device_id VARCHAR(64) NOT NULL COMMENT 'Device identifier',
    schema_version INT DEFAULT 1 COMMENT 'Version number for this schema',
    schema_hash VARCHAR(64) NOT NULL COMMENT 'SHA256 hash of canonical schema',
    fields JSON NOT NULL COMMENT '[{path, type, role, data_type}]',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_device_schema (device_id, schema_hash),
    INDEX idx_device_id (device_id),
    INDEX idx_schema_hash (schema_hash)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- 2. Generic Metrics (Core abstraction)
-- ============================================
CREATE TABLE IF NOT EXISTS metrics (
    id INT AUTO_INCREMENT PRIMARY KEY,
    device_id VARCHAR(64) NOT NULL COMMENT 'Device identifier',
    source_path VARCHAR(255) NOT NULL COMMENT 'JSON path in payload, e.g. $.data.temperature',
    data_type VARCHAR(32) DEFAULT 'FLOAT' COMMENT 'FLOAT, INT, BOOL, STRING',
    semantic_type VARCHAR(64) DEFAULT 'UNKNOWN_NUMERIC' COMMENT 'TEMPERATURE, HUMIDITY, UNKNOWN_NUMERIC, etc.',
    semantic_confidence FLOAT DEFAULT 0.0 COMMENT 'Confidence 0-1 for semantic classification',
    unit VARCHAR(32) DEFAULT NULL COMMENT 'Physical unit if known: C, %, Pa, etc.',
    status VARCHAR(32) DEFAULT 'DISCOVERED' COMMENT 'DISCOVERED, LEARNING, ACTIVE, DRIFTED, DEGRADED',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_device_path (device_id, source_path),
    INDEX idx_device_id (device_id),
    INDEX idx_status (status),
    INDEX idx_semantic (semantic_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- 3. Metric Profiles (Statistical summary)
-- ============================================
CREATE TABLE IF NOT EXISTS metric_profiles (
    id INT AUTO_INCREMENT PRIMARY KEY,
    metric_id INT NOT NULL COMMENT 'Reference to metrics.id',
    count INT DEFAULT 0 COMMENT 'Total data points observed',
    min_val FLOAT DEFAULT NULL COMMENT 'Minimum value',
    max_val FLOAT DEFAULT NULL COMMENT 'Maximum value',
    median FLOAT DEFAULT NULL COMMENT 'Median (50th percentile)',
    mad FLOAT DEFAULT NULL COMMENT 'Median Absolute Deviation (robust measure)',
    mean_val FLOAT DEFAULT NULL COMMENT 'Arithmetic mean',
    std_val FLOAT DEFAULT NULL COMMENT 'Standard deviation',
    p01 FLOAT DEFAULT NULL COMMENT '1st percentile',
    p05 FLOAT DEFAULT NULL COMMENT '5th percentile',
    p50 FLOAT DEFAULT NULL COMMENT '50th percentile (same as median)',
    p95 FLOAT DEFAULT NULL COMMENT '95th percentile',
    p99 FLOAT DEFAULT NULL COMMENT '99th percentile',
    sampling_interval FLOAT DEFAULT NULL COMMENT 'Average seconds between samples',
    missing_ratio FLOAT DEFAULT 0 COMMENT 'Ratio of missing data (0-1)',
    trend VARCHAR(16) DEFAULT 'stable' COMMENT 'up, down, stable',
    seasonality JSON DEFAULT NULL COMMENT '{hour: avg_value} for hourly patterns',
    profile_version INT DEFAULT 1 COMMENT 'Incremented when profile is recalculated',
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (metric_id) REFERENCES metrics(id) ON DELETE CASCADE,
    INDEX idx_metric_id (metric_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- 4. Detected Anomalies
-- ============================================
CREATE TABLE IF NOT EXISTS detected_anomalies (
    id INT AUTO_INCREMENT PRIMARY KEY,
    metric_id INT NOT NULL COMMENT 'Reference to metrics.id',
    timestamp DATETIME NOT NULL COMMENT 'When anomaly occurred',
    value FLOAT NOT NULL COMMENT 'The anomalous value',
    score FLOAT NOT NULL COMMENT 'Anomaly score 0-1',
    severity VARCHAR(16) NOT NULL COMMENT 'low, medium, high, critical',
    anomaly_type VARCHAR(32) DEFAULT 'point' COMMENT 'point, contextual, trend, change_point, sensor_health',
    details JSON DEFAULT NULL COMMENT 'Additional context: expected_value, deviation, etc.',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (metric_id) REFERENCES metrics(id) ON DELETE CASCADE,
    INDEX idx_metric_timestamp (metric_id, timestamp),
    INDEX idx_severity (severity),
    INDEX idx_timestamp (timestamp)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- 5. Metric Forecast Models
-- ============================================
CREATE TABLE IF NOT EXISTS metric_models (
    id INT AUTO_INCREMENT PRIMARY KEY,
    metric_id INT NOT NULL COMMENT 'Reference to metrics.id',
    model_type VARCHAR(32) NOT NULL COMMENT 'naive, ses, holt, holt_winters, arima',
    model_params JSON DEFAULT NULL COMMENT '{alpha, beta, gamma, seasonal_period, ...}',
    mae FLOAT DEFAULT NULL COMMENT 'Mean Absolute Error on validation set',
    rmse FLOAT DEFAULT NULL COMMENT 'Root Mean Square Error',
    mape FLOAT DEFAULT NULL COMMENT 'Mean Absolute Percentage Error',
    training_window INT DEFAULT 1000 COMMENT 'Number of data points used for training',
    trained_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    is_active BOOLEAN DEFAULT TRUE COMMENT 'Only active model is used for prediction',
    FOREIGN KEY (metric_id) REFERENCES metrics(id) ON DELETE CASCADE,
    INDEX idx_metric_active (metric_id, is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- 6. AI-Generated Alerts
-- ============================================
CREATE TABLE IF NOT EXISTS ai_alerts (
    id INT AUTO_INCREMENT PRIMARY KEY,
    metric_id INT NOT NULL COMMENT 'Reference to metrics.id',
    anomaly_id INT DEFAULT NULL COMMENT 'Reference to detected_anomalies.id if applicable',
    alert_type VARCHAR(32) NOT NULL COMMENT 'point, trend, forecast, health',
    message TEXT NOT NULL COMMENT 'Human-readable alert message',
    severity VARCHAR(16) NOT NULL COMMENT 'low, medium, high, critical',
    threshold_value FLOAT DEFAULT NULL COMMENT 'The threshold that was crossed',
    actual_value FLOAT DEFAULT NULL COMMENT 'The actual value when alert triggered',
    threshold_type VARCHAR(16) DEFAULT 'dynamic' COMMENT 'dynamic (AI), user, manufacturer, hard_safety',
    device_id VARCHAR(64) DEFAULT NULL COMMENT 'Denormalized for faster queries',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    acknowledged_at TIMESTAMP NULL DEFAULT NULL COMMENT 'When user acknowledged',
    resolved_at TIMESTAMP NULL DEFAULT NULL COMMENT 'When alert resolved',
    INDEX idx_device_created (device_id, created_at),
    INDEX idx_severity (severity),
    INDEX idx_acknowledged (acknowledged_at),
    INDEX idx_resolved (resolved_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- 7. Raw Event Archive (for reprocessing)
-- ============================================
CREATE TABLE IF NOT EXISTS raw_event_archive (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    device_id VARCHAR(64) NOT NULL COMMENT 'Device identifier',
    timestamp DATETIME NOT NULL COMMENT 'Event timestamp',
    topic VARCHAR(255) DEFAULT NULL COMMENT 'MQTT topic if applicable',
    content_type VARCHAR(64) DEFAULT 'application/json' COMMENT 'Content-Type header',
    schema_version INT DEFAULT 1 COMMENT 'Schema version when received',
    schema_hash VARCHAR(64) DEFAULT NULL COMMENT 'Schema fingerprint',
    raw_payload LONGTEXT NOT NULL COMMENT 'Original raw payload',
    parsed_successfully BOOLEAN DEFAULT TRUE COMMENT 'Whether parsing succeeded',
    parse_error TEXT DEFAULT NULL COMMENT 'Error message if parsing failed',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_device_timestamp (device_id, timestamp),
    INDEX idx_schema_hash (schema_hash),
    INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- 8. Schema Drift Log
-- ============================================
CREATE TABLE IF NOT EXISTS schema_drift_log (
    id INT AUTO_INCREMENT PRIMARY KEY,
    device_id VARCHAR(64) NOT NULL,
    old_schema_hash VARCHAR(64) NOT NULL,
    new_schema_hash VARCHAR(64) NOT NULL,
    old_version INT NOT NULL,
    new_version INT NOT NULL,
    fields_removed JSON DEFAULT NULL COMMENT 'Fields that disappeared',
    fields_added JSON DEFAULT NULL COMMENT 'Fields that appeared',
    field_mappings JSON DEFAULT NULL COMMENT '{new_path: old_path} for matched fields',
    drift_confidence FLOAT DEFAULT 0 COMMENT 'Confidence in mapping',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_device_created (device_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
