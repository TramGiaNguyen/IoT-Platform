from fastapi import FastAPI, HTTPException, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional
import httpx
import os
from datetime import datetime, timedelta
import jwt

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

def verify_app_token(credentials: HTTPAuthorizationCredentials = Depends(security)) -> dict:
    """Verify app token và trả về platform token"""
    try:
        payload = jwt.decode(credentials.credentials, JWT_SECRET, algorithms=[JWT_ALGORITHM])
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
async def get_relay_status(device_id: Optional[str] = None, token_data: dict = Depends(verify_app_token)):
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
    token_data: dict = Depends(verify_app_token)
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
async def get_ac_status(token_data: dict = Depends(verify_app_token)):
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
async def control_ac(request: AcCommandRequest, token_data: dict = Depends(verify_app_token)):
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
