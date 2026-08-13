-- Migration: Add AI anomaly support to canh_bao table
-- Date: 2026-08-12
-- Description: Add 'ai_anomaly' type and 'nguon' column for AI-generated alerts

-- Step 1: Add 'ai_anomaly' to the loai ENUM
-- Note: MySQL requires listing all existing values plus the new one
ALTER TABLE canh_bao
MODIFY COLUMN loai ENUM(
    'device_offline',
    'threshold_exceeded',
    'rule_triggered',
    'system_error',
    'emergency',
    'ai_anomaly'
) NOT NULL COMMENT 'Loai canh bao: device_offline, threshold_exceeded, rule_triggered, system_error, emergency, ai_anomaly';

-- Step 2: Add 'nguon' column to track alert source (system, rule, ai)
ALTER TABLE canh_bao
ADD COLUMN nguon ENUM('system', 'rule', 'ai') DEFAULT 'system' COMMENT 'Nguon tao alert: system, rule, ai';

-- Step 3: Update existing rows to have nguon='system' (default)
UPDATE canh_bao SET nguon = 'system' WHERE nguon IS NULL;

-- Step 4: Update AI-generated alerts to have nguon='ai'
-- (These would be alerts created after the next deployment)
