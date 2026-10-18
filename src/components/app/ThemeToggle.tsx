'use client';

import { useSyncExternalStore } from 'react';

type Theme = 'dark' | 'light';
const KEY = 'lantern.theme';
const listeners = new Set<() => void>();

const current = (): Theme => (document.documentElement.dataset.theme === 'light' ? 'light' : 'dark');

function setTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  try {
    localStorage.setItem(KEY, theme);
  } catch {
    // private mode: the choice just won't persist
  }
  listeners.forEach((l) => l());
}

/** The active theme, reactive (dark by default; set before first paint in layout.tsx). */
export function useTheme(): Theme {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    current,
    () => 'dark'
  );
}

export function ThemeToggle() {
  const theme = useTheme();
  const next: Theme = theme === 'dark' ? 'light' : 'dark';
  return (
    <button
      type="button"
      onClick={() => setTheme(next)}
      aria-label={`Switch to ${next} mode`}
      title={`Switch to ${next} mode`}
      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-soft text-ink hover:bg-line"
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-[18px] w-[18px]" aria-hidden="true">
        {theme === 'dark'
          ? <path d="M12 3v2M12 19v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M3 12h2M19 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8z" />
          : <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" />}
      </svg>
    </button>
  );
}
