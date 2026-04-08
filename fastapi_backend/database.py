# fastapi_backend/database.py

import os
import mysql.connector.pooling
from pymongo import MongoClient

# ============================================================
# MySQL – Connection Pool (tránh tạo mới connection mỗi request)
# ============================================================
_MYSQL_CONFIG = {
    "host":     os.getenv("MYSQL_HOST", "mysql"),
    "user":     os.getenv("MYSQL_USER", "iot"),
    "password": os.getenv("MYSQL_PASSWORD", "iot123"),
    "database": os.getenv("MYSQL_DATABASE", "iot_data"),
}

_mysql_pool = None

def _get_pool():
    global _mysql_pool
    if _mysql_pool is None:
        _mysql_pool = mysql.connector.pooling.MySQLConnectionPool(
            pool_name="iot_pool",
            pool_size=25,
            pool_reset_session=True,
            **_MYSQL_CONFIG
        )
    return _mysql_pool

def get_mysql():
    """Lấy connection từ pool. Sau khi dùng xong PHẢI gọi conn.close() để trả về pool."""
    return _get_pool().get_connection()


# ============================================================
# MongoDB – dùng MongoClient singleton (đã có connection pooling nội bộ)
# ============================================================
_MONGO_URI = os.getenv("MONGO_URI", "mongodb://mongodb:27017")
_mongo_client = None

def _get_mongo_client():
    global _mongo_client
    if _mongo_client is None:
        _mongo_client = MongoClient(_MONGO_URI)
    return _mongo_client

def get_mongo():
    """Trả về MongoDB database 'iot'. Client được tái sử dụng (singleton)."""
    return _get_mongo_client().iot


# ============================================================
# Redis – Connection singleton cho cache
# ============================================================
_REDIS_CONFIG = {
    "host":     os.getenv("REDIS_HOST", "redis"),
    "port":     int(os.getenv("REDIS_PORT", 6379)),
    "db":       0,
    "decode_responses": True,
}

_redis_client = None

def get_redis():
    """Trả về Redis client singleton. Nếu Redis không khả dụng, trả None (graceful degradation)."""
    global _redis_client
    if _redis_client is None:
        try:
            import redis as _redis_lib
            _redis_client = _redis_lib.Redis(**_REDIS_CONFIG)
            _redis_client.ping()  # verify connection
        except Exception as e:
            print(f"[REDIS] Không kết nối được: {e}")
            _redis_client = None
    return _redis_client