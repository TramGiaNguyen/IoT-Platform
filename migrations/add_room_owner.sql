-- Migration: Add nguoi_so_huu_id to phong table for room ownership
-- Date: 2026-03-31
-- Idempotent: safe to run multiple times

USE iot_data;

-- Add nguoi_so_huu_id column to phong table if not exists
SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'phong'
    AND COLUMN_NAME = 'nguoi_so_huu_id');
SET @sql = IF(@col_exists = 0,
    'ALTER TABLE phong ADD COLUMN nguoi_so_huu_id INT NULL AFTER nguoi_quan_ly_id',
    'SELECT "Column nguoi_so_huu_id already exists in phong" AS message');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Add FK for nguoi_so_huu_id if not exists
SET @fk_exists = (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
    WHERE CONSTRAINT_SCHEMA = DATABASE()
    AND TABLE_NAME = 'phong'
    AND CONSTRAINT_NAME = 'phong_nguoi_so_huu_fk');
SET @sql2 = IF(@fk_exists = 0,
    'ALTER TABLE phong ADD CONSTRAINT phong_nguoi_so_huu_fk FOREIGN KEY (nguoi_so_huu_id) REFERENCES nguoi_dung(id) ON DELETE SET NULL',
    'SELECT "FK phong_nguoi_so_huu_fk already exists" AS message');
PREPARE stmt2 FROM @sql2; EXECUTE stmt2; DEALLOCATE PREPARE stmt2;

-- Set existing rooms to be owned by admin if not already set
UPDATE phong
SET nguoi_so_huu_id = (SELECT id FROM nguoi_dung WHERE vai_tro = 'admin' LIMIT 1)
WHERE nguoi_so_huu_id IS NULL;

-- Add index if not exists
SET @idx_exists = (SELECT COUNT(*) FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'phong'
    AND INDEX_NAME = 'idx_phong_nguoi_so_huu');
SET @sql3 = IF(@idx_exists = 0,
    'CREATE INDEX idx_phong_nguoi_so_huu ON phong(nguoi_so_huu_id)',
    'SELECT "Index idx_phong_nguoi_so_huu already exists" AS message');
PREPARE stmt3 FROM @sql3; EXECUTE stmt3; DEALLOCATE PREPARE stmt3;

SELECT 'Migration add_room_owner completed' AS status;
