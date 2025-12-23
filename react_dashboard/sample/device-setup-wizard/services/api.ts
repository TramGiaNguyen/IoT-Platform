import axios from 'axios';
import { Device } from '../types';

// --- Axios Setup ---
const api = axios.create({
  baseURL: 'https://api.mock-iot-server.com/v1', // Mock URL
  timeout: 5000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Mocking Axios Interceptors for JWT
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('jwt_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Mocking API response for "scanning" since we don't have a real backend
// In a real app, this would trigger the backend to start a broadcast
export const startScan = async (): Promise<{ status: string }> => {
  // Simulate network delay
  await new Promise((resolve) => setTimeout(resolve, 800));
  return { status: 'scan_started' };
};

export default api;

// --- Mock WebSocket Service ---
type WSCallback = (data: any) => void;

export class MockWebSocket {
  private url: string;
  private onMessageCallback: WSCallback | null = null;
  private intervalId: any = null;

  constructor(url: string) {
    this.url = url;
  }

  connect() {
    console.log(`Connecting to WS: ${this.url}`);
    // Simulate connection success
  }

  onMessage(callback: WSCallback) {
    this.onMessageCallback = callback;
  }

  startSimulation() {
    // Simulate finding devices one by one or in a batch
    setTimeout(() => {
      if (this.onMessageCallback) {
        const mockDevices: Device[] = [
          { id: '1', name: 'ac-bdu-001', type: 'ac', status: 'active' },
          { id: '2', name: 'light-bdu-001', type: 'light', status: 'active' },
          { id: '3', name: 'ac-bdu-002', type: 'ac', status: 'active' },
          { id: '4', name: 'sensor-bdu-001', type: 'sensor', status: 'active' },
        ];
        this.onMessageCallback({ type: 'DEVICES_FOUND', payload: mockDevices });
      }
    }, 2500); // 2.5s delay to simulate scanning
  }

  close() {
    console.log('WS Connection closed');
    if (this.intervalId) clearInterval(this.intervalId);
  }
}