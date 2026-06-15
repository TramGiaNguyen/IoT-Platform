import json
import threading
import time as _time_module
import atexit
from datetime import datetime
from typing import List

from confluent_kafka import Consumer, KafkaError, KafkaException


# Kafka configuration – cần khớp với mqtt_to_kafka & spark_jobs
KAFKA_BOOTSTRAP_SERVERS = "kafka:9092"
KAFKA_TOPIC = "iot-events"
KAFKA_GROUP_ID = "fastapi-backend-consumer"


# Bộ nhớ tạm đơn giản lưu một số event gần nhất đọc từ Kafka
latest_events_lock = threading.Lock()
latest_events: List[dict] = []
MAX_EVENTS = 100
event_counter = 0

# -- Batch update last_seen / trang_thai khi nhận telemetry từ Kafka --
# Tránh query MySQL trên mỗi message; gom lại và flush định kỳ.
_last_seen_updates: dict[str, float] = {}   # device_id -> thời điểm nhận event (dùng current time)
_updates_lock = threading.Lock()
_FLUSH_INTERVAL_SEC = 5
_last_flush_ts = _time_module.time()


def _track_last_seen(event: dict) -> None:
    """
    Trích device_id từ Kafka event, cập nhật _last_seen_updates với thời điểm
    NHẬN được event (không dùng timestamp trong payload, tránh trường hợp
    sensor gửi data cũ bị đánh offline sai).
    Gọi trong _add_event() mỗi khi nhận message mới.
    """
    dev_id = event.get("device_id")
    if not dev_id:
        return
    with _updates_lock:
        # Luôn dùng current time — không dùng event["timestamp"]
        _last_seen_updates[dev_id] = _time_module.time()


def _flush_last_seen_updates() -> None:
    """
    Batch UPDATE last_seen + trang_thai='online' cho tất cả thiết bị
    trong _last_seen_updates. Dùng thời điểm flush (NOW) làm giá trị last_seen
    mới — không dùng timestamp trong event payload.
    Mỗi thiết bị chỉ update nếu last_seen hiện tại trong DB cũ hơn now
    (tránh ghi đè nếu last_seen đã được cập nhật từ nguồn khác như control command).
    """
    global _last_flush_ts
    with _updates_lock:
        if not _last_seen_updates:
            return
        items = list(_last_seen_updates.items)
        _last_seen_updates.clear()
    # flush ra khỏi lock để không block event loop quá lâu

    try:
        from database import get_mysql
        conn = get_mysql()
        cursor = conn.cursor()
        now = datetime.utcnow()
        updated = 0
        for dev_id, _ in items:
            try:
                cursor.execute(
                    """UPDATE thiet_bi
                       SET last_seen = %s, trang_thai = 'online'
                       WHERE ma_thiet_bi = %s AND last_seen < %s""",
                    (now, dev_id, now),
                )
                updated += cursor.rowcount
            except Exception:
                pass
        conn.commit()
        cursor.close()
        conn.close()
        if updated:
            print(f"[KAFKA] Updated last_seen for {updated} device(s)")
    except Exception as e:
        print(f"[KAFKA] last_seen flush error: {e}")
    finally:
        _last_flush_ts = _time_module.time()

def _add_event(event: dict) -> None:
    """Lưu event mới vào bộ nhớ tạm (vòng tròn, tối đa MAX_EVENTS)."""
    global event_counter
    # Track last_seen ngay khi nhận event (trước khi thêm vào buffer)
    _track_last_seen(event)
    # Flush định kỳ: kiểm tra trong lock để tránh race giữa các thread
    global _last_flush_ts
    now = _time_module.time()
    if now - _last_flush_ts >= _FLUSH_INTERVAL_SEC:
        _flush_last_seen_updates()
    with latest_events_lock:
        event_counter += 1
        event['_internal_id'] = event_counter
        latest_events.append(event)
        if len(latest_events) > MAX_EVENTS:
            # chỉ giữ lại MAX_EVENTS phần tử gần nhất
            del latest_events[0 : len(latest_events) - MAX_EVENTS]


def get_latest_events() -> List[dict]:
    """Đọc danh sách event Kafka gần nhất (copy, tránh lộ lock ra ngoài)."""
    with latest_events_lock:
        return list(latest_events)


def consume_kafka_forever() -> None:
    """
    Vòng lặp Kafka consumer chạy nền (dùng confluent-kafka).

    - Lắng nghe topic KAFKA_TOPIC.
    - Mỗi message nhận được sẽ parse JSON và đưa vào latest_events.
    - Có backoff 5s giữa các lần retry để tránh CPU 100% khi broker gặp sự cố.
    """
    backoff_seconds = 5
    consumer_conf = {
        "bootstrap.servers": KAFKA_BOOTSTRAP_SERVERS,
        "group.id": KAFKA_GROUP_ID,
        "auto.offset.reset": "latest",
        "enable.auto.commit": True,
        "client.id": "fastapi-backend-consumer",
    }

    while True:
        consumer = None
        try:
            consumer = Consumer(consumer_conf)
            consumer.subscribe([KAFKA_TOPIC])

            while True:
                msg = consumer.poll(timeout=1.0)
                if msg is None:
                    # Cứ 5s kiểm tra flush last_seen một lần
                    _maybe_flush_last_seen()
                    continue
                err = msg.error()
                if err is not None:
                    if err.code() == KafkaError._PARTITION_EOF:
                        continue
                    raise KafkaException(err)
                value = msg.value()
                if not value:
                    continue
                try:
                    event = json.loads(value.decode("utf-8"))
                except Exception as parse_err:
                    print(f"[FASTAPI-KAFKA] Skip unparseable message: {parse_err}")
                    continue
                _add_event(event)
                _maybe_flush_last_seen()
        except Exception as exc:
            _flush_last_seen_updates()
            print(
                f"[FASTAPI-KAFKA] Error consuming Kafka: {exc}. "
                f"Retrying in {backoff_seconds}s..."
            )
        finally:
            # Đảm bảo đóng consumer để tránh leak file descriptor / connection
            if consumer is not None:
                try:
                    consumer.close()
                except Exception:
                    pass
        # Tránh tight loop khi broker lỗi liên tục (CPU 100%)
        _time_module.sleep(backoff_seconds)


def _maybe_flush_last_seen() -> None:
    """Flush nếu đã đến flush interval – tránh chạy trong lock event."""
    if _time_module.time() - _last_flush_ts >= _FLUSH_INTERVAL_SEC:
        _flush_last_seen_updates()


def start_kafka_consumer_background() -> None:
    """
    Hàm được gọi khi FastAPI start để chạy consumer ở background thread.
    """
    thread = threading.Thread(target=consume_kafka_forever, daemon=True)
    thread.start()


# Đảm bảo flush pending updates khi process shutdown bình thường
atexit.register(_flush_last_seen_updates)


