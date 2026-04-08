USE iot_data;

-- 1. Create lop_hoc
CREATE TABLE IF NOT EXISTS `lop_hoc` (
    `id` INT NOT NULL AUTO_INCREMENT,
    `ten_lop` VARCHAR(255) NOT NULL,
    `giao_vien_id` INT NOT NULL,
    `ngay_tao` DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    CONSTRAINT `fk_giao_vien` FOREIGN KEY (`giao_vien_id`) REFERENCES `nguoi_dung`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. Alter nguoi_dung
-- We wrap in try block conceptually, but MySQL might error if column exists. That's fine.
ALTER TABLE `nguoi_dung` ADD COLUMN `lop_hoc_id` INT DEFAULT NULL;
ALTER TABLE `nguoi_dung` ADD CONSTRAINT `fk_user_lop` FOREIGN KEY (`lop_hoc_id`) REFERENCES `lop_hoc`(`id`) ON DELETE SET NULL;

-- 3. Alter thiet_bi
ALTER TABLE `thiet_bi` ADD COLUMN `nguoi_so_huu_id` INT DEFAULT NULL;
ALTER TABLE `thiet_bi` ADD CONSTRAINT `fk_thiet_bi_owner` FOREIGN KEY (`nguoi_so_huu_id`) REFERENCES `nguoi_dung`(`id`) ON DELETE CASCADE;

-- 4. Alter rules
ALTER TABLE `rules` ADD COLUMN `nguoi_so_huu_id` INT DEFAULT NULL;
ALTER TABLE `rules` ADD CONSTRAINT `fk_rules_owner` FOREIGN KEY (`nguoi_so_huu_id`) REFERENCES `nguoi_dung`(`id`) ON DELETE CASCADE;

-- 5. Alter scheduled_rules
ALTER TABLE `scheduled_rules` ADD COLUMN `nguoi_so_huu_id` INT DEFAULT NULL;
ALTER TABLE `scheduled_rules` ADD CONSTRAINT `fk_scheduled_rules_owner` FOREIGN KEY (`nguoi_so_huu_id`) REFERENCES `nguoi_dung`(`id`) ON DELETE CASCADE;

-- 6. Assign existing items to the admin user
UPDATE `thiet_bi` SET `nguoi_so_huu_id` = (SELECT `id` FROM `nguoi_dung` WHERE `vai_tro` = 'admin' LIMIT 1);
UPDATE `rules` SET `nguoi_so_huu_id` = (SELECT `id` FROM `nguoi_dung` WHERE `vai_tro` = 'admin' LIMIT 1);
UPDATE `scheduled_rules` SET `nguoi_so_huu_id` = (SELECT `id` FROM `nguoi_dung` WHERE `vai_tro` = 'admin' LIMIT 1);

-- Force NOT NULL now that data is patched (optional but good practice, though we can leave it nullable just in case)

-- 7. Index tối ưu trang chi tiết thiết bị (GET /devices/{id}/latest)
-- Chạy một lần; nếu báo duplicate key name thì bỏ qua (đã có index).
ALTER TABLE `du_lieu_thiet_bi` ADD INDEX `idx_thiet_bi_khoa_time` (`thiet_bi_id`, `khoa`, `thoi_gian`);
