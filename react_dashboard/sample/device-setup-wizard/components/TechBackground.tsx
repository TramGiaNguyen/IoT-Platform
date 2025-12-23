import React from 'react';

const TechBackground: React.FC = () => {
  return (
    <div className="fixed inset-0 pointer-events-none z-0 opacity-20 text-gray-400 overflow-hidden">
      {/* Top Right Circuit */}
      <svg
        className="absolute -top-10 -right-10 w-96 h-96"
        viewBox="0 0 200 200"
        fill="none"
        stroke="currentColor"
        strokeWidth="1"
      >
        <path d="M100 100 L150 100 L150 50 M100 100 L100 150 M150 100 L180 100" />
        <circle cx="100" cy="100" r="10" />
        <circle cx="150" cy="50" r="5" />
        <path d="M20 20 L50 50 M180 180 L150 150" opacity="0.5" />
        <rect x="140" y="80" width="40" height="40" strokeDasharray="4 4" />
        <path d="M160 80 L160 20 M180 80 L180 40" />
      </svg>

      {/* Bottom Left Circuit */}
      <svg
        className="absolute -bottom-20 -left-20 w-[500px] h-[500px]"
        viewBox="0 0 400 400"
        fill="none"
        stroke="currentColor"
        strokeWidth="1"
      >
        <rect x="100" y="200" width="80" height="80" rx="10" />
        <path d="M140 200 L140 100 M140 280 L140 350" />
        <path d="M100 240 L50 240 L50 200" />
        <path d="M180 240 L250 240 L250 300" />
        <circle cx="140" cy="100" r="8" />
        <circle cx="50" cy="200" r="5" />
        <circle cx="250" cy="300" r="5" />
        {/* Decorative lines */}
        <path d="M10 380 L50 340 M30 390 L60 360" opacity="0.5" />
      </svg>
    </div>
  );
};

export default TechBackground;