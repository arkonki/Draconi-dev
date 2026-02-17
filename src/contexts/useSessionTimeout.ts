import { useContext } from 'react';
import { SessionTimeoutContext } from './SessionTimeoutContextStore';

export function useSessionTimeout() {
  const context = useContext(SessionTimeoutContext);
  if (context === undefined) {
    throw new Error('useSessionTimeout must be used within a SessionTimeoutProvider');
  }
  return context;
}
