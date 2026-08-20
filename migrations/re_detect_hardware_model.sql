-- Re-detect hardware_model for components with NULL hardware_model
-- Based on component_type and field_name patterns

-- Create temporary table for mapping
CREATE TEMPORARY TABLE IF NOT EXISTS hardware_inference_map (
    component_type VARCHAR(50),
    field_pattern VARCHAR(100),
    hardware_model VARCHAR(100)
);

-- Insert inference rules
INSERT INTO hardware_inference_map VALUES
-- Temperature-only sensors
('temperature', '%soil%', 'DS18B20'),
('temperature', '%water%', 'Waterproof_Temp'),
('temperature', '%ambient%', 'DS18B20'),
('temperature', '%room%', 'DS18B20'),
('temperature', '%outdoor%', 'DHT22'),
('temperature', '%', 'DS18B20'),

-- Temperature + Humidity sensors
('temperature', '%', 'DHT11'),
('humidity', '%', 'DHT11');

-- Update hardware_model based on inference rules
-- Temperature only sensors (single field)
UPDATE device_components dc
INNER JOIN hardware_inference_map hm ON dc.component_type = hm.component_type
SET dc.hardware_model = hm.hardware_model
WHERE dc.hardware_model IS NULL
  AND dc.component_type = 'temperature'
  AND dc.field_name LIKE '%soil%'
  AND NOT EXISTS (
      SELECT 1 FROM device_components dc2 
      WHERE dc2.device_id = dc.device_id 
      AND dc2.component_type = 'humidity'
  );

-- Temperature + Humidity → DHT family
UPDATE device_components dc
SET dc.hardware_model = 'DHT11'
WHERE dc.hardware_model IS NULL
  AND dc.component_type IN ('temperature', 'humidity')
  AND EXISTS (
      SELECT 1 FROM device_components dc2 
      WHERE dc2.device_id = dc.device_id 
      AND dc2.component_type IN ('temperature', 'humidity')
      AND dc2.id != dc.id
  );

-- Single temperature sensor → DS18B20 (most common waterproof sensor)
UPDATE device_components dc
SET dc.hardware_model = 'DS18B20'
WHERE dc.hardware_model IS NULL
  AND dc.component_type = 'temperature'
  AND NOT EXISTS (
      SELECT 1 FROM device_components dc2 
      WHERE dc2.device_id = dc.device_id 
      AND dc2.component_type = 'humidity'
  );

-- Soil moisture specific
UPDATE device_components dc
SET dc.hardware_model = 'Capacitive_Soil'
WHERE dc.hardware_model IS NULL
  AND dc.component_type = 'soil_moisture';

-- Light sensors
UPDATE device_components dc
SET dc.hardware_model = 'BH1750'
WHERE dc.hardware_model IS NULL
  AND dc.component_type = 'light';

-- Pressure sensors
UPDATE device_components dc
SET dc.hardware_model = 'BMP280'
WHERE dc.hardware_model IS NULL
  AND dc.component_type = 'pressure'
  AND NOT EXISTS (
      SELECT 1 FROM device_components dc2 
      WHERE dc2.device_id = dc.device_id 
      AND dc2.component_type IN ('temperature', 'humidity')
  );

-- Motion sensors
UPDATE device_components dc
SET dc.hardware_model = 'PIR'
WHERE dc.hardware_model IS NULL
  AND dc.component_type = 'motion';

-- Relay modules
UPDATE device_components dc
SET dc.hardware_model = 'RELAY_MODULE'
WHERE dc.hardware_model IS NULL
  AND dc.component_type = 'relay';

-- Gas sensors
UPDATE device_components dc
SET dc.hardware_model = 'MQ135'
WHERE dc.hardware_model IS NULL
  AND dc.component_type = 'gas';

-- CO2 sensors
UPDATE device_components dc
SET dc.hardware_model = 'MH_Z19'
WHERE dc.hardware_model IS NULL
  AND dc.component_type = 'co2';

-- Update detection_confidence for updated records
UPDATE device_components
SET detection_confidence = 0.8
WHERE hardware_model IS NOT NULL 
  AND detection_confidence < 0.5;

-- Log changes
INSERT INTO component_events (device_id, component_id, event_type, severity, details)
SELECT 
    dc.device_id,
    dc.id,
    'detected',
    'info',
    JSON_OBJECT('hardware_model', dc.hardware_model, 'reason', 'inference_migration')
FROM device_components dc
WHERE dc.hardware_model IS NOT NULL;

-- Cleanup
DROP TEMPORARY TABLE IF EXISTS hardware_inference_map;

-- Verify results
SELECT 
    hardware_model,
    COUNT(*) as count
FROM device_components
GROUP BY hardware_model
ORDER BY count DESC;
