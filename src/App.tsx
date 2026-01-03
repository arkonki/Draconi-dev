import { BrowserRouter } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { AuthProvider } from './contexts/AuthContext';
import { AppProvider } from './contexts/AppContext'; 
import { SessionTimeoutProvider } from './contexts/SessionTimeoutContext';
import { ErrorBoundary } from './components/errors/ErrorBoundary';
import { queryClient } from './lib/queryClient';
import { AppRoutes } from './AppRoutes';
import { SessionTimeoutWarning } from './components/session/SessionTimeoutWarning';
import { DiceProvider } from './components/dice/DiceContext';

// 1. IMPORT THE COMPONENT
// (Adjust this path if you moved the file to a subfolder like './components/ReloadPrompt')
import { ReloadPrompt } from './pages/ReloadPrompt'; 

function App() {
  // Determine if the app is running in production mode
  const isProduction = import.meta.env.PROD;

  return (
    <BrowserRouter>
      <ErrorBoundary>
        <QueryClientProvider client={queryClient}>
          {/* AppProvider must wrap AuthProvider because AuthProvider uses useApp */}
          <AppProvider>
            <AuthProvider>
              <SessionTimeoutProvider>
                <DiceProvider>
                  <div className="min-h-screen bg-gray-100">
                    <AppRoutes />
                    
                    {/* Global Overlays */}
                    <SessionTimeoutWarning />
                    
                    {/* 2. PLACE THE RELOAD PROMPT HERE */}
                    <ReloadPrompt />
                    
                  </div>
                </DiceProvider>
              </SessionTimeoutProvider>
            </AuthProvider>
          </AppProvider>
          {/* Conditionally render DevTools only when not in production */}
          {!isProduction && <ReactQueryDevtools initialIsOpen={false} />}
        </QueryClientProvider>
      </ErrorBoundary>
    </BrowserRouter>
  );
}

export default App;