# fastapi_backend/routes.py

from fastapi import APIRouter, Depends, HTTPException, Header, Request
from fastapi.security import OAuth2PasswordRequestForm
from typing import List, Optional
from pydantic import BaseModel
from datetime import datetime, timedelta
import os
import time
import json
import secrets
import requests
import paho.mqtt.publish as publish
import paho.mqtt.client as mqtt

from auth import authenticate_user, create_access_token, get_current_user, get_current_user_or_internal, get_current_user_optional
from database import get_mongo, get_mysql
from kafka_consumer import get_latest_events
from camera_service import encrypt_password, decrypt_password, build_stream_url
from device_config import (
    get_topics, get_http_config, build_command_payload, list_commands as list_device_commands
)
from models import (
    Token, Event,
    DashboardCreateRequest, DashboardUpdateRequest,
    WidgetCreateRequest, WidgetUpdateRequest, WidgetDataRequest
)

router = APIRouter()
AC_CONTROL_URL = os.getenv("AC_CONTROL_URL", "http://192.168.190.101").rstrip("/")


class AcControlRequest(BaseModel):
    command: str  # on | off | up | down


def normalize_edge_control_url(url: Optional[str]) -> Optional[str]:
    """Chuẩn hoá URL điều khiển edge (HTTP). Cho phép nhập host+path không có scheme."""
    if url is None:
        return None
    u = (url or "").strip()
    if not u:
        return None
    if not u.startswith(("http://", "https://")):
        u = "http://" + u
    return u


def _device_http_api_key_value(device: Optional[dict]) -> str:
    """Lấy http_api_key từ row MySQL (str hoặc bytes) — tránh bỏ qua key do kiểu dữ liệu."""
    if not device:
        return ""
    hk = device.get("http_api_key")
    if hk is None:
        return ""
    if isinstance(hk, bytes):
        try:
            return hk.decode("utf-8", errors="replace").strip()
        except Exception:
            return ""
    if isinstance(hk, str):
        return hk.strip()
    return str(hk).strip()


def build_edge_relay_control_body(relay: int, state: str) -> dict:
    """
    Body JSON gửi tới edge /api/v1/control:
    {"control_commands": [{"relay": N, "commands": {"on"|"off": {"relay": N, "state": "ON"|"OFF"}}}]}
    """
    st = (state or "").strip().upper()
    if st not in ("ON", "OFF"):
        st = "OFF"
    cmd_key = "on" if st == "ON" else "off"
    r = int(relay)
    inner = {"relay": r, "state": st}
    return {"control_commands": [{"relay": r, "commands": {cmd_key: inner}}]}


# DB cũ có thể chưa migration cột edge_control_url → SELECT có cột đó sẽ 500 và UI báo "không tìm thấy".
_edge_control_url_column_cache: Optional[bool] = None


def mysql_thiet_bi_has_edge_control_url(conn) -> bool:
    """True nếu bảng thiet_bi đã có cột edge_control_url (cache 1 lần / process)."""
    global _edge_control_url_column_cache
    if _edge_control_url_column_cache is not None:
        return _edge_control_url_column_cache
    cur = conn.cursor()
    try:
        cur.execute(
            """
            SELECT 1 FROM information_schema.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE()
              AND TABLE_NAME = 'thiet_bi'
              AND COLUMN_NAME = 'edge_control_url'
            LIMIT 1
            """
        )
        _edge_control_url_column_cache = cur.fetchone() is not None
    finally:
        cur.close()
    return _edge_control_url_column_cache


_edge_control_body_template_column_cache: Optional[bool] = None


def mysql_thiet_bi_has_edge_control_body_template(conn) -> bool:
    """True nếu bảng thiet_bi đã có cột edge_control_body_template."""
    global _edge_control_body_template_column_cache
    if _edge_control_body_template_column_cache is not None:
        return _edge_control_body_template_column_cache
    cur = conn.cursor()
    try:
        cur.execute(
            """
            SELECT 1 FROM information_schema.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE()
              AND TABLE_NAME = 'thiet_bi'
              AND COLUMN_NAME = 'edge_control_body_template'
            LIMIT 1
            """
        )
        _edge_control_body_template_column_cache = cur.fetchone() is not None
    finally:
        cur.close()
    return _edge_control_body_template_column_cache


def apply_edge_control_body_template(template: str, relay: int, state: str) -> dict:
    """
    Thay placeholder trong JSON string:
    {{relay}} → số relay (int), {{state}} → ON|OFF, {{cmd}} → on|off (khóa lệnh).
    """
    st = (state or "").strip().upper()
    if st not in ("ON", "OFF"):
        st = "OFF"
    cmd_key = "on" if st == "ON" else "off"
    t = (template or "").strip()
    if not t:
        raise ValueError("template rỗng")
    t = (
        t.replace("{{relay}}", str(int(relay)))
        .replace("{{state}}", st)
        .replace("{{cmd}}", cmd_key)
    )
    obj = json.loads(t)
    if not isinstance(obj, dict):
        raise ValueError("template phải là JSON object")
    return obj


def build_edge_control_payload_for_device(device: dict, relay: int, state: str) -> dict:
    """Dùng edge_control_body_template nếu có, không thì format mặc định."""
    tpl = device.get("edge_control_body_template")
    if tpl is not None and str(tpl).strip():
        return apply_edge_control_body_template(str(tpl), relay, state)
    return build_edge_relay_control_body(relay, state)


# =============================================================================
# Singleton Kafka Producer – khởi tạo một lần, tái sử dụng cho mọi request
# =============================================================================
_kafka_producer = None

def get_kafka_producer():
    global _kafka_producer
    if _kafka_producer is None:
        try:
            from kafka import KafkaProducer as _KP
            _kafka_producer = _KP(
                bootstrap_servers=os.getenv("KAFKA_BOOTSTRAP_SERVERS", "kafka:9092"),
                value_serializer=lambda v: json.dumps(v).encode('utf-8'),
                acks='all',
                retries=3,
            )
        except Exception as e:
            print(f"[KAFKA-PRODUCER] Failed to init: {e}")
            return None
    return _kafka_producer


# Pydantic models cho device registration
class DeviceRegisterRequest(BaseModel):
    device_id: str
    ten_thiet_bi: str
    loai_thiet_bi: Optional[str] = None
    phong_id: Optional[int] = None
    keys: List[dict]  # [{"khoa": "temperature", "don_vi": "°C"}, ...]


# Pydantic models cho Device Provisioning (Registration-First flow)
class DeviceProvisionRequest(BaseModel):
    ten_thiet_bi: str
    phong_id: int
    protocol: str = "mqtt"  # "mqtt", "http", "both"
    device_type: str = "sensor"  # "sensor", "controller", "gateway"
    loai_thiet_bi: Optional[str] = None  # Chi tiết hơn: power_meter, temperature_sensor...
    data_keys: List[dict] = []  # [{"khoa": "power", "don_vi": "W"}, ...]


class IngestDataRequest(BaseModel):
    device_id: str
    data: dict  # {"power": 1500, "voltage": 220, ...}
    timestamp: Optional[float] = None


class ControlRequest(BaseModel):
    action: str  # "on", "off", "brightness"
    value: Optional[float] = None  # required if action == brightness


class DeviceUpdateRoom(BaseModel):
    phong_id: Optional[int] = None


class RuleActionCreate(BaseModel):
    device_id: str
    action_command: str
    action_params: Optional[dict] = None
    delay_seconds: int = 0
    thu_tu: int = 1


class RuleCondition(BaseModel):
    field: str
    operator: str
    value: str


class RuleCreate(BaseModel):
    ten_rule: Optional[str] = None
    phong_id: int
    condition_device_id: str
    conditions: List[RuleCondition] = []
    muc_do_uu_tien: int = 1
    trang_thai: str = "enabled"
    actions: List[RuleActionCreate] = []
    rule_graph: Optional[dict] = None  # Visual editor: {nodes, edges}


class RuleUpdate(BaseModel):
    ten_rule: Optional[str] = None
    phong_id: Optional[int] = None
    condition_device_id: Optional[str] = None
    conditions: Optional[List[RuleCondition]] = None
    muc_do_uu_tien: Optional[int] = None
    trang_thai: Optional[str] = None
    actions: Optional[List[RuleActionCreate]] = None
    rule_graph: Optional[dict] = None


class RoomCreate(BaseModel):
    ten_phong: str
    mo_ta: Optional[str] = None
    vi_tri: Optional[str] = None
    nguoi_quan_ly_id: Optional[int] = None
    ma_phong: Optional[str] = None


class RoomUpdate(BaseModel):
    ten_phong: Optional[str] = None
    mo_ta: Optional[str] = None
    vi_tri: Optional[str] = None
    nguoi_quan_ly_id: Optional[int] = None
    ma_phong: Optional[str] = None


# ============================================================
# Camera management models
# ============================================================
class CameraCreate(BaseModel):
    ten: Optional[str] = None
    ip_address: Optional[str] = None
    port: Optional[int] = 554
    rtsp_path: Optional[str] = None
    username: Optional[str] = None
    password: Optional[str] = None
    stream_url: Optional[str] = None
    thu_tu: Optional[int] = 0


class CameraUpdate(BaseModel):
    ten: Optional[str] = None
    ip_address: Optional[str] = None
    port: Optional[int] = None
    rtsp_path: Optional[str] = None
    username: Optional[str] = None
    password: Optional[str] = None
    stream_url: Optional[str] = None
    thu_tu: Optional[int] = None
    is_active: Optional[bool] = None


class OccupancyUpdate(BaseModel):
    phong_id: int
    phong_camera_id: Optional[int] = None
    so_nguoi: int
    count_type: Optional[str] = "camera"
    nguon: Optional[str] = "ai_analyst"


class UserCreate(BaseModel):
    ten: str
    email: str
    password: str
    vai_tro: Optional[str] = "student"  # 'admin', 'teacher', or 'student'
    lop_hoc_id: Optional[int] = None


class UserUpdate(BaseModel):
    ten: Optional[str] = None
    email: Optional[str] = None
    vai_tro: Optional[str] = None
    password: Optional[str] = None  # Optional password reset
    lop_hoc_id: Optional[int] = None


class ClassCreate(BaseModel):
    ten_lop: str
    giao_vien_id: Optional[int] = None


class ClassUpdate(BaseModel):
    ten_lop: Optional[str] = None
    giao_vien_id: Optional[int] = None


class PermissionUpdate(BaseModel):
    pages: List[str]  # List of page ids the user can access


@router.post("/token", response_model=Token)
def login(form_data: OAuth2PasswordRequestForm = Depends()):
    """
    Đăng nhập bằng email và mật khẩu từ bảng nguoi_dung (MySQL).
    
    - form_data.username: email người dùng (ví dụ: 22050026@student.bdu.edu.vn)
    - form_data.password: mật khẩu gốc
    """
    user = authenticate_user(form_data.username, form_data.password)
    if not user:
        raise HTTPException(status_code=401, detail="Incorrect email or password")
    # Token lưu email (từ DB) vào field 'sub'
    token = create_access_token({"sub": user["email"]})
    return {
        "access_token": token,
        "token_type": "bearer",
        "vai_tro": user["vai_tro"],
        "allowed_pages": user["allowed_pages"]
    }


class LoginRequest(BaseModel):
    username: str
    password: str


@router.post("/login", response_model=Token)
def login_json(login_data: LoginRequest):
    """
    Đăng nhập bằng JSON body (dành cho Unity, mobile apps).
    
    Request body:
    {
        "username": "email@example.com",
        "password": "your_password"
    }
    """
    user = authenticate_user(login_data.username, login_data.password)
    if not user:
        raise HTTPException(status_code=401, detail="Incorrect email or password")
    token = create_access_token({"sub": user["email"]})
    return {
        "access_token": token,
        "token_type": "bearer",
        "vai_tro": user["vai_tro"],
        "allowed_pages": user["allowed_pages"]
    }


@router.post("/users/{user_id}/impersonate", response_model=Token)
def impersonate_user(
    user_id: int,
    current_user: str = Depends(get_current_user)
):
    """
    Đăng nhập thay mặt (impersonate) vào tài khoản của user khác.
    
    - Admin: Có thể impersonate bất kỳ ai
    - Teacher: Chỉ có thể impersonate học sinh trong lớp mình dạy
    - Student: Không có quyền
    """
    conn = get_mysql()
    cursor = conn.cursor(dictionary=True)
    
    try:
        # Lấy thông tin người dùng hiện tại
        cursor.execute("SELECT id, vai_tro FROM nguoi_dung WHERE email = %s", (current_user,))
        current_user_info = cursor.fetchone()
        if not current_user_info:
            raise HTTPException(status_code=401, detail="User not found")
        
        current_role = current_user_info["vai_tro"]
        current_user_id = current_user_info["id"]
        
        # Lấy thông tin user cần impersonate
        cursor.execute("SELECT id, email, vai_tro FROM nguoi_dung WHERE id = %s", (user_id,))
        target_user = cursor.fetchone()
        if not target_user:
            raise HTTPException(status_code=404, detail="Target user not found")
        
        # Kiểm tra quyền impersonate
        if current_role == "admin":
            # Admin có thể impersonate bất kỳ ai
            pass
        elif current_role == "teacher":
            # Teacher chỉ có thể impersonate học sinh trong lớp mình dạy
            cursor.execute("""
                SELECT 1 FROM nguoi_dung u
                JOIN lop_hoc l ON u.lop_hoc_id = l.id
                WHERE u.id = %s AND l.giao_vien_id = %s
            """, (user_id, current_user_id))
            if not cursor.fetchone():
                raise HTTPException(status_code=403, detail="Bạn chỉ có thể đăng nhập vào tài khoản học sinh trong lớp của mình")
        else:
            raise HTTPException(status_code=403, detail="Bạn không có quyền đăng nhập thay mặt")
        
        # Get allowed pages for target user
        allowed_pages = []
        if target_user["vai_tro"] == "admin":
            allowed_pages = ["*"]
        else:
            try:
                cursor.execute(
                    "SELECT trang FROM quyen_trang WHERE nguoi_dung_id = %s",
                    (user_id,)
                )
                allowed_pages = [row["trang"] for row in cursor.fetchall()]
            except Exception:
                allowed_pages = []
        
        # Tạo token cho target user
        token = create_access_token({"sub": target_user["email"]})
        
        return {
            "access_token": token,
            "token_type": "bearer",
            "vai_tro": target_user["vai_tro"],
            "allowed_pages": allowed_pages
        }
    finally:
        cursor.close()
        conn.close()

from fastapi import Query

def get_workspace_conditions(cursor, current_email: str, workspace_id: Optional[int] = None, alias: str = "") -> tuple[str, list]:
    cursor.execute("SELECT id, vai_tro FROM nguoi_dung WHERE email = %s", (current_email,))
    user = cursor.fetchone()
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
        
    user_id = user["id"]
    role = user["vai_tro"]
    col_name = f"{alias}.nguoi_so_huu_id" if alias else "nguoi_so_huu_id"
    
    if role == "admin":
        if workspace_id is not None:
            return f"{col_name} = %s", [workspace_id]
        return "1=1", []
            
    elif role == "teacher":
        allowed_ids = [user_id]
        cursor.execute("SELECT id FROM lop_hoc WHERE giao_vien_id = %s", (user_id,))
        classes = cursor.fetchall()
        if classes:
            class_ids = [c["id"] for c in classes]
            format_strings = ','.join(['%s'] * len(class_ids))
            cursor.execute(f"SELECT id FROM nguoi_dung WHERE lop_hoc_id IN ({format_strings})", tuple(class_ids))
            students = cursor.fetchall()
            allowed_ids.extend([s["id"] for s in students])
            
        if workspace_id is not None:
            if workspace_id not in allowed_ids:
                raise HTTPException(status_code=403, detail="Workspace access denied")
            return f"{col_name} = %s", [workspace_id]
        else:
            format_strings = ','.join(['%s'] * len(allowed_ids))
            return f"{col_name} IN ({format_strings})", allowed_ids
            
    else: # student
        if workspace_id is not None and workspace_id != user_id:
            raise HTTPException(status_code=403, detail="Workspace access denied")
        return f"{col_name} = %s", [user_id]

def get_authorized_workspace_id(cursor, current_email: str, workspace_id: Optional[int] = None) -> int:
    cursor.execute("SELECT id, vai_tro FROM nguoi_dung WHERE email = %s", (current_email,))
    user = cursor.fetchone()
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
        
    user_id = user["id"]
    role = user["vai_tro"]
    
    target_id = workspace_id if workspace_id is not None else user_id
    
    if role == "admin":
        return target_id
    elif role == "teacher":
        allowed_ids = [user_id]
        cursor.execute("SELECT id FROM lop_hoc WHERE giao_vien_id = %s", (user_id,))
        classes = cursor.fetchall()
        if classes:
            c_ids = [c["id"] for c in classes]
            format_strings = ','.join(['%s'] * len(c_ids))
            cursor.execute(f"SELECT id FROM nguoi_dung WHERE lop_hoc_id IN ({format_strings})", tuple(c_ids))
            students = cursor.fetchall()
            allowed_ids.extend([s["id"] for s in students])
        if target_id not in allowed_ids:
            raise HTTPException(status_code=403, detail="Not authorized for this workspace")
        return target_id
    else:
        if target_id != user_id:
            raise HTTPException(status_code=403, detail="Not authorized for this workspace")
        return target_id


def check_room_permission(room_id: int, user_email: str, action: str = "view") -> bool:
    """
    Check if user has permission to perform action on room.
    
    Actions:
    - view: Everyone can view all rooms
    - edit/delete: Only owner or admin can edit/delete
    
    Returns True if allowed, raises HTTPException if not.
    """
    conn = get_mysql()
    cursor = conn.cursor(dictionary=True)
    try:
        # Get user info
        cursor.execute("SELECT id, vai_tro FROM nguoi_dung WHERE email = %s", (user_email,))
        user = cursor.fetchone()
        if not user:
            raise HTTPException(status_code=401, detail="User not found")
        
        user_id = user["id"]
        role = user["vai_tro"]
        
        # Admin can do everything
        if role == "admin":
            return True
        
        # For view action, everyone can see all rooms
        if action == "view":
            return True
        
        # For edit/delete, check ownership
        cursor.execute("SELECT nguoi_so_huu_id FROM phong WHERE id = %s", (room_id,))
        room = cursor.fetchone()
        if not room:
            raise HTTPException(status_code=404, detail="Room not found")
        
        if room["nguoi_so_huu_id"] == user_id:
            return True
        
        raise HTTPException(status_code=403, detail=f"You don't have permission to {action} this room")
    finally:
        cursor.close()
        conn.close()

@router.get("/devices")
def list_devices(
    workspace_id: Optional[int] = Query(None),
    current_user: str = Depends(get_current_user)
):
    """
    Lấy danh sách thiết bị đã đăng ký từ bảng thiet_bi (MySQL).
    """
    conn = get_mysql()
    cursor = conn.cursor(dictionary=True)
    try:
        ws_cond, ws_params = get_workspace_conditions(cursor, current_user, workspace_id, alias="t")
        query = f"""
            SELECT t.id, t.ma_thiet_bi, t.ten_thiet_bi, t.loai_thiet_bi, 
                   t.trang_thai, t.last_seen, t.phong_id, t.nguoi_so_huu_id,
                   p.ten_phong, p.ma_phong
            FROM thiet_bi t
            LEFT JOIN phong p ON t.phong_id = p.id
            WHERE t.is_active = 1 AND {ws_cond}
            ORDER BY t.ngay_dang_ky DESC
        """
        cursor.execute(query, tuple(ws_params))
        devices = cursor.fetchall()
        return {"devices": devices}
    finally:
        cursor.close()
        conn.close()


@router.get("/devices/discover")
def discover_devices(current_user: str = Depends(get_current_user)):
    """
    Quét Kafka topic 'iot-events' trong 10 giây để tìm các device_id mới.
    Trả về danh sách thiết bị chưa đăng ký kèm sample data và detected fields.
    
    Response format:
    {
        "discovered_devices": [
            {
                "device_id": "sensor-xyz-001",
                "detected_fields": ["temperature", "humidity", "voltage"],
                "sample_data": {"temperature": 28.5, "humidity": 65.2, "voltage": 220.1},
                "suggested_type": "sensor",
                "message_count": 5
            }
        ],
        "count": 1
    }
    """
    import time
    from kafka import KafkaConsumer
    import json
    
    # Lấy danh sách device_id đã đăng ký
    conn = get_mysql()
    cursor = conn.cursor()
    try:
        cursor.execute("SELECT ma_thiet_bi FROM thiet_bi WHERE is_active = 1")
        registered_devices = {row[0] for row in cursor.fetchall()}
    finally:
        cursor.close()
        conn.close()
    
    # Dict để lưu thông tin chi tiết của mỗi device
    # device_id -> {fields: set, sample: dict, count: int}
    discovered_info = {}
    start_time = time.time()
    scan_duration = 10  # giây
    
    try:
        consumer = KafkaConsumer(
            "iot-events",
            bootstrap_servers="kafka:9092",
            value_deserializer=lambda v: json.loads(v.decode("utf-8")),
            auto_offset_reset="earliest",  # đọc cả history để không miss
            consumer_timeout_ms=scan_duration * 1000,
            group_id=f"discover-{int(time.time())}",  # Unique group để không bị cache
        )
        
        for msg in consumer:
            if msg.value and "device_id" in msg.value:
                device_id = msg.value["device_id"]
                if device_id not in registered_devices:
                    # Khởi tạo nếu chưa có
                    if device_id not in discovered_info:
                        discovered_info[device_id] = {
                            "fields": set(),
                            "sample": {},
                            "count": 0
                        }
                    
                    info = discovered_info[device_id]
                    info["count"] += 1
                    
                    # Thu thập các fields dữ liệu (bỏ qua metadata fields)
                    skip_fields = {"device_id", "timestamp", "type", "_id"}
                    for key, value in msg.value.items():
                        if key not in skip_fields and value is not None:
                            info["fields"].add(key)
                            # Lưu sample data (giá trị mới nhất)
                            info["sample"][key] = value
            
            if time.time() - start_time >= scan_duration:
                break
    except Exception as e:
        print(f"[DISCOVER] Error scanning Kafka: {e}")
    
    # Hàm đoán loại thiết bị từ fields
    def guess_device_type(fields: set) -> str:
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
    
    # Format response
    result = []
    for device_id, info in discovered_info.items():
        result.append({
            "device_id": device_id,
            "detected_fields": sorted(list(info["fields"])),
            "sample_data": info["sample"],
            "suggested_type": guess_device_type(info["fields"]),
            "message_count": info["count"]
        })
    
    # Sắp xếp theo số lượng message giảm dần (thiết bị active nhất lên đầu)
    result.sort(key=lambda x: x["message_count"], reverse=True)
    
    return {
        "discovered_devices": result,
        "count": len(result)
    }


@router.post("/devices/register")
def register_device(
    request: DeviceRegisterRequest,
    workspace_id: Optional[int] = Query(None),
    current_user: str = Depends(get_current_user)
):
    """
    Đăng ký thiết bị mới vào hệ thống.
    Insert vào bảng thiet_bi và khoa_du_lieu.
    """
    conn = get_mysql()
    cursor = conn.cursor(dictionary=True)  # ← Thêm dictionary=True
    
    try:
        owner_id = get_authorized_workspace_id(cursor, current_user, workspace_id)
        
        # Kiểm tra device_id đã tồn tại chưa
        cursor.execute("SELECT id FROM thiet_bi WHERE ma_thiet_bi = %s", (request.device_id,))
        if cursor.fetchone():
            raise HTTPException(status_code=400, detail="Device ID đã tồn tại")
        
        # Insert vào bảng thiet_bi
        cursor.execute("""
            INSERT INTO thiet_bi (ma_thiet_bi, ten_thiet_bi, loai_thiet_bi, phong_id, trang_thai, nguoi_so_huu_id)
            VALUES (%s, %s, %s, %s, 'offline', %s)
        """, (request.device_id, request.ten_thiet_bi, request.loai_thiet_bi, request.phong_id, owner_id))
        
        thiet_bi_id = cursor.lastrowid
        
        # Insert các keys vào bảng khoa_du_lieu
        for key_info in request.keys:
            cursor.execute("""
                INSERT INTO khoa_du_lieu (thiet_bi_id, khoa, don_vi, mo_ta)
                VALUES (%s, %s, %s, %s)
            """, (
                thiet_bi_id,
                key_info.get("khoa"),
                key_info.get("don_vi"),
                key_info.get("mo_ta")
            ))
        
        conn.commit()
        
        # Lấy thông tin thiết bị vừa đăng ký
        cursor.execute("""
            SELECT t.id, t.ma_thiet_bi, t.ten_thiet_bi, t.loai_thiet_bi, 
                   t.trang_thai, t.phong_id, p.ten_phong
            FROM thiet_bi t
            LEFT JOIN phong p ON t.phong_id = p.id
            WHERE t.id = %s
        """, (thiet_bi_id,))
        device = cursor.fetchone()
        
        return {
            "message": "Đăng ký thiết bị thành công",
            "device": {
                "id": device[0],
                "ma_thiet_bi": device[1],
                "ten_thiet_bi": device[2],
                "loai_thiet_bi": device[3],
                "trang_thai": device[4],
                "phong_id": device[5],
                "ten_phong": device[6] if device[6] else None
            }
        }
    except HTTPException:
        raise
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=f"Lỗi đăng ký thiết bị: {str(e)}")
    finally:
        cursor.close()
        conn.close()


# =============================================================================
# REGISTRATION-FIRST FLOW: Device Provisioning APIs
# =============================================================================

def generate_device_id(prefix: str = "dev") -> str:
    """Generate a unique device ID with prefix and random suffix."""
    suffix = secrets.token_hex(4)  # 8 hex chars
    return f"{prefix}-{suffix}"


def generate_secret_key() -> str:
    """Generate a secure secret key for MQTT authentication."""
    return f"sk_{secrets.token_hex(16)}"


def generate_api_key() -> str:
    """Generate a secure API key for HTTP ingestion."""
    return f"ak_{secrets.token_hex(16)}"


@router.post("/devices/provision")
def provision_device(
    request: DeviceProvisionRequest,
    current_user: str = Depends(get_current_user)
):
    """
    Tạo thiết bị mới và sinh credentials (Registration-First flow).
    
    - Tự động sinh device_id, secret_key, http_api_key
    - Trả về thông tin cấu hình để nạp vào thiết bị vật lý
    """
    conn = get_mysql()
    cursor = conn.cursor(dictionary=True)
    
    try:
        # Kiểm tra phong_id tồn tại
        cursor.execute("SELECT id, ten_phong FROM phong WHERE id = %s", (request.phong_id,))
        room = cursor.fetchone()
        if not room:
            raise HTTPException(status_code=404, detail="Phòng không tồn tại")
        
        # Sinh device_id dựa trên loại thiết bị
        prefix = request.loai_thiet_bi or request.device_type or "dev"
        device_id = generate_device_id(prefix)
        
        # Sinh credentials
        secret_key = generate_secret_key()
        http_api_key = generate_api_key() if request.protocol in ["http", "both"] else None
        
        # Insert vào bảng thiet_bi
        cursor.execute("""
            INSERT INTO thiet_bi (
                ma_thiet_bi, ten_thiet_bi, loai_thiet_bi, phong_id, 
                trang_thai, protocol, device_type, secret_key, http_api_key, provisioned_at
            )
            VALUES (%s, %s, %s, %s, 'offline', %s, %s, %s, %s, NOW())
        """, (
            device_id,
            request.ten_thiet_bi,
            request.loai_thiet_bi or request.device_type,
            request.phong_id,
            request.protocol,
            request.device_type,
            secret_key,
            http_api_key
        ))
        
        thiet_bi_id = cursor.lastrowid
        
        # Insert các data keys nếu có
        for key_info in request.data_keys:
            cursor.execute("""
                INSERT INTO khoa_du_lieu (thiet_bi_id, khoa, don_vi, mo_ta)
                VALUES (%s, %s, %s, %s)
            """, (
                thiet_bi_id,
                key_info.get("khoa"),
                key_info.get("don_vi"),
                key_info.get("mo_ta")
            ))
        
        conn.commit()
        
        # Tạo response với config
        mqtt_config = None
        http_config = None
        
        # Lấy server host từ environment hoặc request
        import os
        mqtt_broker_host = os.getenv("MQTT_BROKER_HOST", None)
        if not mqtt_broker_host:
            # Nếu không có env var, dùng địa chỉ mặc định
            mqtt_broker_host = "localhost"
        
        if request.protocol in ["mqtt", "both"]:
            topics = get_topics(device_id)
            mqtt_config = {
                "broker": mqtt_broker_host,
                "port": int(os.getenv("MQTT_PORT", "1883")),
                "username": device_id,
                "password": secret_key,
                "topic_data":    topics["data"],
                "topic_status":  topics["status"],
                "topic_control": topics["control"],
                "topic_lwt":     topics["lwt"],
            }
        
        if request.protocol in ["http", "both"]:
            http_config = get_http_config(device_id, http_api_key)
        
        return {
            "message": "Thiết bị đã được tạo thành công",
            "device": {
                "id": thiet_bi_id,
                "device_id": device_id,
                "ten_thiet_bi": request.ten_thiet_bi,
                "phong": room["ten_phong"],
                "protocol": request.protocol,
                "device_type": request.device_type
            },
            "credentials": {
                "device_id": device_id,
                "secret_key": secret_key,
                "http_api_key": http_api_key
            },
            "mqtt_config": mqtt_config,
            "http_config": http_config
        }
    except HTTPException:
        raise
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=f"Lỗi tạo thiết bị: {str(e)}")
    finally:
        cursor.close()
        conn.close()


@router.get("/devices/{device_id}/credentials")
def get_device_credentials(
    device_id: str,
    current_user: str = Depends(get_current_user)
):
    """
    Xem lại credentials của thiết bị (chỉ admin/owner).
    """
    conn = get_mysql()
    cursor = conn.cursor(dictionary=True)
    
    try:
        cursor.execute("""
            SELECT t.id, t.ma_thiet_bi, t.ten_thiet_bi, t.secret_key, t.http_api_key,
                   t.protocol, t.device_type, t.provisioned_at, p.ten_phong
            FROM thiet_bi t
            LEFT JOIN phong p ON t.phong_id = p.id
            WHERE t.ma_thiet_bi = %s AND t.is_active = 1
        """, (device_id,))
        device = cursor.fetchone()
        
        if not device:
            raise HTTPException(status_code=404, detail="Thiết bị không tồn tại")
        
        mqtt_config = None
        http_config = None
        
        if device["protocol"] in ["mqtt", "both"]:
            _topics = get_topics(device["ma_thiet_bi"])
            mqtt_config = {
                "broker": "YOUR_MQTT_BROKER_IP",
                "port": int(os.getenv("MQTT_PORT", "1883")),
                "username": device["ma_thiet_bi"],
                "password": device["secret_key"],
                "topic_data":    _topics["data"],
                "topic_status":  _topics["status"],
                "topic_control": _topics["control"],
            }
        
        if device["protocol"] in ["http", "both"] and device["http_api_key"]:
            http_config = get_http_config(device["ma_thiet_bi"], device["http_api_key"])

        
        return {
            "device_id": device["ma_thiet_bi"],
            "ten_thiet_bi": device["ten_thiet_bi"],
            "phong": device["ten_phong"],
            "protocol": device["protocol"],
            "device_type": device["device_type"],
            "provisioned_at": device["provisioned_at"].isoformat() if device["provisioned_at"] else None,
            "credentials": {
                "secret_key": device["secret_key"],
                "http_api_key": device["http_api_key"]
            },
            "mqtt_config": mqtt_config,
            "http_config": http_config
        }
    finally:
        cursor.close()
        conn.close()


@router.post("/devices/{device_id}/regenerate-key")
def regenerate_device_key(
    device_id: str,
    key_type: str = "all",  # "mqtt", "http", "all"
    current_user: str = Depends(get_current_user)
):
    """
    Sinh lại secret_key hoặc http_api_key cho thiết bị.
    """
    conn = get_mysql()
    cursor = conn.cursor()
    
    try:
        # Kiểm tra thiết bị tồn tại
        cursor.execute("SELECT id, protocol FROM thiet_bi WHERE ma_thiet_bi = %s AND is_active = 1", (device_id,))
        device = cursor.fetchone()
        if not device:
            raise HTTPException(status_code=404, detail="Thiết bị không tồn tại")
        
        new_secret_key = None
        new_http_api_key = None
        
        if key_type in ["mqtt", "all"]:
            new_secret_key = generate_secret_key()
            cursor.execute(
                "UPDATE thiet_bi SET secret_key = %s WHERE ma_thiet_bi = %s",
                (new_secret_key, device_id)
            )
        
        if key_type in ["http", "all"]:
            new_http_api_key = generate_api_key()
            cursor.execute(
                "UPDATE thiet_bi SET http_api_key = %s WHERE ma_thiet_bi = %s",
                (new_http_api_key, device_id)
            )
        
        conn.commit()
        
        return {
            "message": "Đã sinh lại credentials thành công",
            "device_id": device_id,
            "new_credentials": {
                "secret_key": new_secret_key,
                "http_api_key": new_http_api_key
            }
        }
    except HTTPException:
        raise
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=f"Lỗi sinh lại key: {str(e)}")
    finally:
        cursor.close()
        conn.close()


@router.post("/devices/{device_id}/detect-keys")
def detect_device_keys(
    device_id: str,
    listen_seconds: int = 10,
    current_user: str = Depends(get_current_user)
):
    """
    Lắng nghe Kafka trong N giây để detect data keys từ messages thực tế.
    Tự động thêm vào bảng khoa_du_lieu nếu phát hiện keys mới.
    """
    from kafka import KafkaConsumer
    from datetime import datetime
    
    conn = get_mysql()
    cursor = conn.cursor(dictionary=True)
    
    try:
        # Kiểm tra thiết bị tồn tại
        cursor.execute("SELECT id FROM thiet_bi WHERE ma_thiet_bi = %s AND is_active = 1", (device_id,))
        device = cursor.fetchone()
        if not device:
            raise HTTPException(status_code=404, detail="Thiết bị không tồn tại")
        
        thiet_bi_id = device["id"]
        
        # Lấy existing keys
        cursor.execute("SELECT khoa FROM khoa_du_lieu WHERE thiet_bi_id = %s", (thiet_bi_id,))
        existing_keys = {row["khoa"] for row in cursor.fetchall()}
        
        # Listen to Kafka for device messages
        detected_keys = {}
        sample_data = {}
        message_count = 0
        
        try:
            consumer = KafkaConsumer(
                "iot-events",
                bootstrap_servers="kafka:9092",
                auto_offset_reset="latest",
                enable_auto_commit=False,
                consumer_timeout_ms=listen_seconds * 1000,
                value_deserializer=lambda m: json.loads(m.decode('utf-8'))
            )
            
            start_time = time.time()
            while time.time() - start_time < listen_seconds:
                for message in consumer:
                    data = message.value
                    msg_device_id = data.get("device_id")
                    
                    if msg_device_id == device_id:
                        message_count += 1
                        # Extract keys from payload
                        for key, value in data.items():
                            if key not in ["device_id", "timestamp", "type", "topic"]:
                                if key not in detected_keys:
                                    detected_keys[key] = {
                                        "sample_value": value,
                                        "python_type": type(value).__name__,
                                        "don_vi": guess_unit(key, value),
                                        "count": 0
                                    }
                                detected_keys[key]["count"] += 1
                                sample_data[key] = value
                    
                    if time.time() - start_time >= listen_seconds:
                        break
            
            consumer.close()
        except Exception as kafka_err:
            print(f"[DETECT-KEYS] Kafka error: {kafka_err}")
        
        # Add new keys to database
        new_keys_added = []
        for key, info in detected_keys.items():
            if key not in existing_keys:
                cursor.execute("""
                    INSERT INTO khoa_du_lieu (thiet_bi_id, khoa, don_vi, mo_ta)
                    VALUES (%s, %s, %s, %s)
                """, (
                    thiet_bi_id,
                    key,
                    info["don_vi"],
                    f"Auto-detected from device data"
                ))
                new_keys_added.append({
                    "khoa": key,
                    "don_vi": info["don_vi"],
                    "sample_value": info["sample_value"]
                })
        
        conn.commit()
        
        return {
            "message": f"Đã lắng nghe {listen_seconds}s và phát hiện {len(detected_keys)} keys",
            "device_id": device_id,
            "message_count": message_count,
            "detected_keys": list(detected_keys.keys()),
            "new_keys_added": new_keys_added,
            "existing_keys": list(existing_keys),
            "sample_data": sample_data
        }
    except HTTPException:
        raise
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=f"Lỗi detect keys: {str(e)}")
    finally:
        cursor.close()
        conn.close()


def guess_unit(key: str, value) -> str:
    """Đoán đơn vị dựa trên tên key và giá trị."""
    key_lower = key.lower()
    
    unit_map = {
        "temperature": "°C",
        "temp": "°C",
        "nhiet_do": "°C",
        "humidity": "%",
        "hum": "%",
        "do_am": "%",
        "power": "W",
        "voltage": "V",
        "dien_ap": "V",
        "current": "A",
        "dong_dien": "A",
        "energy": "kWh",
        "dien_nang": "kWh",
        "brightness": "%",
        "do_sang": "%",
        "pressure": "hPa",
        "ap_suat": "hPa",
        "speed": "m/s",
        "toc_do": "m/s",
        "distance": "m",
        "khoang_cach": "m",
        "weight": "kg",
        "can_nang": "kg",
    }
    
    for pattern, unit in unit_map.items():
        if pattern in key_lower:
            return unit
    
    # Guess from value type
    if isinstance(value, bool):
        return "bool"
    elif isinstance(value, int):
        return ""
    elif isinstance(value, float):
        return ""
    
    return ""

# =============================================================================
# CONTROL LINES (đường điều khiển ON/OFF) APIs
# =============================================================================

class ControlLineItem(BaseModel):
    relay_number: int
    ten_duong: str = ""
    topic: Optional[str] = None
    hien_thi_ttcds: bool = True

class ControlLinesRequest(BaseModel):
    lines: List[ControlLineItem]


@router.post("/devices/{device_id}/control-lines")
def save_control_lines(
    device_id: str,
    request: ControlLinesRequest,
    current_user: str = Depends(get_current_user)
):
    """
    Lưu danh sách đường điều khiển (relay/output) cho thiết bị.
    Xóa tất cả control lines cũ rồi insert mới (replace all).
    """
    conn = get_mysql()
    cursor = conn.cursor(dictionary=True)

    try:
        cursor.execute(
            "SELECT id FROM thiet_bi WHERE ma_thiet_bi = %s AND is_active = 1",
            (device_id,)
        )
        device = cursor.fetchone()
        if not device:
            raise HTTPException(status_code=404, detail="Thiết bị không tồn tại")

        thiet_bi_id = device["id"]

        # Xóa control lines cũ
        cursor.execute("DELETE FROM control_lines WHERE thiet_bi_id = %s", (thiet_bi_id,))

        # Insert control lines mới
        for line in request.lines:
            cursor.execute("""
                INSERT INTO control_lines (thiet_bi_id, relay_number, ten_duong, topic, hien_thi_ttcds)
                VALUES (%s, %s, %s, %s, %s)
            """, (thiet_bi_id, line.relay_number, line.ten_duong, line.topic, int(line.hien_thi_ttcds)))

        conn.commit()

        return {
            "message": f"Đã lưu {len(request.lines)} đường điều khiển",
            "device_id": device_id,
            "control_lines": [
                {
                    "relay_number": l.relay_number,
                    "ten_duong": l.ten_duong,
                    "topic": l.topic,
                    "hien_thi_ttcds": l.hien_thi_ttcds
                } for l in request.lines
            ]
        }
    except HTTPException:
        raise
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=f"Lỗi lưu control lines: {str(e)}")
    finally:
        cursor.close()
        conn.close()


@router.get("/devices/{device_id}/control-lines")
def get_control_lines(
    device_id: str,
    current_user: str = Depends(get_current_user)
):
    """Lấy danh sách đường điều khiển của thiết bị."""
    conn = get_mysql()
    cursor = conn.cursor(dictionary=True)

    try:
        cursor.execute(
            "SELECT id FROM thiet_bi WHERE ma_thiet_bi = %s AND is_active = 1",
            (device_id,)
        )
        device = cursor.fetchone()
        if not device:
            raise HTTPException(status_code=404, detail="Thiết bị không tồn tại")

        cursor.execute("""
            SELECT relay_number, ten_duong, topic, hien_thi_ttcds FROM control_lines
            WHERE thiet_bi_id = %s ORDER BY relay_number
        """, (device["id"],))
        lines = cursor.fetchall()
        for line in lines:
            line['hien_thi_ttcds'] = bool(line['hien_thi_ttcds'])

        return {"device_id": device_id, "control_lines": lines}
    finally:
        cursor.close()
        conn.close()


class EdgeControlUrlUpdate(BaseModel):
    """URL đầy đủ hoặc host+path, ví dụ http://192.168.190.171/api/v1/control. Để trống = xóa URL."""
    edge_control_url: str = ""
    # JSON mẫu có placeholder {{relay}}, {{state}}, {{cmd}} — để trống = dùng format mặc định backend
    edge_control_body_template: str = ""


@router.put("/devices/{device_id}/edge-control-url")
def update_edge_control_url(
    device_id: str,
    body: EdgeControlUrlUpdate,
    current_user: str = Depends(get_current_user),
):
    """Lưu URL HTTP để gửi lệnh relay xuống thiết bị edge (khi bật relay trên UI)."""
    conn = get_mysql()
    cursor = conn.cursor(dictionary=True)
    try:
        if not mysql_thiet_bi_has_edge_control_url(conn):
            raise HTTPException(
                status_code=503,
                detail="MySQL chưa có cột edge_control_url. Chạy migrations/add_edge_control_url.sql rồi restart backend.",
            )
        has_tpl_col = mysql_thiet_bi_has_edge_control_body_template(conn)
        cursor.execute(
            "SELECT id FROM thiet_bi WHERE ma_thiet_bi = %s AND is_active = 1",
            (device_id,),
        )
        row = cursor.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Thiết bị không tồn tại")

        raw = (body.edge_control_url or "").strip()
        if not raw:
            if has_tpl_col:
                cursor.execute(
                    "UPDATE thiet_bi SET edge_control_url = NULL, edge_control_body_template = NULL WHERE id = %s",
                    (row["id"],),
                )
            else:
                cursor.execute(
                    "UPDATE thiet_bi SET edge_control_url = NULL WHERE id = %s",
                    (row["id"],),
                )
            conn.commit()
            return {
                "message": "ok",
                "device_id": device_id,
                "edge_control_url": None,
                "edge_control_body_template": None,
            }

        normalized = normalize_edge_control_url(raw)
        tpl_raw = (body.edge_control_body_template or "").strip()
        if has_tpl_col:
            tpl_sql = tpl_raw or None
            # Kiểm tra JSON + placeholder (relay 1 ON)
            if tpl_sql:
                try:
                    apply_edge_control_body_template(tpl_sql, 1, "ON")
                except Exception as ve:
                    raise HTTPException(
                        status_code=400,
                        detail=f"edge_control_body_template không hợp lệ (thử {{relay}}=1, {{state}}=ON, {{cmd}}=on): {ve}",
                    )
            cursor.execute(
                "UPDATE thiet_bi SET edge_control_url = %s, edge_control_body_template = %s WHERE id = %s",
                (normalized, tpl_sql, row["id"]),
            )
        else:
            cursor.execute(
                "UPDATE thiet_bi SET edge_control_url = %s WHERE id = %s",
                (normalized, row["id"]),
            )
        conn.commit()
        return {
            "message": "ok",
            "device_id": device_id,
            "edge_control_url": normalized,
            "edge_control_body_template": ((tpl_raw or None) if has_tpl_col else None),
        }
    except HTTPException:
        raise
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=f"Lỗi cập nhật edge_control_url: {e}")
    finally:
        cursor.close()
        conn.close()


@router.get("/devices/{device_id}/full-config")
def get_full_config(
    device_id: str,
    current_user: str = Depends(get_current_user)
):
    """
    Trả về config đầy đủ cho thiết bị: credentials, MQTT/HTTP, data keys, control commands.
    Dùng cho nút Download Config – nội dung tự cập nhật theo tiến trình cấu hình.
    """
    conn = get_mysql()
    cursor = conn.cursor(dictionary=True)

    try:
        has_edge_col = mysql_thiet_bi_has_edge_control_url(conn)
        if has_edge_col:
            cursor.execute("""
                SELECT t.id, t.ma_thiet_bi, t.ten_thiet_bi, t.loai_thiet_bi,
                       t.secret_key, t.http_api_key, t.protocol, t.device_type,
                       t.edge_control_url, p.ten_phong
                FROM thiet_bi t
                LEFT JOIN phong p ON t.phong_id = p.id
                WHERE t.ma_thiet_bi = %s AND t.is_active = 1
            """, (device_id,))
        else:
            cursor.execute("""
                SELECT t.id, t.ma_thiet_bi, t.ten_thiet_bi, t.loai_thiet_bi,
                       t.secret_key, t.http_api_key, t.protocol, t.device_type,
                       p.ten_phong
                FROM thiet_bi t
                LEFT JOIN phong p ON t.phong_id = p.id
                WHERE t.ma_thiet_bi = %s AND t.is_active = 1
            """, (device_id,))
        device = cursor.fetchone()
        if not device:
            raise HTTPException(status_code=404, detail="Thiết bị không tồn tại")

        thiet_bi_id = device["id"]

        result = {
            "device": {
                "device_id": device["ma_thiet_bi"],
                "ten_thiet_bi": device["ten_thiet_bi"],
                "phong": device["ten_phong"],
                "protocol": device["protocol"],
                "device_type": device["device_type"],
                "edge_control_url": device.get("edge_control_url"),
            },
            "credentials": {
                "device_id": device["ma_thiet_bi"],
                "secret_key": device["secret_key"],
                "http_api_key": device["http_api_key"]
            }
        }

        # MQTT config
        if device["protocol"] in ["mqtt", "both"]:
            mqtt_broker_host = os.getenv("MQTT_BROKER_HOST", "localhost")
            topics = get_topics(device["ma_thiet_bi"])
            result["mqtt_config"] = {
                "broker": mqtt_broker_host,
                "port": int(os.getenv("MQTT_PORT", "1883")),
                "username": device["ma_thiet_bi"],
                "password": device["secret_key"],
                "topic_data": topics["data"],
                "topic_status": topics["status"],
                "topic_control": topics["control"],
                "topic_lwt": topics["lwt"],
            }

        # HTTP config
        if device["protocol"] in ["http", "both"] and device["http_api_key"]:
            result["http_config"] = get_http_config(device["ma_thiet_bi"], device["http_api_key"])

        # Data keys
        cursor.execute("""
            SELECT khoa, don_vi, mo_ta FROM khoa_du_lieu
            WHERE thiet_bi_id = %s ORDER BY id
        """, (thiet_bi_id,))
        data_keys = cursor.fetchall()
        if data_keys:
            result["data_keys"] = data_keys

        # Control lines → Control commands
        cursor.execute("""
            SELECT relay_number, ten_duong, topic, hien_thi_ttcds FROM control_lines
            WHERE thiet_bi_id = %s ORDER BY relay_number
        """, (thiet_bi_id,))
        control_lines = cursor.fetchall()

        if control_lines:
            default_topic = get_topics(device["ma_thiet_bi"])["control"]
            control_commands = []
            for line in control_lines:
                rn = line["relay_number"]
                custom_topic = line["topic"]
                control_commands.append({
                    "relay": rn,
                    "name": line["ten_duong"] or f"Relay {rn}",
                    "topic": custom_topic if custom_topic else default_topic,
                    "commands": {
                        "on":  {"relay": rn, "state": "ON"},
                        "off": {"relay": rn, "state": "OFF"}
                    }
                })
            result["control_commands"] = control_commands

        # Định dạng POST xuống edge (theo template thiết bị nếu có)
        has_tpl_col = mysql_thiet_bi_has_edge_control_body_template(conn)
        try:
            ex_on = build_edge_control_payload_for_device(device, 1, "ON")
            ex_off = build_edge_control_payload_for_device(device, 1, "OFF")
        except Exception:
            ex_on = build_edge_relay_control_body(1, "ON")
            ex_off = build_edge_relay_control_body(1, "OFF")
        result["edge_http_relay_control"] = {
            "edge_control_url": device.get("edge_control_url"),
            "edge_control_body_template": device.get("edge_control_body_template") if has_tpl_col else None,
            "method": "POST",
            "content_type": "application/json",
            "example_on_relay_1": ex_on,
            "example_off_relay_1": ex_off,
        }

        return result
    finally:
        cursor.close()
        conn.close()


# =============================================================================
# DEVICE DATA KEYS (khoa_du_lieu) CRUD APIs
# =============================================================================

class DeviceKeyCreate(BaseModel):
    khoa: str
    don_vi: Optional[str] = None
    mo_ta: Optional[str] = None


class DeviceKeyUpdate(BaseModel):
    don_vi: Optional[str] = None
    mo_ta: Optional[str] = None


@router.get("/devices/{device_id}/keys")
def get_device_keys(device_id: str, current_user: str = Depends(get_current_user)):
    """Lấy danh sách tất cả data fields (khoa_du_lieu) của một thiết bị."""
    conn = get_mysql()
    cursor = conn.cursor(dictionary=True)
    try:
        cursor.execute("SELECT id FROM thiet_bi WHERE ma_thiet_bi = %s AND is_active = 1", (device_id,))
        device = cursor.fetchone()
        if not device:
            raise HTTPException(status_code=404, detail="Thiết bị không tồn tại")
        cursor.execute(
            "SELECT id, khoa, don_vi, mo_ta FROM khoa_du_lieu WHERE thiet_bi_id = %s ORDER BY id ASC",
            (device["id"],)
        )
        keys = cursor.fetchall()
        return {"device_id": device_id, "keys": keys}
    finally:
        cursor.close()
        conn.close()


@router.post("/devices/{device_id}/keys")
def create_device_key(
    device_id: str,
    body: DeviceKeyCreate,
    current_user: str = Depends(get_current_user)
):
    """Thêm mới một data field cho thiết bị vào bảng khoa_du_lieu."""
    conn = get_mysql()
    cursor = conn.cursor(dictionary=True)
    try:
        cursor.execute("SELECT id FROM thiet_bi WHERE ma_thiet_bi = %s AND is_active = 1", (device_id,))
        device = cursor.fetchone()
        if not device:
            raise HTTPException(status_code=404, detail="Thiết bị không tồn tại")
        # Kiểm tra trùng khóa
        cursor.execute(
            "SELECT id FROM khoa_du_lieu WHERE thiet_bi_id = %s AND khoa = %s",
            (device["id"], body.khoa)
        )
        if cursor.fetchone():
            raise HTTPException(status_code=400, detail=f"Field '{body.khoa}' đã tồn tại")
        cursor.execute(
            "INSERT INTO khoa_du_lieu (thiet_bi_id, khoa, don_vi, mo_ta) VALUES (%s, %s, %s, %s)",
            (device["id"], body.khoa, body.don_vi, body.mo_ta)
        )
        conn.commit()
        new_id = cursor.lastrowid
        return {"message": "Đã thêm field thành công", "key": {"id": new_id, "khoa": body.khoa, "don_vi": body.don_vi, "mo_ta": body.mo_ta}}
    except HTTPException:
        raise
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=f"Lỗi thêm field: {str(e)}")
    finally:
        cursor.close()
        conn.close()


@router.put("/devices/{device_id}/keys/{key_id}")
def update_device_key(
    device_id: str,
    key_id: int,
    body: DeviceKeyUpdate,
    current_user: str = Depends(get_current_user)
):
    """Cập nhật đơn vị hoặc mô tả của một data field."""
    conn = get_mysql()
    cursor = conn.cursor(dictionary=True)
    try:
        cursor.execute("SELECT id FROM thiet_bi WHERE ma_thiet_bi = %s AND is_active = 1", (device_id,))
        device = cursor.fetchone()
        if not device:
            raise HTTPException(status_code=404, detail="Thiết bị không tồn tại")
        cursor.execute(
            "SELECT id FROM khoa_du_lieu WHERE id = %s AND thiet_bi_id = %s",
            (key_id, device["id"])
        )
        if not cursor.fetchone():
            raise HTTPException(status_code=404, detail="Field không tồn tại")
        cursor.execute(
            "UPDATE khoa_du_lieu SET don_vi = %s, mo_ta = %s WHERE id = %s",
            (body.don_vi, body.mo_ta, key_id)
        )
        conn.commit()
        return {"message": "Đã cập nhật field thành công"}
    except HTTPException:
        raise
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=f"Lỗi cập nhật field: {str(e)}")
    finally:
        cursor.close()
        conn.close()


@router.delete("/devices/{device_id}/keys/{key_id}")
def delete_device_key(
    device_id: str,
    key_id: int,
    current_user: str = Depends(get_current_user)
):
    """Xóa một data field khỏi thiết bị."""
    conn = get_mysql()
    cursor = conn.cursor(dictionary=True)
    try:
        cursor.execute("SELECT id FROM thiet_bi WHERE ma_thiet_bi = %s AND is_active = 1", (device_id,))
        device = cursor.fetchone()
        if not device:
            raise HTTPException(status_code=404, detail="Thiết bị không tồn tại")
        cursor.execute(
            "SELECT id, khoa FROM khoa_du_lieu WHERE id = %s AND thiet_bi_id = %s",
            (key_id, device["id"])
        )
        key = cursor.fetchone()
        if not key:
            raise HTTPException(status_code=404, detail="Field không tồn tại")
        cursor.execute("DELETE FROM khoa_du_lieu WHERE id = %s", (key_id,))
        conn.commit()
        return {"message": f"Đã xóa field '{key['khoa']}' thành công"}
    except HTTPException:
        raise
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=f"Lỗi xóa field: {str(e)}")
    finally:
        cursor.close()
        conn.close()


class DeviceControlRequest(BaseModel):
    # Mặc định để client chỉ gửi raw_payload (relay) không bị 422 thiếu action
    action: str = "raw"             # ví dụ: "on", "off", "brightness", "relay"
    value: Optional[float] = None   # giá trị kèm theo nếu cần (brighness, setpoint...)
    raw_payload: Optional[dict] = None  # gửi payload tùy ý (bỏ qua action template)


@router.post("/devices/{device_id}/control")
def control_device_endpoint(
    device_id: str,
    body: DeviceControlRequest,
    current_user: str = Depends(get_current_user_or_internal)
):
    """
    Gửi lệnh điều khiển tới thiết bị qua MQTT.

    - Dùng action name để tra template từ device_config.DEFAULT_COMMANDS
    - Hoặc truyền raw_payload để gửi payload tùy ý
    - Topic điều khiển được lấy từ device_config.get_topics()
    - Nếu thiết bị có edge_control_url và raw_payload chứa relay+state: POST JSON tới edge
      (format control_commands), không gửi MQTT cho lệnh relay đó.

    Để xem danh sách action commands hỗ trợ: GET /config/commands
    """
    return send_control_command(device_id, body, current_user)


def send_control_command(
    device_id: str,
    body: DeviceControlRequest,
    current_user: str
):
    """
    Internal function to send control command.
    Called by both /control endpoint and /control-relay endpoint.
    - Topic điều khiển được lấy từ device_config.get_topics()
    - Nếu thiết bị có edge_control_url và raw_payload chứa relay+state: POST JSON tới edge
      (format control_commands), không gửi MQTT cho lệnh relay đó.

    Để xem danh sách action commands hỗ trợ: GET /config/commands
    """
    conn = get_mysql()
    cursor = conn.cursor(dictionary=True)
    try:
        has_edge_col = mysql_thiet_bi_has_edge_control_url(conn)
        if has_edge_col:
            cursor.execute(
                "SELECT id, ma_thiet_bi, ten_thiet_bi, trang_thai, edge_control_url, http_api_key FROM thiet_bi WHERE ma_thiet_bi = %s AND is_active = 1",
                (device_id,),
            )
        else:
            cursor.execute(
                "SELECT id, ma_thiet_bi, ten_thiet_bi, trang_thai, http_api_key FROM thiet_bi WHERE ma_thiet_bi = %s AND is_active = 1",
                (device_id,),
            )
        device = cursor.fetchone()
        # #region agent log
        _log_path = os.getenv("DEBUG_LOG_PATH", "debug-6eeaf8.log")
        try:
            with open(_log_path, "a", encoding="utf-8") as _f:
                _f.write(json.dumps({"sessionId":"6eeaf8","location":"routes.py:control","message":"device_lookup","data":{"device_id":device_id,"device_found":device is not None},"hypothesisId":"B","timestamp":int(time.time()*1000)}) + "\n")
        except Exception:
            pass
        # #endregion
        if not device:
            raise HTTPException(status_code=404, detail="Thiết bị không tồn tại hoặc đã bị vô hiệu hoá")

        # Build MQTT payload
        if body.raw_payload:
            payload = body.raw_payload
        else:
            payload = build_command_payload(body.action, body.value)

        edge_url = (device.get("edge_control_url") or "").strip() or None
        relay_http = (
            edge_url
            and isinstance(payload, dict)
            and "relay" in payload
            and "state" in payload
        )

        if relay_http:
            try:
                relay_num = int(payload["relay"])
                state_str = str(payload["state"])
                edge_body = build_edge_relay_control_body(relay_num, state_str)
                timeout_s = float(os.getenv("EDGE_CONTROL_TIMEOUT", "10"))
                req_headers = {"Content-Type": "application/json"}
                # Edge có thể yêu cầu X-API-Key (tùy firmware):
                # - EDGE_CONTROL_API_KEY: một key chung cho mọi thiết bị
                # - EDGE_CONTROL_USE_DEVICE_HTTP_KEY=1: dùng cột http_api_key của thiết bị (như file download config)
                _edge_key = (os.getenv("EDGE_CONTROL_API_KEY") or "").strip()
                _use_dev_key = (os.getenv("EDGE_CONTROL_USE_DEVICE_HTTP_KEY") or "").strip().lower() in (
                    "1",
                    "true",
                    "yes",
                )
                _dev_key = _device_http_api_key_value(device)
                if _edge_key:
                    req_headers["X-API-Key"] = _edge_key
                elif _use_dev_key and _dev_key:
                    req_headers["X-API-Key"] = _dev_key
                elif _use_dev_key and not _dev_key and not _edge_key:
                    raise HTTPException(
                        status_code=503,
                        detail=(
                            "Thiếu API key khi gọi edge: cột http_api_key của thiết bị trống hoặc "
                            "chưa bật EDGE_CONTROL_USE_DEVICE_HTTP_KEY / EDGE_CONTROL_API_KEY. "
                            "Xem docs/EDGE_CONTROL_DEBUG.md."
                        ),
                    )
                resp = requests.post(
                    edge_url,
                    json=edge_body,
                    headers=req_headers,
                    timeout=timeout_s,
                )
                if resp.status_code >= 400:
                    # #region agent log
                    try:
                        with open(os.getenv("DEBUG_LOG_PATH", "debug-6eeaf8.log"), "a", encoding="utf-8") as _f:
                            _f.write(
                                json.dumps(
                                    {
                                        "sessionId": "6eeaf8",
                                        "location": "routes.py:control",
                                        "message": "edge_http_error",
                                        "data": {
                                            "device_id": device_id,
                                            "edge_status": resp.status_code,
                                            "sent_x_api_key": bool(req_headers.get("X-API-Key")),
                                            "edge_url_host": edge_url.split("/")[2] if "://" in edge_url else edge_url[:48],
                                        },
                                        "timestamp": int(time.time() * 1000),
                                    }
                                )
                                + "\n"
                            )
                    except Exception:
                        pass
                    # #endregion
                    raise HTTPException(
                        status_code=502,
                        detail=f"Edge trả lỗi HTTP {resp.status_code}: {resp.text[:500]}",
                    )
            except HTTPException:
                raise
            except ValueError as ve:
                raise HTTPException(status_code=400, detail=f"relay/state không hợp lệ: {ve}")
            except requests.RequestException as rexc:
                raise HTTPException(
                    status_code=503,
                    detail=f"Không gọi được edge HTTP: {rexc}",
                )

            try:
                cursor.execute(
                    """
                    INSERT INTO du_lieu_thiet_bi (thiet_bi_id, khoa, gia_tri, thoi_gian)
                    VALUES (%s, %s, %s, NOW())
                    """,
                    (device["id"], "cmd_edge_relay", json.dumps(edge_body)),
                )
                cursor.execute(
                    "UPDATE thiet_bi SET last_seen = NOW() WHERE id = %s",
                    (device["id"],),
                )
                conn.commit()
            except Exception:
                pass

            return {
                "status": "ok",
                "device_id": device_id,
                "action": body.action,
                "payload_sent": edge_body,
                "via": "http",
                "edge_control_url": edge_url,
            }

        # MQTT topic từ device_config
        topics = get_topics(device_id)
        control_topic = topics["control"]

        # Check for individual relay topic override
        if isinstance(payload, dict) and "relay" in payload:
            try:
                rn = int(payload["relay"])
                cursor.execute("SELECT topic FROM control_lines WHERE thiet_bi_id = %s AND relay_number = %s", (device["id"], rn))
                row = cursor.fetchone()
                if row and row.get("topic"):
                    control_topic = row["topic"]
            except Exception:
                pass

        # Gửi qua MQTT
        mqtt_broker = os.getenv("MQTT_BROKER_HOST", "mqtt")
        mqtt_port = int(os.getenv("MQTT_PORT", "1883"))
        mqtt_user = os.getenv("MQTT_USERNAME", "bdu_admin")
        mqtt_pwd = os.getenv("MQTT_PASSWORD", "admin_secret")
        
        auth = None
        if mqtt_user and mqtt_pwd:
            auth = {"username": mqtt_user, "password": mqtt_pwd}
        # #region agent log
        try:
            with open(os.getenv("DEBUG_LOG_PATH", "debug-6eeaf8.log"), "a", encoding="utf-8") as _f:
                _f.write(json.dumps({"sessionId":"6eeaf8","location":"routes.py:control","message":"mqtt_before_publish","data":{"device_id":device_id,"topic":control_topic,"auth_user":mqtt_user,"has_auth":auth is not None,"payload_keys":list(payload.keys())},"hypothesisId":"A","timestamp":int(time.time()*1000)}) + "\n")
        except Exception:
            pass
        # #endregion

        try:
            publish.single(
                control_topic,
                payload=json.dumps(payload),
                hostname=mqtt_broker,
                port=mqtt_port,
                auth=auth,
                retain=False,
                qos=1,
            )
            # #region agent log
            try:
                with open(os.getenv("DEBUG_LOG_PATH", "debug-6eeaf8.log"), "a", encoding="utf-8") as _f:
                    _f.write(json.dumps({"sessionId":"6eeaf8","location":"routes.py:control","message":"mqtt_publish_ok","data":{"device_id":device_id,"topic":control_topic},"hypothesisId":"A","timestamp":int(time.time()*1000)}) + "\n")
            except Exception:
                pass
            # #endregion
        except Exception as mqtt_err:
            # #region agent log
            try:
                with open(os.getenv("DEBUG_LOG_PATH", "debug-6eeaf8.log"), "a", encoding="utf-8") as _f:
                    _f.write(json.dumps({"sessionId":"6eeaf8","location":"routes.py:control","message":"mqtt_publish_failed","data":{"device_id":device_id,"error":str(mqtt_err),"error_type":type(mqtt_err).__name__},"hypothesisId":"A","timestamp":int(time.time()*1000)}) + "\n")
            except Exception:
                pass
            # #endregion
            raise HTTPException(status_code=503, detail=f"Không bắn được lệnh MQTT: {mqtt_err}")

        # Lưu lịch sử lệnh vào MySQL
        try:
            action_label = body.action if not body.raw_payload else "raw"
            val_str = str(body.value) if body.value is not None else ""
            cursor.execute("""
                INSERT INTO du_lieu_thiet_bi (thiet_bi_id, khoa, gia_tri, thoi_gian)
                VALUES (%s, %s, %s, NOW())
            """, (device["id"], f"cmd_{action_label}", json.dumps(payload)))
            cursor.execute(
                "UPDATE thiet_bi SET last_seen = NOW() WHERE id = %s",
                (device["id"],)
            )
            conn.commit()
        except Exception:
            pass  # Không fail nếu DB write lỗi

        return {
            "status": "ok",
            "device_id": device_id,
            "action": body.action,
            "payload_sent": payload,
            "via": "mqtt",
            "mqtt_topic": control_topic,
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Control error: {e}")
    finally:
        cursor.close()
        conn.close()


class RelayControlRequest(BaseModel):
    relay: int  # Số relay (1, 2, 3, 4...)
    state: str  # "ON" hoặc "OFF"


@router.post("/devices/{device_id}/control-relay")
def control_relay(
    device_id: str,
    body: RelayControlRequest,
    current_user: str = Depends(get_current_user_or_internal)  # ← Cho phép internal calls
):
    """
    API chuyên dụng để điều khiển relay - Đơn giản hóa cho mobile app.
    
    Tự động gửi lệnh qua HTTP webhook (nếu thiết bị có edge_control_url)
    hoặc MQTT (nếu không có webhook).
    
    Parameters:
    - relay: Số relay (1, 2, 3, 4...)
    - state: Trạng thái "ON" hoặc "OFF"
    
    Example:
    ```json
    {
      "relay": 1,
      "state": "ON"
    }
    ```
    """
    # Validate state
    if body.state.upper() not in ["ON", "OFF"]:
        raise HTTPException(
            status_code=400,
            detail="state phải là 'ON' hoặc 'OFF'"
        )
    
    # Validate relay number
    if body.relay < 1 or body.relay > 16:
        raise HTTPException(
            status_code=400,
            detail="relay phải từ 1 đến 16"
        )
    
    # Gọi endpoint control chung với raw_payload
    control_request = DeviceControlRequest(
        action="relay_control",
        raw_payload={
            "relay": body.relay,
            "state": body.state.upper()
        }
    )
    
    return send_control_command(device_id, control_request, current_user)


@router.get("/config/commands")
def get_available_commands(current_user: str = Depends(get_current_user)):
    """
    Trả về danh sách tất cả action commands được hỗ trợ,
    kèm theo template payload và mô tả.
    Dùng khi muốn biết có thể gửi lệnh gì tới /devices/{id}/control.
    """
    return {
        "commands": list_device_commands(),
        "usage": "POST /devices/{device_id}/control với body: {action, value?} hoặc {raw_payload}"
    }


@router.get("/config/device-topics/{device_id}")
def get_device_topics(device_id: str, current_user: str = Depends(get_current_user)):
    """
    Trả về tất cả MQTT topics và HTTP endpoint config của một thiết bị cụ thể.
    Hữu ích khi cần config thiết bị thủ công hoặc debug.
    """
    conn = get_mysql()
    cursor = conn.cursor(dictionary=True)
    try:
        cursor.execute(
            "SELECT id, ma_thiet_bi, protocol, http_api_key FROM thiet_bi WHERE ma_thiet_bi = %s AND is_active = 1",
            (device_id,)
        )
        device = cursor.fetchone()
        if not device:
            raise HTTPException(status_code=404, detail="Thiết bị không tồn tại")

        result = {
            "device_id": device_id,
            "protocol": device["protocol"],
            "mqtt": get_topics(device_id),
            "mqtt_broker": {
                "host": os.getenv("MQTT_BROKER_HOST", "mqtt"),
                "port": int(os.getenv("MQTT_PORT", "1883")),
            },
        }
        if device.get("http_api_key"):
            result["http"] = get_http_config(device_id, device["http_api_key"])

        return result
    finally:
        cursor.close()
        conn.close()


@router.post("/api/v1/ingest")
def ingest_device_data(
    request: IngestDataRequest,
    x_api_key: str = Header(None, alias="X-API-Key")
):
    """
    HTTP endpoint để thiết bị gửi data (thay thế MQTT cho các thiết bị không hỗ trợ).
    
    - Xác thực bằng X-API-Key header
    - Push data vào Kafka topic iot-events
    """
    from kafka import KafkaProducer
    
    if not x_api_key:
        raise HTTPException(status_code=401, detail="Missing X-API-Key header")
    
    conn = get_mysql()
    cursor = conn.cursor(dictionary=True)
    
    try:
        # Validate API key
        cursor.execute("""
            SELECT id, ma_thiet_bi, protocol 
            FROM thiet_bi 
            WHERE ma_thiet_bi = %s AND http_api_key = %s AND is_active = 1
        """, (request.device_id, x_api_key))
        device = cursor.fetchone()
        
        if not device:
            raise HTTPException(status_code=401, detail="Invalid device_id or API key")
        
        # Update last_auth_at
        cursor.execute(
            "UPDATE thiet_bi SET last_auth_at = NOW(), last_seen = NOW(), trang_thai = 'online' WHERE id = %s",
            (device["id"],)
        )
        conn.commit()
        
        # Prepare payload for Kafka
        payload = {
            "device_id": request.device_id,
            **request.data,
            "timestamp": request.timestamp or time.time()
        }
        
        # Push to Kafka – dùng singleton producer
        producer = get_kafka_producer()
        if producer:
            try:
                producer.send("iot-events", value=payload)
                producer.flush(timeout=5)
            except Exception as kafka_err:
                print(f"[INGEST] Kafka error: {kafka_err}")
        
        return {
            "status": "ok",
            "message": "Data ingested successfully",
            "device_id": request.device_id,
            "timestamp": payload["timestamp"]
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Ingest error: {str(e)}")
    finally:
        cursor.close()
        conn.close()


@router.delete("/devices/{device_id}")
def delete_device(
    device_id: str,
    hard_delete: bool = False,
    current_user: str = Depends(get_current_user)
):
    """
    Xóa thiết bị khỏi hệ thống.
    
    - Mặc định: Soft delete (đánh dấu is_active = 0) - nhanh và an toàn
    - hard_delete=true: Xóa hoàn toàn (chậm, có thể timeout nếu nhiều dữ liệu)
    
    Soft delete được khuyến nghị vì:
    - Nhanh (không cần xóa hàng triệu records)
    - Có thể khôi phục nếu xóa nhầm
    - Giữ lại dữ liệu lịch sử
    """
    conn = get_mysql()
    cursor = conn.cursor(dictionary=True)
    
    try:
        cursor.execute(
            "SELECT id, ma_thiet_bi, ten_thiet_bi FROM thiet_bi WHERE ma_thiet_bi = %s",
            (device_id,)
        )
        device = cursor.fetchone()
        
        if not device:
            raise HTTPException(status_code=404, detail="Thiết bị không tồn tại")
        
        thiet_bi_id = device["id"]
        
        if hard_delete:
            # Hard delete: Xóa hoàn toàn (có thể chậm)
            # Xóa dữ liệu liên quan trước (foreign key constraints)
            cursor.execute("DELETE FROM du_lieu_thiet_bi WHERE thiet_bi_id = %s", (thiet_bi_id,))
            cursor.execute("DELETE FROM khoa_du_lieu WHERE thiet_bi_id = %s", (thiet_bi_id,))
            cursor.execute("DELETE FROM control_lines WHERE thiet_bi_id = %s", (thiet_bi_id,))
            
            # Xóa thiết bị
            cursor.execute("DELETE FROM thiet_bi WHERE id = %s", (thiet_bi_id,))
            conn.commit()
            
            return {
                "message": f"Đã xóa hoàn toàn thiết bị {device['ten_thiet_bi'] or device['ma_thiet_bi']}",
                "device_id": device_id,
                "delete_type": "hard"
            }
        else:
            # Soft delete: Chỉ đánh dấu is_active = 0 (nhanh)
            cursor.execute(
                "UPDATE thiet_bi SET is_active = 0, trang_thai = 'offline' WHERE id = %s",
                (thiet_bi_id,)
            )
            conn.commit()
            
            return {
                "message": f"Đã xóa thiết bị {device['ten_thiet_bi'] or device['ma_thiet_bi']} (soft delete)",
                "device_id": device_id,
                "delete_type": "soft",
                "note": "Thiết bị vẫn giữ dữ liệu lịch sử. Dùng hard_delete=true để xóa hoàn toàn."
            }
    except HTTPException:
        raise
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=f"Lỗi xóa thiết bị: {str(e)}")
    finally:
        cursor.close()
        conn.close()


@router.get("/rooms")
def list_rooms(
    workspace_id: Optional[int] = Query(None),
    token: Optional[str] = None,
    current_user: str = Depends(get_current_user_optional)
):
    """
    Lấy danh sách phòng.
    - Admin: Tất cả rooms
    - Teacher: Rooms của mình + Rooms của học viên trong lớp
    - Student: Chỉ rooms của mình
    - Response bao gồm device_count và online_count cho mobile app
    
    Có thể truyền token qua:
    - Header: Authorization: Bearer <token>
    - Query param: ?token=<token>
    """
    conn = get_mysql()
    cursor = conn.cursor(dictionary=True)
    try:
        # Get current user info
        cursor.execute("SELECT id, vai_tro, lop_hoc_id FROM nguoi_dung WHERE email = %s", (current_user,))
        user = cursor.fetchone()
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        
        user_id = user["id"]
        user_role = user["vai_tro"]
        
        # Build query based on role
        if user_role == "admin":
            # Admin sees all rooms
            query = """
                SELECT p.id, p.ten_phong, p.ma_phong, p.vi_tri, p.mo_ta, 
                       p.nguoi_quan_ly_id, p.nguoi_so_huu_id, p.ngay_tao,
                       u.ten as nguoi_so_huu_ten, u.vai_tro as nguoi_so_huu_role,
                       COUNT(DISTINCT t.id) as device_count,
                       SUM(CASE WHEN t.trang_thai = 'online' THEN 1 ELSE 0 END) as online_count
                FROM phong p
                LEFT JOIN nguoi_dung u ON p.nguoi_so_huu_id = u.id
                LEFT JOIN thiet_bi t ON p.id = t.phong_id AND t.is_active = 1
                GROUP BY p.id
                ORDER BY p.ten_phong
            """
            cursor.execute(query)
        elif user_role == "teacher":
            # Teacher sees own rooms + student rooms in their class
            query = """
                SELECT p.id, p.ten_phong, p.ma_phong, p.vi_tri, p.mo_ta, 
                       p.nguoi_quan_ly_id, p.nguoi_so_huu_id, p.ngay_tao,
                       u.ten as nguoi_so_huu_ten, u.vai_tro as nguoi_so_huu_role,
                       COUNT(DISTINCT t.id) as device_count,
                       SUM(CASE WHEN t.trang_thai = 'online' THEN 1 ELSE 0 END) as online_count
                FROM phong p
                LEFT JOIN nguoi_dung u ON p.nguoi_so_huu_id = u.id
                LEFT JOIN thiet_bi t ON p.id = t.phong_id AND t.is_active = 1
                WHERE p.nguoi_so_huu_id = %s
                   OR p.nguoi_so_huu_id IN (
                       SELECT nd.id 
                       FROM nguoi_dung nd
                       INNER JOIN lop_hoc lh ON nd.lop_hoc_id = lh.id
                       WHERE lh.giao_vien_id = %s
                   )
                GROUP BY p.id
                ORDER BY p.ten_phong
            """
            cursor.execute(query, (user_id, user_id))
        else:
            # Student sees only own rooms
            query = """
                SELECT p.id, p.ten_phong, p.ma_phong, p.vi_tri, p.mo_ta, 
                       p.nguoi_quan_ly_id, p.nguoi_so_huu_id, p.ngay_tao,
                       u.ten as nguoi_so_huu_ten, u.vai_tro as nguoi_so_huu_role,
                       COUNT(DISTINCT t.id) as device_count,
                       SUM(CASE WHEN t.trang_thai = 'online' THEN 1 ELSE 0 END) as online_count
                FROM phong p
                LEFT JOIN nguoi_dung u ON p.nguoi_so_huu_id = u.id
                LEFT JOIN thiet_bi t ON p.id = t.phong_id AND t.is_active = 1
                WHERE p.nguoi_so_huu_id = %s
                GROUP BY p.id
                ORDER BY p.ten_phong
            """
            cursor.execute(query, (user_id,))
        
        rooms = cursor.fetchall()
        
        # Format for mobile app
        formatted_rooms = []
        for room in rooms:
            formatted_rooms.append({
                "id": room["id"],
                "name": room["ten_phong"],
                "description": room["mo_ta"],
                "device_count": int(room["device_count"] or 0),
                "online_count": int(room["online_count"] or 0),
                "last_update": room["ngay_tao"].isoformat() if room["ngay_tao"] else None,
                # Keep original fields for web dashboard
                "ten_phong": room["ten_phong"],
                "ma_phong": room["ma_phong"],
                "vi_tri": room["vi_tri"],
                "mo_ta": room["mo_ta"],
                "nguoi_quan_ly_id": room["nguoi_quan_ly_id"],
                "nguoi_so_huu_id": room["nguoi_so_huu_id"],
                "ngay_tao": room["ngay_tao"],
                "nguoi_so_huu_ten": room["nguoi_so_huu_ten"],
                "nguoi_so_huu_role": room["nguoi_so_huu_role"],
                "can_edit": user_role == "admin" or room["nguoi_so_huu_id"] == user_id,
                "can_delete": user_role == "admin" or room["nguoi_so_huu_id"] == user_id,
            })
        
        return {"rooms": formatted_rooms}
    finally:
        cursor.close()
        conn.close()


@router.get("/rooms/{room_id}")
def get_room(room_id: int, current_user: str = Depends(get_current_user)):
    """
    Chi tiết một phòng (cùng quyền xem như danh sách phòng).
    """
    conn = get_mysql()
    cursor = conn.cursor(dictionary=True)
    try:
        cursor.execute(
            "SELECT id, vai_tro, lop_hoc_id FROM nguoi_dung WHERE email = %s",
            (current_user,),
        )
        user = cursor.fetchone()
        if not user:
            raise HTTPException(status_code=404, detail="User not found")

        user_id = user["id"]
        user_role = user["vai_tro"]

        base_select = """
            SELECT p.id, p.ten_phong, p.ma_phong, p.vi_tri, p.mo_ta,
                   p.nguoi_quan_ly_id, p.nguoi_so_huu_id, p.ngay_tao,
                   u.ten as nguoi_so_huu_ten, u.vai_tro as nguoi_so_huu_role,
                   COUNT(DISTINCT t.id) as device_count,
                   SUM(CASE WHEN t.trang_thai = 'online' THEN 1 ELSE 0 END) as online_count
            FROM phong p
            LEFT JOIN nguoi_dung u ON p.nguoi_so_huu_id = u.id
            LEFT JOIN thiet_bi t ON p.id = t.phong_id AND t.is_active = 1
        """

        if user_role == "admin":
            cursor.execute(
                base_select + " WHERE p.id = %s GROUP BY p.id",
                (room_id,),
            )
        elif user_role == "teacher":
            cursor.execute(
                base_select
                + """ WHERE p.id = %s
                    AND (
                        p.nguoi_so_huu_id = %s
                        OR p.nguoi_so_huu_id IN (
                            SELECT nd.id
                            FROM nguoi_dung nd
                            INNER JOIN lop_hoc lh ON nd.lop_hoc_id = lh.id
                            WHERE lh.giao_vien_id = %s
                        )
                    )
                    GROUP BY p.id""",
                (room_id, user_id, user_id),
            )
        else:
            cursor.execute(
                base_select
                + " WHERE p.id = %s AND p.nguoi_so_huu_id = %s GROUP BY p.id",
                (room_id, user_id),
            )

        room = cursor.fetchone()
        if not room:
            raise HTTPException(status_code=404, detail="Room not found")

        return {
            "id": room["id"],
            "name": room["ten_phong"],
            "ten_phong": room["ten_phong"],
            "ma_phong": room["ma_phong"],
            "vi_tri": room["vi_tri"],
            "mo_ta": room["mo_ta"],
            "nguoi_quan_ly_id": room["nguoi_quan_ly_id"],
            "nguoi_so_huu_id": room["nguoi_so_huu_id"],
            "ngay_tao": room["ngay_tao"],
            "nguoi_so_huu_ten": room["nguoi_so_huu_ten"],
            "nguoi_so_huu_role": room["nguoi_so_huu_role"],
            "device_count": int(room["device_count"] or 0),
            "online_count": int(room["online_count"] or 0),
            "can_edit": user_role == "admin" or room["nguoi_so_huu_id"] == user_id,
            "can_delete": user_role == "admin" or room["nguoi_so_huu_id"] == user_id,
        }
    finally:
        cursor.close()
        conn.close()


@router.post("/rooms")
def create_room(
    body: RoomCreate,
    workspace_id: Optional[int] = Query(None),
    current_user: str = Depends(get_current_user)
):
    """
    Tạo phòng mới.
    - Room sẽ thuộc về user hiện tại (trong workspace của họ)
    """
    conn = get_mysql()
    cursor = conn.cursor(dictionary=True)
    try:
        # Get owner_id (current workspace)
        owner_id = get_authorized_workspace_id(cursor, current_user, workspace_id)
        
        cursor.execute(
            """
            INSERT INTO phong (ten_phong, mo_ta, vi_tri, nguoi_quan_ly_id, ma_phong, nguoi_so_huu_id)
            VALUES (%s, %s, %s, %s, %s, %s)
            """,
            (body.ten_phong, body.mo_ta, body.vi_tri, body.nguoi_quan_ly_id, body.ma_phong, owner_id),
        )
        conn.commit()
        room_id = cursor.lastrowid
        
        # Return created room with owner info
        cursor.execute("""
            SELECT p.*, u.ten as nguoi_so_huu_ten
            FROM phong p
            LEFT JOIN nguoi_dung u ON p.nguoi_so_huu_id = u.id
            WHERE p.id = %s
        """, (room_id,))
        room = cursor.fetchone()
        
        return {"message": "created", "room": room}
    except HTTPException:
        raise
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=f"Create room failed: {e}")
    finally:
        cursor.close()
        conn.close()


@router.put("/rooms/{room_id}")
def update_room(
    room_id: int,
    body: RoomUpdate,
    current_user: str = Depends(get_current_user)
):
    """
    Cập nhật phòng.
    - Chỉ owner hoặc admin mới có quyền update
    """
    # Check permission
    check_room_permission(room_id, current_user, "edit")
    
    fields = []
    values = []
    if body.ten_phong is not None:
        fields.append("ten_phong=%s")
        values.append(body.ten_phong)
    if body.mo_ta is not None:
        fields.append("mo_ta=%s")
        values.append(body.mo_ta)
    if body.vi_tri is not None:
        fields.append("vi_tri=%s")
        values.append(body.vi_tri)
    if body.nguoi_quan_ly_id is not None:
        fields.append("nguoi_quan_ly_id=%s")
        values.append(body.nguoi_quan_ly_id)
    if body.ma_phong is not None:
        fields.append("ma_phong=%s")
        values.append(body.ma_phong)

    if not fields:
        raise HTTPException(status_code=400, detail="No fields to update")

    conn = get_mysql()
    cursor = conn.cursor()
    try:
        values.append(room_id)
        cursor.execute(f"UPDATE phong SET {', '.join(fields)} WHERE id=%s", tuple(values))
        if cursor.rowcount == 0:
            raise HTTPException(status_code=404, detail="Room not found")
        conn.commit()
        return {"message": "updated"}
    except HTTPException:
        raise
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=f"Update room failed: {e}")
    finally:
        cursor.close()
        conn.close()


@router.delete("/rooms/{room_id}")
def delete_room(
    room_id: int,
    current_user: str = Depends(get_current_user)
):
    """
    Xóa phòng.
    - Chỉ owner hoặc admin mới có quyền delete
    """
    # Check permission
    check_room_permission(room_id, current_user, "delete")
    
    conn = get_mysql()
    cursor = conn.cursor()
    try:
        cursor.execute("DELETE FROM phong WHERE id=%s", (room_id,))
        if cursor.rowcount == 0:
            raise HTTPException(status_code=404, detail="Room not found")
        conn.commit()
        return {"message": "deleted"}
    except HTTPException:
        raise
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=f"Delete room failed: {e}")
    finally:
        cursor.close()
        conn.close()


@router.get("/rooms/{room_id}/devices")
def list_devices_by_room(room_id: int, current_user: str = Depends(get_current_user)):
    conn = get_mysql()
    cursor = conn.cursor(dictionary=True)
    try:
        cursor.execute(
            """
            SELECT t.id, t.ma_thiet_bi, t.ten_thiet_bi, t.loai_thiet_bi, t.trang_thai, t.last_seen,
                   t.phong_id, p.ten_phong, p.ma_phong
            FROM thiet_bi t
            LEFT JOIN phong p ON t.phong_id = p.id
            WHERE t.is_active = 1 AND t.phong_id = %s
            """,
            (room_id,),
        )
        devices = cursor.fetchall()
        if not devices:
            return {"devices": []}

        device_ids = [d["id"] for d in devices]
        placeholders = ", ".join(["%s"] * len(device_ids))
        # Lấy danh sách field mới nhất per device để client hiển thị ngay dropdown
        cursor.execute(
            f"""
            SELECT d.thiet_bi_id, d.khoa
            FROM du_lieu_thiet_bi d
            JOIN (
                SELECT thiet_bi_id, khoa, MAX(thoi_gian) AS max_time
                FROM du_lieu_thiet_bi
                WHERE thiet_bi_id IN ({placeholders})
                GROUP BY thiet_bi_id, khoa
            ) latest
            ON d.thiet_bi_id = latest.thiet_bi_id
               AND d.khoa = latest.khoa
               AND d.thoi_gian = latest.max_time
            """,
            device_ids,
        )
        rows = cursor.fetchall()
        field_map = {}
        for r in rows:
            field_map.setdefault(r["thiet_bi_id"], []).append(r["khoa"])

        for d in devices:
            d["latest_fields"] = field_map.get(d["id"], [])

        return {"devices": devices}
    finally:
        cursor.close()
        conn.close()


@router.get("/rooms/{room_id}/data")
def get_room_device_data(
    room_id: int,
    token: Optional[str] = None,
    current_user: str = Depends(get_current_user_optional)
):
    """
    Lấy dữ liệu mới nhất của tất cả thiết bị (bao gồm giá trị data) thuộc một phòng cụ thể.
    Format cho mobile app với dynamic metrics và controls.
    
    Có thể truyền token qua:
    - Header: Authorization: Bearer <token>
    - Query param: ?token=<token>
    """
    conn = get_mysql()
    cursor = conn.cursor(dictionary=True)
    try:
        # Get room info
        cursor.execute("SELECT id, ten_phong FROM phong WHERE id = %s", (room_id,))
        room = cursor.fetchone()
        if not room:
            raise HTTPException(status_code=404, detail="Room not found")
        
        # Decide "online/offline" for the API response based on whether we have recent data.
        online_threshold_minutes = int(os.getenv("DEVICE_OFFLINE_THRESHOLD_MINUTES", "10"))
        now_utc = datetime.utcnow()

        # Danh sách thiết bị trong phòng
        cursor.execute(
            """
            SELECT t.id, t.ma_thiet_bi, t.ten_thiet_bi, t.loai_thiet_bi,
                   t.trang_thai, t.last_seen, t.phong_id
            FROM thiet_bi t
            WHERE t.is_active = 1 AND t.phong_id = %s
            """,
            (room_id,)
        )
        devices = cursor.fetchall()
        if not devices:
            return {
                "room_id": room_id,
                "room_name": room["ten_phong"],
                "devices": []
            }

        device_ids = [str(d["id"]) for d in devices]
        placeholders = ",".join(["%s"] * len(device_ids))

        # Track latest timestamp per device_id based on du_lieu_thiet_bi rows.
        # We compute effective trang_thai/last_seen for the API response from this.
        latest_seen_by_device = {}

        # Kafka fallback:
        # If MySQL doesn't have telemetry rows yet (but Kafka events exist),
        # we still want the API to return device as online and include latest telemetry keys.
        kafka_latest_ts_by_device_id: dict[str, float] = {}
        kafka_latest_event_by_device_id: dict[str, dict] = {}
        try:
            for ev in (get_latest_events() or []):
                dev_id = ev.get("device_id")
                ts = ev.get("timestamp")
                if not dev_id or ts is None:
                    continue
                try:
                    ts_float = float(ts)
                except (ValueError, TypeError):
                    continue
                prev_ts = kafka_latest_ts_by_device_id.get(dev_id)
                if prev_ts is None or ts_float > prev_ts:
                    kafka_latest_ts_by_device_id[dev_id] = ts_float
                    kafka_latest_event_by_device_id[dev_id] = ev
        except Exception:
            # Don't fail the whole endpoint if kafka fallback is unavailable.
            pass
        
        # Lấy bản ghi mới nhất cho từng (thiet_bi_id, khoa) của các thiết bị trong phòng
        cursor.execute(
            f"""
            SELECT d.thiet_bi_id, d.khoa, d.gia_tri, d.thoi_gian,
                   kdl.don_vi, kdl.mo_ta
            FROM du_lieu_thiet_bi d
            JOIN (
                SELECT thiet_bi_id, khoa, MAX(thoi_gian) AS max_time
                FROM du_lieu_thiet_bi
                WHERE thiet_bi_id IN ({placeholders})
                GROUP BY thiet_bi_id, khoa
            ) m ON d.thiet_bi_id = m.thiet_bi_id AND d.khoa = m.khoa AND d.thoi_gian = m.max_time
            LEFT JOIN khoa_du_lieu kdl ON d.thiet_bi_id = kdl.thiet_bi_id AND d.khoa = kdl.khoa
            WHERE d.thiet_bi_id IN ({placeholders})
            """,
            tuple(device_ids + device_ids)
        )
        rows = cursor.fetchall()

        # Build data per device
        data_by_device = {}
        for row in rows:
            did = row["thiet_bi_id"]
            data_by_device.setdefault(did, {})
            try:
                value = float(row["gia_tri"])
            except (ValueError, TypeError):
                value = row["gia_tri"]

            # Maintain the latest timestamp for each device_id across all keys.
            # (This timestamp is what we use to decide effective online/offline.)
            row_ts = row.get("thoi_gian")
            if row_ts is not None:
                prev_ts = latest_seen_by_device.get(did)
                if (prev_ts is None) or (row_ts > prev_ts):
                    latest_seen_by_device[did] = row_ts

            data_by_device[did][row["khoa"]] = {
                "value": value,
                "don_vi": row["don_vi"],
                "mo_ta": row["mo_ta"],
                "timestamp": int(row["thoi_gian"].timestamp()) if row["thoi_gian"] else None,
            }

        # Lấy relay config từ control_lines cho tất cả thiết bị
        relay_config_by_device = {}
        if device_ids:
            cursor.execute(
                f"""
                SELECT thiet_bi_id, relay_number, ten_duong, topic, hien_thi_ttcds
                FROM control_lines
                WHERE thiet_bi_id IN ({placeholders})
                ORDER BY thiet_bi_id, relay_number
                """,
                tuple(device_ids)
            )
            relay_rows = cursor.fetchall()
            for row in relay_rows:
                # Only include relays marked for display in mobile app
                if row.get("hien_thi_ttcds") in [True, 1, "1"]:
                    did = row["thiet_bi_id"]
                    relay_config_by_device.setdefault(did, [])
                    relay_config_by_device[did].append({
                        "relay_number": row["relay_number"],
                        "ten_relay": row["ten_duong"],  # Cột tên là ten_duong
                        "topic": row.get("topic")
                    })

        # Kết quả cuối
        result = []
        for d in devices:
            # ALWAYS use database status (updated by rule engine)
            # Rule engine is the source of truth for device online/offline status
            db_status = (d.get("trang_thai") or "offline").lower()
            effective_status = db_status if db_status in ["online", "offline"] else "offline"
            effective_last_seen = None

            # MySQL latest timestamp (any key, including cmd_*)
            latest_dt = latest_seen_by_device.get(d["id"])
            latest_mysql_ts_sec = latest_dt.timestamp() if latest_dt is not None else None

            # Kafka latest timestamp (telemetry/command event)
            dev_id_str = d["ma_thiet_bi"]
            latest_kafka_ts_sec = kafka_latest_ts_by_device_id.get(dev_id_str)

            # Use the more recent timestamp for last_seen display only
            effective_ts_sec = None
            if latest_mysql_ts_sec is not None:
                effective_ts_sec = latest_mysql_ts_sec
            if latest_kafka_ts_sec is not None and (effective_ts_sec is None or latest_kafka_ts_sec > effective_ts_sec):
                effective_ts_sec = latest_kafka_ts_sec
            
            if effective_ts_sec is not None:
                effective_last_seen = int(effective_ts_sec)

            # Merge data:
            # - Start from MySQL latest-by-key data
            # - If Kafka has a newer event for this device, add/overwrite keys from Kafka event.
            merged_data = dict(data_by_device.get(d["id"], {}))
            kafka_event = kafka_latest_event_by_device_id.get(dev_id_str)
            if kafka_event is not None and latest_kafka_ts_sec is not None:
                kafka_event_ts_int = int(latest_kafka_ts_sec)

                def coerce_value(v):
                    # Keep booleans as-is (frontend might display true/false).
                    if isinstance(v, bool):
                        return v
                    if isinstance(v, (int, float)):
                        return v
                    if isinstance(v, str):
                        try:
                            # Prefer numeric values for chart/toFixed usage.
                            return float(v)
                        except Exception:
                            return v
                    return v

                for key, val in kafka_event.items():
                    # device_id và timestamp là metadata, không đưa vào data keys.
                    if key in ("device_id", "timestamp"):
                        continue

                    existing = merged_data.get(key)
                    existing_ts = None
                    if isinstance(existing, dict):
                        existing_ts = existing.get("timestamp")

                    # Overwrite when Kafka is newer or when key doesn't exist.
                    if existing_ts is None or kafka_event_ts_int >= int(existing_ts or 0):
                        merged_data[key] = {
                            "value": coerce_value(val),
                            "don_vi": None,
                            "mo_ta": None,
                            "timestamp": kafka_event_ts_int,
                        }

            # Transform data to mobile-friendly format
            # 1. Build metrics (exclude relay state keys and metadata)
            metrics = {}
            processed_keys = set()  # Track keys we've already processed
            
            # List of keys to skip (metadata, config, etc.)
            skip_keys = {
                'device_id', 'data_device_id', 'mqtt_broker_host', 'mqtt_broker_port',
                'mqtt_broker_publish', 'mqtt_topic_publish', 'json_to_mqtt_topic',
                'last_update', 'data_last_update', 'cmd_raw', 'cmd_edge_relay',
                'control_commands', 'fan_mode', 'on', 'alarm_status', 'data_alarm_status'
            }
            
            for key, data in merged_data.items():
                # Skip if already processed
                if key in processed_keys:
                    continue
                
                # Skip relay state keys (they go in controls)
                if key.startswith("relay_") and (key.endswith("_state") or (key.split("_")[1].isdigit() if len(key.split("_")) > 1 else False)):
                    continue
                
                # Skip relay metadata keys (data_relay_X_gpio, data_relay_X_port, data_relay_X_on, etc.)
                if key.startswith("data_relay_"):
                    continue
                
                # Skip metadata and config keys
                if key in skip_keys or key.startswith('data_mqtt') or key.startswith('mqtt_'):
                    continue
                
                # Check if this is a unit key (e.g., current_unit, voltage_unit)
                if key.endswith('_unit'):
                    continue
                
                # Check if this key ends with _is_data (boolean flags)
                if key.endswith('_is_data'):
                    continue
                
                # Get value
                value = data.get("value")
                
                # Skip if value is not numeric or is a string that looks like metadata
                if isinstance(value, str):
                    # Skip JSON strings, device IDs, IP addresses, etc.
                    if value.startswith('{') or value.startswith('[') or 'gateway-' in value or '.' in value and value.count('.') >= 3:
                        continue
                    # Try to convert to number
                    try:
                        value = float(value)
                    except (ValueError, TypeError):
                        # Skip non-numeric strings unless they're short status values
                        if len(value) > 20:
                            continue
                
                # Skip boolean False values (not useful to display)
                if isinstance(value, bool) and not value:
                    continue
                
                # Look for corresponding unit key
                unit_key = f"{key}_unit"
                unit = data.get("don_vi")
                if unit_key in merged_data:
                    unit_data = merged_data[unit_key]
                    unit = unit_data.get("value") or unit
                    processed_keys.add(unit_key)  # Mark unit key as processed
                
                # Detect metric type for dynamic rendering
                metric_type = _detect_metric_type(key, value)
                
                # Only add if it's a meaningful metric
                if isinstance(value, (int, float)) or (isinstance(value, str) and len(value) < 20):
                    metrics[key] = {
                        "value": value,
                        "unit": unit,
                        "type": metric_type,
                        "min": _get_metric_min(key),
                        "max": _get_metric_max(key),
                    }
                    processed_keys.add(key)
            
            # 2. Build controls from relay config
            controls = []
            relay_configs = relay_config_by_device.get(d["id"], [])
            for relay_cfg in relay_configs:
                relay_num = relay_cfg["relay_number"]
                
                # Get current state from merged_data
                state = "OFF"
                state_key = f"relay_{relay_num}_state"
                alt_state_key = f"relay_{relay_num}"
                
                if state_key in merged_data:
                    state_val = merged_data[state_key].get("value", "OFF")
                    if isinstance(state_val, str):
                        state = state_val.upper() if state_val.upper() in ["ON", "OFF"] else "OFF"
                elif alt_state_key in merged_data:
                    state_val = merged_data[alt_state_key].get("value", "OFF")
                    if isinstance(state_val, str):
                        state = state_val.upper() if state_val.upper() in ["ON", "OFF"] else "OFF"
                
                controls.append({
                    "relay": relay_num,
                    "name": relay_cfg["ten_relay"] or f"Relay {relay_num}",
                    "state": state,
                    "controllable": True,
                })
            
            # Build device object for mobile app
            result.append({
                "device_id": d["ma_thiet_bi"],
                "name": d["ten_thiet_bi"],
                "type": d["loai_thiet_bi"],
                "status": effective_status,
                "last_seen": datetime.fromtimestamp(effective_last_seen).isoformat() if effective_last_seen else None,
                "metrics": metrics,
                "controls": controls,
                # Keep original fields for web dashboard compatibility
                "ten_thiet_bi": d["ten_thiet_bi"],
                "loai_thiet_bi": d["loai_thiet_bi"],
                "trang_thai": effective_status,
                "phong_id": d["phong_id"],
                "data": merged_data,  # Keep for backward compatibility
                "relays": relay_config_by_device.get(d["id"], []),  # Keep for backward compatibility
            })

        return {
            "room_id": room_id,
            "room_name": room["ten_phong"],
            "devices": result
        }
    finally:
        cursor.close()
        conn.close()


def _detect_metric_type(key: str, value) -> str:
    """
    Detect metric type for dynamic rendering in mobile app.
    Returns: "gauge", "number", "boolean", or "text"
    """
    key_lower = key.lower()
    
    # Gauge types (circular progress indicators)
    if any(x in key_lower for x in ["temp", "humi", "soil", "moisture"]):
        return "gauge"
    
    # Number types (simple display with icon)
    if any(x in key_lower for x in ["volt", "current", "power", "energy", "freq", "pf", "factor", "watt", "amp"]):
        return "number"
    
    # Boolean types
    if isinstance(value, bool):
        return "boolean"
    if isinstance(value, str) and value.lower() in ["true", "false", "on", "off"]:
        return "boolean"
    
    # Text types
    if isinstance(value, str):
        try:
            float(value)
            return "number"
        except (ValueError, TypeError):
            return "text"
    
    # Default to number for numeric values
    if isinstance(value, (int, float)):
        return "number"
    
    return "text"


def _get_metric_min(key: str) -> Optional[float]:
    """Get minimum value for gauge metrics"""
    key_lower = key.lower()
    if "temp" in key_lower:
        return 0.0
    if any(x in key_lower for x in ["humi", "soil", "moisture"]):
        return 0.0
    return None


def _get_metric_max(key: str) -> Optional[float]:
    """Get maximum value for gauge metrics"""
    key_lower = key.lower()
    if "temp" in key_lower:
        return 50.0
    if any(x in key_lower for x in ["humi", "soil", "moisture"]):
        return 100.0
    return None


# ============================================================
# Camera management endpoints
# ============================================================
@router.get("/rooms/{room_id}/cameras")
def list_cameras(
    room_id: int,
    current_user: str = Depends(get_current_user)
):
    """
    Lấy danh sách camera của một phòng.
    Password không bao giờ được trả về cho client.
    """
    conn = get_mysql()
    cursor = conn.cursor(dictionary=True)
    try:
        cursor.execute(
            "SELECT id, phong_id, ten, ip_address, port, rtsp_path, username, "
            "password_enc, stream_url, thu_tu, is_active, created_at, updated_at "
            "FROM phong_camera WHERE phong_id = %s ORDER BY thu_tu ASC",
            (room_id,),
        )
        rows = cursor.fetchall()
        cameras = []
        for r in rows:
            cameras.append({
                "id": r["id"],
                "phong_id": r["phong_id"],
                "ten": r["ten"],
                "ip_address": r["ip_address"],
                "port": r["port"],
                "rtsp_path": r["rtsp_path"],
                "username": r["username"],
                "has_password": bool(r["password_enc"]),
                "stream_url": r["stream_url"],
                "thu_tu": r["thu_tu"],
                "is_active": r["is_active"],
                "created_at": r["created_at"].isoformat() if r["created_at"] else None,
                "updated_at": r["updated_at"].isoformat() if r["updated_at"] else None,
            })
        return {"cameras": cameras}
    finally:
        cursor.close()
        conn.close()


@router.post("/rooms/{room_id}/cameras")
def create_camera(
    room_id: int,
    body: CameraCreate,
    current_user: str = Depends(get_current_user)
):
    """
    Tạo camera mới cho phòng.
    - Check permission (owner hoặc admin)
    - Mật khẩu được mã hoá Fernet trước khi lưu
    """
    check_room_permission(room_id, current_user, "edit")

    password_enc = encrypt_password(body.password) if body.password else None

    conn = get_mysql()
    cursor = conn.cursor(dictionary=True)
    try:
        cursor.execute(
            """
            INSERT INTO phong_camera
              (phong_id, ten, ip_address, port, rtsp_path, username, password_enc, stream_url, thu_tu)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
            """,
            (
                room_id,
                body.ten,
                body.ip_address,
                body.port or 554,
                body.rtsp_path,
                body.username,
                password_enc,
                body.stream_url,
                body.thu_tu or 0,
            ),
        )
        conn.commit()
        camera_id = cursor.lastrowid

        cursor.execute(
            "SELECT id, phong_id, ten, ip_address, port, rtsp_path, username, "
            "password_enc, stream_url, thu_tu, is_active, created_at "
            "FROM phong_camera WHERE id = %s",
            (camera_id,),
        )
        r = cursor.fetchone()
        return {
            "message": "created",
            "camera": {
                "id": r["id"],
                "phong_id": r["phong_id"],
                "ten": r["ten"],
                "ip_address": r["ip_address"],
                "port": r["port"],
                "rtsp_path": r["rtsp_path"],
                "username": r["username"],
                "has_password": bool(r["password_enc"]),
                "stream_url": r["stream_url"],
                "thu_tu": r["thu_tu"],
                "is_active": r["is_active"],
                "created_at": r["created_at"].isoformat() if r["created_at"] else None,
            },
        }
    finally:
        cursor.close()
        conn.close()


@router.put("/rooms/{room_id}/cameras/{camera_id}")
def update_camera(
    room_id: int,
    camera_id: int,
    body: CameraUpdate,
    current_user: str = Depends(get_current_user)
):
    """
    Cập nhật camera.
    """
    check_room_permission(room_id, current_user, "edit")

    conn = get_mysql()
    cursor = conn.cursor(dictionary=True)
    try:
        # Verify camera belongs to this room
        cursor.execute(
            "SELECT id FROM phong_camera WHERE id = %s AND phong_id = %s",
            (camera_id, room_id),
        )
        if not cursor.fetchone():
            raise HTTPException(status_code=404, detail="Camera not found in this room")

        fields, values = [], []
        if body.ten is not None:
            fields.append("ten=%s"); values.append(body.ten)
        if body.ip_address is not None:
            fields.append("ip_address=%s"); values.append(body.ip_address)
        if body.port is not None:
            fields.append("port=%s"); values.append(body.port)
        if body.rtsp_path is not None:
            fields.append("rtsp_path=%s"); values.append(body.rtsp_path)
        if body.username is not None:
            fields.append("username=%s"); values.append(body.username)
        if body.password is not None:
            fields.append("password_enc=%s"); values.append(encrypt_password(body.password))
        if body.stream_url is not None:
            fields.append("stream_url=%s"); values.append(body.stream_url)
        if body.thu_tu is not None:
            fields.append("thu_tu=%s"); values.append(body.thu_tu)
        if body.is_active is not None:
            fields.append("is_active=%s"); values.append(1 if body.is_active else 0)

        if not fields:
            raise HTTPException(status_code=400, detail="No fields to update")

        values.extend([camera_id, room_id])
        cursor.execute(
            f"UPDATE phong_camera SET {', '.join(fields)} WHERE id=%s AND phong_id=%s",
            tuple(values),
        )
        conn.commit()
        return {"message": "updated"}
    finally:
        cursor.close()
        conn.close()


@router.delete("/rooms/{room_id}/cameras/{camera_id}")
def delete_camera(
    room_id: int,
    camera_id: int,
    current_user: str = Depends(get_current_user)
):
    """
    Xóa camera.
    """
    check_room_permission(room_id, current_user, "edit")

    conn = get_mysql()
    cursor = conn.cursor()
    try:
        cursor.execute(
            "DELETE FROM phong_camera WHERE id = %s AND phong_id = %s",
            (camera_id, room_id),
        )
        if cursor.rowcount == 0:
            raise HTTPException(status_code=404, detail="Camera not found")
        conn.commit()
        return {"message": "deleted"}
    finally:
        cursor.close()
        conn.close()


@router.get("/rooms/{room_id}/cameras/{camera_id}/stream-url")
def get_camera_stream_url(
    room_id: int,
    camera_id: int,
    current_user: str = Depends(get_current_user_or_internal)
):
    """
    Trả về full RTSP URL đã xây dựng từ camera config (đã giải mã password).
    Chỉ dùng nội bộ (cho ai_analyst) — không public ra client.
    """
    conn = get_mysql()
    cursor = conn.cursor(dictionary=True)
    try:
        cursor.execute(
            "SELECT * FROM phong_camera WHERE id = %s AND phong_id = %s AND is_active = 1",
            (camera_id, room_id),
        )
        cam = cursor.fetchone()
        if not cam:
            raise HTTPException(status_code=404, detail="Camera not found or inactive")

        stream_url = build_stream_url(
            stream_url=cam.get("stream_url"),
            ip_address=cam.get("ip_address"),
            port=cam.get("port"),
            rtsp_path=cam.get("rtsp_path"),
            username=cam.get("username"),
            password_enc=cam.get("password_enc"),
        )
        return {
            "camera_id": camera_id,
            "stream_url": stream_url,
            "ip_address": cam.get("ip_address"),
            "port": cam.get("port"),
        }
    finally:
        cursor.close()
        conn.close()


# ============================================================
# Occupancy endpoints (written by ai_analyst, read by any authenticated user)
# ============================================================
@router.post("/internal/ai/occupancy")
def upsert_occupancy(
    body: OccupancyUpdate,
    current_user: str = Depends(get_current_user_or_internal)
):
    """
    Upsert people count — gọi bởi ai_analyst service.

    Header required: X-API-Key (hoặc JWT auth).
    Khi count_type='camera': đồng thời upsert room_total (tổng hợp tất cả camera cùng phòng).
    """
    conn = get_mysql()
    cursor = conn.cursor()
    try:
        # Upsert camera-level count
        cursor.execute(
            """
            INSERT INTO phong_occupancy
              (phong_id, phong_camera_id, so_nguoi, count_type, cap_nhat_luc, nguon)
            VALUES (%s, %s, %s, %s, NOW(), %s)
            ON DUPLICATE KEY UPDATE
              so_nguoi = VALUES(so_nguoi),
              cap_nhat_luc = VALUES(cap_nhat_luc)
            """,
            (
                body.phong_id,
                body.phong_camera_id,
                body.so_nguoi,
                body.count_type or "camera",
                body.nguon or "ai_analyst",
            ),
        )

        # If camera-level, recalculate room_total (sum of all camera counts)
        if body.count_type == "camera" and body.phong_camera_id is not None:
            cursor.execute(
                """
                SELECT COALESCE(SUM(so_nguoi), 0) as total
                FROM phong_occupancy
                WHERE phong_id = %s AND count_type = 'camera' AND phong_camera_id IS NOT NULL
                """,
                (body.phong_id,),
            )
            row = cursor.fetchone()
            total = int(row[0]) if row else 0

            cursor.execute(
                """
                INSERT INTO phong_occupancy
                  (phong_id, phong_camera_id, so_nguoi, count_type, cap_nhat_luc, nguon)
                VALUES (%s, NULL, %s, 'room_total', NOW(), %s)
                ON DUPLICATE KEY UPDATE
                  so_nguoi = VALUES(so_nguoi),
                  cap_nhat_luc = VALUES(cap_nhat_luc)
                """,
                (body.phong_id, total, body.nguon or "ai_analyst"),
            )

        conn.commit()
        return {"message": "ok", "phong_id": body.phong_id, "so_nguoi": body.so_nguoi}
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        cursor.close()
        conn.close()


@router.get("/rooms/{room_id}/occupancy")
def get_room_occupancy(
    room_id: int,
    current_user: str = Depends(get_current_user_optional)
):
    """
    Lấy số người hiện tại trong phòng (room_total).
    """
    conn = get_mysql()
    cursor = conn.cursor(dictionary=True)
    try:
        cursor.execute(
            """
            SELECT phong_id, so_nguoi, cap_nhat_luc, nguon
            FROM phong_occupancy
            WHERE phong_id = %s AND count_type = 'room_total'
            LIMIT 1
            """,
            (room_id,),
        )
        row = cursor.fetchone()
        if not row:
            return {"phong_id": room_id, "so_nguoi": 0, "cap_nhat_luc": None, "nguon": None}

        return {
            "phong_id": row["phong_id"],
            "so_nguoi": int(row["so_nguoi"]),
            "cap_nhat_luc": row["cap_nhat_luc"].isoformat() if row["cap_nhat_luc"] else None,
            "nguon": row["nguon"],
        }
    finally:
        cursor.close()
        conn.close()


@router.get("/rooms/{room_id}/cameras/{camera_id}/occupancy")
def get_camera_occupancy(
    room_id: int,
    camera_id: int,
    current_user: str = Depends(get_current_user_optional)
):
    """
    Lấy số người từng camera.
    """
    conn = get_mysql()
    cursor = conn.cursor(dictionary=True)
    try:
        cursor.execute(
            """
            SELECT phong_id, phong_camera_id, so_nguoi, cap_nhat_luc, nguon
            FROM phong_occupancy
            WHERE phong_id = %s AND phong_camera_id = %s AND count_type = 'camera'
            LIMIT 1
            """,
            (room_id, camera_id),
        )
        row = cursor.fetchone()
        if not row:
            return {"phong_id": room_id, "camera_id": camera_id, "so_nguoi": 0, "cap_nhat_luc": None}

        return {
            "phong_id": row["phong_id"],
            "camera_id": row["phong_camera_id"],
            "so_nguoi": int(row["so_nguoi"]),
            "cap_nhat_luc": row["cap_nhat_luc"].isoformat() if row["cap_nhat_luc"] else None,
            "nguon": row["nguon"],
        }
    finally:
        cursor.close()
        conn.close()


@router.get("/internal/ai/camera-watch-list")
def get_camera_watch_list(
    current_user: str = Depends(get_current_user_or_internal)
):
    """
    Danh sách camera active cần chạy AI nền 24/7.
    Gọi bởi ai_analyst để duy trì session không phụ thuộc dashboard.
    """
    conn = get_mysql()
    cursor = conn.cursor(dictionary=True)
    try:
        cursor.execute(
            """
            SELECT pc.id AS camera_id, pc.phong_id
            FROM phong_camera pc
            WHERE pc.is_active = 1
            """
        )
        rows = cursor.fetchall()
        return {
            "cameras": [
                {"camera_id": int(r["camera_id"]), "phong_id": int(r["phong_id"])}
                for r in rows
            ]
        }
    finally:
        cursor.close()
        conn.close()


@router.get("/devices/latest-all")
def get_devices_latest_all(
    workspace_id: Optional[int] = Query(None),
    current_user: str = Depends(get_current_user)
):
    """
    Lấy dữ liệu mới nhất của tất cả thiết bị (1 query) để giảm số request.
    Trả về danh sách thiết bị + latest data per key.
    """
    conn = get_mysql()
    cursor = conn.cursor(dictionary=True)
    try:
        ws_cond, ws_params = get_workspace_conditions(cursor, current_user, workspace_id, alias="t")
        
        # Danh sách thiết bị
        query = f"""
            SELECT t.id, t.ma_thiet_bi, t.ten_thiet_bi, t.loai_thiet_bi,
                   t.trang_thai, t.last_seen, t.phong_id, t.nguoi_so_huu_id,
                   p.ten_phong, p.ma_phong
            FROM thiet_bi t
            LEFT JOIN phong p ON t.phong_id = p.id
            WHERE t.is_active = 1 AND {ws_cond}
        """
        cursor.execute(query, tuple(ws_params))
        devices = cursor.fetchall()
        if not devices:
            return {"devices": []}

        device_map = {d["id"]: d for d in devices}

        # Lấy bản ghi mới nhất cho từng (thiet_bi_id, khoa)
        cursor.execute(
            """
            SELECT d.thiet_bi_id, d.khoa, d.gia_tri, d.thoi_gian,
                   kdl.don_vi, kdl.mo_ta
            FROM du_lieu_thiet_bi d
            JOIN (
                SELECT thiet_bi_id, khoa, MAX(thoi_gian) AS max_time
                FROM du_lieu_thiet_bi
                GROUP BY thiet_bi_id, khoa
            ) m ON d.thiet_bi_id = m.thiet_bi_id AND d.khoa = m.khoa AND d.thoi_gian = m.max_time
            LEFT JOIN khoa_du_lieu kdl ON d.thiet_bi_id = kdl.thiet_bi_id AND d.khoa = kdl.khoa
            WHERE d.thiet_bi_id IN (%s)
            """
            % (",".join(str(d["id"]) for d in devices))
        )
        rows = cursor.fetchall()

        # Build data per device
        data_by_device = {}
        for row in rows:
            did = row["thiet_bi_id"]
            data_by_device.setdefault(did, {})
            try:
                value = float(row["gia_tri"])
            except (ValueError, TypeError):
                value = row["gia_tri"]
            data_by_device[did][row["khoa"]] = {
                "value": value,
                "don_vi": row["don_vi"],
                "mo_ta": row["mo_ta"],
                "timestamp": int(row["thoi_gian"].timestamp()) if row["thoi_gian"] else None,
            }

        # Kết quả cuối
        result = []
        for d in devices:
            result.append(
                {
                    "device_id": d["ma_thiet_bi"],
                    "ten_thiet_bi": d["ten_thiet_bi"],
                    "loai_thiet_bi": d["loai_thiet_bi"],
                    "trang_thai": d["trang_thai"],
                    "last_seen": int(d["last_seen"].timestamp()) if d["last_seen"] else None,
                    "phong_id": d["phong_id"],
                    "ten_phong": d.get("ten_phong"),
                    "ma_phong": d.get("ma_phong"),
                    "data": data_by_device.get(d["id"], {}),
                }
            )

        return {"devices": result}
    finally:
        cursor.close()
        conn.close()


@router.put("/devices/{device_id}/room")
def update_device_room(
    device_id: str,
    body: DeviceUpdateRoom,
    workspace_id: Optional[int] = Query(None),
    current_user: str = Depends(get_current_user),
):
    """
    Cập nhật phòng cho device.
    - User chỉ có thể thêm/xóa devices của mình vào/khỏi room
    - Có thể thêm vào bất kỳ room nào (admin, teacher, student tạo)
    """
    conn = get_mysql()
    cursor = conn.cursor(dictionary=True)
    try:
        # Get current user info
        cursor.execute("SELECT id, vai_tro FROM nguoi_dung WHERE email = %s", (current_user,))
        user = cursor.fetchone()
        if not user:
            raise HTTPException(status_code=401, detail="User not found")
        
        user_id = user["id"]
        role = user["vai_tro"]
        
        # Get device owner
        cursor.execute(
            "SELECT nguoi_so_huu_id FROM thiet_bi WHERE ma_thiet_bi = %s AND is_active = 1",
            (device_id,)
        )
        device = cursor.fetchone()
        if not device:
            raise HTTPException(status_code=404, detail="Device not found")
        
        # Check if user owns the device (or is admin)
        if role != "admin" and device["nguoi_so_huu_id"] != user_id:
            raise HTTPException(
                status_code=403,
                detail="You can only add/remove your own devices to/from rooms"
            )
        
        # Update device room
        cursor.execute(
            """
            UPDATE thiet_bi
            SET phong_id = %s
            WHERE ma_thiet_bi = %s
            """,
            (body.phong_id, device_id),
        )
        if cursor.rowcount == 0:
            raise HTTPException(status_code=404, detail="Device not found")
        conn.commit()
        return {"message": "updated"}
    except HTTPException:
        raise
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=f"Update device room failed: {e}")
    finally:
        cursor.close()
        conn.close()


@router.get("/events", response_model=List[Event])
def get_all_events(current_user: str = Depends(get_current_user)):
    mongo = get_mongo()
    cursor = mongo["events"].find({}, {"_id": 0}).sort("timestamp", -1).limit(100)
    return list(cursor)


@router.get("/events/{device_id}")
def get_device_events(
    device_id: str,
    page: int = 1,
    page_size: int = 25,  # Giảm xuống 25 để tải nhanh hơn
    current_user: str = Depends(get_current_user)
):
    """
    Lấy lịch sử dữ liệu của thiết bị từ MongoDB `events`, hỗ trợ phân trang.
    - page: trang hiện tại (>=1)
    - page_size: số bản ghi mỗi trang (mặc định 25)
    Trả về: events, page, page_size, has_prev, has_next (không cần total/total_pages)
    """
    if page < 1:
        page = 1
    if page_size < 1 or page_size > 100:  # Giới hạn tối đa 100
        page_size = 25

    mongo = get_mongo()
    collection = mongo["events"]

    # Đảm bảo có index để query nhanh hơn - tạo ngay lập tức nếu chưa có
    try:
        # Kiểm tra index có tồn tại chưa
        indexes = collection.index_information()
        index_name = "device_id_1_timestamp_-1"
        if index_name not in indexes:
            # Tạo index ngay lập tức (không background) để đảm bảo có sẵn
            collection.create_index([("device_id", 1), ("timestamp", -1)])
    except Exception:
        pass  # Index có thể đã tồn tại hoặc đang được tạo

    # Tính skip/limit
    skip = (page - 1) * page_size

    # Pipeline tối ưu: sort trước khi addFields để tận dụng index tốt hơn
    # Nếu timestamp có sẵn, dùng trực tiếp; nếu không mới tính từ _id
    pipeline = [
        {"$match": {"device_id": device_id}},
        # Sort ngay sau match để tận dụng index (device_id, timestamp)
        {"$sort": {"timestamp": -1}},  # Sort trực tiếp trên timestamp nếu có
        {"$skip": skip},
        {"$limit": page_size + 1},  # Lấy thêm 1 để check có trang tiếp theo
        # Chỉ addFields và project sau khi đã sort và limit để giảm dữ liệu xử lý
        {
            "$addFields": {
                "ts": {
                    "$ifNull": [
                        "$timestamp",
                        {"$toLong": {"$toDate": "$_id"}}
                    ]
                }
            }
        },
        {
            "$project": {
                "_id": 0,  # Chỉ bỏ _id, giữ nguyên tất cả các field khác
            }
        },
    ]

    cursor = collection.aggregate(pipeline)
    events = []
    has_next = False
    count = 0
    for doc in cursor:
        count += 1
        if count > page_size:
            has_next = True
            break
        
        ts = doc.get("timestamp")
        if not ts and "ts" in doc and doc["ts"] is not None:
            try:
                ts = float(doc["ts"]) / 1000.0  # ts từ toLong($toDate($_id)) là millis
            except Exception:
                ts = None
        if not ts and "_id" in doc:
            try:
                ts = doc["_id"].generation_time.timestamp()
            except Exception:
                ts = None
        # Bỏ _id và ts khỏi response
        cleaned = {k: v for k, v in doc.items() if k not in ["_id", "ts"]}
        cleaned["timestamp"] = ts
        events.append(cleaned)

    # Kiểm tra có trang trước không (trang > 1 thì luôn có trang trước)
    has_prev = page > 1

    return {
        "events": events,
        "page": page,
        "page_size": page_size,
        "has_prev": has_prev,
        "has_next": has_next,
    }


@router.get("/devices/{device_id}/daily-stats")
def get_device_daily_stats(
    device_id: str,
    days: int = 7,
    current_user: str = Depends(get_current_user)
):
    """
    Lấy thống kê nhiệt độ/độ ẩm theo ngày cho thiết bị.
    - days: số ngày gần nhất (mặc định 7)
    """
    if days < 1 or days > 90:
        days = 7
    
    conn = get_mysql()
    cursor = conn.cursor(dictionary=True)
    
    try:
        # Get thiet_bi_id
        cursor.execute(
            "SELECT id FROM thiet_bi WHERE ma_thiet_bi = %s AND is_active = 1",
            (device_id,)
        )
        device = cursor.fetchone()
        if not device:
            raise HTTPException(status_code=404, detail="Thiết bị không tồn tại")
        
        thiet_bi_id = device["id"]
        
        # Fetch daily stats
        cursor.execute("""
            SELECT 
                ngay,
                nhiet_do_tb, nhiet_do_max, nhiet_do_min,
                do_am_tb, do_am_max, do_am_min,
                so_mau, ngay_cap_nhat
            FROM thong_ke_ngay
            WHERE thiet_bi_id = %s
            ORDER BY ngay DESC
            LIMIT %s
        """, (thiet_bi_id, days))
        
        rows = cursor.fetchall()
        
        # Format response
        stats = []
        for row in rows:
            stats.append({
                "ngay": row["ngay"].isoformat() if row["ngay"] else None,
                "nhiet_do": {
                    "tb": float(row["nhiet_do_tb"]) if row["nhiet_do_tb"] else None,
                    "max": float(row["nhiet_do_max"]) if row["nhiet_do_max"] else None,
                    "min": float(row["nhiet_do_min"]) if row["nhiet_do_min"] else None,
                },
                "do_am": {
                    "tb": float(row["do_am_tb"]) if row["do_am_tb"] else None,
                    "max": float(row["do_am_max"]) if row["do_am_max"] else None,
                    "min": float(row["do_am_min"]) if row["do_am_min"] else None,
                },
                "so_mau": row["so_mau"],
                "cap_nhat": row["ngay_cap_nhat"].isoformat() if row["ngay_cap_nhat"] else None
            })
        
        return {
            "device_id": device_id,
            "days": len(stats),
            "stats": stats
        }
    finally:
        cursor.close()
        conn.close()


@router.get("/devices/{device_id}/hourly-stats")
def get_device_hourly_stats(
    device_id: str,
    hours: int = 24,
    current_user: str = Depends(get_current_user)
):
    """
    Lấy thống kê nhiệt độ/độ ẩm theo giờ cho thiết bị.
    - hours: số giờ gần nhất (mặc định 24)
    """
    if hours < 1 or hours > 72:
        hours = 24
    
    conn = get_mysql()
    cursor = conn.cursor(dictionary=True)
    
    try:
        cursor.execute(
            "SELECT id FROM thiet_bi WHERE ma_thiet_bi = %s AND is_active = 1",
            (device_id,)
        )
        device = cursor.fetchone()
        if not device:
            raise HTTPException(status_code=404, detail="Thiết bị không tồn tại")
        
        thiet_bi_id = device["id"]
        
        cursor.execute("""
            SELECT 
                ngay, gio,
                nhiet_do_tb, nhiet_do_max, nhiet_do_min,
                do_am_tb, do_am_max, do_am_min,
                so_mau
            FROM thong_ke_gio
            WHERE thiet_bi_id = %s
            ORDER BY ngay DESC, gio DESC
            LIMIT %s
        """, (thiet_bi_id, hours))
        
        rows = cursor.fetchall()
        
        stats = []
        for row in rows:
            stats.append({
                "ngay": row["ngay"].isoformat() if row["ngay"] else None,
                "gio": row["gio"],
                "label": f"{row['gio']:02d}:00",
                "nhiet_do_tb": float(row["nhiet_do_tb"]) if row["nhiet_do_tb"] else None,
                "do_am_tb": float(row["do_am_tb"]) if row["do_am_tb"] else None,
                "so_mau": row["so_mau"]
            })
        
        # Reverse to show oldest first (for chart timeline)
        stats.reverse()
        
        return {
            "device_id": device_id,
            "hours": len(stats),
            "stats": stats
        }
    finally:
        cursor.close()
        conn.close()


@router.get("/stats/hourly")
def get_global_hourly_stats(
    hours: int = 24,
    current_user: str = Depends(get_current_user)
):
    """
    Lấy thống kê nhiệt độ/độ ẩm trung bình toàn hệ thống theo giờ.
    Tổng hợp từ tất cả sensor devices.
    Returns continuous timeline with null values for missing hours.
    """
    from datetime import datetime, timedelta, timezone
    
    if hours < 1 or hours > 72:
        hours = 24
    
    # Vietnam timezone
    VN_TZ = timezone(timedelta(hours=7))
    now = datetime.now(VN_TZ)
    current_hour = now.replace(minute=0, second=0, microsecond=0)
    
    conn = get_mysql()
    cursor = conn.cursor(dictionary=True)
    
    try:
        # Generate expected hours for the timeline
        expected_hours = []
        for i in range(hours - 1, -1, -1):
            hour_dt = current_hour - timedelta(hours=i)
            expected_hours.append((hour_dt.date(), hour_dt.hour))
        
        # Fetch available data from database
        cursor.execute("""
            SELECT 
                g.ngay, g.gio,
                AVG(g.nhiet_do_tb) as nhiet_do_tb,
                AVG(g.do_am_tb) as do_am_tb,
                SUM(g.so_mau) as so_mau
            FROM thong_ke_gio g
            JOIN thiet_bi t ON g.thiet_bi_id = t.id
            WHERE t.loai_thiet_bi = 'sensor' AND t.is_active = 1
            GROUP BY g.ngay, g.gio
        """)
        
        rows = cursor.fetchall()
        
        # Create lookup dict for existing data
        data_map = {}
        for row in rows:
            key = (row["ngay"], row["gio"])
            data_map[key] = {
                "nhiet_do_tb": round(float(row["nhiet_do_tb"]), 2) if row["nhiet_do_tb"] else None,
                "do_am_tb": round(float(row["do_am_tb"]), 2) if row["do_am_tb"] else None,
                "so_mau": row["so_mau"]
            }
        
        # Build stats with continuous timeline
        stats = []
        for ngay, gio in expected_hours:
            data = data_map.get((ngay, gio), {})
            stats.append({
                "ngay": ngay.isoformat() if ngay else None,
                "gio": gio,
                "label": f"{gio:02d}:00",
                "nhiet_do_tb": data.get("nhiet_do_tb"),
                "do_am_tb": data.get("do_am_tb"),
                "so_mau": data.get("so_mau", 0)
            })
        
        return {"hours": len(stats), "stats": stats}
    finally:
        cursor.close()
        conn.close()


@router.get("/stats/daily")
def get_global_daily_stats(
    days: int = 7,
    current_user: str = Depends(get_current_user)
):
    """
    Lấy thống kê nhiệt độ/độ ẩm trung bình toàn hệ thống theo ngày.
    """
    if days < 1 or days > 30:
        days = 7
    
    conn = get_mysql()
    cursor = conn.cursor(dictionary=True)
    
    try:
        cursor.execute("""
            SELECT 
                n.ngay,
                AVG(n.nhiet_do_tb) as nhiet_do_tb,
                AVG(n.do_am_tb) as do_am_tb,
                SUM(n.so_mau) as so_mau
            FROM thong_ke_ngay n
            JOIN thiet_bi t ON n.thiet_bi_id = t.id
            WHERE t.loai_thiet_bi = 'sensor' AND t.is_active = 1
            GROUP BY n.ngay
            ORDER BY n.ngay DESC
            LIMIT %s
        """, (days,))
        
        rows = cursor.fetchall()
        
        stats = []
        for row in rows:
            stats.append({
                "ngay": row["ngay"].isoformat() if row["ngay"] else None,
                "label": row["ngay"].strftime("%d/%m") if row["ngay"] else None,
                "nhiet_do_tb": round(float(row["nhiet_do_tb"]), 2) if row["nhiet_do_tb"] else None,
                "do_am_tb": round(float(row["do_am_tb"]), 2) if row["do_am_tb"] else None,
                "so_mau": row["so_mau"]
            })
        
        stats.reverse()
        
        return {"days": len(stats), "stats": stats}
    finally:
        cursor.close()
        conn.close()


def update_device_state_mysql(device_id: str, updates: dict):
    """
    Ghi trạng thái điều khiển vào MySQL:
    - Insert vào du_lieu_thiet_bi cho từng key (state, brightness, setpoint...)
    - Update thiet_bi.last_seen, trang_thai = 'online'
    """
    conn = get_mysql()
    cursor = conn.cursor(dictionary=True)
    try:
        cursor.execute("SELECT id FROM thiet_bi WHERE ma_thiet_bi = %s AND is_active = 1", (device_id,))
        device = cursor.fetchone()
        if not device:
            return
        thiet_bi_id = device["id"]
        now = datetime.utcnow()
        for key, val in updates.items():
            cursor.execute(
                """
                INSERT INTO du_lieu_thiet_bi (thiet_bi_id, khoa, gia_tri, thoi_gian)
                VALUES (%s, %s, %s, %s)
                """,
                (thiet_bi_id, key, str(val), now),
            )
        cursor.execute(
            """
            UPDATE thiet_bi
            SET last_seen = %s, trang_thai = 'online'
            WHERE id = %s
            """,
            (now, thiet_bi_id),
        )
        conn.commit()
    except Exception as e:
        print(f"[CONTROL] MySQL update error: {e}")
        conn.rollback()
    finally:
        cursor.close()
        conn.close()


@router.get("/devices/{device_id}/data-keys")
def get_device_data_keys(
    device_id: str,
    current_user: str = Depends(get_current_user)
):
    """
    Lấy danh sách data keys (khoa_du_lieu) của thiết bị.
    Dùng cho widget editor để hiển thị các keys có sẵn.
    """
    conn = get_mysql()
    cursor = conn.cursor(dictionary=True)
    try:
        cursor.execute("""
            SELECT id FROM thiet_bi 
            WHERE ma_thiet_bi = %s AND is_active = 1
        """, (device_id,))
        device = cursor.fetchone()
        
        if not device:
            raise HTTPException(status_code=404, detail="Device not found")
        
        thiet_bi_id = device['id']
        
        # Lấy danh sách keys từ khoa_du_lieu
        cursor.execute("""
            SELECT khoa, don_vi, mo_ta
            FROM khoa_du_lieu
            WHERE thiet_bi_id = %s
            ORDER BY khoa
        """, (thiet_bi_id,))
        
        keys = cursor.fetchall()
        
        # Nếu không có keys trong khoa_du_lieu, lấy từ du_lieu_thiet_bi (historical data)
        if not keys:
            cursor.execute("""
                SELECT DISTINCT khoa
                FROM du_lieu_thiet_bi
                WHERE thiet_bi_id = %s
                ORDER BY khoa
            """, (thiet_bi_id,))
            historical_keys = cursor.fetchall()
            keys = [{"khoa": k["khoa"], "don_vi": "", "mo_ta": ""} for k in historical_keys]
        
        return {
            "device_id": device_id,
            "data_keys": keys
        }
    finally:
        cursor.close()
        conn.close()


@router.get("/devices/{device_id}/latest")
def get_device_latest(
    device_id: str,
    current_user: str = Depends(get_current_user)
):
    """
    Lấy dữ liệu mới nhất của thiết bị từ MySQL du_lieu_thiet_bi.
    Dùng cho hiển thị real-time card.
    """
    conn = get_mysql()
    cursor = conn.cursor(dictionary=True)
    try:
        # Lấy thiet_bi_id từ ma_thiet_bi (cột edge chỉ SELECT nếu DB đã migration)
        has_edge_col = mysql_thiet_bi_has_edge_control_url(conn)
        has_tpl_col = mysql_thiet_bi_has_edge_control_body_template(conn)
        if has_edge_col and has_tpl_col:
            cursor.execute("""
                SELECT t.id, t.ma_thiet_bi, t.ten_thiet_bi, t.loai_thiet_bi,
                       t.trang_thai, t.last_seen, t.phong_id, t.edge_control_url,
                       t.edge_control_body_template,
                       p.ten_phong, p.ma_phong
                FROM thiet_bi t
                LEFT JOIN phong p ON t.phong_id = p.id
                WHERE t.ma_thiet_bi = %s AND t.is_active = 1
            """, (device_id,))
        elif has_edge_col:
            cursor.execute("""
                SELECT t.id, t.ma_thiet_bi, t.ten_thiet_bi, t.loai_thiet_bi,
                       t.trang_thai, t.last_seen, t.phong_id, t.edge_control_url,
                       p.ten_phong, p.ma_phong
                FROM thiet_bi t
                LEFT JOIN phong p ON t.phong_id = p.id
                WHERE t.ma_thiet_bi = %s AND t.is_active = 1
            """, (device_id,))
        else:
            cursor.execute("""
                SELECT t.id, t.ma_thiet_bi, t.ten_thiet_bi, t.loai_thiet_bi,
                       t.trang_thai, t.last_seen, t.phong_id,
                       p.ten_phong, p.ma_phong
                FROM thiet_bi t
                LEFT JOIN phong p ON t.phong_id = p.id
                WHERE t.ma_thiet_bi = %s AND t.is_active = 1
            """, (device_id,))
        device = cursor.fetchone()
        
        if not device:
            raise HTTPException(status_code=404, detail="Device not found")
        
        thiet_bi_id = device['id']
        edge_url = device.get("edge_control_url") if has_edge_col else None
        edge_body_tpl = device.get("edge_control_body_template") if has_tpl_col else None
        
        # Tối ưu cho MySQL 5.7: Dùng JOIN với subquery để lấy MAX thoi_gian cho mỗi khoa
        # Cách này nhanh hơn correlated subquery vì subquery chỉ chạy 1 lần
        cursor.execute("""
            SELECT 
                dltb.khoa,
                dltb.gia_tri,
                dltb.thoi_gian,
                kdl.don_vi,
                kdl.mo_ta
            FROM du_lieu_thiet_bi dltb
            INNER JOIN (
                SELECT khoa, MAX(thoi_gian) as max_thoi_gian
                FROM du_lieu_thiet_bi
                WHERE thiet_bi_id = %s
                GROUP BY khoa
            ) latest ON dltb.khoa = latest.khoa AND dltb.thoi_gian = latest.max_thoi_gian
            LEFT JOIN khoa_du_lieu kdl ON dltb.thiet_bi_id = kdl.thiet_bi_id AND dltb.khoa = kdl.khoa
            WHERE dltb.thiet_bi_id = %s
        """, (thiet_bi_id, thiet_bi_id))
        
        latest_data = cursor.fetchall()
        
        # Format dữ liệu
        result = {
            'device_id': device_id,
            'ma_thiet_bi': device['ma_thiet_bi'],
            'ten_thiet_bi': device['ten_thiet_bi'],
            'loai_thiet_bi': device['loai_thiet_bi'],
            'trang_thai': device['trang_thai'],
            'last_seen': int(device['last_seen'].timestamp()) if device['last_seen'] else None,
            'phong_id': device['phong_id'],
            'ten_phong': device.get('ten_phong'),
            'ma_phong': device.get('ma_phong'),
            'edge_control_url': edge_url,
            'edge_control_body_template': edge_body_tpl,
            'data': {}
        }
        
        for row in latest_data:
            key = row['khoa']
            try:
                value = float(row['gia_tri'])
            except (ValueError, TypeError):
                value = row['gia_tri']
            
            result['data'][key] = {
                'value': value,
                'don_vi': row['don_vi'],
                'mo_ta': row['mo_ta'],
                'timestamp': int(row['thoi_gian'].timestamp()) if row['thoi_gian'] else None
            }
        
        return result
    except HTTPException:
        raise
    except Exception as e:
        print(f"[ERROR] get_device_latest error: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Error fetching device latest data: {str(e)}")
    finally:
        cursor.close()
        conn.close()


@router.get("/kafka/events")
def get_kafka_events(current_user: str = Depends(get_current_user)):
    """
    Endpoint demo cho luồng KAFKA → FASTAPI.

    Trả về danh sách các event mới nhất mà FastAPI đã đọc trực tiếp từ Kafka.
    """
    return {"events": get_latest_events()}


ALLOWED_OPERATORS = {">", "<", ">=", "<=", "!=", "=", "=="}


def _parse_rule_graph(graph: dict):
    """Parse rule_graph to extract conditions and actions. Returns (conditions, actions, condition_device_id)."""
    if not graph or not isinstance(graph, dict):
        return None, None, None
    nodes = graph.get("nodes") or []
    node_map = {n["id"]: n for n in nodes}
    conditions, actions = [], []
    condition_device_id = None
    for n in nodes:
        d = n.get("data") or {}
        if n.get("type") == "filter":
            conds = d.get("conditions") or []
            if isinstance(conds, list):
                conditions = [c for c in conds if isinstance(c, dict) and c.get("field")]
            condition_device_id = d.get("condition_device_id") or condition_device_id
        elif n.get("type") == "control":
            dev = d.get("device_id")
            cmd = d.get("action_command")
            if dev and cmd:
                actions.append({
                    "device_id": dev,
                    "action_command": cmd,
                    "action_params": d.get("action_params"),
                    "delay_seconds": d.get("delay_seconds", 0),
                    "thu_tu": d.get("thu_tu", 1),
                })
    if not conditions and not actions:
        return None, None, None
    return conditions, actions, condition_device_id


def build_rules_from_rows(rows):
    rules = {}
    for row in rows:
        rid = row["rule_id"]
        if rid not in rules:
            rule_graph = None
            if row.get("rule_graph"):
                try:
                    rule_graph = json.loads(row["rule_graph"]) if isinstance(row["rule_graph"], str) else row["rule_graph"]
                except Exception:
                    pass
            rules[rid] = {
                "id": rid,
                "ten_rule": row["ten_rule"],
                "phong_id": row["phong_id"],
                "condition_device_id": row["condition_device_id"],
                "conditions": json.loads(row["conditions"]) if row.get("conditions") else [],
                "rule_graph": rule_graph,
                "muc_do_uu_tien": row["muc_do_uu_tien"],
                "trang_thai": row["trang_thai"],
                "actions": [],
            }
        if row.get("action_id"):
            rules[rid]["actions"].append(
                {
                    "id": row["action_id"],
                    "device_id": row["action_device_id"],
                    "action_command": row["action_command"],
                    "action_params": row["action_params"],
                    "delay_seconds": row["delay_seconds"],
                    "thu_tu": row["thu_tu"],
                }
            )
    return list(rules.values())


@router.get("/rules")
def list_rules(
    workspace_id: Optional[int] = Query(None),
    trang_thai: Optional[str] = None, 
    current_user: str = Depends(get_current_user)
):
    conn = get_mysql()
    cursor = conn.cursor(dictionary=True)
    try:
        ws_cond, ws_params = get_workspace_conditions(cursor, current_user, workspace_id, alias="r")
        query = f"""
            SELECT r.id as rule_id, r.ten_rule, r.phong_id, r.condition_device_id,
                   r.conditions, r.rule_graph, r.muc_do_uu_tien, r.trang_thai, r.nguoi_so_huu_id,
                   ra.id as action_id, ra.device_id as action_device_id,
                   ra.action_command, ra.action_params, ra.delay_seconds, ra.thu_tu
            FROM rules r
            LEFT JOIN rule_actions ra ON r.id = ra.rule_id
            WHERE {ws_cond}
        """
        params = list(ws_params)
        if trang_thai:
            query += " AND r.trang_thai = %s"
            params.append(trang_thai)
        query += " ORDER BY r.muc_do_uu_tien ASC, r.id ASC, ra.thu_tu ASC"
        cursor.execute(query, tuple(params))
        rows = cursor.fetchall()
        return {"rules": build_rules_from_rows(rows)}
    finally:
        cursor.close()
        conn.close()


@router.post("/rules")
def create_rule(
    body: RuleCreate, 
    workspace_id: Optional[int] = Query(None),
    current_user: str = Depends(get_current_user)
):
    conditions = list(body.conditions) if body.conditions else []
    actions = list(body.actions) if body.actions else []
    condition_device_id = body.condition_device_id

    if body.rule_graph:
        parsed_conds, parsed_actions, parsed_dev = _parse_rule_graph(body.rule_graph)
        if parsed_conds:
            conditions = parsed_conds
        if parsed_actions:
            actions = parsed_actions
        if parsed_dev:
            condition_device_id = parsed_dev

    if not conditions or len(conditions) == 0:
        raise HTTPException(status_code=400, detail="At least one condition is required")
    for cond in conditions:
        op = cond["operator"] if isinstance(cond, dict) else cond.operator
        if op not in ALLOWED_OPERATORS:
            raise HTTPException(status_code=400, detail="Invalid operator in conditions")

    first_cond = conditions[0]
    first_field = first_cond.get("field") if isinstance(first_cond, dict) else first_cond.field
    first_operator = first_cond.get("operator") if isinstance(first_cond, dict) else first_cond.operator
    first_value = first_cond.get("value") if isinstance(first_cond, dict) else first_cond.value

    conds_json = json.dumps([c if isinstance(c, dict) else c.dict() for c in conditions])
    rule_graph_json = json.dumps(body.rule_graph) if body.rule_graph else None

    conn = get_mysql()
    cursor = conn.cursor(dictionary=True)  # ← Thêm dictionary=True
    try:
        owner_id = get_authorized_workspace_id(cursor, current_user, workspace_id)
        cursor.execute(
            """
            INSERT INTO rules (ten_rule, phong_id, condition_device_id, field, operator, value, conditions, rule_graph, muc_do_uu_tien, trang_thai, nguoi_so_huu_id)
            VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
            """,
            (
                body.ten_rule,
                body.phong_id,
                condition_device_id,
                first_field,
                first_operator,
                first_value,
                conds_json,
                rule_graph_json,
                body.muc_do_uu_tien,
                body.trang_thai,
                owner_id
            ),
        )
        rule_id = cursor.lastrowid

        for act in actions:
            a = act if isinstance(act, dict) else act.dict()
            cursor.execute(
                """
                INSERT INTO rule_actions (rule_id, device_id, action_command, action_params, delay_seconds, thu_tu)
                VALUES (%s,%s,%s,%s,%s,%s)
                """,
                (
                    rule_id,
                    a.get("device_id"),
                    a.get("action_command"),
                    json.dumps(a.get("action_params")) if a.get("action_params") else None,
                    a.get("delay_seconds", 0),
                    a.get("thu_tu", 1),
                ),
            )

        conn.commit()
        return {"message": "created", "rule_id": rule_id}
    except HTTPException:
        raise
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=f"Create rule failed: {e}")
    finally:
        cursor.close()
        conn.close()


@router.put("/rules/{rule_id}")
def update_rule(rule_id: int, body: RuleUpdate, current_user: str = Depends(get_current_user)):
    fields = []
    values = []
    if body.ten_rule is not None:
        fields.append("ten_rule=%s")
        values.append(body.ten_rule)
    if body.phong_id is not None:
        fields.append("phong_id=%s")
        values.append(body.phong_id)
    if body.condition_device_id is not None:
        fields.append("condition_device_id=%s")
        values.append(body.condition_device_id)
    # Không cần xử lý field/operator riêng lẻ vì đã deprecated, chỉ dùng conditions
    if body.conditions is not None:
        # validate operators
        for cond in body.conditions:
            if cond.operator not in ALLOWED_OPERATORS:
                raise HTTPException(status_code=400, detail="Invalid operator in conditions")
        fields.append("conditions=%s")
        values.append(json.dumps([cond.dict() for cond in body.conditions]))
        if len(body.conditions) > 0:
            # cập nhật cột legacy để tương thích
            first = body.conditions[0]
            fields.extend(["field=%s", "operator=%s", "value=%s"])
            values.extend([first.field, first.operator, first.value])
    if body.muc_do_uu_tien is not None:
        fields.append("muc_do_uu_tien=%s")
        values.append(body.muc_do_uu_tien)
    if body.trang_thai is not None:
        fields.append("trang_thai=%s")
        values.append(body.trang_thai)
    if body.rule_graph is not None:
        fields.append("rule_graph=%s")
        values.append(json.dumps(body.rule_graph))

    # When rule_graph provided, derive conditions/actions from it
    if body.rule_graph:
        parsed_conds, parsed_actions, parsed_dev = _parse_rule_graph(body.rule_graph)
        if parsed_conds:
            body.conditions = [RuleCondition(**c) if isinstance(c, dict) else c for c in parsed_conds]
        if parsed_actions:
            body.actions = [RuleActionCreate(**a) if isinstance(a, dict) else a for a in parsed_actions]
        if parsed_dev:
            body.condition_device_id = parsed_dev

    # Allow update even if no rule fields changed (only actions changed)
    if not fields and body.actions is None:
        raise HTTPException(status_code=400, detail="No fields to update")

    conn = get_mysql()
    cursor = conn.cursor()
    try:
        # First, check if rule exists
        cursor.execute("SELECT id FROM rules WHERE id = %s", (rule_id,))
        if cursor.fetchone() is None:
            raise HTTPException(status_code=404, detail="Rule not found")
        
        # Update rule fields if any
        if fields:
            values.append(rule_id)
            cursor.execute(f"UPDATE rules SET {', '.join(fields)} WHERE id=%s", tuple(values))
        
        # Update actions if provided
        if body.actions is not None:
            # Delete existing actions
            cursor.execute("DELETE FROM rule_actions WHERE rule_id = %s", (rule_id,))
            # Insert new actions
            for act in body.actions:
                cursor.execute(
                    """
                    INSERT INTO rule_actions (rule_id, device_id, action_command, action_params, delay_seconds, thu_tu)
                    VALUES (%s, %s, %s, %s, %s, %s)
                    """,
                    (
                        rule_id,
                        act.device_id,
                        act.action_command,
                        json.dumps(act.action_params) if act.action_params else None,
                        act.delay_seconds,
                        act.thu_tu,
                    ),
                )
        
        conn.commit()
        return {"message": "updated"}
    except HTTPException:
        raise
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=f"Update rule failed: {e}")
    finally:
        cursor.close()
        conn.close()


@router.delete("/rules/{rule_id}")
def delete_rule(rule_id: int, current_user: str = Depends(get_current_user)):
    conn = get_mysql()
    cursor = conn.cursor()
    try:
        cursor.execute("DELETE FROM rules WHERE id=%s", (rule_id,))
        if cursor.rowcount == 0:
            raise HTTPException(status_code=404, detail="Rule not found")
        conn.commit()
        return {"message": "deleted"}
    except HTTPException:
        raise
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=f"Delete rule failed: {e}")
    finally:
        cursor.close()
        conn.close()


@router.get("/commands")
def list_commands(limit: int = 100, current_user: str = Depends(get_current_user)):
    limit = max(1, min(limit, 500))
    conn = get_mysql()
    cursor = conn.cursor(dictionary=True)
    try:
        cursor.execute(
            """
            SELECT id, device_id, command, payload, status, rule_id, rule_action_id,
                   created_at, sent_at, acked_at, error_message
            FROM commands
            ORDER BY created_at DESC
            LIMIT %s
            """,
            (limit,),
        )
        rows = cursor.fetchall()
        return {"commands": rows}
    finally:
        cursor.close()
        conn.close()


# ===================== SCHEDULED RULES =====================

class ScheduledRuleCreate(BaseModel):
    ten_rule: Optional[str] = None
    phong_id: Optional[int] = None
    cron_expression: str
    device_id: str
    action_command: str
    action_params: Optional[dict] = None
    trang_thai: str = "enabled"


class ScheduledRuleUpdate(BaseModel):
    ten_rule: Optional[str] = None
    phong_id: Optional[int] = None
    cron_expression: Optional[str] = None
    device_id: Optional[str] = None
    action_command: Optional[str] = None
    action_params: Optional[dict] = None
    trang_thai: Optional[str] = None


@router.get("/scheduled-rules")
def list_scheduled_rules(
    workspace_id: Optional[int] = Query(None),
    trang_thai: Optional[str] = None, 
    current_user: str = Depends(get_current_user)
):
    conn = get_mysql()
    cursor = conn.cursor(dictionary=True)
    try:
        ws_cond, ws_params = get_workspace_conditions(cursor, current_user, workspace_id, alias="")
        query = f"SELECT * FROM scheduled_rules WHERE {ws_cond}"
        params = list(ws_params)
        if trang_thai:
            query += " AND trang_thai = %s"
            params.append(trang_thai)
        query += " ORDER BY id ASC"
        cursor.execute(query, tuple(params))
        rows = cursor.fetchall()
        for r in rows:
            if r.get("ngay_tao"):
                r["ngay_tao"] = r["ngay_tao"].isoformat()
            if r.get("last_run_at"):
                r["last_run_at"] = r["last_run_at"].isoformat()
        return {"scheduled_rules": rows}
    finally:
        cursor.close()
        conn.close()


@router.post("/scheduled-rules")
def create_scheduled_rule(
    body: ScheduledRuleCreate, 
    workspace_id: Optional[int] = Query(None),
    current_user: str = Depends(get_current_user)
):
    conn = get_mysql()
    cursor = conn.cursor(dictionary=True)  # ← Thêm dictionary=True
    try:
        owner_id = get_authorized_workspace_id(cursor, current_user, workspace_id)
        # #region agent log
        try:
            requests.post(
                "http://127.0.0.1:7242/ingest/b79dabf1-b019-4647-a912-96914bd03449",
                json={
                    "sessionId": "7926b3",
                    "location": "routes.py:create_scheduled_rule",
                    "message": "scheduled_rule_create_payload",
                    "hypothesisId": "H_scheduled_create_payload",
                    "data": {
                        "cron_expression": body.cron_expression,
                        "device_id": body.device_id,
                        "action_command": body.action_command,
                        "action_params": body.action_params,
                        "trang_thai": body.trang_thai,
                    },
                    "timestamp": int(time.time() * 1000),
                },
                timeout=2,
            )
        except Exception:
            pass
        # #endregion
        cursor.execute(
            """
            INSERT INTO scheduled_rules (ten_rule, phong_id, cron_expression, device_id, action_command, action_params, trang_thai, nguoi_so_huu_id)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
            """,
            (
                body.ten_rule,
                body.phong_id,
                body.cron_expression,
                body.device_id,
                body.action_command,
                json.dumps(body.action_params) if body.action_params else None,
                body.trang_thai,
                owner_id
            ),
        )
        rid = cursor.lastrowid
        conn.commit()
        return {"message": "created", "id": rid}
    except Exception as e:
        conn.rollback()
        # #region agent log
        try:
            requests.post(
                "http://127.0.0.1:7242/ingest/b79dabf1-b019-4647-a912-96914bd03449",
                json={
                    "sessionId": "7926b3",
                    "location": "routes.py:create_scheduled_rule",
                    "message": "scheduled_rule_create_error",
                    "hypothesisId": "H_scheduled_create_payload",
                    "data": {"error": str(e)[:400]},
                    "timestamp": int(time.time() * 1000),
                },
                timeout=2,
            )
        except Exception:
            pass
        # #endregion
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        cursor.close()
        conn.close()


@router.put("/scheduled-rules/{rule_id}")
def update_scheduled_rule(rule_id: int, body: ScheduledRuleUpdate, current_user: str = Depends(get_current_user)):
    import logging
    logging.info(f"[UPDATE_SCHEDULED_RULE] rule_id={rule_id}, body={body.dict()}")
    
    fields, values = [], []
    # #region agent log
    try:
        requests.post(
            "http://127.0.0.1:7242/ingest/b79dabf1-b019-4647-a912-96914bd03449",
            json={
                "sessionId": "7926b3",
                "location": "routes.py:update_scheduled_rule",
                "message": "scheduled_rule_update_payload",
                "hypothesisId": "H_scheduled_update_payload",
                "data": {
                    "rule_id": rule_id,
                    "body": body.dict(),
                },
                "timestamp": int(time.time() * 1000),
            },
            timeout=2,
        )
    except Exception:
        pass
    # #endregion
    if body.ten_rule is not None:
        fields.append("ten_rule=%s")
        values.append(body.ten_rule)
    if body.phong_id is not None:
        fields.append("phong_id=%s")
        values.append(body.phong_id)
    if body.cron_expression is not None:
        fields.append("cron_expression=%s")
        values.append(body.cron_expression)
    if body.device_id is not None:
        fields.append("device_id=%s")
        values.append(body.device_id)
    if body.action_command is not None:
        fields.append("action_command=%s")
        values.append(body.action_command)
    if body.action_params is not None:
        fields.append("action_params=%s")
        values.append(json.dumps(body.action_params) if body.action_params else None)
    if body.trang_thai is not None:
        fields.append("trang_thai=%s")
        values.append(body.trang_thai)
    
    if not fields:
        logging.warning(f"[UPDATE_SCHEDULED_RULE] No fields to update for rule_id={rule_id}")
        raise HTTPException(status_code=400, detail="No fields to update")
    
    values.append(rule_id)
    conn = get_mysql()
    cursor = conn.cursor()
    try:
        sql = f"UPDATE scheduled_rules SET {', '.join(fields)} WHERE id=%s"
        logging.info(f"[UPDATE_SCHEDULED_RULE] SQL: {sql}, values: {values}")
        cursor.execute(sql, tuple(values))
        
        if cursor.rowcount == 0:
            logging.error(f"[UPDATE_SCHEDULED_RULE] Rule not found: rule_id={rule_id}")
            raise HTTPException(status_code=404, detail="Scheduled rule not found")
        
        conn.commit()
        logging.info(f"[UPDATE_SCHEDULED_RULE] Successfully updated rule_id={rule_id}")
        return {"message": "updated"}
    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"[UPDATE_SCHEDULED_RULE] Error: {e}")
        # #region agent log
        try:
            requests.post(
                "http://127.0.0.1:7242/ingest/b79dabf1-b019-4647-a912-96914bd03449",
                json={
                    "sessionId": "7926b3",
                    "location": "routes.py:update_scheduled_rule",
                    "message": "scheduled_rule_update_error",
                    "hypothesisId": "H_scheduled_update_payload",
                    "data": {"error": str(e)[:400]},
                    "timestamp": int(time.time() * 1000),
                },
                timeout=2,
            )
        except Exception:
            pass
        # #endregion
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        cursor.close()
        conn.close()


@router.delete("/scheduled-rules/{rule_id}")
def delete_scheduled_rule(rule_id: int, current_user: str = Depends(get_current_user)):
    conn = get_mysql()
    cursor = conn.cursor()
    try:
        cursor.execute("DELETE FROM scheduled_rules WHERE id=%s", (rule_id,))
        if cursor.rowcount == 0:
            raise HTTPException(status_code=404, detail="Scheduled rule not found")
        conn.commit()
        return {"message": "deleted"}
    except HTTPException:
        raise
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        cursor.close()
        conn.close()


# ===================== DEVICE PROFILES =====================

class DeviceProfileCreate(BaseModel):
    ten_profile: Optional[str] = None
    device_id: Optional[str] = None
    device_type: Optional[str] = None
    config: dict


class DeviceProfileUpdate(BaseModel):
    ten_profile: Optional[str] = None
    device_id: Optional[str] = None
    device_type: Optional[str] = None
    config: Optional[dict] = None


@router.get("/device-profiles")
def list_device_profiles(device_id: Optional[str] = None, current_user: str = Depends(get_current_user)):
    conn = get_mysql()
    cursor = conn.cursor(dictionary=True)
    try:
        query = "SELECT * FROM device_profiles"
        params = []
        if device_id:
            query += " WHERE device_id = %s"
            params.append(device_id)
        query += " ORDER BY id ASC"
        cursor.execute(query, params)
        rows = cursor.fetchall()
        for r in rows:
            if r.get("ngay_tao"):
                r["ngay_tao"] = r["ngay_tao"].isoformat()
        return {"profiles": rows}
    finally:
        cursor.close()
        conn.close()


@router.post("/device-profiles")
def create_device_profile(body: DeviceProfileCreate, current_user: str = Depends(get_current_user)):
    conn = get_mysql()
    cursor = conn.cursor()
    try:
        cursor.execute(
            """
            INSERT INTO device_profiles (ten_profile, device_id, device_type, config)
            VALUES (%s, %s, %s, %s)
            """,
            (body.ten_profile, body.device_id, body.device_type, json.dumps(body.config)),
        )
        rid = cursor.lastrowid
        conn.commit()
        return {"message": "created", "id": rid}
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        cursor.close()
        conn.close()


@router.put("/device-profiles/{profile_id}")
def update_device_profile(profile_id: int, body: DeviceProfileUpdate, current_user: str = Depends(get_current_user)):
    fields, values = [], []
    if body.ten_profile is not None:
        fields.append("ten_profile=%s")
        values.append(body.ten_profile)
    if body.device_id is not None:
        fields.append("device_id=%s")
        values.append(body.device_id)
    if body.device_type is not None:
        fields.append("device_type=%s")
        values.append(body.device_type)
    if body.config is not None:
        fields.append("config=%s")
        values.append(json.dumps(body.config))
    if not fields:
        raise HTTPException(status_code=400, detail="No fields to update")
    values.append(profile_id)
    conn = get_mysql()
    cursor = conn.cursor()
    try:
        cursor.execute(f"UPDATE device_profiles SET {', '.join(fields)} WHERE id=%s", tuple(values))
        if cursor.rowcount == 0:
            raise HTTPException(status_code=404, detail="Profile not found")
        conn.commit()
        return {"message": "updated"}
    except HTTPException:
        raise
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        cursor.close()
        conn.close()


@router.delete("/device-profiles/{profile_id}")
def delete_device_profile(profile_id: int, current_user: str = Depends(get_current_user)):
    conn = get_mysql()
    cursor = conn.cursor()
    try:
        cursor.execute("DELETE FROM device_profiles WHERE id=%s", (profile_id,))
        if cursor.rowcount == 0:
            raise HTTPException(status_code=404, detail="Profile not found")
        conn.commit()
        return {"message": "deleted"}
    except HTTPException:
        raise
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        cursor.close()
        conn.close()


# ===================== USER MANAGEMENT =====================

@router.get("/users")
def list_users(current_user: str = Depends(get_current_user)):
    """List users based on role."""
    conn = get_mysql()
    cursor = conn.cursor(dictionary=True)
    try:
        cursor.execute("SELECT id, vai_tro FROM nguoi_dung WHERE email = %s", (current_user,))
        actor = cursor.fetchone()
        if not actor: raise HTTPException(status_code=401)
        
        base_query = """
            SELECT u.id, u.ten, u.email, u.vai_tro, u.ngay_tao, u.lop_hoc_id, l.ten_lop 
            FROM nguoi_dung u
            LEFT JOIN lop_hoc l ON u.lop_hoc_id = l.id
        """
        
        if actor["vai_tro"] == "admin":
            cursor.execute(base_query + " ORDER BY u.id")
        elif actor["vai_tro"] == "teacher":
            cursor.execute("SELECT id FROM lop_hoc WHERE giao_vien_id = %s", (actor["id"],))
            classes = cursor.fetchall()
            class_ids = [c["id"] for c in classes]
            if class_ids:
                format_strings = ','.join(['%s'] * len(class_ids))
                query = base_query + f" WHERE u.id = %s OR u.lop_hoc_id IN ({format_strings}) ORDER BY u.id"
                params = [actor["id"]] + class_ids
                cursor.execute(query, tuple(params))
            else:
                cursor.execute(base_query + " WHERE u.id = %s ORDER BY u.id", (actor["id"],))
        else:
            cursor.execute(base_query + " WHERE u.id = %s ORDER BY u.id", (actor["id"],))
            
        users = cursor.fetchall()
        # Format datetime for JSON
        for user in users:
            if user.get("ngay_tao"):
                user["ngay_tao"] = user["ngay_tao"].isoformat()
        return {"users": users}
    finally:
        cursor.close()
        conn.close()


@router.get("/users/{user_id}")
def get_user(user_id: int, current_user: str = Depends(get_current_user)):
    """Get a specific user's details."""
    conn = get_mysql()
    cursor = conn.cursor(dictionary=True)
    try:
        cursor.execute("""
            SELECT id, ten, email, vai_tro, ngay_tao 
            FROM nguoi_dung 
            WHERE id = %s
        """, (user_id,))
        user = cursor.fetchone()
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        if user.get("ngay_tao"):
            user["ngay_tao"] = user["ngay_tao"].isoformat()
        return user
    finally:
        cursor.close()
        conn.close()


@router.post("/users")
def create_user(body: UserCreate, current_user: str = Depends(get_current_user)):
    """Create a new user. Admin or Teacher."""
    from auth import pwd_context

    conn = get_mysql()
    cursor = conn.cursor(dictionary=True)
    try:
        # Kiểm tra quyền
        cursor.execute("SELECT id, vai_tro FROM nguoi_dung WHERE email = %s", (current_user,))
        requester = cursor.fetchone()
        if not requester or requester["vai_tro"] not in ("admin", "teacher"):
            raise HTTPException(status_code=403, detail="Only admin or teacher can create users")

        if body.vai_tro not in ("admin", "teacher", "student"):
            raise HTTPException(status_code=400, detail="vai_tro must be 'admin', 'teacher', or 'student'")
            
        if requester["vai_tro"] == "teacher" and body.vai_tro != "student":
            raise HTTPException(status_code=403, detail="Teacher can only create students")
        
        # If teacher, they must assign student to their class
        if requester["vai_tro"] == "teacher":
            cursor.execute("SELECT id FROM lop_hoc WHERE giao_vien_id = %s AND id = %s", (requester["id"], body.lop_hoc_id))
            if not cursor.fetchone() and body.lop_hoc_id is not None:
                raise HTTPException(status_code=403, detail="Teacher can only assign to their own class")

        # Check if email already exists
        cursor.execute("SELECT id FROM nguoi_dung WHERE email = %s", (body.email,))
        if cursor.fetchone():
            raise HTTPException(status_code=400, detail="Email already exists")
        
        # Hash password
        password_hash = pwd_context.hash(body.password)
        
        cursor.execute("""
            INSERT INTO nguoi_dung (ten, email, mat_khau_hash, vai_tro, lop_hoc_id)
            VALUES (%s, %s, %s, %s, %s)
        """, (body.ten, body.email, password_hash, body.vai_tro, body.lop_hoc_id))
        
        conn.commit()
        return {"message": "User created", "user_id": cursor.lastrowid}
    except HTTPException:
        raise
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=f"Create user failed: {e}")
    finally:
        cursor.close()
        conn.close()


@router.put("/users/{user_id}")
def update_user(user_id: int, body: UserUpdate, current_user: str = Depends(get_current_user)):
    """Update user details. Password is optional."""
    from auth import pwd_context
    
    conn = get_mysql()
    cursor = conn.cursor()
    try:
        # Check if user exists
        cursor.execute("SELECT id FROM nguoi_dung WHERE id = %s", (user_id,))
        if not cursor.fetchone():
            raise HTTPException(status_code=404, detail="User not found")
        
        fields = []
        values = []
        
        if body.ten is not None:
            fields.append("ten = %s")
            values.append(body.ten)
        if body.email is not None:
            # Check if new email already exists for another user
            cursor.execute("SELECT id FROM nguoi_dung WHERE email = %s AND id != %s", (body.email, user_id))
            if cursor.fetchone():
                raise HTTPException(status_code=400, detail="Email already exists")
            fields.append("email = %s")
            values.append(body.email)
        if body.vai_tro is not None:
            if body.vai_tro not in ("admin", "teacher", "student"):
                raise HTTPException(status_code=400, detail="vai_tro must be 'admin', 'teacher', or 'student'")
            fields.append("vai_tro = %s")
            values.append(body.vai_tro)
        if body.lop_hoc_id is not None:
            fields.append("lop_hoc_id = %s")
            values.append(body.lop_hoc_id)
        if body.password is not None and body.password.strip():
            password_hash = pwd_context.hash(body.password)
            fields.append("mat_khau_hash = %s")
            values.append(password_hash)
        
        if not fields:
            raise HTTPException(status_code=400, detail="No fields to update")
        
        values.append(user_id)
        cursor.execute(f"UPDATE nguoi_dung SET {', '.join(fields)} WHERE id = %s", tuple(values))
        conn.commit()
        return {"message": "User updated"}
    except HTTPException:
        raise
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=f"Update user failed: {e}")
    finally:
        cursor.close()
        conn.close()


@router.delete("/users/{user_id}")
def delete_user(user_id: int, current_user: str = Depends(get_current_user)):
    """Delete a user. Cannot delete yourself."""
    conn = get_mysql()
    cursor = conn.cursor(dictionary=True)
    try:
        # Get current user's ID
        cursor.execute("SELECT id FROM nguoi_dung WHERE email = %s", (current_user,))
        current = cursor.fetchone()
        if current and current["id"] == user_id:
            raise HTTPException(status_code=400, detail="Cannot delete yourself")
        
        # Check if user exists
        cursor.execute("SELECT id, ten FROM nguoi_dung WHERE id = %s", (user_id,))
        user = cursor.fetchone()
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        
        cursor.execute("DELETE FROM nguoi_dung WHERE id = %s", (user_id,))
        conn.commit()
        return {"message": f"User '{user['ten']}' deleted"}
    except HTTPException:
        raise
    except Exception as e:
        conn.rollback()
    finally:
        cursor.close()
        conn.close()

# ===================== CLASS MANAGEMENT =====================

@router.get("/classes")
def list_classes(current_user: str = Depends(get_current_user)):
    conn = get_mysql()
    cursor = conn.cursor(dictionary=True)
    try:
        cursor.execute("SELECT id, vai_tro FROM nguoi_dung WHERE email = %s", (current_user,))
        user = cursor.fetchone()
        if not user:
            raise HTTPException(status_code=401)
            
        base_query = """
            SELECT l.id, l.ten_lop, l.giao_vien_id, l.ngay_tao, n.ten as giao_vien_ten,
                   (SELECT COUNT(*) FROM nguoi_dung u WHERE u.lop_hoc_id = l.id) as so_luong_sv
            FROM lop_hoc l
            LEFT JOIN nguoi_dung n ON l.giao_vien_id = n.id
        """
        if user["vai_tro"] == "admin":
            cursor.execute(base_query + " ORDER BY l.id")
        elif user["vai_tro"] == "teacher":
            cursor.execute(base_query + " WHERE l.giao_vien_id = %s ORDER BY l.id", (user["id"],))
        else:
            cursor.execute(base_query + " WHERE l.id = (SELECT lop_hoc_id FROM nguoi_dung WHERE id = %s)", (user["id"],))
            
        classes = cursor.fetchall()
        for c in classes:
            if c.get("ngay_tao"):
                c["ngay_tao"] = c["ngay_tao"].isoformat()
        return {"classes": classes}
    finally:
        cursor.close()
        conn.close()

@router.post("/classes")
def create_class(body: ClassCreate, current_user: str = Depends(get_current_user)):
    conn = get_mysql()
    cursor = conn.cursor()
    try:
        cursor.execute("SELECT id, vai_tro FROM nguoi_dung WHERE email = %s", (current_user,))
        requester = cursor.fetchone()
        if not requester or requester[1] not in ("admin", "teacher"):
            raise HTTPException(status_code=403, detail="Only admin or teacher can create classes")
            
        giao_vien_id = requester[0]
        if requester[1] == "admin" and body.giao_vien_id is not None:
            giao_vien_id = body.giao_vien_id
            
        cursor.execute("INSERT INTO lop_hoc (ten_lop, giao_vien_id) VALUES (%s, %s)", (body.ten_lop, giao_vien_id))
        conn.commit()
        return {"message": "Class created", "class_id": cursor.lastrowid}
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        cursor.close()
        conn.close()

@router.delete("/classes/{class_id}")
def delete_class(class_id: int, current_user: str = Depends(get_current_user)):
    conn = get_mysql()
    cursor = conn.cursor()
    try:
        cursor.execute("SELECT id, vai_tro FROM nguoi_dung WHERE email = %s", (current_user,))
        requester = cursor.fetchone()
        if not requester or requester[1] not in ("admin", "teacher"):
            raise HTTPException(status_code=403)
            
        if requester[1] == "teacher":
            cursor.execute("SELECT id FROM lop_hoc WHERE id = %s AND giao_vien_id = %s", (class_id, requester[0]))
            if not cursor.fetchone():
                raise HTTPException(status_code=403, detail="Not allowed to delete this class")
                
        cursor.execute("DELETE FROM lop_hoc WHERE id = %s", (class_id,))
        conn.commit()
        return {"message": "Deleted"}
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        cursor.close()
        conn.close()


# ========================================
# USER PERMISSION ENDPOINTS
# ========================================

@router.get("/users/{user_id}/permissions")
def get_user_permissions(user_id: int, current_user: str = Depends(get_current_user)):
    """Get list of pages a user can access."""
    conn = get_mysql()
    cursor = conn.cursor(dictionary=True)
    try:
        # Check if user exists
        cursor.execute("SELECT id, vai_tro FROM nguoi_dung WHERE id = %s", (user_id,))
        user = cursor.fetchone()
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        
        # Admin has all permissions
        if user["vai_tro"] == "admin":
            return {"user_id": user_id, "pages": ["*"], "is_admin": True}
        
        # Get permissions from quyen_trang table
        cursor.execute(
            "SELECT trang FROM quyen_trang WHERE nguoi_dung_id = %s",
            (user_id,)
        )
        pages = [row["trang"] for row in cursor.fetchall()]
        return {"user_id": user_id, "pages": pages, "is_admin": False}
    finally:
        cursor.close()
        conn.close()


@router.put("/users/{user_id}/permissions")
def update_user_permissions(user_id: int, body: PermissionUpdate, current_user: str = Depends(get_current_user)):
    """Update pages a user can access. Admin only."""
    conn = get_mysql()
    cursor = conn.cursor(dictionary=True)
    try:
        # Check current user is admin
        cursor.execute("SELECT vai_tro FROM nguoi_dung WHERE email = %s", (current_user,))
        requester = cursor.fetchone()
        if not requester or requester["vai_tro"] != "admin":
            raise HTTPException(status_code=403, detail="Only admin can update permissions")
        
        # Check target user exists and is not admin
        cursor.execute("SELECT vai_tro FROM nguoi_dung WHERE id = %s", (user_id,))
        target = cursor.fetchone()
        if not target:
            raise HTTPException(status_code=404, detail="User not found")
        if target["vai_tro"] == "admin":
            raise HTTPException(status_code=400, detail="Cannot set permissions for admin users")
        
        # Delete existing permissions
        cursor.execute("DELETE FROM quyen_trang WHERE nguoi_dung_id = %s", (user_id,))
        
        # Insert new permissions
        for page in body.pages:
            cursor.execute(
                "INSERT INTO quyen_trang (nguoi_dung_id, trang) VALUES (%s, %s)",
                (user_id, page)
            )
        
        conn.commit()
        return {"message": "Permissions updated", "user_id": user_id, "pages": body.pages}
    except HTTPException:
        raise
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=f"Update permissions failed: {e}")
    finally:
        cursor.close()
        conn.close()



# ========================================
# CUSTOM DASHBOARDS ENDPOINTS
# ========================================

def get_user_id_from_email(email: str) -> int:
    """Helper function to get user ID from email."""
    conn = get_mysql()
    cursor = conn.cursor()
    try:
        cursor.execute("SELECT id FROM nguoi_dung WHERE email = %s", (email,))
        result = cursor.fetchone()
        if not result:
            raise HTTPException(status_code=404, detail="User not found")
        return result[0]
    finally:
        cursor.close()
        conn.close()


def check_dashboard_permission(dashboard_id: int, user_id: int, required_permission: str = "view") -> bool:
    """
    Check if user has permission to access dashboard.
    Returns True if user is owner, has explicit permission, or is admin.
    """
    conn = get_mysql()
    cursor = conn.cursor(dictionary=True)
    try:
        # Check if user is admin
        cursor.execute("SELECT vai_tro FROM nguoi_dung WHERE id = %s", (user_id,))
        user = cursor.fetchone()
        if user and user["vai_tro"] == "admin":
            return True
        
        # Check if user is owner
        cursor.execute("SELECT nguoi_tao_id FROM custom_dashboards WHERE id = %s", (dashboard_id,))
        dashboard = cursor.fetchone()
        if dashboard and dashboard["nguoi_tao_id"] == user_id:
            return True
        
        # Check explicit permissions
        permission_map = {"view": ["view", "edit", "owner"], "edit": ["edit", "owner"]}
        allowed_perms = permission_map.get(required_permission, ["view", "edit", "owner"])
        
        cursor.execute(
            "SELECT quyen FROM dashboard_permissions WHERE dashboard_id = %s AND nguoi_dung_id = %s",
            (dashboard_id, user_id)
        )
        perm = cursor.fetchone()
        if perm and perm["quyen"] in allowed_perms:
            return True
        
        return False
    finally:
        cursor.close()
        conn.close()


@router.get("/dashboards")
def list_dashboards(current_user: str = Depends(get_current_user)):
    """
    Lấy danh sách tất cả dashboards mà user có quyền xem.
    """
    user_id = get_user_id_from_email(current_user)
    conn = get_mysql()
    cursor = conn.cursor(dictionary=True)
    try:
        # Get dashboards where user is owner, has permission, or is admin
        cursor.execute("""
            SELECT DISTINCT d.id, d.ten_dashboard, d.mo_ta, d.icon, d.mau_sac,
                   d.nguoi_tao_id, u.ten as nguoi_tao_ten,
                   d.ngay_tao, d.ngay_cap_nhat, d.trang_thai
            FROM custom_dashboards d
            LEFT JOIN nguoi_dung u ON d.nguoi_tao_id = u.id
            LEFT JOIN dashboard_permissions p ON d.id = p.dashboard_id
            WHERE d.trang_thai = 'active'
              AND (
                  d.nguoi_tao_id = %s
                  OR p.nguoi_dung_id = %s
                  OR EXISTS (SELECT 1 FROM nguoi_dung WHERE id = %s AND vai_tro = 'admin')
              )
            ORDER BY d.ngay_cap_nhat DESC
        """, (user_id, user_id, user_id))
        
        dashboards = cursor.fetchall()
        
        # Convert datetime to ISO format
        for dashboard in dashboards:
            if dashboard.get("ngay_tao"):
                dashboard["ngay_tao"] = dashboard["ngay_tao"].isoformat()
            if dashboard.get("ngay_cap_nhat"):
                dashboard["ngay_cap_nhat"] = dashboard["ngay_cap_nhat"].isoformat()
        return {"dashboards": dashboards, "count": len(dashboards)}
    finally:
        cursor.close()
        conn.close()


@router.post("/dashboards")
def create_dashboard(
    request: DashboardCreateRequest,
    current_user: str = Depends(get_current_user)
):
    """
    Tạo dashboard mới.
    """
    user_id = get_user_id_from_email(current_user)
    conn = get_mysql()
    cursor = conn.cursor(dictionary=True)
    try:
        # Insert dashboard
        cursor.execute("""
            INSERT INTO custom_dashboards (ten_dashboard, mo_ta, icon, mau_sac, nguoi_tao_id)
            VALUES (%s, %s, %s, %s, %s)
        """, (
            request.ten_dashboard,
            request.mo_ta,
            request.icon or "dashboard",
            request.mau_sac or "#22d3ee",
            user_id
        ))
        
        dashboard_id = cursor.lastrowid
        
        # Create owner permission
        cursor.execute("""
            INSERT INTO dashboard_permissions (dashboard_id, nguoi_dung_id, quyen)
            VALUES (%s, %s, 'owner')
        """, (dashboard_id, user_id))
        
        # Create widgets if provided
        if request.widgets:
            for idx, widget_data in enumerate(request.widgets):
                # Ensure widget_data is a dict, not tuple
                if isinstance(widget_data, tuple):
                    # Convert tuple to dict if needed
                    widget_data = dict(widget_data) if len(widget_data) > 0 else {}
                elif not isinstance(widget_data, dict):
                    # If it's not a dict, try to convert or skip
                    continue
                
                cursor.execute("""
                    INSERT INTO dashboard_widgets 
                    (dashboard_id, widget_type, ten_widget, vi_tri_x, vi_tri_y, 
                     chieu_rong, chieu_cao, cau_hinh, thu_tu)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                """, (
                    dashboard_id,
                    widget_data.get("widget_type", "line_chart") if isinstance(widget_data, dict) else "line_chart",
                    widget_data.get("ten_widget") if isinstance(widget_data, dict) else None,
                    widget_data.get("vi_tri_x", 0) if isinstance(widget_data, dict) else 0,
                    widget_data.get("vi_tri_y", 0) if isinstance(widget_data, dict) else 0,
                    widget_data.get("chieu_rong", 4) if isinstance(widget_data, dict) else 4,
                    widget_data.get("chieu_cao", 3) if isinstance(widget_data, dict) else 3,
                    json.dumps(widget_data.get("cau_hinh", {})) if isinstance(widget_data, dict) else json.dumps({}),
                    widget_data.get("thu_tu", idx) if isinstance(widget_data, dict) else idx
                ))
        
        conn.commit()
        
        # Return created dashboard
        cursor.execute("""
            SELECT d.id, d.ten_dashboard, d.mo_ta, d.icon, d.mau_sac,
                   d.nguoi_tao_id, u.ten as nguoi_tao_ten,
                   d.ngay_tao, d.ngay_cap_nhat, d.trang_thai
            FROM custom_dashboards d
            LEFT JOIN nguoi_dung u ON d.nguoi_tao_id = u.id
            WHERE d.id = %s
        """, (dashboard_id,))
        
        dashboard = cursor.fetchone()
        if dashboard:
            if dashboard.get("ngay_tao"):
                dashboard["ngay_tao"] = dashboard["ngay_tao"].isoformat()
            if dashboard.get("ngay_cap_nhat"):
                dashboard["ngay_cap_nhat"] = dashboard["ngay_cap_nhat"].isoformat()
        
        return {"message": "Dashboard created successfully", "dashboard": dashboard}
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to create dashboard: {str(e)}")
    finally:
        cursor.close()
        conn.close()


@router.get("/dashboards/{dashboard_id}")
def get_dashboard(
    dashboard_id: int,
    current_user: str = Depends(get_current_user)
):
    """
    Lấy thông tin dashboard và tất cả widgets.
    """
    user_id = get_user_id_from_email(current_user)
    
    if not check_dashboard_permission(dashboard_id, user_id, "view"):
        raise HTTPException(status_code=403, detail="You don't have permission to view this dashboard")
    
    conn = get_mysql()
    cursor = conn.cursor(dictionary=True)
    try:
        # Get dashboard info
        cursor.execute("""
            SELECT d.id, d.ten_dashboard, d.mo_ta, d.icon, d.mau_sac,
                   d.nguoi_tao_id, u.ten as nguoi_tao_ten,
                   d.ngay_tao, d.ngay_cap_nhat, d.trang_thai
            FROM custom_dashboards d
            LEFT JOIN nguoi_dung u ON d.nguoi_tao_id = u.id
            WHERE d.id = %s
        """, (dashboard_id,))
        
        dashboard = cursor.fetchone()
        if not dashboard:
            raise HTTPException(status_code=404, detail="Dashboard not found")
        
        # Get widgets
        cursor.execute("""
            SELECT id, widget_type, ten_widget, vi_tri_x, vi_tri_y,
                   chieu_rong, chieu_cao, cau_hinh, thu_tu, ngay_tao
            FROM dashboard_widgets
            WHERE dashboard_id = %s
            ORDER BY thu_tu ASC, id ASC
        """, (dashboard_id,))
        
        widgets = cursor.fetchall()
        
        # Parse JSON config and format dates
        for widget in widgets:
            if widget.get("cau_hinh"):
                try:
                    widget["cau_hinh"] = json.loads(widget["cau_hinh"]) if isinstance(widget["cau_hinh"], str) else widget["cau_hinh"]
                except:
                    widget["cau_hinh"] = {}
            if widget.get("ngay_tao"):
                widget["ngay_tao"] = widget["ngay_tao"].isoformat()
        
        if dashboard.get("ngay_tao"):
            dashboard["ngay_tao"] = dashboard["ngay_tao"].isoformat()
        if dashboard.get("ngay_cap_nhat"):
            dashboard["ngay_cap_nhat"] = dashboard["ngay_cap_nhat"].isoformat()
        
        dashboard["widgets"] = widgets
        
        return dashboard
    finally:
        cursor.close()
        conn.close()


@router.put("/dashboards/{dashboard_id}")
def update_dashboard(
    dashboard_id: int,
    request: DashboardUpdateRequest,
    current_user: str = Depends(get_current_user)
):
    """
    Cập nhật thông tin dashboard.
    """
    user_id = get_user_id_from_email(current_user)
    
    if not check_dashboard_permission(dashboard_id, user_id, "edit"):
        raise HTTPException(status_code=403, detail="You don't have permission to edit this dashboard")
    
    conn = get_mysql()
    cursor = conn.cursor()
    try:
        # Build update query dynamically
        updates = []
        params = []
        
        if request.ten_dashboard is not None:
            updates.append("ten_dashboard = %s")
            params.append(request.ten_dashboard)
        if request.mo_ta is not None:
            updates.append("mo_ta = %s")
            params.append(request.mo_ta)
        if request.icon is not None:
            updates.append("icon = %s")
            params.append(request.icon)
        if request.mau_sac is not None:
            updates.append("mau_sac = %s")
            params.append(request.mau_sac)
        if request.trang_thai is not None:
            updates.append("trang_thai = %s")
            params.append(request.trang_thai)
        
        if not updates:
            raise HTTPException(status_code=400, detail="No fields to update")
        
        params.append(dashboard_id)
        
        cursor.execute(f"""
            UPDATE custom_dashboards
            SET {', '.join(updates)}
            WHERE id = %s
        """, params)
        
        conn.commit()
        
        return {"message": "Dashboard updated successfully"}
    except HTTPException:
        raise
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to update dashboard: {str(e)}")
    finally:
        cursor.close()
        conn.close()


@router.delete("/dashboards/{dashboard_id}")
def delete_dashboard(
    dashboard_id: int,
    current_user: str = Depends(get_current_user)
):
    """
    Xóa dashboard (chỉ owner hoặc admin).
    """
    user_id = get_user_id_from_email(current_user)
    
    conn = get_mysql()
    cursor = conn.cursor()
    try:
        # Check if user is owner or admin
        cursor.execute("""
            SELECT d.nguoi_tao_id, u.vai_tro
            FROM custom_dashboards d
            LEFT JOIN nguoi_dung u ON u.id = %s
            WHERE d.id = %s
        """, (user_id, dashboard_id))
        
        result = cursor.fetchone()
        if not result:
            raise HTTPException(status_code=404, detail="Dashboard not found")
        
        is_owner = result[0] == user_id
        is_admin = result[1] == "admin"
        
        if not (is_owner or is_admin):
            raise HTTPException(status_code=403, detail="You don't have permission to delete this dashboard")
        
        # Delete dashboard (CASCADE will delete widgets and permissions)
        cursor.execute("DELETE FROM custom_dashboards WHERE id = %s", (dashboard_id,))
        conn.commit()
        
        return {"message": "Dashboard deleted successfully"}
    except HTTPException:
        raise
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to delete dashboard: {str(e)}")
    finally:
        cursor.close()
        conn.close()


# ========================================
# DASHBOARD WIDGETS ENDPOINTS
# ========================================

@router.post("/dashboards/{dashboard_id}/widgets")
def create_widget(
    dashboard_id: int,
    request: WidgetCreateRequest,
    current_user: str = Depends(get_current_user)
):
    """
    Thêm widget vào dashboard.
    """
    user_id = get_user_id_from_email(current_user)
    
    if not check_dashboard_permission(dashboard_id, user_id, "edit"):
        raise HTTPException(status_code=403, detail="You don't have permission to edit this dashboard")
    
    conn = get_mysql()
    cursor = conn.cursor(dictionary=True)
    try:
        cursor.execute("""
            INSERT INTO dashboard_widgets 
            (dashboard_id, widget_type, ten_widget, vi_tri_x, vi_tri_y, 
             chieu_rong, chieu_cao, cau_hinh, thu_tu)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
        """, (
            dashboard_id,
            request.widget_type,
            request.ten_widget,
            request.vi_tri_x,
            request.vi_tri_y,
            request.chieu_rong,
            request.chieu_cao,
            json.dumps(request.cau_hinh),
            request.thu_tu
        ))
        
        widget_id = cursor.lastrowid
        conn.commit()
        
        # Return created widget
        cursor.execute("""
            SELECT id, dashboard_id, widget_type, ten_widget, vi_tri_x, vi_tri_y,
                   chieu_rong, chieu_cao, cau_hinh, thu_tu, ngay_tao
            FROM dashboard_widgets
            WHERE id = %s
        """, (widget_id,))
        
        widget = cursor.fetchone()
        if widget:
            if widget.get("cau_hinh"):
                try:
                    widget["cau_hinh"] = json.loads(widget["cau_hinh"]) if isinstance(widget["cau_hinh"], str) else widget["cau_hinh"]
                except:
                    widget["cau_hinh"] = {}
            if widget.get("ngay_tao"):
                widget["ngay_tao"] = widget["ngay_tao"].isoformat()
        
        return {"message": "Widget created successfully", "widget": widget}
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to create widget: {str(e)}")
    finally:
        cursor.close()
        conn.close()


@router.put("/dashboards/{dashboard_id}/widgets/{widget_id}")
def update_widget(
    dashboard_id: int,
    widget_id: int,
    request: WidgetUpdateRequest,
    current_user: str = Depends(get_current_user)
):
    """
    Cập nhật widget.
    """
    user_id = get_user_id_from_email(current_user)
    
    if not check_dashboard_permission(dashboard_id, user_id, "edit"):
        raise HTTPException(status_code=403, detail="You don't have permission to edit this dashboard")
    
    conn = get_mysql()
    cursor = conn.cursor()
    try:
        # Verify widget belongs to dashboard
        cursor.execute("SELECT id FROM dashboard_widgets WHERE id = %s AND dashboard_id = %s", (widget_id, dashboard_id))
        if not cursor.fetchone():
            raise HTTPException(status_code=404, detail="Widget not found")
        
        # Build update query
        updates = []
        params = []
        
        if request.widget_type is not None:
            updates.append("widget_type = %s")
            params.append(request.widget_type)
        if request.ten_widget is not None:
            updates.append("ten_widget = %s")
            params.append(request.ten_widget)
        if request.vi_tri_x is not None:
            updates.append("vi_tri_x = %s")
            params.append(request.vi_tri_x)
        if request.vi_tri_y is not None:
            updates.append("vi_tri_y = %s")
            params.append(request.vi_tri_y)
        if request.chieu_rong is not None:
            updates.append("chieu_rong = %s")
            params.append(request.chieu_rong)
        if request.chieu_cao is not None:
            updates.append("chieu_cao = %s")
            params.append(request.chieu_cao)
        if request.cau_hinh is not None:
            updates.append("cau_hinh = %s")
            params.append(json.dumps(request.cau_hinh))
        if request.thu_tu is not None:
            updates.append("thu_tu = %s")
            params.append(request.thu_tu)
        
        if not updates:
            raise HTTPException(status_code=400, detail="No fields to update")
        
        params.extend([widget_id, dashboard_id])
        
        cursor.execute(f"""
            UPDATE dashboard_widgets
            SET {', '.join(updates)}
            WHERE id = %s AND dashboard_id = %s
        """, params)
        
        conn.commit()
        
        return {"message": "Widget updated successfully"}
    except HTTPException:
        raise
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to update widget: {str(e)}")
    finally:
        cursor.close()
        conn.close()


@router.delete("/dashboards/{dashboard_id}/widgets/{widget_id}")
def delete_widget(
    dashboard_id: int,
    widget_id: int,
    current_user: str = Depends(get_current_user)
):
    """
    Xóa widget.
    """
    user_id = get_user_id_from_email(current_user)
    
    if not check_dashboard_permission(dashboard_id, user_id, "edit"):
        raise HTTPException(status_code=403, detail="You don't have permission to edit this dashboard")
    
    conn = get_mysql()
    cursor = conn.cursor()
    try:
        cursor.execute("DELETE FROM dashboard_widgets WHERE id = %s AND dashboard_id = %s", (widget_id, dashboard_id))
        
        if cursor.rowcount == 0:
            raise HTTPException(status_code=404, detail="Widget not found")
        
        conn.commit()
        
        return {"message": "Widget deleted successfully"}
    except HTTPException:
        raise
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to delete widget: {str(e)}")
    finally:
        cursor.close()
        conn.close()


@router.post("/dashboards/{dashboard_id}/widgets/{widget_id}/data")
def get_widget_data(
    dashboard_id: int,
    widget_id: str,
    request: WidgetDataRequest,
    current_user: str = Depends(get_current_user)
):
    """
    Lấy dữ liệu real-time cho widget từ MySQL/MongoDB.
    Time range: "1h" = 1 giờ, "6h" = 6 giờ, "24h" = 24 giờ, "7d" = 7 ngày, "30d" = 30 ngày
    """
    import sys
    import traceback
    
    try:
        print(f"[get_widget_data] ENTRY: dashboard_id={dashboard_id}, widget_id={widget_id}", file=sys.stderr, flush=True)
        print(f"[get_widget_data] Request: time_range={getattr(request, 'time_range', 'N/A')}", file=sys.stderr, flush=True)
        print(f"[get_widget_data] Current user: {current_user}", file=sys.stderr, flush=True)
    except Exception as log_err:
        print(f"[get_widget_data] Logging error: {log_err}", file=sys.stderr, flush=True)
    
    try:
        user_id = get_user_id_from_email(current_user)
        print(f"[get_widget_data] User ID: {user_id}", file=sys.stderr, flush=True)
    except Exception as e:
        print(f"[get_widget_data] Error getting user_id: {str(e)}", file=sys.stderr, flush=True)
        print(f"[get_widget_data] Traceback: {traceback.format_exc()}", file=sys.stderr, flush=True)
        raise
    
    if not check_dashboard_permission(dashboard_id, user_id, "view"):
        raise HTTPException(status_code=403, detail="You don't have permission to view this dashboard")
    
    conn = get_mysql()
    cursor = conn.cursor(dictionary=True)
    try:
        if widget_id == "0" or str(widget_id).startswith("temp-"):
            if not request.cau_hinh:
                raise HTTPException(status_code=400, detail="cau_hinh is required for unsaved widgets")
            config = request.cau_hinh
        else:
            # Get widget config
            cursor.execute("""
                SELECT cau_hinh FROM dashboard_widgets
                WHERE id = %s AND dashboard_id = %s
            """, (int(widget_id), dashboard_id))
            
            widget = cursor.fetchone()
            if not widget:
                raise HTTPException(status_code=404, detail="Widget not found")
            
            # Parse config
            try:
                config = json.loads(widget["cau_hinh"]) if isinstance(widget["cau_hinh"], str) else widget["cau_hinh"]
            except Exception as e:
                raise HTTPException(status_code=400, detail=f"Invalid widget config: {str(e)}")
        
        device_id_str = config.get("device_id")
        data_keys = config.get("data_keys", [])
        
        if not device_id_str:
            return {"data": [], "message": "Widget not configured with device"}
        
        if not data_keys or len(data_keys) == 0:
            return {"data": [], "message": "Widget not configured with data keys"}
        
        # Get device ID from ma_thiet_bi
        cursor.execute("SELECT id FROM thiet_bi WHERE ma_thiet_bi = %s AND is_active = 1", (device_id_str,))
        device_result = cursor.fetchone()
        if not device_result:
            return {"data": [], "message": f"Device '{device_id_str}' not found or inactive"}
        
        thiet_bi_id = device_result["id"]
        
        # Calculate time range
        time_range = request.time_range or "1h"
        
        # Use start_time/end_time if provided, otherwise use time_range
        if request.start_time and request.end_time:
            start_dt = datetime.fromtimestamp(request.start_time)
            end_dt = datetime.fromtimestamp(request.end_time)
        else:
            end_dt = datetime.utcnow()
            # Parse time_range correctly
            try:
                if time_range.endswith("h"):
                    hours = int(time_range[:-1])
                    start_dt = end_dt - timedelta(hours=hours)
                elif time_range.endswith("d"):
                    days = int(time_range[:-1])
                    start_dt = end_dt - timedelta(days=days)
                else:
                    # Default to 1 hour
                    start_dt = end_dt - timedelta(hours=1)
            except ValueError as e:
                raise HTTPException(status_code=400, detail=f"Invalid time_range format: {time_range}")
        
        # Query data from MongoDB (primary) with MySQL fallback
        if len(data_keys) == 0:
            return {"data": [], "message": "No data keys specified"}
        
        try:
            import logging
            logger = logging.getLogger(__name__)
            logger.info(f"[get_widget_data] Querying data: device_id={device_id_str}, data_keys={data_keys}, start_dt={start_dt}, end_dt={end_dt}")
            
            # Try MongoDB first (Spark writes here)
            mongo = get_mongo()
            events_collection = mongo["events"]
            
            start_timestamp = start_dt.timestamp()
            end_timestamp = end_dt.timestamp()
            
            mongo_query = {
                "device_id": device_id_str,
                "timestamp": {
                    "$gte": start_timestamp,
                    "$lte": end_timestamp
                }
            }
            
            # Add filter for data keys
            mongo_query["$or"] = [{key: {"$exists": True}} for key in data_keys]
            
            cursor_mongo = events_collection.find(
                mongo_query,
                {"_id": 0, "device_id": 1, "timestamp": 1, **{key: 1 for key in data_keys}}
            ).sort("timestamp", 1).limit(10000)
            
            rows = list(cursor_mongo)
            logger.info(f"[get_widget_data] MongoDB returned {len(rows)} documents")
            
            # Fallback to MySQL if MongoDB is empty
            if len(rows) == 0:
                logger.warning(f"[get_widget_data] MongoDB empty, trying MySQL fallback")
                placeholders = ','.join(['%s'] * len(data_keys))
                query = f"""
                    SELECT d.khoa, d.gia_tri, UNIX_TIMESTAMP(d.thoi_gian) as timestamp
                    FROM du_lieu_thiet_bi d
                    JOIN thiet_bi t ON d.thiet_bi_id = t.id
                    WHERE t.ma_thiet_bi = %s
                    AND d.khoa IN ({placeholders})
                    AND d.thoi_gian >= %s
                    AND d.thoi_gian <= %s
                    ORDER BY d.thoi_gian ASC
                    LIMIT 10000
                """
                
                params = [device_id_str] + data_keys + [start_dt, end_dt]
                cursor.execute(query, params)
                mysql_rows = cursor.fetchall()
                
                logger.info(f"[get_widget_data] MySQL fallback returned {len(mysql_rows)} rows")
                
                # Convert MySQL rows to MongoDB format
                rows = []
                for row in mysql_rows:
                    khoa, gia_tri, timestamp = row["khoa"], row["gia_tri"], row["timestamp"]
                    try:
                        value = float(gia_tri)
                    except (ValueError, TypeError):
                        value = gia_tri
                    
                    existing = next((r for r in rows if r.get('timestamp') == timestamp), None)
                    if existing:
                        existing[khoa] = value
                    else:
                        rows.append({
                            'device_id': device_id_str,
                            'timestamp': timestamp,
                            khoa: value
                        })
            
        except Exception as query_err:
            import logging
            import traceback
            logger = logging.getLogger(__name__)
            error_trace = traceback.format_exc()
            logger.error(f"[get_widget_data] Query Error: {str(query_err)}")
            logger.error(f"[get_widget_data] Traceback: {error_trace}")
            raise
        finally:
            cursor.close()
            conn.close()
        
        # Format data for charts
        # Group by timestamp and create series for each data key
        data_by_time = {}
        for row in rows:
            try:
                timestamp = float(row.get("timestamp", 0))
                if timestamp == 0:
                    continue
                
                # Extract values for requested data keys
                for key in data_keys:
                    if key in row and row[key] is not None:
                        value = float(row[key])
                        
                        if timestamp not in data_by_time:
                            data_by_time[timestamp] = {"timestamp": timestamp}
                        
                        data_by_time[timestamp][key] = value
            except Exception as e:
                # Skip invalid rows
                continue
        
        # Convert to array format
        chart_data = list(data_by_time.values())
        chart_data.sort(key=lambda x: x["timestamp"])
        
        return {
            "data": chart_data,
            "device_id": device_id_str,
            "data_keys": data_keys,
            "time_range": {
                "start": start_dt.isoformat(),
                "end": end_dt.isoformat()
            },
            "count": len(chart_data)
        }
    except HTTPException:
        raise
    except Exception as e:
        import logging
        import traceback
        logger = logging.getLogger(__name__)
        error_detail = traceback.format_exc()
        logger.error(f"[get_widget_data] Top-level Error: {str(e)}")
        logger.error(f"[get_widget_data] Traceback: {error_detail}")
        raise HTTPException(status_code=500, detail=f"Failed to get widget data: {str(e)}")
    finally:
        # Close MySQL cursor/connection if still open
        try:
            cursor.close()
            conn.close()
        except:
            pass


# ===================== ALERT HISTORY =====================

@router.get("/alerts")
def list_alerts(
    limit: int = 50,
    device_id: Optional[str] = None,
    trang_thai: Optional[str] = None,
    current_user: str = Depends(get_current_user)
):
    """
    Lấy danh sách cảnh báo gần nhất từ bảng canh_bao.
    - limit: số lượng bản ghi tối đa (mặc định 50, tối đa 200)
    - device_id: lọc theo thiết bị (tùy chọn)
    - trang_thai: lọc new, acknowledged, resolved (tùy chọn)
    """
    limit = max(1, min(limit, 200))
    conn = get_mysql()
    cursor = conn.cursor(dictionary=True)
    try:
        if device_id and trang_thai:
            cursor.execute("""
                SELECT cb.id, cb.device_id, cb.rule_id, cb.loai, cb.tin_nhan, cb.muc_do,
                       cb.trang_thai, cb.thoi_gian_tao, cb.thoi_gian_giai_quyet, cb.data_context,
                       tb.ten_thiet_bi
                FROM canh_bao cb
                LEFT JOIN thiet_bi tb ON cb.device_id = tb.ma_thiet_bi
                WHERE cb.device_id = %s AND cb.trang_thai = %s
                ORDER BY cb.thoi_gian_tao DESC
                LIMIT %s
            """, (device_id, trang_thai, limit))
        elif device_id:
            cursor.execute("""
                SELECT cb.id, cb.device_id, cb.rule_id, cb.loai, cb.tin_nhan, cb.muc_do,
                       cb.trang_thai, cb.thoi_gian_tao, cb.thoi_gian_giai_quyet, cb.data_context,
                       tb.ten_thiet_bi
                FROM canh_bao cb
                LEFT JOIN thiet_bi tb ON cb.device_id = tb.ma_thiet_bi
                WHERE cb.device_id = %s
                ORDER BY cb.thoi_gian_tao DESC
                LIMIT %s
            """, (device_id, limit))
        elif trang_thai:
            cursor.execute("""
                SELECT cb.id, cb.device_id, cb.rule_id, cb.loai, cb.tin_nhan, cb.muc_do,
                       cb.trang_thai, cb.thoi_gian_tao, cb.thoi_gian_giai_quyet, cb.data_context,
                       tb.ten_thiet_bi
                FROM canh_bao cb
                LEFT JOIN thiet_bi tb ON cb.device_id = tb.ma_thiet_bi
                WHERE cb.trang_thai = %s
                ORDER BY cb.thoi_gian_tao DESC
                LIMIT %s
            """, (trang_thai, limit))
        else:
            cursor.execute("""
                SELECT cb.id, cb.device_id, cb.rule_id, cb.loai, cb.tin_nhan, cb.muc_do,
                       cb.trang_thai, cb.thoi_gian_tao, cb.thoi_gian_giai_quyet, cb.data_context,
                       tb.ten_thiet_bi
                FROM canh_bao cb
                LEFT JOIN thiet_bi tb ON cb.device_id = tb.ma_thiet_bi
                ORDER BY cb.thoi_gian_tao DESC
                LIMIT %s
            """, (limit,))
        rows = cursor.fetchall()
        for row in rows:
            if row.get("thoi_gian_tao"):
                row["thoi_gian_tao"] = row["thoi_gian_tao"].isoformat()
            if row.get("thoi_gian_giai_quyet"):
                row["thoi_gian_giai_quyet"] = row["thoi_gian_giai_quyet"].isoformat()
        return {"alerts": rows, "count": len(rows)}
    except Exception as e:
        return {"alerts": [], "count": 0, "note": f"Table not found or error: {str(e)}"}
    finally:
        cursor.close()
        conn.close()


@router.put("/alerts/{alert_id}/acknowledge")
def acknowledge_alert(
    alert_id: int,
    current_user: str = Depends(get_current_user)
):
    """Đánh dấu cảnh báo đã xác nhận (acknowledged)."""
    conn = get_mysql()
    cursor = conn.cursor()
    try:
        cursor.execute(
            "UPDATE canh_bao SET trang_thai = 'acknowledged' WHERE id = %s AND trang_thai = 'new'",
            (alert_id,)
        )
        if cursor.rowcount == 0:
            raise HTTPException(status_code=404, detail="Alert not found or already processed")
        conn.commit()
        return {"message": "Alert acknowledged"}
    except HTTPException:
        raise
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=f"Acknowledge failed: {e}")
    finally:
        cursor.close()
        conn.close()


@router.put("/alerts/{alert_id}/resolve")
def resolve_alert(
    alert_id: int,
    ghi_chu: str = "",
    current_user: str = Depends(get_current_user)
):
    """Đánh dấu cảnh báo đã được xử lý (resolved)."""
    conn = get_mysql()
    cursor = conn.cursor()
    try:
        cursor.execute(
            "UPDATE canh_bao SET trang_thai = 'resolved', thoi_gian_giai_quyet = NOW() WHERE id = %s",
            (alert_id,)
        )
        if cursor.rowcount == 0:
            raise HTTPException(status_code=404, detail="Alert not found")
        conn.commit()
        return {"message": "Alert resolved"}
    except HTTPException:
        raise
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=f"Resolve alert failed: {e}")
    finally:
        cursor.close()
        conn.close()


# ===================== CSV EXPORT =====================

@router.get("/devices/{device_id}/export-csv")
def export_device_csv(
    device_id: str,
    days: int = 7,
    current_user: str = Depends(get_current_user)
):
    """
    Xuất dữ liệu sensor của thiết bị ra định dạng CSV.
    - days: số ngày gần nhất (mặc định 7, tối đa 30)
    """
    import io
    import csv
    from fastapi.responses import StreamingResponse
    from datetime import datetime, timedelta

    days = max(1, min(days, 30))
    since = datetime.utcnow() - timedelta(days=days)

    conn = get_mysql()
    cursor = conn.cursor(dictionary=True)
    try:
        cursor.execute(
            "SELECT id FROM thiet_bi WHERE ma_thiet_bi = %s AND is_active = 1",
            (device_id,)
        )
        device = cursor.fetchone()
        if not device:
            raise HTTPException(status_code=404, detail="Device not found")

        cursor.execute("""
            SELECT khoa, gia_tri, thoi_gian
            FROM du_lieu_thiet_bi
            WHERE thiet_bi_id = %s AND thoi_gian >= %s
            ORDER BY thoi_gian ASC
            LIMIT 10000
        """, (device["id"], since))
        rows = cursor.fetchall()

        output = io.StringIO()
        writer = csv.DictWriter(output, fieldnames=["thoi_gian", "khoa", "gia_tri"])
        writer.writeheader()
        for row in rows:
            writer.writerow({
                "thoi_gian": row["thoi_gian"].isoformat() if row["thoi_gian"] else "",
                "khoa": row["khoa"],
                "gia_tri": row["gia_tri"]
            })

        output.seek(0)
        filename = f"{device_id}_{datetime.utcnow().strftime('%Y%m%d')}.csv"
        return StreamingResponse(
            iter([output.getvalue()]),
            media_type="text/csv",
            headers={"Content-Disposition": f"attachment; filename={filename}"}
        )
    finally:
        cursor.close()
        conn.close()


# ===================== AC PROXY CONTROL =====================

@router.get("/ac/status")
def get_ac_status(current_user: str = Depends(get_current_user)):
    _ = current_user
    try:
        resp = requests.get(f"{AC_CONTROL_URL}/status", timeout=8)
        resp.raise_for_status()
        data = resp.json()
        return {
            "temp": int(data.get("temp", 24)),
            "on": bool(data.get("on", False)),
            "humidity": data.get("humidity"),
            "indoorTemp": data.get("indoorTemp"),
        }
    except requests.RequestException as e:
        raise HTTPException(status_code=503, detail=f"Không kết nối được AC gateway: {e}")
    except (ValueError, TypeError) as e:
        raise HTTPException(status_code=502, detail=f"AC gateway trả dữ liệu không hợp lệ: {e}")


@router.post("/ac/control")
def control_ac(
    body: AcControlRequest,
    current_user: str = Depends(get_current_user),
):
    _ = current_user
    cmd = (body.command or "").strip().lower()
    if cmd not in {"on", "off", "up", "down"}:
        raise HTTPException(status_code=400, detail="command phải là on/off/up/down")
    try:
        resp = requests.get(f"{AC_CONTROL_URL}/{cmd}", timeout=8)
        resp.raise_for_status()
        data = resp.json()
        return {
            "temp": int(data.get("temp", 24)),
            "on": bool(data.get("on", False)),
            "humidity": data.get("humidity"),
            "indoorTemp": data.get("indoorTemp"),
        }
    except requests.RequestException as e:
        raise HTTPException(status_code=503, detail=f"Không gửi được lệnh AC: {e}")
    except (ValueError, TypeError) as e:
        raise HTTPException(status_code=502, detail=f"Phản hồi AC gateway không hợp lệ: {e}")