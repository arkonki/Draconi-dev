import React from 'react';

export function VersionDisplay() {
  const version = import.meta.env.VITE_APP_VERSION || '0.0.0';
  const buildDateRaw = import.meta.env.VITE_BUILD_DATE;
  
  // Format the date to be short and readable
  const formattedDate = buildDateRaw 
    ? new Date(buildDateRaw).toLocaleDateString(undefined, { 
        month: 'short', 
        day: 'numeric',
        hour: '2-digit', 
        minute: '2-digit' 
      }) 
    : '';

  return (
    <div className="fixed bottom-1 left-1 z-50 pointer-events-none opacity-40 hover:opacity-100 transition-opacity">
      <p className="text-[10px] text-gray-500 font-mono bg-white/80 px-1.5 py-0.5 rounded shadow-sm border border-gray-200">
        v{version} <span className="hidden sm:inline text-gray-400">| {formattedDate}</span>
      </p>
    </div>
  );
}