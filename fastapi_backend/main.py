import os
import asyncio
from contextlib import asynccontextmanager
from fastapi import FastAPI, WebSocket, Request
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware
from routes import router
from websocket import websocket_endpoint, _redis_subscriber_loop

@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Phase 4 refactor:
    - Kafka consumer da tach sang service rieng `kafka_event_consumer` (xem docker-compose).
      Moi worker FastAPI KHONG con consume Kafka truc tiep nua.
    - Moi worker start 1 async task subscribe Redis Pub/Sub channel `ws:events`
      de forward event den WS clients cua worker do.
    - MongoDB index setup van chay 1 lan o day (idempotent, nhanh).
    - APScheduler cho zone aggregator van chay o day (lightweight, OK multi-worker
      vi job co lock idempotent trong `zone_aggregator.py`).
    """
    # Start WS Redis subscriber (1 task moi worker)
    asyncio.create_task(_redis_subscriber_loop())
    print("[LIFESPAN] Started WS Redis subscriber task")

    # Start Kafka discovery consumer (1 thread moi worker, idempotent flag trong cung process).
    # TODO Phase 5: tach service rieng de tranh duplicate khi co nhieu workers.
    try:
        from kafka_discovery import start_discovery_consumer_background
        start_discovery_consumer_background()
    except Exception as e:
        print(f"[LIFESPAN] Kafka discovery consumer start failed: {e}")

    # MongoDB index setup
    try:
        from database import get_mongo
        collection = get_mongo()["events"]
        indexes = collection.index_information()
        if "device_id_1_timestamp_-1" not in indexes:
            collection.create_index(
                [("device_id", 1), ("timestamp", -1)],
                name="device_id_1_timestamp_-1"
            )
        print("[MONGODB] Index ready")
    except Exception as e:
        print(f"[MONGODB] Index setup warning: {e}")

    # APScheduler cho zone aggregator (idempotent)
    try:
        from apscheduler.schedulers.background import BackgroundScheduler
        from zone_aggregator import aggregate_daily_zone_occupancy

        scheduler = BackgroundScheduler(timezone="Asia/Ho_Chi_Minh")
        scheduler.add_job(
            aggregate_daily_zone_occupancy,
            "cron",
            hour=0,
            minute=5,
            id="daily_zone_aggregator",
            replace_existing=True,
        )
        scheduler.start()
        print("[ZONE_AGG] Daily zone aggregator scheduler started (runs at 00:05 ICT)")
    except Exception as e:
        print(f"[ZONE_AGG] Scheduler start failed: {e}")

    yield

    # Shutdown hooks (neu can cleanup)
    try:
        from apscheduler.schedulers.background import BackgroundScheduler
        # Khong co reference giu scheduler, se bi GC khi process exit. OK.
    except Exception:
        pass


app = FastAPI(title="BDU IoT Platform API", lifespan=lifespan)

# CORS: Cho phep tat ca origins de ho tro LAN access
# Su dung middleware tuong thich voi credentials
_raw_origins = os.getenv(
    "ALLOWED_ORIGINS",
    "*"  # Mac dinh cho phep tat ca origins (LAN/dev)
)

if _raw_origins.strip() == "*":
    # Wildcard: cho phep tat ca origins nhung van ho tro Authorization header
    # Custom middleware thay vi CORSMiddleware mac dinh
    @app.middleware("http")
    async def cors_wildcard_middleware(request: Request, call_next):
        # Handle preflight OPTIONS request
        if request.method == "OPTIONS":
            origin = request.headers.get("origin", "*")
            access_control_request_method = request.headers.get("access-control-request-method", "*")
            access_control_request_headers = request.headers.get("access-control-request-headers", "*")
            from fastapi.responses import Response
            response = Response(status_code=200)
            response.headers["Access-Control-Allow-Origin"] = origin
            response.headers["Access-Control-Allow-Credentials"] = "true"
            response.headers["Access-Control-Allow-Methods"] = access_control_request_method
            response.headers["Access-Control-Allow-Headers"] = access_control_request_headers
            return response
        
        origin = request.headers.get("origin", "*")
        response = await call_next(request)
        response.headers["Access-Control-Allow-Origin"] = origin
        response.headers["Access-Control-Allow-Credentials"] = "true"
        response.headers["Access-Control-Allow-Methods"] = "*"
        response.headers["Access-Control-Allow-Headers"] = "*"
        return response
else:
    ALLOWED_ORIGINS = [o.strip() for o in _raw_origins.split(",") if o.strip()]
    app.add_middleware(
        CORSMiddleware,
        allow_origins=ALLOWED_ORIGINS,
        allow_credentials=True,
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