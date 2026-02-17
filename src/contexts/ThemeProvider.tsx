// src/contexts/ThemeProvider.tsx
import React, { useState, useEffect } from 'react';
import { ThemeProviderContext, type Theme, type FontSize } from './ThemeContextStore';

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
