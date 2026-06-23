# fastapi_backend/websocket.py
#
# Phase 4 refactor:
# - Moi worker co list `active_connections` rieng (in-memory, OK vi workers khong share WS state)
# - Event realtime duoc publish qua Redis Pub/Sub channel `ws:events`
#   (kafka_event_consumer la publisher chinh; co the co publisher khac trong tuong lai)
# - Moi worker subscribe channel do va forward event den cac WS client dang ket noi
#   trong worker do. Cach lam nay dam bao 1 user chi nhan event duy nhat 1 lan,
#   khong bi duplicate khi co nhieu workers.
# - Initial events (10 moi nhat) doc tu Redis list `ws:latest_events` de multi-worker share.

import asyncio
import json
import os
import time
from typing import List

import redis.asyncio as aioredis
from fastapi import WebSocket, WebSocketDisconnect
from starlette.websockets import WebSocketState

# Danh sach WS connection trong worker hien tai (per-process, OK)
active_connections: List[WebSocket] = []

REDIS_HOST = os.getenv("REDIS_HOST", "redis")
REDIS_PORT = int(os.getenv("REDIS_PORT", 6379))
WS_CHANNEL = "ws:events"
WS_LATEST_KEY = "ws:latest_events"  # Redis list chua 100 event moi nhat
WS_LATEST_MAX = 100
INITIAL_EVENTS_COUNT = 10
PING_INTERVAL = 10


async def _get_initial_events() -> list:
    """Doc 10 event moi nhat tu Redis list (share giua cac worker)."""
    try:
        r = aioredis.Redis(host=REDIS_HOST, port=REDIS_PORT, decode_responses=True)
        raw_list = await r.lrange(WS_LATEST_KEY, 0, INITIAL_EVENTS_COUNT - 1)
        await r.aclose()
        # Redis LPUSH them vao head → can dao nguoc de lay theo thu tu thoi gian
        events = []
        for raw in reversed(raw_list):
            try:
                events.append(json.loads(raw))
            except Exception:
                continue
        return events
    except Exception as e:
        print(f"[WS] Failed to read initial events from Redis: {e}")
        return []


async def _redis_subscriber_loop():
    """
    Background task (chay 1 lan moi worker) subscribe Redis Pub/Sub.
    Khi co event moi → broadcast den active_connections trong worker nay.
    """
    while True:
        try:
            r = aioredis.Redis(host=REDIS_HOST, port=REDIS_PORT, decode_responses=True)
            pubsub = r.pubsub()
            await pubsub.subscribe(WS_CHANNEL)
            print(f"[WS] Subscribed to Redis channel '{WS_CHANNEL}'")
            try:
                async for message in pubsub.listen():
                    if message.get("type") != "message":
                        continue
                    data = message.get("data")
                    if not data:
                        continue
                    try:
                        event = json.loads(data)
                    except Exception:
                        continue
                    # Broadcast den cac connection trong worker hien tai
                    await _broadcast_to_local(event)
            finally:
                await pubsub.unsubscribe(WS_CHANNEL)
                await pubsub.aclose()
                await r.aclose()
        except Exception as e:
            print(f"[WS] Subscriber error, reconnecting in 3s: {e}")
            await asyncio.sleep(3)


async def _broadcast_to_local(event: dict) -> None:
    """Gui event den tat ca WS connection dang active trong worker hien tai."""
    if not active_connections:
        return
    dead: List[WebSocket] = []
    # Tao ban copy de tranh loi neu list bi modify khi dang lap
    for ws in list(active_connections):
        try:
            if ws.application_state != WebSocketState.CONNECTED:
                dead.append(ws)
                continue
            await ws.send_json(event)
        except (WebSocketDisconnect, RuntimeError, ConnectionError):
            dead.append(ws)
        except Exception as e:
            print(f"[WS] Broadcast error: {e}")
            dead.append(ws)
    for ws in dead:
        try:
            active_connections.remove(ws)
        except ValueError:
            pass


def _allow_ws_origin(origin: str) -> bool:
    """Kiem tra origin co duoc phep ket noi WebSocket khong (dev: allow all)."""
    if not origin:
        return True
    return True


async def websocket_endpoint(websocket: WebSocket):
    """
    WebSocket endpoint push real-time events den frontend.
    - Initial events lay tu Redis list (share multi-worker)
    - Realtime events nhan qua Redis Pub/Sub subscriber (chay nen trong main.py)
    """
    print(f"[WEBSOCKET] New connection attempt from {websocket.client}")
    try:
        origin = websocket.headers.get("origin", "")
        await websocket.accept(subprotocol=None)
        print(f"[WEBSOCKET] Connection accepted from {websocket.client} (origin: {origin})")
        active_connections.append(websocket)
    except Exception as e:
        print(f"[WEBSOCKET] Error accepting connection: {e}")
        return

    try:
        # Gui 10 events moi nhat khi moi ket noi (doc tu Redis)
        initial_events = await _get_initial_events()
        for event in initial_events:
            if websocket.application_state != WebSocketState.CONNECTED:
                break
            try:
                await websocket.send_json(event)
            except (WebSocketDisconnect, RuntimeError, ConnectionError) as e:
                print(f"[WEBSOCKET] Connection closed during initial events: {e}")
                raise
            except Exception as e:
                print(f"[WEBSOCKET] Error sending initial event: {e}")
                break

        # Vong lap giu song ket noi: doc tin nhan client (ping) + gui ping dinh ky
        last_ping = time.time()
        while True:
            try:
                if websocket.application_state != WebSocketState.CONNECTED:
                    break
                # Cho client gui message (text/ping) voi timeout ngan
                try:
                    msg = await asyncio.wait_for(websocket.receive_text(), timeout=1.0)
                    # Co the xu ly command tu client o day neu can
                except asyncio.TimeoutError:
                    pass
                # Ping dinh ky
                now = time.time()
                if now - last_ping >= PING_INTERVAL:
                    try:
                        await websocket.send_json({"type": "ping", "ts": now})
                        last_ping = now
                    except Exception as e:
                        print(f"[WEBSOCKET] Ping failed: {e}")
                        break
            except WebSocketDisconnect:
                break
            except (RuntimeError, ConnectionError) as e:
                print(f"[WEBSOCKET] Connection error: {e}")
                break
    finally:
        try:
            active_connections.remove(websocket)
        except ValueError:
            pass
