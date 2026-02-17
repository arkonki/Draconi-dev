import { createContext } from 'react';

export interface SessionTimeoutContextType {
  showWarning: boolean;
  extendSession: () => void;
}

export const SessionTimeoutContext = createContext<SessionTimeoutContextType | undefined>(undefined);
