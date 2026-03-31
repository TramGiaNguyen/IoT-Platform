from datetime import datetime, timedelta

from fastapi import Depends, HTTPException, Header
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from jose import JWTError, jwt
from passlib.context import CryptContext
from typing import Optional

from database import get_mysql

import os

SECRET_KEY = os.getenv("JWT_SECRET_KEY", "secret-bdu-key-change-in-production")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("JWT_EXPIRE_MINUTES", "60"))

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/token")
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def verify_password(plain: str, hashed: str) -> bool:
    """So sánh mật khẩu người dùng nhập với hash lưu trong DB (bcrypt)."""
    return pwd_context.verify(plain, hashed)


def authenticate_user(username: str, password: str):
    """
    Xác thực người dùng dựa trên bảng nguoi_dung trong MySQL (iot_data).

    - username: tên người dùng (ten) trong DB
    - password: mật khẩu gốc tương ứng với mat_khau_hash trong DB
    """
    conn = get_mysql()
    try:
        cursor = conn.cursor(dictionary=True)
        cursor.execute(
            "SELECT id, ten, email, mat_khau_hash, vai_tro FROM nguoi_dung WHERE ten = %s LIMIT 1",
            (username,),
        )
        user = cursor.fetchone()
        
        if not user:
            return False

        if not verify_password(password, user["mat_khau_hash"]):
            return False
        
        # Get allowed pages for non-admin users
        allowed_pages = []
        if user["vai_tro"] == "admin":
            allowed_pages = ["*"]  # Admin has all permissions
        else:
            try:
                cursor.execute(
                    "SELECT trang FROM quyen_trang WHERE nguoi_dung_id = %s",
                    (user["id"],)
                )
                allowed_pages = [row["trang"] for row in cursor.fetchall()]
            except Exception:
                # Table might not exist yet, return empty permissions
                allowed_pages = []
        
        # Trả về thông tin user tối thiểu để tạo token / logging
        return {
            "id": user["id"],
            "ten": user["ten"],
            "email": user["email"],
            "vai_tro": user["vai_tro"],
            "allowed_pages": allowed_pages,
        }
    finally:
        cursor.close()
        conn.close()


def create_access_token(data: dict):
    expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    data.update({"exp": expire})
    return jwt.encode(data, SECRET_KEY, algorithm=ALGORITHM)


def get_current_user(token: str = Depends(oauth2_scheme)):
    """
    Lấy email user từ JWT token.

    Ở bản đơn giản này, token lưu `sub` = email; nếu cần
    có thể mở rộng để truy vấn lại DB lấy đủ thông tin.
    """
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username = payload.get("sub")
        if username is None:
            raise HTTPException(status_code=401, detail="Invalid token")
        return username
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid token")


def get_current_user_or_internal(
    x_internal_key: Optional[str] = Header(None, alias="X-Internal-Key"),
    authorization: Optional[str] = Header(None)
):
    """
    Auth cho internal services (rule_engine, etc.) hoặc user JWT.
    
    - Nếu có X-Internal-Key header và khớp với INTERNAL_API_KEY env → bypass auth
    - Nếu không → validate JWT token như bình thường
    """
    import os
    import logging
    
    internal_key = os.getenv("INTERNAL_API_KEY", "")
    
    # Debug logging
    logging.info(f"[AUTH] Internal key check: env_key_set={bool(internal_key)}, header_key_set={bool(x_internal_key)}, match={internal_key == x_internal_key if internal_key and x_internal_key else False}")
    
    # Check internal key first
    if internal_key and x_internal_key and x_internal_key == internal_key:
        # Internal service call - return system user
        logging.info("[AUTH] Internal key validated - allowing system@internal")
        return "system@internal"
    
    # Fallback to JWT validation
    if not authorization:
        logging.warning(f"[AUTH] No valid internal key and no Authorization header - rejecting")
        raise HTTPException(status_code=401, detail="Missing authentication")
    
    # Extract token from "Bearer <token>"
    token = None
    if authorization.startswith("Bearer "):
        token = authorization[7:]
    else:
        token = authorization
    
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username = payload.get("sub")
        if username is None:
            raise HTTPException(status_code=401, detail="Invalid token")
        return username
    except JWTError as e:
        logging.warning(f"[AUTH] JWT validation failed: {e}")
        raise HTTPException(status_code=401, detail="Invalid token")