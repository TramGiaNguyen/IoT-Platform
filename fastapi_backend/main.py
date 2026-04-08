import os
from fastapi import FastAPI, WebSocket
from fastapi.middleware.cors import CORSMiddleware
from routes import router
from websocket import websocket_endpoint
from kafka_consumer import start_kafka_consumer_background

app = FastAPI(title="BDU IoT Platform API")

# CORS: chỉ cho phép các origin đã biết khi dùng credentials
# Thêm origin vào ALLOWED_ORIGINS env var (phân cách bởi dấu phẩy) khi deploy production
# Đặt ALLOWED_ORIGINS=* để cho phép tất cả (dev/LAN)
_raw_origins = os.getenv(
    "ALLOWED_ORIGINS",
    "http://localhost:3000,http://127.0.0.1:3000"
)

if _raw_origins.strip() == "*":
    ALLOWED_ORIGINS = ["*"]
    _allow_credentials = False   # CORS spec: wildcard không dùng được với credentials
else:
    ALLOWED_ORIGINS = [o.strip() for o in _raw_origins.split(",") if o.strip()]
    _allow_credentials = True

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=_allow_credentials,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router)

# Mount Public API Sub-application
from public_api import public_router
public_app = FastAPI(
    title="BDU IoT Platform - Public API",
    description="Tài liệu API công khai dành cho tích hợp hệ thống ngoại vi (Mobile App, bên thứ 3) và thiết bị Edge qua HTTP.",
    version="1.0.0"
)
public_app.include_router(public_router)
app.mount("/api/public", public_app)

app.add_api_websocket_route("/ws/events", websocket_endpoint)
@app.on_event("startup")
def _startup_kafka_consumer():
    """
    Khi FastAPI khởi động, chạy Kafka consumer ở background để
    thực hiện luồng KAFKA → FASTAPI theo kiến trúc mong muốn.
    """
    start_kafka_consumer_background()


# ============================================================
# MongoDB index setup – chạy một lần khi startup, không bao giờ trong hot path
# ============================================================
_mongo_index_ready = False


@app.on_event("startup")
def _ensure_mongo_indexes():
    """Tạo index cho collection `events` trên MongoDB một lần duy nhất khi process khởi động."""
    global _mongo_index_ready
    try:
        from database import get_mongo
        collection = get_mongo()["events"]
        indexes = collection.index_information()
        if "device_id_1_timestamp_-1" not in indexes:
            collection.create_index(
                [("device_id", 1), ("timestamp", -1)],
                name="device_id_1_timestamp_-1"
            )
        _mongo_index_ready = True
    except Exception as e:
        print(f"[MONGODB] Index setup warning: {e}")
        _mongo_index_ready = True  # Vẫn tiếp tục – index có thể đã tồn tại

@app.get("/")
def read_root():
    return {"message": "Welcome to Binh Duong IoT Platform API"}

@app.get("/health")
def health_check():
    """Health check endpoint – dùng cho Docker healthcheck và load balancer."""
    from database import get_mysql, get_mongo
    status = {"status": "ok", "services": {}}
    # Kiểm tra MySQL
    try:
        conn = get_mysql()
        conn.ping(reconnect=False)
        conn.close()
        status["services"]["mysql"] = "ok"
    except Exception as e:
        status["services"]["mysql"] = f"error: {str(e)}"
        status["status"] = "degraded"
    # Kiểm tra MongoDB
    try:
        get_mongo().command("ping")
        status["services"]["mongodb"] = "ok"
    except Exception as e:
        status["services"]["mongodb"] = f"error: {str(e)}"
        status["status"] = "degraded"
    return status