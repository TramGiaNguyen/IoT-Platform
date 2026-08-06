-- Migration: Add missing columns to standalone_configs table
-- Safe for all MySQL versions (5.5+ / 8.0 / MariaDB) - uses INFORMATION_SCHEMA
-- Purpose: Fix HTTP 500 on GET /devices/{device_id}/standalone-config
-- caused by missing board_type, orientation, server_port, etc.
--
-- This migration is idempotent: it can be run multiple times safely.
-- It checks INFORMATION_SCHEMA.COLUMNS before adding each column, so it
-- works on databases that already have some (or all) of these columns.

DELIMITER $$

DROP PROCEDURE IF EXISTS add_column_if_missing$$
CREATE PROCEDURE add_column_if_missing(
    IN p_table VARCHAR(64),
    IN p_column VARCHAR(64),
    IN p_definition TEXT
)
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = p_table
          AND COLUMN_NAME = p_column
    ) THEN
        SET @sql = CONCAT('ALTER TABLE ', p_table, ' ADD COLUMN ', p_column, ' ', p_definition);
        PREPARE stmt FROM @sql;
        EXECUTE stmt;
        DEALLOCATE PREPARE stmt;
    END IF;
END$$

DELIMITER ;

CALL add_column_if_missing('standalone_configs', 'board_type', "VARCHAR(16) NOT NULL DEFAULT 'esp32'");
CALL add_column_if_missing('standalone_configs', 'orientation', "VARCHAR(16) NOT NULL DEFAULT 'portrait'");
CALL add_column_if_missing('standalone_configs', 'server_port', "INT NOT NULL DEFAULT 80");
CALL add_column_if_missing('standalone_configs', 'server_endpoint', "VARCHAR(32) NOT NULL DEFAULT 'control'");
CALL add_column_if_missing('standalone_configs', 'ap_local_ip', "VARCHAR(45) NOT NULL DEFAULT '192.168.4.1'");
CALL add_column_if_missing('standalone_configs', 'ap_gateway', "VARCHAR(45) NOT NULL DEFAULT '192.168.4.1'");
CALL add_column_if_missing('standalone_configs', 'ap_subnet', "VARCHAR(45) NOT NULL DEFAULT '255.255.255.0'");
CALL add_column_if_missing('standalone_configs', 'device_code', "VARCHAR(64) NULL");

DROP PROCEDURE add_column_if_missing;