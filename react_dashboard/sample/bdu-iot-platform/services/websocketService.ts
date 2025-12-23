import { useEffect, useState } from 'react';
import { IoTDataPoint } from '../types';

// Custom Hook to simulate WebSocket connection
export const useIoTWebSocket = () => {
  const [data, setData] = useState<IoTDataPoint[]>([]);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    // In a real app: const ws = new WebSocket('wss://api.bdu-iot.com/ws');
    setIsConnected(true);

    const interval = setInterval(() => {
      const now = new Date();
      const timeString = now.toLocaleTimeString('vi-VN');
      
      const newData: IoTDataPoint = {
        timestamp: timeString,
        temperature: 28 + Math.random() * 2, // Random temp between 28-30
        humidity: 60 + Math.random() * 5,    // Random humidity between 60-65
        voltage: 220 + Math.random() * 5 - 2.5 // Random voltage around 220
      };

      setData(prev => {
        const updated = [...prev, newData];
        if (updated.length > 20) return updated.slice(updated.length - 20);
        return updated;
      });
    }, 1000);

    return () => {
      clearInterval(interval);
      setIsConnected(false);
    };
  }, []);

  return { data, isConnected };
};
