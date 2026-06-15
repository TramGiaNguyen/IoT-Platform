FROM python:3.10-slim

WORKDIR /app

# Install dependencies
RUN pip install --no-cache-dir \
    flask==3.0.0 \
    confluent-kafka==2.5.3

# Copy application code
COPY http_to_kafka.py .

# Expose port
EXPOSE 5000

# Run the service
CMD ["python", "http_to_kafka.py"]
