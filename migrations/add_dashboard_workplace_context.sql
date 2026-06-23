-- Migration: Add workplace/room context columns to custom_dashboards
-- Date: 2026-06-17
-- Purpose: Allow dashboard to be scoped to a phong (room) or lop_hoc (class)
--          so authorization can be enforced by workplace/room
-- Idempotent: safe to run multiple times

USE iot_data;

-- Add phong_id column to custom_dashboards if not exists
SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'custom_dashboards'
    AND COLUMN_NAME = 'phong_id');
SET @sql = IF(@col_exists = 0,
    'ALTER TABLE custom_dashboards ADD COLUMN phong_id INT NULL AFTER nguoi_tao_id',
    'SELECT ''Column phong_id already exists in custom_dashboards'' AS message');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Add lop_hoc_id column to custom_dashboards if not exists
SET @col_exists2 = (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'custom_dashboards'
    AND COLUMN_NAME = 'lop_hoc_id');
SET @sql2 = IF(@col_exists2 = 0,
    'ALTER TABLE custom_dashboards ADD COLUMN lop_hoc_id INT NULL AFTER phong_id',
    'SELECT ''Column lop_hoc_id already exists in custom_dashboards'' AS message');
PREPARE stmt2 FROM @sql2; EXECUTE stmt2; DEALLOCATE PREPARE stmt2;

-- Add FK for phong_id if not exists (ON DELETE SET NULL to avoid losing dashboard when phong is deleted)
SET @fk_exists = (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
    WHERE CONSTRAINT_SCHEMA = DATABASE()
    AND TABLE_NAME = 'custom_dashboards'
    AND CONSTRAINT_NAME = 'custom_dashboards_phong_fk');
SET @sql3 = IF(@fk_exists = 0,
    'ALTER TABLE custom_dashboards ADD CONSTRAINT custom_dashboards_phong_fk FOREIGN KEY (phong_id) REFERENCES phong(id) ON DELETE SET NULL',
    'SELECT "FK custom_dashboards_phong_fk already exists" AS message');
PREPARE stmt3 FROM @sql3; EXECUTE stmt3; DEALLOCATE PREPARE stmt3;

-- Add FK for lop_hoc_id if not exists
SET @fk_exists2 = (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
    WHERE CONSTRAINT_SCHEMA = DATABASE()
    AND TABLE_NAME = 'custom_dashboards'
    AND CONSTRAINT_NAME = 'custom_dashboards_lop_hoc_fk');
SET @sql4 = IF(@fk_exists2 = 0,
    'ALTER TABLE custom_dashboards ADD CONSTRAINT custom_dashboards_lop_hoc_fk FOREIGN KEY (lop_hoc_id) REFERENCES lop_hoc(id) ON DELETE SET NULL',
    'SELECT "FK custom_dashboards_lop_hoc_fk already exists" AS message');
PREPARE stmt4 FROM @sql4; EXECUTE stmt4; DEALLOCATE PREPARE stmt4;

-- Add index for phong_id if not exists (used in filter queries)
SET @idx_exists = (SELECT COUNT(*) FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'custom_dashboards'
    AND INDEX_NAME = 'idx_dash_phong');
SET @sql5 = IF(@idx_exists = 0,
    'CREATE INDEX idx_dash_phong ON custom_dashboards(phong_id)',
    'SELECT "Index idx_dash_phong already exists" AS message');
PREPARE stmt5 FROM @sql5; EXECUTE stmt5; DEALLOCATE PREPARE stmt5;

-- Add index for lop_hoc_id if not exists
SET @idx_exists2 = (SELECT COUNT(*) FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'custom_dashboards'
    AND INDEX_NAME = 'idx_dash_lop_hoc');
SET @sql6 = IF(@idx_exists2 = 0,
    'CREATE INDEX idx_dash_lop_hoc ON custom_dashboards(lop_hoc_id)',
    'SELECT "Index idx_dash_lop_hoc already exists" AS message');
PREPARE stmt6 FROM @sql6; EXECUTE stmt6; DEALLOCATE PREPARE stmt6;

-- Add additional performance indexes for filter queries
-- Index on thiet_bi.phong_id for alert filter JOIN
SET @idx_exists3 = (SELECT COUNT(*) FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'thiet_bi'
    AND INDEX_NAME = 'idx_thiet_bi_phong_id');
SET @sql7 = IF(@idx_exists3 = 0,
    'CREATE INDEX idx_thiet_bi_phong_id ON thiet_bi(phong_id)',
    'SELECT "Index idx_thiet_bi_phong_id already exists" AS message');
PREPARE stmt7 FROM @sql7; EXECUTE stmt7; DEALLOCATE PREPARE stmt7;

-- Index on phong_nhom_thanh_vien(user_id, phong_id) for student group lookup
SET @idx_exists4 = (SELECT COUNT(*) FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'phong_nhom_thanh_vien'
    AND INDEX_NAME = 'idx_pntv_user_phong');
SET @sql8 = IF(@idx_exists4 = 0,
    'CREATE INDEX idx_pntv_user_phong ON phong_nhom_thanh_vien(user_id, phong_id)',
    'SELECT "Index idx_pntv_user_phong already exists" AS message');
PREPARE stmt8 FROM @sql8; EXECUTE stmt8; DEALLOCATE PREPARE stmt8;

-- Index on lop_hoc.giao_vien_id for teacher class lookup
SET @idx_exists5 = (SELECT COUNT(*) FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'lop_hoc'
    AND INDEX_NAME = 'idx_lop_hoc_giao_vien');
SET @sql9 = IF(@idx_exists5 = 0,
    'CREATE INDEX idx_lop_hoc_giao_vien ON lop_hoc(giao_vien_id)',
    'SELECT "Index idx_lop_hoc_giao_vien already exists" AS message');
PREPARE stmt9 FROM @sql9; EXECUTE stmt9; DEALLOCATE PREPARE stmt9;

-- Index on nguoi_dung.lop_hoc_id for student class lookup
SET @idx_exists6 = (SELECT COUNT(*) FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'nguoi_dung'
    AND INDEX_NAME = 'idx_nguoi_dung_lop_hoc');
SET @sql10 = IF(@idx_exists6 = 0,
    'CREATE INDEX idx_nguoi_dung_lop_hoc ON nguoi_dung(lop_hoc_id)',
    'SELECT "Index idx_nguoi_dung_lop_hoc already exists" AS message');
PREPARE stmt10 FROM @sql10; EXECUTE stmt10; DEALLOCATE PREPARE stmt10;

SELECT 'Migration add_dashboard_workplace_context completed' AS status;
