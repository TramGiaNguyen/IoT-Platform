-- Migration: Add group workplace (phòng nhóm) for class/student/teacher
-- Date: 2026-06-17 (rev 2: cho phep 1 lop co NHIỀU nhóm, mỗi nhóm tối đa 5 SV)
-- Idempotent: safe to run multiple times

USE iot_data;

-- 1. Them cot loai_phong vao phong (phan biet phong ca nhan vs phong nhom)
SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'phong'
    AND COLUMN_NAME = 'loai_phong');
SET @sql = IF(@col_exists = 0,
    "ALTER TABLE phong ADD COLUMN loai_phong ENUM('ca_nhan','nhom') NOT NULL DEFAULT 'ca_nhan' AFTER mo_ta",
    'SELECT "Column loai_phong already exists in phong" AS message');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 2. Them cot lop_hoc_id vao phong (lien ket giua lop hoc va cac phong nhom)
SET @col_exists2 = (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'phong'
    AND COLUMN_NAME = 'lop_hoc_id');
SET @sql2 = IF(@col_exists2 = 0,
    'ALTER TABLE phong ADD COLUMN lop_hoc_id INT NULL AFTER loai_phong',
    'SELECT "Column lop_hoc_id already exists in phong" AS message');
PREPARE stmt2 FROM @sql2; EXECUTE stmt2; DEALLOCATE PREPARE stmt2;

-- 3. Them cot ten_nhom vao phong (dat ten cho nhom, VD: "Nhom 1", "Nhom Arduino")
SET @col_exists3 = (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'phong'
    AND COLUMN_NAME = 'ten_nhom');
SET @sql3 = IF(@col_exists3 = 0,
    'ALTER TABLE phong ADD COLUMN ten_nhom VARCHAR(100) NULL AFTER ten_phong',
    'SELECT "Column ten_nhom already exists in phong" AS message');
PREPARE stmt3 FROM @sql3; EXECUTE stmt3; DEALLOCATE PREPARE stmt3;

-- 4. FK tu phong.lop_hoc_id -> lop_hoc.id (ON DELETE CASCADE)
SET @fk_exists = (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
    WHERE CONSTRAINT_SCHEMA = DATABASE()
    AND TABLE_NAME = 'phong'
    AND CONSTRAINT_NAME = 'phong_lop_hoc_fk');
SET @sql4 = IF(@fk_exists = 0,
    'ALTER TABLE phong ADD CONSTRAINT phong_lop_hoc_fk FOREIGN KEY (lop_hoc_id) REFERENCES lop_hoc(id) ON DELETE CASCADE',
    'SELECT "FK phong_lop_hoc_fk already exists" AS message');
PREPARE stmt4 FROM @sql4; EXECUTE stmt4; DEALLOCATE PREPARE stmt4;

-- 5. Index cho phong.lop_hoc_id
SET @idx_exists = (SELECT COUNT(*) FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'phong'
    AND INDEX_NAME = 'idx_phong_lop_hoc');
SET @sql5 = IF(@idx_exists = 0,
    'CREATE INDEX idx_phong_lop_hoc ON phong(lop_hoc_id)',
    'SELECT "Index idx_phong_lop_hoc already exists" AS message');
PREPARE stmt5 FROM @sql5; EXECUTE stmt5; DEALLOCATE PREPARE stmt5;

-- 6. Index phu idx_phong_lop_hoc_nhom (cho query nhanh theo (lop_hoc_id, loai_phong))
SET @idx2_exists = (SELECT COUNT(*) FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'phong'
    AND INDEX_NAME = 'idx_phong_lop_hoc_nhom');
SET @sql6 = IF(@idx2_exists = 0,
    'CREATE INDEX idx_phong_lop_hoc_nhom ON phong(lop_hoc_id, loai_phong)',
    'SELECT "Index idx_phong_lop_hoc_nhom already exists" AS message');
PREPARE stmt6 FROM @sql6; EXECUTE stmt6; DEALLOCATE PREPARE stmt6;

-- 7. Xoa unique key cu uk_phong_lop_nhom (cho phep 1 lop co nhieu nhom)
--    Chi xoa neu no con ton tai (idempotent cho ca truong hop migration cu)
SET @uk_exists = (SELECT COUNT(*) FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'phong'
    AND INDEX_NAME = 'uk_phong_lop_nhom');
SET @sql7 = IF(@uk_exists > 0,
    'ALTER TABLE phong DROP INDEX uk_phong_lop_nhom',
    'SELECT "Index uk_phong_lop_nhom not present (already removed)" AS message');
PREPARE stmt7 FROM @sql7; EXECUTE stmt7; DEALLOCATE PREPARE stmt7;

-- 8. Bang thanh vien phong nhom (ghi nhan thanh vien sinh vien trong moi nhom)
CREATE TABLE IF NOT EXISTS phong_nhom_thanh_vien (
  id INT NOT NULL AUTO_INCREMENT,
  phong_id INT NOT NULL,
  user_id INT NOT NULL,
  vai_tro_trong_nhom ENUM('giao_vien','sinh_vien') NOT NULL DEFAULT 'sinh_vien',
  ngay_tham_gia DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_phong_user (phong_id, user_id),
  KEY idx_user (user_id),
  KEY idx_phong (phong_id),
  CONSTRAINT phong_nhom_tv_phong_fk FOREIGN KEY (phong_id) REFERENCES phong(id) ON DELETE CASCADE,
  CONSTRAINT phong_nhom_tv_user_fk FOREIGN KEY (user_id) REFERENCES nguoi_dung(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SELECT 'Migration add_group_workplace (rev 2 - multi groups per class) completed' AS status;
