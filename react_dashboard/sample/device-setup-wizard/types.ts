export interface Device {
  id: string;
  name: string;
  type: 'ac' | 'light' | 'sensor';
  status: 'active' | 'inactive';
}

export interface ScanResponse {
  success: boolean;
  devices: Device[];
  message?: string;
}

export enum WebSocketStatus {
  DISCONNECTED = 'Disconnected',
  CONNECTING = 'Connecting',
  CONNECTED = 'Connected',
  SCANNING = 'Scanning',
}