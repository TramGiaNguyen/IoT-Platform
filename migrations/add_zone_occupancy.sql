USE iot_data;

-- ============================================================
-- Zone Occupancy Timer — Database Schema
-- ============================================================

-- Bảng 1: Định nghĩa zone cho từng camera
CREATE TABLE IF NOT EXISTS `zone_definitions` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `camera_id` INT NOT NULL,          -- phong_camera.id
  `zone_name` VARCHAR(100) NOT NULL, -- e.g. "Zone 1", "Zone 2"
  `zone_index` INT NOT NULL,         -- thứ tự 1,2,3...
  `polygon_points` JSON NOT NULL,    -- [[x1,y1],[x2,y2],...] tọa độ gốc từ camera
  `is_entry_zone` TINYINT(1) DEFAULT 0,
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY `uk_camera_zone` (`camera_id`, `zone_index`)
);

-- Bảng 2: Log thời gian occupancy theo zone (thời gian thực)
CREATE TABLE IF NOT EXISTS `zone_occupancy_log` (
  `id` BIGINT AUTO_INCREMENT PRIMARY KEY,
  `camera_id` INT NOT NULL,
  `zone_id` INT NOT NULL,           -- zone_definitions.id
  `track_id` INT DEFAULT NULL,      -- ByteTrack ID (null nếu dùng detect-only)
  `zone_entered_at` DATETIME NOT NULL,
  `zone_exited_at` DATETIME DEFAULT NULL,
  `duration_seconds` INT DEFAULT NULL,
  `entered_count` INT DEFAULT 1,    -- số người cùng lúc trong zone (entry=1, exit=lưu duration)
  UNIQUE KEY `uk_track_session` (`zone_id`, `track_id`, `zone_entered_at`),
  INDEX `idx_zone_time` (`zone_id`, `zone_entered_at`),
  INDEX `idx_camera_time` (`camera_id`, `zone_entered_at`)
);

-- Bảng 3: Tổng hợp ngày (chạy 1 lần/ngày)
CREATE TABLE IF NOT EXISTS `zone_occupancy_daily` (
  `id` BIGINT AUTO_INCREMENT PRIMARY KEY,
  `camera_id` INT NOT NULL,
  `zone_id` INT NOT NULL,
  `zone_name` VARCHAR(100) NOT NULL,
  `ngay` DATE NOT NULL,
  `total_seconds` INT DEFAULT 0,         -- tổng thời gian có người (giây)
  `peak_count` INT DEFAULT 0,             -- số người đỉnh điểm trong ngày
  `total_entries` INT DEFAULT 0,         -- tổng số lần người vào zone
  `avg_count` DECIMAL(5,2) DEFAULT 0.00, -- trung bình số người
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY `uk_daily` (`zone_id`, `ngay`),
  INDEX `idx_ngay` (`ngay`)
);
