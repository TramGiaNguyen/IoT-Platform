import React from 'react';
import { useIoTWebSocket } from '../services/websocketService';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area } from 'recharts';

interface DashboardProps {
  onLogout: () => void;
}

const Dashboard: React.FC<DashboardProps> = ({ onLogout }) => {
  const { data, isConnected } = useIoTWebSocket();
  const latest = data[data.length - 1] || { temperature: 0, humidity: 0, voltage: 0 };

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="bg-[#1a4b8e] text-white shadow-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-3">
             <img 
                src="https://upload.wikimedia.org/wikipedia/commons/thumb/e/e8/Logo_Dai_hoc_Binh_Duong.png/266px-Logo_Dai_hoc_Binh_Duong.png" 
                alt="BDU Logo" 
                className="h-10 w-auto bg-white rounded-full p-1"
              />
            <h1 className="text-xl font-bold tracking-tight">BDU-Flatform IoT</h1>
          </div>
          <div className="flex items-center space-x-4">
            <span className={`flex items-center text-xs ${isConnected ? 'text-green-400' : 'text-red-400'}`}>
              <span className={`w-2 h-2 rounded-full mr-1 ${isConnected ? 'bg-green-400' : 'bg-red-400'}`}></span>
              {isConnected ? 'Real-time Connected' : 'Disconnected'}
            </span>
            <button 
              onClick={onLogout}
              className="px-4 py-2 text-sm font-medium bg-[#ed7d31] hover:bg-[#d66b26] rounded-md transition-colors"
            >
              Đăng xuất
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        
        {/* KPI Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="bg-white rounded-xl shadow-sm p-6 border-l-4 border-red-500">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-sm font-medium text-gray-500">Nhiệt độ</p>
                <h3 className="text-3xl font-bold text-gray-800">{latest.temperature.toFixed(1)}°C</h3>
              </div>
              <div className="p-3 bg-red-100 rounded-lg text-red-600">
                <i className="fas fa-temperature-high text-xl"></i>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm p-6 border-l-4 border-blue-500">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-sm font-medium text-gray-500">Độ ẩm</p>
                <h3 className="text-3xl font-bold text-gray-800">{latest.humidity.toFixed(1)}%</h3>
              </div>
              <div className="p-3 bg-blue-100 rounded-lg text-blue-600">
                <i className="fas fa-tint text-xl"></i>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm p-6 border-l-4 border-yellow-500">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-sm font-medium text-gray-500">Điện áp</p>
                <h3 className="text-3xl font-bold text-gray-800">{latest.voltage.toFixed(1)} V</h3>
              </div>
              <div className="p-3 bg-yellow-100 rounded-lg text-yellow-600">
                <i className="fas fa-bolt text-xl"></i>
              </div>
            </div>
          </div>
        </div>

        {/* Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <div className="bg-white p-6 rounded-xl shadow-sm">
            <h3 className="text-lg font-bold text-gray-800 mb-4">Biểu đồ Nhiệt độ & Độ ẩm</h3>
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data}>
                  <defs>
                    <linearGradient id="colorTemp" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#ef4444" stopOpacity={0.1}/>
                      <stop offset="95%" stopColor="#ef4444" stopOpacity={0}/>
                    </linearGradient>
                    <linearGradient id="colorHum" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.1}/>
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="timestamp" tick={{fontSize: 12}} interval={4} />
                  <YAxis yAxisId="left" domain={[20, 40]} />
                  <YAxis yAxisId="right" orientation="right" domain={[50, 80]} />
                  <Tooltip />
                  <Area yAxisId="left" type="monotone" dataKey="temperature" stroke="#ef4444" fillOpacity={1} fill="url(#colorTemp)" name="Nhiệt độ" />
                  <Area yAxisId="right" type="monotone" dataKey="humidity" stroke="#3b82f6" fillOpacity={1} fill="url(#colorHum)" name="Độ ẩm" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="bg-white p-6 rounded-xl shadow-sm">
            <h3 className="text-lg font-bold text-gray-800 mb-4">Biểu đồ Điện áp</h3>
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="timestamp" tick={{fontSize: 12}} interval={4} />
                  <YAxis domain={[210, 230]} />
                  <Tooltip />
                  <Line type="monotone" dataKey="voltage" stroke="#eab308" strokeWidth={2} dot={false} name="Điện áp (V)" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

      </main>
    </div>
  );
};

export default Dashboard;
