-- Migration: Zone Occupancy tables (zone_definitions, zone_occupancy_log, zone_occupancy_daily)
-- NOTE: zone_definitions is already created in data.sql via add_camera_and_occupancy.sql
-- This migration is kept for existing deployments that need the zone tables but may
-- not have them yet. Safe to run multiple times.

USE iot_data;

-- zone_definitions (may already exist from data.sql)
CREATE TABLE IF NOT EXISTS `zone_definitions` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `camera_id` INT NOT NULL,
  `zone_name` VARCHAR(100) NOT NULL,
  `zone_index` INT NOT NULL,
  `polygon_points` JSON NOT NULL,
  `is_entry_zone` TINYINT(1) DEFAULT 0,
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY `uk_camera_zone` (`camera_id`, `zone_index`)
);

-- zone_occupancy_log
CREATE TABLE IF NOT EXISTS `zone_occupancy_log` (
  `id` BIGINT AUTO_INCREMENT PRIMARY KEY,
  `camera_id` INT NOT NULL,
  `zone_id` INT NOT NULL,
  `track_id` INT DEFAULT NULL,
  `zone_entered_at` DATETIME NOT NULL,
  `zone_exited_at` DATETIME DEFAULT NULL,
  `duration_seconds` INT DEFAULT NULL,
  `entered_count` INT DEFAULT 1,
  UNIQUE KEY `uk_track_session` (`zone_id`, `track_id`, `zone_entered_at`),
  INDEX `idx_zone_time` (`zone_id`, `zone_entered_at`),
  INDEX `idx_camera_time` (`camera_id`, `zone_entered_at`)
);

-- zone_occupancy_daily
CREATE TABLE IF NOT EXISTS `zone_occupancy_daily` (
  `id` BIGINT AUTO_INCREMENT PRIMARY KEY,
  `camera_id` INT NOT NULL,
  `zone_id` INT NOT NULL,
  `zone_name` VARCHAR(100) NOT NULL,
  `ngay` DATE NOT NULL,
  `total_seconds` INT DEFAULT 0,
  `peak_count` INT DEFAULT 0,
  `total_entries` INT DEFAULT 0,
  `avg_count` DECIMAL(5,2) DEFAULT 0.00,
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY `uk_daily` (`zone_id`, `ngay`),
  INDEX `idx_ngay` (`ngay`)
);

SELECT 'Migration add_zone_occupancy completed' AS status;
