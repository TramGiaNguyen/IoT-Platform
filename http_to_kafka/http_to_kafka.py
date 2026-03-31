# http_to_kafka/http_to_kafka.py

from flask import Flask, request, jsonify
import json
import time
import sys
import os
from kafka import KafkaProducer
from kafka.errors import NoBrokersAvailable

# Force unbuffered output
sys.stdout.reconfigure(line_buffering=True)
sys.stderr.reconfigure(line_buffering=True)

app = Flask(__name__)

KAFKA_BROKER = os.getenv('KAFKA_BROKER', 'kafka:9092')
KAFKA_TOPIC = os.getenv('KAFKA_TOPIC', 'iot-events')

# Kafka producer với retry logic
producer = None
max_retries = 10
retry_delay = 5  # seconds

for i in range(max_retries):
    try:
        producer = KafkaProducer(
            bootstrap_servers=KAFKA_BROKER,
            value_serializer=lambda v: json.dumps(v).encode('utf-8'),
            api_version=(0, 10, 1),
            request_timeout_ms=30000,
            retries=3,
            acks='all'
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
        
        # Push to Kafka
        try:
            future = producer.send(KAFKA_TOPIC, value=payload)
            record_metadata = future.get(timeout=30)
            print(f"📤 Sent to Kafka topic '{KAFKA_TOPIC}' partition {record_metadata.partition} offset {record_metadata.offset}", flush=True)
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
