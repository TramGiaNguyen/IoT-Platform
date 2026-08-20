# Hardware Component Detector
# Detects and identifies hardware components from device payloads

import re
from typing import Dict, List, Optional, Any, Tuple
from dataclasses import dataclass, field, asdict
from datetime import datetime
from collections import Counter
import json

from .field_classifier import FieldRoleClassifier


@dataclass
class Component:
    """Represents a detected hardware component."""
    component_id: str
    component_type: str
    field_name: str
    hardware_model: Optional[str] = None
    connection_type: Optional[str] = None
    detection_confidence: float = 0.0
    detected_at: str = field(default_factory=lambda: datetime.utcnow().isoformat())
    metadata: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> Dict:
        return asdict(self)


@dataclass
class HardwareProfile:
    """Complete hardware profile for a device."""
    device_id: str
    components: List[Component] = field(default_factory=list)
    device_type: Optional[str] = None
    device_type_confidence: float = 0.0
    hardware_model: Optional[str] = None
    detected_at: str = field(default_factory=lambda: datetime.utcnow().isoformat())
    last_seen: str = field(default_factory=lambda: datetime.utcnow().isoformat())
    payload_schema: List[str] = field(default_factory=list)
    update_interval_seconds: Optional[float] = None

    def to_dict(self) -> Dict:
        return asdict(self)


class HardwareDetector:
    """
    Detects hardware components from device payloads.
    
    Analyzes field names, value ranges, and patterns to identify:
    - Sensor types (temperature, humidity, etc.)
    - Communication protocols (I2C, SPI, etc.)
    - Hardware models (DHT22, BME280, etc.)
    - Device types (weather station, smart meter, etc.)
    """
    
    def __init__(self):
        self.classifier = FieldRoleClassifier()
    
    def detect_from_payload(self, device_id: str, payload: Dict[str, Any]) -> HardwareProfile:
        """
        Analyze a device payload and extract hardware profile.
        
        Args:
            device_id: Device identifier
            payload: Raw device payload (dict with data fields)
            
        Returns:
            HardwareProfile with detected components and metadata
        """
        # Extract data fields (ignore meta fields)
        data_fields = self._extract_data_fields(payload)
        
        # Detect components from fields
        components = self._detect_components(data_fields)
        
        # Infer device type
        device_type, confidence = self._infer_device_type(components)
        
        # Try to infer hardware model
        hardware_model = self._infer_hardware_model(components, data_fields)
        
        return HardwareProfile(
            device_id=device_id,
            components=components,
            device_type=device_type,
            device_type_confidence=confidence,
            hardware_model=hardware_model,
            payload_schema=list(data_fields.keys())
        )
    
    def _extract_data_fields(self, payload: Dict) -> Dict[str, Any]:
        """Extract only data fields, excluding metadata."""
        meta_fields = {
            'device_id', 'id', 'name', 'timestamp', 'time', 'ts',
            'datetime', 'date', 'type', 'topic', 'mac', 'serial'
        }
        return {
            k: v for k, v in payload.items()
            if k.lower() not in meta_fields and not k.startswith('_')
        }
    
    def _detect_components(self, data_fields: Dict[str, Any]) -> List[Component]:
        """Detect components from data fields."""
        components = []
        detected_types = set()
        
        for field_name, value in data_fields.items():
            # Detect semantic type
            from .payload_intelligence import FieldInfo
            field_info = FieldInfo(
                path=field_name, 
                data_type=self._get_value_type(value),
                role='numeric_metric'
            )
            semantic_type, confidence = self.classifier.detect_semantic_type(field_info)
            
            if semantic_type != 'UNKNOWN_NUMERIC' and confidence > 0.3:
                if semantic_type.lower() not in detected_types:
                    detected_types.add(semantic_type.lower())
                    
                    # Infer connection type
                    connection = self._infer_connection_type(field_name, value)
                    
                    # Get sensor metadata
                    metadata = self.classifier.SENSOR_METADATA.get(semantic_type.lower(), {})
                    
                    component = Component(
                        component_id=f"{semantic_type.lower()}_sensor_1",
                        component_type=semantic_type.lower(),
                        field_name=field_name,
                        connection_type=connection,
                        detection_confidence=confidence,
                        metadata={
                            'value_range': self._get_value_range(value),
                            **metadata
                        }
                    )
                    components.append(component)
        
        return components
    
    def _get_value_type(self, value: Any) -> str:
        """Determine the data type of a value."""
        if isinstance(value, bool):
            return 'boolean'
        if isinstance(value, int):
            return 'integer'
        if isinstance(value, float):
            return 'float'
        if isinstance(value, str):
            return 'string'
        if isinstance(value, (list, dict)):
            return 'object'
        return 'unknown'
    
    def _get_value_range(self, value: Any) -> Optional[Tuple]:
        """Get approximate range of a value for single values."""
        if isinstance(value, (int, float)):
            return (value, value)
        return None
    
    def _infer_connection_type(self, field_name: str, value: Any) -> Optional[str]:
        """Infer communication protocol from field name patterns."""
        field_lower = field_name.lower()
        
        for protocol, indicators in self.classifier.PROTOCOL_INDICATORS.items():
            for indicator in indicators:
                if indicator in field_lower:
                    return protocol
        
        # Infer from ADC patterns
        if isinstance(value, (int, float)):
            for max_val, bits in self.classifier.ADC_PATTERNS.items():
                if abs(value) <= max_val:
                    return 'analog' if bits <= 12 else 'adc'
        
        return None
    
    def _infer_device_type(self, components: List[Component]) -> Tuple[Optional[str], float]:
        """Infer device type based on detected components."""
        component_types = {c.component_type for c in components}
        
        best_match = None
        best_score = 0
        
        for device_type, required_fields in self.classifier.DEVICE_TYPE_PATTERNS.items():
            score = len(component_types.intersection(required_fields)) / len(required_fields)
            if score > best_score:
                best_score = score
                best_match = device_type
        
        return best_match, best_score
    
    def _infer_hardware_model(self, components: List[Component], data_fields: Dict) -> Optional[str]:
        """Attempt to identify specific hardware model."""
        component_types = {c.component_type for c in components}
        
        # First, try field name pattern matching for common sensors
        field_names_lower = {fn.lower() for fn in data_fields.keys()}
        hardware_from_pattern = self._match_hardware_from_field_patterns(field_names_lower)
        if hardware_from_pattern:
            return hardware_from_pattern
        
        # Check against known hardware signatures
        for model, signature in self.classifier.HARDWARE_SIGNATURES.items():
            required_fields = signature.get('fields', [])
            
            # Must have all required fields
            if not all(f in component_types for f in required_fields):
                continue
            
            # Check range constraints (with tolerance)
            valid = True
            for field_name, value in data_fields.items():
                if isinstance(value, (int, float)):
                    # Temperature range check with 20% tolerance
                    if 'temp' in field_name.lower() or 'temperature' in field_name.lower():
                        temp_range = signature.get('temp_range')
                        if temp_range:
                            tolerance = (temp_range[1] - temp_range[0]) * 0.2
                            adjusted_range = (temp_range[0] - tolerance, temp_range[1] + tolerance)
                            if not (adjusted_range[0] <= value <= adjusted_range[1]):
                                valid = False
                    
                    # Humidity range check with tolerance
                    if 'hum' in field_name.lower() or 'moisture' in field_name.lower():
                        hum_range = signature.get('hum_range')
                        if hum_range:
                            tolerance = (hum_range[1] - hum_range[0]) * 0.1
                            adjusted_range = (max(0, hum_range[0] - tolerance), min(100, hum_range[1] + tolerance))
                            if not (adjusted_range[0] <= value <= adjusted_range[1]):
                                valid = False
                    
                    # Distance range check
                    if 'dist' in field_name.lower() or 'range' in field_name.lower():
                        dist_range = signature.get('range')
                        if dist_range:
                            if not (dist_range[0] <= value <= dist_range[1]):
                                valid = False
            
            if valid:
                return model
        
        # Infer from metadata patterns
        metadata_inference = self._infer_from_metadata(components, data_fields)
        if metadata_inference:
            return metadata_inference
        
        # Fallback: generate generic model name based on component types
        if component_types:
            return f"Generic_{'_'.join(sorted(component_types)[:3])}"
        
        return None
    
    def _match_hardware_from_field_patterns(self, field_names: set) -> Optional[str]:
        """Match hardware model from field name patterns."""
        # Single temperature field patterns
        if 'temperature' in field_names or 'temp' in field_names or 't' in field_names:
            if len(field_names) == 1:
                # Single temp field - likely DS18B20 or similar 1-wire
                if any('soil' in f for f in field_names):
                    return 'DS18B20'
                if any('ambient' in f or 'room' in f or 'indoor' in f for f in field_names):
                    return 'DS18B20'
                return 'DS18B20'
        
        # Temperature + Humidity patterns
        has_temp = any('temp' in f or 'temperature' in f for f in field_names)
        has_hum = any('hum' in f or 'humidity' in f for f in field_names)
        has_pressure = any('pressure' in f or 'press' in f for f in field_names)
        has_soil = any('soil' in f or 'moisture' in f for f in field_names)
        
        if has_temp and has_hum and has_pressure:
            return 'BME280'
        if has_temp and has_hum:
            # DHT11 has limited range (0-50°C, 20-90% RH)
            # Check if any field suggests outdoor or harsh conditions
            if any('outdoor' in f or 'industrial' in f for f in field_names):
                return 'DHT22'
            return 'DHT11'
        
        if has_soil and has_temp:
            return 'Capacitive_Soil'
        
        if has_pressure:
            if has_temp:
                return 'BMP280'
            return 'BMP180'
        
        return None
    
    def _infer_from_metadata(self, components: List[Component], data_fields: Dict) -> Optional[str]:
        """Infer hardware from metadata patterns."""
        for component in components:
            metadata = component.metadata or {}
            unit = metadata.get('unit', '').lower()
            
            if component.component_type == 'temperature':
                if '°c' in unit or '°f' in unit or 'celsius' in unit:
                    return 'DS18B20'
            elif component.component_type == 'humidity':
                if '%rh' in unit or '%' in unit:
                    # Check if paired with temperature
                    other_types = {c.component_type for c in components}
                    if 'temperature' in other_types:
                        return 'DHT11'  # Default DHT sensor for humidity
        
        return None
    
    def update_profile_from_samples(self, profile: HardwareProfile, samples: List[Dict]) -> HardwareProfile:
        """
        Update hardware profile with multiple samples for better detection.
        
        Args:
            profile: Existing hardware profile
            samples: List of sample payloads
            
        Returns:
            Updated profile with more accurate detection
        """
        all_fields = Counter()
        value_stats = {}
        
        for sample in samples:
            data_fields = self._extract_data_fields(sample)
            all_fields.update(data_fields.keys())
            
            for field_name, value in data_fields.items():
                if isinstance(value, (int, float)):
                    if field_name not in value_stats:
                        value_stats[field_name] = {'min': value, 'max': value, 'values': []}
                    stats = value_stats[field_name]
                    stats['min'] = min(stats['min'], value)
                    stats['max'] = max(stats['max'], value)
                    stats['values'].append(value)
        
        # Update component metadata with value ranges
        for component in profile.components:
            field_name = component.field_name
            if field_name in value_stats:
                stats = value_stats[field_name]
                component.metadata['observed_range'] = (stats['min'], stats['max'])
                
                # Detect if value is stable (potential flatline issue)
                if len(stats['values']) > 10:
                    variance = max(stats['values']) - min(stats['values'])
                    component.metadata['variance'] = variance
                    
                    if variance < 0.001:
                        component.metadata['flatline_warning'] = True
        
        return profile


class MultiFieldDetector:
    """
    Detects complex sensors that use multiple fields.
    E.g., GPS uses lat/lon, Power meter uses voltage/current/power.
    """
    
    # Fuzzy field name mapping for non-standard field names
    FUZZY_FIELD_MAP = {
        't': 'temperature', 'tmp': 'temperature',
        'h': 'humidity', 'rh': 'humidity',
        'p': 'pressure', 'press': 'pressure',
        'v': 'voltage', 'volt': 'voltage',
        'a': 'current', 'amp': 'current',
        'w': 'power', 'watts': 'power',
        'l': 'light', 'lux': 'light',
        'lat': 'latitude', 'lng': 'longitude', 'ln': 'longitude',
        'alt': 'altitude', 'gps_alt': 'gps_altitude',
        'spd': 'speed', 'hdg': 'heading',
        'co': 'co2', 'carbon': 'co2',
        'pm': 'pm25', 'dust': 'pm25',
        'smoke': 'gas', 'lpg': 'gas', 'ch4': 'gas',
        'dist': 'distance', 'rng': 'distance',
        'vl': 'voltage', 'cur': 'current',
        'watth': 'energy', 'wh': 'energy',
        'pf': 'power_factor',
    }
    
    def __init__(self):
        self.composite_patterns = {
            'gps': {
                'required': ['latitude', 'longitude'],
                'optional': ['altitude', 'gps_altitude', 'speed', 'heading']
            },
            'power_meter': {
                'required': ['voltage', 'current'],
                'optional': ['power', 'energy', 'power_factor']
            },
            'weather_station': {
                'required': ['temperature', 'humidity'],
                'optional': ['pressure', 'light', 'wind_speed', 'rain', 'soil_moisture']
            },
            'weather_station_extended': {
                'required': ['temperature', 'humidity', 'pressure', 'light'],
                'optional': ['wind_speed', 'wind_direction', 'rain', 'uv_index']
            },
            'air_quality': {
                'required': ['pm25'],
                'optional': ['pm10', 'co2', 'gas', 'temperature', 'humidity']
            },
            'air_quality_extended': {
                'required': ['pm25', 'pm10', 'co2', 'gas'],
                'optional': ['temperature', 'humidity', 'pressure']
            },
            'water_meter': {
                'required': ['flow_rate'],
                'optional': ['water_level', 'pressure', 'temperature', 'ph']
            },
            'water_quality': {
                'required': ['ph', 'temperature'],
                'optional': ['tds', 'conductivity', 'dissolved_oxygen', 'turbidity']
            },
            'motion_sensor': {
                'required': ['motion'],
                'optional': ['pir', 'presence', 'occupancy']
            },
            'door_sensor': {
                'required': ['door'],
                'optional': ['window', 'magnetic', 'reed', 'vibration']
            },
            'smart_valve': {
                'required': ['relay'],
                'optional': ['flow_rate', 'water_level', 'pressure']
            },
            'env_monitor': {
                'required': ['temperature', 'humidity', 'pressure'],
                'optional': ['co2', 'gas', 'pm25', 'light', 'sound']
            },
            'smart_meter': {
                'required': ['voltage', 'current', 'power'],
                'optional': ['energy', 'power_factor', 'frequency']
            },
            'battery_monitor': {
                'required': ['battery'],
                'optional': ['voltage', 'current', 'temperature', 'soc']
            },
            'soil_monitor': {
                'required': ['temperature', 'soil_moisture'],
                'optional': ['ph', 'light', 'humidity']
            },
            'industrial_sensor': {
                'required': ['temperature', 'pressure'],
                'optional': ['vibration', 'current', 'voltage', 'flow_rate']
            },
        }
    
    def _normalize_field(self, field: str) -> str:
        """Normalize field name using fuzzy mapping."""
        field_lower = field.lower()
        if field_lower in self.FUZZY_FIELD_MAP:
            return self.FUZZY_FIELD_MAP[field_lower]
        return field_lower
    
    def _normalize_fields(self, fields: List[str]) -> set:
        """Normalize all field names."""
        return {self._normalize_field(f) for f in fields}
    
    def detect_composite(self, fields: List[str]) -> Dict[str, float]:
        """
        Detect composite sensor types from field list.
        
        Returns:
            Dict mapping composite type to confidence score
        """
        results = {}
        normalized_fields = self._normalize_fields(fields)
        field_set = set(fields)  # Keep original for exact match
        
        for composite_type, patterns in self.composite_patterns.items():
            required = set(patterns['required'])
            optional = set(patterns['optional'])
            
            # Check required fields (normalized)
            required_match = len(required.intersection(normalized_fields))
            
            if required_match == len(required):
                # Calculate confidence based on matches
                total_fields = len(required) + len(optional)
                optional_match = len(optional.intersection(normalized_fields))
                matched = required_match + optional_match
                confidence = matched / total_fields
                
                # Boost confidence if original field names matched exactly
                original_match_count = sum(1 for f in required if f in field_set)
                if original_match_count == len(required):
                    confidence = min(1.0, confidence + 0.1)
                
                results[composite_type] = round(confidence, 3)
        
        return results
    
    def get_best_composite(self, fields: List[str]) -> Tuple[Optional[str], float]:
        """Get the best matching composite sensor type."""
        results = self.detect_composite(fields)
        if not results:
            return None, 0.0
        best = max(results.items(), key=lambda x: x[1])
        return best[0], best[1]


# Global instance
hardware_detector = HardwareDetector()
