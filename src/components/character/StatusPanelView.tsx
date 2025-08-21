import React from 'react';
import { useCharacterSheetStore } from '../../stores/characterSheetStore';
import { X, Zap } from 'lucide-react';

export function StatusPanelView() {
  const activeStatusMessage = useCharacterSheetStore((state) => state.activeStatusMessage);
  const clearActiveStatusMessage = useCharacterSheetStore((state) => state.clearActiveStatusMessage);

  if (!activeStatusMessage) {
    return null;
  }

  return (
    <div className="my-3 p-3 bg-blue-100 border border-blue-300 rounded-lg shadow-sm flex items-center justify-between animate-fadeIn">
      <div className="flex items-center">
        <Zap className="w-5 h-5 text-blue-600 mr-2" />
        <p className="text-sm text-blue-800">
          Activated: <span className="font-semibold">{activeStatusMessage}</span>
        </p>
      </div>
      <button
        onClick={clearActiveStatusMessage}
        className="p-1 text-blue-600 hover:text-blue-800 hover:bg-blue-200 rounded-full transition-colors"
        aria-label="Dismiss status message"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}

// Basic fadeIn animation - you might want to add this to your global CSS or Tailwind config
// For Tailwind, you'd add this to tailwind.config.js keyframes and then create a utility class.
// Example for tailwind.config.js:
/*
module.exports = {
  // ...
  theme: {
    extend: {
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
      },
      animation: {
        fadeIn: 'fadeIn 0.5s ease-out',
      },
    },
  },
  // ...
};
*/
// If not using Tailwind for animations, add to your global CSS:
/*
@keyframes fadeIn {
  0% { opacity: 0; }
  100% { opacity: 1; }
}
.animate-fadeIn {
  animation: fadeIn 0.5s ease-out;
}
*/
