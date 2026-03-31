# mqtt_to_kafka/profile_transformer.py
"""
Áp dụng device profile: field_mapping, unit_convert, timestamp_format.
Chuẩn hóa payload trước khi gửi Kafka.
"""

import json
import os
import time
import logging

MYSQL_CONFIG = {
    "host": os.getenv("MYSQL_HOST", "mysql"),
    "user": os.getenv("MYSQL_USER", "iot"),
    "password": os.getenv("MYSQL_PASSWORD", "iot123"),
    "database": os.getenv("MYSQL_DATABASE", "iot_data"),
}

_profile_cache = {}
_cache_loaded_at = 0
CACHE_TTL = 60  # seconds


def _get_mysql_conn():
    import mysql.connector
    return mysql.connector.connect(**MYSQL_CONFIG)


def load_profiles():
    """Load device profiles from MySQL. Cache for CACHE_TTL."""
    global _profile_cache, _cache_loaded_at
    now = time.time()
    if now - _cache_loaded_at < CACHE_TTL and _profile_cache:
        return _profile_cache
    try:
        conn = _get_mysql_conn()
        cursor = conn.cursor(dictionary=True)
        cursor.execute(
            "SELECT device_id, device_type, config FROM device_profiles WHERE config IS NOT NULL"
        )
        rows = cursor.fetchall()
        _profile_cache = {}
        for r in rows:
            cfg = r.get("config")
            if isinstance(cfg, str):
                try:
                    cfg = json.loads(cfg)
                except Exception:
                    cfg = {}
            dev_id = r.get("device_id")
            dev_type = r.get("device_type")
            if dev_id:
                _profile_cache[f"device:{dev_id}"] = cfg
            if dev_type:
                _profile_cache[f"type:{dev_type}"] = cfg
        _cache_loaded_at = now
        cursor.close()
        conn.close()
    except Exception as e:
        logging.warning(f"[PROFILE] Load failed: {e}")
    return _profile_cache


def get_profile_for_device(device_id, device_type=None):
    """Get profile: device-specific first, then type fallback."""
    profiles = load_profiles()
    if device_id and f"device:{device_id}" in profiles:
        return profiles[f"device:{device_id}"]
    if device_type and f"type:{device_type}" in profiles:
        return profiles[f"type:{device_type}"]
    return None


def apply_profile(payload, device_id, device_type=None):
    """
    Apply profile transformation to payload.
    Returns transformed payload (new dict).
    """
    profile = get_profile_for_device(device_id, device_type)
    if not profile:
        return payload

    result = dict(payload)
    cfg = profile if isinstance(profile, dict) else {}

    # 1. Field mapping
    field_mapping = cfg.get("field_mapping") or {}
    for src, dst in field_mapping.items():
        if src in result and dst:
            result[dst] = result.pop(src)

    # 2. Unit conversion
    unit_convert = cfg.get("unit_convert") or {}
    for field, spec in unit_convert.items():
        if field not in result or result[field] is None:
            continue
        try:
            val = float(result[field])
            if isinstance(spec, dict):
                if "factor" in spec:
                    result[field] = val * float(spec["factor"])
                elif spec.get("from") == "fahrenheit" and spec.get("to") == "celsius":
                    result[field] = (val - 32) * 5 / 9
                elif spec.get("from") == "celsius" and spec.get("to") == "fahrenheit":
                    result[field] = val * 9 / 5 + 32
        except (ValueError, TypeError):
            pass

    # 3. Timestamp normalization
    ts_format = cfg.get("timestamp_format") or "unix"
    if "timestamp" in result and result["timestamp"] is not None:
        try:
            ts = result["timestamp"]
            if ts_format == "unix_ms":
                result["timestamp"] = float(ts) / 1000.0
            elif ts_format == "iso8601":
                from datetime import datetime
                if isinstance(ts, str):
                    dt = datetime.fromisoformat(ts.replace("Z", "+00:00"))
                    result["timestamp"] = dt.timestamp()
            else:
                result["timestamp"] = float(ts)
        except Exception:
            result["timestamp"] = time.time()
    elif "timestamp" not in result or result.get("timestamp") is None:
        result["timestamp"] = time.time()

    return result
