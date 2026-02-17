import { BrowserRouter } from 'react-router-dom';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { AuthProvider } from './contexts/AuthContext';
import { NotificationProvider } from './contexts/NotificationContext';
import { AppProvider } from './contexts/AppContext'; 
import { SessionTimeoutProvider } from './contexts/SessionTimeoutContext';
import { ErrorBoundary } from './components/errors/ErrorBoundary';
import { AppRoutes } from './AppRoutes';
import { SessionTimeoutWarning } from './components/session/SessionTimeoutWarning';
import { DiceProvider } from './components/dice/DiceContext';
import { ReloadPrompt } from './pages/ReloadPrompt'; 
import { NotificationController } from './components/notifications/NotificationController';

function App() {
  const isProduction = import.meta.env.PROD;

  return (
    <BrowserRouter>
      <ErrorBoundary>
        <AppProvider>
          <AuthProvider>
            <NotificationProvider>
              <SessionTimeoutProvider>
                <DiceProvider>
                  <div className="min-h-screen bg-gray-100">
                    <AppRoutes />
                    <SessionTimeoutWarning />
                    <ReloadPrompt />
                    <NotificationController />
                  </div>
                </DiceProvider>
              </SessionTimeoutProvider>
            </NotificationProvider>
          </AuthProvider>
        </AppProvider>

        {!isProduction && <ReactQueryDevtools initialIsOpen={false} />}
      </ErrorBoundary>
    </BrowserRouter>
  );
}

export default App;
