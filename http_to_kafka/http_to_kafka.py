# http_to_kafka/http_to_kafka.py

from flask import Flask, request, jsonify
import json
import time
import sys
import os
from confluent_kafka import Producer
from confluent_kafka.admin import AdminClient

# Force unbuffered output
sys.stdout.reconfigure(line_buffering=True)
sys.stderr.reconfigure(line_buffering=True)

app = Flask(__name__)

KAFKA_BROKER = os.getenv('KAFKA_BROKER', 'kafka:9092')
KAFKA_TOPIC = os.getenv('KAFKA_TOPIC', 'iot-events')

# Kafka producer với retry logic (confluent-kafka)
producer = None
max_retries = 10
retry_delay = 5  # seconds

def _delivery_callback(err, msg):
    if err is not None:
        raise RuntimeError(f"Kafka delivery failed: {err}")

producer_conf = {
    'bootstrap.servers': KAFKA_BROKER,
    'acks': 'all',
    'request.timeout.ms': 30000,
    'message.timeout.ms': 30000,
    'retries': 3,
    'client.id': 'http-to-kafka-producer',
}

for i in range(max_retries):
    try:
        admin = AdminClient({'bootstrap.servers': KAFKA_BROKER})
        md = admin.list_topics(timeout=10)
        producer = Producer(producer_conf)
        print(f"✅ Kafka producer connected successfully (brokers: {len(md.brokers)})", flush=True)
        sys.stdout.flush()
        break
    except Exception as e:
        if i < max_retries - 1:
            print(f"⏳ Waiting for Kafka broker... (attempt {i+1}/{max_retries}): {e}")
            time.sleep(retry_delay)
        else:
            print(f"❌ Failed to connect to Kafka after {max_retries} attempts")
            raise

if producer is None:
    raise Exception("Kafka producer not initialized")


@app.route('/health', methods=['GET'])
def health():
    """Health check endpoint"""
    return jsonify({"status": "ok", "service": "http-to-kafka"}), 200


@app.route('/ingest', methods=['POST'])
def ingest_data():
    """
    Nhận HTTP data từ device và publish vào Kafka.
    
    Expected JSON payload:
    {
        "device_id": "gateway-7069a6a6",
        "temperature": 28,
        "humidity": 65,
        "timestamp": 1234567890  // optional
    }
    """
    try:
        # Parse JSON payload
        if not request.is_json:
            return jsonify({"error": "Content-Type must be application/json"}), 400
        
        payload = request.get_json()
        
        if not payload:
            return jsonify({"error": "Empty payload"}), 400
        
        # Validate device_id
        device_id = payload.get('device_id')
        if not device_id:
            return jsonify({"error": "Missing device_id"}), 400
        
        # Add timestamp if missing
        if 'timestamp' not in payload or payload.get('timestamp') is None:
            payload['timestamp'] = time.time()
        
        print(f"📥 HTTP received from {device_id}: {json.dumps(payload)[:200]}", flush=True)
        sys.stdout.flush()
        
        # Push to Kafka (confluent-kafka - non-blocking produce + flush)
        try:
            payload_bytes = json.dumps(payload).encode('utf-8')
            producer.produce(
                topic=KAFKA_TOPIC,
                value=payload_bytes,
                on_delivery=_delivery_callback,
            )
            producer.poll(0)
            # flush with timeout returns number of outstanding messages
            remaining = producer.flush(timeout=30)
            if remaining > 0:
                raise RuntimeError(f"{remaining} message(s) still pending after flush")

            print(f"📤 Sent to Kafka topic '{KAFKA_TOPIC}'", flush=True)
            sys.stdout.flush()
            
            return jsonify({
                "status": "ok",
                "message": "Data published to Kafka",
                "device_id": device_id,
                "timestamp": payload['timestamp']
            }), 200
            
        except Exception as kafka_err:
            print(f"⚠️ Kafka send error: {kafka_err}", flush=True)
            sys.stdout.flush()
            return jsonify({"error": f"Kafka error: {str(kafka_err)}"}), 500
            
    except json.JSONDecodeError as e:
        print(f"⚠️ Invalid JSON: {e}", flush=True)
        sys.stdout.flush()
        return jsonify({"error": f"Invalid JSON: {str(e)}"}), 400
    except Exception as e:
        print(f"❌ Error processing request: {e}", flush=True)
        sys.stdout.flush()
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


if __name__ == '__main__':
    print("🚀 HTTP-to-Kafka service starting...", flush=True)
    sys.stdout.flush()
    # Run Flask app
    app.run(host='0.0.0.0', port=5000, debug=False)
