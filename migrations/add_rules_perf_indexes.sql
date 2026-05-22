-- Migration: Thêm index cho bảng rules và rule_actions để tăng tốc CRUD operations
-- Idempotent: safe to run multiple times
-- Chạy: docker exec mysql mysql -uiot -piot123 iot_data < migrations/add_rules_perf_indexes.sql

USE iot_data;

-- Index idx_rules_owner_status
SET @idx_exists = (SELECT COUNT(*) FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'rules'
    AND INDEX_NAME = 'idx_rules_owner_status');
SET @sql = IF(@idx_exists = 0,
    'ALTER TABLE rules ADD INDEX idx_rules_owner_status (nguoi_so_huu_id, trang_thai)',
    'SELECT "Index idx_rules_owner_status already exists" AS message');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Index idx_rules_status
SET @idx_exists2 = (SELECT COUNT(*) FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'rules'
    AND INDEX_NAME = 'idx_rules_status');
SET @sql2 = IF(@idx_exists2 = 0,
    'ALTER TABLE rules ADD INDEX idx_rules_status (trang_thai)',
    'SELECT "Index idx_rules_status already exists" AS message');
PREPARE stmt2 FROM @sql2; EXECUTE stmt2; DEALLOCATE PREPARE stmt2;

-- Index idx_rule_actions_rule_status
SET @idx_exists3 = (SELECT COUNT(*) FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'rule_actions'
    AND INDEX_NAME = 'idx_rule_actions_rule_status');
SET @sql3 = IF(@idx_exists3 = 0,
    'ALTER TABLE rule_actions ADD INDEX idx_rule_actions_rule_status (rule_id, delay_seconds)',
    'SELECT "Index idx_rule_actions_rule_status already exists" AS message');
PREPARE stmt3 FROM @sql3; EXECUTE stmt3; DEALLOCATE PREPARE stmt3;

SELECT 'Migration add_rules_perf_indexes completed' AS status;
