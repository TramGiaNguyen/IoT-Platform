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


# ===== Main consume loop =====
def consume_loop() -> None:
    r = _create_redis_connection()

    consumer = Consumer({
        "bootstrap.servers": KAFKA_BOOTSTRAP,
        "group.id": KAFKA_GROUP_ID,
        "auto.offset.reset": "latest",
        "enable.auto.commit": True,
    })
    consumer.subscribe([KAFKA_TOPIC])
    print(f"[KAFKA-CONSUMER] Subscribed to {KAFKA_TOPIC} (group={KAFKA_GROUP_ID})")

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
                raise KafkaException(err)
            value = msg.value()
            if not value:
                continue
            try:
                event = json.loads(value.decode("utf-8"))
            except Exception as parse_err:
                print(f"[KAFKA-CONSUMER] JSON parse error: {parse_err}")
                continue

            # Track last_seen (gom batch)
            _track_last_seen(event)
            now = time.time()
            if now - _last_flush_ts >= FLUSH_INTERVAL_SEC:
                _flush_last_seen_updates()

            # Publish len Redis Pub/Sub cho WS bridge cua moi FastAPI worker
            payload = json.dumps(event)
            _redis_publish_with_retry(r, WS_CHANNEL, payload)
    except KeyboardInterrupt:
        print("[KAFKA-CONSUMER] Shutting down...")
    finally:
        _flush_last_seen_updates()
        consumer.close()


if __name__ == "__main__":
    consume_loop()
