export interface User {
  id: string;
  username: string;
  name: string;
  role: 'admin' | 'user';
}

export interface AuthState {
  isAuthenticated: boolean;
  token: string | null;
  user: User | null;
}

export interface IoTDataPoint {
  timestamp: string;
  temperature: number;
  humidity: number;
  voltage: number;
}

export interface LoginResponse {
  token: string;
  user: User;
}
