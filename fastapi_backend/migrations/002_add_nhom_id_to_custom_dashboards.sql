-- ============================================================
-- Migration: Add nhom_id to custom_dashboards table
-- Purpose: Workspace isolation - dashboards need to belong to a workspace (nhom)
-- Date: 2026-07-03
-- Idempotent: safe to run multiple times
-- ============================================================

-- Add nhom_id column (skip if already exists)
SET @exists = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = 'iot_data' AND TABLE_NAME = 'custom_dashboards' AND COLUMN_NAME = 'nhom_id');
SET @sql = IF(@exists = 0,
  'ALTER TABLE `custom_dashboards` ADD COLUMN `nhom_id` INT(11) NULL DEFAULT NULL COMMENT ''FK toi bang nhom (neu dashboard thuoc nhom)'' AFTER `lop_hoc_id`',
  'SELECT ''custom_dashboards.nhom_id already exists'' AS msg');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Add index (skip if already exists)
SET @exists = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = 'iot_data' AND TABLE_NAME = 'custom_dashboards' AND INDEX_NAME = 'idx_dashboard_nhom');
SET @sql = IF(@exists = 0,
  'ALTER TABLE `custom_dashboards` ADD INDEX `idx_dashboard_nhom` (`nhom_id`)',
  'SELECT ''idx_dashboard_nhom already exists'' AS msg');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
