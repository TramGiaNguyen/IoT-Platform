import React, { useState, useEffect } from 'react';
import { 
  ArrowLeft, 
  Thermometer, 
  Droplets, 
  Sun, 
  Wind, 
  Zap, 
  Lightbulb, 
  Sprout, 
  Search,
  Bot
} from 'lucide-react';
import SensorGauge from './components/SensorGauge';
import CircularProgress from './components/CircularProgress';
import SunCard from './components/SunCard';
import DeviceControl from './components/DeviceControl';
import QuickAction from './components/QuickAction';
import AiConfidenceChart from './components/AiConfidenceChart';
import { SensorData, DeviceState, AiDetection } from './types';
import { getGardenInsights } from './services/geminiService';

const App: React.FC = () => {
  // --- State Management ---
  const [sensors, setSensors] = useState<SensorData>({
    temperature: 28,
    humidity: 65,
    soilMoisture: 45,
    lightLux: 850
  });

  const [devices, setDevices] = useState<DeviceState>({
    pump: true,
    lamp: false,
    fan: false
  });

  const [aiDetection] = useState<AiDetection>({
    count: 12,
    items: ['Cà chua', 'Ớt chuông'],
    confidence: 92,
    history: [
        { name: '1', value: 40 }, 
        { name: '2', value: 60 }, 
        { name: '3', value: 45 }, 
        { name: '4', value: 90 }, 
        { name: '5', value: 70 }
    ]
  });

  const [aiInsight, setAiInsight] = useState<string>("");
  const [loadingInsight, setLoadingInsight] = useState(false);

  // --- Handlers ---
  const toggleDevice = (device: keyof DeviceState) => {
    setDevices(prev => ({ ...prev, [device]: !prev[device] }));
  };

  const handleAskAi = async () => {
    if (loadingInsight) return;
    setLoadingInsight(true);
    const insight = await getGardenInsights(sensors, devices, aiDetection);
    setAiInsight(insight);
    setLoadingInsight(false);
  };

  // Simulate sensor fluctuation
  useEffect(() => {
    const interval = setInterval(() => {
        setSensors(prev => ({
            ...prev,
            temperature: 27 + Math.random() * 2,
            humidity: 64 + Math.random() * 2,
        }));
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="min-h-screen bg-[#121620] p-4 md:p-8 text-slate-200 font-sans selection:bg-blue-500/30">
        
        {/* Header */}
        <header className="flex justify-between items-center mb-8">
            <h1 className="text-xl md:text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-indigo-400">
                Bảng Điều khiển Vườn Thông Minh (IoT Platform)
            </h1>
            <button className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[#1e2433] hover:bg-[#2a3245] border border-slate-700 transition-colors text-sm font-medium">
                <ArrowLeft size={16} />
                Quay lại
            </button>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            
            {/* LEFT COLUMN: Sensor Data & AI (Span 7) */}
            <div className="lg:col-span-7 space-y-6">
                
                {/* 1. Sensor Data Section */}
                <section className="bg-[#151a25] rounded-2xl p-6 border border-slate-800">
                    <h2 className="text-lg font-semibold mb-4 text-slate-100">Dữ liệu cảm biến</h2>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <SensorGauge 
                            value={Math.round(sensors.temperature)} 
                            max={50} 
                            color="#ef4444" // red-500
                            label="Nhiệt độ"
                            subLabel="Đang tăng"
                            unit="°C"
                            icon={<Thermometer size={14} className="text-red-400"/>}
                        />
                        <CircularProgress 
                            percentage={sensors.humidity}
                            color="#3b82f6" // blue-500
                            label="Độ ẩm không khí"
                            value={`${Math.round(sensors.humidity)}%`}
                            status="Tốt"
                            icon={<Droplets size={14} className="text-blue-400"/>}
                        />
                        <CircularProgress 
                            percentage={sensors.soilMoisture}
                            color="#10b981" // green-500
                            label="Độ ẩm đất"
                            value={`${sensors.soilMoisture}%`}
                            status="Cần tưới"
                            icon={<Sprout size={14} className="text-green-400"/>}
                            isSoil={true}
                        />
                        <SunCard lux={sensors.lightLux} />
                    </div>
                </section>

                {/* 2. AI Recognition Section */}
                <section className="bg-[#151a25] rounded-2xl p-6 border border-slate-800">
                     <div className="flex justify-between items-start mb-4">
                        <h2 className="text-lg font-semibold text-slate-100">AI Nhận diện (Jetson Nano)</h2>
                        <button 
                            onClick={handleAskAi}
                            className="text-xs flex items-center gap-1 text-purple-400 hover:text-purple-300 transition-colors"
                        >
                            <Bot size={14} />
                            {loadingInsight ? "Đang phân tích..." : "Hỏi AI về Vườn"}
                        </button>
                     </div>
                     
                     {aiInsight && (
                        <div className="mb-4 p-3 bg-purple-900/20 border border-purple-500/30 rounded-lg text-sm text-purple-200 animate-fadeIn">
                             ✨ <strong>AI Insight:</strong> {aiInsight}
                        </div>
                     )}

                     <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                         {/* Count */}
                         <div className="bg-[#1e2433] rounded-xl p-4 border border-slate-700/50 flex flex-col justify-center">
                            <div className="text-slate-400 text-xs mb-1">Số cây phát hiện</div>
                            <div className="flex items-center gap-3">
                                <Sprout size={32} className="text-green-500" />
                                <span className="text-3xl font-bold text-white">{aiDetection.count}</span>
                            </div>
                         </div>

                         {/* Results */}
                         <div className="bg-[#1e2433] rounded-xl p-4 border border-slate-700/50 flex flex-col justify-center">
                            <div className="text-slate-400 text-xs mb-2">Kết quả nhận diện</div>
                            <div className="flex items-start gap-2">
                                <Search size={20} className="text-slate-500 mt-1" />
                                <div>
                                    {aiDetection.items.map(item => (
                                        <div key={item} className="text-white text-sm font-medium leading-relaxed">{item}</div>
                                    ))}
                                </div>
                            </div>
                         </div>

                         {/* Confidence */}
                         <div className="bg-[#1e2433] rounded-xl p-4 border border-slate-700/50 flex flex-col justify-between">
                             <div className="flex justify-between items-start">
                                 <div className="text-slate-400 text-xs">Độ tin cậy</div>
                                 <div className="relative w-10 h-10 flex items-center justify-center rounded-full border-2 border-green-500 text-xs font-bold text-white">
                                     {aiDetection.confidence}%
                                 </div>
                             </div>
                             <div className="mt-2 flex items-end justify-between">
                                 <AiConfidenceChart data={aiDetection.history} />
                             </div>
                         </div>
                     </div>
                </section>
            </div>

            {/* RIGHT COLUMN: Controls (Span 5) */}
            <div className="lg:col-span-5 space-y-6">
                
                {/* 3. Device Status Section */}
                <section className="bg-[#151a25] rounded-2xl p-6 border border-slate-800">
                    <h2 className="text-lg font-semibold mb-4 text-slate-100">Trạng thái thiết bị</h2>
                    <div className="grid grid-cols-3 gap-4">
                        <DeviceControl 
                            name="Máy bơm" 
                            isOn={devices.pump} 
                            onToggle={() => toggleDevice('pump')}
                            variant="pump"
                            icon={<Zap size={32} />}
                            colorClass="text-green-400"
                        />
                         <DeviceControl 
                            name="Đèn" 
                            isOn={devices.lamp} 
                            onToggle={() => toggleDevice('lamp')}
                            variant="lamp"
                            icon={<Lightbulb size={32} />}
                            colorClass="text-yellow-400"
                        />
                         <DeviceControl 
                            name="Quạt" 
                            isOn={devices.fan} 
                            onToggle={() => toggleDevice('fan')}
                            variant="fan"
                            icon={<Wind size={32} />}
                            colorClass="text-blue-400"
                        />
                    </div>
                </section>

                {/* 4. Quick Control Section */}
                <section className="bg-[#151a25] rounded-2xl p-6 border border-slate-800">
                    <h2 className="text-lg font-semibold mb-4 text-slate-100">Điều khiển nhanh</h2>
                    <div className="grid grid-cols-3 gap-4">
                        <QuickAction 
                            name="Máy bơm" 
                            isActive={devices.pump} 
                            onClick={() => toggleDevice('pump')} 
                        />
                        <QuickAction 
                            name="Đèn" 
                            isActive={devices.lamp} 
                            onClick={() => toggleDevice('lamp')} 
                        />
                        <QuickAction 
                            name="Quạt" 
                            isActive={devices.fan} 
                            onClick={() => toggleDevice('fan')} 
                        />
                    </div>
                </section>

            </div>
        </div>
    </div>
  );
};

export default App;
