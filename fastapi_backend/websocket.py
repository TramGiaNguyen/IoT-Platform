# fastapi_backend/websocket.py

from fastapi import WebSocket, WebSocketDisconnect
from starlette.websockets import WebSocketState
from kafka_consumer import get_latest_events
import asyncio
import json
import time

# Lưu danh sách các WebSocket connections đang active
active_connections: list[WebSocket] = []
# Lưu last timestamp đã gửi cho mỗi connection
connection_last_timestamps: dict[WebSocket, float] = {}

async def websocket_endpoint(websocket: WebSocket):
    """
    WebSocket endpoint để push real-time events từ Kafka đến frontend.
    Subscribe Kafka topic và gửi events ngay khi có dữ liệu mới.
    """
    print(f"[WEBSOCKET] New connection attempt from {websocket.client}")
    try:
        await websocket.accept()
        print(f"[WEBSOCKET] Connection accepted from {websocket.client}")
        active_connections.append(websocket)
        connection_last_timestamps[websocket] = None
    except Exception as e:
        print(f"[WEBSOCKET] Error accepting connection: {e}")
        return
    
    try:
        # Gửi events mới nhất khi client kết nối
        latest_events = get_latest_events()
        if latest_events:
            # Gửi 10 events gần nhất
            for event in latest_events[-10:]:
                try:
                    # Kiểm tra connection state trước khi gửi
                    if websocket.application_state != WebSocketState.CONNECTED:
                        print(f"[WEBSOCKET] Connection closed, stopping initial events")
                        break
                    await websocket.send_json(event)
                except (WebSocketDisconnect, RuntimeError, ConnectionError) as e:
                    print(f"[WEBSOCKET] Connection closed during initial events: {e}")
                    raise
                except Exception as e:
                    print(f"[WEBSOCKET] Error sending initial event: {e}")
                    break
        
        # Monitor và gửi events mới từ Kafka
        connection_alive = True
        last_ping = time.time()
        while connection_alive:
            try:
                # Nếu connection đã đóng thì thoát
                if websocket.application_state != WebSocketState.CONNECTED:
                    print("[WEBSOCKET] Connection state is not CONNECTED, exiting loop")
                    break

                current_events = get_latest_events()
                last_id = connection_last_timestamps.get(websocket)
                
                if current_events:
                    # Tìm events mới hơn ID cuối cùng đã gửi
                    new_events = []
                    for event in current_events:
                        event_id = event.get('_internal_id')
                        if event_id:
                            if last_id is None or event_id > last_id:
                                new_events.append(event)
                    
                    # Gửi các events mới
                    for event in new_events:
                        await websocket.send_json(event)
                        # Cập nhật ID cuối cùng
                        event_id = event.get('_internal_id')
                        if event_id:
                            connection_last_timestamps[websocket] = event_id

                # Gửi ping định kỳ để giữ kết nối
                now = time.time()
                if now - last_ping >= 10:
                    try:
                        await websocket.send_json({"type": "ping", "ts": now})
                        last_ping = now
                    except Exception as e:
                        print(f"[WEBSOCKET] Ping failed: {e}")
                        break

                await asyncio.sleep(0.5)  # Check mỗi 0.5 giây để real-time hơn
            except (WebSocketDisconnect, RuntimeError, ConnectionError, Exception) as e:
                # Nếu là lỗi về connection đã đóng, break loop
                error_msg = str(e).lower()
                if "close" in error_msg or "disconnect" in error_msg or "send" in error_msg:
                    print(f"[WEBSOCKET] Connection closed: {e}")
                    connection_alive = False
                    break
                else:
                    print(f"[WEBSOCKET] Unexpected error: {e}")
                    await asyncio.sleep(1)  # Wait a bit before retrying
            
    except WebSocketDisconnect:
        print(f"[WEBSOCKET] Client disconnected normally")
        if websocket in active_connections:
            active_connections.remove(websocket)
        connection_last_timestamps.pop(websocket, None)
    except (RuntimeError, ConnectionError) as e:
        print(f"[WEBSOCKET] Connection error: {e}")
        if websocket in active_connections:
            active_connections.remove(websocket)
        connection_last_timestamps.pop(websocket, None)
    except Exception as e:
        print(f"[WEBSOCKET] Unexpected error: {e}")
        if websocket in active_connections:
            active_connections.remove(websocket)
        connection_last_timestamps.pop(websocket, None)