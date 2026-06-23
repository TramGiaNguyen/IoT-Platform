USE iot_data;

-- =========================================================
-- Migration base: creates lop_hoc, owner FKs, performance indexes
-- Idempotent: all operations check IF NOT EXISTS / IF column exists
-- =========================================================

-- 1. Create lop_hoc
CREATE TABLE IF NOT EXISTS `lop_hoc` (
    `id` INT NOT NULL AUTO_INCREMENT,
    `ten_lop` VARCHAR(255) NOT NULL,
    `giao_vien_id` INT NOT NULL,
    `ngay_tao` DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    CONSTRAINT `lop_hoc_giao_vien_fk` FOREIGN KEY (`giao_vien_id`) REFERENCES `nguoi_dung`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. Alter nguoi_dung — add lop_hoc_id if not exists
SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'nguoi_dung' AND COLUMN_NAME = 'lop_hoc_id');
SET @sql = IF(@col_exists = 0,
    'ALTER TABLE `nguoi_dung` ADD COLUMN `lop_hoc_id` INT DEFAULT NULL',
    'SELECT "Column lop_hoc_id already exists" AS message');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @fk_exists = (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
    WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'nguoi_dung' AND CONSTRAINT_NAME = 'nguoi_dung_lop_hoc_fk');
SET @sql2 = IF(@fk_exists = 0,
    'ALTER TABLE `nguoi_dung` ADD CONSTRAINT `nguoi_dung_lop_hoc_fk` FOREIGN KEY (`lop_hoc_id`) REFERENCES `lop_hoc`(`id`) ON DELETE SET NULL',
    'SELECT "FK nguoi_dung_lop_hoc_fk already exists" AS message');
PREPARE stmt2 FROM @sql2; EXECUTE stmt2; DEALLOCATE PREPARE stmt2;

-- 3. Alter thiet_bi — add nguoi_so_huu_id if not exists
SET @col_exists2 = (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'thiet_bi' AND COLUMN_NAME = 'nguoi_so_huu_id');
SET @sql3 = IF(@col_exists2 = 0,
    'ALTER TABLE `thiet_bi` ADD COLUMN `nguoi_so_huu_id` INT DEFAULT NULL',
    'SELECT "Column nguoi_so_huu_id already exists in thiet_bi" AS message');
PREPARE stmt3 FROM @sql3; EXECUTE stmt3; DEALLOCATE PREPARE stmt3;

SET @fk_exists2 = (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
    WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'thiet_bi' AND CONSTRAINT_NAME = 'thiet_bi_nguoi_so_huu_fk');
SET @sql4 = IF(@fk_exists2 = 0,
    'ALTER TABLE `thiet_bi` ADD CONSTRAINT `thiet_bi_nguoi_so_huu_fk` FOREIGN KEY (`nguoi_so_huu_id`) REFERENCES `nguoi_dung`(`id`) ON DELETE CASCADE',
    'SELECT "FK thiet_bi_nguoi_so_huu_fk already exists" AS message');
PREPARE stmt4 FROM @sql4; EXECUTE stmt4; DEALLOCATE PREPARE stmt4;

-- 4. Alter rules — add nguoi_so_huu_id if not exists
SET @col_exists3 = (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'rules' AND COLUMN_NAME = 'nguoi_so_huu_id');
SET @sql5 = IF(@col_exists3 = 0,
    'ALTER TABLE `rules` ADD COLUMN `nguoi_so_huu_id` INT DEFAULT NULL',
    'SELECT "Column nguoi_so_huu_id already exists in rules" AS message');
PREPARE stmt5 FROM @sql5; EXECUTE stmt5; DEALLOCATE PREPARE stmt5;

SET @fk_exists3 = (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
    WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'rules' AND CONSTRAINT_NAME = 'rules_nguoi_so_huu_fk');
SET @sql6 = IF(@fk_exists3 = 0,
    'ALTER TABLE `rules` ADD CONSTRAINT `rules_nguoi_so_huu_fk` FOREIGN KEY (`nguoi_so_huu_id`) REFERENCES `nguoi_dung`(`id`) ON DELETE CASCADE',
    'SELECT "FK rules_nguoi_so_huu_fk already exists" AS message');
PREPARE stmt6 FROM @sql6; EXECUTE stmt6; DEALLOCATE PREPARE stmt6;

-- 5. Alter scheduled_rules — add nguoi_so_huu_id if not exists
SET @col_exists4 = (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'scheduled_rules' AND COLUMN_NAME = 'nguoi_so_huu_id');
SET @sql7 = IF(@col_exists4 = 0,
    'ALTER TABLE `scheduled_rules` ADD COLUMN `nguoi_so_huu_id` INT DEFAULT NULL',
    'SELECT "Column nguoi_so_huu_id already exists in scheduled_rules" AS message');
PREPARE stmt7 FROM @sql7; EXECUTE stmt7; DEALLOCATE PREPARE stmt7;

SET @fk_exists4 = (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
    WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'scheduled_rules' AND CONSTRAINT_NAME = 'scheduled_rules_nguoi_so_huu_fk');
SET @sql8 = IF(@fk_exists4 = 0,
    'ALTER TABLE `scheduled_rules` ADD CONSTRAINT `scheduled_rules_nguoi_so_huu_fk` FOREIGN KEY (`nguoi_so_huu_id`) REFERENCES `nguoi_dung`(`id`) ON DELETE CASCADE',
    'SELECT "FK scheduled_rules_nguoi_so_huu_fk already exists" AS message');
PREPARE stmt8 FROM @sql8; EXECUTE stmt8; DEALLOCATE PREPARE stmt8;

-- 6. Assign existing items to admin user
UPDATE `thiet_bi` SET `nguoi_so_huu_id` = (SELECT `id` FROM `nguoi_dung` WHERE `vai_tro` = 'admin' LIMIT 1) WHERE `nguoi_so_huu_id` IS NULL;
UPDATE `rules` SET `nguoi_so_huu_id` = (SELECT `id` FROM `nguoi_dung` WHERE `vai_tro` = 'admin' LIMIT 1) WHERE `nguoi_so_huu_id` IS NULL;
UPDATE `scheduled_rules` SET `nguoi_so_huu_id` = (SELECT `id` FROM `nguoi_dung` WHERE `vai_tro` = 'admin' LIMIT 1) WHERE `nguoi_so_huu_id` IS NULL;

-- 7. Index tối ưu trang chi tiết thiết bị
SET @idx_exists = (SELECT COUNT(*) FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'du_lieu_thiet_bi' AND INDEX_NAME = 'idx_thiet_bi_khoa_time');
SET @sql9 = IF(@idx_exists = 0,
    'ALTER TABLE `du_lieu_thiet_bi` ADD INDEX `idx_thiet_bi_khoa_time` (`thiet_bi_id`, `khoa`, `thoi_gian`)',
    'SELECT "Index idx_thiet_bi_khoa_time already exists" AS message');
PREPARE stmt9 FROM @sql9; EXECUTE stmt9; DEALLOCATE PREPARE stmt9;

-- =========================================================
-- 8. Group workplace (phòng nhóm) — 1 lớp có NHIỀU nhóm, mỗi nhóm tối đa 5 SV
-- =========================================================

-- 8.1. Them cot loai_phong vao phong
SET @col_exists5 = (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'phong' AND COLUMN_NAME = 'loai_phong');
SET @sql10 = IF(@col_exists5 = 0,
    "ALTER TABLE `phong` ADD COLUMN `loai_phong` ENUM('ca_nhan','nhom') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'ca_nhan' COMMENT 'ca_nhan=phong rieng, nhom=phong nhom cua lop (1 lop co the co nhieu nhom)' AFTER `mo_ta`",
    'SELECT "Column loai_phong already exists in phong" AS message');
PREPARE stmt10 FROM @sql10; EXECUTE stmt10; DEALLOCATE PREPARE stmt10;

-- 8.2. Them cot lop_hoc_id vao phong
SET @col_exists6 = (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'phong' AND COLUMN_NAME = 'lop_hoc_id');
SET @sql11 = IF(@col_exists6 = 0,
    'ALTER TABLE `phong` ADD COLUMN `lop_hoc_id` INT DEFAULT NULL COMMENT ''FK toi lop_hoc (chi dung cho loai_phong=nhom)'' AFTER `loai_phong`',
    'SELECT "Column lop_hoc_id already exists in phong" AS message');
PREPARE stmt11 FROM @sql11; EXECUTE stmt11; DEALLOCATE PREPARE stmt11;

-- 8.3. Them cot ten_nhom vao phong
SET @col_exists7 = (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'phong' AND COLUMN_NAME = 'ten_nhom');
SET @sql12 = IF(@col_exists7 = 0,
    'ALTER TABLE `phong` ADD COLUMN `ten_nhom` VARCHAR(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT ''Ten nhom lam viec (chi dung cho loai_phong=nhom)'' AFTER `ten_phong`',
    'SELECT "Column ten_nhom already exists in phong" AS message');
PREPARE stmt12 FROM @sql12; EXECUTE stmt12; DEALLOCATE PREPARE stmt12;

-- 8.4. Index cho phong.lop_hoc_id
SET @idx_exists2 = (SELECT COUNT(*) FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'phong' AND INDEX_NAME = 'idx_phong_lop_hoc');
SET @sql13 = IF(@idx_exists2 = 0,
    'CREATE INDEX `idx_phong_lop_hoc` ON `phong` (`lop_hoc_id`)',
    'SELECT "Index idx_phong_lop_hoc already exists" AS message');
PREPARE stmt13 FROM @sql13; EXECUTE stmt13; DEALLOCATE PREPARE stmt13;

-- 8.5. Index phu idx_phong_lop_hoc_nhom (cho query theo (lop_hoc_id, loai_phong))
SET @idx_exists3 = (SELECT COUNT(*) FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'phong' AND INDEX_NAME = 'idx_phong_lop_hoc_nhom');
SET @sql14 = IF(@idx_exists3 = 0,
    'CREATE INDEX `idx_phong_lop_hoc_nhom` ON `phong` (`lop_hoc_id`, `loai_phong`)',
    'SELECT "Index idx_phong_lop_hoc_nhom already exists" AS message');
PREPARE stmt14 FROM @sql14; EXECUTE stmt14; DEALLOCATE PREPARE stmt14;

-- 8.6. Xoa unique key cu uk_phong_lop_nhom (1 lop co the co NHIEU nhom)
SET @uk_exists = (SELECT COUNT(*) FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'phong' AND INDEX_NAME = 'uk_phong_lop_nhom');
SET @sql15 = IF(@uk_exists > 0,
    'ALTER TABLE `phong` DROP INDEX `uk_phong_lop_nhom`',
    'SELECT "Index uk_phong_lop_nhom not present (already removed)" AS message');
PREPARE stmt15 FROM @sql15; EXECUTE stmt15; DEALLOCATE PREPARE stmt15;

-- 8.7. FK phong.lop_hoc_id -> lop_hoc.id (ON DELETE CASCADE)
SET @fk_exists5 = (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
    WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'phong' AND CONSTRAINT_NAME = 'phong_lop_hoc_fk');
SET @sql16 = IF(@fk_exists5 = 0,
    'ALTER TABLE `phong` ADD CONSTRAINT `phong_lop_hoc_fk` FOREIGN KEY (`lop_hoc_id`) REFERENCES `lop_hoc`(`id`) ON DELETE CASCADE',
    'SELECT "FK phong_lop_hoc_fk already exists" AS message');
PREPARE stmt16 FROM @sql16; EXECUTE stmt16; DEALLOCATE PREPARE stmt16;

-- 8.8. Bang thanh vien phong nhom
CREATE TABLE IF NOT EXISTS `phong_nhom_thanh_vien` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `phong_id` INT NOT NULL,
  `user_id` INT NOT NULL,
  `vai_tro_trong_nhom` ENUM('giao_vien','sinh_vien') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'sinh_vien',
  `ngay_tham_gia` DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_phong_user` (`phong_id`, `user_id`),
  KEY `idx_user` (`user_id`),
  KEY `idx_phong` (`phong_id`),
  CONSTRAINT `phong_nhom_tv_phong_fk` FOREIGN KEY (`phong_id`) REFERENCES `phong` (`id`) ON DELETE CASCADE,
  CONSTRAINT `phong_nhom_tv_user_fk` FOREIGN KEY (`user_id`) REFERENCES `nguoi_dung` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SELECT 'Migration migration.sql completed (rev 2: multi-groups-per-class)' AS status;
