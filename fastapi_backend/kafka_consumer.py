import json
import threading
import time as _time_module
import atexit
from datetime import datetime
from typing import List

from kafka import KafkaConsumer


# Kafka configuration – cần khớp với mqtt_to_kafka & spark_jobs
KAFKA_BOOTSTRAP_SERVERS = "kafka:9092"
KAFKA_TOPIC = "iot-events"


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
    Vòng lặp Kafka consumer chạy nền.

    - Lắng nghe topic KAFKA_TOPIC.
    - Mỗi message nhận được sẽ parse JSON và đưa vào latest_events.
    """
    while True:
        try:
            consumer = KafkaConsumer(
                KAFKA_TOPIC,
                bootstrap_servers=KAFKA_BOOTSTRAP_SERVERS,
                value_deserializer=lambda v: json.loads(v.decode("utf-8")),
                auto_offset_reset="latest",
                enable_auto_commit=True,
                group_id="fastapi-backend-consumer",
            )

            for msg in consumer:
                if msg.value:
                    _add_event(msg.value)
        except Exception as exc:
            # Flush pending last_seen updates trước khi retry
            _flush_last_seen_updates()
            # Trong môi trường demo/log đơn giản in ra console rồi retry
            print(f"[FASTAPI-KAFKA] Error consuming Kafka: {exc}. Retrying...")


def start_kafka_consumer_background() -> None:
    """
    Hàm được gọi khi FastAPI start để chạy consumer ở background thread.
    """
    thread = threading.Thread(target=consume_kafka_forever, daemon=True)
    thread.start()


# Đảm bảo flush pending updates khi process shutdown bình thường
atexit.register(_flush_last_seen_updates)


