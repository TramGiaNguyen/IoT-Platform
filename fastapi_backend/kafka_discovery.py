"""
Shared Kafka discovery cache cho fastapi_backend.

Trước đây 2 API endpoint (/discover-devices và /devices/{id}/detect-keys) tự tạo
KafkaConsumer mới trong mỗi HTTP request, gây:
- Connection leak (mỗi request mở 2 connections tới broker)
- CPU spike khi kết hợp với consumer retry loop

Module này duy trì một background thread consume Kafka liên tục và
phục vụ dữ liệu từ in-memory cache thread-safe.
"""
import json
import os
import threading
import time
from collections import deque
from typing import Dict, List, Optional

from confluent_kafka import Consumer, KafkaError, KafkaException


KAFKA_BOOTSTRAP_SERVERS = os.getenv("KAFKA_BOOTSTRAP_SERVERS", "kafka:9092")
KAFKA_TOPIC = os.getenv("KAFKA_DISCOVERY_TOPIC", "iot-events")
KAFKA_GROUP_ID = "fastapi-backend-discovery"

# Cache kích thước tối đa (giữ các event gần nhất cho API)
MAX_EVENTS = 500

_lock = threading.Lock()
_recent_events: deque = deque(maxlen=MAX_EVENTS)

# Trạng thái cho /discover-devices
_device_info: Dict[str, dict] = {}
# device_id -> {
#   "fields": set[str],
#   "sample": dict,
#   "count": int,
#   "last_ts": float,
# }

_thread: Optional[threading.Thread] = None
_started = False


def _track_event(event: dict) -> None:
    """Cập nhật cache & device_info dưới lock."""
    dev_id = event.get("device_id")
    if not dev_id:
        return
    ts = event.get("timestamp")
    try:
        ts_float = float(ts) if ts is not None else time.time()
    except (TypeError, ValueError):
        ts_float = time.time()

    with _lock:
        _recent_events.append({"event": event, "ts": ts_float, "_ts": time.time()})
        if dev_id not in _device_info:
            _device_info[dev_id] = {
                "fields": set(),
                "sample": {},
                "count": 0,
                "last_ts": ts_float,
            }
        info = _device_info[dev_id]
        info["count"] += 1
        info["last_ts"] = max(info["last_ts"], ts_float)
        skip_fields = {"device_id", "timestamp", "type", "_id"}
        for key, value in event.items():
            if key in skip_fields or value is None:
                continue
            info["fields"].add(key)
            info["sample"][key] = value


def _consume_loop() -> None:
    """Vòng lặp consume Kafka chạy nền – không bao giờ return."""
    backoff_seconds = 5
    consumer_conf = {
        "bootstrap.servers": KAFKA_BOOTSTRAP_SERVERS,
        "group.id": KAFKA_GROUP_ID,
        "auto.offset.reset": "earliest",
        "enable.auto.commit": True,
        "client.id": "fastapi-discovery-consumer",
    }
    while True:
        consumer = None
        try:
            consumer = Consumer(consumer_conf)
            consumer.subscribe([KAFKA_TOPIC])
            while True:
                msg = consumer.poll(timeout=1.0)
                if msg is None:
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
                except Exception:
                    continue
                _track_event(event)
        except Exception as exc:
            print(f"[KAFKA-DISCOVERY] Error: {exc}. Retrying in {backoff_seconds}s...")
        finally:
            if consumer is not None:
                try:
                    consumer.close()
                except Exception:
                    pass
        time.sleep(backoff_seconds)


def start_discovery_consumer_background() -> None:
    """Khởi động background thread (idempotent)."""
    global _thread, _started
    with _lock:
        if _started:
            return
        _started = True
    _thread = threading.Thread(
        target=_consume_loop,
        name="kafka-discovery-consumer",
        daemon=True,
    )
    _thread.start()


def get_recent_events(
    device_id: Optional[str] = None,
    limit: int = 100,
) -> List[dict]:
    """Lấy danh sách event gần nhất (tùy chọn filter theo device_id)."""
    with _lock:
        items = list(_recent_events)
    if device_id is not None:
        items = [x for x in items if x["event"].get("device_id") == device_id]
    return [x["event"] for x in items[-limit:]]


def get_discovered_devices() -> List[dict]:
    """Lấy danh sách thiết bị đã phát hiện từ cache."""
    def _guess_device_type(fields: set) -> str:
        fields_lower = {f.lower() for f in fields}
        if "temperature" in fields_lower or "humidity" in fields_lower:
            return "sensor"
        if "state" in fields_lower and "setpoint" in fields_lower:
            return "air_conditioner"
        if "state" in fields_lower and "brightness" in fields_lower:
            return "light"
        if "power" in fields_lower or "voltage" in fields_lower or "current" in fields_lower:
            return "power_meter"
        if "motion" in fields_lower or "occupancy" in fields_lower:
            return "motion_sensor"
        if "door" in fields_lower or "open" in fields_lower:
            return "door_sensor"
        return "unknown"

    with _lock:
        snapshot = {
            dev_id: {
                "fields": set(info["fields"]),
                "sample": dict(info["sample"]),
                "count": info["count"],
                "last_ts": info["last_ts"],
            }
            for dev_id, info in _device_info.items()
        }

    result = []
    for dev_id, info in snapshot.items():
        result.append({
            "device_id": dev_id,
            "detected_fields": sorted(list(info["fields"])),
            "sample_data": info["sample"],
            "suggested_type": _guess_device_type(info["fields"]),
            "message_count": info["count"],
        })
    result.sort(key=lambda x: x["message_count"], reverse=True)
    return result


def get_recent_device_events(device_id: str, limit: int = 50) -> List[dict]:
    """Lấy các event gần nhất của một device cụ thể (cho detect-keys)."""
    return get_recent_events(device_id=device_id, limit=limit)
