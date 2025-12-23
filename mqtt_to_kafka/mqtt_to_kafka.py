# mqtt_to_kafka/mqtt_to_kafka.py

import json
import time
import sys
import os
import paho.mqtt.client as mqtt
from kafka import KafkaProducer
from kafka.errors import NoBrokersAvailable

# Force unbuffered output
sys.stdout.reconfigure(line_buffering=True)
sys.stderr.reconfigure(line_buffering=True)

MQTT_BROKER = os.getenv('MQTT_BROKER', 'mqtt')
MQTT_PORT = int(os.getenv('MQTT_PORT', '1883'))
MQTT_USERNAME = os.getenv('MQTT_USERNAME', None)
MQTT_PASSWORD = os.getenv('MQTT_PASSWORD', None)
# Simulator publishes to iot/devices/<device_id>/data and /status
MQTT_TOPICS = [
    ("iot/devices/+/data", 1),
    ("iot/devices/+/status", 1),
    ("garden/+/sensor", 1),      # Smart Garden sensor data
    ("garden/+/detection", 1),   # Smart Garden AI detection
]

KAFKA_BROKER = 'kafka:9092'
KAFKA_TOPIC = 'iot-events'

# Kafka producer với retry logic
producer = None
max_retries = 10
retry_delay = 5  # seconds

for i in range(max_retries):
    try:
        producer = KafkaProducer(
            bootstrap_servers=KAFKA_BROKER,
            value_serializer=lambda v: json.dumps(v).encode('utf-8'),
            api_version=(0, 10, 1),  # Specify API version để tránh auto-detect issues
            request_timeout_ms=30000,  # 30s timeout
            retries=3,  # Retry 3 lần nếu fail
            acks='all'  # Đợi tất cả replicas confirm
        )
        print(f"✅ Kafka producer connected successfully", flush=True)
        sys.stdout.flush()
        break
    except NoBrokersAvailable:
        if i < max_retries - 1:
            print(f"⏳ Waiting for Kafka broker... (attempt {i+1}/{max_retries})")
            time.sleep(retry_delay)
        else:
            print(f"❌ Failed to connect to Kafka after {max_retries} attempts")
            raise

if producer is None:
    raise Exception("Kafka producer not initialized")

def on_connect(client, userdata, flags, rc, properties=None):
    if rc == 0:
        print(f"✅ MQTT connected with result code {rc}", flush=True)
        sys.stdout.flush()
        print(f"📡 Subscribing to topics: {MQTT_TOPICS}", flush=True)
        sys.stdout.flush()
        # Subscribe với QoS=1 để đảm bảo nhận được messages
        result = client.subscribe(MQTT_TOPICS)
        print(f"✅ Subscribed, result: {result}", flush=True)
        sys.stdout.flush()
    else:
        print(f"❌ MQTT connection failed with result code {rc}", flush=True)
        sys.stdout.flush()

def on_message(client, userdata, msg):
    try:
        print(f"📥 MQTT message received on topic: {msg.topic}", flush=True)
        sys.stdout.flush()
        
        # Decode payload
        payload_str = msg.payload.decode('utf-8')
        if not payload_str or payload_str.strip() == '':
            print(f"⚠️ Empty message from {msg.topic}, skipping", flush=True)
            sys.stdout.flush()
            return
            
        print(f"📥 Raw payload (first 100 chars): {payload_str[:100]}", flush=True)
        sys.stdout.flush()
        
        payload = json.loads(payload_str)
        
        # Tự động thêm timestamp nếu thiếu (fix lỗi Offline status và chart 1970)
        if 'timestamp' not in payload:
            payload['timestamp'] = time.time()
            print(f"🕒 Added timestamp {payload['timestamp']} to payload", flush=True)

        print(f"📥 MQTT received on {msg.topic}: {payload}", flush=True)
        sys.stdout.flush()

        # Push to Kafka với retry và timeout dài hơn
        try:
            future = producer.send(KAFKA_TOPIC, value=payload)
            # Tăng timeout lên 30s và retry nếu cần
            record_metadata = future.get(timeout=30)
            print(f"📤 Sent to Kafka topic '{KAFKA_TOPIC}' partition {record_metadata.partition} offset {record_metadata.offset}", flush=True)
            sys.stdout.flush()
        except Exception as kafka_err:
            # Nếu Kafka timeout, log nhưng không crash - sẽ retry ở lần sau
            print(f"⚠️ Kafka send timeout/error (will retry): {kafka_err}", flush=True)
            sys.stdout.flush()
            # Không raise exception để không block MQTT message processing
    except json.JSONDecodeError as e:
        print(f"⚠️ Invalid JSON in message from {msg.topic}: {e}", flush=True)
        sys.stdout.flush()
        print(f"⚠️ Payload: {msg.payload.decode('utf-8', errors='ignore')[:200]}", flush=True)
        sys.stdout.flush()
    except Exception as e:
        print(f"❌ Error processing message: {e}", flush=True)
        sys.stdout.flush()
        import traceback
        traceback.print_exc()

def on_disconnect(client, userdata, *args, **kwargs):
    # Chấp nhận mọi chữ ký callback (MQTT v3/v5) để tránh crash thread
    rc = args[1] if len(args) > 1 else (args[0] if args else None)
    print(f"⚠️ MQTT disconnected with result code {rc}", flush=True)

# MQTT setup
print(f"🔌 Connecting to MQTT broker: {MQTT_BROKER}:{MQTT_PORT}", flush=True)
sys.stdout.flush()
# Sử dụng CallbackAPIVersion.VERSION2 để tránh deprecated warning
client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2, protocol=mqtt.MQTTv311)
client.on_connect = on_connect
client.on_message = on_message
client.on_disconnect = on_disconnect

# Set credentials if provided
if MQTT_USERNAME and MQTT_PASSWORD:
    print(f"🔐 Using MQTT authentication (username: {MQTT_USERNAME})", flush=True)
    client.username_pw_set(MQTT_USERNAME, MQTT_PASSWORD)

try:
    print(f"🔗 Calling client.connect()...", flush=True)
    sys.stdout.flush()
    client.connect(MQTT_BROKER, MQTT_PORT, 60)
    print(f"✅ MQTT connection initiated, starting loop...", flush=True)
    sys.stdout.flush()
    # Sử dụng loop_start() thay vì loop_forever() để không block
    client.loop_start()
    
    # Keep the script running
    print("🚀 MQTT to Kafka bridge running...", flush=True)
    sys.stdout.flush()
    while True:
        time.sleep(1)
except Exception as e:
    print(f"❌ Failed to connect to MQTT: {e}", flush=True)
    sys.stdout.flush()
    import traceback
    traceback.print_exc()
