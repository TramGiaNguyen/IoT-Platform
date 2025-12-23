import React from 'react';

interface DeviceControlProps {
    name: string;
    isOn: boolean;
    onToggle: () => void;
    icon: React.ReactNode;
    colorClass: string; // e.g. text-green-400
}

const DeviceControl: React.FC<DeviceControlProps> = ({ name, isOn, onToggle, icon, colorClass }) => {
  return (
    <div className="bg-[#1e2433] rounded-xl p-6 flex flex-col items-center justify-between h-56 shadow-lg border border-slate-700/50">
        <div className="text-slate-300 font-medium mb-2">{name}</div>
        
        <div className={`p-4 rounded-full bg-slate-800 border-2 ${isOn ? 'border-white/20' : 'border-slate-700'} transition-all duration-300`}>
             <div className={`transform transition-all duration-300 ${isOn ? 'scale-110 ' + colorClass : 'scale-100 text-slate-500'}`}>
                {icon}
             </div>
        </div>

        <div className={`font-bold text-sm tracking-wider ${isOn ? colorClass : 'text-red-500'}`}>
            {isOn ? 'ON' : 'OFF'}
        </div>

        {/* Toggle Switch */}
        <button 
            onClick={onToggle}
            className={`w-14 h-7 flex items-center rounded-full p-1 cursor-pointer transition-colors duration-300 ${isOn ? 'bg-green-500' : 'bg-slate-600'}`}
        >
            <div className={`bg-white w-5 h-5 rounded-full shadow-md transform transition-transform duration-300 ${isOn ? 'translate-x-7' : 'translate-x-0'}`}></div>
        </button>
    </div>
  );
};

export default DeviceControl;
