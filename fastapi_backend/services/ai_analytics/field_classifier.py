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
            'h', 'h1', 'h2', 'moisture', 'hum_pct'
        ],
        'pressure': [
            'pressure', 'press', 'baro', 'barometer', 'atmospheric_pressure',
            'pressure_pa', 'p', 'patm'
        ],
        'co2': [
            'co2', 'carbon_dioxide', 'co2_ppm', 'co2_level', 'carbon'
        ],
        'light': [
            'light', 'lux', 'illuminance', 'brightness', 'luminosity',
            'light_level', 'ldr', 'photoresistor'
        ],
        'power': [
            'power', 'wattage', 'watts', 'power_w', 'energy', 'kwh', 'power_consumption'
        ],
        'voltage': [
            'voltage', 'volt', 'v', 'vcc', 'vin', 'battery_voltage'
        ],
        'current': [
            'current', 'ampere', 'amps', 'a', 'current_a', 'amperage'
        ],
        'motion': [
            'motion', 'movement', 'pir', 'presence', 'occupancy', 'detected'
        ],
        'distance': [
            'distance', 'range', 'ultrasonic', 'sonar', 'depth'
        ],
        'gas': [
            'gas', 'mq2', 'mq5', 'mq7', 'smoke', 'lpg', 'methane'
        ],
        'pm25': [
            'pm25', 'pm2_5', 'particulate', 'dust', 'air_quality'
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


# Global instance
field_role_classifier = FieldRoleClassifier()
