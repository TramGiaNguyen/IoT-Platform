import { DeviceData, DeviceType } from './types';

export const MOCK_INITIAL_DEVICES: DeviceData[] = [
  {
    id: 'ac-bdu-001',
    name: 'ac-bdu-001',
    type: DeviceType.AC,
    isOnline: true,
    status: 'OFF',
    setTemperature: 24.0,
    lastUpdated: new Date().toISOString()
  },
  {
    id: 'ac-bdu-002',
    name: 'ac-bdu-002',
    type: DeviceType.AC,
    isOnline: true,
    status: 'OFF',
    setTemperature: 24.0,
    lastUpdated: new Date().toISOString()
  },
  {
    id: 'sensor-bdu-001',
    name: 'sensor-bdu-001',
    type: DeviceType.SENSOR,
    isOnline: true,
    status: 'ON',
    temperature: 29.4,
    humidity: 54.7,
    lastUpdated: new Date().toISOString()
  },
  {
    id: 'light-bdu-001',
    name: 'light-bdu-001',
    type: DeviceType.LIGHT,
    isOnline: true,
    status: 'OFF',
    brightness: 0,
    lastUpdated: new Date().toISOString()
  }
];