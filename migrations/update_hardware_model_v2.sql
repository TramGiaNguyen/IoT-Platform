-- Migration: Update hardware_model cho components NULL
-- Equipment: DHT11 cho temp+humidity, DS18B20 cho temperature-only

-- Step 1: Update DHT11 cho devices co ca temperature va humidity
CREATE TEMPORARY TABLE temp_has_hum AS 
SELECT DISTINCT device_id 
FROM device_components 
WHERE component_type IN ('temperature', 'humidity') 
AND device_id IN (
    SELECT DISTINCT device_id 
    FROM device_components 
    WHERE component_type = 'humidity'
);

UPDATE device_components dc 
JOIN temp_has_hum t ON dc.device_id = t.device_id 
SET dc.hardware_model = 'DHT11' 
WHERE dc.hardware_model IS NULL 
AND dc.component_type IN ('temperature', 'humidity');

DROP TEMPORARY TABLE temp_has_hum;

-- Step 2: Update DS18B20 cho devices chi co temperature
CREATE TEMPORARY TABLE temp_temp_only AS 
SELECT DISTINCT device_id 
FROM device_components 
WHERE component_type = 'temperature'
AND device_id NOT IN (
    SELECT DISTINCT device_id 
    FROM device_components 
    WHERE component_type = 'humidity'
);

UPDATE device_components dc 
JOIN temp_temp_only t ON dc.device_id = t.device_id 
SET dc.hardware_model = 'DS18B20' 
WHERE dc.hardware_model IS NULL 
AND dc.component_type = 'temperature';

DROP TEMPORARY TABLE temp_temp_only;

-- Step 3: Update Capacitive_Soil cho soil_moisture
UPDATE device_components 
SET hardware_model = 'Capacitive_Soil' 
WHERE hardware_model IS NULL 
AND component_type = 'soil_moisture';

-- Step 4: Update detection_confidence
UPDATE device_components 
SET detection_confidence = 0.8 
WHERE hardware_model IS NOT NULL 
AND detection_confidence < 0.5;

-- Verify
SELECT hardware_model, COUNT(*) as count 
FROM device_components 
GROUP BY hardware_model 
ORDER BY count DESC;
