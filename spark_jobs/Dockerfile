# spark_jobs/Dockerfile
FROM apache/spark-py:latest

USER root

# Cài đặt Python dependencies
RUN pip install --no-cache-dir pymongo mysql-connector-python kafka-python

WORKDIR /app

COPY *.py ./

# Entrypoint: runs streaming job + hourly aggregation scheduler
CMD ["python3", "/app/entrypoint.py"]
