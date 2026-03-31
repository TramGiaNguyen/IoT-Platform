-- Migration: Add rule_graph column and scheduled_rules table
USE iot_data;

-- Add rule_graph column to rules table if not exists
SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS 
    WHERE TABLE_SCHEMA = 'iot_data' 
    AND TABLE_NAME = 'rules' 
    AND COLUMN_NAME = 'rule_graph');

SET @sql = IF(@col_exists = 0, 
    'ALTER TABLE rules ADD COLUMN rule_graph JSON DEFAULT NULL AFTER value',
    'SELECT "Column rule_graph already exists" AS message');

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Create scheduled_rules table if not exists
CREATE TABLE IF NOT EXISTS `scheduled_rules` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `ten_rule` VARCHAR(255) DEFAULT NULL,
  `phong_id` INT DEFAULT NULL,
  `cron_expression` VARCHAR(100) NOT NULL,
  `device_id` VARCHAR(255) NOT NULL,
  `action_command` VARCHAR(100) NOT NULL,
  `action_params` JSON DEFAULT NULL,
  `trang_thai` ENUM('enabled','disabled') DEFAULT 'enabled',
  `last_run_at` DATETIME DEFAULT NULL,
  `ngay_tao` DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_scheduled_trang_thai` (`trang_thai`),
  KEY `idx_scheduled_phong` (`phong_id`),
  CONSTRAINT `scheduled_rules_phong_fk` FOREIGN KEY (`phong_id`) REFERENCES `phong` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SELECT 'Migration completed successfully' AS status;
