import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles/style.css';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);


import axios from 'axios';

const API_BASE = process.env.REACT_APP_API_BASE || 'http://localhost:8000';

export const login = (username, password) =>
  axios.post(`${API_BASE}/token`, new URLSearchParams({ username, password }), {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  });

export const fetchDevices = (token) =>
  axios.get(`${API_BASE}/devices`, {
    headers: { Authorization: `Bearer ${token}` },
  });

export const fetchDeviceEvents = (deviceId, token) =>
  axios.get(`${API_BASE}/events/${deviceId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
