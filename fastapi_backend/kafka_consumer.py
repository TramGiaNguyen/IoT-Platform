import json
import threading
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

def _add_event(event: dict) -> None:
    """Lưu event mới vào bộ nhớ tạm (vòng tròn, tối đa MAX_EVENTS)."""
    global event_counter
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
            # Trong môi trường demo/log đơn giản in ra console rồi retry
            print(f"[FASTAPI-KAFKA] Error consuming Kafka: {exc}. Retrying...")


def start_kafka_consumer_background() -> None:
    """
    Hàm được gọi khi FastAPI start để chạy consumer ở background thread.
    """
    thread = threading.Thread(target=consume_kafka_forever, daemon=True)
    thread.start()


