# File: alert_service.py

import time
import json
from pymongo import MongoClient
from email_notifier import send_email_alert
from telegram_notifier import send_telegram_alert
from zalo_notifier import send_zalo_alert
import threading

# Load configuration
with open("config.json") as f:
    config = json.load(f)

THRESHOLD_TEMP = config["thresholds"]["temperature"]
THRESHOLD_HUMID = config["thresholds"]["humidity"]

mongo_client = MongoClient(config["mongodb_uri"])
db = mongo_client["iot"]
collection = db["events"]

def monitor():
    print("[ALERTING] Starting alert monitor...")
    last_timestamp = 0
    while True:
        event = collection.find_one(sort=[("timestamp", -1)])
        if event and event["timestamp"] != last_timestamp:
            last_timestamp = event["timestamp"]
            alert_messages = []
            if event["temperature"] > THRESHOLD_TEMP:
                alert_messages.append(f"Nhiệt độ vượt ngưỡng: {event['temperature']}°C")
            if event["humidity"] > THRESHOLD_HUMID:
                alert_messages.append(f"Độ ẩm vượt ngưỡng: {event['humidity']}%")

            if alert_messages:
                full_message = f"[ALERT] {event['device_id']} lúc {time.ctime(event['timestamp'])}:\n" + "\n".join(alert_messages)
                print(full_message)
                send_email_alert(full_message)
                send_telegram_alert(full_message)
                send_zalo_alert(full_message)
        time.sleep(10)

if __name__ == "__main__":
    monitor()