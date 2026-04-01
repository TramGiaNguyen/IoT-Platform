from fastapi import FastAPI, HTTPException, Depends, WebSocket, WebSocketDisconnect
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.middleware.cors import CORSMiddleware
from starlette.websockets import WebSocketState
from pydantic import BaseModel
from typing import Optional
import httpx
import os
from datetime import datetime, timedelta
import jwt
import asyncio
import json

app = FastAPI(title="IoT App Control Backend")

# CORS for Flutter app
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Config
IOT_PLATFORM_URL = os.getenv("IOT_PLATFORM_URL", "http://fastapi-backend:8000")
JWT_SECRET = os.getenv("JWT_SECRET", "your-secret-key-change-in-production")
JWT_ALGORITHM = "HS256"
DEVICE_ID = "gateway-701e68b1"
AC_CONTROL_URL = os.getenv("AC_CONTROL_URL", "http://192.168.190.101")

security = HTTPBearer()

# Models
class LoginRequest(BaseModel):
    username: str
    password: str

class RelayControlRequest(BaseModel):
    relay: int
    state: str  # "ON" or "OFF"
    device_id: Optional[str] = None

class LoginResponse(BaseModel):
    access_token: str
    token_type: str
    user_info: dict

class RelayConfig(BaseModel):
    relay: int
    name: str
    state: str

class RelayStatusResponse(BaseModel):
    relays: list[RelayConfig]
    voltage: float
    current: float
    power: float
    energy: float
    frequency: float
    power_factor: float
    last_update: str


class AcStatusResponse(BaseModel):
    temp: int
    on: bool
    humidity: Optional[float] = None
    indoorTemp: Optional[float] = None


class AcCommandRequest(BaseModel):
    command: str  # on | off | up | down

# Helper functions
def create_app_token(platform_token: str, user_info: dict) -> str:
    """Tạo token riêng cho app, chứa platform token bên trong"""
    payload = {
        "platform_token": platform_token,
        "user_info": user_info,
        "exp": datetime.utcnow() + timedelta(days=7)
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)

def verify_app_token_optional(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
    token: Optional[str] = None
) -> dict:
    """Verify app token from header or query parameter"""
    token_str = None
    
    # Try to get token from header first
    if credentials:
        token_str = credentials.credentials
    # Fallback to query parameter
    elif token:
        token_str = token
    
    if not token_str:
        raise HTTPException(status_code=401, detail="Token required")
    
    try:
        payload = jwt.decode(token_str, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        return payload
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token đã hết hạn")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Token không hợp lệ")

# Routes
@app.get("/")
def root():
    return {
        "service": "IoT App Control Backend",
        "status": "running",
        "version": "1.0.0"
    }

@app.post("/auth/login", response_model=LoginResponse)
async def login(request: LoginRequest):
    """
    Đăng nhập qua IoT Platform và trả về token cho app
    """
    async with httpx.AsyncClient() as client:
        try:
            # Gọi API login của platform
            url = f"{IOT_PLATFORM_URL}/token"
            print(f"[DEBUG] Calling: {url}")
            print(f"[DEBUG] Username: {request.username}")
            
            response = await client.post(
                url,
                data={
                    "username": request.username,
                    "password": request.password
                },
                headers={"Content-Type": "application/x-www-form-urlencoded"}
            )
            
            print(f"[DEBUG] Response status: {response.status_code}")
            print(f"[DEBUG] Response body: {response.text[:200]}")
            
            if response.status_code != 200:
                raise HTTPException(
                    status_code=401,
                    detail=f"Email hoặc mật khẩu không đúng. Platform response: {response.text[:100]}"
                )
            
            platform_data = response.json()
            platform_token = platform_data["access_token"]
            
            # Tạo token riêng cho app
            user_info = {
                "username": request.username,
                "role": platform_data.get("vai_tro", "user"),
                "allowed_pages": platform_data.get("allowed_pages", [])
            }
            
            app_token = create_app_token(platform_token, user_info)
            
            return {
                "access_token": app_token,
                "token_type": "bearer",
                "user_info": user_info
            }
            
        except httpx.RequestError as e:
            raise HTTPException(
                status_code=503,
                detail=f"Không thể kết nối tới IoT Platform: {str(e)}"
            )

@app.get("/relay/status", response_model=RelayStatusResponse)
async def get_relay_status(
    device_id: Optional[str] = None,
    token: Optional[str] = None,
    token_data: dict = Depends(verify_app_token_optional)
):
    """
    Lấy trạng thái các relay và dữ liệu điện
    """
    target_device = device_id if device_id else DEVICE_ID
    platform_token = token_data["platform_token"]
    
    async with httpx.AsyncClient() as client:
        try:
            # Lấy data telemetry
            response = await client.get(
                f"{IOT_PLATFORM_URL}/devices/{target_device}/latest",
                headers={"Authorization": f"Bearer {platform_token}"}
            )
            if response.status_code != 200:
                raise HTTPException(status_code=response.status_code, detail="Không lấy được dữ liệu thiết bị")
            device_data = response.json()
            data = device_data.get("data", {})
            
            # Lấy config control-lines (danh sách relay)
            lines_resp = await client.get(
                f"{IOT_PLATFORM_URL}/devices/{target_device}/control-lines",
                headers={"Authorization": f"Bearer {platform_token}"}
            )
            lines_data = []
            if lines_resp.status_code == 200:
                lines_data = lines_resp.json().get("control_lines", [])
                
            dynamic_relays = []
            for line in lines_data:
                if line.get("hien_thi_ttcds") in [True, 1, "1"]:
                    rn = line["relay_number"]
                    # Trạng thái hiện tại trong metrics (vd: relay_1_state hoặc relay_1)
                    st = data.get(f"relay_{rn}_state", data.get(f"relay_{rn}", {}))
                    state_val = st.get("value", "OFF") if isinstance(st, dict) else st
                    dynamic_relays.append({
                        "relay": rn,
                        "name": line.get("ten_duong") or f"Relay {rn}",
                        "state": state_val if state_val in ["ON", "OFF"] else "OFF"
                    })
            
            return {
                "relays": dynamic_relays,
                "voltage": data.get("voltage", {}).get("value", 0),
                "current": data.get("current", {}).get("value", 0) / 1000,
                "power": data.get("power", {}).get("value", 0) / 1000,
                "energy": data.get("energy", {}).get("value", 0),
                "frequency": data.get("frequency", {}).get("value", 0),
                "power_factor": data.get("power_factor", data.get("pf", {})).get("value", 0),
                "last_update": datetime.fromtimestamp(device_data.get("last_seen", 0)).isoformat()
            }
            
        except httpx.RequestError as e:
            raise HTTPException(status_code=503, detail=f"Lỗi kết nối: {str(e)}")

@app.post("/relay/control")
async def control_relay(
    request: RelayControlRequest,
    token: Optional[str] = None,
    token_data: dict = Depends(verify_app_token_optional)
):
    """
    Điều khiển relay
    """
    if request.relay < 1:
        raise HTTPException(status_code=400, detail="Relay không hợp lệ")
    
    if request.state not in ["ON", "OFF"]:
        raise HTTPException(status_code=400, detail="State phải là ON hoặc OFF")
    
    target_device = request.device_id if request.device_id else DEVICE_ID
    platform_token = token_data["platform_token"]
    
    async with httpx.AsyncClient() as client:
        try:
            response = await client.post(
                f"{IOT_PLATFORM_URL}/devices/{target_device}/control",
                json={
                    "action": "relay",
                    "raw_payload": {
                        "relay": request.relay,
                        "state": request.state
                    }
                },
                headers={
                    "Authorization": f"Bearer {platform_token}",
                    "Content-Type": "application/json"
                }
            )
            
            if response.status_code != 200:
                raise HTTPException(
                    status_code=response.status_code,
                    detail="Điều khiển thất bại"
                )
            
            return {
                "status": "success",
                "relay": request.relay,
                "state": request.state,
                "message": f"Đã {request.state.lower()} relay {request.relay}"
            }
            
        except httpx.RequestError as e:
            raise HTTPException(status_code=503, detail=f"Lỗi kết nối: {str(e)}")

@app.get("/health")
def health_check():
    """Health check endpoint"""
    return {"status": "healthy", "timestamp": datetime.utcnow().isoformat()}


@app.get("/ac/status", response_model=AcStatusResponse)
async def get_ac_status(
    token: Optional[str] = None,
    token_data: dict = Depends(verify_app_token_optional)
):
    """Lấy trạng thái AC từ gateway cục bộ"""
    _ = token_data
    async with httpx.AsyncClient(timeout=8.0) as client:
        try:
            response = await client.get(f"{AC_CONTROL_URL}/status")
            if response.status_code != 200:
                raise HTTPException(
                    status_code=502,
                    detail=f"AC gateway trả về HTTP {response.status_code}",
                )
            payload = response.json()
            return {
                "temp": int(payload.get("temp", 24)),
                "on": bool(payload.get("on", False)),
                "humidity": payload.get("humidity"),
                "indoorTemp": payload.get("indoorTemp"),
            }
        except httpx.RequestError as e:
            raise HTTPException(status_code=503, detail=f"Không kết nối được AC gateway: {str(e)}")


@app.post("/ac/control", response_model=AcStatusResponse)
async def control_ac(
    request: AcCommandRequest,
    token: Optional[str] = None,
    token_data: dict = Depends(verify_app_token_optional)
):
    """Gửi lệnh điều khiển AC: on/off/up/down"""
    _ = token_data
    cmd = request.command.lower().strip()
    valid = {"on", "off", "up", "down"}
    if cmd not in valid:
        raise HTTPException(status_code=400, detail="command phải là on/off/up/down")

    async with httpx.AsyncClient(timeout=8.0) as client:
        try:
            response = await client.get(f"{AC_CONTROL_URL}/{cmd}")
            if response.status_code != 200:
                raise HTTPException(
                    status_code=502,
                    detail=f"AC gateway trả về HTTP {response.status_code}",
                )
            payload = response.json()
            return {
                "temp": int(payload.get("temp", 24)),
                "on": bool(payload.get("on", False)),
                "humidity": payload.get("humidity"),
                "indoorTemp": payload.get("indoorTemp"),
            }
        except httpx.RequestError as e:
            raise HTTPException(status_code=503, detail=f"Không gửi được lệnh AC: {str(e)}")


# ========== ROOM-BASED APIs ==========

class RoomControlRequest(BaseModel):
    device_id: str
    relay: int
    state: str  # "ON" or "OFF"


@app.get("/rooms")
async def get_rooms(
    token: Optional[str] = None,
    token_data: dict = Depends(verify_app_token_optional)
):
    """
    Lấy danh sách rooms theo quyền hạn user
    
    Room = Không gian vật lý chứa thiết bị IoT
    VD: "Phòng Lab 1", "Phòng Server", "Nhà kho"
    
    Quyền truy cập:
    - Admin: Tất cả rooms
    - Teacher: Rooms của mình + Rooms của học viên trong lớp
    - Student: Chỉ rooms của mình
    
    Có thể truyền token qua:
    - Header: Authorization: Bearer <token>
    - Query param: ?token=<token>
    """
    platform_token = token_data["platform_token"]
    
    async with httpx.AsyncClient() as client:
        try:
            # Gọi API platform để lấy rooms
            response = await client.get(
                f"{IOT_PLATFORM_URL}/rooms",
                headers={"Authorization": f"Bearer {platform_token}"}
            )
            
            if response.status_code != 200:
                raise HTTPException(
                    status_code=response.status_code,
                    detail="Không lấy được danh sách phòng"
                )
            
            return response.json()
            
        except httpx.RequestError as e:
            raise HTTPException(status_code=503, detail=f"Lỗi kết nối: {str(e)}")


@app.get("/rooms/{room_id}/data")
async def get_room_data(
    room_id: int,
    token: Optional[str] = None,
    token_data: dict = Depends(verify_app_token_optional)
):
    """
    Lấy tất cả dữ liệu của room (devices, metrics, controls)
    Dữ liệu được format động để app có thể tự thích nghi
    
    Có thể truyền token qua:
    - Header: Authorization: Bearer <token>
    - Query param: ?token=<token>
    """
    platform_token = token_data["platform_token"]
    
    async with httpx.AsyncClient() as client:
        try:
            # Gọi API platform để lấy room data
            response = await client.get(
                f"{IOT_PLATFORM_URL}/rooms/{room_id}/data",
                headers={"Authorization": f"Bearer {platform_token}"}
            )
            
            if response.status_code != 200:
                raise HTTPException(
                    status_code=response.status_code,
                    detail="Không lấy được dữ liệu phòng"
                )
            
            return response.json()
            
        except httpx.RequestError as e:
            raise HTTPException(status_code=503, detail=f"Lỗi kết nối: {str(e)}")


@app.post("/rooms/{room_id}/control")
async def control_room_relay(
    room_id: int,
    request: RoomControlRequest,
    token: Optional[str] = None,
    token_data: dict = Depends(verify_app_token_optional)
):
    """
    Điều khiển relay trong room
    """
    if request.relay < 1:
        raise HTTPException(status_code=400, detail="Relay không hợp lệ")
    
    if request.state not in ["ON", "OFF"]:
        raise HTTPException(status_code=400, detail="State phải là ON hoặc OFF")
    
    platform_token = token_data["platform_token"]
    
    async with httpx.AsyncClient() as client:
        try:
            # Gọi API platform để điều khiển
            response = await client.post(
                f"{IOT_PLATFORM_URL}/devices/{request.device_id}/control",
                json={
                    "action": "relay",
                    "raw_payload": {
                        "relay": request.relay,
                        "state": request.state
                    }
                },
                headers={
                    "Authorization": f"Bearer {platform_token}",
                    "Content-Type": "application/json"
                }
            )
            
            if response.status_code != 200:
                raise HTTPException(
                    status_code=response.status_code,
                    detail="Điều khiển thất bại"
                )
            
            return {
                "status": "success",
                "room_id": room_id,
                "device_id": request.device_id,
                "relay": request.relay,
                "state": request.state,
                "message": f"Đã {request.state.lower()} relay {request.relay}"
            }
            
        except httpx.RequestError as e:
            raise HTTPException(status_code=503, detail=f"Lỗi kết nối: {str(e)}")


# ========== WEBSOCKET FOR REAL-TIME UPDATES ==========

# Store active WebSocket connections
active_ws_connections: list[WebSocket] = []
ws_last_event_id: dict[WebSocket, float] = {}

# Simple in-memory event buffer (last 100 events)
recent_events: list[dict] = []
event_counter = 0


def add_event_to_buffer(event: dict):
    """Add event to buffer with internal ID"""
    global event_counter
    event_counter += 1
    event["_internal_id"] = event_counter
    recent_events.append(event)
    
    # Keep only last 100 events
    if len(recent_events) > 100:
        recent_events.pop(0)


async def broadcast_event(event: dict):
    """Broadcast event to all connected WebSocket clients"""
    add_event_to_buffer(event)
    
    disconnected = []
    for ws in active_ws_connections:
        try:
            if ws.application_state == WebSocketState.CONNECTED:
                await ws.send_json(event)
            else:
                disconnected.append(ws)
        except Exception as e:
            print(f"[WS] Error sending to client: {e}")
            disconnected.append(ws)
    
    # Clean up disconnected clients
    for ws in disconnected:
        if ws in active_ws_connections:
            active_ws_connections.remove(ws)
        ws_last_event_id.pop(ws, None)


@app.websocket("/ws/events")
async def websocket_events(websocket: WebSocket, token: Optional[str] = None):
    """
    WebSocket endpoint for real-time device updates
    Client should send token as query parameter: /ws/events?token=xxx
    
    Events format:
    {
        "device_id": "gateway-xxx",
        "timestamp": 1234567890,
        "temperature": 26.5,
        "humidity": 65.2,
        "relay_1_state": "ON",
        ...
    }
    """
    await websocket.accept()
    
    # Verify token
    if not token:
        await websocket.send_json({"error": "Token required"})
        await websocket.close()
        return
    
    try:
        # Decode app token
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        user_info = payload.get("user_info", {})
        print(f"[WEBSOCKET] Client connected: {user_info.get('username')}")
    except Exception as e:
        await websocket.send_json({"error": f"Invalid token: {str(e)}"})
        await websocket.close()
        return
    
    # Add to active connections
    active_ws_connections.append(websocket)
    ws_last_event_id[websocket] = None
    
    try:
        # Send recent events (last 10)
        for event in recent_events[-10:]:
            try:
                await websocket.send_json(event)
                ws_last_event_id[websocket] = event.get("_internal_id")
            except Exception as e:
                print(f"[WEBSOCKET] Error sending initial event: {e}")
                break
        
        # Keep connection alive and send new events
        last_ping = asyncio.get_event_loop().time()
        while True:
            try:
                # Check connection state
                if websocket.application_state != WebSocketState.CONNECTED:
                    break
                
                # Send new events
                last_id = ws_last_event_id.get(websocket)
                for event in recent_events:
                    event_id = event.get("_internal_id")
                    if event_id and (last_id is None or event_id > last_id):
                        await websocket.send_json(event)
                        ws_last_event_id[websocket] = event_id
                
                # Send ping every 10 seconds
                now = asyncio.get_event_loop().time()
                if now - last_ping >= 10:
                    await websocket.send_json({"type": "ping", "ts": now})
                    last_ping = now
                
                await asyncio.sleep(0.5)
                
            except (WebSocketDisconnect, RuntimeError, ConnectionError):
                break
            except Exception as e:
                print(f"[WEBSOCKET] Error: {e}")
                break
                
    except WebSocketDisconnect:
        print("[WEBSOCKET] Client disconnected normally")
    except Exception as e:
        print(f"[WEBSOCKET] Unexpected error: {e}")
    finally:
        # Clean up
        if websocket in active_ws_connections:
            active_ws_connections.remove(websocket)
        ws_last_event_id.pop(websocket, None)
        try:
            await websocket.close()
        except:
            pass


# Background task to fetch events from platform and broadcast
async def fetch_platform_events():
    """Fetch events from platform WebSocket and broadcast to mobile clients"""
    platform_ws_url = IOT_PLATFORM_URL.replace("http://", "ws://").replace("https://", "wss://")
    platform_ws_url = f"{platform_ws_url}/ws/events"
    
    print(f"[WEBSOCKET] Connecting to platform: {platform_ws_url}")
    
    while True:
        try:
            import websockets
            async with websockets.connect(platform_ws_url) as platform_ws:
                print("[WEBSOCKET] Connected to platform WebSocket")
                
                async for message in platform_ws:
                    try:
                        event = json.loads(message)
                        # Broadcast to all mobile clients
                        await broadcast_event(event)
                    except json.JSONDecodeError:
                        pass
                    except Exception as e:
                        print(f"[WEBSOCKET] Error processing event: {e}")
                        
        except Exception as e:
            print(f"[WEBSOCKET] Platform connection error: {e}")
            await asyncio.sleep(5)  # Retry after 5 seconds


# ========== DEVICES APIs FOR RULES ==========

@app.get("/devices")
async def get_devices_list(
    phong_id: Optional[int] = None,
    token: Optional[str] = None,
    token_data: dict = Depends(verify_app_token_optional)
):
    """
    Lấy danh sách thiết bị để chọn trong rule form
    """
    platform_token = token_data["platform_token"]
    
    async with httpx.AsyncClient() as client:
        try:
            params = {}
            if phong_id is not None:
                params["phong_id"] = phong_id
            
            response = await client.get(
                f"{IOT_PLATFORM_URL}/devices",
                params=params,
                headers={"Authorization": f"Bearer {platform_token}"}
            )
            
            if response.status_code != 200:
                raise HTTPException(
                    status_code=response.status_code,
                    detail="Không lấy được danh sách thiết bị"
                )
            
            data = response.json()
            # Simplify response for dropdown
            devices = []
            for device in data.get('devices', []):
                devices.append({
                    'device_id': device.get('ma_thiet_bi'),
                    'name': device.get('ten_thiet_bi'),
                    'phong_id': device.get('phong_id'),
                })
            
            return {"devices": devices}
            
        except httpx.RequestError as e:
            raise HTTPException(status_code=503, detail=f"Lỗi kết nối: {str(e)}")


@app.get("/devices/{device_id}/relays")
async def get_device_relays(
    device_id: str,
    token: Optional[str] = None,
    token_data: dict = Depends(verify_app_token_optional)
):
    """
    Lấy danh sách relay và tên của thiết bị
    """
    platform_token = token_data["platform_token"]
    
    async with httpx.AsyncClient() as client:
        try:
            response = await client.get(
                f"{IOT_PLATFORM_URL}/devices/{device_id}/control-lines",
                headers={"Authorization": f"Bearer {platform_token}"}
            )
            
            if response.status_code != 200:
                raise HTTPException(
                    status_code=response.status_code,
                    detail="Không lấy được danh sách relay"
                )
            
            data = response.json()
            relays = []
            for line in data.get('control_lines', []):
                if line.get('hien_thi_ttcds') in [True, 1, '1']:
                    relays.append({
                        'relay': line.get('relay_number'),
                        'name': line.get('ten_duong') or f"Relay {line.get('relay_number')}",
                    })
            
            return {"relays": relays}
            
        except httpx.RequestError as e:
            raise HTTPException(status_code=503, detail=f"Lỗi kết nối: {str(e)}")


# ========== RULES APIs ==========

@app.get("/rules")
async def get_rules(
    phong_id: Optional[int] = None,
    trang_thai: Optional[str] = None,
    token: Optional[str] = None,
    token_data: dict = Depends(verify_app_token_optional)
):
    """
    Lấy danh sách conditional rules
    
    Query params:
    - phong_id: Lọc theo phòng
    - trang_thai: Lọc theo trạng thái (enabled/disabled)
    """
    platform_token = token_data["platform_token"]
    
    async with httpx.AsyncClient() as client:
        try:
            params = {}
            if phong_id is not None:
                params["phong_id"] = phong_id
            if trang_thai is not None:
                params["trang_thai"] = trang_thai
            
            response = await client.get(
                f"{IOT_PLATFORM_URL}/rules",
                params=params,
                headers={"Authorization": f"Bearer {platform_token}"}
            )
            
            if response.status_code != 200:
                raise HTTPException(
                    status_code=response.status_code,
                    detail="Không lấy được danh sách rules"
                )
            
            return response.json()
            
        except httpx.RequestError as e:
            raise HTTPException(status_code=503, detail=f"Lỗi kết nối: {str(e)}")


@app.post("/rules")
async def create_rule(
    rule_data: dict,
    token: Optional[str] = None,
    token_data: dict = Depends(verify_app_token_optional)
):
    """
    Tạo conditional rule mới
    
    Body format:
    {
        "ten_rule": "Bật quạt khi nóng",
        "phong_id": 1,
        "condition_device_id": "gateway-xxx",
        "conditions": [
            {"field": "temperature", "operator": ">", "value": 30}
        ],
        "actions": [
            {
                "device_id": "gateway-xxx",
                "action_command": "relay",
                "action_params": {"relay": 1, "state": "ON"},
                "delay_seconds": 0,
                "thu_tu": 1
            }
        ],
        "muc_do_uu_tien": 1,
        "trang_thai": "enabled"
    }
    """
    platform_token = token_data["platform_token"]
    
    async with httpx.AsyncClient() as client:
        try:
            response = await client.post(
                f"{IOT_PLATFORM_URL}/rules",
                json=rule_data,
                headers={
                    "Authorization": f"Bearer {platform_token}",
                    "Content-Type": "application/json"
                }
            )
            
            if response.status_code != 200:
                raise HTTPException(
                    status_code=response.status_code,
                    detail=f"Tạo rule thất bại: {response.text}"
                )
            
            return response.json()
            
        except httpx.RequestError as e:
            raise HTTPException(status_code=503, detail=f"Lỗi kết nối: {str(e)}")


@app.put("/rules/{rule_id}")
async def update_rule(
    rule_id: int,
    rule_data: dict,
    token: Optional[str] = None,
    token_data: dict = Depends(verify_app_token_optional)
):
    """Cập nhật conditional rule"""
    platform_token = token_data["platform_token"]
    
    async with httpx.AsyncClient() as client:
        try:
            response = await client.put(
                f"{IOT_PLATFORM_URL}/rules/{rule_id}",
                json=rule_data,
                headers={
                    "Authorization": f"Bearer {platform_token}",
                    "Content-Type": "application/json"
                }
            )
            
            if response.status_code != 200:
                raise HTTPException(
                    status_code=response.status_code,
                    detail=f"Cập nhật rule thất bại: {response.text}"
                )
            
            return response.json()
            
        except httpx.RequestError as e:
            raise HTTPException(status_code=503, detail=f"Lỗi kết nối: {str(e)}")


@app.delete("/rules/{rule_id}")
async def delete_rule(
    rule_id: int,
    token: Optional[str] = None,
    token_data: dict = Depends(verify_app_token_optional)
):
    """Xóa conditional rule"""
    platform_token = token_data["platform_token"]
    
    async with httpx.AsyncClient() as client:
        try:
            response = await client.delete(
                f"{IOT_PLATFORM_URL}/rules/{rule_id}",
                headers={"Authorization": f"Bearer {platform_token}"}
            )
            
            if response.status_code != 200:
                raise HTTPException(
                    status_code=response.status_code,
                    detail=f"Xóa rule thất bại: {response.text}"
                )
            
            return response.json()
            
        except httpx.RequestError as e:
            raise HTTPException(status_code=503, detail=f"Lỗi kết nối: {str(e)}")


# ========== SCHEDULED RULES APIs ==========

@app.get("/scheduled-rules")
async def get_scheduled_rules(
    phong_id: Optional[int] = None,
    trang_thai: Optional[str] = None,
    token: Optional[str] = None,
    token_data: dict = Depends(verify_app_token_optional)
):
    """
    Lấy danh sách scheduled rules
    
    Query params:
    - phong_id: Lọc theo phòng
    - trang_thai: Lọc theo trạng thái (enabled/disabled)
    """
    platform_token = token_data["platform_token"]
    
    async with httpx.AsyncClient() as client:
        try:
            params = {}
            if phong_id is not None:
                params["phong_id"] = phong_id
            if trang_thai is not None:
                params["trang_thai"] = trang_thai
            
            response = await client.get(
                f"{IOT_PLATFORM_URL}/scheduled-rules",
                params=params,
                headers={"Authorization": f"Bearer {platform_token}"}
            )
            
            if response.status_code != 200:
                raise HTTPException(
                    status_code=response.status_code,
                    detail="Không lấy được danh sách scheduled rules"
                )
            
            return response.json()
            
        except httpx.RequestError as e:
            raise HTTPException(status_code=503, detail=f"Lỗi kết nối: {str(e)}")


@app.post("/scheduled-rules")
async def create_scheduled_rule(
    rule_data: dict,
    token: Optional[str] = None,
    token_data: dict = Depends(verify_app_token_optional)
):
    """
    Tạo scheduled rule mới
    
    Body format:
    {
        "ten_rule": "Bật đèn lúc 6h sáng",
        "phong_id": 1,
        "cron_expression": "0 6 * * *",
        "device_id": "gateway-xxx",
        "action_command": "relay",
        "action_params": {"relay": 1, "state": "ON"},
        "trang_thai": "enabled"
    }
    
    Cron format: "minute hour day month weekday"
    - "0 6 * * *" = Hàng ngày lúc 6:00
    - "0 18 * * 1-5" = Thứ 2-6 lúc 18:00
    - "30 8 * * 0" = Chủ nhật lúc 8:30
    """
    platform_token = token_data["platform_token"]
    
    async with httpx.AsyncClient() as client:
        try:
            response = await client.post(
                f"{IOT_PLATFORM_URL}/scheduled-rules",
                json=rule_data,
                headers={
                    "Authorization": f"Bearer {platform_token}",
                    "Content-Type": "application/json"
                }
            )
            
            if response.status_code != 200:
                raise HTTPException(
                    status_code=response.status_code,
                    detail=f"Tạo scheduled rule thất bại: {response.text}"
                )
            
            return response.json()
            
        except httpx.RequestError as e:
            raise HTTPException(status_code=503, detail=f"Lỗi kết nối: {str(e)}")


@app.put("/scheduled-rules/{rule_id}")
async def update_scheduled_rule(
    rule_id: int,
    rule_data: dict,
    token: Optional[str] = None,
    token_data: dict = Depends(verify_app_token_optional)
):
    """Cập nhật scheduled rule"""
    platform_token = token_data["platform_token"]
    
    async with httpx.AsyncClient() as client:
        try:
            response = await client.put(
                f"{IOT_PLATFORM_URL}/scheduled-rules/{rule_id}",
                json=rule_data,
                headers={
                    "Authorization": f"Bearer {platform_token}",
                    "Content-Type": "application/json"
                }
            )
            
            if response.status_code != 200:
                raise HTTPException(
                    status_code=response.status_code,
                    detail=f"Cập nhật scheduled rule thất bại: {response.text}"
                )
            
            return response.json()
            
        except httpx.RequestError as e:
            raise HTTPException(status_code=503, detail=f"Lỗi kết nối: {str(e)}")


@app.delete("/scheduled-rules/{rule_id}")
async def delete_scheduled_rule(
    rule_id: int,
    token: Optional[str] = None,
    token_data: dict = Depends(verify_app_token_optional)
):
    """Xóa scheduled rule"""
    platform_token = token_data["platform_token"]
    
    async with httpx.AsyncClient() as client:
        try:
            response = await client.delete(
                f"{IOT_PLATFORM_URL}/scheduled-rules/{rule_id}",
                headers={"Authorization": f"Bearer {platform_token}"}
            )
            
            if response.status_code != 200:
                raise HTTPException(
                    status_code=response.status_code,
                    detail=f"Xóa scheduled rule thất bại: {response.text}"
                )
            
            return response.json()
            
        except httpx.RequestError as e:
            raise HTTPException(status_code=503, detail=f"Lỗi kết nối: {str(e)}")


@app.on_event("startup")
async def startup_websocket():
    """Start background task to subscribe MQTT and broadcast events"""
    import asyncio
    try:
        print("[STARTUP] Creating MQTT to WebSocket bridge task...")
        asyncio.create_task(mqtt_to_websocket_bridge())
        print("[STARTUP] MQTT bridge task created")
    except Exception as e:
        print(f"[STARTUP] Error creating MQTT bridge: {e}")


async def mqtt_to_websocket_bridge():
    """Subscribe to MQTT and broadcast relay state changes to WebSocket clients"""
    import paho.mqtt.client as mqtt_client
    import os
    
    mqtt_broker = os.getenv("MQTT_BROKER", "mqtt")
    mqtt_port = int(os.getenv("MQTT_PORT", "1883"))
    mqtt_username = os.getenv("MQTT_USERNAME", "bdu_admin")
    mqtt_password = os.getenv("MQTT_PASSWORD", "admin_secret")
    
    def on_connect(client, userdata, flags, rc):
        if rc == 0:
            print("[MQTT→WS] Connected to MQTT broker")
            # Subscribe to device data and control topics
            result1, mid1 = client.subscribe("iot/devices/+/data")
            result2, mid2 = client.subscribe("iot/devices/+/control")
            print(f"[MQTT→WS] Subscribed to iot/devices/+/data (result={result1})")
            print(f"[MQTT→WS] Subscribed to iot/devices/+/control (result={result2})")
        else:
            print(f"[MQTT→WS] Failed to connect, return code {rc}")
    
    def on_message(client, userdata, msg):
        try:
            print(f"[MQTT→WS] Received message on topic: {msg.topic}")
            payload = json.loads(msg.payload.decode())
            print(f"[MQTT→WS] Payload: {payload}")
            device_id = msg.topic.split('/')[2]
            
            # Add device_id if not present
            if 'device_id' not in payload:
                payload['device_id'] = device_id
            
            # Broadcast to WebSocket clients (sync version)
            add_event_to_buffer(payload)
            print(f"[MQTT→WS] Broadcasting to {len(active_ws_connections)} WebSocket clients")
            
            # Send to all connected clients
            disconnected = []
            for ws in active_ws_connections:
                try:
                    if ws.application_state == WebSocketState.CONNECTED:
                        # Use asyncio.run_coroutine_threadsafe for thread-safe async call
                        import asyncio
                        loop = asyncio.get_event_loop()
                        asyncio.run_coroutine_threadsafe(ws.send_json(payload), loop)
                    else:
                        disconnected.append(ws)
                except Exception as e:
                    print(f"[MQTT→WS] Error sending to client: {e}")
                    disconnected.append(ws)
            
            # Clean up disconnected clients
            for ws in disconnected:
                if ws in active_ws_connections:
                    active_ws_connections.remove(ws)
                ws_last_event_id.pop(ws, None)
            
        except Exception as e:
            print(f"[MQTT→WS] Error processing message: {e}")
    
    # Create MQTT client
    client = mqtt_client.Client()
    client.username_pw_set(mqtt_username, mqtt_password)
    client.on_connect = on_connect
    client.on_message = on_message
    
    try:
        client.connect(mqtt_broker, mqtt_port, 60)
        client.loop_start()
        print("[MQTT→WS] MQTT to WebSocket bridge started")
        
        # Keep running
        while True:
            await asyncio.sleep(1)
    except Exception as e:
        print(f"[MQTT→WS] Error: {e}")
        await asyncio.sleep(5)  # Retry after 5 seconds

