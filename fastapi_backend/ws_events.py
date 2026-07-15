# fastapi_backend/ws_events.py
#
# Helper publish events len Redis Pub/Sub channel `ws:events` (do websocket.py
# subscribe). Hai loai event duoc publish:
#
#   1. CRUD events  - tu cac route handler POST/PUT/DELETE, de frontend
#                     tu refresh list khi co nguoi dung khac thao tac.
#   2. Control events - khi mot nguoi dieu khien thiet bi (relay, edge control),
#                     de cac trang dashboard khac cap nhat UI ngay.
#
# Sensor events (Nhiet_do, Do_am, ...) van duoc publish boi kafka_event_consumer
# va khong can publish o day.
#
# Sync redis client duoc su dung vi cac route handlers chay dong bo (`def`,
# khong phai `async def`). Connect lazy, giu lai 1 instance de tranh overhead.

import json
import os
import time
from threading import Lock

import redis

REDIS_HOST = os.getenv("REDIS_HOST", "redis")
REDIS_PORT = int(os.getenv("REDIS_PORT", 6379))

WS_CHANNEL = "ws:events"
WS_LATEST_KEY = "ws:latest_events"
WS_LATEST_MAX = 200  # bump tu 100 -> 200 de refresh trang van thay CRUD gan day

_sync_redis = None
_sync_redis_lock = Lock()


def _get_sync_redis() -> redis.Redis:
    """Lazy init + tra ve 1 redis client sync (thread-safe)."""
    global _sync_redis
    if _sync_redis is not None:
        return _sync_redis
    with _sync_redis_lock:
        if _sync_redis is None:
            _sync_redis = redis.Redis(
                host=REDIS_HOST,
                port=REDIS_PORT,
                decode_responses=True,
                socket_connect_timeout=2,
                socket_timeout=2,
            )
    return _sync_redis


def _normalize_event(event: dict) -> dict:
    """Dam bao event co category va ts."""
    if "category" not in event:
        event["category"] = "sensor"
    if "ts" not in event:
        event["ts"] = int(time.time() * 1000)
    return event


def _do_publish(event: dict) -> bool:
    """Publish len channel + push vao list latest. Tra ve True neu thanh cong."""
    try:
        r = _get_sync_redis()
        payload = json.dumps(event, ensure_ascii=False)
        r.publish(WS_CHANNEL, payload)
        r.lpush(WS_LATEST_KEY, payload)
        r.ltrim(WS_LATEST_KEY, 0, WS_LATEST_MAX - 1)
        return True
    except Exception as e:
        print(f"[WS_EVENTS] publish failed: {e}")
        return False


# ── Public API ────────────────────────────────────────────────────────────────

def publish_event(event: dict) -> bool:
    """Publish 1 event bat ky (CRUD, control, ...)."""
    return _do_publish(_normalize_event(event))


def publish_crud(entity: str, action: str, entity_id, actor_id=None, payload: dict = None) -> bool:
    """
    Helper rieng cho CRUD events. Format chuan:
        {
          "category": "crud",
          "entity": "room"|"rule"|"alert"|"profile"|"dashboard"|"user"|"class"|
                    "group"|"device"|"widget"|"permission"|"group_member"|"student",
          "action": "create"|"update"|"delete",
          "id": <id>,
          "actor_id": <user_id or None>,
          "payload": {...},    # optional, chi field can thiet
          "ts": <unix_ms>
        }
    """
    event = {
        "category": "crud",
        "entity": entity,
        "action": action,
        "id": entity_id,
    }
    if actor_id is not None:
        event["actor_id"] = actor_id
    if payload:
        event["payload"] = payload
    return publish_event(event)


def publish_control(device_id: str, action_name: str, payload: dict = None, actor_id=None) -> bool:
    """
    Helper cho device control events (relay on/off, edge control).
    Frontend lang nghe de cap nhat UI control ngay.
        {
          "category": "control",
          "device_id": "...",
          "action": "relay"|"edge_control"|...,
          "actor_id": <user_id>,
          "payload": {...},
          "ts": ...
        }
    """
    event = {
        "category": "control",
        "device_id": device_id,
        "action": action_name,
    }
    if actor_id is not None:
        event["actor_id"] = actor_id
    if payload:
        event["payload"] = payload
    return publish_event(event)