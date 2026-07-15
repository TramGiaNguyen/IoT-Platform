# fastapi_backend/camera_service.py
# Encryption & RTSP URL utilities for camera management
# Webcam capture service for local device streaming

import os
import base64
import hashlib
import cv2
import uuid
import threading
import time
from io import BytesIO
from typing import Optional, Dict, List
from dataclasses import dataclass, field
from cryptography.fernet import Fernet

# ============================================================
# Fernet key derivation from env (works with shared secret)
# ============================================================
_CAMERA_SECRET = os.getenv("CAMERA_SECRET_KEY", "bdu-camera-secret-change-in-production-32b").encode()
_fernet_key = base64.urlsafe_b64encode(hashlib.sha256(_CAMERA_SECRET).digest())
_fernet = Fernet(_fernet_key)


def encrypt_password(plain: str) -> str:
    """Mã hoá password camera bằng Fernet (AES-128-CBC)."""
    if not plain:
        return ""
    return _fernet.encrypt(plain.encode()).decode()


def decrypt_password(cipher: str) -> str:
    """Giải mã password camera đã mã hoá Fernet."""
    if not cipher:
        return ""
    try:
        return _fernet.decrypt(cipher.encode()).decode()
    except Exception:
        return ""


def build_rtsp_url(
    ip_address: Optional[str],
    port: Optional[int],
    rtsp_path: Optional[str],
    username: Optional[str],
    password_enc: Optional[str],
) -> str:
    """
    Build a full RTSP URL from camera components.

    Supports:
      - rtsp://ip:port/path
      - rtsp://user:pass@ip:port/path  (if username/password provided)
      - Already-complete stream_url field used as-is
    """
    if not ip_address:
        return ""

    user = username or ""
    pwd = decrypt_password(password_enc or "")

    # Determine port
    p = port or 554

    # RFC 3986: userinfo must be percent-encoded (@ : / ? # etc. in password breaks parsing)
    def _qi(part: str) -> str:
        return quote(part, safe="")

    # Build auth prefix if credentials exist
    auth = ""
    if user and pwd:
        auth = f"{_qi(user)}:{_qi(pwd)}@"
    elif user:
        auth = f"{_qi(user)}@"

    # Build RTSP base
    rtsp = f"rtsp://{auth}{ip_address}:{p}"

    # Append path if provided
    path = (rtsp_path or "").strip().lstrip("/")
    if path:
        rtsp = f"{rtsp}/{path}"

    return rtsp


def build_stream_url(
    stream_url: Optional[str],
    ip_address: Optional[str],
    port: Optional[int],
    rtsp_path: Optional[str],
    username: Optional[str],
    password_enc: Optional[str],
) -> str:
    """
    Return the full stream URL for a camera.
    Priority: explicit stream_url > build from components.
    """
    if stream_url and stream_url.strip():
        return stream_url.strip()

    # Reconstruct from components
    return build_rtsp_url(ip_address, port, rtsp_path, username, password_enc)


# ============================================================
# Webcam Capture Service
# ============================================================

@dataclass
class WebcamConfig:
    """Configuration for a registered webcam."""
    id: str
    name: str
    device_index: int
    resolution_width: int = 640
    resolution_height: int = 480
    fps: int = 30
    enabled: bool = True


class WebcamCapture:
    """
    Singleton webcam capture service.
    Captures from local webcam and provides MJPEG stream.
    """
    _instance = None
    _lock = threading.Lock()

    def __new__(cls):
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    cls._instance = super().__new__(cls)
                    cls._instance._initialized = False
        return cls._instance

    def __init__(self):
        if self._initialized:
            return
        self._initialized = True
        self._webcams: Dict[str, WebcamConfig] = {}
        self._capture_threads: Dict[str, threading.Thread] = {}
        self._latest_frames: Dict[str, bytes] = {}
        self._stop_events: Dict[str, threading.Event] = {}
        self._frame_lock = threading.Lock()

    def register_webcam(
        self,
        name: str,
        device_index: int = 0,
        resolution_width: int = 640,
        resolution_height: int = 480,
        fps: int = 30
    ) -> WebcamConfig:
        """Register a new webcam."""
        webcam_id = f"webcam-{uuid.uuid4().hex[:8]}"
        config = WebcamConfig(
            id=webcam_id,
            name=name,
            device_index=device_index,
            resolution_width=resolution_width,
            resolution_height=resolution_height,
            fps=fps
        )
        self._webcams[webcam_id] = config
        return config

    def unregister_webcam(self, webcam_id: str) -> bool:
        """Unregister a webcam and stop its capture thread."""
        self.stop_capture(webcam_id)
        if webcam_id in self._webcams:
            del self._webcams[webcam_id]
            return True
        return False

    def list_webcams(self) -> List[WebcamConfig]:
        """List all registered webcams."""
        return list(self._webcams.values())

    def get_webcam(self, webcam_id: str) -> Optional[WebcamConfig]:
        """Get webcam config by ID."""
        return self._webcams.get(webcam_id)

    def start_capture(self, webcam_id: str) -> bool:
        """Start capturing from a webcam in background thread."""
        if webcam_id not in self._webcams:
            return False
        if webcam_id in self._capture_threads and self._capture_threads[webcam_id].is_alive():
            return True

        stop_event = threading.Event()
        self._stop_events[webcam_id] = stop_event

        thread = threading.Thread(
            target=self._capture_loop,
            args=(webcam_id, stop_event),
            daemon=True
        )
        self._capture_threads[webcam_id] = thread
        thread.start()
        return True

    def stop_capture(self, webcam_id: str) -> None:
        """Stop capturing from a webcam."""
        if webcam_id in self._stop_events:
            self._stop_events[webcam_id].set()
            if webcam_id in self._capture_threads:
                thread = self._capture_threads[webcam_id]
                if thread.is_alive():
                    thread.join(timeout=2)
            del self._stop_events[webcam_id]

    def get_frame(self, webcam_id: str) -> Optional[bytes]:
        """Get the latest frame for a webcam."""
        with self._frame_lock:
            return self._latest_frames.get(webcam_id)

    def _capture_loop(self, webcam_id: str, stop_event: threading.Event) -> None:
        """Background loop that captures frames from webcam."""
        config = self._webcams.get(webcam_id)
        if not config:
            return

        cap = None
        try:
            cap = cv2.VideoCapture(config.device_index)
            if not cap.isOpened():
                print(f"[WebcamCapture] Cannot open device {config.device_index}")
                return

            cap.set(cv2.CAP_PROP_FRAME_WIDTH, config.resolution_width)
            cap.set(cv2.CAP_PROP_FRAME_HEIGHT, config.resolution_height)
            cap.set(cv2.CAP_PROP_FPS, config.fps)

            frame_time = 1.0 / config.fps if config.fps > 0 else 0.033

            while not stop_event.is_set():
                ret, frame = cap.read()
                if not ret:
                    time.sleep(0.1)
                    continue

                _, buffer = cv2.imencode('.jpg', frame, [cv2.IMWRITE_JPEG_QUALITY, 85])
                jpeg_bytes = buffer.tobytes()

                with self._frame_lock:
                    self._latest_frames[webcam_id] = jpeg_bytes

                time.sleep(frame_time)

        except Exception as e:
            print(f"[WebcamCapture] Error capturing from {webcam_id}: {e}")
        finally:
            if cap:
                cap.release()

    @staticmethod
    def generate_mjpeg_frame(jpeg_bytes: bytes) -> bytes:
        """Wrap JPEG bytes in MJPEG multipart boundary."""
        return (
            b'--frame\r\n'
            b'Content-Type: image/jpeg\r\n'
            b'Content-Length: ' + str(len(jpeg_bytes)).encode() + b'\r\n\r\n' +
            jpeg_bytes +
            b'\r\n'
        )


# Global webcam capture instance
webcam_capture = WebcamCapture()


# ============================================================
# Client Stream Manager (for browser-sourced streams)
# ============================================================

class ClientStreamManager:
    """
    Manages streams received from browser clients.
    Browser sends video chunks via MediaRecorder, backend buffers and serves to other viewers.
    """
    _instance = None
    _lock = threading.Lock()

    def __new__(cls):
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    cls._instance = super().__new__(cls)
                    cls._instance._initialized = False
        return cls._instance

    def __init__(self):
        if self._initialized:
            return
        self._initialized = True
        self._streams: Dict[str, Dict] = {}
        self._stream_lock = threading.Lock()
        self._clients: Dict[str, List] = {}  # stream_id -> list of queue.Queue

    def register_stream(self, stream_id: str, owner_id: str, device_label: str = "") -> bool:
        """Register a new client stream."""
        with self._stream_lock:
            if stream_id in self._streams:
                return False
            self._streams[stream_id] = {
                "owner_id": owner_id,
                "device_label": device_label,
                "latest_frame": None,
                "last_update": time.time(),
                "active": True
            }
            self._clients[stream_id] = []
            return True

    def unregister_stream(self, stream_id: str) -> bool:
        """Unregister a client stream."""
        with self._stream_lock:
            if stream_id not in self._streams:
                return False
            del self._streams[stream_id]
            # Wake up all waiting clients
            for queue in self._clients.get(stream_id, []):
                queue.put(None)  # Sentinel to wake them up
            del self._clients[stream_id]
            return True

    def push_frame(self, stream_id: str, frame_data: bytes) -> bool:
        """Push a frame to the stream."""
        with self._stream_lock:
            if stream_id not in self._streams:
                return False
            self._streams[stream_id]["latest_frame"] = frame_data
            self._streams[stream_id]["last_update"] = time.time()
            # Broadcast to waiting clients
            for queue in self._clients.get(stream_id, []):
                try:
                    queue.put_nowait(frame_data)
                except:
                    pass
            return True

    def get_frame(self, stream_id: str, timeout: float = 1.0):
        """Get latest frame for a viewer."""
        import queue
        with self._stream_lock:
            if stream_id not in self._streams:
                return None
            if self._streams[stream_id]["latest_frame"]:
                return self._streams[stream_id]["latest_frame"]
            # No frame yet, wait for one
            q = queue.Queue()
            self._clients[stream_id].append(q)

        try:
            return q.get(timeout=timeout)
        except queue.Empty:
            return None
        finally:
            with self._stream_lock:
                if q in self._clients.get(stream_id, []):
                    self._clients[stream_id].remove(q)

    def list_streams(self):
        """List all active streams."""
        with self._stream_lock:
            return [
                {
                    "id": sid,
                    "owner_id": info["owner_id"],
                    "device_label": info["device_label"],
                    "active": info["active"],
                    "last_update": info["last_update"]
                }
                for sid, info in self._streams.items()
            ]

    def get_stream(self, stream_id: str):
        """Get stream info."""
        with self._stream_lock:
            return self._streams.get(stream_id)


# Global client stream manager
client_stream_manager = ClientStreamManager()
