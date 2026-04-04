# Dockerfile for ai_analyst GPU service
# Requires NVIDIA Container Toolkit on the host + nvidia runtime in docker-compose

FROM nvidia/cuda:12.4.1-runtime-ubuntu22.04

ENV DEBIAN_FRONTEND=noninteractive
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV TZ=Asia/Ho_Chi_Minh

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3.10 python3.10-venv python3-pip \
    libgl1-mesa-glx libglib2.0-0 libsm6 libxext6 libxrender-dev \
    libgomp1 ffmpeg \
    && rm -rf /var/lib/apt/lists/*

# Create venv and install Python deps
WORKDIR /app
RUN python3.10 -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

# Install Python packages
# PyTorch first (custom index URL for CUDA 12.4 wheels, --trusted-host to skip hash issues)
RUN pip install --no-cache-dir --index-url https://download.pytorch.org/whl/cu124 --trusted-host download.pytorch.org torch==2.4.0 torchvision==0.19.0
RUN pip install --no-cache-dir \
    fastapi==0.115.0 \
    uvicorn[standard]==0.30.0 \
    pydantic==2.9.0 \
    pydantic-settings==2.5.0 \
    "numpy<2.0" \
    opencv-python-headless==4.10.0.84 \
    ultralytics==8.3.0 \
    paho-mqtt==1.6.1 \
    httpx==0.27.0 \
    python-multipart==0.0.9

# Copy application code
COPY . /app/

# Pre-download YOLO11s model so first inference is fast
RUN python3 -c "from ultralytics import YOLO; YOLO('yolo11s.pt')" || true

EXPOSE 8101

# Healthcheck
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD python3 -c "import httpx; httpx.get('http://localhost:8101/health', timeout=5)" || exit 1

CMD ["python3", "-m", "uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8101"]
