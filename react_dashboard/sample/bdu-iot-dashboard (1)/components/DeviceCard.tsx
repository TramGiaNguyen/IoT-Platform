import React from 'react';
import { DeviceData, DeviceType } from '../types';
import { Thermometer, Droplet, Lightbulb, Fan, Power, Cpu, Activity } from 'lucide-react';

interface DeviceCardProps {
  device: DeviceData;
  onToggle: (id: string) => void;
  onUpdateValue: (id: string, key: keyof DeviceData, value: any) => void;
}

const DeviceCard: React.FC<DeviceCardProps> = ({ device, onToggle, onUpdateValue }) => {
  const formatDate = (isoString: string) => {
    const date = new Date(isoString);
    return `Cập nhật: ${date.toLocaleTimeString()} ${date.toLocaleDateString()}`;
  };

  const getIcon = () => {
    switch (device.type) {
      case DeviceType.AC: return <Fan className="w-6 h-6 text-cyan-400" />;
      case DeviceType.LIGHT: return <Lightbulb className="w-6 h-6 text-yellow-400" />;
      case DeviceType.SENSOR: return <Cpu className="w-6 h-6 text-emerald-400" />;
      default: return <Activity className="w-6 h-6 text-slate-400" />;
    }
  };

  const isAc = device.type === DeviceType.AC;
  const isLight = device.type === DeviceType.LIGHT;
  const isSensor = device.type === DeviceType.SENSOR;

  return (
    <div className="bg-slate-900/80 backdrop-blur-sm border border-slate-700/50 rounded-xl p-5 flex flex-col justify-between transition-all duration-300 card-glow neon-shadow h-full relative overflow-hidden group">
      
      {/* Decorative background elements */}
      <div className="absolute top-0 right-0 w-24 h-24 bg-cyan-500/5 rounded-full blur-2xl -mr-10 -mt-10 pointer-events-none"></div>

      {/* Header */}
      <div className="flex items-start justify-between mb-6 pb-4 border-b border-slate-700/50">
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-lg bg-slate-800 border border-slate-700 ${device.status === 'ON' ? 'animate-pulse' : ''}`}>
            {getIcon()}
          </div>
          <div>
            <h3 className="text-lg font-bold font-tech text-slate-100 tracking-wide">{device.name}</h3>
            <p className="text-xs text-slate-400 font-mono">{device.id}</p>
          </div>
        </div>
        <div className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider flex items-center gap-1 ${device.isOnline ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-red-500/20 text-red-400 border border-red-500/30'}`}>
          <div className={`w-2 h-2 rounded-full ${device.isOnline ? 'bg-emerald-400' : 'bg-red-400'}`}></div>
          {device.isOnline ? 'online' : 'offline'}
        </div>
      </div>

      {/* Body Content */}
      <div className="flex-grow space-y-5">
        
        {/* Status Row (AC & Light) */}
        {!isSensor && (
          <div className="flex justify-between items-center">
            <span className="text-slate-400 text-sm">Trạng thái (ON/OFF):</span>
            <span className={`font-bold font-mono text-lg ${device.status === 'ON' ? 'text-cyan-400' : 'text-slate-500'}`}>
              {device.status}
            </span>
          </div>
        )}

        {/* AC Specifics */}
        {isAc && (
          <div className="flex justify-between items-center">
            <span className="text-slate-400 text-sm">Nhiệt độ cài đặt:</span>
            <span className="font-bold font-mono text-xl text-cyan-400">{device.setTemperature?.toFixed(1)}°C</span>
          </div>
        )}

        {/* Sensor Specifics */}
        {isSensor && (
          <>
            <div className="flex justify-between items-center">
              <span className="text-slate-400 text-sm flex items-center gap-2"><Thermometer size={16}/> Nhiệt độ:</span>
              <span className="font-bold font-mono text-xl text-slate-100">{device.temperature?.toFixed(1)}°C</span>
            </div>
            <div className="flex justify-between items-center border-t border-slate-800 pt-4">
              <span className="text-slate-400 text-sm flex items-center gap-2"><Droplet size={16}/> Độ ẩm:</span>
              <span className="font-bold font-mono text-xl text-slate-100">{device.humidity?.toFixed(1)}%</span>
            </div>
          </>
        )}

        {/* Light Specifics */}
        {isLight && (
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-slate-400 text-sm">Độ sáng (0-100):</span>
              <span className="font-bold font-mono text-lg text-slate-100">{device.brightness}%</span>
            </div>
          </div>
        )}
      </div>

      {/* Controls & Footer */}
      <div className="mt-6 pt-4 border-t border-slate-700/50 space-y-4">
        
        {/* Interactive Controls */}
        <div className="flex items-center gap-3 min-h-[40px]">
          {!isSensor && (
            <button 
              onClick={() => onToggle(device.id)}
              className={`px-4 py-1.5 rounded text-sm font-semibold transition-all duration-200 border ${
                device.status === 'ON' 
                ? 'bg-red-500/10 text-red-400 border-red-500/50 hover:bg-red-500/20' 
                : 'bg-cyan-500/10 text-cyan-400 border-cyan-500/50 hover:bg-cyan-500/20'
              }`}
            >
              {device.status === 'ON' ? 'Tắt' : 'Bật'}
            </button>
          )}

          {isLight && (
            <div className="flex-1 flex items-center gap-2">
               <span className="text-xs text-slate-500 whitespace-nowrap">Độ sáng</span>
               <input 
                type="range" 
                min="0" 
                max="100" 
                value={device.brightness || 0}
                onChange={(e) => onUpdateValue(device.id, 'brightness', parseInt(e.target.value))}
                className="w-full h-1 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-cyan-400"
              />
              <span className="text-xs font-mono text-cyan-400 w-6 text-right">{device.brightness}</span>
            </div>
          )}
        </div>

        {/* Footer Info */}
        <div className="flex flex-col gap-2">
          <p className="text-[10px] text-slate-500 font-mono tracking-tight">{formatDate(device.lastUpdated)}</p>
          <button className="w-full py-2 rounded border border-slate-600 text-slate-300 text-sm hover:bg-slate-800 hover:text-white transition-colors">
            Xem chi tiết
          </button>
        </div>
      </div>
    </div>
  );
};

export default DeviceCard;