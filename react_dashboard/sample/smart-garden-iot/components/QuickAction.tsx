import React from 'react';

interface QuickActionProps {
    name: string;
    isActive: boolean;
    onClick: () => void;
}

const QuickAction: React.FC<QuickActionProps> = ({ name, isActive, onClick }) => {
    return (
        <div className="bg-[#1e2433] rounded-xl p-4 flex flex-col items-center justify-between h-32 shadow-lg border border-slate-700/50">
            <div className="text-center">
                <div className="text-slate-300 text-sm font-medium">{name}</div>
                <div className="text-slate-500 text-xs mt-1">Bật/Tắt</div>
            </div>
            
            <button 
                onClick={onClick}
                className={`w-full py-2 rounded-lg font-medium text-sm transition-all duration-200 active:scale-95 
                ${isActive 
                    ? 'bg-blue-600 hover:bg-blue-500 text-white shadow-[0_0_15px_rgba(37,99,235,0.5)]' 
                    : 'bg-slate-700 hover:bg-slate-600 text-slate-300 border border-slate-600'}`}
            >
                {isActive ? 'Đang Bật' : 'Bật/Tắt'}
            </button>
        </div>
    );
};

export default QuickAction;
