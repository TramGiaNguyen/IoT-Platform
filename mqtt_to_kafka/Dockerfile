# mqtt_to_kafka/Dockerfile
FROM python:3.10-slim

WORKDIR /app

COPY mqtt_to_kafka.py ./
COPY profile_transformer.py ./
COPY config.json ./
COPY requirements.txt ./

RUN pip install --no-cache-dir -r requirements.txt

CMD ["python", "-u", "mqtt_to_kafka.py"]
