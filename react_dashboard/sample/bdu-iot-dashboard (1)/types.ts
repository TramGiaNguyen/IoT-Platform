export enum DeviceType {
  AC = 'AC',
  SENSOR = 'SENSOR',
  LIGHT = 'LIGHT'
}

export interface DeviceData {
  id: string;
  name: string;
  type: DeviceType;
  isOnline: boolean;
  status: 'ON' | 'OFF';
  lastUpdated: string;
  // Specific properties (optional depending on type)
  temperature?: number;
  setTemperature?: number;
  humidity?: number;
  brightness?: number; // 0-100
}

export interface AuthState {
  isAuthenticated: boolean;
  token: string | null;
  user: { username: string } | null;
}

export interface WebSocketMessage {
  deviceId: string;
  payload: Partial<DeviceData>;
}