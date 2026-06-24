-- Migration: Add nguoi_tao_id to thiet_bi for tracking device creator
-- Date: 2026-06-24
-- Purpose: Track who created each device, enabling proper permission model:
--   - Creator can always see/manage their own devices
--   - Students in the same group can see devices in their shared group rooms
--   - Teachers of the class can see devices created by their students
--   - Admin can see all devices
-- Idempotent: safe to run multiple times

USE iot_data;

-- 1. Add nguoi_tao_id column (creator = the person who actually created the device record)
SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'thiet_bi'
    AND COLUMN_NAME = 'nguoi_tao_id');
SET @sql = IF(@col_exists = 0,
    'ALTER TABLE thiet_bi ADD COLUMN nguoi_tao_id INT NULL AFTER nguoi_so_huu_id',
    'SELECT "Column nguoi_tao_id already exists in thiet_bi" AS message');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 2. FK from nguoi_tao_id -> nguoi_dung.id (ON DELETE SET NULL, device should not be deleted if creator is deleted)
SET @fk_exists = (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
    WHERE CONSTRAINT_SCHEMA = DATABASE()
    AND TABLE_NAME = 'thiet_bi'
    AND CONSTRAINT_NAME = 'thiet_bi_tao_fk');
SET @sql2 = IF(@fk_exists = 0,
    'ALTER TABLE thiet_bi ADD CONSTRAINT thiet_bi_tao_fk FOREIGN KEY (nguoi_tao_id) REFERENCES nguoi_dung(id) ON DELETE SET NULL',
    'SELECT "FK thiet_bi_tao_fk already exists" AS message');
PREPARE stmt2 FROM @sql2; EXECUTE stmt2; DEALLOCATE PREPARE stmt2;

-- 3. Index for fast lookups by creator
SET @idx_exists = (SELECT COUNT(*) FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'thiet_bi'
    AND INDEX_NAME = 'idx_thiet_bi_nguoi_tao');
SET @sql3 = IF(@idx_exists = 0,
    'CREATE INDEX idx_thiet_bi_nguoi_tao ON thiet_bi(nguoi_tao_id)',
    'SELECT "Index idx_thiet_bi_nguoi_tao already exists" AS message');
PREPARE stmt3 FROM @sql3; EXECUTE stmt3; DEALLOCATE PREPARE stmt3;

-- 4. Backfill: set nguoi_tao_id = nguoi_so_huu_id for existing devices (they were created by their owner)
UPDATE thiet_bi SET nguoi_tao_id = nguoi_so_huu_id WHERE nguoi_tao_id IS NULL AND nguoi_so_huu_id IS NOT NULL;

SELECT 'Migration add_device_creator completed' AS status;
