#!/bin/sh
python /workspace/update_password_hash.py || true
WORKERS=${UVICORN_WORKERS:-4}
exec uvicorn main:app --host 0.0.0.0 --port 8000 --workers "$WORKERS"
