-- ============================================================
-- Migration: Add phong_user_permissions table
-- Purpose: Admin assigns rooms (phong) to teacher/student users
--   with view-only permission so they can use assigned rooms in
--   their workspace without being able to modify or delete them.
-- Idempotent: safe to run multiple times.
-- ============================================================

-- Create table (skip if already exists)
CREATE TABLE IF NOT EXISTS phong_user_permissions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  phong_id INT NOT NULL,
  nguoi_dung_id INT NOT NULL,
  quyen ENUM('view','edit','owner') NOT NULL DEFAULT 'view',
  nguoi_gan_id INT DEFAULT NULL COMMENT 'admin id da gan phong nay',
  ngay_gan DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY unique_phong_user (phong_id, nguoi_dung_id),
  KEY idx_pup_user (nguoi_dung_id),
  KEY idx_pup_phong (phong_id),
  KEY idx_pup_quyen (quyen),
  CONSTRAINT fk_pup_phong FOREIGN KEY (phong_id) REFERENCES phong(id) ON DELETE CASCADE,
  CONSTRAINT fk_pup_user FOREIGN KEY (nguoi_dung_id) REFERENCES nguoi_dung(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
COMMENT = 'Admin-assigned room permissions for teacher/student users';
