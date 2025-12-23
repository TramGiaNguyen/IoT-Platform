// Added import to resolve 'React' namespace
import React from 'react';

export interface SensorData {
  temperature: number;
  humidity: number;
  soilMoisture: number;
  lightLux: number;
}

export interface DeviceState {
  pump: boolean;
  lamp: boolean;
  fan: boolean;
}

export interface AiDetection {
  count: number;
  items: string[];
  confidence: number;
  history: { name: string; value: number }[];
}

// Props for components
export interface DeviceCardProps {
  name: string;
  isOn: boolean;
  onToggle: () => void;
  icon: React.ReactNode;
  variant: 'pump' | 'lamp' | 'fan';
}