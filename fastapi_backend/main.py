from fastapi import FastAPI, WebSocket
from fastapi.middleware.cors import CORSMiddleware
from routes import router
from websocket import websocket_endpoint
from kafka_consumer import start_kafka_consumer_background

app = FastAPI(title="BDU IoT Platform API")

# Cho phép frontend (localhost:3000) gọi API (kể cả PUT/DELETE) với token
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000", "*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router)

app.add_api_websocket_route("/ws/events", websocket_endpoint)


@app.on_event("startup")
def _startup_kafka_consumer():
    """
    Khi FastAPI khởi động, chạy Kafka consumer ở background để
    thực hiện luồng KAFKA → FASTAPI theo kiến trúc mong muốn.
    """
    start_kafka_consumer_background()

@app.get("/")
def read_root():
    return {"message": "Welcome to Binh Duong IoT Platform API"}