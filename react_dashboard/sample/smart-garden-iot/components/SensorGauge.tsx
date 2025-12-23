import React from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts';

interface SensorGaugeProps {
  value: number;
  max: number;
  color: string;
  label: string;
  subLabel?: string;
  unit: string;
  icon: React.ReactNode;
}

const SensorGauge: React.FC<SensorGaugeProps> = ({ value, max, color, label, subLabel, unit, icon }) => {
  const data = [
    { name: 'value', value: value },
    { name: 'rest', value: max - value },
  ];

  // Dark theme background for empty part of gauge
  const bgFill = "#334155"; 

  return (
    <div className="bg-[#1e2433] rounded-xl p-4 flex flex-row items-center justify-between relative overflow-hidden shadow-lg border border-slate-700/50 h-32">
        <div className="z-10 flex flex-col justify-between h-full">
            <div>
                <div className="flex items-center gap-2 text-slate-400 text-xs font-medium mb-1">
                    {icon}
                    <span>{label}</span>
                </div>
                <div className="text-2xl font-bold text-white">
                    {value}<span className="text-base font-normal text-slate-400">{unit}</span>
                </div>
            </div>
            <div className={`text-xs font-medium ${subLabel?.includes('tăng') ? 'text-red-400' : subLabel?.includes('Tốt') ? 'text-blue-400' : 'text-amber-400'}`}>
                {subLabel && (
                  <span className="flex items-center gap-1">
                     {subLabel.includes('tăng') && '↗'} {subLabel}
                  </span>
                )}
            </div>
        </div>
        
        <div className="w-[80px] h-[80px] relative">
             <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                    <Pie
                        data={data}
                        cx="50%"
                        cy="50%"
                        innerRadius={25}
                        outerRadius={35}
                        startAngle={180}
                        endAngle={0}
                        paddingAngle={0}
                        dataKey="value"
                        stroke="none"
                    >
                        <Cell key="cell-0" fill={color} />
                        <Cell key="cell-1" fill={bgFill} />
                    </Pie>
                </PieChart>
            </ResponsiveContainer>
             {/* Center icon or mini value decoration */}
             <div className="absolute inset-0 flex items-center justify-center pt-4">
               {/* Decorative Dot */}
             </div>
        </div>
    </div>
  );
};

export default SensorGauge;
