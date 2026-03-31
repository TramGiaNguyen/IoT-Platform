-- Migration: Add nguoi_so_huu_id to phong table for room ownership
-- Date: 2026-03-31

USE iot_data;

-- Add nguoi_so_huu_id column to phong table
ALTER TABLE phong 
ADD COLUMN nguoi_so_huu_id INT NULL AFTER nguoi_quan_ly_id,
ADD FOREIGN KEY (nguoi_so_huu_id) REFERENCES nguoi_dung(id) ON DELETE SET NULL;

-- Set existing rooms to be owned by admin (id=1) or first user
UPDATE phong 
SET nguoi_so_huu_id = (SELECT id FROM nguoi_dung WHERE vai_tro = 'admin' LIMIT 1)
WHERE nguoi_so_huu_id IS NULL;

-- Add index for better query performance
CREATE INDEX idx_phong_nguoi_so_huu ON phong(nguoi_so_huu_id);

