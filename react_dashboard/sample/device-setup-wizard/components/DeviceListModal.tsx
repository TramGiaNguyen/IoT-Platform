import React from 'react';
import { Device } from '../types';
import { AirVent, Lightbulb, Thermometer, ArrowRight } from 'lucide-react';

interface DeviceListModalProps {
  devices: Device[];
  onNext: () => void;
  isOpen: boolean;
}

const DeviceListModal: React.FC<DeviceListModalProps> = ({ devices, onNext, isOpen }) => {
  if (!isOpen) return null;

  const getIcon = (type: string) => {
    switch (type) {
      case 'ac':
        return <AirVent className="w-5 h-5 text-gray-600" />;
      case 'light':
        return <Lightbulb className="w-5 h-5 text-gray-600" />;
      case 'sensor':
        return <Thermometer className="w-5 h-5 text-gray-600" />;
      default:
        return <div className="w-5 h-5 bg-gray-300 rounded-full" />;
    }
  };

  return (
    <div className="absolute top-[30%] left-[55%] w-80 bg-white rounded-xl shadow-2xl border border-gray-100 z-50 animate-fade-in-up">
      <div className="p-5">
        <h3 className="font-bold text-lg text-gray-800 mb-4">
          Tìm thấy {devices.length} thiết bị
        </h3>

        <div className="space-y-3 mb-6">
          {devices.map((device) => (
            <div
              key={device.id}
              className="flex items-center gap-3 p-2 hover:bg-gray-50 rounded-lg transition-colors cursor-default"
            >
              <div className="w-10 h-10 bg-gray-200 rounded-md flex items-center justify-center shrink-0">
                {getIcon(device.type)}
              </div>
              <span className="text-gray-700 font-medium text-sm">
                {device.name}
              </span>
            </div>
          ))}
        </div>

        <div className="flex justify-end">
          <button
            onClick={onNext}
            className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white px-5 py-2 rounded-lg font-medium transition-colors text-sm shadow-sm"
          >
            Tiếp theo
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default DeviceListModal;