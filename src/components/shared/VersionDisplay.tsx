import React from 'react';

export function VersionDisplay() {
  const version = import.meta.env.VITE_APP_VERSION || '0.0.0';
  const buildDateRaw = import.meta.env.VITE_BUILD_DATE;
  
  const formattedDate = buildDateRaw 
    ? new Date(buildDateRaw).toLocaleDateString(undefined, { 
        month: 'short', 
        day: 'numeric',
        hour: '2-digit', 
        minute: '2-digit' 
      }) 
    : '';

  return (
    // Changed 'bottom-1' to 'bottom-4' or 'bottom-safe' to clear mobile bars
    // Added 'bg-white' (no transparency) to ensure readability
    <div className="fixed bottom-2 left-2 z-[9999] pointer-events-none opacity-50 hover:opacity-100 transition-opacity">
      <p className="text-[10px] text-gray-600 font-mono bg-white px-2 py-1 rounded shadow-md border border-gray-300">
        v{version} <span className="hidden sm:inline text-gray-400">| {formattedDate}</span>
      </p>
    </div>
  );
}
