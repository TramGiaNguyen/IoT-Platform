"""
Phase 4 - Standalone Kafka event consumer.

Trach nhiem:
- Consume Kafka topic `iot-events` (1 instance duy nhat, tranh duplicate o multi-worker)
- Batch UPDATE `thiet_bi.last_seen` + `trang_thai='online'` (gom 5s flush 1 lan)
- Publish moi event len Redis Pub/Sub channel `ws:events` de moi FastAPI worker
  forward den WS client cua worker do
- Cache 100 event moi nhat vao Redis list `ws:latest_events` de WS moi ket noi
  lay initial state (share giua cac worker)

Thay the cho `kafka_consumer.py` (cu) dang chay trong FastAPI process, gay duplicate
khi co nhieu workers.
"""

import json
import os
import time
import threading
import atexit
from datetime import datetime
from typing import List

from confluent_kafka import Consumer, KafkaError, KafkaException
import redis
import mysql.connector


# ===== Config =====
KAFKA_BOOTSTRAP = os.getenv("KAFKA_BOOTSTRAP_SERVERS", "kafka:9092")
KAFKA_TOPIC = os.getenv("KAFKA_TOPIC", "iot-events")
KAFKA_GROUP_ID = os.getenv("KAFKA_GROUP_ID", "fastapi-event-bridge")

REDIS_HOST = os.getenv("REDIS_HOST", "redis")
REDIS_PORT = int(os.getenv("REDIS_PORT", 6379))
WS_CHANNEL = "ws:events"
WS_LATEST_KEY = "ws:latest_events"
WS_LATEST_MAX = 100

MYSQL_CONFIG = {
    "host":     os.getenv("MYSQL_HOST", "mysql"),
    "user":     os.getenv("MYSQL_USER", "iot"),
    "password": os.getenv("MYSQL_PASSWORD", "iot123"),
    "database": os.getenv("MYSQL_DATABASE", "iot_data"),
}

FLUSH_INTERVAL_SEC = 5
MAX_RETRIES = 10
BASE_DELAY = 1


# ===== Redis connection with retry =====
def _create_redis_connection(max_retries=MAX_RETRIES, base_delay=BASE_DELAY):
    """Create Redis connection with exponential backoff retry."""
    for attempt in range(max_retries):
        try:
            r = redis.Redis(host=REDIS_HOST, port=REDIS_PORT, decode_responses=True)
            r.ping()
            return r
        except redis.ConnectionError as e:
            if attempt < max_retries - 1:
                delay = base_delay * (2 ** attempt)
                print(f"[KAFKA-CONSUMER] Redis not ready, retrying in {delay}s... ({attempt+1}/{max_retries})")
                time.sleep(delay)
            else:
                raise redis.ConnectionError(f"Failed to connect to Redis after {max_retries} attempts") from e


def _redis_publish_with_retry(r, channel, payload, max_retries=3):
    """Publish to Redis with retry and reconnection logic."""
    for attempt in range(max_retries):
        try:
            r.publish(channel, payload)
            r.lpush(WS_LATEST_KEY, payload)
            r.ltrim(WS_LATEST_KEY, 0, WS_LATEST_MAX - 1)
            return True
        except redis.ConnectionError:
            if attempt < max_retries - 1:
                delay = 0.5 * (2 ** attempt)
                time.sleep(delay)
                r = _create_redis_connection(max_retries=3, base_delay=0.5)
            else:
                print(f"[KAFKA-CONSUMER] Redis publish failed after {max_retries} attempts")
                return False
    return False


# ===== MySQL batch update (mirror kafka_consumer._flush_last_seen_updates) =====
_last_seen_updates: dict[str, float] = {}
_updates_lock = threading.Lock()
_last_flush_ts = time.time()


def _flush_last_seen_updates() -> None:
    """
    Batch UPDATE thiet_bi.last_seen + trang_thai='online' cho cac device
    trong _last_seen_updates. Moi thiet bi chi update neu last_seen hien tai
    trong DB cu hon now (tranh ghi de neu da duoc update tu nguon khac).
    """
    global _last_flush_ts
    with _updates_lock:
        if not _last_seen_updates:
            return
        items = list(_last_seen_updates.items())
        _last_seen_updates.clear()

    try:
        conn = mysql.connector.connect(**MYSQL_CONFIG)
        cursor = conn.cursor()
        now = datetime.utcnow()
        updated = 0
        for dev_id, _ in items:
            try:
                cursor.execute(
                    """UPDATE thiet_bi
                       SET last_seen = %s, trang_thai = 'online'
                       WHERE ma_thiet_bi = %s AND last_seen < %s""",
                    (now, dev_id, now),
                )
                updated += cursor.rowcount
            except Exception:
                pass
        conn.commit()
        cursor.close()
        conn.close()
        if updated:
            print(f"[KAFKA-CONSUMER] Updated last_seen for {updated} device(s)")
    except Exception as e:
        print(f"[KAFKA-CONSUMER] MySQL flush error: {e}")
    finally:
        _last_flush_ts = time.time()


def _track_last_seen(event: dict) -> None:
    """Track device_id nhan duoc event (dung current time, khong dung event timestamp)."""
    dev_id = event.get("device_id")
    if not dev_id:
        return
    with _updates_lock:
        _last_seen_updates[dev_id] = time.time()


atexit.register(_flush_last_seen_updates)


# ===== AI Analytics pipeline =====
import json as _json
import threading as _threading
from datetime import datetime as _dt

AI_SCHEMA_DEBOUNCE_TTL = 60  # seconds between re-analysis per device
AI_SCHEMA_LOCK_PREFIX = "ai:schema:"
_ai_processing: dict = {}
_ai_lock = _threading.Lock()

# Lazy-load normalizer (avail after services/ copy)
_normalizer = None
_hardware_detector = None

def _get_normalizer():
    global _normalizer
    if _normalizer is None:
        from services.ai_analytics.metric_normalizer import MetricNormalizer
        _normalizer = MetricNormalizer()
    return _normalizer

def _get_hardware_detector():
    global _hardware_detector
    if _hardware_detector is None:
        from services.ai_analytics.hardware_detector import HardwareDetector
        _hardware_detector = HardwareDetector()
    return _hardware_detector


def _is_ai_debounced(r, device_id: str) -> bool:
    """Return True if this device was analyzed within the last TTL seconds."""
    key = f"{AI_SCHEMA_LOCK_PREFIX}{device_id}"
    return r.exists(key) == 1


def _set_ai_debounce(r, device_id: str) -> None:
    """Mark this device as recently analyzed (TTL seconds)."""
    key = f"{AI_SCHEMA_LOCK_PREFIX}{device_id}"
    r.set(key, "1", ex=AI_SCHEMA_DEBOUNCE_TTL)


def _upsert_hardware_components(device_id: str, payload: dict, profile) -> None:
    """
    Upsert detected hardware components into device_components table.
    Runs after normalization to detect hardware from payload.
    """
    if not device_id or not profile:
        return

    conn = None
    cursor = None
    try:
        conn = mysql.connector.connect(**MYSQL_CONFIG)
        cursor = conn.cursor(dictionary=True)

        existing_components = {}
        cursor.execute("""
            SELECT id, component_id, component_type, field_name
            FROM device_components
            WHERE device_id = %s
        """, (device_id,))
        for row in cursor.fetchall():
            existing_components[row['field_name']] = row

        import json as _json
        for component in profile.components:
            field_name = component.field_name

            # Check if component already exists
            if field_name in existing_components:
                # Update existing component
                existing = existing_components[field_name]
                cursor.execute("""
                    UPDATE device_components
                    SET hardware_model = %s,
                        connection_type = %s,
                        detection_confidence = %s,
                        device_type = %s,
                        device_type_confidence = %s,
                        metadata = %s,
                        last_seen = NOW()
                    WHERE id = %s
                """, (
                    component.hardware_model,
                    component.connection_type,
                    component.detection_confidence,
                    profile.device_type,
                    profile.device_type_confidence,
                    _json.dumps(component.metadata) if component.metadata else None,
                    existing['id']
                ))
            else:
                # Insert new component
                cursor.execute("""
                    INSERT INTO device_components
                    (device_id, component_id, component_type, field_name,
                     hardware_model, connection_type, detection_confidence,
                     device_type, device_type_confidence, metadata,
                     health_status, health_score)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, 'unknown', 1.0)
                    ON DUPLICATE KEY UPDATE
                        hardware_model = VALUES(hardware_model),
                        connection_type = VALUES(connection_type),
                        detection_confidence = VALUES(detection_confidence),
                        device_type = VALUES(device_type),
                        device_type_confidence = VALUES(device_type_confidence),
                        metadata = VALUES(metadata),
                        last_seen = NOW()
                """, (
                    device_id,
                    component.component_id,
                    component.component_type,
                    field_name,
                    component.hardware_model,
                    component.connection_type,
                    component.detection_confidence,
                    profile.device_type,
                    profile.device_type_confidence,
                    _json.dumps(component.metadata) if component.metadata else None,
                ))

                # Log component detection event
                cursor.execute("""
                    INSERT INTO component_events
                    (device_id, component_id, event_type, severity, details)
                    VALUES (%s, %s, 'detected', 'info', %s)
                """, (
                    device_id,
                    component.component_id,
                    _json.dumps({
                        'component_type': component.component_type,
                        'hardware_model': component.hardware_model,
                        'confidence': component.detection_confidence
                    })
                ))

        conn.commit()
        print(f"[HARDWARE-DETECTOR] Updated {len(profile.components)} components for {device_id}")

    except Exception as e:
        print(f"[HARDWARE-DETECTOR] Component upsert error for {device_id}: {e}")
        if conn:
            conn.rollback()
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()


def _upsert_ai_analytics(device_id: str, result) -> None:
    """
    Upsert device_payload_schemas + metrics into MySQL.
    Also marks thiet_bi.analyzed = 1 on first analysis.
    Runs in the Kafka consumer thread (non-blocking per event).
    """
    if not device_id:
        return

    conn = None
    cursor = None
    try:
        conn = mysql.connector.connect(**MYSQL_CONFIG)
        cursor = conn.cursor(dictionary=True)

        # ---- Upsert device_payload_schemas ----
        fields_json = _json.dumps([
            {
                "path": m.source_path,
                "data_type": type(m.value).__name__,
                "role": "metric",
                "semantic_type": None,
                "semantic_confidence": 0.0,
            }
            for m in result.metrics
        ])

        # Upsert device_payload_schemas using only existing columns
        # UNIQUE KEY (device_id, schema_hash) — duplicate means same schema hash, skip
        cursor.execute("""
            INSERT INTO device_payload_schemas
                (device_id, schema_hash, schema_version, fields)
            VALUES (%s, %s, %s, %s)
            ON DUPLICATE KEY UPDATE
                schema_version = GREATEST(VALUES(schema_version), schema_version),
                fields = VALUES(fields)
        """, (
            device_id,
            result.schema_hash or "",
            result.schema_version or 1,
            fields_json,
        ))
        conn.commit()

        # ---- Upsert each metric into metrics table ----
        for metric in result.metrics:
            semantic_type = "UNKNOWN_NUMERIC"
            semantic_confidence = 0.0
            unit = None
            data_type = "FLOAT"

            if hasattr(metric, 'value'):
                if isinstance(metric.value, bool):
                    data_type = "BOOL"
                elif isinstance(metric.value, int):
                    data_type = "INT"
                elif isinstance(metric.value, str):
                    data_type = "STRING"

            # Insert or update metric
            cursor.execute("""
                INSERT INTO metrics
                    (device_id, source_path, data_type, semantic_type, semantic_confidence, unit, status)
                VALUES (%s, %s, %s, %s, %s, %s, %s)
                ON DUPLICATE KEY UPDATE
                    data_type = VALUES(data_type),
                    unit = VALUES(unit),
                    status = IF(status = 'DISCOVERED', VALUES(status), status)
            """, (
                device_id,
                metric.source_path,
                data_type,
                semantic_type,
                semantic_confidence,
                unit,
                "LEARNING",
            ))
        conn.commit()

        # ---- Schema Drift Detection ----
        # Compare current schema_hash with previous version
        try:
            cursor.execute("""
                SELECT schema_hash, fields, schema_version
                FROM device_payload_schemas
                WHERE device_id = %s
                ORDER BY schema_version DESC
                LIMIT 2
            """, (device_id,))
            schemas = cursor.fetchall()

            if len(schemas) >= 2:
                current_hash = result.schema_hash or ""
                previous_hash = schemas[0]['schema_hash'] if schemas[0] else None
                previous_fields = schemas[0]['fields'] if schemas[0] else "[]"
                prev_version = schemas[0]['schema_version'] if schemas[0] else 0

                if previous_hash and current_hash != previous_hash:
                    # Schema changed! Compute field diff
                    import json as _json
                    current_fields = fields_json
                    prev_fields_list = _json.loads(previous_fields)
                    curr_fields_list = _json.loads(current_fields)

                    prev_field_names = {f['path'] for f in prev_fields_list}
                    curr_field_names = {f['path'] for f in curr_fields_list}

                    fields_removed = list(prev_field_names - curr_field_names)
                    fields_added = list(curr_field_names - prev_field_names)

                    # Log schema drift
                    cursor.execute("""
                        INSERT INTO schema_drift_log
                            (device_id, old_schema_hash, new_schema_hash,
                             old_version, new_version, fields_removed, fields_added, drift_confidence)
                        VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                    """, (
                        device_id,
                        previous_hash,
                        current_hash,
                        prev_version,
                        result.schema_version or 1,
                        _json.dumps(fields_removed),
                        _json.dumps(fields_added),
                        0.95,
                    ))
                    print(f"[AI-ANALYTICS] Schema drift detected for {device_id}: "
                          f"+{len(fields_added)} -{len(fields_removed)} fields")
        except Exception as drift_err:
            print(f"[AI-ANALYTICS] Schema drift detection error for {device_id}: {drift_err}")

        # ---- Mark device as analyzed (first time only) ----
        cursor.execute("""
            UPDATE thiet_bi
            SET is_analyzed = 1
            WHERE ma_thiet_bi = %s
              AND (is_analyzed IS NULL OR is_analyzed = 0)
        """, (device_id,))
        conn.commit()

    except Exception as e:
        print(f"[AI-ANALYTICS] DB upsert error for {device_id}: {e}")
        if conn:
            conn.rollback()
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()


def _generate_hardware_alerts(device_id: str) -> None:
    """
    Generate AI alerts for hardware component issues.
    Checks for: flatline sensors, missing components, health degradation.
    """
    import json as _json
    conn = None
    cursor = None
    try:
        conn = mysql.connector.connect(**MYSQL_CONFIG)
        cursor = conn.cursor(dictionary=True)

        # Check for components with health issues
        cursor.execute("""
            SELECT id, component_id, component_type, health_score,
                   last_health_check, metadata
            FROM device_components
            WHERE device_id = %s
              AND (health_score IS NOT NULL AND health_score < 0.7)
              AND (
                  last_health_check IS NULL
                  OR last_health_check < NOW() - INTERVAL 5 MINUTE
              )
        """, (device_id,))
        low_health_components = cursor.fetchall()

        for comp in low_health_components:
            # Check if similar alert was created recently (debounce 1 hour)
            cursor.execute("""
                SELECT id FROM ai_alerts
                WHERE device_id = %s
                  AND alert_type = 'hardware_health'
                  AND message LIKE %s
                  AND created_at > NOW() - INTERVAL 1 HOUR
                LIMIT 1
            """, (device_id, f"%{comp['component_type']}%"))
            existing = cursor.fetchone()

            if not existing:
                # Determine severity based on health score
                severity = 'medium'
                if comp['health_score'] < 0.3:
                    severity = 'critical'
                elif comp['health_score'] < 0.5:
                    severity = 'high'

                metadata = _json.loads(comp['metadata']) if comp['metadata'] else {}
                issue_type = metadata.get('last_issue', 'health_degraded')

                cursor.execute("""
                    INSERT INTO ai_alerts
                    (metric_id, anomaly_id, alert_type, message, severity,
                     threshold_value, actual_value, device_id)
                    VALUES (0, NULL, 'hardware_health', %s, %s, %s, %s, %s)
                """, (
                    f"Component '{comp['component_type']}' health degraded: {issue_type}",
                    severity,
                    0.7,
                    comp['health_score'],
                    device_id,
                ))

        conn.commit()

        # Check for flatline sensors (values haven't changed in 24h)
        cursor.execute("""
            SELECT dc.id, dc.component_id, dc.component_type, dc.field_name
            FROM device_components dc
            WHERE dc.device_id = %s
              AND dc.last_seen < NOW() - INTERVAL 1 HOUR
              AND dc.component_type IN ('temperature', 'humidity', 'pressure',
                                        'soil_moisture', 'light', 'gas', 'pm25')
        """, (device_id,))
        stale_components = cursor.fetchall()

        for comp in stale_components:
            cursor.execute("""
                SELECT id FROM ai_alerts
                WHERE device_id = %s
                  AND alert_type = 'sensor_flatline'
                  AND message LIKE %s
                  AND created_at > NOW() - INTERVAL 6 HOUR
                LIMIT 1
            """, (device_id, f"%{comp['component_id']}%"))
            existing = cursor.fetchone()

            if not existing:
                cursor.execute("""
                    INSERT INTO ai_alerts
                    (metric_id, anomaly_id, alert_type, message, severity,
                     threshold_value, actual_value, device_id)
                    VALUES (0, NULL, 'sensor_flatline',
                            %s, 'warning', %s, %s, %s)
                """, (
                    f"Sensor '{comp['component_type']}' ({comp['field_name']}) appears flatline - no data for 1h+",
                    0.0,
                    0.0,
                    device_id,
                ))
                conn.commit()

        print(f"[AI-ALERTS] Generated alerts for {device_id}: "
              f"{len(low_health_components)} health, {len(stale_components)} flatline")

    except Exception as e:
        print(f"[AI-ALERTS] Error generating alerts for {device_id}: {e}")
        if conn:
            conn.rollback()
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()


def _process_ai_event(event: dict, r) -> None:
    """
    Entry point called from consume_loop.
    Debounce + normalize + upsert + hardware detection.
    """
    device_id = str(event.get("device_id") or "")
    if not device_id:
        return

    # Debounce: skip if recently analyzed
    if _is_ai_debounced(r, device_id):
        return

    # Mark debounce lock BEFORE processing (avoid duplicate parallel processing)
    _set_ai_debounce(r, device_id)

    try:
        normalizer = _get_normalizer()
        raw_bytes = _json.dumps(event).encode("utf-8")
        result = normalizer.normalize(raw_payload=raw_bytes, device_id=device_id)

        if result.errors and not result.metrics:
            # Parse failed — silently skip
            return

        if result.metrics:
            _upsert_ai_analytics(device_id, result)
            print(f"[AI-ANALYTICS] Analyzed {device_id}: {len(result.metrics)} metrics, "
                  f"hash={result.schema_hash[:16]}...")

            # Hardware detection from payload
            try:
                detector = _get_hardware_detector()
                # Extract data fields from event (exclude metadata)
                data_payload = {k: v for k, v in event.items()
                               if k not in ('device_id', 'timestamp', 'time', '_id')
                               and not k.startswith('_')}
                if data_payload:
                    profile = detector.detect_from_payload(device_id, data_payload)
                    if profile.components:
                        _upsert_hardware_components(device_id, event, profile)
            except Exception as hw_err:
                print(f"[HARDWARE-DETECTOR] Detection error for {device_id}: {hw_err}")

            # ---- Generate AI Alerts for hardware issues ----
            try:
                _generate_hardware_alerts(device_id)
            except Exception as alert_err:
                print(f"[AI-ALERTS] Alert generation error for {device_id}: {alert_err}")

    except Exception as e:
        print(f"[AI-ANALYTICS] Normalize error for {device_id}: {e}")


# ===== Main consume loop =====
def consume_loop() -> None:
    r = _create_redis_connection()

    consumer = Consumer({
        "bootstrap.servers": KAFKA_BOOTSTRAP,
        "group.id": KAFKA_GROUP_ID,
        "auto.offset.reset": "latest",
        "enable.auto.commit": True,
    })

    # Retry subscribe cho den khi topic san sang
    for attempt in range(30):
        try:
            consumer.subscribe([KAFKA_TOPIC])
            print(f"[KAFKA-CONSUMER] Subscribed to {KAFKA_TOPIC} (group={KAFKA_GROUP_ID})")
            break
        except KafkaException as e:
            print(f"[KAFKA-CONSUMER] Subscribe failed (attempt {attempt+1}/30): {e}")
            time.sleep(2)

    global _last_flush_ts
    try:
        while True:
            msg = consumer.poll(timeout=1.0)
            if msg is None:
                # Flush dinh ky
                if time.time() - _last_flush_ts >= FLUSH_INTERVAL_SEC:
                    _flush_last_seen_updates()
                continue
            err = msg.error()
            if err is not None:
                if err.code() == KafkaError._PARTITION_EOF:
                    continue
                # Log va tiep tuc thay vhi raise exception
                print(f"[KAFKA-CONSUMER] Poll error: {err}")
                continue
            value = msg.value()
            if not value:
                continue
            try:
                event = _json.loads(value.decode("utf-8"))
            except Exception as parse_err:
                print(f"[KAFKA-CONSUMER] JSON parse error: {parse_err}")
                continue

            # Track last_seen (gom batch)
            _track_last_seen(event)
            now = time.time()
            if now - _last_flush_ts >= FLUSH_INTERVAL_SEC:
                _flush_last_seen_updates()

            # Publish len Redis Pub/Sub cho WS bridge cua moi FastAPI worker
            payload = _json.dumps(event)
            _redis_publish_with_retry(r, WS_CHANNEL, payload)

            # Per-device channel: dung cho detect-keys "listen 10s" feature.
            # Sub nhieu channel theo device_id, payload gom (device_id, data).
            try:
                dev_id = event.get("device_id")
                if dev_id:
                    dev_payload = _json.dumps({
                        "device_id": dev_id,
                        "data": event,
                    })
                    _redis_publish_with_retry(r, f"device-data:{dev_id}", dev_payload)
            except Exception as _per_dev_err:
                # Khong chan pipeline neu per-device publish fail
                print(f"[KAFKA-CONSUMER] per-device publish failed: {_per_dev_err}")

            # ---- AI Analytics pipeline ----
            _process_ai_event(event, r)
    except KeyboardInterrupt:
        print("[KAFKA-CONSUMER] Shutting down...")
    finally:
        _flush_last_seen_updates()
        consumer.close()


if __name__ == "__main__":
    consume_loop()
