import React from 'react';
import TechBackground from './components/TechBackground';
import DeviceSetup from './components/DeviceSetup';

function App() {
  return (
    <div className="min-h-screen bg-[#f3f6f9] relative overflow-hidden font-sans text-slate-800">
      <TechBackground />
      <DeviceSetup />
    </div>
  );
}

export default App;