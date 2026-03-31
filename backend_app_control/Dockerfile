FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 8001

# Không dùng --reload trong container (tránh reload/watch gây ngắt kết nối bất thường)
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8001"]
