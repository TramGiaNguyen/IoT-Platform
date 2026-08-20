# Field Role Classifier
# Classifies fields into semantic roles: identifier, timestamp, counter, metric, state, etc.

import re
from typing import Dict, List, Tuple, Any
from dataclasses import dataclass
from collections import Counter


@dataclass
class FieldRole:
    role: str
    confidence: float
    reasoning: str


class FieldRoleClassifier:
    """
    Classifies field roles based on name, value patterns, and statistical properties.
    Uses rule-based classification with confidence scores.
    """
    
    # Semantic type dictionaries for sensor names
    SENSOR_DICTIONARIES = {
        'temperature': [
            'temperature', 'temp', 'tmp', 't', 't1', 't2',
            'air_temp', 'room_temp', 'ambient_temp', 'cpu_temp',
            'sensor_temp', 'temperature_c', 'temp_c', 'tc', 'airtemperature'
        ],
        'humidity': [
            'humidity', 'hum', 'rh', 'relative_humidity', 'humid',
            'h', 'h1', 'h2', 'moisture', 'hum_pct', 'absolute_humidity',
            'env_humidity', 'air_humidity', 'room_humidity'
        ],
        'soil_moisture': [
            'soil_moisture', 'soil_moist', 'moisture', 'moisture_percent',
            'sm', 'soil_humidity', 'ground_moisture', 'plant_moisture',
            'capacitive_moisture', 'resistive_moisture'
        ],
        'pressure': [
            'pressure', 'press', 'baro', 'barometer', 'atmospheric_pressure',
            'pressure_pa', 'p', 'patm', 'absolute_pressure', 'differential_pressure'
        ],
        'co2': [
            'co2', 'carbon_dioxide', 'co2_ppm', 'co2_level', 'carbon',
            'co2_concentration', 'eco2', 'equivalent_co2'
        ],
        'light': [
            'light', 'lux', 'illuminance', 'brightness', 'luminosity',
            'light_level', 'ldr', 'photoresistor', 'light_lux', 'lightlux',
            'ambient_light', 'irradiance', 'par', 'photosynthetically_active'
        ],
        'power': [
            'power', 'wattage', 'watts', 'power_w', 'energy', 'kwh', 'power_consumption',
            'active_power', 'reactive_power', 'apparent_power', 'pf', 'power_factor',
            'consumption', 'power_usage', 'real_power'
        ],
        'voltage': [
            'voltage', 'volt', 'v', 'vcc', 'vin', 'battery_voltage',
            'vdc', 'v_ac', 'line_voltage', 'supply_voltage', 'sense_voltage',
            'adc_voltage', 'analog_voltage'
        ],
        'current': [
            'current', 'ampere', 'amps', 'a', 'current_a', 'amperage',
            'current_ma', 'ma', 'ac_current', 'dc_current', 'leakage_current'
        ],
        'motion': [
            'motion', 'movement', 'pir', 'presence', 'occupancy', 'detected',
            'motion_detected', 'pir_state', 'radar', 'mmwave'
        ],
        'distance': [
            'distance', 'range', 'ultrasonic', 'sonar', 'depth', 'dis',
            'proximity', 'hc_sr04', 'level', 'water_depth', 'fill_level'
        ],
        'gas': [
            'gas', 'mq2', 'mq5', 'mq7', 'mq135', 'smoke', 'lpg', 'methane',
            'gas_ppm', 'gas_sensor', 'combustible_gas', 'nh3', 'no2', 'o3'
        ],
        'pm25': [
            'pm25', 'pm2_5', 'particulate', 'dust', 'air_quality',
            'pm10', 'pm1_0', 'tsp', 'particle_count', 'aqi'
        ],
        'vibration': [
            'vibration', 'vib', 'shake', 'accelerometer', 'accel', 'xyz',
            'acceleration', 'g_force', 'seismic', 'shock', 'tilt', 'gyro',
            'angular_velocity', 'rotation'
        ],
        'weight': [
            'weight', 'load', 'scale', 'kg', 'mass', 'load_cell',
            'force', 'newton', 'pressure_force', 'weight_kg', 'net_weight'
        ],
        'water_level': [
            'water_level', 'tank_level', 'depth', 'tank_depth',
            'fill_height', '液位', 'level_sensor', 'reservoir_level'
        ],
        'flow_rate': [
            'flow', 'flow_rate', 'lph', 'gpm', 'cfm', 'velocity',
            'flow_velocity', 'water_flow', 'airflow', 'flow_m3h'
        ],
        'sound': [
            'sound', 'noise', 'decibel', 'db', 'mic', 'microphone',
            'sound_level', 'spl', 'dbm', 'audio', 'noise_level'
        ],
        'ph': [
            'ph', 'ph_value', 'acidity', 'alkaline', 'tds',
            'total_dissolved_solids', 'ec', 'conductivity'
        ],
        'wind_speed': [
            'wind_speed', 'wind', 'anemometer', 'ws', 'windspeed',
            'wind_velocity', 'air_velocity', 'gust'
        ],
        'wind_direction': [
            'wind_direction', 'wind_dir', 'wd', 'wind_degree',
            'compass', 'heading', 'azimuth', 'wind_dir_deg'
        ],
        'rain': [
            'rain', 'rainfall', 'rain_sensor', 'precipitation',
            'rain_rate', 'rain_mm', 'raindrop', 'rain_detected'
        ],
        'door': [
            'door', 'door_state', 'door_sensor', 'reed', 'magnetic',
            'entry', 'access', 'gate', 'shutter'
        ],
        'window': [
            'window', 'window_state', 'window_sensor', 'window_open'
        ],
        'relay': [
            'relay', 'relay_state', 'switch', 'sw', 'output',
            'digital_output', 'do', 'gpio_out', 'valve'
        ],
        'gps': [
            'lat', 'lon', 'latitude', 'longitude', 'gps', 'gps_lat',
            'gps_lon', 'location', 'coordinates', 'altitude', 'gps_altitude'
        ],
        'battery': [
            'battery', 'bat', 'battery_level', 'soc', 'state_of_charge',
            'vbat', 'battery_voltage', 'battery_percent', 'battery_mv',
            'battery_temp', 'battery_health'
        ],
        'rssi': [
            'rssi', 'signal', 'signal_strength', 'wifi_rssi',
            'dbm', 'snr', 'signal_quality', 'link_quality',
            'wifi_strength', 'network_rssi', 'cellular_rssi'
        ],
        'uptime': [
            'uptime', 'running_time', 'operation_time', 'hours',
            'runtime', 'operating_hours', 'elapsed_time', 'boot_time'
        ],
        'cpu_usage': [
            'cpu', 'cpu_usage', 'cpu_percent', 'cpu_load', 'cpu_temp',
            'processor_usage', 'core_load'
        ],
        'memory': [
            'memory', 'mem', 'ram', 'ram_usage', 'heap', 'flash',
            'storage', 'rom', 'sd_card', 'free_memory'
        ],
    }
    
    # Common identifier field names
    ID_PATTERNS = [
        'device', 'device_id', 'id', 'name', 'node', 'mac', 'uuid',
        'serial', 'chip_id', 'module', 'unit', 'sensor_id'
    ]
    
    # Common timestamp field names
    TIMESTAMP_PATTERNS = [
        'timestamp', 'time', 'ts', 'datetime', 'date', 'created_at',
        'updated_at', 'recorded_at', 'epoch', 'unix_time', 'time_ms'
    ]
    
    # Counter patterns (fields that usually increase)
    COUNTER_PATTERNS = [
        'count', 'counter', 'total', 'packets', 'bytes', 'requests',
        'ticks', 'retransmits', 'errors', 'failures', 'success'
    ]
    
    # Binary state patterns
    STATE_PATTERNS = [
        'state', 'status', 'on', 'off', 'open', 'close', 'running',
        'stopped', 'enabled', 'disabled', 'alarm', 'flag', 'relay'
    ]
    
    def __init__(self):
        # Build regex patterns
        self._build_patterns()
    
    def _build_patterns(self):
        """Pre-compile regex patterns for performance."""
        # Pattern to detect Unix timestamp (10 or 13 digits)
        self.ts_pattern = re.compile(r'^\d{10,13}$')
        
        # Pattern to detect ISO datetime
        self.iso_pattern = re.compile(
            r'^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}'
        )
        
        # Pattern to detect field names with numeric suffixes
        self.suffix_pattern = re.compile(r'_?\d+$')
        
        # Pattern for camelCase to extract words
        self.camel_pattern = re.compile(r'([a-z]+|[A-Z][a-z]+)')
    
    def classify(self, field_info: 'FieldInfo', value: Any) -> FieldRole:
        """
        Classify field role based on name and value.
        Returns FieldRole with role, confidence, and reasoning.
        """
        path = field_info.path
        field_name = path.split('.')[-1].lower()
        data_type = field_info.data_type
        
        # Extract name tokens for semantic matching
        name_tokens = self._extract_tokens(field_name)
        
        # 1. Check for timestamp
        if data_type in ('integer', 'float'):
            ts_result = self._check_timestamp(field_name, value)
            if ts_result:
                return ts_result
        
        # 2. Check for identifier
        if data_type == 'string':
            id_result = self._check_identifier(field_name, value)
            if id_result:
                return id_result
        
        # 3. Check for counter
        if data_type in ('integer', 'float'):
            counter_result = self._check_counter(field_name, value)
            if counter_result:
                return counter_result
        
        # 4. Check for binary state
        if data_type == 'boolean' or (data_type in ('integer', 'string') and self._is_binary(value)):
            return FieldRole(
                role='binary_state',
                confidence=0.95,
                reasoning='Field appears to be binary state (0/1 or true/false)'
            )
        
        # 5. Check for categorical state
        if data_type == 'string' and not id_result:
            return FieldRole(
                role='categorical_state',
                confidence=0.7,
                reasoning='String field with limited cardinality'
            )
        
        # 6. Default to numeric metric
        return FieldRole(
            role='numeric_metric',
            confidence=0.8,
            reasoning='Numeric field with variance - classified as metric'
        )
    
    def _extract_tokens(self, field_name: str) -> List[str]:
        """Extract tokens from field name."""
        # Split by underscore and camelCase
        tokens = field_name.replace('_', ' ').replace('-', ' ')
        camel_tokens = self.camel_pattern.findall(field_name)
        all_tokens = (tokens + ' '.join(camel_tokens)).lower().split()
        return list(filter(None, all_tokens))
    
    def _check_timestamp(self, field_name: str, value: Any) -> FieldRole:
        """Check if field is a timestamp."""
        # Check name patterns
        name_match = any(
            pattern in field_name.lower() 
            for pattern in self.TIMESTAMP_PATTERNS
        )
        
        # Check value pattern (Unix timestamp)
        value_match = False
        if isinstance(value, (int, float)):
            # Check if it's a reasonable Unix timestamp
            if 946684800 <= value <= 2147483647:  # 2000-2038 (seconds)
                value_match = True
            elif 946684800000 <= value <= 2147483647000:  # 2000-2038 (milliseconds)
                value_match = True
        elif isinstance(value, str):
            value_match = bool(self.ts_pattern.match(value) or self.iso_pattern.match(value))
        
        if name_match and value_match:
            return FieldRole(
                role='timestamp',
                confidence=0.99,
                reasoning='Field name and value match timestamp pattern'
            )
        elif value_match and not name_match:
            # Likely timestamp based on value alone
            return FieldRole(
                role='timestamp',
                confidence=0.7,
                reasoning='Value matches Unix timestamp range but name unclear'
            )
        
        return None
    
    def _check_identifier(self, field_name: str, value: Any) -> FieldRole:
        """Check if field is an identifier."""
        name_match = any(
            pattern in field_name.lower() 
            for pattern in self.ID_PATTERNS
        )
        
        if name_match and isinstance(value, str):
            return FieldRole(
                role='identifier',
                confidence=0.95,
                reasoning='Field name matches identifier pattern'
            )
        
        return None
    
    def _check_counter(self, field_name: str, value: Any) -> FieldRole:
        """Check if field is a counter (monotonically increasing)."""
        name_match = any(
            pattern in field_name.lower() 
            for pattern in self.COUNTER_PATTERNS
        )
        
        if name_match:
            return FieldRole(
                role='counter',
                confidence=0.85,
                reasoning='Field name matches counter pattern'
            )
        
        # Additional heuristic: field ending in _count, _total, etc.
        if field_name.endswith(('_count', '_total', '_num', '_n')):
            return FieldRole(
                role='counter',
                confidence=0.8,
                reasoning='Field name suffix suggests counter'
            )
        
        return None
    
    def _is_binary(self, value: Any) -> bool:
        """Check if value is binary (0/1 or true/false string)."""
        if isinstance(value, bool):
            return True
        if isinstance(value, (int, float)):
            return value in (0, 1, 0.0, 1.0)
        if isinstance(value, str):
            return value.lower() in ('0', '1', 'true', 'false', 'on', 'off', 'yes', 'no')
        return False
    
    def detect_semantic_type(self, field_info: 'FieldInfo') -> Tuple[str, float]:
        """
        Detect semantic type (temperature, humidity, etc.) from field name.
        Returns (semantic_type, confidence).
        """
        field_name = field_info.path.split('.')[-1].lower()
        tokens = self._extract_tokens(field_name)
        
        scores = {}
        
        for semantic_type, keywords in self.SENSOR_DICTIONARIES.items():
            score = 0
            for token in tokens:
                if token in keywords:
                    score += 1
                # Also check partial matches
                for keyword in keywords:
                    if token in keyword or keyword in token:
                        score += 0.5
            
            if score > 0:
                # Normalize by number of keywords matched
                confidence = min(1.0, score / max(len(tokens), 1))
                scores[semantic_type] = confidence
        
        if not scores:
            return 'UNKNOWN_NUMERIC', 0.0
        
        # Return highest confidence match
        best_match = max(scores.items(), key=lambda x: x[1])
        
        # Only return if confidence is above threshold
        if best_match[1] >= 0.3:
            return best_match[0].upper(), best_match[1]
        
        return 'UNKNOWN_NUMERIC', best_match[1]


    # Sensor metadata for hardware detection and validation
    SENSOR_METADATA = {
        'temperature': {'unit': '°C', 'typical_range': (-40, 85), 'accuracy': '±0.5°C'},
        'humidity': {'unit': '%', 'typical_range': (0, 100), 'accuracy': '±2%RH'},
        'soil_moisture': {'unit': '%', 'typical_range': (0, 100), 'accuracy': '±2%'},
        'pressure': {'unit': 'hPa', 'typical_range': (300, 1100), 'accuracy': '±1hPa'},
        'co2': {'unit': 'ppm', 'typical_range': (400, 5000), 'accuracy': '±50ppm'},
        'light': {'unit': 'lux', 'typical_range': (0, 100000), 'accuracy': '±5lux'},
        'power': {'unit': 'W', 'typical_range': (0, 10000), 'accuracy': '±1W'},
        'voltage': {'unit': 'V', 'typical_range': (0, 240), 'accuracy': '±0.1V'},
        'current': {'unit': 'A', 'typical_range': (0, 100), 'accuracy': '±0.01A'},
        'motion': {'unit': 'bool', 'typical_range': (0, 1), 'accuracy': 'N/A'},
        'distance': {'unit': 'cm', 'typical_range': (2, 400), 'accuracy': '±0.3cm'},
        'gas': {'unit': 'ppm', 'typical_range': (0, 1000), 'accuracy': '±10%'},
        'pm25': {'unit': 'µg/m³', 'typical_range': (0, 500), 'accuracy': '±10%'},
        'vibration': {'unit': 'g', 'typical_range': (-16, 16), 'accuracy': '±0.1g'},
        'weight': {'unit': 'kg', 'typical_range': (0, 500), 'accuracy': '±0.1kg'},
        'water_level': {'unit': 'cm', 'typical_range': (0, 500), 'accuracy': '±0.3cm'},
        'flow_rate': {'unit': 'L/h', 'typical_range': (0, 1000), 'accuracy': '±3%'},
        'sound': {'unit': 'dB', 'typical_range': (0, 120), 'accuracy': '±1.5dB'},
        'ph': {'unit': 'pH', 'typical_range': (0, 14), 'accuracy': '±0.3'},
        'wind_speed': {'unit': 'm/s', 'typical_range': (0, 50), 'accuracy': '±0.5m/s'},
        'wind_direction': {'unit': '°', 'typical_range': (0, 360), 'accuracy': '±3°'},
        'rain': {'unit': 'mm', 'typical_range': (0, 50), 'accuracy': '±1mm'},
        'door': {'unit': 'bool', 'typical_range': (0, 1), 'accuracy': 'N/A'},
        'window': {'unit': 'bool', 'typical_range': (0, 1), 'accuracy': 'N/A'},
        'relay': {'unit': 'bool', 'typical_range': (0, 1), 'accuracy': 'N/A'},
        'gps': {'unit': 'deg', 'typical_range': (-90, 90), 'accuracy': '±2.5m'},
        'battery': {'unit': '%', 'typical_range': (0, 100), 'accuracy': 'N/A'},
        'rssi': {'unit': 'dBm', 'typical_range': (-100, 0), 'accuracy': 'N/A'},
        'uptime': {'unit': 's', 'typical_range': (0, None), 'accuracy': 'N/A'},
        'cpu_usage': {'unit': '%', 'typical_range': (0, 100), 'accuracy': '±1%'},
        'memory': {'unit': '%', 'typical_range': (0, 100), 'accuracy': '±1%'},
    }

    # Common hardware model signatures (field combinations)
    HARDWARE_SIGNATURES = {
        'DHT22': {'fields': ['temperature', 'humidity'], 'temp_range': (-40, 80), 'hum_range': (0, 100)},
        'DHT11': {'fields': ['temperature', 'humidity'], 'temp_range': (0, 50), 'hum_range': (20, 90)},
        'BME280': {'fields': ['temperature', 'humidity', 'pressure'], 'temp_range': (-40, 85)},
        'BMP280': {'fields': ['temperature', 'pressure'], 'temp_range': (-40, 85)},
        'DS18B20': {'fields': ['temperature'], 'temp_range': (-55, 125)},
        'BME680': {'fields': ['temperature', 'humidity', 'pressure', 'gas'], 'has_gas': True},
        'SHT40': {'fields': ['temperature', 'humidity'], 'temp_range': (-40, 125)},
        'LM35': {'fields': ['temperature'], 'temp_range': (-55, 150)},
        'HC_SR04': {'fields': ['distance'], 'range': (2, 400)},
        'PMS5003': {'fields': ['pm25', 'pm10'], 'has_pm25': True, 'has_pm10': True},
        'MQ2': {'fields': ['gas', 'smoke'], 'has_smoke': True},
        'MQ135': {'fields': ['gas', 'co2'], 'has_co2': True},
        'ADS1115': {'has_adc': True, 'bits': 16},
        'ADS1015': {'has_adc': True, 'bits': 12},
        # Extended signatures
        'INA219': {'fields': ['voltage', 'current', 'power'], 'has_voltage': True, 'has_current': True},
        'HX711': {'fields': ['weight', 'pressure_force'], 'has_weight': True, 'bits': 24},
        'MPU6050': {'fields': ['vibration', 'accelerometer'], 'has_gyro': True, 'has_accel': True},
        'MPU9250': {'fields': ['vibration', 'gps'], 'has_gyro': True, 'has_mag': True},
        'VL53L0X': {'fields': ['distance'], 'range': (3, 200)},
        'VL53L1X': {'fields': ['distance'], 'range': (4, 400)},
        'MH_Z19': {'fields': ['co2'], 'co2_range': (400, 5000)},
        'SEN0193': {'fields': ['ph'], 'ph_range': (0, 14)},
        'DFROBOT_PH': {'fields': ['ph'], 'ph_range': (0, 14)},
        'SEN0161': {'fields': ['water_level'], 'level_range': (0, 500)},
        'YFS201': {'fields': ['flow_rate'], 'flow_range': (1, 30)},
        'SEAFLOOR': {'fields': ['flow_rate', 'pressure'], 'has_pressure': True},
        'SEN0213': {'fields': ['current', 'voltage', 'power'], 'has_power_meter': True},
        'PZEM004T': {'fields': ['voltage', 'current', 'power', 'energy'], 'has_energy': True},
        'SDM120': {'fields': ['voltage', 'current', 'power', 'energy'], 'has_energy': True},
        'MQ3': {'fields': ['gas', 'sound'], 'has_alcohol': True},
        'MQ4': {'fields': ['gas'], 'has_methane': True},
        'MQ6': {'fields': ['gas'], 'has_lpg': True},
        'MQ7': {'fields': ['gas'], 'has_co': True},
        'MQ8': {'fields': ['gas'], 'has_hydrogen': True},
        'MQ9': {'fields': ['gas'], 'has_co': True, 'has_flammable': True},
        'MQ131': {'fields': ['gas', 'o3'], 'has_o3': True},
        'MQ136': {'fields': ['gas', 'h2s'], 'has_h2s': True},
        'MQ137': {'fields': ['gas', 'nh3'], 'has_nh3': True},
        'MQ138': {'fields': ['gas'], 'has_voc': True},
        'SDS011': {'fields': ['pm25', 'pm10'], 'has_fan': True},
        'SPS30': {'fields': ['pm25', 'pm10', 'pm1_0'], 'high_resolution': True},
        'BMP180': {'fields': ['temperature', 'pressure'], 'temp_range': (-40, 85)},
        'BMP388': {'fields': ['temperature', 'pressure'], 'temp_range': (-40, 85)},
        'SHT31': {'fields': ['temperature', 'humidity'], 'temp_range': (-40, 125)},
        'SHT21': {'fields': ['temperature', 'humidity'], 'temp_range': (-40, 125)},
        'AM2320': {'fields': ['temperature', 'humidity'], 'temp_range': (-40, 80)},
        'DHT20': {'fields': ['temperature', 'humidity'], 'temp_range': (-40, 80)},
        'AHT10': {'fields': ['temperature', 'humidity'], 'temp_range': (-40, 85)},
        'BH1750': {'fields': ['light'], 'lux_range': (0, 65535)},
        'TSL2561': {'fields': ['light'], 'lux_range': (0, 40000)},
        'MAX44009': {'fields': ['light'], 'lux_range': (0.045, 188000)},
        'GY302': {'fields': ['light'], 'lux_range': (0, 65535)},
        'ACS712': {'fields': ['current'], 'current_range': (5, 30)},
        'ACS711': {'fields': ['current'], 'current_range': (-15, 15)},
        'ACS723': {'fields': ['current'], 'current_range': (0, 30)},
        'RELAY_MODULE': {'fields': ['relay', 'digital_output'], 'has_switch': True},
        'SOLENOID_VALVE': {'fields': ['relay', 'valve'], 'has_valve': True},
    }

    # Communication protocol indicators
    PROTOCOL_INDICATORS = {
        'i2c': ['sda', 'scl', 'i2c', 'iic'],
        'spi': ['mosi', 'miso', 'sck', 'cs', 'spi'],
        'onewire': ['onewire', '1wire', 'one_wire', 'ds18b20'],
        'uart': ['uart', 'rx', 'tx', 'serial', 'baud'],
        'gpio': ['gpio', 'pin', 'd0', 'd1', 'a0', 'a1'],
        'analog': ['adc', 'analog', 'a0', 'a1', 'a2', 'a3'],
    }

    # ADC bit depth indicators from value ranges
    ADC_PATTERNS = {
        4095: 12,   # 0-4095 = 12-bit ADC
        1023: 10,   # 0-1023 = 10-bit ADC
        255: 8,     # 0-255 = 8-bit ADC
        65535: 16,  # 0-65535 = 16-bit ADC
    }

    # Common IoT device types based on field patterns
    DEVICE_TYPE_PATTERNS = {
        'weather_station': ['temperature', 'humidity', 'pressure', 'light'],
        'air_quality': ['pm25', 'pm10', 'co2', 'gas'],
        'water_quality': ['ph', 'temperature', 'tds', 'conductivity'],
        'soil_monitor': ['temperature', 'soil_moisture', 'ph'],
        'motion_sensor': ['motion', 'pir', 'presence'],
        'door_sensor': ['door', 'window', 'magnetic', 'reed'],
        'smart_valve': ['relay', 'valve', 'flow'],
        'smart_meter': ['voltage', 'current', 'power', 'energy'],
        'gps_tracker': ['lat', 'lon', 'gps', 'altitude'],
        'battery_device': ['battery', 'voltage', 'soc'],
    }


# Global instance
field_role_classifier = FieldRoleClassifier()
