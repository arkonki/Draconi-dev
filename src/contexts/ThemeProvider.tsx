// src/contexts/ThemeProvider.tsx
import React, { createContext, useContext, useState, useEffect } from 'react';

type Theme = 'light' | 'dark' | 'system';
type FontSize = 'small' | 'medium' | 'large';

interface ThemeProviderState {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  fontSize: FontSize;
  setFontSize: (size: FontSize) => void;
}

const initialState: ThemeProviderState = {
  theme: 'system',
  setTheme: () => null,
  fontSize: 'medium',
  setFontSize: () => null,
};

const ThemeProviderContext = createContext<ThemeProviderState>(initialState);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // Use state, but initialize from localStorage or default to 'system'
  const [theme, setTheme] = useState<Theme>(
    () => (localStorage.getItem('theme') as Theme) || 'system'
  );
  const [fontSize, setFontSize] = useState<FontSize>(
    () => (localStorage.getItem('fontSize') as FontSize) || 'medium'
  );

  useEffect(() => {
    const root = window.document.documentElement;

    // Handle Theme
    const isDark =
      theme === 'dark' ||
      (theme === 'system' &&
        window.matchMedia('(prefers-color-scheme: dark)').matches);

    root.classList.toggle('dark', isDark);

    // Handle Font Size
    root.classList.remove('text-sm', 'text-base', 'text-lg');
    if (fontSize === 'small') root.classList.add('text-sm');
    else if (fontSize === 'large') root.classList.add('text-lg');
    else root.classList.add('text-base'); // 'medium' is the default

    // Save preferences to localStorage
    localStorage.setItem('theme', theme);
    localStorage.setItem('fontSize', fontSize);

  }, [theme, fontSize]);

  // Listen for system theme changes if 'system' is selected
  useEffect(() => {
    if (theme !== 'system') return;

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    
    const handleChange = () => {
      const root = window.document.documentElement;
      root.classList.toggle('dark', mediaQuery.matches);
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, [theme]);

  const value = {
    theme,
    setTheme,
    fontSize,
    setFontSize,
  };

  return (
    <ThemeProviderContext.Provider value={value}>
      {children}
    </ThemeProviderContext.Provider>
  );
}

// Custom hook to easily consume the context
export const useTheme = () => {
  const context = useContext(ThemeProviderContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};
