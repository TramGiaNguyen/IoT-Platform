# rule_engine/rule_engine.py

import json
import time
import threading
import logging
from datetime import datetime

from kafka import KafkaConsumer
import mysql.connector
import paho.mqtt.client as mqtt

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

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
)


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
            SELECT r.id as rule_id, r.ten_rule, r.condition_device_id, r.field, r.operator,
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
mqtt_client.connect(MQTT_BROKER, MQTT_PORT, 60)
mqtt_client.loop_start()


def publish_command(cmd):
    topic = f"iot/devices/{cmd['device_id']}/control"
    payload = {"command": cmd["command"], "params": cmd.get("payload_json")}
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
    
    t_consumer.start()
    t_publisher.start()
    t_watchdog.start()

    logging.info("🚀 Rule Engine started (Kafka → MySQL commands → MQTT) with watchdog")
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
