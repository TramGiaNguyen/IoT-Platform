# simulators/Dockerfile
FROM python:3.10-slim

WORKDIR /app

COPY device_simulator.py .
COPY requirements.txt .

RUN pip install --no-cache-dir -r requirements.txt

CMD ["python", "device_simulator.py"]
