"""
ai_analyst — Room AI analytics service
YOLO11s + ByteTrack for people detection and tracking.
Streams annotated MJPEG and periodically reports people count to FastAPI backend.
"""

import os
import time
import threading
import logging
import uuid
import queue
from typing import Optional, List, Tuple, Any

import cv2
import numpy as np
import httpx
from fastapi import FastAPI, HTTPException
from fastapi.responses import StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

# Ultralytics + ByteTrack
import torch
from ultralytics import YOLO

# ============================================================
# Configuration
# ============================================================
IOT_PLATFORM_URL = os.getenv("IOT_PLATFORM_URL", "http://fastapi-backend:8000").rstrip("/")
INTERNAL_API_KEY = os.getenv("INTERNAL_API_KEY", "internal-rule-engine-key-change-in-production")
AI_ANALYST_PORT = int(os.getenv("AI_ANALYST_PORT", "8101"))

# YOLO model size: 'n'(nano) / 's'(small) / 'm' / 'l' / 'x'
YOLO_MODEL_SIZE = os.getenv("YOLO_MODEL_SIZE", "yolo11s.pt")

# Occupancy report interval in seconds
OCCUPANCY_REPORT_INTERVAL = float(os.getenv("OCCUPANCY_REPORT_INTERVAL", "1.0"))

# COCO person class id
PERSON_CLASS_ID = 0

# FPS target for MJPEG stream (process every N frames)
STREAM_FPS_DIVISOR = int(os.getenv("STREAM_FPS_DIVISOR", "2"))

# Người nhỏ trong khung (camera góc cao / xa): conf quá cao → không bbox
CONF_THRESHOLD = float(os.getenv("CONF_THRESHOLD", "0.25"))

# Kích thước suy luận; 640 hay bỏ sót người xa — 960–1280 hợp camera giám sát
YOLO_IMGSZ = int(os.getenv("YOLO_IMGSZ", "960"))

# RTSP từ container: UDP thường fail qua NAT; TCP ổn định hơn (Dahua/Hikvision…)
if not os.environ.get("OPENCV_FFMPEG_CAPTURE_OPTIONS"):
    os.environ["OPENCV_FFMPEG_CAPTURE_OPTIONS"] = "rtsp_transport;tcp|stimeout;8000000"

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("ai_analyst")


# ============================================================
# FastAPI app
# ============================================================
app = FastAPI(title="AI Analyst — Room Analytics", version="1.0.0")

# CORS middleware - allow React dashboard to call this service
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, specify exact origins
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ============================================================
# Pydantic models
# ============================================================
class SessionStartRequest(BaseModel):
    room_id: int
    camera_id: int


class SessionStartResponse(BaseModel):
    session_id: str
    room_id: int
    camera_id: int


class SessionStatus(BaseModel):
    session_id: str
    room_id: int
    camera_id: int
    status: str  # 'starting' | 'running' | 'stopping' | 'error'
    so_nguoi: int
    fps: Optional[float] = None
    error: Optional[str] = None


# ============================================================
# Session state
# ============================================================
# (x1, y1, x2, y2, track_id | None) — tọa độ theo frame gốc từ camera
OverlayBox = Tuple[float, float, float, float, Optional[int]]


class CaptureSession:
    """
    Hai luồng tách biệt:
    - Capture: chỉ đọc RTSP + vẽ box từ kết quả mới nhất + encode MJPEG (luôn mượt).
    - Inference: lấy frame mới nhất từ queue, chạy YOLO+ByteTrack (không chặn đọc camera).

    Trước đây gọi model.track() trong cùng vòng lặp với read() → trong lúc YOLO chạy
    không có frame mới → MJPEG lặp một JPEG → hình “đứng im”.
    """

    def __init__(
        self,
        session_id: str,
        room_id: int,
        camera_id: int,
        stream_url: str,
    ):
        self.session_id = session_id
        self.room_id = room_id
        self.camera_id = camera_id
        self.stream_url = stream_url

        self.status = "starting"
        self.so_nguoi = 0
        self.fps: Optional[float] = None
        self.error: Optional[str] = None

        self._cap: Optional[cv2.VideoCapture] = None
        self._capture_thread: Optional[threading.Thread] = None
        self._infer_thread: Optional[threading.Thread] = None
        self._stop_event = threading.Event()
        self._latest_frame = None
        self._frame_lock = threading.Lock()
        self._infer_queue = queue.Queue(maxsize=1)
        self._state_lock = threading.Lock()
        self._overlay_boxes: List[OverlayBox] = []

        self._count_history: list[int] = []
        self._history_maxlen = 5

    def start(self, model: YOLO, device: Any) -> bool:
        """Mở RTSP và chạy hai thread capture + inference."""
        self._cap = cv2.VideoCapture(self.stream_url)
        if not self._cap.isOpened():
            self.error = f"Cannot open stream: {self.stream_url}"
            self.status = "error"
            logger.error("[%s] %s", self.session_id, self.error)
            return False

        self._capture_thread = threading.Thread(
            target=self._capture_loop, daemon=True, name=f"cap-{self.session_id}"
        )
        self._infer_thread = threading.Thread(
            target=self._infer_loop,
            args=(model, device),
            daemon=True,
            name=f"infer-{self.session_id}",
        )
        self._capture_thread.start()
        self._infer_thread.start()
        self.status = "running"
        logger.info(
            "[%s] Session started camera=%s device=%s",
            self.session_id,
            self.camera_id,
            device,
        )
        return True

    def _capture_loop(self):
        fps_time = time.time()
        n_reads = 0
        while not self._stop_event.is_set():
            ret, frame = self._cap.read()
            if not ret:
                logger.warning("[%s] Stream disconnected, retrying...", self.session_id)
                time.sleep(2)
                self._cap.release()
                self._cap = cv2.VideoCapture(self.stream_url)
                if not self._cap.isOpened():
                    self.error = "Stream reconnection failed"
                    self.status = "error"
                    break
                continue

            n_reads += 1

            try:
                self._infer_queue.put_nowait(frame.copy())
            except queue.Full:
                try:
                    self._infer_queue.get_nowait()
                except queue.Empty:
                    pass
                try:
                    self._infer_queue.put_nowait(frame.copy())
                except queue.Full:
                    pass

            with self._state_lock:
                boxes = list(self._overlay_boxes)

            # Sắp xếp theo y_center (từ trên xuống, trái sang) → nhãn 1..N nhất quán
            boxes_sorted = sorted(
                boxes,
                key=lambda b: (float(b[1]) + float(b[3])) / 2.0,
            )

            vis = frame.copy()
            for idx, b in enumerate(boxes_sorted):
                x1, y1, x2, y2 = float(b[0]), float(b[1]), float(b[2]), float(b[3])
                label = str(idx + 1)
                # Background cho text để nổi trên nền
                (tw, th), _ = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, 0.65, 2)
                cv2.rectangle(vis, (int(x1), int(y1) - th - 8), (int(x1) + tw + 6, int(y1)), (34, 211, 238), -1)
                cv2.rectangle(vis, (int(x1), int(y1)), (int(x2), int(y2)), (34, 211, 238), 2)
                cv2.putText(
                    vis,
                    label,
                    (int(x1) + 2, int(y1) - 4),
                    cv2.FONT_HERSHEY_SIMPLEX,
                    0.65,
                    (0, 0, 0),
                    2,
                )

            h, w = vis.shape[:2]
            preview = vis
            if max(h, w) > 1280:
                s = 1280.0 / max(h, w)
                preview = cv2.resize(vis, (int(w * s), int(h * s)))

            ok, buf = cv2.imencode(".jpg", preview, [cv2.IMWRITE_JPEG_QUALITY, 72])
            if ok:
                with self._frame_lock:
                    self._latest_frame = buf.tobytes()

            now = time.time()
            if now - fps_time >= 1.0:
                self.fps = round(n_reads / (now - fps_time), 1)
                n_reads = 0
                fps_time = now

        if self._cap:
            self._cap.release()
            self._cap = None

    def _infer_loop(self, model: YOLO, device: Any):
        # FP16 đôi khi làm mất detection trên một số GPU/driver — mặc định tắt, bật YOLO_HALF=1 nếu cần tốc độ
        use_half = (
            os.getenv("YOLO_HALF", "0").lower() in ("1", "true", "yes")
            and device not in (None, "cpu")
        )
        infer_tick = 0
        _zero_log_t = 0.0
        while not self._stop_event.is_set():
            try:
                frame = self._infer_queue.get(timeout=0.5)
            except queue.Empty:
                continue
            infer_tick += 1
            if STREAM_FPS_DIVISOR > 1 and infer_tick % STREAM_FPS_DIVISOR != 0:
                continue

            im = np.ascontiguousarray(frame)

            _pred_kw = dict(
                conf=CONF_THRESHOLD,
                iou=0.5,
                imgsz=YOLO_IMGSZ,
                verbose=False,
                classes=[PERSON_CLASS_ID],
                device=device,
                half=bool(use_half),
                stream=False,
            )

            results = None
            try:
                results = model.track(
                    im,
                    persist=True,
                    tracker=os.getenv("YOLO_TRACKER", "bytetrack.yaml"),
                    **_pred_kw,
                )
            except Exception as exc:
                logger.exception("[%s] YOLO track failed: %s", self.session_id, exc)

            boxes_out: List[OverlayBox] = []
            so = 0

            def _boxes_from_result(r) -> tuple[List[OverlayBox], int]:
                out: List[OverlayBox] = []
                if r.boxes is None or len(r.boxes) == 0:
                    return out, 0
                xyxy = r.boxes.xyxy.cpu().numpy()
                ids_arr = None
                if r.boxes.id is not None:
                    ids_arr = r.boxes.id.cpu().numpy().reshape(-1)
                tids: set[int] = set()
                for i in range(len(xyxy)):
                    row = xyxy[i]
                    x1, y1, x2, y2 = float(row[0]), float(row[1]), float(row[2]), float(row[3])
                    tid: Optional[int] = None
                    if ids_arr is not None and i < len(ids_arr):
                        tid = int(ids_arr[i])
                        tids.add(tid)
                    out.append((x1, y1, x2, y2, tid))
                cnt = len(tids) if tids else len(xyxy)
                return out, cnt

            if results and len(results) > 0:
                boxes_out, so = _boxes_from_result(results[0])

            # ByteTrack có thể loại hết box nếu bytetrack.yaml / ngưỡng tracker không khớp conf — fallback detect
            if not boxes_out:
                try:
                    pred = model.predict(im, **_pred_kw)
                    if pred and len(pred) > 0:
                        boxes_out, so = _boxes_from_result(pred[0])
                        for i, b in enumerate(boxes_out):
                            x1, y1, x2, y2, _ = b
                            boxes_out[i] = (x1, y1, x2, y2, i)
                except Exception as exc:
                    logger.exception("[%s] YOLO predict fallback failed: %s", self.session_id, exc)

            now = time.time()
            if not boxes_out and now - _zero_log_t > 30:
                logger.warning(
                    "[%s] 30s: chua co detection nguoi (conf=%s imgsz=%s). "
                    "Thu giam CONF_THRESHOLD hoac tang YOLO_IMGSZ.",
                    self.session_id,
                    CONF_THRESHOLD,
                    YOLO_IMGSZ,
                )
                _zero_log_t = now
            elif boxes_out:
                _zero_log_t = now

            with self._state_lock:
                self._overlay_boxes = boxes_out
                self.so_nguoi = so
                self._count_history.append(so)
                if len(self._count_history) > self._history_maxlen:
                    self._count_history.pop(0)

    def get_jpeg_bytes(self) -> Optional[bytes]:
        with self._frame_lock:
            return self._latest_frame

    def stop(self):
        self._stop_event.set()
        if self._capture_thread and self._capture_thread.is_alive():
            self._capture_thread.join(timeout=10)
        if self._infer_thread and self._infer_thread.is_alive():
            self._infer_thread.join(timeout=10)
        self.status = "stopping"
        logger.info("[%s] Session stopped", self.session_id)

    def get_status(self) -> SessionStatus:
        with self._state_lock:
            hist = list(self._count_history)
        smoothed = (
            int(round(sum(hist) / len(hist))) if hist else 0
        )
        return SessionStatus(
            session_id=self.session_id,
            room_id=self.room_id,
            camera_id=self.camera_id,
            status=self.status,
            so_nguoi=smoothed,
            fps=self.fps,
            error=self.error,
        )


# Global state
_active_sessions: dict[str, CaptureSession] = {}
_model: Optional[YOLO] = None
_startup_lock = threading.Lock()
_placeholder_jpeg: Optional[bytes] = None


def _get_placeholder_jpeg() -> bytes:
    """JPEG tạm khi chưa có frame từ camera (tránh img <img> lỗi / stream rỗng)."""
    global _placeholder_jpeg
    if _placeholder_jpeg is None:
        img = np.zeros((360, 640, 3), dtype=np.uint8)
        cv2.putText(
            img,
            "Dang ket noi camera / dang xu ly...",
            (40, 180),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.65,
            (180, 180, 180),
            2,
        )
        ok, buf = cv2.imencode(".jpg", img, [cv2.IMWRITE_JPEG_QUALITY, 70])
        _placeholder_jpeg = buf.tobytes() if ok else b""
    return _placeholder_jpeg


_cached_infer_device: Optional[Any] = None


def _get_inference_device():
    """Ultralytics: device=0 khi có GPU; ngược lại 'cpu'."""
    global _cached_infer_device
    if _cached_infer_device is not None:
        return _cached_infer_device
    if torch.cuda.is_available():
        logger.info("CUDA: %s", torch.cuda.get_device_name(0))
        _cached_infer_device = 0
    else:
        logger.warning(
            "CUDA không khả dụng trong process này — chạy CPU. "
            "Với Docker: NVIDIA Container Toolkit + nvidia runtime + image CUDA (xem ai_analyst/Dockerfile)."
        )
        _cached_infer_device = "cpu"
    return _cached_infer_device


def _get_model() -> YOLO:
    global _model
    if _model is None:
        with _startup_lock:
            if _model is None:
                logger.info("Loading YOLO model: %s", YOLO_MODEL_SIZE)
                _model = YOLO(YOLO_MODEL_SIZE)
                if torch.cuda.is_available():
                    _model.to("cuda:0")
                    logger.info("Model đã chuyển lên cuda:0")
                else:
                    logger.info("Model trên CPU")
    return _model


def _fetch_stream_url(room_id: int, camera_id: int) -> str:
    """Ask FastAPI backend for the decrypted RTSP URL."""
    resp = httpx.get(
        f"{IOT_PLATFORM_URL}/rooms/{room_id}/cameras/{camera_id}/stream-url",
        headers={"X-Internal-Key": INTERNAL_API_KEY},
        timeout=10,
    )
    if resp.status_code != 200:
        raise HTTPException(
            status_code=502,
            detail=f"Backend returned {resp.status_code}: {resp.text}",
        )
    data = resp.json()
    url = data.get("stream_url", "")
    if not url:
        raise HTTPException(status_code=400, detail="Backend returned empty stream_url")
    
    logger.info("Stream URL ready for camera %s (length=%s)", camera_id, len(url))
    return url


def _report_occupancy(room_id: int, camera_id: int, so_nguoi: int):
    """Send people count to FastAPI backend."""
    try:
        httpx.post(
            f"{IOT_PLATFORM_URL}/internal/ai/occupancy",
            json={
                "phong_id": room_id,
                "phong_camera_id": camera_id,
                "so_nguoi": so_nguoi,
                "count_type": "camera",
                "nguon": "ai_analyst",
            },
            headers={"X-Internal-Key": INTERNAL_API_KEY},
            timeout=5,
        )
    except Exception as e:
        logger.warning(f"Failed to report occupancy: {e}")


def _occupancy_reporter_loop(session: CaptureSession):
    """Background thread that periodically reports people count."""
    while session.status == "running" and not session._stop_event.is_set():
        time.sleep(OCCUPANCY_REPORT_INTERVAL)
        if session.status == "running":
            so_nguoi = session.so_nguoi
            _report_occupancy(session.room_id, session.camera_id, so_nguoi)


# ============================================================
# Health check
# ============================================================
@app.get("/health")
def health_check():
    return {
        "status": "ok",
        "model_loaded": _model is not None,
        "active_sessions": len(_active_sessions),
    }


# ============================================================
# Session management
# ============================================================

def _ensure_session(room_id: int, camera_id: int) -> tuple[str, bool]:
    """
    Đảm bảo session đang chạy cho room+camera.
    Trả về (session_id, created) — created=True nếu mới tạo, False nếu đã có.
    Dùng chung cho HTTP endpoint và background watch loop.
    """
    for sid, sess in _active_sessions.items():
        if sess.room_id == room_id and sess.camera_id == camera_id:
            if sess.status == "running":
                logger.info("[BG] Session %s already running for room=%s camera=%s", sid, room_id, camera_id)
                return sid, False
            else:
                del _active_sessions[sid]

    session_id = str(uuid.uuid4())[:8]
    try:
        stream_url = _fetch_stream_url(room_id, camera_id)
    except Exception as e:
        logger.exception("[BG] Failed to get stream URL for room=%s camera=%s", room_id, camera_id)
        raise HTTPException(status_code=500, detail=f"Failed to get stream URL: {e}")

    model = _get_model()
    device = _get_inference_device()
    session = CaptureSession(session_id, room_id, camera_id, stream_url)
    if not session.start(model, device):
        logger.error("[BG] Session start failed for room=%s camera=%s: %s", room_id, camera_id, session.error)
        raise HTTPException(status_code=502, detail=session.error or "Failed to start capture")

    _active_sessions[session_id] = session
    threading.Thread(target=_occupancy_reporter_loop, args=(session,), daemon=True).start()
    logger.info("[BG] Session %s created for room=%s camera=%s", session_id, room_id, camera_id)
    return session_id, True


@app.post("/sessions/start", response_model=SessionStartResponse)
def start_session(body: SessionStartRequest):
    """Start a new capture session for a camera (HTTP-triggered)."""
    session_id, _ = _ensure_session(body.room_id, body.camera_id)
    return SessionStartResponse(session_id=session_id, room_id=body.room_id, camera_id=body.camera_id)


@app.get("/sessions/lookup")
def lookup_session(room_id: int, camera_id: int):
    """Tra cứu session_id đang chạy cho room+camera, dùng cho UI tự gắn stream."""
    for sid, sess in _active_sessions.items():
        if sess.room_id == room_id and sess.camera_id == camera_id and sess.status == "running":
            return {"session_id": sid, "status": "running"}
    raise HTTPException(status_code=404, detail="No active session for this camera")


@app.get("/sessions/{session_id}/status", response_model=SessionStatus)
def get_session_status(session_id: str):
    if session_id not in _active_sessions:
        raise HTTPException(status_code=404, detail="Session not found")
    return _active_sessions[session_id].get_status()


@app.post("/sessions/{session_id}/stop")
def stop_session(session_id: str):
    session = _active_sessions.pop(session_id, None)
    if session is None:
        raise HTTPException(status_code=404, detail="Session not found")
    try:
        session.stop()
    except Exception as e:
        logger.exception("stop_session failed: %s", session_id)
        raise HTTPException(status_code=500, detail=str(e)) from e
    return {"message": "stopped", "session_id": session_id}


@app.get("/sessions/{session_id}/stream.mjpeg")
def mjpeg_stream(session_id: str):
    """MJPEG stream with YOLO bounding boxes and track IDs."""
    if session_id not in _active_sessions:
        raise HTTPException(status_code=404, detail="Session not found")

    session = _active_sessions[session_id]

    def generate():
        while session.status == "running":
            frame_bytes = session.get_jpeg_bytes()
            if frame_bytes is None:
                frame_bytes = _get_placeholder_jpeg()
            if not frame_bytes:
                time.sleep(0.05)
                continue

            yield (b"--frame\r\n"
                   b"Content-Type: image/jpeg\r\n"
                   b"Content-Length: %d\r\n\r\n" % len(frame_bytes)
                   + frame_bytes
                   + b"\r\n")

            # ~30 fps cap
            time.sleep(0.033)

        logger.info(f"[{session_id}] MJPEG stream ended")

    return StreamingResponse(
        generate(),
        media_type="multipart/x-mixed-replace; boundary=frame",
    )


# ============================================================
# Background: duy trì session AI 24/7 cho tất cả camera active
# ============================================================
_ROOM_AI_BACKGROUND = os.getenv("ROOM_AI_BACKGROUND", "0") == "1"
_WATCH_INTERVAL = float(os.getenv("ROOM_AI_WATCH_INTERVAL", "30"))


def _background_watch_loop():
    """Thread nền: định kỳ đọc camera-watch-list từ FastAPI, đảm bảo session đang chạy."""
    while True:
        time.sleep(_WATCH_INTERVAL)
        try:
            resp = httpx.get(
                f"{IOT_PLATFORM_URL}/internal/ai/camera-watch-list",
                headers={"X-Internal-Key": INTERNAL_API_KEY},
                timeout=15,
            )
            if resp.status_code != 200:
                logger.warning("[BG-WATCH] FastAPI returned %s: %s", resp.status_code, resp.text)
                continue
            cameras = resp.json().get("cameras", [])
            for cam in cameras:
                rid = int(cam["phong_id"])
                cid = int(cam["camera_id"])
                try:
                    _ensure_session(rid, cid)
                except Exception as exc:
                    logger.warning("[BG-WATCH] Could not ensure session room=%s cam=%s: %s", rid, cid, exc)
        except Exception as exc:
            logger.exception("[BG-WATCH] Watch loop error: %s", exc)


# ============================================================
# Startup: pre-load model
# ============================================================
@app.on_event("startup")
def _load_model():
    threading.Thread(target=_get_model, daemon=True).start()
    if _ROOM_AI_BACKGROUND:
        threading.Thread(target=_background_watch_loop, daemon=True, name="bg-watch").start()
        logger.info("AI Analyst service started — BACKGROUND mode ON (watching all active cameras)")
    else:
        logger.info("AI Analyst service started on port %s (no background watch)", AI_ANALYST_PORT)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=AI_ANALYST_PORT)
