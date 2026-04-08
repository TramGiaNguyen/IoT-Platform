# ============================================================
# Build: docker compose build frontend
# Sau khi code thay đổi, BẮT BUỘC rebuild image để bundle mới được deploy:
#   docker compose build frontend && docker compose up -d frontend
# Trình duyệt cũng nên hard-refresh (Ctrl+Shift+R / Cmd+Shift+R) để tránh cache bundle cũ.
# ============================================================
FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

EXPOSE 3000
CMD ["npm", "start"]
