-- =========================================================
-- Migration: Tao bang nhom, nhom_thanh_vien, seed data
-- Chay tren MySQL 5.7 / Docker
-- Phien ban: dua tren schema moi (phong khong con lop_hoc_id/ten_nhom/loai_phong)
-- Idempotent: an toan khi chay nhieu lan
-- =========================================================

-- Buoc 1: Tao bang nhom (skip neu da ton tai)
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
  KEY `idx_nhom_giao_vien` (`giao_vien_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Buoc 2: Tao bang nhom_thanh_vien (skip neu da ton tai)
CREATE TABLE IF NOT EXISTS `nhom_thanh_vien` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `nhom_id` INT NOT NULL,
  `user_id` INT NOT NULL,
  `vai_tro_trong_nhom` ENUM('giao_vien','sinh_vien') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'sinh_vien',
  `ngay_tham_gia` DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_nhom_user` (`nhom_id`, `user_id`),
  KEY `idx_nhom_tv_nhom` (`nhom_id`),
  KEY `idx_nhom_tv_user` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Buoc 3: Seed bang nhom (1 nhom moi moi lop hoc, giao vien chu nhiem la giao_vien_id)
INSERT INTO nhom (ten_nhom, mo_ta, lop_hoc_id, giao_vien_id, ma_nhom, ngay_tao)
SELECT
  CONCAT('Nhom ', lh.ten_lop) AS ten_nhom,
  CONCAT('Nhom hoc tap lop ', lh.ten_lop) AS mo_ta,
  lh.id AS lop_hoc_id,
  COALESCE(lh.giao_vien_id, 1) AS giao_vien_id,
  CONCAT('NHOM_', lh.id, '_1') AS ma_nhom,
  NOW() AS ngay_tao
FROM lop_hoc lh
WHERE NOT EXISTS (SELECT 1 FROM nhom n WHERE n.lop_hoc_id = lh.id);

-- Buoc 4: Copy thanh vien cu tu bang phong_nhom_thanh_vien (neu con ton tai)
-- Bang phong khong con lop_hoc_id nen khong JOIN duoc, chi copy truc tiep
DROP PROCEDURE IF EXISTS _migrate_members;
DELIMITER //
CREATE PROCEDURE _migrate_members()
BEGIN
  DECLARE src_exists INT DEFAULT 0;
  SELECT COUNT(*) INTO src_exists FROM INFORMATION_SCHEMA.TABLES
    WHERE TABLE_SCHEMA = 'iot_data' AND TABLE_NAME = 'phong_nhom_thanh_vien';

  IF src_exists > 0 THEN
    -- Bang phong cu co: lop_hoc_id, ma_phong, loai_phong, ten_nhom
    -- Chi copy thanh vien khi con bang nguon
    INSERT INTO nhom_thanh_vien (nhom_id, user_id, vai_tro_trong_nhom, ngay_tham_gia)
    SELECT n.id, pnt.user_id, pnt.vai_tro_trong_nhom, pnt.ngay_tham_gia
    FROM phong_nhom_thanh_vien pnt
    JOIN nhom n ON n.ma_nhom = pnt.ma_phong
    WHERE pnt.loai_phong = 'nhom'
      AND NOT EXISTS (
        SELECT 1 FROM nhom_thanh_vien ntv
        WHERE ntv.nhom_id = n.id AND ntv.user_id = pnt.user_id
      );
  ELSE
    SELECT 'phong_nhom_thanh_vien already gone, skipping' AS msg;
  END IF;
END //
DELIMITER ;
CALL _migrate_members();
DROP PROCEDURE _migrate_members;

-- Buoc 5: Xoa bang phong_nhom_thanh_vien cu (neu con ton tai)
SET @exists = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES
  WHERE TABLE_SCHEMA = 'iot_data' AND TABLE_NAME = 'phong_nhom_thanh_vien');
SET @sql = IF(@exists > 0, 'DROP TABLE `phong_nhom_thanh_vien`', 'SELECT ''phong_nhom_thanh_vien already gone'' AS msg');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SELECT 'Migration split_phong_nhom completed' AS status;
