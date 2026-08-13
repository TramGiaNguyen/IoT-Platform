# Metric Normalizer
# Converts parsed payloads to generic metric events

from typing import Dict, List, Any, Optional
from dataclasses import dataclass
from datetime import datetime
import json

from .payload_intelligence import (
    FormatDetector, SchemaInferrer, SchemaFingerprint,
    FieldInfo, SchemaInfo, DataFormat, format_detector, schema_inferrer, schema_fingerprint
)
from .field_classifier import FieldRoleClassifier, field_role_classifier


@dataclass
class MetricEvent:
    """A normalized metric data point."""
    metric_id: Optional[int]  # Database ID, None if new
    device_id: str
    source_path: str
    timestamp: datetime
    value: Any
    unit: Optional[str] = None
    quality: float = 1.0


@dataclass
class NormalizationResult:
    """Result of payload normalization."""
    device_id: str
    format: DataFormat
    format_confidence: float
    schema_hash: str
    schema_version: int
    metrics: List[MetricEvent]
    metadata: Dict[str, Any]  # Identifiers, timestamps, etc.
    errors: List[str]


class MetricNormalizer:
    """
    Main entry point for payload normalization.
    Converts any device payload to generic metric events.
    """
    
    def __init__(self):
        self.format_detector = format_detector
        self.schema_inferrer = schema_inferrer
        self.schema_fingerprint = schema_fingerprint
        self.field_classifier = field_role_classifier
    
    def normalize(
        self,
        raw_payload: bytes,
        device_id: str,
        timestamp: Optional[datetime] = None,
        content_type: Optional[str] = None,
        topic: Optional[str] = None
    ) -> NormalizationResult:
        """
        Normalize raw payload to generic metrics.
        
        Args:
            raw_payload: Raw bytes from device
            device_id: Device identifier
            timestamp: Event timestamp (default: now)
            content_type: Content-Type header if available
            topic: MQTT topic if available
        
        Returns:
            NormalizationResult with metrics and metadata
        """
        timestamp = timestamp or datetime.utcnow()
        errors = []
        
        # 1. Detect format
        fmt, fmt_confidence = self.format_detector.detect(raw_payload, content_type)
        if fmt == DataFormat.UNKNOWN:
            errors.append(f"Could not detect format (confidence: {fmt_confidence})")
        
        # 2. Parse payload
        parsed = self._parse_payload(raw_payload, fmt)
        if parsed is None:
            errors.append("Failed to parse payload")
            return NormalizationResult(
                device_id=device_id,
                format=fmt,
                format_confidence=fmt_confidence,
                schema_hash="",
                schema_version=0,
                metrics=[],
                metadata={},
                errors=errors
            )
        
        # 3. Extract device_id from payload if not provided
        if not device_id:
            device_id = self._extract_device_id(parsed) or "unknown"
        
        # 4. Infer schema
        fields = self.schema_inferrer.infer(parsed)
        
        # 5. Generate schema fingerprint
        schema_hash = self.schema_fingerprint.generate(fields)
        
        # 6. Classify fields and extract metrics
        metrics, metadata = self._extract_metrics_and_metadata(
            parsed, fields, device_id, timestamp
        )
        
        # 7. Determine schema version (would need DB lookup in real implementation)
        schema_version = 1  # Placeholder
        
        return NormalizationResult(
            device_id=device_id,
            format=fmt,
            format_confidence=fmt_confidence,
            schema_hash=schema_hash,
            schema_version=schema_version,
            metrics=metrics,
            metadata=metadata,
            errors=errors
        )
    
    def _parse_payload(self, raw_payload: bytes, fmt: DataFormat) -> Optional[Any]:
        """Parse raw payload based on detected format."""
        try:
            if fmt == DataFormat.JSON:
                return json.loads(raw_payload.decode('utf-8'))
            
            elif fmt == DataFormat.NDJSON:
                # Newline-delimited JSON - return first object or list
                text = raw_payload.decode('utf-8')
                lines = text.strip().split('\n')
                if lines:
                    return json.loads(lines[0])
                return None
            
            elif fmt == DataFormat.CSV:
                return self._parse_csv(raw_payload)
            
            elif fmt == DataFormat.KEY_VALUE:
                return self._parse_key_value(raw_payload)
            
            elif fmt == DataFormat.XML:
                return self._parse_xml(raw_payload)
            
            elif fmt == DataFormat.CBOR:
                try:
                    import cbor2
                    return cbor2.loads(raw_payload)
                except ImportError:
                    return None
            
            elif fmt == DataFormat.MSGPACK:
                try:
                    import msgpack
                    return msgpack.unpackb(raw_payload, raw=False)
                except ImportError:
                    return None
            
            else:
                # Try JSON as fallback
                try:
                    return json.loads(raw_payload.decode('utf-8'))
                except:
                    return None
        
        except Exception as e:
            return None
    
    def _parse_csv(self, raw_payload: bytes) -> Dict[str, Any]:
        """Parse CSV to dict (first row = headers)."""
        try:
            text = raw_payload.decode('utf-8')
            lines = text.strip().split('\n')
            if len(lines) < 2:
                return {}
            
            headers = lines[0].split(',')
            values = lines[1].split(',')
            
            result = {}
            for i, header in enumerate(headers):
                if i < len(values):
                    # Try to convert to number
                    try:
                        val = float(values[i])
                        result[header.strip()] = val if '.' in values[i] else int(val)
                    except ValueError:
                        result[header.strip()] = values[i].strip()
            
            return result
        except:
            return {}
    
    def _parse_key_value(self, raw_payload: bytes) -> Dict[str, Any]:
        """Parse key=value format."""
        try:
            text = raw_payload.decode('utf-8')
            result = {}
            for line in text.strip().split('\n'):
                if '=' in line:
                    key, value = line.split('=', 1)
                    key = key.strip()
                    # Try to convert to number
                    try:
                        result[key] = float(value.strip())
                    except ValueError:
                        result[key] = value.strip()
            return result
        except:
            return {}
    
    def _parse_xml(self, raw_payload: bytes) -> Dict[str, Any]:
        """Simple XML to dict conversion."""
        try:
            import xml.etree.ElementTree as ET
            root = ET.fromstring(raw_payload)
            return self._xml_to_dict(root)
        except:
            return {}
    
    def _xml_to_dict(self, element) -> Dict[str, Any]:
        """Recursively convert XML element to dict."""
        result = {}
        for child in element:
            if len(child) > 0:
                result[child.tag] = self._xml_to_dict(child)
            else:
                result[child.tag] = child.text
        return result
    
    def _extract_device_id(self, parsed: Any) -> Optional[str]:
        """Extract device_id from payload if present."""
        if isinstance(parsed, dict):
            for key in ('device', 'device_id', 'id', 'name', 'node'):
                if key in parsed:
                    return str(parsed[key])
        return None
    
    def _extract_metrics_and_metadata(
        self,
        parsed: Any,
        fields: List[FieldInfo],
        device_id: str,
        timestamp: datetime
    ) -> tuple[List[MetricEvent], Dict[str, Any]]:
        """Extract metrics and metadata from parsed payload."""
        metrics = []
        metadata = {}
        
        # Build a lookup for field values
        field_values = self._flatten_values(parsed)
        
        for field in fields:
            # Classify field role
            role_result = self.field_role_classifier.classify(field, field_values.get(field.path))
            
            if role_result.role in ('identifier', 'timestamp'):
                # Store as metadata
                metadata[field.path] = {
                    'role': role_result.role,
                    'value': field_values.get(field.path),
                    'confidence': role_result.confidence
                }
            
            elif role_result.role in ('numeric_metric', 'binary_state', 'counter'):
                # Create metric event
                value = field_values.get(field.path)
                if value is not None:
                    metrics.append(MetricEvent(
                        metric_id=None,  # Will be resolved by caller
                        device_id=device_id,
                        source_path=field.path,
                        timestamp=timestamp,
                        value=value
                    ))
            
            elif role_result.role in ('categorical_state', 'metadata'):
                metadata[field.path] = {
                    'role': role_result.role,
                    'value': field_values.get(field.path)
                }
        
        return metrics, metadata
    
    def _flatten_values(self, parsed: Any, prefix: str = "$") -> Dict[str, Any]:
        """Flatten nested structure and extract all values with paths."""
        values = {}
        
        if isinstance(parsed, dict):
            for key, value in parsed.items():
                path = f"{prefix}.{key}"
                if isinstance(value, (dict, list)):
                    values.update(self._flatten_values(value, path))
                else:
                    values[path] = value
        
        elif isinstance(parsed, list) and len(parsed) > 0:
            # Extract values from first element
            if isinstance(parsed[0], dict):
                values.update(self._flatten_values(parsed[0], f"{prefix}[0]"))
            else:
                values[f"{prefix}[0]"] = parsed[0]
        
        return values
    
    @property
    def field_role_classifier(self):
        """Get field classifier instance."""
        return field_role_classifier


# Global instance
metric_normalizer = MetricNormalizer()
