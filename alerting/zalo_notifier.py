# File: zalo_notifier.py

import requests
import json

with open("config.json") as f:
    config = json.load(f)

def send_zalo_alert(message):
    access_token = config["zalo"]["access_token"]
    url = "https://openapi.zalo.me/v2.0/oa/message"
    payload = {
        "recipient": {"user_id": config["zalo"]["user_id"]},
        "message": {
            "text": message
        }
    }
    headers = {
        "Content-Type": "application/json",
        "access_token": access_token
    }
    try:
        r = requests.post(url, headers=headers, json=payload)
        if r.status_code == 200:
            print("[Zalo] Đã gửi cảnh báo")
        else:
            print("[Zalo] Gửi cảnh báo thất bại:", r.text)
    except Exception as e:
        print("[Zalo] Lỗi:", e)