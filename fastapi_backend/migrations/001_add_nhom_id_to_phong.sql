-- ============================================================
-- Migration: Add nhom_id to phong table
-- Purpose: Workspace isolation - phong (rooms) need to belong to a workspace (nhom)
-- Date: 2026-07-03
-- Idempotent: safe to run multiple times
-- ============================================================

-- Add nhom_id column (skip if already exists)
SET @exists = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = 'iot_data' AND TABLE_NAME = 'phong' AND COLUMN_NAME = 'nhom_id');
SET @sql = IF(@exists = 0,
  'ALTER TABLE `phong` ADD COLUMN `nhom_id` INT(11) NULL DEFAULT NULL COMMENT ''FK toi bang nhom. NULL = phong ca nhan.'' AFTER `nguoi_so_huu_id`',
  'SELECT ''phong.nhom_id already exists'' AS msg');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Add index (skip if already exists)
SET @exists = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = 'iot_data' AND TABLE_NAME = 'phong' AND INDEX_NAME = 'idx_nhom_id');
SET @sql = IF(@exists = 0,
  'ALTER TABLE `phong` ADD INDEX `idx_nhom_id` (`nhom_id`)',
  'SELECT ''idx_nhom_id already exists'' AS msg');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
