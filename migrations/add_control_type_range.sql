-- Migration: Add 'range' value to control_lines.control_type ENUM (Núm vặn 0-100)
-- Idempotent: safe to run multiple times
-- Chạy nếu DB đã tồn tại trước khi có 'range' trong data.sql:
-- docker exec -i mysql mysql -uiot -piot123 iot_data < migrations/add_control_type_range.sql

USE iot_data;

-- MODIFY COLUMN trên ENUM là no-op về data nếu đã chứa 'range'.
-- Check COLUMN_TYPE để idempotent: nếu đã có 'range' thì bỏ qua.
SET @col_type = (
    SELECT COLUMN_TYPE FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'control_lines'
      AND COLUMN_NAME = 'control_type'
);

SELECT
    CASE
        WHEN @col_type IS NULL THEN 'Column control_lines.control_type not found — abort'
        WHEN LOCATE('range', @col_type) > 0 THEN 'control_lines.control_type already supports range — no change'
        ELSE 'Will ALTER to add range'
    END AS check_result;

-- Chỉ ALTER khi cột tồn tại và chưa có 'range'.
SET @sql = IF(
    @col_type IS NOT NULL AND LOCATE('range', @col_type) = 0,
    "ALTER TABLE `control_lines` MODIFY COLUMN `control_type` ENUM('toggle', 'three_way', 'momentary', 'on_off', 'range') NOT NULL DEFAULT 'on_off' COMMENT 'toggle=Công tắc gạt 3 trạng thái, momentary=Công tắc hành trình nhấn thả, on_off=Công tắc bật tắt, range=Núm vặn 0-100'",
    'SELECT ''skipped'''
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SELECT 'Migration add_control_type_range completed' AS status;