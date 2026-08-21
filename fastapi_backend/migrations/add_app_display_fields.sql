-- Migration: Add app_display_fields column to phong table
-- This column stores JSON array of data field keys that should be displayed on mobile app
-- Example: ["temperature", "humidity", "power"]
-- If NULL or empty: all fields are displayed (backward compatible)

ALTER TABLE phong
ADD COLUMN app_display_fields JSON DEFAULT NULL
COMMENT 'JSON array of field keys to display on mobile app. NULL = show all.';

-- Create index for faster lookups
CREATE INDEX idx_phong_app_display ON phong(app_display_fields(100));
