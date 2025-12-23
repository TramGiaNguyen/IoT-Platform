import React from 'react';

interface CircularProgressProps {
  percentage: number;
  color: string;
  label: string;
  value: string;
  status: string;
  icon: React.ReactNode;
  isSoil?: boolean;
}

const CircularProgress: React.FC<CircularProgressProps> = ({ percentage, color, label, value, status, icon, isSoil }) => {
  // Increased size to match SensorGauge (80px)
  const size = 80;
  const strokeWidth = 8;
  const center = size / 2;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (percentage / 100) * circumference;

  return (
    <div className="bg-[#1e2433] rounded-xl p-4 flex flex-row items-center justify-between shadow-lg border border-slate-700/50 h-32">
      <div className="flex flex-col justify-between h-full">
        <div>
           <div className="flex items-center gap-2 text-slate-400 text-xs font-medium mb-1">
                {icon}
                <span>{label}</span>
            </div>
            <div className="text-2xl font-bold text-white">
                {value}
            </div>
        </div>
        <div className="text-xs text-slate-400 font-medium">
            {status}
        </div>
      </div>

      <div className="relative flex-shrink-0" style={{ width: size, height: size }}>
        {/* Background Circle */}
        <svg className="transform -rotate-90 w-full h-full" viewBox={`0 0 ${size} ${size}`}>
          <circle
            cx={center}
            cy={center}
            r={radius}
            stroke="#334155"
            strokeWidth={strokeWidth}
            fill="transparent"
          />
          {/* Progress Circle */}
          <circle
            cx={center}
            cy={center}
            r={radius}
            stroke={color}
            strokeWidth={strokeWidth}
            fill="transparent"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
          />
        </svg>
        {/* Inner Icon */}
        <div className="absolute inset-0 flex items-center justify-center text-slate-200">
           {isSoil ? (
             <div className="w-10 h-10 rounded-full bg-amber-900/50 border border-amber-700 overflow-hidden flex items-center justify-center">
                <div className="w-full h-full bg-[url('https://picsum.photos/100/100?grayscale')] opacity-50 mix-blend-overlay bg-cover"></div>
             </div>
           ) : (
            <div style={{ color: color }} className="-mt-1">
                {/* Specific inner icon for water drop style - nudged up for visual center */}
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22a7 7 0 0 0 7-7c0-2-2-3.9-7-10.3C5 11.1 3 13 3 15a7 7 0 0 0 7 7z"></path></svg>
            </div>
           )}
        </div>
      </div>
    </div>
  );
};

export default CircularProgress;