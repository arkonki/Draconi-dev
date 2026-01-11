import { BrowserRouter } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { AuthProvider } from './contexts/AuthContext';
import { NotificationProvider } from './contexts/NotificationContext';
import { AppProvider } from './contexts/AppContext'; 
import { SessionTimeoutProvider } from './contexts/SessionTimeoutContext';
import { ErrorBoundary } from './components/errors/ErrorBoundary';
import { queryClient } from './lib/queryClient';
import { AppRoutes } from './AppRoutes';
import { SessionTimeoutWarning } from './components/session/SessionTimeoutWarning';
import { DiceProvider } from './components/dice/DiceContext';
import { ReloadPrompt } from './pages/ReloadPrompt'; 
// 1. Import the new Controller
import { NotificationController } from './components/notifications/NotificationController';

function App() {
  const isProduction = import.meta.env.PROD;

  return (
    <BrowserRouter>
      <ErrorBoundary>
        <QueryClientProvider client={queryClient}>
          <AppProvider>
            <AuthProvider>
              <NotificationProvider>
                <SessionTimeoutProvider>
                  <DiceProvider>
                    <div className="min-h-screen bg-gray-100">
                      <AppRoutes />
                      
                      {/* Global Overlays */}
                      <SessionTimeoutWarning />
                      <ReloadPrompt />

                      {/* 2. Place the Controller here. 
                          It sits silently and watches for DB events. */}
                      <NotificationController />
                      
                    </div>
                  </DiceProvider>
                </SessionTimeoutProvider>
              </NotificationProvider>
            </AuthProvider>
          </AppProvider>
          
          {!isProduction && <ReactQueryDevtools initialIsOpen={false} />}
        </QueryClientProvider>
      </ErrorBoundary>
    </BrowserRouter>
  );
}

export default App;
