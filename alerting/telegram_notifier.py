# File: telegram_notifier.py

import requests
import json

with open("config.json") as f:
    config = json.load(f)

def send_telegram_alert(message):
    bot_token = config["telegram"]["bot_token"]
    chat_id = config["telegram"]["chat_id"]
    url = f"https://api.telegram.org/bot{bot_token}/sendMessage"
    payload = {
        "chat_id": chat_id,
        "text": message
    }
    try:
        r = requests.post(url, json=payload)
        if r.status_code == 200:
            print("[Telegram] Đã gửi cảnh báo")
        else:
            print("[Telegram] Gửi cảnh báo thất bại:", r.text)
    except Exception as e:
        print("[Telegram] Lỗi:", e)
