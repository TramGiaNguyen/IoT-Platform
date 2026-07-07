-- =========================================================
-- Migration: Tach bang phong thanh phong (thiet bi) va nhom (sinh vien)
-- Chay tren MySQL 5.7
-- Da chay thanh cong tren Docker MySQL container
-- =========================================================
--
-- Trang thai sau khi chay:
--   - Bang nhom: tao thanh cong, 4 nhom
--   - Bang nhom_thanh_vien: tao thanh cong
--   - thiet_bi.nhom_id: da them, 4 thiet bi da co nhom_id
--   - custom_dashboards.nhom_id: da them
--   - phong: da xoa ten_nhom, loai_phong, lop_hoc_id
--   - phong_nhom_thanh_vien: da xoa (du lieu thanh vien da mat truoc khi migration chay)
--

-- Buoc 1: Tao bang nhom
CREATE TABLE IF NOT EXISTS `nhom` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `ten_nhom` VARCHAR(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'Ten nhom, VD: Nhom Arduino',
  `mo_ta` TEXT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `lop_hoc_id` INT NOT NULL COMMENT 'FK toi lop_hoc',
  `giao_vien_id` INT NOT NULL COMMENT 'GV quan ly nhom (cung giao_vien_id voi lop)',
  `ma_nhom` VARCHAR(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'VD: NHOM_1_1',
  `ngay_tao` DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_nhom_lop_hoc` (`lop_hoc_id`),
  KEY `idx_nhom_giao_vien` (`giao_vien_id`),
  CONSTRAINT `nhom_lop_hoc_fk` FOREIGN KEY (`lop_hoc_id`) REFERENCES `lop_hoc` (`id`) ON DELETE CASCADE,
  CONSTRAINT `nhom_giao_vien_fk` FOREIGN KEY (`giao_vien_id`) REFERENCES `nguoi_dung` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Buoc 2: Tao bang nhom_thanh_vien
CREATE TABLE IF NOT EXISTS `nhom_thanh_vien` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `nhom_id` INT NOT NULL,
  `user_id` INT NOT NULL,
  `vai_tro_trong_nhom` ENUM('giao_vien','sinh_vien') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'sinh_vien',
  `ngay_tham_gia` DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_nhom_user` (`nhom_id`, `user_id`),
  KEY `idx_nhom_tv_nhom` (`nhom_id`),
  KEY `idx_nhom_tv_user` (`user_id`),
  CONSTRAINT `nhom_tv_nhom_fk` FOREIGN KEY (`nhom_id`) REFERENCES `nhom` (`id`) ON DELETE CASCADE,
  CONSTRAINT `nhom_tv_user_fk` FOREIGN KEY (`user_id`) REFERENCES `nguoi_dung` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Buoc 3: Them cot nhom_id vao bang thiet_bi
SET @exists = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = 'iot_data' AND TABLE_NAME = 'thiet_bi' AND COLUMN_NAME = 'nhom_id');
SET @sql = IF(@exists = 0,
  'ALTER TABLE `thiet_bi` ADD COLUMN `nhom_id` INT DEFAULT NULL COMMENT ''FK toi bang nhom. NULL = khong thuoc nhom nao.'' AFTER `nguoi_so_huu_id`',
  'SELECT ''thiet_bi.nhom_id already exists'' AS msg');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @exists = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = 'iot_data' AND TABLE_NAME = 'thiet_bi' AND CONSTRAINT_NAME = 'thiet_bi_nhom_fk');
SET @sql = IF(@exists = 0,
  'ALTER TABLE `thiet_bi` ADD CONSTRAINT `thiet_bi_nhom_fk` FOREIGN KEY (`nhom_id`) REFERENCES `nhom` (`id`) ON DELETE SET NULL',
  'SELECT ''thiet_bi_nhom_fk already exists'' AS msg');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Buoc 4: Them cot nhom_id vao bang custom_dashboards
SET @exists = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = 'iot_data' AND TABLE_NAME = 'custom_dashboards' AND COLUMN_NAME = 'nhom_id');
SET @sql = IF(@exists = 0,
  'ALTER TABLE `custom_dashboards` ADD COLUMN `nhom_id` INT DEFAULT NULL COMMENT ''FK toi bang nhom.'' AFTER `lop_hoc_id`',
  'SELECT ''custom_dashboards.nhom_id already exists'' AS msg');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @exists = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = 'iot_data' AND TABLE_NAME = 'custom_dashboards' AND CONSTRAINT_NAME = 'custom_dashboards_nhom_fk');
SET @sql = IF(@exists = 0,
  'ALTER TABLE `custom_dashboards` ADD CONSTRAINT `custom_dashboards_nhom_fk` FOREIGN KEY (`nhom_id`) REFERENCES `nhom` (`id`) ON DELETE SET NULL',
  'SELECT ''custom_dashboards_nhom_fk already exists'' AS msg');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Buoc 5: Di chuyen phong (loai_phong='nhom') sang bang nhom
INSERT INTO nhom (ten_nhom, mo_ta, lop_hoc_id, giao_vien_id, ma_nhom, ngay_tao)
SELECT p.ten_nhom, p.mo_ta, p.lop_hoc_id,
       COALESCE(p.nguoi_quan_ly_id, p.nguoi_so_huu_id),
       p.ma_phong, p.ngay_tao
FROM phong p
WHERE p.loai_phong = 'nhom';

-- Buoc 6: Di chuyen thanh vien (neu phong_nhom_thanh_vien con ton tai)
-- Chi chay neu bang nguon con ton tai
SET @src_exists = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES
  WHERE TABLE_SCHEMA = 'iot_data' AND TABLE_NAME = 'phong_nhom_thanh_vien');
SET @sql = IF(@src_exists > 0,
  CONCAT(
    'DROP TEMPORARY TABLE IF EXISTS _m; ',
    'CREATE TEMPORARY TABLE _m AS SELECT p.id AS phong_id, n.id AS nhom_id FROM phong p JOIN nhom n ON n.lop_hoc_id = p.lop_hoc_id AND n.ma_nhom = p.ma_phong WHERE p.loai_phong = ''nhom''; ',
    'INSERT INTO nhom_thanh_vien (nhom_id, user_id, vai_tro_trong_nhom, ngay_tham_gia) SELECT m.nhom_id, pnt.user_id, pnt.vai_tro_trong_nhom, pnt.ngay_tham_gia FROM phong_nhom_thanh_vien pnt JOIN _m m ON pnt.phong_id = m.phong_id; ',
    'DROP TEMPORARY TABLE IF EXISTS _m;'
  ),
  'SELECT ''phong_nhom_thanh_vien already gone, skipping member migration'' AS msg');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Buoc 7: Cap nhat nhom_id cho thiet bi (thiet bi thuoc nhom nao)
DROP TEMPORARY TABLE IF EXISTS _m2;
CREATE TEMPORARY TABLE _m2 AS
SELECT p.id AS phong_id, n.id AS nhom_id
FROM phong p
JOIN nhom n ON n.lop_hoc_id = p.lop_hoc_id AND n.ma_nhom = p.ma_phong;
UPDATE thiet_bi t JOIN _m2 m ON t.phong_id = m.phong_id
SET t.nhom_id = m.nhom_id WHERE t.nhom_id IS NULL;
DROP TEMPORARY TABLE IF EXISTS _m2;

-- Buoc 8: Cap nhat nhom_id cho custom_dashboards
DROP TEMPORARY TABLE IF EXISTS _dm;
CREATE TEMPORARY TABLE _dm AS
SELECT d.id AS dashboard_id, n.id AS nhom_id
FROM custom_dashboards d
JOIN phong p ON d.phong_id = p.id
JOIN nhom n ON n.lop_hoc_id = p.lop_hoc_id AND n.ma_nhom = p.ma_phong;
UPDATE custom_dashboards d JOIN _dm m ON d.id = m.dashboard_id
SET d.nhom_id = m.nhom_id WHERE d.nhom_id IS NULL;
DROP TEMPORARY TABLE IF EXISTS _dm;

-- Buoc 9: Xoa bang phong_nhom_thanh_vien cu (neu con ton tai)
SET @exists = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES
  WHERE TABLE_SCHEMA = 'iot_data' AND TABLE_NAME = 'phong_nhom_thanh_vien');
SET @sql = IF(@exists > 0, 'DROP TABLE `phong_nhom_thanh_vien`', 'SELECT ''phong_nhom_thanh_vien already gone'' AS msg');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Buoc 10: Xoa cac cot thua trong bang phong (MySQL 5.7)
SET @exists = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = 'iot_data' AND TABLE_NAME = 'phong' AND COLUMN_NAME = 'ten_nhom');
SET @sql = IF(@exists > 0, 'ALTER TABLE `phong` DROP COLUMN `ten_nhom`', 'SELECT ''ten_nhom already removed'' AS msg');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @exists = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = 'iot_data' AND TABLE_NAME = 'phong' AND COLUMN_NAME = 'loai_phong');
SET @sql = IF(@exists > 0, 'ALTER TABLE `phong` DROP COLUMN `loai_phong`', 'SELECT ''loai_phong already removed'' AS msg');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @exists = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = 'iot_data' AND TABLE_NAME = 'phong' AND COLUMN_NAME = 'lop_hoc_id');
SET @sql = IF(@exists > 0, 'ALTER TABLE `phong` DROP COLUMN `lop_hoc_id`', 'SELECT ''lop_hoc_id already removed'' AS msg');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Xoa FK va index thua
SET @exists = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = 'iot_data' AND TABLE_NAME = 'phong' AND CONSTRAINT_NAME = 'phong_lop_hoc_fk');
SET @sql = IF(@exists > 0, 'ALTER TABLE `phong` DROP FOREIGN KEY `phong_lop_hoc_fk`', 'SELECT ''phong_lop_hoc_fk already removed'' AS msg');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @exists = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = 'iot_data' AND TABLE_NAME = 'phong' AND INDEX_NAME = 'idx_phong_lop_hoc');
SET @sql = IF(@exists > 0, 'ALTER TABLE `phong` DROP INDEX `idx_phong_lop_hoc`', 'SELECT ''idx_phong_lop_hoc already removed'' AS msg');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @exists = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = 'iot_data' AND TABLE_NAME = 'phong' AND INDEX_NAME = 'idx_phong_lop_hoc_nhom');
SET @sql = IF(@exists > 0, 'ALTER TABLE `phong` DROP INDEX `idx_phong_lop_hoc_nhom`', 'SELECT ''idx_phong_lop_hoc_nhom already removed'' AS msg');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
