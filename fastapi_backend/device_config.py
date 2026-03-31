# fastapi_backend/device_config.py
"""
Cấu hình MQTT topic patterns, HTTP endpoints và command templates.

Thay vì hardcode trong routes.py, tất cả quy ước về topic/endpoint/command
được khai báo tại đây để dễ thay đổi theo từng loại thiết bị hoặc môi trường.

Cách tùy chỉnh:
  1. Chỉnh sửa file này trực tiếp (dành cho developer)
  2. Đặt biến môi trường để override (dành cho DevOps/deployment)
  3. Gọi API PUT /config/device/{device_id} để override từng thiết bị (runtime)
"""

import os
import json

# =============================================================================
# MQTT TOPIC PATTERNS
# Dùng {device_id} làm placeholder – sẽ được thay thế khi build topic
# =============================================================================

# Pattern mặc định (có thể override bằng env var)
MQTT_TOPIC_DATA    = os.getenv("MQTT_TOPIC_DATA",    "iot/devices/{device_id}/data")
MQTT_TOPIC_STATUS  = os.getenv("MQTT_TOPIC_STATUS",  "iot/devices/{device_id}/status")
MQTT_TOPIC_CONTROL = os.getenv("MQTT_TOPIC_CONTROL", "iot/devices/{device_id}/control")
MQTT_TOPIC_LWT     = os.getenv("MQTT_TOPIC_LWT",     "iot/devices/{device_id}/lwt")

# Prefix chung (chỉ thay đổi prefix nếu cần đổi toàn bộ cấu trúc)
MQTT_PREFIX = os.getenv("MQTT_PREFIX", "iot/devices")

def build_topic(pattern: str, device_id: str) -> str:
    """Build topic thực tế từ pattern và device_id."""
    return pattern.replace("{device_id}", device_id)


def get_topics(device_id: str) -> dict:
    """
    Trả về tất cả topic MQTT cho một thiết bị.
    
    Ví dụ với device_id='sensor-001':
    {
        "data":    "iot/devices/sensor-001/data",
        "status":  "iot/devices/sensor-001/status",
        "control": "iot/devices/sensor-001/control",
        "lwt":     "iot/devices/sensor-001/lwt"
    }
    """
    return {
        "data":    build_topic(MQTT_TOPIC_DATA,    device_id),
        "status":  build_topic(MQTT_TOPIC_STATUS,  device_id),
        "control": build_topic(MQTT_TOPIC_CONTROL, device_id),
        "lwt":     build_topic(MQTT_TOPIC_LWT,     device_id),
    }


# =============================================================================
# HTTP INGEST CONFIG
# =============================================================================

HTTP_INGEST_PATH   = os.getenv("HTTP_INGEST_PATH",   "/api/v1/ingest")
HTTP_INGEST_METHOD = os.getenv("HTTP_INGEST_METHOD", "POST")

def get_http_config(device_id: str, api_key: str, server_host: str = None) -> dict:
    """
    Trả về hướng dẫn cấu hình HTTP cho thiết bị.
    
    server_host: địa chỉ server (lấy từ env BACKEND_HOST nếu không truyền)
    """
    host = server_host or os.getenv("BACKEND_HOST", "http://localhost:8000")
    return {
        "endpoint": f"{host}{HTTP_INGEST_PATH}",
        "method": HTTP_INGEST_METHOD,
        "headers": {
            "X-API-Key": api_key,
            "Content-Type": "application/json"
        },
        "body_format": {
            "device_id": device_id,
            "data": {"key": "value"},
            "timestamp": "unix_timestamp_optional"
        },
        "example": {
            "device_id": device_id,
            "data": {"temperature": 25.5, "humidity": 60},
            "timestamp": 1710000000
        }
    }


# =============================================================================
# COMMAND TEMPLATES (điều khiển thiết bị)
# Mỗi action map tới payload JSON gửi xuống MQTT
# Có thể thêm action mới mà không cần sửa code điều khiển
# =============================================================================

DEFAULT_COMMANDS = {
    # Bật tắt cơ bản
    "on":  {"state": "ON"},
    "off": {"state": "OFF"},

    # Đèn / dimmer
    "brightness": {"state": "ON", "brightness": "{value}"},  # value: 0-100

    # Điều hòa / thermostat
    "set_temp":   {"state": "ON", "setpoint": "{value}"},    # value: nhiệt độ
    "mode_cool":  {"state": "ON", "mode": "cool"},
    "mode_heat":  {"state": "ON", "mode": "heat"},
    "mode_fan":   {"state": "ON", "mode": "fan_only"},
    "mode_auto":  {"state": "ON", "mode": "auto"},

    # Fan / quạt
    "fan_speed":  {"state": "ON", "fan_speed": "{value}"},   # value: low/medium/high/auto

    # Camera / relay / motor
    "toggle":     {"command": "toggle"},
    "open":       {"command": "open"},
    "close":      {"command": "close"},
    "lock":       {"command": "lock"},
    "unlock":     {"command": "unlock"},


    # Reset / OTA placeholder
    "reset":      {"command": "reset"},
    "ota_update": {"command": "ota_update", "url": "{value}"},
}

# Override từ env var: DEVICE_COMMANDS={"custom_action": {"cmd": "xyz"}}
_env_commands = os.getenv("DEVICE_EXTRA_COMMANDS")
if _env_commands:
    try:
        _extra = json.loads(_env_commands)
        DEFAULT_COMMANDS.update(_extra)
    except Exception:
        pass


def build_command_payload(action: str, value=None) -> dict:
    """
    Build payload điều khiển từ action name và value.
    
    Ví dụ:
        build_command_payload("on")             → {"state": "ON"}
        build_command_payload("brightness", 75) → {"state": "ON", "brightness": 75}
        build_command_payload("set_temp", 22)   → {"state": "ON", "setpoint": 22}
        build_command_payload("unknown_cmd")    → {"command": "unknown_cmd", "value": None}
    
    Returns:
        dict payload sẵn sàng gửi qua MQTT (json.dumps(payload))
    """
    action_lower = action.lower()
    template = DEFAULT_COMMANDS.get(action_lower)

    if template is None:
        # Fallback: gửi raw command
        return {"command": action_lower, "value": value}

    # Deep copy để không làm ô nhiễm template
    payload = {}
    for k, v in template.items():
        if v == "{value}":
            payload[k] = value
        else:
            payload[k] = v

    return payload


def list_commands() -> list:
    """Trả về danh sách tất cả action commands đang được hỗ trợ."""
    result = []
    for action, template in DEFAULT_COMMANDS.items():
        needs_value = any(v == "{value}" for v in template.values())
        result.append({
            "action": action,
            "needs_value": needs_value,
            "template": template,
            "description": _COMMAND_DESCRIPTIONS.get(action, "")
        })
    return result


_COMMAND_DESCRIPTIONS = {
    "on":         "Bật thiết bị",
    "off":        "Tắt thiết bị",
    "brightness": "Đặt độ sáng (0–100)",
    "set_temp":   "Đặt nhiệt độ setpoint",
    "mode_cool":  "Chế độ làm lạnh",
    "mode_heat":  "Chế độ sưởi",
    "mode_fan":   "Chế độ quạt gió",
    "mode_auto":  "Chế độ tự động",
    "fan_speed":  "Tốc độ quạt (low/medium/high/auto)",
    "toggle":     "Đảo trạng thái",
    "open":       "Mở (cửa, van, màn)",
    "close":      "Đóng (cửa, van, màn)",
    "lock":       "Khóa",
    "unlock":     "Mở khóa",
    "pump_on":    "Bật bơm nước",
    "pump_off":   "Tắt bơm nước",
    "light_on":   "Bật đèn vườn",
    "light_off":  "Tắt đèn vườn",
    "reset":      "Reset thiết bị",
    "ota_update": "Cập nhật firmware OTA (value = URL firmware)",
}
