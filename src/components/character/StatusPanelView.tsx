import React, { useEffect } from 'react';
import { useCharacterSheetStore } from '../../stores/characterSheetStore';
import { X, Zap, AlertCircle } from 'lucide-react';

export function StatusPanelView() {
  const activeStatusMessage = useCharacterSheetStore((state) => state.activeStatusMessage);
  const clearActiveStatusMessage = useCharacterSheetStore((state) => state.clearActiveStatusMessage);
  const saveError = useCharacterSheetStore((state) => state.saveError);
  
  // Auto-dismiss the active status message after 5 seconds
  useEffect(() => {
    if (activeStatusMessage) {
      const timer = setTimeout(() => {
        clearActiveStatusMessage();
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [activeStatusMessage, clearActiveStatusMessage]);

  // If nothing to show, render nothing
  if (!activeStatusMessage && !saveError) {
    return null;
  }

  return (
    <div className="fixed top-4 right-4 z-[100] flex flex-col gap-3 pointer-events-none w-full max-w-sm px-4 sm:px-0">
      
      {/* 1. ERROR TOAST (High Priority) */}
      {saveError && (
        <div className="pointer-events-auto flex items-start gap-3 bg-white border border-red-200 text-red-800 px-4 py-3 rounded-xl shadow-xl shadow-red-900/10 animate-in slide-in-from-top-5 fade-in duration-300">
          <div className="p-1.5 bg-red-100 rounded-full shrink-0">
            <AlertCircle className="w-5 h-5 text-red-600" />
          </div>
          <div className="flex-col flex grow">
            <span className="font-bold text-xs uppercase tracking-wider opacity-80 text-red-600 mb-0.5">Error</span>
            <span className="text-sm font-medium leading-tight">{saveError}</span>
          </div>
        </div>
      )}

      {/* 2. STATUS / SUCCESS TOAST */}
      {activeStatusMessage && (
        <div className="pointer-events-auto flex items-center gap-3 bg-indigo-900 text-white px-4 py-3 rounded-xl shadow-2xl shadow-indigo-900/20 animate-in slide-in-from-top-5 fade-in duration-300 border border-indigo-700/50 backdrop-blur-sm">
          <div className="p-1.5 bg-indigo-500/30 rounded-full shrink-0">
            <Zap className="w-5 h-5 text-yellow-300" />
          </div>
          <div className="flex flex-col mr-2 grow">
            <span className="font-bold text-[10px] uppercase tracking-wider text-indigo-300 mb-0.5">System</span>
            <span className="text-sm font-medium leading-tight">{activeStatusMessage}</span>
          </div>
          <button 
            onClick={clearActiveStatusMessage}
            className="w-9 h-9 flex items-center justify-center text-indigo-300 hover:text-white hover:bg-white/10 rounded-full transition-colors shrink-0 touch-manipulation"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

    </div>
  );
}
