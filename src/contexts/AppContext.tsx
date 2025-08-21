import React, { createContext, useContext, useState } from 'react';
import { AlertCircle, X, AlertTriangle } from 'lucide-react';

interface AppContextType {
  setGlobalError: (error: string | null) => void;
  setGlobalLoading: (loading: boolean) => void;
  setGlobalWarning: (warning: string | null) => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [globalLoading, setGlobalLoading] = useState(false);
  const [globalWarning, setGlobalWarning] = useState<string | null>(null);

  return (
    <AppContext.Provider value={{ setGlobalError, setGlobalLoading, setGlobalWarning }}>
      {globalLoading && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 shadow-xl">
            <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-500 border-t-transparent" />
          </div>
        </div>
      )}

      {globalWarning && (
        <div className="fixed top-4 right-4 max-w-sm z-50">
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg shadow-lg p-4">
            <div className="flex items-start gap-2">
              <AlertTriangle className="w-5 h-5 text-yellow-500 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-yellow-700">{globalWarning}</p>
              </div>
              <button
                onClick={() => setGlobalWarning(null)}
                className="text-yellow-500 hover:text-yellow-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>
      )}

      {globalError && (
        <div className="fixed top-4 right-4 max-w-sm z-50">
          <div className="bg-red-50 border border-red-200 rounded-lg shadow-lg p-4">
            <div className="flex items-start gap-2">
              <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-red-700">{globalError}</p>
              </div>
              <button
                onClick={() => setGlobalError(null)}
                className="text-red-500 hover:text-red-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>
      )}

      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const context = useContext(AppContext);
  if (context === undefined) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
}
