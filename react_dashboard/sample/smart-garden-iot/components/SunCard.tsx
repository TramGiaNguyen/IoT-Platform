import React from 'react';
import { Sun } from 'lucide-react';

interface SunCardProps {
    lux: number;
}

const SunCard: React.FC<SunCardProps> = ({ lux }) => {
    return (
        <div className="bg-[#1e2433] rounded-xl p-4 flex flex-row items-center justify-between shadow-lg border border-slate-700/50 h-32">
            <div className="flex flex-col justify-between h-full">
                <div>
                    <div className="flex items-center gap-2 text-slate-400 text-xs font-medium mb-1">
                        <Sun size={14} className="text-yellow-400" />
                        <span>Ánh sáng</span>
                    </div>
                    <div className="text-2xl font-bold text-white">
                        {lux} <span className="text-base font-normal text-slate-400">Lux</span>
                    </div>
                </div>
                <div className="text-xs text-yellow-400 font-medium">
                    Đủ sáng
                </div>
            </div>
            
            <div className="relative w-[80px] h-[80px] flex items-center justify-center flex-shrink-0">
                 <Sun size={48} className="text-yellow-400 animate-pulse" />
            </div>
        </div>
    );
};

export default SunCard;