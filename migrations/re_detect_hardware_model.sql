-- Re-detect hardware_model for components with NULL hardware_model

-- ============================================
-- 1. Temperature + Humidity → DHT family
-- ============================================
UPDATE device_components dc
SET dc.hardware_model = 'DHT11'
WHERE dc.hardware_model IS NULL
  AND dc.component_type IN ('temperature', 'humidity')
  AND (
      SELECT COUNT(*) FROM device_components dc2
      WHERE dc2.device_id = dc.device_id
      AND dc2.component_type IN ('temperature', 'humidity')
      AND dc2.id != dc.id
  ) > 0;

-- ============================================
-- 2. Single temperature sensor → DS18B20
-- ============================================
UPDATE device_components dc
SET dc.hardware_model = 'DS18B20'
WHERE dc.hardware_model IS NULL
  AND dc.component_type = 'temperature'
  AND (
      SELECT COUNT(*) FROM device_components dc2
      WHERE dc2.device_id = dc.device_id
      AND dc2.component_type = 'humidity'
  ) = 0;

-- ============================================
-- 3. Soil moisture → Capacitive_Soil
-- ============================================
UPDATE device_components
SET hardware_model = 'Capacitive_Soil'
WHERE hardware_model IS NULL
  AND component_type = 'soil_moisture';

-- ============================================
-- 4. Light sensors → BH1750
-- ============================================
UPDATE device_components
SET hardware_model = 'BH1750'
WHERE hardware_model IS NULL
  AND component_type = 'light';

-- ============================================
-- 5. Pressure sensors (standalone, no temp/humidity) → BMP280
-- ============================================
UPDATE device_components dc
SET dc.hardware_model = 'BMP280'
WHERE dc.hardware_model IS NULL
  AND dc.component_type = 'pressure'
  AND (
      SELECT COUNT(*) FROM device_components dc2
      WHERE dc2.device_id = dc.device_id
      AND dc2.component_type IN ('temperature', 'humidity')
  ) = 0;

-- ============================================
-- 6. Motion sensors → PIR
-- ============================================
UPDATE device_components
SET hardware_model = 'PIR'
WHERE hardware_model IS NULL
  AND component_type = 'motion';

-- ============================================
-- 7. Relay modules → RELAY_MODULE
-- ============================================
UPDATE device_components
SET hardware_model = 'RELAY_MODULE'
WHERE hardware_model IS NULL
  AND component_type = 'relay';

-- ============================================
-- 8. Gas sensors → MQ135
-- ============================================
UPDATE device_components
SET hardware_model = 'MQ135'
WHERE hardware_model IS NULL
  AND component_type = 'gas';

-- ============================================
-- 9. CO2 sensors → MH_Z19
-- ============================================
UPDATE device_components
SET hardware_model = 'MH_Z19'
WHERE hardware_model IS NULL
  AND component_type = 'co2';

-- ============================================
-- 10. Update detection_confidence
-- ============================================
UPDATE device_components
SET detection_confidence = 0.8
WHERE hardware_model IS NOT NULL
  AND detection_confidence < 0.5;

-- ============================================
-- 11. Log changes to component_events
-- ============================================
INSERT INTO component_events (device_id, component_id, event_type, severity, details)
SELECT
    device_id,
    id,
    'detected',
    'info',
    JSON_OBJECT('hardware_model', hardware_model, 'reason', 'inference_migration')
FROM device_components
WHERE hardware_model IS NOT NULL;

-- ============================================
-- Verify results
-- ============================================
SELECT
    hardware_model,
    COUNT(*) as count
FROM device_components
GROUP BY hardware_model
ORDER BY count DESC;