// react_dashboard/src/App.js
(imported code as above)

// react_dashboard/README.md

# BDU IoT Platform – React Dashboard

This is the frontend for the Binh Duong IoT Platform Phase 1. It connects to a FastAPI backend with JWT authentication and WebSocket-based real-time data.

## 📦 Features
- ✅ User Login with JWT (via `/token` API)
- 📋 Device list fetched from `/devices`
- 📡 Real-time data updates using WebSocket from `/ws/events`
- 📊 View sensor data (temperature, humidity) from `/events/{device_id}`

## 🛠️ Requirements
- Node.js >= 14.x
- NPM >= 6.x

## 🚀 Installation
```bash
cd react_dashboard
npm install
npm start
```

## 🌐 Configuration (optional)
You can change the API base URL by creating a `.env` file:

```env
REACT_APP_API_BASE=http://localhost:8000
```

## 📂 Project Structure
```
react_dashboard/
├── public/
│   └── index.html
├── src/
│   ├── App.js          ← Main UI logic
│   ├── index.js        ← Entry point
│   ├── services.js     ← API services
├── package.json
├── .env (optional)
└── README.md
```

## ✅ Default Credentials
- Username: `admin`
- Password: `admin123`

## 📄 License
AIDTI - BDU 2025
