import React, { useState, useCallback } from 'react';
import { DeviceData } from '../types';
import DeviceCard from './DeviceCard';
import { MOCK_INITIAL_DEVICES } from '../constants';
import { useMockWebSocket } from '../services/mockSocket';
import { Radio } from 'lucide-react';

const Dashboard: React.FC = () => {
  const [devices, setDevices] = useState<DeviceData[]>(MOCK_INITIAL_DEVICES);

  // Handle WebSocket updates
  const handleSocketMessage = useCallback((message: { deviceId: string; payload: any }) => {
    setDevices(prevDevices => 
      prevDevices.map(device => 
        device.id === message.deviceId 
          ? { ...device, ...message.payload } 
          : device
      )
    );
  }, []);

  // Connect to mock socket
  useMockWebSocket(handleSocketMessage, true);

  // Handlers for user interaction
  const handleToggle = (id: string) => {
    setDevices(prev => prev.map(d => {
      if (d.id === id) {
        const newStatus = d.status === 'ON' ? 'OFF' : 'ON';
        return { 
          ...d, 
          status: newStatus,
          lastUpdated: new Date().toISOString()
        };
      }
      return d;
    }));
  };

  const handleUpdateValue = (id: string, key: keyof DeviceData, value: any) => {
    setDevices(prev => prev.map(d => {
      if (d.id === id) {
        return { 
          ...d, 
          [key]: value,
          lastUpdated: new Date().toISOString()
        };
      }
      return d;
    }));
  };

  return (
    <div className="min-h-screen bg-[#020617] bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-slate-900 via-[#020617] to-black p-4 md:p-8">
      
      {/* Background Grid Pattern */}
      <div className="fixed inset-0 z-0 pointer-events-none opacity-20" 
           style={{ 
             backgroundImage: 'linear-gradient(#1e293b 1px, transparent 1px), linear-gradient(90deg, #1e293b 1px, transparent 1px)', 
             backgroundSize: '40px 40px' 
           }}>
      </div>

      {/* Tech PCB Lines (Decorative) */}
      <div className="fixed bottom-0 right-0 z-0 opacity-10 pointer-events-none w-96 h-96">
        <svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
          <path fill="none" stroke="#06b6d4" strokeWidth="1" d="M200,200 L150,200 L140,190 L140,150 L100,150 L80,130 M200,180 L160,180 L160,160 L120,160" />
          <rect x="10" y="100" width="20" height="20" fill="none" stroke="#06b6d4" strokeWidth="1" />
          <rect x="15" y="105" width="10" height="10" fill="#06b6d4" />
        </svg>
      </div>

      <div className="relative z-10 max-w-7xl mx-auto">
        
        {/* Header Bar */}
        <header className="flex flex-col md:flex-row items-center justify-between mb-10 bg-slate-900/50 backdrop-blur-md border border-slate-700 rounded-2xl p-4 md:px-8 shadow-2xl neon-shadow">
          <div className="flex items-center gap-4 mb-4 md:mb-0">
            <div className="w-10 h-10 bg-cyan-500 rounded flex items-center justify-center shadow-[0_0_15px_rgba(6,182,212,0.6)]">
               <span className="text-white font-bold text-xl">B</span>
            </div>
            <h1 className="text-2xl md:text-3xl font-bold font-tech text-transparent bg-clip-text bg-gradient-to-r from-white to-slate-400">
              BDU IoT Dashboard
            </h1>
          </div>
          
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2 bg-black/40 px-4 py-2 rounded-full border border-emerald-500/30 shadow-[0_0_10px_rgba(16,185,129,0.2)]">
              <span className="relative flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
              </span>
              <span className="text-emerald-400 font-mono text-sm font-semibold tracking-wider">Real-time</span>
            </div>
          </div>
        </header>

        {/* Device Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
          {devices.map(device => (
            <DeviceCard 
              key={device.id} 
              device={device} 
              onToggle={handleToggle}
              onUpdateValue={handleUpdateValue}
            />
          ))}
        </div>

      </div>
    </div>
  );
};

export default Dashboard;