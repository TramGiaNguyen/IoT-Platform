# coap_adapter/coap_server.py
"""
CoAP adapter: nhận dữ liệu từ thiết bị qua CoAP, chuyển tiếp sang Kafka.
Dành cho thiết bị hạn chế tài nguyên (LoRa, sensor nhỏ).
"""

import asyncio
import json
import os
import time

KAFKA_BOOTSTRAP = os.getenv("KAFKA_BOOTSTRAP", "kafka:9092")
KAFKA_TOPIC = os.getenv("KAFKA_TOPIC", "iot-events")

_kafka_producer = None


def get_producer():
    global _kafka_producer
    if _kafka_producer is None:
        from kafka import KafkaProducer
        _kafka_producer = KafkaProducer(
            bootstrap_servers=KAFKA_BOOTSTRAP,
            value_serializer=lambda v: json.dumps(v).encode("utf-8"),
            acks="all",
        )
    return _kafka_producer


async def main():
    from aiocoap import Context, resource

    class IngestResource(resource.Resource):
        async def render_post(self, request):
            from aiocoap import Message, Code
            payload = request.payload
            if not payload:
                return Message(code=Code.BAD_REQUEST, payload=b"Empty payload")
            try:
                data = json.loads(payload.decode("utf-8"))
            except json.JSONDecodeError:
                return Message(code=Code.BAD_REQUEST, payload=b"Invalid JSON")
            device_id = data.get("device_id")
            if not device_id:
                return Message(code=Code.BAD_REQUEST, payload=b"Missing device_id")
            if "timestamp" not in data:
                data["timestamp"] = time.time()
            try:
                producer = get_producer()
                producer.send(KAFKA_TOPIC, value=data)
                producer.flush()
                return Message(code=Code.CREATED, payload=b"OK")
            except Exception as e:
                return Message(code=Code.INTERNAL_SERVER_ERROR, payload=str(e).encode())

    root = resource.Site()
    root.add_resource(["ingest"], IngestResource())
    await Context.create_server_context(root, bind=("0.0.0.0", 5683))
    print("CoAP server listening on 0.0.0.0:5683 (ingest)")
    await asyncio.get_running_loop().create_future()


if __name__ == "__main__":
    asyncio.run(main())
