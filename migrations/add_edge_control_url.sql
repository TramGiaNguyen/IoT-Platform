-- Migration: Add edge_control_url column to thiet_bi
-- Idempotent: safe to run multiple times
-- Chạy thủ công nếu DB đã tồn tại trước khi có cột này trong data.sql:
-- docker exec mysql mysql -uiot -piot123 iot_data < migrations/add_edge_control_url.sql

USE iot_data;

SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'thiet_bi'
    AND COLUMN_NAME = 'edge_control_url');
SET @sql = IF(@col_exists = 0,
    'ALTER TABLE `thiet_bi` ADD COLUMN `edge_control_url` VARCHAR(512) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT ''HTTP POST relay control, e.g. http://192.168.190.171/api/v1/control''',
    'SELECT "Column edge_control_url already exists" AS message');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SELECT 'Migration add_edge_control_url completed' AS status;
