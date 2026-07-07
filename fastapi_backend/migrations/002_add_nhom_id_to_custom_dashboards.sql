-- ============================================================
-- Migration: Add nhom_id to custom_dashboards table
-- Purpose: Workspace isolation - dashboards need to belong to a workspace (nhom)
-- Date: 2026-07-03
-- ============================================================
-- Add nhom_id column to custom_dashboards table
ALTER TABLE custom_dashboards
  ADD COLUMN nhom_id INT(11) NULL DEFAULT NULL AFTER lop_hoc_id;

-- Add index for faster filtering by nhom_id
ALTER TABLE custom_dashboards
  ADD INDEX idx_nhom_id (nhom_id);
