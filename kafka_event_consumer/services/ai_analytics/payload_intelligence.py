# AI Analytics Services
# Phase 1: Payload Intelligence Engine

import json
import hashlib
from typing import Dict, List, Tuple, Any, Optional
from dataclasses import dataclass
from enum import Enum


class DataFormat(Enum):
    JSON = "json"
    NDJSON = "ndjson"
    CSV = "csv"
    KEY_VALUE = "key_value"
    CBOR = "cbor"
    MSGPACK = "msgpack"
    XML = "xml"
    UNKNOWN = "unknown"


@dataclass
class FieldInfo:
    path: str
    data_type: str
    role: str
    value_sample: Any = None
    semantic_type: Optional[str] = None
    semantic_confidence: float = 0.0


@dataclass
class SchemaInfo:
    format: DataFormat
    format_confidence: float
    fields: List[FieldInfo]
    schema_hash: str
    schema_version: int


class FormatDetector:
    """
    Detects payload format with confidence score.
    Priority: Explicit metadata > Magic bytes > Heuristic parsing.
    """
    
    def __init__(self):
        self.format_detectors = {
            DataFormat.JSON: self._detect_json,
            DataFormat.CBOR: self._detect_cbor,
            DataFormat.MSGPACK: self._detect_msgpack,
            DataFormat.NDJSON: self._detect_ndjson,
            DataFormat.CSV: self._detect_csv,
            DataFormat.KEY_VALUE: self._detect_key_value,
            DataFormat.XML: self._detect_xml,
        }
    
    def detect(self, raw_bytes: bytes, content_type: Optional[str] = None) -> Tuple[DataFormat, float]:
        """
        Detect format and return (format, confidence).
        """
        # 1. Check explicit content-type header
        if content_type:
            fmt = self._format_from_content_type(content_type)
            if fmt != DataFormat.UNKNOWN:
                return fmt, 1.0
        
        # 2. Check magic bytes first (fast path)
        magic_result = self._detect_magic_bytes(raw_bytes)
        if magic_result:
            return magic_result
        
        # 3. Try each parser and get confidence
        candidates = []
        for fmt, detector in self.format_detectors.items():
            if fmt in (DataFormat.JSON, DataFormat.NDJSON, DataFormat.CBOR, DataFormat.MSGPACK):
                confidence = detector(raw_bytes)
                if confidence > 0.5:
                    candidates.append((fmt, confidence))
        
        # 4. Also try heuristic parsers
        for fmt, detector in self.format_detectors.items():
            if fmt not in (DataFormat.JSON, DataFormat.NDJSON, DataFormat.CBOR, DataFormat.MSGPACK):
                confidence = detector(raw_bytes)
                if confidence > 0.3:
                    candidates.append((fmt, confidence))
        
        if not candidates:
            return DataFormat.UNKNOWN, 0.0
        
        # Return highest confidence candidate
        return max(candidates, key=lambda x: x[1])
    
    def _detect_magic_bytes(self, raw_bytes: bytes) -> Optional[Tuple[DataFormat, float]]:
        """Detect format by magic bytes."""
        if len(raw_bytes) < 2:
            return None
        
        # CBOR starts with specific bytes
        if raw_bytes[0] in (0xd8, 0xd9, 0xda, 0xdb, 0xdc, 0xdd, 0xde, 0xdf):
            return DataFormat.CBOR, 0.95
        
        # MessagePack marks
        first = raw_bytes[0]
        if 0x80 <= first <= 0x8f:  # Fixmap
            return DataFormat.MSGPACK, 0.95
        if 0x90 <= first <= 0x9f:  # Fixarray
            return DataFormat.MSGPACK, 0.95
        if 0xa0 <= first <= 0xbf:  # Fixstr
            return DataFormat.MSGPACK, 0.95
        if 0xc0 <= first <= 0xdf:  # Various types
            if first in (0xc0, 0xc1, 0xc2, 0xc3, 0xc4, 0xc5, 0xc6, 0xc7, 0xc8, 0xc9):
                return DataFormat.MSGPACK, 0.95
        
        return None
    
    def _format_from_content_type(self, content_type: str) -> DataFormat:
        """Map Content-Type header to format."""
        ct = content_type.lower()
        if 'json' in ct:
            return DataFormat.JSON
        if 'xml' in ct:
            return DataFormat.XML
        if 'csv' in ct:
            return DataFormat.CSV
        if 'cbor' in ct:
            return DataFormat.CBOR
        if 'msgpack' in ct or ' MessagePack' in ct:
            return DataFormat.MSGPACK
        return DataFormat.UNKNOWN
    
    def _detect_json(self, raw_bytes: bytes) -> float:
        """Detect JSON with high confidence if valid."""
        try:
            json.loads(raw_bytes.decode('utf-8'))
            return 1.0
        except:
            return 0.0
    
    def _detect_ndjson(self, raw_bytes: bytes) -> float:
        """Detect NDJSON (Newline Delimited JSON)."""
        try:
            text = raw_bytes.decode('utf-8')
            lines = text.strip().split('\n')
            if len(lines) < 2:
                return 0.0
            
            valid_count = 0
            for line in lines[:10]:  # Check first 10 lines
                try:
                    json.loads(line)
                    valid_count += 1
                except:
                    pass
            
            return valid_count / min(len(lines), 10)
        except:
            return 0.0
    
    def _detect_cbor(self, raw_bytes: bytes) -> float:
        """Detect CBOR format."""
        try:
            import cbor2
            cbor2.loads(raw_bytes)
            return 0.95
        except:
            return 0.0
    
    def _detect_msgpack(self, raw_bytes: bytes) -> float:
        """Detect MessagePack format."""
        try:
            import msgpack
            msgpack.unpackb(raw_bytes, raw=False)
            return 0.95
        except:
            return 0.0
    
    def _detect_csv(self, raw_bytes: bytes) -> float:
        """Detect CSV with heuristics."""
        try:
            text = raw_bytes.decode('utf-8')
            lines = text.strip().split('\n')
            if len(lines) < 2:
                return 0.0
            
            # Check if lines have consistent comma count
            first_line_commas = lines[0].count(',')
            if first_line_commas == 0:
                return 0.0
            
            consistent = sum(1 for line in lines[1:10] if line.count(',') == first_line_commas)
            return consistent / min(len(lines) - 1, 10) if len(lines) > 1 else 0.0
        except:
            return 0.0
    
    def _detect_key_value(self, raw_bytes: bytes) -> float:
        """Detect key=value format."""
        try:
            text = raw_bytes.decode('utf-8')
            lines = text.strip().split('\n')
            if len(lines) < 1:
                return 0.0
            
            valid_pairs = 0
            for line in lines[:10]:
                if '=' in line and len(line.split('=', 1)) == 2:
                    valid_pairs += 1
            
            return valid_pairs / min(len(lines), 10)
        except:
            return 0.0
    
    def _detect_xml(self, raw_bytes: bytes) -> float:
        """Detect XML."""
        try:
            text = raw_bytes.decode('utf-8').strip()
            return 1.0 if text.startswith('<?xml') or text.startswith('<') else 0.0
        except:
            return 0.0


class SchemaInferrer:
    """
    Recursively flattens and infers schema from parsed payload.
    """
    
    def infer(self, parsed: Any, prefix: str = "$") -> List[FieldInfo]:
        """
        Recursively flatten nested structures and infer field types.
        Returns list of FieldInfo with path, type, and sample value.
        """
        fields = []
        
        if isinstance(parsed, dict):
            for key, value in parsed.items():
                path = f"{prefix}.{key}"
                fields.extend(self._infer_value(value, path))
        
        elif isinstance(parsed, list):
            # For arrays, infer schema from first element
            if len(parsed) > 0:
                fields.extend(self._infer_value(parsed[0], f"{prefix}[0]"))
        
        return fields
    
    def _infer_value(self, value: Any, path: str) -> List[FieldInfo]:
        """Infer type and return FieldInfo list."""
        fields = []
        
        if value is None:
            fields.append(FieldInfo(
                path=path,
                data_type="null",
                role="unknown",
                value_sample=None
            ))
        elif isinstance(value, bool):
            # Check if it's binary (0/1) or boolean
            fields.append(FieldInfo(
                path=path,
                data_type="boolean",
                role="binary_state" if value in (0, 1, True, False) else "categorical_state",
                value_sample=value
            ))
        elif isinstance(value, int):
            fields.append(FieldInfo(
                path=path,
                data_type="integer",
                role="numeric_metric",  # Default, will be refined by RoleClassifier
                value_sample=value
            ))
        elif isinstance(value, float):
            fields.append(FieldInfo(
                path=path,
                data_type="float",
                role="numeric_metric",
                value_sample=value
            ))
        elif isinstance(value, str):
            fields.append(FieldInfo(
                path=path,
                data_type="string",
                role="identifier",  # Default for strings, will be refined
                value_sample=value
            ))
        elif isinstance(value, dict):
            fields.append(FieldInfo(
                path=path,
                data_type="object",
                role="metadata",
                value_sample=None
            ))
            # Recurse into nested object
            for k, v in value.items():
                fields.extend(self._infer_value(v, f"{path}.{k}"))
        elif isinstance(value, list):
            fields.append(FieldInfo(
                path=path,
                data_type="array",
                role="metadata",
                value_sample=None
            ))
        
        return fields


class SchemaFingerprint:
    """
    Generates canonical schema fingerprint (SHA256 hash).
    """
    
    def generate(self, fields: List[FieldInfo]) -> str:
        """
        Generate canonical representation and hash.
        Format: "field1:type,field2:type,..." (alphabetically sorted)
        """
        # Create canonical representation
        canonical_parts = []
        for f in sorted(fields, key=lambda x: x.path):
            canonical_parts.append(f"{f.path}:{f.data_type}")
        
        canonical = ",".join(canonical_parts)
        
        # Generate SHA256 hash
        return hashlib.sha256(canonical.encode('utf-8')).hexdigest()[:16]  # First 16 chars
    
    def canonicalize(self, fields: List[FieldInfo]) -> str:
        """Return canonical string representation."""
        parts = []
        for f in sorted(fields, key=lambda x: x.path):
            parts.append(f"{f.path}:{f.data_type}")
        return ",".join(parts)


# Global instances
format_detector = FormatDetector()
schema_inferrer = SchemaInferrer()
schema_fingerprint = SchemaFingerprint()
