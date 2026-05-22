-- Migration: Fix all FK constraints for proper CASCADE delete of rooms
-- Safe to run multiple times (idempotent)
--
-- Root cause: when deleting a room, MySQL CASCADE deletes devices (thiet_bi),
-- but khoa_du_lieu and du_lieu_thiet_bi also reference thiet_bi without CASCADE,
-- blocking the delete.

USE iot_data;

-- =============================================
-- 1. thiet_bi.phong_id -> phong(id)
-- =============================================
SET @fk = (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
    WHERE CONSTRAINT_SCHEMA=DATABASE() AND TABLE_NAME='thiet_bi'
    AND CONSTRAINT_NAME='thiet_bi_ibfk_1' AND CONSTRAINT_TYPE='FOREIGN KEY');
SET @sql = IF(@fk>0,'ALTER TABLE `thiet_bi` DROP FOREIGN KEY `thiet_bi_ibfk_1`','SELECT "thiet_bi_ibfk_1 not found"');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET @fk2 = (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
    WHERE CONSTRAINT_SCHEMA=DATABASE() AND TABLE_NAME='thiet_bi'
    AND CONSTRAINT_NAME='thiet_bi_phong_fk' AND CONSTRAINT_TYPE='FOREIGN KEY');
SET @sql2 = IF(@fk2>0,'ALTER TABLE `thiet_bi` DROP FOREIGN KEY `thiet_bi_phong_fk`','SELECT "thiet_bi_phong_fk not found"');
PREPARE s2 FROM @sql2; EXECUTE s2; DEALLOCATE PREPARE s2;

ALTER TABLE `thiet_bi` ADD CONSTRAINT `thiet_bi_phong_fk` FOREIGN KEY (`phong_id`) REFERENCES `phong`(`id`) ON DELETE CASCADE;

-- =============================================
-- 2. khoa_du_lieu.thiet_bi_id -> thiet_bi(id)
-- =============================================
SET @fk3 = (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
    WHERE CONSTRAINT_SCHEMA=DATABASE() AND TABLE_NAME='khoa_du_lieu'
    AND CONSTRAINT_NAME='khoa_du_lieu_ibfk_1' AND CONSTRAINT_TYPE='FOREIGN KEY');
SET @sql3 = IF(@fk3>0,'ALTER TABLE `khoa_du_lieu` DROP FOREIGN KEY `khoa_du_lieu_ibfk_1`','SELECT "khoa_du_lieu_ibfk_1 not found"');
PREPARE s3 FROM @sql3; EXECUTE s3; DEALLOCATE PREPARE s3;

ALTER TABLE `khoa_du_lieu` ADD CONSTRAINT `khoa_du_lieu_ibfk_1` FOREIGN KEY (`thiet_bi_id`) REFERENCES `thiet_bi`(`id`) ON DELETE CASCADE;

-- =============================================
-- 3. du_lieu_thiet_bi.thiet_bi_id -> thiet_bi(id)
-- =============================================
SET @fk4 = (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
    WHERE CONSTRAINT_SCHEMA=DATABASE() AND TABLE_NAME='du_lieu_thiet_bi'
    AND CONSTRAINT_NAME='du_lieu_thiet_bi_ibfk_1' AND CONSTRAINT_TYPE='FOREIGN KEY');
SET @sql4 = IF(@fk4>0,'ALTER TABLE `du_lieu_thiet_bi` DROP FOREIGN KEY `du_lieu_thiet_bi_ibfk_1`','SELECT "du_lieu_thiet_bi_ibfk_1 not found"');
PREPARE s4 FROM @sql4; EXECUTE s4; DEALLOCATE PREPARE s4;

ALTER TABLE `du_lieu_thiet_bi` ADD CONSTRAINT `du_lieu_thiet_bi_ibfk_1` FOREIGN KEY (`thiet_bi_id`) REFERENCES `thiet_bi`(`id`) ON DELETE CASCADE;

SELECT 'Migration fix_phong_cascade_delete completed' AS status;
