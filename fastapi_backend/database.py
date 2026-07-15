# fastapi_backend/database.py

import os
import threading
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

# Phase 4: doc pool_size tu env (mac dinh 50/worker).
# Khi tang workers, tong connection = workers * pool_size.
# VD: 4 workers * 50 = 200 → can MySQL max_connections >= 200.
MYSQL_POOL_SIZE = int(os.getenv("MYSQL_POOL_SIZE", "50"))

_mysql_pool = None

def _get_pool():
    global _mysql_pool
    if _mysql_pool is None:
        _mysql_pool = mysql.connector.pooling.MySQLConnectionPool(
            pool_name="iot_pool",
            pool_size=MYSQL_POOL_SIZE,
            pool_reset_session=True,
            **_MYSQL_CONFIG
        )
    return _mysql_pool

def get_mysql():
    """Lay connection tu pool. Sau khi dung xong PHAI goi conn.close() de tra ve pool."""
    return _get_pool().get_connection()


# ============================================================
# MongoDB – dung MongoClient singleton (da co connection pooling noi bo)
# ============================================================
_MONGO_URI = os.getenv("MONGO_URI", "mongodb://mongodb:27017")
_mongo_client = None

def _get_mongo_client():
    global _mongo_client
    if _mongo_client is None:
        _mongo_client = MongoClient(_MONGO_URI)
    return _mongo_client

def get_mongo():
    """Tra ve MongoDB database 'iot'. Client duoc tai su dung (singleton)."""
    return _get_mongo_client().iot


# ============================================================
# Redis – Connection singleton cho cache
# ============================================================
_REDIS_CONFIG = {
    "host":     os.getenv("REDIS_HOST", "redis"),
    "port":     int(os.getenv("REDIS_PORT", 6379)),
    "db":       0,
    "decode_responses": True,
    "socket_connect_timeout": 1,
    "socket_timeout": 1,
    "health_check_interval": 30,
    "retry_on_timeout": False,
}

_redis_client = None
_redis_lock = threading.Lock()

def get_redis():
    """Tra ve Redis client. Tu re-init neu connection bi broken."""
    global _redis_client
    if _redis_client is not None:
        try:
            _redis_client.ping()
        except Exception:
            with _redis_lock:
                _redis_client = None
    if _redis_client is None:
        with _redis_lock:
            if _redis_client is None:
                try:
                    import redis as _redis_lib
                    _redis_client = _redis_lib.Redis(**_REDIS_CONFIG)
                    _redis_client.ping()
                except Exception as e:
                    print(f"[REDIS] Khong ket noi duoc: {e}")
                    _redis_client = None
    return _redis_client
