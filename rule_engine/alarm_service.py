# rule_engine/alarm_service.py
"""
Tích hợp Alarms với rule_engine và kenh_thong_bao.
- Tạo cảnh báo khi rule kích hoạt
- Gửi thông báo qua các kênh đã cấu hình (email, telegram, zalo)
"""

import os
import json
import logging
import smtplib
from email.mime.text import MIMEText
from typing import Optional

import mysql.connector
import requests

MYSQL_CONFIG = {
    "host": os.getenv("MYSQL_HOST", "mysql"),
    "user": os.getenv("MYSQL_USER", "iot"),
    "password": os.getenv("MYSQL_PASSWORD", "iot123"),
    "database": os.getenv("MYSQL_DATABASE", "iot_data"),
}

# Credentials from env (fallback for when kenh_thong_bao has no config)
TELEGRAM_BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN", "")
ZALO_ACCESS_TOKEN = os.getenv("ZALO_ACCESS_TOKEN", "")
SMTP_SERVER = os.getenv("SMTP_SERVER", "smtp.gmail.com")
SMTP_PORT = int(os.getenv("SMTP_PORT", "465"))
SMTP_USER = os.getenv("SMTP_USER", "")
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD", "")

logger = logging.getLogger(__name__)


def get_mysql_conn():
    return mysql.connector.connect(**MYSQL_CONFIG)


def create_alarm(
    loai: str,
    tin_nhan: str,
    device_id: Optional[str] = None,
    rule_id: Optional[int] = None,
    muc_do: str = "medium",
    data_context: Optional[dict] = None,
) -> Optional[int]:
    """
    Tạo bản ghi cảnh báo trong bảng canh_bao.
    loai: device_offline, threshold_exceeded, rule_triggered, system_error, emergency
    muc_do: low, medium, high, critical
    Returns: alarm id or None
    """
    conn = get_mysql_conn()
    cursor = conn.cursor()
    try:
        cursor.execute(
            """
            INSERT INTO canh_bao (loai, device_id, rule_id, tin_nhan, muc_do, trang_thai, data_context)
            VALUES (%s, %s, %s, %s, %s, 'new', %s)
            """,
            (
                loai,
                device_id,
                rule_id,
                tin_nhan,
                muc_do,
                json.dumps(data_context) if data_context else None,
            ),
        )
        conn.commit()
        alarm_id = cursor.lastrowid
        logger.info(f"[ALARM] Created alarm id={alarm_id} loai={loai} device={device_id}")
        return alarm_id
    except Exception as e:
        logger.error(f"[ALARM] Failed to create alarm: {e}")
        conn.rollback()
        return None
    finally:
        cursor.close()
        conn.close()


def get_channels_to_notify(phong_id: Optional[int] = None) -> list:
    """
    Lấy danh sách kênh thông báo cần gửi.
    - Admin users có kenh_thong_bao
    - Nếu có phong_id: thêm nguoi_quan_ly của phòng
    """
    conn = get_mysql_conn()
    cursor = conn.cursor(dictionary=True)
    try:
        user_ids = set()
        # Admin users
        cursor.execute(
            "SELECT id FROM nguoi_dung WHERE vai_tro = 'admin'"
        )
        for row in cursor.fetchall():
            user_ids.add(row["id"])
        # Room manager if phong_id provided
        if phong_id:
            cursor.execute(
                "SELECT nguoi_quan_ly_id FROM phong WHERE id = %s AND nguoi_quan_ly_id IS NOT NULL",
                (phong_id,),
            )
            row = cursor.fetchone()
            if row and row["nguoi_quan_ly_id"]:
                user_ids.add(row["nguoi_quan_ly_id"])

        if not user_ids:
            return []

        placeholders = ",".join(["%s"] * len(user_ids))
        cursor.execute(
            f"""
            SELECT k.id, k.nguoi_dung_id, k.loai, k.external_id, k.cau_hinh
            FROM kenh_thong_bao k
            WHERE k.nguoi_dung_id IN ({placeholders}) AND k.da_kich_hoat = 1
            """,
            tuple(user_ids),
        )
        return cursor.fetchall()
    finally:
        cursor.close()
        conn.close()


def send_email_alert(recipient: str, message: str) -> bool:
    """Gửi email đến recipient (external_id từ kenh_thong_bao)."""
    if not SMTP_USER or not SMTP_PASSWORD:
        logger.warning("[ALARM] SMTP not configured, skip email")
        return False
    try:
        msg = MIMEText(message)
        msg["Subject"] = "[CẢNH BÁO] Nền tảng IoT BDU"
        msg["From"] = SMTP_USER
        msg["To"] = recipient
        server = smtplib.SMTP_SSL(SMTP_SERVER, SMTP_PORT)
        server.login(SMTP_USER, SMTP_PASSWORD)
        server.sendmail(SMTP_USER, [recipient], msg.as_string())
        server.quit()
        logger.info(f"[ALARM] Email sent to {recipient}")
        return True
    except Exception as e:
        logger.error(f"[ALARM] Email failed: {e}")
        return False


def send_telegram_alert(chat_id: str, message: str) -> bool:
    """Gửi Telegram đến chat_id (external_id)."""
    if not TELEGRAM_BOT_TOKEN:
        logger.warning("[ALARM] Telegram not configured, skip")
        return False
    try:
        url = f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendMessage"
        r = requests.post(url, json={"chat_id": chat_id, "text": message}, timeout=10)
        if r.status_code == 200:
            logger.info(f"[ALARM] Telegram sent to {chat_id}")
            return True
        logger.error(f"[ALARM] Telegram failed: {r.text}")
        return False
    except Exception as e:
        logger.error(f"[ALARM] Telegram error: {e}")
        return False


def send_zalo_alert(user_id: str, message: str) -> bool:
    """Gửi Zalo đến user_id (external_id)."""
    if not ZALO_ACCESS_TOKEN:
        logger.warning("[ALARM] Zalo not configured, skip")
        return False
    try:
        url = "https://openapi.zalo.me/v2.0/oa/message"
        headers = {"Content-Type": "application/json", "access_token": ZALO_ACCESS_TOKEN}
        payload = {
            "recipient": {"user_id": user_id},
            "message": {"text": message},
        }
        r = requests.post(url, headers=headers, json=payload, timeout=10)
        if r.status_code == 200:
            logger.info(f"[ALARM] Zalo sent to {user_id}")
            return True
        logger.error(f"[ALARM] Zalo failed: {r.text}")
        return False
    except Exception as e:
        logger.error(f"[ALARM] Zalo error: {e}")
        return False


def send_notifications_for_alarm(
    alarm_id: int,
    message: str,
    phong_id: Optional[int] = None,
) -> None:
    """
    Gửi thông báo cho alarm qua các kênh trong kenh_thong_bao.
    Nếu không có kênh nào, có thể dùng env config mặc định (optional).
    """
    channels = get_channels_to_notify(phong_id)
    for ch in channels:
        loai = ch.get("loai", "")
        external_id = ch.get("external_id", "")
        if not external_id:
            continue
        if loai == "email":
            send_email_alert(external_id, message)
        elif loai == "telegram":
            send_telegram_alert(external_id, message)
        elif loai == "zalo":
            send_zalo_alert(external_id, message)
