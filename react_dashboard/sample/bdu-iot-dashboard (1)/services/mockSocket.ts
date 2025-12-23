import { useEffect, useRef } from 'react';
import { WebSocketMessage } from '../types';

// This custom hook simulates a WebSocket connection
export const useMockWebSocket = (
  onMessage: (message: WebSocketMessage) => void,
  isAuthenticated: boolean
) => {
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!isAuthenticated) return;

    // Simulate receiving data every 2-4 seconds
    intervalRef.current = setInterval(() => {
      const devices = ['ac-bdu-001', 'ac-bdu-002', 'sensor-bdu-001', 'light-bdu-001'];
      const randomDevice = devices[Math.floor(Math.random() * devices.length)];
      
      let payload: any = {};

      if (randomDevice.includes('sensor')) {
        // Fluctuate temp and humidity
        payload = {
          temperature: +(28 + Math.random() * 4).toFixed(1),
          humidity: +(50 + Math.random() * 10).toFixed(1),
          lastUpdated: new Date().toISOString()
        };
      } else if (randomDevice.includes('ac')) {
         // Randomly drop offline/online occasionally for demo
         // payload = { isOnline: Math.random() > 0.05 }; 
         payload = { lastUpdated: new Date().toISOString() };
      }

      if (Object.keys(payload).length > 0) {
        onMessage({
          deviceId: randomDevice,
          payload
        });
      }

    }, 2500);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isAuthenticated, onMessage]);
};