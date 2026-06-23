-- Migration: Add phai_doi_mat_khau column to nguoi_dung table
-- Purpose: Flag users who must change password on first login
ALTER TABLE nguoi_dung ADD COLUMN phai_doi_mat_khau TINYINT(1) NOT NULL DEFAULT 0;
