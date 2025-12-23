-- Migration script for Custom Dashboards feature
-- Run this on existing databases to add dashboard management tables
-- Compatible with MySQL 5.7+

USE iot_data;

-- =========================================================
-- Bảng custom_dashboards (lưu thông tin dashboard)
-- =========================================================
CREATE TABLE IF NOT EXISTS `custom_dashboards` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `ten_dashboard` VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `mo_ta` TEXT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `icon` VARCHAR(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT 'dashboard',
  `mau_sac` VARCHAR(7) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT '#22d3ee',
  `nguoi_tao_id` INT NOT NULL,
  `ngay_tao` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `ngay_cap_nhat` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `trang_thai` ENUM('active','archived') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT 'active',
  PRIMARY KEY (`id`),
  KEY `nguoi_tao_id` (`nguoi_tao_id`),
  KEY `idx_trang_thai` (`trang_thai`),
  CONSTRAINT `custom_dashboards_user_fk` FOREIGN KEY (`nguoi_tao_id`) REFERENCES `nguoi_dung` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =========================================================
-- Bảng dashboard_widgets (lưu các widget/biểu đồ trong dashboard)
-- =========================================================
CREATE TABLE IF NOT EXISTS `dashboard_widgets` (
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
  CONSTRAINT `dashboard_widgets_fk` FOREIGN KEY (`dashboard_id`) REFERENCES `custom_dashboards` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =========================================================
-- Bảng dashboard_permissions (phân quyền truy cập dashboard)
-- =========================================================
CREATE TABLE IF NOT EXISTS `dashboard_permissions` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `dashboard_id` INT NOT NULL,
  `nguoi_dung_id` INT NOT NULL,
  `quyen` ENUM('view','edit','owner') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT 'view',
  `ngay_tao` DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_dashboard_user` (`dashboard_id`, `nguoi_dung_id`),
  KEY `nguoi_dung_id` (`nguoi_dung_id`),
  CONSTRAINT `dashboard_permissions_dashboard_fk` FOREIGN KEY (`dashboard_id`) REFERENCES `custom_dashboards` (`id`) ON DELETE CASCADE,
  CONSTRAINT `dashboard_permissions_user_fk` FOREIGN KEY (`nguoi_dung_id`) REFERENCES `nguoi_dung` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =========================================================
-- Indexes để tối ưu query performance
-- =========================================================
-- Index cho việc tìm dashboards của user
CREATE INDEX IF NOT EXISTS `idx_dashboard_creator` ON `custom_dashboards` (`nguoi_tao_id`, `trang_thai`);

-- Index cho việc load widgets theo dashboard
CREATE INDEX IF NOT EXISTS `idx_widgets_dashboard_order` ON `dashboard_widgets` (`dashboard_id`, `thu_tu`);

-- Index cho permissions lookup
CREATE INDEX IF NOT EXISTS `idx_permissions_user` ON `dashboard_permissions` (`nguoi_dung_id`, `quyen`);

