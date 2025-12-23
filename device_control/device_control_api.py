# device_control_api.py
from fastapi import FastAPI, HTTPException, Request
from pydantic import BaseModel
from pymongo import MongoClient
import paho.mqtt.publish as publish
import os

# MQTT and MongoDB configuration
MQTT_BROKER = os.getenv("MQTT_BROKER", "mqtt")
MQTT_PORT = int(os.getenv("MQTT_PORT", 1883))
MONGO_URI = os.getenv("MONGO_URI", "mongodb://mongodb:27017")

db_client = MongoClient(MONGO_URI)
db = db_client.iot
devices_collection = db.devices

app = FastAPI(title="Device Registry & Control API")

# ------------------ Models ------------------
class Device(BaseModel):
    device_id: str
    name: str
    location: str
    type: str

class ControlCommand(BaseModel):
    device_id: str
    command: str  # e.g., "ON", "OFF", "SET_TEMPERATURE:24"

# ------------------ Routes ------------------
@app.get("/")
def root():
    return {"message": "Device Control API for BDU IoT Platform"}

@app.get("/devices")
def get_devices():
    devices = list(devices_collection.find({}, {"_id": 0}))
    return devices

@app.post("/devices")
def register_device(device: Device):
    if devices_collection.find_one({"device_id": device.device_id}):
        raise HTTPException(status_code=400, detail="Device already registered")
    devices_collection.insert_one(device.dict())
    return {"message": "Device registered successfully"}

@app.post("/control")
def control_device(cmd: ControlCommand):
    device = devices_collection.find_one({"device_id": cmd.device_id})
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")

    topic = f"iot/devices/{cmd.device_id}/control"
    publish.single(topic, payload=cmd.command, hostname=MQTT_BROKER, port=MQTT_PORT)
    return {"message": f"Command '{cmd.command}' sent to {cmd.device_id}"}
