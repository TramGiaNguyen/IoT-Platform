-- Su dung chung schema MySQL voi he thong chinh (iot_data)
CREATE DATABASE IF NOT EXISTS iot_data
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE iot_data;

-- =========================================================
-- Bang nguoi_dung (user he thong)
-- =========================================================
CREATE TABLE `nguoi_dung` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `ten` VARCHAR(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `email` VARCHAR(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `mat_khau_hash` TEXT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `vai_tro` ENUM('admin','teacher','student') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT 'student',
  `lop_hoc_id` INT DEFAULT NULL,
  `ngay_tao` DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `email` (`email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =========================================================
-- Bang lop_hoc (lop hoc do teacher quan ly)
-- =========================================================
CREATE TABLE `lop_hoc` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `ten_lop` VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `giao_vien_id` INT NOT NULL,
  `ngay_tao` DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_giao_vien` (`giao_vien_id`),
  CONSTRAINT `lop_hoc_giao_vien_fk` FOREIGN KEY (`giao_vien_id`) REFERENCES `nguoi_dung` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE `nguoi_dung`
  ADD CONSTRAINT `nguoi_dung_lop_hoc_fk` FOREIGN KEY (`lop_hoc_id`) REFERENCES `lop_hoc` (`id`) ON DELETE SET NULL;

-- Seed user admin mac dinh
INSERT INTO `nguoi_dung` (`ten`, `email`, `mat_khau_hash`, `vai_tro`)
VALUES (
  'tramgianguyen',
  '22050026@student.bdu.edu.vn',
  '$2b$12$hLW99Na4HJueC6LoUoczT.6sMtexA5y6vUUkeVMxQ5t.L9OFUp6Te',
  'admin'
);

-- =========================================================
-- Bang nhom (nhom sinh vien trong lop hoc)
-- Bang nay thay the phong voi loai_phong='nhom' truoc day
-- =========================================================
CREATE TABLE `nhom` (
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

-- =========================================================
-- Bang thanh vien nhom
-- Bang nay thay the bang phong_nhom_thanh_vien cu
-- =========================================================
CREATE TABLE `nhom_thanh_vien` (
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

-- =========================================================
-- Bang quyen_trang (page permissions per user)
-- =========================================================
CREATE TABLE `quyen_trang` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `nguoi_dung_id` INT NOT NULL,
  `trang` VARCHAR(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `ngay_tao` DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_user_page` (`nguoi_dung_id`, `trang`),
  CONSTRAINT `quyen_trang_ibfk_1` FOREIGN KEY (`nguoi_dung_id`) REFERENCES `nguoi_dung` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =========================================================
-- Bang phong (phong vat ly de gan thiet bi)
-- Chi con phong ca nhan, khong con loai_phong='nhom' nua
-- =========================================================
CREATE TABLE `phong` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `ten_phong` VARCHAR(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `mo_ta` TEXT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `vi_tri` VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `nguoi_quan_ly_id` INT DEFAULT NULL,
  `nguoi_so_huu_id` INT DEFAULT NULL COMMENT 'Owner cua phong (admin/teacher/student)',
  `ngay_tao` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `ma_phong` VARCHAR(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `nguoi_quan_ly_id` (`nguoi_quan_ly_id`),
  KEY `idx_nguoi_so_huu` (`nguoi_so_huu_id`),
  CONSTRAINT `phong_ibfk_1` FOREIGN KEY (`nguoi_quan_ly_id`) REFERENCES `nguoi_dung` (`id`),
  CONSTRAINT `phong_nguoi_so_huu_fk` FOREIGN KEY (`nguoi_so_huu_id`) REFERENCES `nguoi_dung` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =========================================================
-- Bang thiet_bi (registry thiet bi)
-- =========================================================
CREATE TABLE `thiet_bi` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `ma_thiet_bi` VARCHAR(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `ten_thiet_bi` VARCHAR(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `loai_thiet_bi` VARCHAR(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `phong_id` INT DEFAULT NULL,
  `trang_thai` ENUM('online','offline','error') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT 'offline',
  `last_seen` TIMESTAMP NULL DEFAULT NULL,
  `ip_address` VARCHAR(45) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `mac_address` VARCHAR(17) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `is_active` TINYINT(1) DEFAULT '1',
  `ngay_dang_ky` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `health_status` ENUM('ok','misconfigured') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'ok',
  -- New columns for Registration-First flow
  `secret_key` VARCHAR(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `http_api_key` VARCHAR(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `protocol` ENUM('mqtt','http','both') COLLATE utf8mb4_unicode_ci DEFAULT 'mqtt',
  `device_type` ENUM('sensor','controller','gateway') COLLATE utf8mb4_unicode_ci DEFAULT 'sensor',
  `provisioned_at` DATETIME DEFAULT NULL,
  `last_auth_at` DATETIME DEFAULT NULL,
  `edge_control_url` VARCHAR(512) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'HTTP POST relay control, e.g. http://192.168.190.171/api/v1/control',
  `edge_control_body_template` MEDIUMTEXT COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'JSON template {{relay}} {{state}} {{cmd}}',
  `nguoi_so_huu_id` INT DEFAULT NULL,
  `nhom_id` INT DEFAULT NULL COMMENT 'FK toi bang nhom. NULL = khong thuoc nhom nao.',
  PRIMARY KEY (`id`),
  UNIQUE KEY `ma_thiet_bi` (`ma_thiet_bi`),
  KEY `node_id` (`phong_id`),
  KEY `idx_last_seen` (`last_seen`),
  KEY `idx_trang_thai` (`trang_thai`),
  KEY `idx_phong_trang_thai` (`phong_id`,`trang_thai`),
  KEY `idx_nguoi_so_huu` (`nguoi_so_huu_id`),
  KEY `idx_thiet_bi_nhom` (`nhom_id`),
  CONSTRAINT `thiet_bi_phong_fk` FOREIGN KEY (`phong_id`) REFERENCES `phong` (`id`) ON DELETE CASCADE,
  CONSTRAINT `thiet_bi_nguoi_so_huu_fk` FOREIGN KEY (`nguoi_so_huu_id`) REFERENCES `nguoi_dung` (`id`) ON DELETE SET NULL,
  CONSTRAINT `thiet_bi_nhom_fk` FOREIGN KEY (`nhom_id`) REFERENCES `nhom` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =========================================================
-- Bang device_profiles (cau hinh transform theo device/type)
-- =========================================================
CREATE TABLE `device_profiles` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `ten_profile` VARCHAR(255) DEFAULT NULL,
  `device_id` VARCHAR(255) DEFAULT NULL,
  `device_type` VARCHAR(100) DEFAULT NULL,
  `config` JSON NOT NULL,
  `ngay_tao` DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_device_id` (`device_id`),
  KEY `idx_device_type` (`device_type`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =========================================================
-- Bang khoa_du_lieu (cac key du lieu cam bien)
-- =========================================================
CREATE TABLE `khoa_du_lieu` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `thiet_bi_id` INT NOT NULL,
  `khoa` VARCHAR(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `don_vi` VARCHAR(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `mo_ta` TEXT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  PRIMARY KEY (`id`),
  KEY `thiet_bi_id` (`thiet_bi_id`),
  CONSTRAINT `khoa_du_lieu_ibfk_1` FOREIGN KEY (`thiet_bi_id`) REFERENCES `thiet_bi` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =========================================================
-- Bang du_lieu_thiet_bi (time-series du lieu)
-- =========================================================
CREATE TABLE `du_lieu_thiet_bi` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `thiet_bi_id` INT NOT NULL,
  `khoa` VARCHAR(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `gia_tri` TEXT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `thoi_gian` DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `thiet_bi_id` (`thiet_bi_id`,`thoi_gian`),
  KEY `idx_device_time` (`thiet_bi_id`,`thoi_gian`),
  -- Toi uu GET /devices/{id}/latest (GROUP BY khoa, MAX(thoi_gian) theo thiet_bi_id)
  KEY `idx_thiet_bi_khoa_time` (`thiet_bi_id`,`khoa`,`thoi_gian`),
  KEY `idx_key_time` (`khoa`,`thoi_gian`),
  KEY `idx_thoi_gian` (`thoi_gian`),
  CONSTRAINT `du_lieu_thiet_bi_ibfk_1` FOREIGN KEY (`thiet_bi_id`) REFERENCES `thiet_bi` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =========================================================
-- Bang rules (dieu kien IF)
-- =========================================================
CREATE TABLE `rules` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `ten_rule` VARCHAR(255) DEFAULT NULL,
  `phong_id` INT NOT NULL,
  `condition_device_id` VARCHAR(255) NOT NULL,
  `conditions` JSON DEFAULT NULL,
  `field` VARCHAR(100) NOT NULL,
  `operator` VARCHAR(10) NOT NULL,
  `value` VARCHAR(100) NOT NULL,
  `rule_graph` JSON DEFAULT NULL,
  `muc_do_uu_tien` INT DEFAULT '1',
  `trang_thai` ENUM('enabled','disabled') DEFAULT 'enabled',
  `nguoi_so_huu_id` INT DEFAULT NULL,
  `ngay_tao` DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_nguoi_so_huu_rules` (`nguoi_so_huu_id`),
  KEY `idx_rules_status` (`trang_thai`),
  KEY `idx_rules_owner_status` (`nguoi_so_huu_id`, `trang_thai`),
  CONSTRAINT `rules_nguoi_so_huu_fk` FOREIGN KEY (`nguoi_so_huu_id`) REFERENCES `nguoi_dung` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =========================================================
-- Bang scheduled_rules (rule theo lich cron)
-- =========================================================
CREATE TABLE `scheduled_rules` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `ten_rule` VARCHAR(255) DEFAULT NULL,
  `phong_id` INT DEFAULT NULL,
  `cron_expression` VARCHAR(100) NOT NULL,
  `device_id` VARCHAR(255) NOT NULL,
  `action_command` VARCHAR(100) NOT NULL,
  `action_params` JSON DEFAULT NULL,
  `trang_thai` ENUM('enabled','disabled') DEFAULT 'enabled',
  `last_run_at` DATETIME DEFAULT NULL,
  `nguoi_so_huu_id` INT DEFAULT NULL,
  `ngay_tao` DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_scheduled_trang_thai` (`trang_thai`),
  KEY `idx_scheduled_phong` (`phong_id`),
  KEY `idx_nguoi_so_huu_scheduled` (`nguoi_so_huu_id`),
  CONSTRAINT `scheduled_rules_phong_fk` FOREIGN KEY (`phong_id`) REFERENCES `phong` (`id`) ON DELETE SET NULL,
  CONSTRAINT `scheduled_rules_nguoi_so_huu_fk` FOREIGN KEY (`nguoi_so_huu_id`) REFERENCES `nguoi_dung` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =========================================================
-- Bang rule_actions (hanh dong khi rule kich hoat)
-- =========================================================
CREATE TABLE `rule_actions` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `rule_id` INT NOT NULL,
  `device_id` VARCHAR(255) NOT NULL,
  `action_command` VARCHAR(100) NOT NULL,
  `action_params` JSON DEFAULT NULL,
  `delay_seconds` INT DEFAULT '0',
  `thu_tu` INT DEFAULT '1',
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `rule_id` (`rule_id`),
  KEY `idx_rule_actions_rule_status` (`rule_id`, `delay_seconds`),
  CONSTRAINT `rule_actions_ibfk_1` FOREIGN KEY (`rule_id`) REFERENCES `rules` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =========================================================
-- Bang commands (lich su lenh gui thiet bi)
-- =========================================================
CREATE TABLE `commands` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `device_id` VARCHAR(255) NOT NULL,
  `command` VARCHAR(100) NOT NULL,
  `payload` JSON DEFAULT NULL,
  `status` ENUM('pending','sent','acked','failed') DEFAULT 'pending',
  `rule_id` INT DEFAULT NULL,
  `rule_action_id` INT DEFAULT NULL,
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `sent_at` DATETIME DEFAULT NULL,
  `acked_at` DATETIME DEFAULT NULL,
  `error_message` VARCHAR(255) DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =========================================================
-- Bang canh_bao (alert)
-- =========================================================
CREATE TABLE `canh_bao` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `loai` ENUM('device_offline','threshold_exceeded','rule_triggered','system_error','emergency') COLLATE utf8mb4_unicode_ci NOT NULL,
  `device_id` VARCHAR(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `rule_id` INT DEFAULT NULL,
  `tin_nhan` TEXT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `muc_do` ENUM('low','medium','high','critical') COLLATE utf8mb4_unicode_ci DEFAULT 'medium',
  `trang_thai` ENUM('new','acknowledged','resolved') COLLATE utf8mb4_unicode_ci DEFAULT 'new',
  `thoi_gian_tao` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  `thoi_gian_giai_quyet` TIMESTAMP NULL DEFAULT NULL,
  `nguoi_xu_ly` INT DEFAULT NULL,
  `ghi_chu` TEXT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `data_context` JSON DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_status_time` (`trang_thai`,`thoi_gian_tao`),
  KEY `idx_device_id` (`device_id`),
  KEY `idx_rule_id` (`rule_id`),
  KEY `idx_muc_do` (`muc_do`),
  KEY `canh_bao_user_fk` (`nguoi_xu_ly`),
  CONSTRAINT `canh_bao_device_fk` FOREIGN KEY (`device_id`) REFERENCES `thiet_bi` (`ma_thiet_bi`) ON DELETE SET NULL,
  CONSTRAINT `canh_bao_rule_fk` FOREIGN KEY (`rule_id`) REFERENCES `rules` (`id`) ON DELETE SET NULL,
  CONSTRAINT `canh_bao_user_fk` FOREIGN KEY (`nguoi_xu_ly`) REFERENCES `nguoi_dung` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =========================================================
-- Bang kenh_thong_bao (channel gui alert)
-- =========================================================
CREATE TABLE `kenh_thong_bao` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `nguoi_dung_id` INT NOT NULL,
  `loai` ENUM('telegram','email','zalo') NOT NULL,
  `external_id` VARCHAR(255) NOT NULL,
  `cau_hinh` JSON DEFAULT NULL,
  `da_kich_hoat` TINYINT(1) DEFAULT '1',
  `ngay_tao` DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `nguoi_dung_id` (`nguoi_dung_id`),
  CONSTRAINT `kenh_thong_bao_ibfk_1` FOREIGN KEY (`nguoi_dung_id`) REFERENCES `nguoi_dung` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =========================================================
-- Bang rule_thiet_bi (phien ban rule gan FK manh voi thiet_bi)
-- =========================================================
CREATE TABLE `rule_thiet_bi` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `ten_rule` VARCHAR(255) NOT NULL,
  `phong_id` INT NOT NULL,
  `condition_device_id` VARCHAR(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `field` VARCHAR(100) NOT NULL,
  `operator` ENUM('>','<','=','>=','<=','!=') NOT NULL,
  `value` VARCHAR(100) NOT NULL,
  `muc_do_uu_tien` INT DEFAULT '1',
  `trang_thai` ENUM('enabled','disabled') DEFAULT 'enabled',
  `ngay_tao` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `phong_id` (`phong_id`),
  KEY `condition_device_id` (`condition_device_id`),
  CONSTRAINT `rule_thiet_bi_ibfk_1` FOREIGN KEY (`phong_id`) REFERENCES `phong` (`id`) ON DELETE CASCADE,
  CONSTRAINT `rule_thiet_bi_ibfk_2` FOREIGN KEY (`condition_device_id`) REFERENCES `thiet_bi` (`ma_thiet_bi`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =========================================================
-- Bang system_logs (log he thong)
-- =========================================================
CREATE TABLE `system_logs` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `level` ENUM('DEBUG','INFO','WARN','ERROR') COLLATE utf8mb4_unicode_ci NOT NULL,
  `module` VARCHAR(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `message` TEXT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `context` JSON DEFAULT NULL,
  `user_id` INT DEFAULT NULL,
  `ip_address` VARCHAR(45) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_level_time` (`level`,`created_at`),
  KEY `idx_module_time` (`module`,`created_at`),
  KEY `idx_user_id` (`user_id`),
  CONSTRAINT `system_logs_user_fk` FOREIGN KEY (`user_id`) REFERENCES `nguoi_dung` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =========================================================
-- Bang thong_ke_gio (thong ke nhiet do/do am theo gio)
-- =========================================================
CREATE TABLE `thong_ke_gio` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `thiet_bi_id` INT NOT NULL,
  `ngay` DATE NOT NULL,
  `gio` TINYINT NOT NULL,              -- 0-23
  `nhiet_do_tb` DECIMAL(5,2) DEFAULT NULL,
  `nhiet_do_max` DECIMAL(5,2) DEFAULT NULL,
  `nhiet_do_min` DECIMAL(5,2) DEFAULT NULL,
  `do_am_tb` DECIMAL(5,2) DEFAULT NULL,
  `do_am_max` DECIMAL(5,2) DEFAULT NULL,
  `do_am_min` DECIMAL(5,2) DEFAULT NULL,
  `so_mau` INT DEFAULT 0,
  `ngay_cap_nhat` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_device_date_hour` (`thiet_bi_id`, `ngay`, `gio`),
  KEY `idx_ngay_gio` (`ngay`, `gio`),
  CONSTRAINT `fk_thongkegio_thietbi` FOREIGN KEY (`thiet_bi_id`) REFERENCES `thiet_bi` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =========================================================
-- Bang thong_ke_ngay (thong ke nhiet do/do am theo ngay)
-- =========================================================
CREATE TABLE `thong_ke_ngay` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `thiet_bi_id` INT NOT NULL,
  `ngay` DATE NOT NULL,
  `nhiet_do_tb` DECIMAL(5,2) DEFAULT NULL,
  `nhiet_do_max` DECIMAL(5,2) DEFAULT NULL,
  `nhiet_do_min` DECIMAL(5,2) DEFAULT NULL,
  `do_am_tb` DECIMAL(5,2) DEFAULT NULL,
  `do_am_max` DECIMAL(5,2) DEFAULT NULL,
  `do_am_min` DECIMAL(5,2) DEFAULT NULL,
  `so_mau` INT DEFAULT 0,
  `ngay_cap_nhat` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_device_date` (`thiet_bi_id`, `ngay`),
  KEY `idx_ngay` (`ngay`),
  CONSTRAINT `fk_thongke_thietbi` FOREIGN KEY (`thiet_bi_id`) REFERENCES `thiet_bi` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =========================================================
-- Bang custom_dashboards (luu thong tin dashboard tuy chinh)
-- =========================================================
CREATE TABLE `custom_dashboards` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `ten_dashboard` VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `mo_ta` TEXT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `icon` VARCHAR(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT 'dashboard',
  `mau_sac` VARCHAR(7) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT '#22d3ee',
  `nguoi_tao_id` INT NOT NULL,
  `phong_id` INT DEFAULT NULL COMMENT 'FK toi bang phong (phong ca nhan)',
  `lop_hoc_id` INT DEFAULT NULL COMMENT 'FK toi bang lop_hoc',
  `nhom_id` INT DEFAULT NULL COMMENT 'FK toi bang nhom (neu dashboard thuoc nhom)',
  `ngay_tao` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `ngay_cap_nhat` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `trang_thai` ENUM('active','archived') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT 'active',
  PRIMARY KEY (`id`),
  KEY `nguoi_tao_id` (`nguoi_tao_id`),
  KEY `idx_trang_thai` (`trang_thai`),
  KEY `idx_dashboard_creator` (`nguoi_tao_id`, `trang_thai`),
  KEY `idx_dashboard_nhom` (`nhom_id`),
  CONSTRAINT `custom_dashboards_user_fk` FOREIGN KEY (`nguoi_tao_id`) REFERENCES `nguoi_dung` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =========================================================
-- Bang dashboard_widgets (luu cac widget/bieu do trong dashboard)
-- =========================================================
CREATE TABLE `dashboard_widgets` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `dashboard_id` INT NOT NULL,
  `widget_type` VARCHAR(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `ten_widget` VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `vi_tri_x` INT DEFAULT 0,
  `vi_tri_y` INT DEFAULT 0,
  `chieu_rong` INT DEFAULT 4,
  `chieu_cao` INT DEFAULT 3,
  `cau_hinh` JSON,
  `thu_tu` INT DEFAULT 0,
  `ngay_tao` DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `dashboard_id` (`dashboard_id`),
  KEY `idx_thu_tu` (`thu_tu`),
  KEY `idx_widgets_dashboard_order` (`dashboard_id`, `thu_tu`),
  CONSTRAINT `dashboard_widgets_fk` FOREIGN KEY (`dashboard_id`) REFERENCES `custom_dashboards` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =========================================================
-- Bang dashboard_permissions (phan quyen truy cap dashboard)
-- =========================================================
CREATE TABLE `dashboard_permissions` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `dashboard_id` INT NOT NULL,
  `nguoi_dung_id` INT NOT NULL,
  `quyen` ENUM('view','edit','owner') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT 'view',
  `ngay_tao` DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_dashboard_user` (`dashboard_id`, `nguoi_dung_id`),
  KEY `nguoi_dung_id` (`nguoi_dung_id`),
  KEY `idx_permissions_user` (`nguoi_dung_id`, `quyen`),
  CONSTRAINT `dashboard_permissions_dashboard_fk` FOREIGN KEY (`dashboard_id`) REFERENCES `custom_dashboards` (`id`) ON DELETE CASCADE,
  CONSTRAINT `dashboard_permissions_user_fk` FOREIGN KEY (`nguoi_dung_id`) REFERENCES `nguoi_dung` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =========================================================
-- Bang control_lines (duong dieu khien ON/OFF)
-- =========================================================
CREATE TABLE IF NOT EXISTS `control_lines` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `thiet_bi_id` INT NOT NULL,
    `relay_number` INT NOT NULL,
    `ten_duong` VARCHAR(100) DEFAULT NULL COMMENT 'Ten duong dieu khien (VD: Den tran, Quat)',
    `topic` VARCHAR(255) DEFAULT NULL COMMENT 'Custom MQTT topic',
    `hien_thi_ttcds` TINYINT(1) DEFAULT 1 COMMENT '0: An, 1: Hien tren TTCDS',
    `control_type` ENUM('toggle', 'three_way', 'momentary', 'on_off', 'range') NOT NULL DEFAULT 'on_off' COMMENT 'toggle=Cong tac gat 3 trang thai, momentary=Cong tac hanh trinh nhan tha, on_off=Cong tac bat tat, range=Num van 0-100',
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (`thiet_bi_id`) REFERENCES `thiet_bi`(`id`) ON DELETE CASCADE,
    UNIQUE KEY `unique_relay` (`thiet_bi_id`, `relay_number`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =========================================================
-- Bang phong_camera (camera per room)
-- =========================================================
CREATE TABLE IF NOT EXISTS `phong_camera` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `phong_id` INT NOT NULL,
  `ten` VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Label for display',
  `ip_address` VARCHAR(45) DEFAULT NULL COMMENT 'Camera IP or hostname',
  `port` INT DEFAULT NULL COMMENT 'RTSP port',
  `rtsp_path` VARCHAR(512) DEFAULT NULL COMMENT 'RTSP path after port',
  `username` VARCHAR(255) DEFAULT NULL COMMENT 'Camera username (stored encrypted)',
  `password_enc` TEXT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Camera password (Fernet encrypted)',
  `stream_url` VARCHAR(1024) DEFAULT NULL COMMENT 'Full RTSP/HTTP stream URL',
  `thu_tu` INT DEFAULT 0 COMMENT 'Sort order',
  `is_active` TINYINT(1) DEFAULT 1,
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `fk_camera_phong` FOREIGN KEY (`phong_id`) REFERENCES `phong` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- Bang phong_occupancy (so nguoi trong phong, ghi tu ai_analyst)
-- ============================================================
CREATE TABLE IF NOT EXISTS `phong_occupancy` (
  `id` BIGINT AUTO_INCREMENT PRIMARY KEY,
  `phong_id` INT NOT NULL,
  `phong_camera_id` INT DEFAULT NULL COMMENT 'Camera that provided the count (NULL = aggregated)',
  `so_nguoi` INT NOT NULL DEFAULT 0 COMMENT 'Number of people detected',
  `count_type` ENUM('camera', 'room_total') NOT NULL DEFAULT 'camera',
  `cap_nhat_luc` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `nguon` VARCHAR(50) DEFAULT 'ai_analyst' COMMENT 'Source: ai_analyst, manual, ...',
  UNIQUE KEY `uk_occupancy_key` (`phong_id`, `phong_camera_id`, `count_type`),
  KEY `idx_occupancy_phong` (`phong_id`),
  KEY `idx_occupancy_time` (`cap_nhat_luc`),
  CONSTRAINT `fk_occ_phong` FOREIGN KEY (`phong_id`) REFERENCES `phong` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_occ_camera` FOREIGN KEY (`phong_camera_id`) REFERENCES `phong_camera` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- Zone Occupancy Timer - Database Schema
-- ============================================================
CREATE TABLE IF NOT EXISTS `zone_definitions` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `camera_id` INT NOT NULL,
  `zone_name` VARCHAR(100) NOT NULL,
  `zone_index` INT NOT NULL,
  `polygon_points` JSON NOT NULL,
  `is_entry_zone` TINYINT(1) DEFAULT 0,
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY `uk_camera_zone` (`camera_id`, `zone_index`)
);

CREATE TABLE IF NOT EXISTS `zone_occupancy_log` (
  `id` BIGINT AUTO_INCREMENT PRIMARY KEY,
  `camera_id` INT NOT NULL,
  `zone_id` INT NOT NULL,
  `track_id` INT DEFAULT NULL,
  `zone_entered_at` DATETIME NOT NULL,
  `zone_exited_at` DATETIME DEFAULT NULL,
  `duration_seconds` INT DEFAULT NULL,
  `entered_count` INT DEFAULT 1,
  UNIQUE KEY `uk_track_session` (`zone_id`, `track_id`, `zone_entered_at`),
  INDEX `idx_zone_time` (`zone_id`, `zone_entered_at`),
  INDEX `idx_camera_time` (`camera_id`, `zone_entered_at`)
);

CREATE TABLE IF NOT EXISTS `zone_occupancy_daily` (
  `id` BIGINT AUTO_INCREMENT PRIMARY KEY,
  `camera_id` INT NOT NULL,
  `zone_id` INT NOT NULL,
  `zone_name` VARCHAR(100) NOT NULL,
  `ngay` DATE NOT NULL,
  `total_seconds` INT DEFAULT 0,
  `peak_count` INT DEFAULT 0,
  `total_entries` INT DEFAULT 0,
  `avg_count` DECIMAL(5,2) DEFAULT 0.00,
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY `uk_daily` (`zone_id`, `ngay`),
  INDEX `idx_ngay` (`ngay`)
);
