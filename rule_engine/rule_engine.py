# rule_engine/rule_engine.py

import json
import os
import time
import threading
import logging
from datetime import datetime, timedelta

from kafka import KafkaConsumer
import mysql.connector
import paho.mqtt.client as mqtt
from croniter import croniter
import requests

from alarm_service import create_alarm, send_notifications_for_alarm

# -------------------------------------------------
# Config
# -------------------------------------------------
KAFKA_BOOTSTRAP = "kafka:9092"
KAFKA_TOPIC = "iot-events"
KAFKA_GROUP_ID = "rule-engine"

MQTT_BROKER = "mqtt"
MQTT_PORT = 1883

MYSQL_CONFIG = {
    "host": "mysql",
    "user": "iot",
    "password": "iot123",
    "database": "iot_data",
}

RULE_REFRESH_SECONDS = 30
COMMAND_POLL_SECONDS = 2
DEVICE_OFFLINE_THRESHOLD_MINUTES = int(os.getenv("DEVICE_OFFLINE_THRESHOLD_MINUTES", "10"))
DEVICE_OFFLINE_CHECK_INTERVAL = 60  # seconds

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
)

# #region agent log (debug runtime)
DEBUG_INGEST_URL = "http://127.0.0.1:7242/ingest/b79dabf1-b019-4647-a912-96914bd03449"
DEBUG_SESSION_ID = "7926b3"

def debug_log(hypothesis_id: str, location: str, message: str, data: dict):
    try:
        requests.post(
            DEBUG_INGEST_URL,
            json={
                "sessionId": DEBUG_SESSION_ID,
                "location": location,
                "message": message,
                "hypothesisId": hypothesis_id,
                "data": data,
                "timestamp": int(time.time() * 1000),
            },
            headers={"Content-Type": "application/json"},
            timeout=2,
        ).raise_for_status()
    except Exception:
        # Không làm ảnh hưởng luồng rule engine khi debug server lỗi
        pass
# #endregion


# -------------------------------------------------
# Utilities
# -------------------------------------------------
def get_mysql_conn():
    return mysql.connector.connect(**MYSQL_CONFIG)


def parse_value(v):
    try:
        return float(v)
    except (ValueError, TypeError):
        return v


def compare(value, operator, threshold):
    # Try numeric compare, fallback string
    v = parse_value(value)
    t = parse_value(threshold)
    try:
        if operator == ">":
            return v > t
        if operator == "<":
            return v < t
        if operator == ">=":
            return v >= t
        if operator == "<=":
            return v <= t
        if operator == "!=":
            return v != t
        if operator == "==" or operator == "=":
            return v == t
    except Exception:
        return False
    return False


# -------------------------------------------------
# Load rules/actions from MySQL
# -------------------------------------------------
def load_rules():
    conn = get_mysql_conn()
    cursor = conn.cursor(dictionary=True)
    try:
        cursor.execute(
            """
            SELECT r.id as rule_id, r.ten_rule, r.phong_id, r.condition_device_id, r.field, r.operator,
                   r.value, r.conditions, r.trang_thai, r.muc_do_uu_tien,
                   ra.id as action_id, ra.device_id as action_device_id,
                   ra.action_command, ra.action_params, ra.delay_seconds, ra.thu_tu
            FROM rules r
            LEFT JOIN rule_actions ra ON r.id = ra.rule_id
            WHERE r.trang_thai = 'enabled'
            ORDER BY r.muc_do_uu_tien ASC, r.id ASC, ra.thu_tu ASC
            """
        )
        rows = cursor.fetchall()
        rules = {}
        for row in rows:
            rid = row["rule_id"]
            if rid not in rules:
                # Ưu tiên điều kiện dạng mảng, fallback về field/operator/value cũ
                conds = []
                if row.get("conditions"):
                    try:
                        conds = json.loads(row["conditions"])
                    except Exception:
                        conds = []
                if not conds and row.get("field") and row.get("operator"):
                    conds = [
                        {
                            "field": row.get("field"),
                            "operator": row.get("operator"),
                            "value": row.get("value"),
                        }
                    ]
                rules[rid] = {
                    "id": rid,
                    "ten_rule": row["ten_rule"],
                    "phong_id": row.get("phong_id"),
                    "condition_device_id": row["condition_device_id"],
                    "conditions": conds,
                    "muc_do_uu_tien": row["muc_do_uu_tien"],
                    "actions": [],
                }
            if row["action_id"]:
                rules[rid]["actions"].append(
                    {
                        "id": row["action_id"],
                        "device_id": row["action_device_id"],
                        "action_command": row["action_command"],
                        "action_params": row["action_params"],
                        "delay_seconds": row["delay_seconds"] or 0,
                        "thu_tu": row["thu_tu"] or 1,
                    }
                )
        return list(rules.values())
    finally:
        cursor.close()
        conn.close()


# -------------------------------------------------
# Insert command to DB
# -------------------------------------------------
def insert_command(rule_id, action, payload):
    conn = get_mysql_conn()
    cursor = conn.cursor()
    try:
        cursor.execute(
            """
            INSERT INTO commands (device_id, command, payload, status, rule_id, rule_action_id, created_at)
            VALUES (%s, %s, %s, 'pending', %s, %s, NOW())
            """,
            (
                action["device_id"],
                action["action_command"],
                json.dumps(payload) if payload is not None else None,
                rule_id,
                action["id"],
            ),
        )
        conn.commit()
    except Exception as e:
        logging.error(f"[COMMAND] Insert failed: {e}")
        conn.rollback()
    finally:
        cursor.close()
        conn.close()


# -------------------------------------------------
# MQTT Publisher
# -------------------------------------------------
mqtt_client = mqtt.Client()
# Set authentication credentials
mqtt_username = os.getenv("MQTT_USERNAME", "bdu_admin")
mqtt_password = os.getenv("MQTT_PASSWORD", "admin_secret")
mqtt_client.username_pw_set(mqtt_username, mqtt_password)
mqtt_client.connect(MQTT_BROKER, MQTT_PORT, 60)
mqtt_client.loop_start()
logging.info(f"[MQTT] Connected to {MQTT_BROKER}:{MQTT_PORT} as {mqtt_username}")


def publish_command(cmd):
    topic = f"iot/devices/{cmd['device_id']}/control"
    # Gửi payload trực tiếp, không wrap trong command/params
    # Thiết bị expect format: {"relay": 1, "state": "OFF"}
    payload = cmd.get("payload_json", {})
    mqtt_client.publish(topic, json.dumps(payload), qos=1)
    logging.info(f"[MQTT] Sent command -> {topic} {payload}")


def command_publisher_loop():
    while True:
        conn = get_mysql_conn()
        cursor = conn.cursor(dictionary=True)
        try:
            cursor.execute(
                """
                SELECT id, device_id, command, payload
                FROM commands
                WHERE status = 'pending'
                ORDER BY created_at ASC
                LIMIT 20
                """
            )
            rows = cursor.fetchall()
            if not rows:
                time.sleep(COMMAND_POLL_SECONDS)
                continue

            for row in rows:
                payload_json = None
                try:
                    payload_json = json.loads(row["payload"]) if row["payload"] else None
                except Exception:
                    payload_json = None

                try:
                    publish_command(
                        {
                            "device_id": row["device_id"],
                            "command": row["command"],
                            "payload_json": payload_json,
                        }
                    )
                    cursor.execute(
                        """
                        UPDATE commands
                        SET status='sent', sent_at=NOW()
                        WHERE id=%s
                        """,
                        (row["id"],),
                    )
                    conn.commit()
                except Exception as e:
                    logging.error(f"[MQTT] Publish failed cmd_id={row['id']}: {e}")
                    cursor.execute(
                        """
                        UPDATE commands
                        SET status='failed', error_message=%s
                        WHERE id=%s
                        """,
                        (str(e)[:250], row["id"]),
                    )
                    conn.commit()
        finally:
            cursor.close()
            conn.close()


# -------------------------------------------------
# Rule evaluation
# -------------------------------------------------
class RuleCache:
    def __init__(self):
        self.rules = []
        self.last_loaded = 0

    def get_rules(self):
        now = time.time()
        if now - self.last_loaded > RULE_REFRESH_SECONDS:
            self.rules = load_rules()
            self.last_loaded = now
            logging.info(f"[RULE] Loaded {len(self.rules)} enabled rules")
        return self.rules


rule_cache = RuleCache()


def evaluate_event(event):
    device_id = event.get("device_id")
    if not device_id:
        return

    for rule in rule_cache.get_rules():
        if rule["condition_device_id"] != device_id:
            continue
        conditions = rule.get("conditions", [])
        if not conditions:
            continue
        passed = True
        for cond in conditions:
            field = cond.get("field")
            if field not in event:
                passed = False
                break
            if not compare(event[field], cond.get("operator"), cond.get("value")):
                passed = False
                break
        if passed:
            # Tạo alarm rule_triggered và gửi thông báo
            cond_summary = ", ".join(
                f"{c.get('field')}{c.get('operator')}{c.get('value')}"
                for c in conditions[:3]
            )
            tin_nhan = (
                f"Rule '{rule.get('ten_rule', rule['id'])}' kích hoạt trên thiết bị {device_id}. "
                f"Điều kiện: {cond_summary}"
            )
            alarm_id = create_alarm(
                loai="rule_triggered",
                tin_nhan=tin_nhan,
                device_id=device_id,
                rule_id=rule["id"],
                muc_do="medium",
                data_context={"event": event, "rule_name": rule.get("ten_rule")},
            )
            if alarm_id:
                send_notifications_for_alarm(
                    alarm_id, tin_nhan, phong_id=rule.get("phong_id")
                )
            for action in rule.get("actions", []):
                payload = action.get("action_params")
                insert_command(rule["id"], action, payload)
                logging.info(
                    f"[RULE HIT] rule={rule['id']} action={action['id']} device={device_id}"
                )


last_event_time = time.time()
kafka_consumer_thread = None
should_stop = False


def kafka_consumer_loop():
    global last_event_time
    while not should_stop:
        consumer = None
        try:
            consumer = KafkaConsumer(
                KAFKA_TOPIC,
                bootstrap_servers=KAFKA_BOOTSTRAP,
                group_id=KAFKA_GROUP_ID,
                value_deserializer=lambda v: json.loads(v.decode("utf-8")),
                enable_auto_commit=True,
                auto_offset_reset="latest",
                consumer_timeout_ms=60000,  # 60s timeout to check for reconnect
            )
            logging.info(f"[KAFKA] Connected and subscribed to {KAFKA_TOPIC}")
            for message in consumer:
                if should_stop:
                    break
                try:
                    event = message.value
                    last_event_time = time.time()
                    evaluate_event(event)
                except Exception as e:
                    logging.error(f"[KAFKA] Error processing message: {e}")
        except Exception as e:
            logging.error(f"[KAFKA] Consumer error: {e}")
        finally:
            if consumer:
                try:
                    consumer.close()
                except:
                    pass
        if not should_stop:
            logging.info("[KAFKA] Reconnecting in 10s...")
            time.sleep(10)


def device_offline_check_loop():
    """
    Job định kỳ: kiểm tra thiết bị offline (last_seen > threshold).
    Tạo alarm device_offline và gửi thông báo.
    """
    logging.info("[DEVICE_OFFLINE] Thread started")
    while not should_stop:
        try:
            time.sleep(DEVICE_OFFLINE_CHECK_INTERVAL)
            logging.info(f"[DEVICE_OFFLINE] Starting check cycle (threshold: {DEVICE_OFFLINE_THRESHOLD_MINUTES} min)")
            threshold = datetime.utcnow() - timedelta(minutes=DEVICE_OFFLINE_THRESHOLD_MINUTES)
            conn = get_mysql_conn()
            cursor = conn.cursor(dictionary=True)
            try:
                cursor.execute(
                    """
                    SELECT t.id, t.ma_thiet_bi, t.ten_thiet_bi, t.phong_id, t.last_seen
                    FROM thiet_bi t
                    WHERE t.is_active = 1
                      AND t.last_seen IS NOT NULL
                      AND t.last_seen < %s
                    """,
                    (threshold,),
                )
                offline_devices = cursor.fetchall()
                logging.info(f"[DEVICE_OFFLINE] Found {len(offline_devices)} offline devices")
                for dev in offline_devices:
                    ma_thiet_bi = dev["ma_thiet_bi"]
                    # Kiểm tra đã có alarm chưa giải quyết cho device này chưa
                    cursor.execute(
                        """
                        SELECT id FROM canh_bao
                        WHERE device_id = %s AND loai = 'device_offline'
                          AND trang_thai IN ('new', 'acknowledged')
                        LIMIT 1
                        """,
                        (ma_thiet_bi,),
                    )
                    if cursor.fetchone():
                        continue  # Đã có alarm, không tạo trùng
                    tin_nhan = (
                        f"Thiết bị {dev.get('ten_thiet_bi', ma_thiet_bi)} ({ma_thiet_bi}) "
                        f"offline hơn {DEVICE_OFFLINE_THRESHOLD_MINUTES} phút. "
                        f"Lần cuối: {dev.get('last_seen')}"
                    )
                    alarm_id = create_alarm(
                        loai="device_offline",
                        tin_nhan=tin_nhan,
                        device_id=ma_thiet_bi,
                        muc_do="high",
                        data_context={"last_seen": str(dev.get("last_seen"))},
                    )
                    if alarm_id:
                        send_notifications_for_alarm(
                            alarm_id, tin_nhan, phong_id=dev.get("phong_id")
                        )
                        logging.info(f"[DEVICE_OFFLINE] Alarm created for {ma_thiet_bi}")
            finally:
                cursor.close()
                conn.close()
        except Exception as e:
            logging.error(f"[DEVICE_OFFLINE] Check failed: {e}", exc_info=True)


def scheduled_rules_check_loop():
    """
    Job mỗi phút: kiểm tra scheduled_rules và chạy các rule có cron khớp.
    Gửi lệnh qua bảng commands (sẽ được command_publisher_loop gửi MQTT).
    """
    SCHEDULED_CHECK_INTERVAL = 60  # seconds
    while not should_stop:
        try:
            time.sleep(SCHEDULED_CHECK_INTERVAL)
            now = datetime.now()
            conn = get_mysql_conn()
            cursor = conn.cursor(dictionary=True)
            try:
                cursor.execute(
                    """
                    SELECT id, ten_rule, cron_expression, device_id, action_command, action_params, last_run_at
                    FROM scheduled_rules
                    WHERE trang_thai = 'enabled'
                    """
                )
                rows = cursor.fetchall()
                for row in rows:
                    try:
                        cron_expr = row["cron_expression"]
                        if not cron_expr or not cron_expr.strip():
                            continue
                        try:
                            # Kiểm tra xem thời điểm hiện tại có khớp với cron expression không
                            cron = croniter(cron_expr, now)
                            # Lấy lần chạy tiếp theo từ 1 phút trước
                            prev_time = now - timedelta(minutes=1)
                            cron_prev = croniter(cron_expr, prev_time)
                            next_run = cron_prev.get_next(datetime)
                            
                            # Kiểm tra xem next_run có nằm trong phút hiện tại không
                            current_minute = now.replace(second=0, microsecond=0)
                            next_minute = current_minute + timedelta(minutes=1)
                            
                            if not (current_minute <= next_run < next_minute):
                                continue
                            
                            # Kiểm tra đã chạy trong phút này chưa
                            last_run = row.get("last_run_at")
                            if last_run:
                                last_run_minute = last_run.replace(second=0, microsecond=0)
                                if last_run_minute >= current_minute:
                                    continue
                        except Exception as e:
                            logging.warning(f"[SCHEDULED] Invalid cron '{cron_expr}': {e}")
                            continue

                        payload = row.get("action_params")
                        if isinstance(payload, str):
                            try:
                                payload = json.loads(payload) if payload else None
                            except Exception:
                                payload = None

                        # #region agent log
                        debug_log(
                            hypothesis_id="H_scheduled_fire",
                            location="rule_engine:scheduled_rules_check_loop",
                            message="scheduled_rule_match_fire",
                            data={
                                "rule_id": row.get("id"),
                                "ten_rule": row.get("ten_rule"),
                                "cron_expression": cron_expr,
                                "device_id": row.get("device_id"),
                                "action_command": row.get("action_command"),
                                "current_minute": current_minute.isoformat(),
                                "next_run": next_run.isoformat(),
                                "last_run_at": str(row.get("last_run_at")),
                                "action_params_type": type(payload).__name__ if payload is not None else "null",
                            },
                        )
                        # #endregion

                        # Gọi API endpoint thay vì insert vào commands
                        # API sẽ tự động routing: HTTP (nếu có edge_control_url) hoặc MQTT
                        device_id = row["device_id"]
                        action_command = row["action_command"]
                        
                        # Lấy token để gọi API (dùng service account hoặc admin token)
                        api_base_url = os.getenv("IOT_PLATFORM_URL", "http://fastapi-backend:8000")
                        
                        # Tạo service token hoặc dùng token có sẵn
                        # Để đơn giản, tạo request trực tiếp với internal call
                        try:
                            if action_command == "relay" and payload:
                                # Gọi API control-relay
                                api_url = f"{api_base_url}/devices/{device_id}/control-relay"
                                headers = {"Content-Type": "application/json"}
                                
                                # Lấy JWT token từ env hoặc tạo internal token
                                # Để bypass auth cho internal calls, có thể dùng special header
                                internal_api_key = os.getenv("INTERNAL_API_KEY", "")
                                if internal_api_key:
                                    headers["X-Internal-Key"] = internal_api_key
                                    logging.info(f"[SCHEDULED] Using internal API key for authentication")
                                else:
                                    logging.warning(f"[SCHEDULED] INTERNAL_API_KEY not set! Request will fail with 401")
                                
                                logging.info(f"[SCHEDULED] Calling API: {api_url} with headers: {list(headers.keys())}")
                                
                                response = requests.post(
                                    api_url,
                                    json=payload,
                                    headers=headers,
                                    timeout=15
                                )
                                
                                if response.status_code == 200:
                                    result = response.json()
                                    via = result.get("via", "unknown")
                                    logging.info(
                                        f"[SCHEDULED] Rule {row['id']} executed via {via.upper()} -> {device_id} relay {payload.get('relay')} {payload.get('state')}"
                                    )
                                else:
                                    # API failed, fallback to commands table
                                    logging.warning(
                                        f"[SCHEDULED] API call failed ({response.status_code}): {response.text[:200]}"
                                    )
                                    logging.warning(
                                        f"[SCHEDULED] API call failed ({response.status_code}), falling back to commands table"
                                    )
                                    cursor.execute(
                                        """
                                        INSERT INTO commands (device_id, command, payload, status, rule_id, rule_action_id, created_at)
                                        VALUES (%s, %s, %s, 'pending', NULL, NULL, NOW())
                                        """,
                                        (device_id, action_command, json.dumps(payload) if payload else None),
                                    )
                                    logging.info(
                                        f"[SCHEDULED] Rule {row['id']} queued to commands (fallback) -> {device_id} {action_command}"
                                    )
                            else:
                                # Fallback: insert vào commands cho các action khác
                                cursor.execute(
                                    """
                                    INSERT INTO commands (device_id, command, payload, status, rule_id, rule_action_id, created_at)
                                    VALUES (%s, %s, %s, 'pending', NULL, NULL, NOW())
                                    """,
                                    (device_id, action_command, json.dumps(payload) if payload else None),
                                )
                                logging.info(
                                    f"[SCHEDULED] Rule {row['id']} queued to commands -> {device_id} {action_command}"
                                )
                        except requests.RequestException as req_err:
                            logging.error(f"[SCHEDULED] API request failed: {req_err}, falling back to commands")
                            # Fallback: insert vào commands
                            cursor.execute(
                                """
                                INSERT INTO commands (device_id, command, payload, status, rule_id, rule_action_id, created_at)
                                VALUES (%s, %s, %s, 'pending', NULL, NULL, NOW())
                                """,
                                (device_id, action_command, json.dumps(payload) if payload else None),
                            )
                        
                        cursor.execute(
                            "UPDATE scheduled_rules SET last_run_at = NOW() WHERE id = %s",
                            (row["id"],),
                        )
                        conn.commit()
                    except Exception as e:
                        logging.error(f"[SCHEDULED] Rule {row.get('id')} failed: {e}")
                        # #region agent log
                        debug_log(
                            hypothesis_id="H_scheduled_fire",
                            location="rule_engine:scheduled_rules_check_loop",
                            message="scheduled_rule_fire_error",
                            data={
                                "rule_id": row.get("id"),
                                "error": str(e)[:400],
                            },
                        )
                        # #endregion
                        conn.rollback()
            finally:
                cursor.close()
                conn.close()
        except Exception as e:
            logging.error(f"[SCHEDULED] Check loop failed: {e}")


def watchdog_loop():
    """Monitor Kafka consumer and exit process if stalled for too long."""
    global last_event_time
    STALL_THRESHOLD = 300  # 5 minutes without events = probably stalled
    failure_count = 0
    MAX_FAILURES = 3
    
    while not should_stop:
        time.sleep(60)
        elapsed = time.time() - last_event_time
        
        if elapsed > STALL_THRESHOLD:
            failure_count += 1
            logging.warning(
                f"[WATCHDOG] No data for {int(elapsed)}s! Failure count: {failure_count}/{MAX_FAILURES}"
            )
            if failure_count >= MAX_FAILURES:
                logging.error("[WATCHDOG] Kafka stalled too long. Exiting for Docker restart...")
                import sys
                sys.exit(1)  # Docker will restart container
        else:
            failure_count = 0
            logging.info("[WATCHDOG] Rule engine healthy ✓")


def main():
    global should_stop
    
    t_consumer = threading.Thread(target=kafka_consumer_loop, daemon=True)
    t_publisher = threading.Thread(target=command_publisher_loop, daemon=True)
    t_watchdog = threading.Thread(target=watchdog_loop, daemon=True)
    t_offline = threading.Thread(target=device_offline_check_loop, daemon=True)
    t_scheduled = threading.Thread(target=scheduled_rules_check_loop, daemon=True)

    logging.info("[MAIN] Starting threads...")
    t_consumer.start()
    t_publisher.start()
    t_watchdog.start()
    logging.info("[MAIN] Starting device_offline_check_loop thread...")
    t_offline.start()
    logging.info("[MAIN] device_offline_check_loop thread started")
    t_scheduled.start()

    logging.info(
        "🚀 Rule Engine started (Kafka → MySQL commands → MQTT) "
        "with watchdog + device_offline alarm + scheduled_rules"
    )
    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        logging.info("🛑 Stopping Rule Engine...")
        should_stop = True
    finally:
        mqtt_client.loop_stop()
        mqtt_client.disconnect()


if __name__ == "__main__":
    main()
