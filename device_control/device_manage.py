# Module 5 – Device Registry & Control API (FastAPI)bao gồm:
# Đăng ký thiết bị vào MongoDB
# Gửi lệnh điều khiển qua MQTT
# Expose API thông qua FastAPI

from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List
from pymongo import MongoClient
import paho.mqtt.publish as publish
import os

# MongoDB connection
client = MongoClient("mongodb://mongodb:27017")
db = client.iot
devices_collection = db.devices

# MQTT Config
MQTT_BROKER = os.getenv("MQTT_BROKER", "mqtt")
MQTT_PORT = int(os.getenv("MQTT_PORT", 1883))

# FastAPI app
app = FastAPI(title="Device Control API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Models
class Device(BaseModel):
    device_id: str
    name: str
    location: str

class ControlCommand(BaseModel):
    device_id: str
    command: str  # e.g., "turn_on" or "turn_off"

# Endpoints
@app.post("/register")
def register_device(device: Device):
    if devices_collection.find_one({"device_id": device.device_id}):
        raise HTTPException(status_code=400, detail="Device already exists")
    devices_collection.insert_one(device.dict())
    return {"msg": "Device registered"}

@app.get("/devices", response_model=List[Device])
def list_devices():
    return list(devices_collection.find({}, {"_id": 0}))

@app.post("/control")
def control_device(cmd: ControlCommand):
    topic = f"iot/devices/{cmd.device_id}/control"
    payload = {"command": cmd.command}
    publish.single(topic, payload=str(payload), hostname=MQTT_BROKER, port=MQTT_PORT)
    return {"msg": f"Sent command to {cmd.device_id}"}
