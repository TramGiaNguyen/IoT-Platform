-- Migration: Add camera and occupancy support for rooms
-- Idempotent: safe to run multiple times
-- phong_camera: already created in data.sql
-- phong_occupancy: already created in data.sql

USE iot_data;

-- Ensure phong_camera exists (data.sql creates it, but IF NOT EXISTS makes this safe)
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

-- Ensure phong_occupancy exists (data.sql creates it)
CREATE TABLE IF NOT EXISTS `phong_occupancy` (
  `id` BIGINT AUTO_INCREMENT PRIMARY KEY,
  `phong_id` INT NOT NULL,
  `phong_camera_id` INT DEFAULT NULL,
  `so_nguoi` INT NOT NULL DEFAULT 0,
  `count_type` ENUM('camera', 'room_total') NOT NULL DEFAULT 'camera',
  `cap_nhat_luc` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `nguon` VARCHAR(50) DEFAULT 'ai_analyst',
  UNIQUE KEY `uk_occupancy_key` (`phong_id`, `phong_camera_id`, `count_type`),
  KEY `idx_occupancy_phong` (`phong_id`),
  KEY `idx_occupancy_time` (`cap_nhat_luc`),
  CONSTRAINT `fk_occ_phong` FOREIGN KEY (`phong_id`) REFERENCES `phong` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_occ_camera` FOREIGN KEY (`phong_camera_id`) REFERENCES `phong_camera` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SELECT 'Migration add_camera_and_occupancy completed' AS status;
