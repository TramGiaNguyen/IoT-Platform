import React, { useState, useEffect, useRef } from 'react';
import { Search, AlertTriangle, Key } from 'lucide-react';
import { Device, WebSocketStatus } from '../types';
import { startScan, MockWebSocket } from '../services/api';
import DeviceListModal from './DeviceListModal';

const DeviceSetup: React.FC = () => {
  const [status, setStatus] = useState<string>('Đang chờ...');
  const [isScanning, setIsScanning] = useState(false);
  const [devices, setDevices] = useState<Device[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);

  // Mock socket ref
  const socketRef = useRef<MockWebSocket | null>(null);

  useEffect(() => {
    // Initialize mock JWT
    localStorage.setItem('jwt_token', 'mock_token_xyz_123');

    return () => {
      if (socketRef.current) {
        socketRef.current.close();
      }
    };
  }, []);

  const handleScan = async () => {
    setIsScanning(true);
    setStatus('Đang kết nối...');
    setError(null);
    setDevices([]);
    setShowModal(false);

    try {
      // 1. Axios call to start scan
      await startScan();
      setStatus('Đang quét...');

      // 2. Initialize Mock WebSocket
      socketRef.current = new MockWebSocket('wss://mock-iot.com/scan');
      socketRef.current.connect();
      
      // 3. Simulate a failure first (to match screenshot visual of error box)
      // In a real app, this logic would be cleaner, but we want to show the UI state requested.
      // We will show the error box, but allow the process to "continue" to success for the demo.
      
      setTimeout(() => {
         setError("Không tìm thấy thiết bị mới. Vui lòng đảm bảo simulator đang chạy.");
      }, 1500);

      // 4. Listen for results (Success case happens after error for demo purposes)
      socketRef.current.onMessage((data) => {
        if (data.type === 'DEVICES_FOUND') {
          setDevices(data.payload);
          setStatus('Hoàn tất');
          setIsScanning(false);
          setShowModal(true);
        }
      });

      socketRef.current.startSimulation();

    } catch (err) {
      setError("Lỗi kết nối server.");
      setIsScanning(false);
      setStatus('Lỗi');
    }
  };

  return (
    <div className="relative min-h-screen flex flex-col items-center pt-20 px-4 z-10">
      
      {/* Header Section */}
      <div className="text-center mb-12">
        <div className="flex items-center justify-center gap-3 mb-3">
          <Key className="w-6 h-6 text-gray-600" />
          <h1 className="text-3xl font-bold text-gray-800">Thiết lập Thiết bị</h1>
        </div>
        <p className="text-gray-500 max-w-lg mx-auto text-sm">
          Bạn chưa có thiết bị nào được đăng ký. Hãy quét và đăng ký thiết bị để bắt đầu.
        </p>
      </div>

      {/* Main Content Area */}
      <div className="w-full max-w-4xl relative">
        <h2 className="text-xl font-bold text-gray-800 mb-6">Bước 1: Quét thiết bị</h2>

        <div className="flex flex-col md:flex-row gap-10 items-start">
          
          {/* Left Column: Controls */}
          <div className="flex-1 w-full max-w-md space-y-6">
            
            {/* Scan Button */}
            <button
              onClick={handleScan}
              disabled={isScanning}
              className={`w-full flex items-center justify-center gap-2 bg-primary hover:opacity-90 text-white font-medium py-3 px-6 rounded-full transition-all shadow-md ${isScanning ? 'opacity-70 cursor-not-allowed' : ''}`}
              style={{ backgroundColor: '#0f3c66' }} // Exact scan button color match
            >
              {isScanning ? (
                <div className="animate-spin h-5 w-5 border-2 border-white border-t-transparent rounded-full" />
              ) : (
                <Search className="w-5 h-5" />
              )}
              {isScanning ? 'Đang quét...' : 'Quét thiết bị'}
            </button>

            {/* Input Field (Read only/Status) */}
            <div className="relative">
              <input
                type="text"
                readOnly
                placeholder="Kết thiết quả..."
                className="w-full bg-gray-100 border-none rounded-lg py-3 px-4 text-gray-500 focus:ring-0 cursor-default"
                value={devices.length > 0 ? `Đã tìm thấy ${devices.length} thiết bị` : ''}
              />
            </div>

            {/* Error Message Box */}
            {error && (
              <div className="flex items-start gap-3 bg-red-50 border-l-4 border-red-500 p-4 rounded-md shadow-sm animate-fade-in">
                <AlertTriangle className="w-6 h-6 text-red-500 shrink-0 mt-0.5" />
                <p className="text-red-800 text-sm font-medium leading-relaxed">
                  {error}
                </p>
              </div>
            )}
          </div>

          {/* Right Column: Status (Only visible if needed or for layout balance) */}
          <div className="hidden md:block w-64 pt-3">
             <p className="text-gray-600">
               Trạng thái: <span className="font-medium text-gray-800">{status}</span>
             </p>
          </div>
        </div>

        {/* Modal Overlay - Positioned specifically to match screenshot */}
        <DeviceListModal 
          devices={devices} 
          isOpen={showModal} 
          onNext={() => alert('Chuyển sang bước tiếp theo!')} 
        />
      </div>
    </div>
  );
};

export default DeviceSetup;