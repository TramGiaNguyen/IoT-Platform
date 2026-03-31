import os
import json
from fastapi import APIRouter, Depends, HTTPException, Header
from pydantic import BaseModel
from typing import Optional, Dict, Any
from database import get_mysql
import paho.mqtt.publish as publish
from device_config import get_topics

public_router = APIRouter()

def verify_api_key(x_api_key: str = Header(..., description="API Key của thiết bị (http_api_key) được cấp phép")):
    """Xác thực thiết bị bằng API Key."""
    if not x_api_key:
        raise HTTPException(status_code=401, detail="API Key is missing")
    
    conn = get_mysql()
    cursor = conn.cursor(dictionary=True)
    try:
        cursor.execute(
            "SELECT id, ma_thiet_bi, is_active FROM thiet_bi WHERE http_api_key = %s AND is_active = 1",
            (x_api_key,)
        )
        device = cursor.fetchone()
        if not device:
            raise HTTPException(status_code=403, detail="Invalid API Key or Device is inactive")
        return device
    finally:
        cursor.close()
        conn.close()


@public_router.post(
    "/telemetry", 
    tags=["Device Integration"], 
    summary="Gửi dữ liệu cảm biến qua HTTP",
    description="Thiết bị Edge hoặc Gateway đẩy dữ liệu JSON về server qua API này thay vì MQTT."
)
def post_telemetry(
    payload: Dict[str, Any], 
    device: dict = Depends(verify_api_key)
):
    device_id = device["ma_thiet_bi"]
    topics = get_topics(device_id)
    topic_data = topics["data"]
    
    mqtt_broker = os.getenv("MQTT_BROKER_HOST", "localhost")
    mqtt_port = int(os.getenv("MQTT_PORT", "1883"))
    mqtt_user = os.getenv("MQTT_USERNAME", "bdu_admin")
    mqtt_pass = os.getenv("MQTT_PASSWORD", "admin_secret")
    
    try:
        payload_str = json.dumps(payload)
        auth = None
        if mqtt_user and mqtt_pass:
            auth = {'username': mqtt_user, 'password': mqtt_pass}
            
        publish.single(
            topic_data,
            payload=payload_str,
            hostname=mqtt_broker,
            port=mqtt_port,
            auth=auth,
            client_id=f"http-bridge-{device_id}"
        )
        return {"status": "success", "message": "Telemetry published successfully"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to process telemetry: {str(e)}")


@public_router.get(
    "/status", 
    tags=["Read Device Status"], 
    summary="Kiểm tra trạng thái thiết bị",
    description="Ứng dụng bên thứ 3 ping lấy dữ liệu thiết bị."
)
def get_device_status(device: dict = Depends(verify_api_key)):
    conn = get_mysql()
    cursor = conn.cursor(dictionary=True)
    try:
        cursor.execute("""
            SELECT ma_thiet_bi, ten_thiet_bi, trang_thai, last_seen 
            FROM thiet_bi WHERE id = %s
        """, (device["id"],))
        info = cursor.fetchone()
        return {"data": info}
    finally:
        cursor.close()
        conn.close()


class ControlPayload(BaseModel):
    command_name: str
    params: Optional[Dict[str, Any]] = None

@public_router.post(
    "/control", 
    tags=["External Systems Control"], 
    summary="Gửi lệnh điều khiển thiết bị (Relay/ON/OFF)",
    description="Đẩy lệnh điều khiển xuống Edge Device thông qua MQTT bridge."
)
def post_control(
    payload: Dict[str, Any], 
    device: dict = Depends(verify_api_key)
):
    device_id = device["ma_thiet_bi"]
    topics = get_topics(device_id)
    topic_control = topics["control"]
    
    mqtt_broker = os.getenv("MQTT_BROKER_HOST", "localhost")
    mqtt_port = int(os.getenv("MQTT_PORT", "1883"))
    mqtt_user = os.getenv("MQTT_USERNAME", "bdu_admin")
    mqtt_pass = os.getenv("MQTT_PASSWORD", "admin_secret")
    
    try:
        payload_str = json.dumps(payload)
        auth = None
        if mqtt_user and mqtt_pass:
            auth = {'username': mqtt_user, 'password': mqtt_pass}
            
        publish.single(
            topic_control,
            payload=payload_str,
            hostname=mqtt_broker,
            port=mqtt_port,
            auth=auth,
            client_id=f"http-bridge-ctrl-{device_id}"
        )
        return {"status": "success", "message": "Command dispatched successfully", "sent_payload": payload}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to dispatch command: {str(e)}")
