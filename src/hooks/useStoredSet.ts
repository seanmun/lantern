'use client';

import { useCallback, useSyncExternalStore } from 'react';

/**
 * A string set persisted in this browser's localStorage, shared by every
 * component using the same key and kept in sync across tabs. Falls back to
 * memory when storage is unavailable (private mode, blocked site data).
 */

const EMPTY: string[] = [];
const stores = new Map<string, { current: string[] | null; listeners: Set<() => void> }>();

function store(key: string) {
  let s = stores.get(key);
  if (!s) {
    s = { current: null, listeners: new Set() };
    stores.set(key, s);
  }
  return s;
}

function load(key: string): string[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) ?? '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function useStoredSet(storageKey: string) {
  const subscribe = useCallback((listener: () => void) => {
    const st = store(storageKey);
    st.listeners.add(listener);
    const onStorage = (e: StorageEvent) => {
      if (e.key === storageKey) {
        st.current = load(storageKey);
        listener();
      }
    };
    window.addEventListener('storage', onStorage);
    return () => {
      st.listeners.delete(listener);
      window.removeEventListener('storage', onStorage);
    };
  }, [storageKey]);

  const getSnapshot = useCallback(() => {
    const st = store(storageKey);
    st.current ??= load(storageKey);
    return st.current;
  }, [storageKey]);

  const values = useSyncExternalStore(subscribe, getSnapshot, () => EMPTY);

  const save = useCallback((next: string[]) => {
    const st = store(storageKey);
    st.current = next;
    try {
      localStorage.setItem(storageKey, JSON.stringify(next));
    } catch {
      // storage unavailable: keep for this session
    }
    st.listeners.forEach((l) => l());
  }, [storageKey]);

  const add = useCallback((value: string) => {
    const cur = getSnapshot();
    if (!cur.includes(value)) save([...cur, value]);
  }, [getSnapshot, save]);
  const remove = useCallback((value: string) => save(getSnapshot().filter((v) => v !== value)), [getSnapshot, save]);

  return { values, add, remove };
}
