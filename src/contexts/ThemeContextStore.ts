import { createContext } from 'react';

export type Theme = 'light' | 'dark' | 'system';
export type FontSize = 'small' | 'medium' | 'large';

export interface ThemeProviderState {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  fontSize: FontSize;
  setFontSize: (size: FontSize) => void;
}

export const initialState: ThemeProviderState = {
  theme: 'system',
  setTheme: () => null,
  fontSize: 'medium',
  setFontSize: () => null,
};

export const ThemeProviderContext = createContext<ThemeProviderState>(initialState);
