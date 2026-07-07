-- ============================================================
-- Migration: Add nhom_id to phong table
-- Purpose: Workspace isolation - phong (rooms) need to belong to a workspace (nhom)
-- Date: 2026-07-03
-- ============================================================
-- Add nhom_id column to phong table
ALTER TABLE phong
  ADD COLUMN nhom_id INT(11) NULL DEFAULT NULL AFTER nguoi_so_huu_id;

-- Add index for faster filtering by nhom_id
ALTER TABLE phong
  ADD INDEX idx_nhom_id (nhom_id);
