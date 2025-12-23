# fastapi_backend/routes.py

from fastapi import APIRouter, Depends, HTTPException, Header, Request
from fastapi.security import OAuth2PasswordRequestForm
from typing import List, Optional
from pydantic import BaseModel
from datetime import datetime, timedelta
import time
import json
import secrets
import paho.mqtt.publish as publish
import paho.mqtt.client as mqtt

from auth import authenticate_user, create_access_token, get_current_user
from database import get_mongo, get_mysql
from kafka_consumer import get_latest_events
from models import (
    Token, Event,
    DashboardCreateRequest, DashboardUpdateRequest,
    WidgetCreateRequest, WidgetUpdateRequest, WidgetDataRequest
)

router = APIRouter()


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
    conditions: List[RuleCondition]
    muc_do_uu_tien: int = 1
    trang_thai: str = "enabled"
    actions: List[RuleActionCreate]


class RuleUpdate(BaseModel):
    ten_rule: Optional[str] = None
    phong_id: Optional[int] = None
    condition_device_id: Optional[str] = None
    conditions: Optional[List[RuleCondition]] = None
    muc_do_uu_tien: Optional[int] = None
    trang_thai: Optional[str] = None
    actions: Optional[List[RuleActionCreate]] = None


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


class UserCreate(BaseModel):
    ten: str
    email: str
    password: str
    vai_tro: Optional[str] = "student"  # 'admin', 'teacher', or 'student'


class UserUpdate(BaseModel):
    ten: Optional[str] = None
    email: Optional[str] = None
    vai_tro: Optional[str] = None
    password: Optional[str] = None  # Optional password reset


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


@router.get("/devices")
def list_devices(current_user: str = Depends(get_current_user)):
    """
    Lấy danh sách thiết bị đã đăng ký từ bảng thiet_bi (MySQL).
    """
    conn = get_mysql()
    cursor = conn.cursor(dictionary=True)
    try:
        cursor.execute("""
            SELECT t.id, t.ma_thiet_bi, t.ten_thiet_bi, t.loai_thiet_bi, 
                   t.trang_thai, t.last_seen, t.phong_id,
                   p.ten_phong, p.ma_phong
            FROM thiet_bi t
            LEFT JOIN phong p ON t.phong_id = p.id
            WHERE t.is_active = 1
            ORDER BY t.ngay_dang_ky DESC
        """)
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
    current_user: str = Depends(get_current_user)
):
    """
    Đăng ký thiết bị mới vào hệ thống.
    Insert vào bảng thiet_bi và khoa_du_lieu.
    """
    conn = get_mysql()
    cursor = conn.cursor()
    
    try:
        # Kiểm tra device_id đã tồn tại chưa
        cursor.execute("SELECT id FROM thiet_bi WHERE ma_thiet_bi = %s", (request.device_id,))
        if cursor.fetchone():
            raise HTTPException(status_code=400, detail="Device ID đã tồn tại")
        
        # Insert vào bảng thiet_bi
        cursor.execute("""
            INSERT INTO thiet_bi (ma_thiet_bi, ten_thiet_bi, loai_thiet_bi, phong_id, trang_thai)
            VALUES (%s, %s, %s, %s, 'offline')
        """, (request.device_id, request.ten_thiet_bi, request.loai_thiet_bi, request.phong_id))
        
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
            mqtt_config = {
                "broker": mqtt_broker_host,
                "port": 1883,
                "username": device_id,
                "password": secret_key,
                "topic_data": f"iot/devices/{device_id}/data",
                "topic_status": f"iot/devices/{device_id}/status",
                "topic_control": f"iot/devices/{device_id}/control"
            }
        
        if request.protocol in ["http", "both"]:
            http_config = {
                "endpoint": "/api/v1/ingest",
                "method": "POST",
                "headers": {
                    "X-API-Key": http_api_key,
                    "Content-Type": "application/json"
                },
                "body_format": {
                    "device_id": device_id,
                    "data": {"key": "value"},
                    "timestamp": "unix_timestamp_optional"
                }
            }
        
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
            mqtt_config = {
                "broker": "YOUR_MQTT_BROKER_IP",
                "port": 1883,
                "username": device["ma_thiet_bi"],
                "password": device["secret_key"],
                "topic_data": f"iot/devices/{device['ma_thiet_bi']}/data",
                "topic_status": f"iot/devices/{device['ma_thiet_bi']}/status"
            }
        
        if device["protocol"] in ["http", "both"] and device["http_api_key"]:
            http_config = {
                "endpoint": "/api/v1/ingest",
                "api_key": device["http_api_key"]
            }
        
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
        
        # Push to Kafka
        try:
            producer = KafkaProducer(
                bootstrap_servers="kafka:9092",
                value_serializer=lambda v: json.dumps(v).encode('utf-8')
            )
            producer.send("iot-events", value=payload)
            producer.flush()
        except Exception as kafka_err:
            # Log but don't fail - device data still validated
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
    current_user: str = Depends(get_current_user)
):
    """
    Xóa thiết bị hoàn toàn khỏi hệ thống (hard delete).
    Xóa cả dữ liệu liên quan: khoa_du_lieu, du_lieu_thiet_bi.
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
        
        # Xóa dữ liệu liên quan trước (foreign key constraints)
        cursor.execute("DELETE FROM du_lieu_thiet_bi WHERE thiet_bi_id = %s", (thiet_bi_id,))
        cursor.execute("DELETE FROM khoa_du_lieu WHERE thiet_bi_id = %s", (thiet_bi_id,))
        
        # Xóa thiết bị
        cursor.execute("DELETE FROM thiet_bi WHERE id = %s", (thiet_bi_id,))
        conn.commit()
        
        return {
            "message": f"Đã xóa hoàn toàn thiết bị {device['ten_thiet_bi'] or device['ma_thiet_bi']}",
            "device_id": device_id
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
def list_rooms(current_user: str = Depends(get_current_user)):
    """
    Lấy danh sách phòng từ bảng phong để chọn trong wizard.
    """
    conn = get_mysql()
    cursor = conn.cursor(dictionary=True)
    try:
        cursor.execute("""
            SELECT id, ten_phong, ma_phong, vi_tri, mo_ta
            FROM phong
            ORDER BY ten_phong
        """)
        rooms = cursor.fetchall()
        return {"rooms": rooms}
    finally:
        cursor.close()
        conn.close()


@router.post("/rooms")
def create_room(body: RoomCreate, current_user: str = Depends(get_current_user)):
    conn = get_mysql()
    cursor = conn.cursor()
    try:
        cursor.execute(
            """
            INSERT INTO phong (ten_phong, mo_ta, vi_tri, nguoi_quan_ly_id, ma_phong)
            VALUES (%s,%s,%s,%s,%s)
            """,
            (body.ten_phong, body.mo_ta, body.vi_tri, body.nguoi_quan_ly_id, body.ma_phong),
        )
        conn.commit()
        return {"message": "created", "id": cursor.lastrowid}
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=f"Create room failed: {e}")
    finally:
        cursor.close()
        conn.close()


@router.put("/rooms/{room_id}")
def update_room(room_id: int, body: RoomUpdate, current_user: str = Depends(get_current_user)):
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
def delete_room(room_id: int, current_user: str = Depends(get_current_user)):
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


@router.get("/devices/latest-all")
def get_devices_latest_all(current_user: str = Depends(get_current_user)):
    """
    Lấy dữ liệu mới nhất của tất cả thiết bị (1 query) để giảm số request.
    Trả về danh sách thiết bị + latest data per key.
    """
    conn = get_mysql()
    cursor = conn.cursor(dictionary=True)
    try:
        # Danh sách thiết bị
        cursor.execute(
            """
            SELECT t.id, t.ma_thiet_bi, t.ten_thiet_bi, t.loai_thiet_bi,
                   t.trang_thai, t.last_seen, t.phong_id
            FROM thiet_bi t
            WHERE t.is_active = 1
            """
        )
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
    current_user: str = Depends(get_current_user),
):
    conn = get_mysql()
    cursor = conn.cursor()
    try:
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
    # #region agent log
    try:
        import json; log_data = {"sessionId": "debug-session", "runId": "run1", "hypothesisId": "C", "location": "routes.py:1575", "message": "get_device_data_keys entry", "data": {"device_id": device_id, "user": current_user}, "timestamp": int(__import__("time").time() * 1000)}; __import__("os").makedirs(".cursor", exist_ok=True); __import__("builtins").open(".cursor/debug.log", "a").write(json.dumps(log_data) + "\n")
    except: pass
    # #endregion
    conn = get_mysql()
    cursor = conn.cursor(dictionary=True)
    try:
        # Lấy thiet_bi_id từ ma_thiet_bi
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
        
        # #region agent log
        try:
            import json; log_data = {"sessionId": "debug-session", "runId": "run1", "hypothesisId": "C", "location": "routes.py:1598", "message": "get_device_data_keys from khoa_du_lieu", "data": {"device_id": device_id, "thiet_bi_id": thiet_bi_id, "keys_count": len(keys)}, "timestamp": int(__import__("time").time() * 1000)}; __import__("os").makedirs(".cursor", exist_ok=True); __import__("builtins").open(".cursor/debug.log", "a").write(json.dumps(log_data) + "\n")
        except: pass
        # #endregion
        
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
        
        # #region agent log
        try:
            import json; log_data = {"sessionId": "debug-session", "runId": "run1", "hypothesisId": "C", "location": "routes.py:1610", "message": "get_device_data_keys success", "data": {"device_id": device_id, "keys_count": len(keys)}, "timestamp": int(__import__("time").time() * 1000)}; __import__("os").makedirs(".cursor", exist_ok=True); __import__("builtins").open(".cursor/debug.log", "a").write(json.dumps(log_data) + "\n")
        except: pass
        # #endregion
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
        # Lấy thiet_bi_id từ ma_thiet_bi
        cursor.execute("""
            SELECT id, ma_thiet_bi, ten_thiet_bi, loai_thiet_bi, 
                   trang_thai, last_seen, phong_id
            FROM thiet_bi 
            WHERE ma_thiet_bi = %s AND is_active = 1
        """, (device_id,))
        device = cursor.fetchone()
        
        if not device:
            raise HTTPException(status_code=404, detail="Device not found")
        
        thiet_bi_id = device['id']
        
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
            'ten_thiet_bi': device['ten_thiet_bi'],
            'loai_thiet_bi': device['loai_thiet_bi'],
            'trang_thai': device['trang_thai'],
            'last_seen': int(device['last_seen'].timestamp()) if device['last_seen'] else None,
            'phong_id': device['phong_id'],
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


def build_rules_from_rows(rows):
    rules = {}
    for row in rows:
        rid = row["rule_id"]
        if rid not in rules:
            rules[rid] = {
                "id": rid,
                "ten_rule": row["ten_rule"],
                "phong_id": row["phong_id"],
                "condition_device_id": row["condition_device_id"],
                "conditions": json.loads(row["conditions"]) if row.get("conditions") else [],
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
def list_rules(trang_thai: Optional[str] = None, current_user: str = Depends(get_current_user)):
    conn = get_mysql()
    cursor = conn.cursor(dictionary=True)
    try:
        query = """
            SELECT r.id as rule_id, r.ten_rule, r.phong_id, r.condition_device_id,
                   r.conditions, r.muc_do_uu_tien, r.trang_thai,
                   ra.id as action_id, ra.device_id as action_device_id,
                   ra.action_command, ra.action_params, ra.delay_seconds, ra.thu_tu
            FROM rules r
            LEFT JOIN rule_actions ra ON r.id = ra.rule_id
        """
        params = []
        if trang_thai:
            query += " WHERE r.trang_thai = %s"
            params.append(trang_thai)
        query += " ORDER BY r.muc_do_uu_tien ASC, r.id ASC, ra.thu_tu ASC"
        cursor.execute(query, params)
        rows = cursor.fetchall()
        return {"rules": build_rules_from_rows(rows)}
    finally:
        cursor.close()
        conn.close()


@router.post("/rules")
def create_rule(body: RuleCreate, current_user: str = Depends(get_current_user)):
    if not body.conditions or len(body.conditions) == 0:
        raise HTTPException(status_code=400, detail="At least one condition is required")
    for cond in body.conditions:
        if cond.operator not in ALLOWED_OPERATORS:
            raise HTTPException(status_code=400, detail="Invalid operator in conditions")

    # Lưu điều kiện đầu tiên vào các cột legacy field/operator/value để tương thích
    first_cond = body.conditions[0]
    first_field = first_cond.field
    first_operator = first_cond.operator
    first_value = first_cond.value

    conn = get_mysql()
    cursor = conn.cursor()
    try:
        cursor.execute(
            """
            INSERT INTO rules (ten_rule, phong_id, condition_device_id, field, operator, value, conditions, muc_do_uu_tien, trang_thai)
            VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s)
            """,
            (
                body.ten_rule,
                body.phong_id,
                body.condition_device_id,
                first_field,
                first_operator,
                first_value,
                json.dumps([c.dict() for c in body.conditions]),
                body.muc_do_uu_tien,
                body.trang_thai,
            ),
        )
        rule_id = cursor.lastrowid

        for act in body.actions:
            cursor.execute(
                """
                INSERT INTO rule_actions (rule_id, device_id, action_command, action_params, delay_seconds, thu_tu)
                VALUES (%s,%s,%s,%s,%s,%s)
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


@router.post("/devices/{device_id}/control")
def control_device(
    device_id: str,
    body: ControlRequest,
    current_user: str = Depends(get_current_user)
):
    """
    Gửi lệnh điều khiển thiết bị qua MQTT và lưu trạng thái vào MySQL.
    action: "on", "off", "brightness"
    value: brightness 0-100 nếu action=brightness
    """
    topic = f"iot/devices/{device_id}/control"
    payload = {}

    if body.action == "on":
        payload = {"state": "ON"}
        update_device_state_mysql(device_id, {"state": "ON"})
    elif body.action == "off":
        payload = {"state": "OFF"}
        update_device_state_mysql(device_id, {"state": "OFF"})
    elif body.action == "brightness":
        if body.value is None:
            raise HTTPException(status_code=400, detail="Missing brightness value")
        payload = {"brightness": body.value}
        update_device_state_mysql(device_id, {"brightness": body.value})
    else:
        raise HTTPException(status_code=400, detail="Invalid action")

    # Gửi lệnh MQTT (sử dụng API mới và đợi publish hoàn thành)
    try:
        print(f"[CONTROL] publish {topic} payload={payload}")
        client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2, protocol=mqtt.MQTTv311)
        client.connect("mqtt", 1883, 60)
        client.loop_start()
        msg_info = client.publish(topic, payload=json.dumps(payload), qos=1)
        msg_info.wait_for_publish(timeout=5)  # Đợi publish hoàn thành trước khi disconnect
        client.loop_stop()
        client.disconnect()
    except Exception as e:
        print(f"[CONTROL] MQTT publish error: {e}")
        raise HTTPException(status_code=500, detail="Failed to send control command")

    return {"message": "Command sent", "payload": payload}


# ===================== USER MANAGEMENT =====================

@router.get("/users")
def list_users(current_user: str = Depends(get_current_user)):
    """List all users (for admin management)."""
    conn = get_mysql()
    cursor = conn.cursor(dictionary=True)
    try:
        cursor.execute("""
            SELECT id, ten, email, vai_tro, ngay_tao 
            FROM nguoi_dung 
            ORDER BY id
        """)
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
    """Create a new user."""
    from auth import pwd_context
    
    if body.vai_tro not in ("admin", "teacher", "student"):
        raise HTTPException(status_code=400, detail="vai_tro must be 'admin', 'teacher', or 'student'")
    
    conn = get_mysql()
    cursor = conn.cursor()
    try:
        # Check if email already exists
        cursor.execute("SELECT id FROM nguoi_dung WHERE email = %s", (body.email,))
        if cursor.fetchone():
            raise HTTPException(status_code=400, detail="Email already exists")
        
        # Hash password
        password_hash = pwd_context.hash(body.password)
        
        cursor.execute("""
            INSERT INTO nguoi_dung (ten, email, mat_khau_hash, vai_tro)
            VALUES (%s, %s, %s, %s)
        """, (body.ten, body.email, password_hash, body.vai_tro))
        
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
        raise HTTPException(status_code=500, detail=f"Delete user failed: {e}")
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
# SMART GARDEN ENDPOINTS
# ========================================

class GardenControlRequest(BaseModel):
    command: str  # pump_on, pump_off, light_on, light_off, fan_on, fan_off

@router.get("/garden/latest")
def get_garden_latest(current_user: str = Depends(get_current_user)):
    """
    Lấy dữ liệu mới nhất của vườn thông minh.
    Bao gồm sensor data và AI detection results.
    """
    from pymongo import MongoClient
    
    client = MongoClient("mongodb://mongodb:27017")
    db = client.iot
    
    try:
        # Lấy sensor data mới nhất từ garden devices
        sensor_data = db.events.find_one(
            {"device_id": {"$regex": "^garden-"}},
            sort=[("timestamp", -1)]
        )
        
        # Lấy detection data mới nhất (nếu có collection riêng)
        detection_data = db.garden_detection.find_one(
            sort=[("timestamp", -1)]
        ) if "garden_detection" in db.list_collection_names() else None
        
        # Nếu không có collection riêng, tìm trong events
        if not detection_data:
            detection_data = db.events.find_one(
                {"detection": {"$exists": True}},
                sort=[("timestamp", -1)]
            )
        
        # Convert ObjectId to string
        if sensor_data and "_id" in sensor_data:
            sensor_data["_id"] = str(sensor_data["_id"])
        if detection_data and "_id" in detection_data:
            detection_data["_id"] = str(detection_data["_id"])
        
        return {
            "sensor": sensor_data.get("sensor") if sensor_data and "sensor" in sensor_data else sensor_data,
            "detection": detection_data.get("detection") if detection_data and "detection" in detection_data else detection_data,
            "timestamp": time.time()
        }
    finally:
        client.close()


@router.post("/garden/control")
def send_garden_control(
    request: GardenControlRequest,
    current_user: str = Depends(get_current_user)
):
    """
    Gửi lệnh điều khiển đến vườn thông minh qua MQTT.
    Commands: pump_on, pump_off, light_on, light_off, fan_on, fan_off
    """
    valid_commands = ["pump_on", "pump_off", "light_on", "light_off", "fan_on", "fan_off"]
    
    if request.command not in valid_commands:
        raise HTTPException(
            status_code=400, 
            detail=f"Invalid command. Valid commands: {valid_commands}"
        )
    
    try:
        # Gửi lệnh qua MQTT
        publish.single(
            topic="garden/garden-001/control",
            payload=json.dumps({
                "command": request.command,
                "timestamp": time.time(),
                "source": "platform"
            }),
            hostname="mqtt",
            port=1883
        )
        
        return {
            "status": "sent",
            "command": request.command,
            "timestamp": time.time()
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to send command: {e}")


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
    # #region agent log
    try:
        import json; log_data = {"sessionId": "debug-session", "runId": "run1", "hypothesisId": "A", "location": "routes.py:2406", "message": "list_dashboards entry", "data": {"user": current_user}, "timestamp": int(__import__("time").time() * 1000)}; __import__("os").makedirs(".cursor", exist_ok=True); __import__("builtins").open(".cursor/debug.log", "a").write(json.dumps(log_data) + "\n")
    except: pass
    # #endregion
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
        
        # #region agent log
        try:
            import json; log_data = {"sessionId": "debug-session", "runId": "run1", "hypothesisId": "A", "location": "routes.py:2431", "message": "list_dashboards success", "data": {"count": len(dashboards), "user_id": user_id}, "timestamp": int(__import__("time").time() * 1000)}; __import__("os").makedirs(".cursor", exist_ok=True); __import__("builtins").open(".cursor/debug.log", "a").write(json.dumps(log_data) + "\n")
        except: pass
        # #endregion
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
    # #region agent log
    try:
        import json; log_data = {"sessionId": "debug-session", "runId": "run1", "hypothesisId": "B", "location": "routes.py:2447", "message": "create_dashboard entry", "data": {"user": current_user, "ten_dashboard": request.ten_dashboard, "widgets_count": len(request.widgets) if request.widgets else 0}, "timestamp": int(__import__("time").time() * 1000)}; __import__("os").makedirs(".cursor", exist_ok=True); __import__("builtins").open(".cursor/debug.log", "a").write(json.dumps(log_data) + "\n")
    except: pass
    # #endregion
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
        
        # #region agent log
        try:
            import json; log_data = {"sessionId": "debug-session", "runId": "run1", "hypothesisId": "B", "location": "routes.py:2470", "message": "create_dashboard inserted", "data": {"dashboard_id": dashboard_id, "user_id": user_id}, "timestamp": int(__import__("time").time() * 1000)}; __import__("os").makedirs(".cursor", exist_ok=True); __import__("builtins").open(".cursor/debug.log", "a").write(json.dumps(log_data) + "\n")
        except: pass
        # #endregion
        
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
    # #region agent log
    try:
        import json; log_data = {"sessionId": "debug-session", "runId": "run1", "hypothesisId": "E", "location": "routes.py:2527", "message": "get_dashboard entry", "data": {"dashboard_id": dashboard_id, "user": current_user}, "timestamp": int(__import__("time").time() * 1000)}; __import__("os").makedirs(".cursor", exist_ok=True); __import__("builtins").open(".cursor/debug.log", "a").write(json.dumps(log_data) + "\n")
    except: pass
    # #endregion
    user_id = get_user_id_from_email(current_user)
    
    if not check_dashboard_permission(dashboard_id, user_id, "view"):
        # #region agent log
        try:
            import json; log_data = {"sessionId": "debug-session", "runId": "run1", "hypothesisId": "F", "location": "routes.py:2536", "message": "get_dashboard permission denied", "data": {"dashboard_id": dashboard_id, "user_id": user_id}, "timestamp": int(__import__("time").time() * 1000)}; __import__("os").makedirs(".cursor", exist_ok=True); __import__("builtins").open(".cursor/debug.log", "a").write(json.dumps(log_data) + "\n")
        except: pass
        # #endregion
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
        
        # #region agent log
        try:
            import json; log_data = {"sessionId": "debug-session", "runId": "run1", "hypothesisId": "E", "location": "routes.py:2565", "message": "get_dashboard widgets loaded", "data": {"dashboard_id": dashboard_id, "widgets_count": len(widgets)}, "timestamp": int(__import__("time").time() * 1000)}; __import__("os").makedirs(".cursor", exist_ok=True); __import__("builtins").open(".cursor/debug.log", "a").write(json.dumps(log_data) + "\n")
        except: pass
        # #endregion
        
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
    widget_id: int,
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
        # Get widget config
        cursor.execute("""
            SELECT cau_hinh FROM dashboard_widgets
            WHERE id = %s AND dashboard_id = %s
        """, (widget_id, dashboard_id))
        
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
        
        # Query data from MongoDB
        if len(data_keys) == 0:
            return {"data": [], "message": "No data keys specified"}
        
        # Close MySQL connection as we'll use MongoDB
        cursor.close()
        conn.close()
        
        # Get MongoDB connection
        mongo = get_mongo()
        collection = mongo["events"]
        
        try:
            import logging
            logger = logging.getLogger(__name__)
            logger.error(f"[get_widget_data] Querying MongoDB: device_id={device_id_str}, data_keys={data_keys}, start_dt={start_dt}, end_dt={end_dt}")
            
            # Convert datetime to timestamp for MongoDB query
            start_timestamp = start_dt.timestamp()
            end_timestamp = end_dt.timestamp()
            
            # Query MongoDB: filter by device_id, timestamp range, and ensure data_keys exist
            query = {
                "device_id": device_id_str,
                "timestamp": {
                    "$gte": start_timestamp,
                    "$lte": end_timestamp
                }
            }
            
            # Only get documents that have at least one of the requested data keys
            query["$or"] = [{key: {"$exists": True}} for key in data_keys]
            
            # Execute query and sort by timestamp ascending
            cursor_mongo = collection.find(query, {"_id": 0}).sort("timestamp", 1)
            rows = list(cursor_mongo)
            
            logger.error(f"[get_widget_data] MongoDB query returned {len(rows)} documents")
        except Exception as query_err:
            import logging
            import traceback
            logger = logging.getLogger(__name__)
            error_trace = traceback.format_exc()
            logger.error(f"[get_widget_data] MongoDB Query Error: {str(query_err)}")
            logger.error(f"[get_widget_data] Query params: device_id={device_id_str}, data_keys={data_keys}, start_dt={start_dt}, end_dt={end_dt}")
            logger.error(f"[get_widget_data] Traceback: {error_trace}")
            raise
        
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