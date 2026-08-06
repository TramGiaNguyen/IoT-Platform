-- Migration: Add standalone_configs table for ESP Standalone Controller
-- Purpose: Store ESP web UI configuration per device

CREATE TABLE IF NOT EXISTS standalone_configs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    device_id VARCHAR(64) NOT NULL,
    ap_ssid VARCHAR(64) NOT NULL DEFAULT 'ESP_Control',
    ap_password VARCHAR(64) NOT NULL DEFAULT '12345678',
    controls JSON NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_device_id (device_id),
    INDEX idx_device_id (device_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Add additional columns if missing (run on existing DBs)
ALTER TABLE standalone_configs
    ADD COLUMN IF NOT EXISTS board_type VARCHAR(16) NOT NULL DEFAULT 'esp32',
    ADD COLUMN IF NOT EXISTS orientation VARCHAR(16) NOT NULL DEFAULT 'portrait',
    ADD COLUMN IF NOT EXISTS server_port INT NOT NULL DEFAULT 80,
    ADD COLUMN IF NOT EXISTS server_endpoint VARCHAR(32) NOT NULL DEFAULT 'control',
    ADD COLUMN IF NOT EXISTS ap_local_ip VARCHAR(45) NOT NULL DEFAULT '192.168.4.1',
    ADD COLUMN IF NOT EXISTS ap_gateway VARCHAR(45) NOT NULL DEFAULT '192.168.4.1',
    ADD COLUMN IF NOT EXISTS ap_subnet VARCHAR(45) NOT NULL DEFAULT '255.255.255.0',
    ADD COLUMN IF NOT EXISTS device_code VARCHAR(64) NULL;
