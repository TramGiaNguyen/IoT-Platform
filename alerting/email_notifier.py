# File: email_notifier.py

import smtplib
from email.mime.text import MIMEText
import json

with open("config.json") as f:
    config = json.load(f)

SMTP_SERVER = config["email"]["server"]
SMTP_PORT = config["email"]["port"]
EMAIL_SENDER = config["email"]["sender"]
EMAIL_PASSWORD = config["email"]["password"]
EMAIL_RECEIVER = config["email"]["receiver"]

def send_email_alert(message):
    msg = MIMEText(message)
    msg["Subject"] = "[CẢNH BÁO] Nền tảng IoT BDU"
    msg["From"] = EMAIL_SENDER
    msg["To"] = EMAIL_RECEIVER

    try:
        server = smtplib.SMTP_SSL(SMTP_SERVER, SMTP_PORT)
        server.login(EMAIL_SENDER, EMAIL_PASSWORD)
        server.sendmail(EMAIL_SENDER, [EMAIL_RECEIVER], msg.as_string())
        server.quit()
        print("[Email] Đã gửi cảnh báo")
    except Exception as e:
        print("[Email] Lỗi khi gửi cảnh báo:", e)