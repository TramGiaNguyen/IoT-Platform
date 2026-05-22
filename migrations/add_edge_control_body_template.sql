-- Migration: Add edge_control_body_template column to thiet_bi
-- Idempotent: safe to run multiple times
-- Chạy nếu DB đã tồn tại:
-- docker exec mysql mysql -uiot -piot123 iot_data < migrations/add_edge_control_body_template.sql

USE iot_data;

SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'thiet_bi'
    AND COLUMN_NAME = 'edge_control_body_template');
SET @sql = IF(@col_exists = 0,
    'ALTER TABLE `thiet_bi` ADD COLUMN `edge_control_body_template` MEDIUMTEXT COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT ''JSON template for POST body; use {{relay}} {{state}} {{cmd}} on/off''',
    'SELECT "Column edge_control_body_template already exists" AS message');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SELECT 'Migration add_edge_control_body_template completed' AS status;
