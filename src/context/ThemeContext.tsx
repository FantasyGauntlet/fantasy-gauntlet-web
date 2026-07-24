'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';

type Theme = 'dark' | 'light';

interface ThemeContextValue {
  theme: Theme;
  toggle: () => void;
}

const ThemeContext = createContext<ThemeContextValue>({ theme: 'dark', toggle: () => {} });

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>('dark');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem('fg-theme') as Theme | null;
    const initial = saved ?? 'dark';
    apply(initial);
    setTheme(initial);
    setMounted(true);
  }, []);

  function apply(t: Theme) {
    const root = document.documentElement;
    root.classList.add('theme-switching');
    if (t === 'light') {
      root.classList.add('light');
      root.classList.remove('dark');
    } else {
      root.classList.remove('light');
      root.classList.add('dark');
    }
    // Remove after two frames so the theme paint is instant but hover transitions still work
    requestAnimationFrame(() => requestAnimationFrame(() => root.classList.remove('theme-switching')));
  }

  function toggle() {
    const next: Theme = theme === 'dark' ? 'light' : 'dark';
    apply(next);
    setTheme(next);
    localStorage.setItem('fg-theme', next);
  }

  if (!mounted) return <>{children}</>;

  return (
    <ThemeContext.Provider value={{ theme, toggle }}>
      {children}
    </ThemeContext.Provider>
  );
}

export const useTheme = () => useContext(ThemeContext);
