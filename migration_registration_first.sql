-- Migration script for Registration-First flow (MySQL 5.7 compatible)
-- Run this on existing databases to add new columns

USE iot_data;

-- Add new columns to thiet_bi table (one by one, ignore errors for existing columns)
-- Run each statement separately

ALTER TABLE thiet_bi ADD COLUMN secret_key VARCHAR(64) DEFAULT NULL;
ALTER TABLE thiet_bi ADD COLUMN http_api_key VARCHAR(64) DEFAULT NULL;
ALTER TABLE thiet_bi ADD COLUMN protocol VARCHAR(20) DEFAULT 'mqtt';
ALTER TABLE thiet_bi ADD COLUMN device_type VARCHAR(20) DEFAULT 'sensor';
ALTER TABLE thiet_bi ADD COLUMN provisioned_at DATETIME DEFAULT NULL;
ALTER TABLE thiet_bi ADD COLUMN last_auth_at DATETIME DEFAULT NULL;
