import { createContext } from 'react';

export interface AppContextType {
  setGlobalError: (error: string | null) => void;
  setGlobalLoading: (loading: boolean) => void;
  setGlobalWarning: (warning: string | null) => void;
}

export const AppContext = createContext<AppContextType | undefined>(undefined);
