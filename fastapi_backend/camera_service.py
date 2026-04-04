# fastapi_backend/camera_service.py
# Encryption & RTSP URL utilities for camera management

import os
import base64
import hashlib
from urllib.parse import quote
from cryptography.fernet import Fernet
from typing import Optional

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
