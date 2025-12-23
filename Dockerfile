# Dockerfile (for FastAPI Backend)
FROM python:3.10-slim

WORKDIR /app

COPY ./fastapi_backend /app
COPY requirements.txt ./

RUN pip install --no-cache-dir -r requirements.txt

CMD ["uvicorn", "full_app:app", "--host", "0.0.0.0", "--port", "8000"]


# Dockerfile (for React Frontend)
# Place in react_dashboard/
FROM node:18-alpine

WORKDIR /app

COPY react_dashboard/package.json ./
COPY react_dashboard/.env ./
RUN npm install

COPY react_dashboard ./

CMD ["npm", "start"]
