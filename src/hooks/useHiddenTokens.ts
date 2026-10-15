'use client';

import { useCallback, useSyncExternalStore } from 'react';
import { Asset } from '@/types';
import { normalizeAddress } from '@/utils/address';

/**
 * Tokens the viewer has hidden (spam airdrops the filters missed). Stored in
 * this browser only; hidden tokens are left out of every total.
 */

const STORAGE_KEY = 'cpt.hiddenTokens.v1';
const EMPTY: string[] = [];
let current: string[] | null = null;
const listeners = new Set<() => void>();

/** Stable id for a token across wallets: chain + contract (or standard + symbol). */
export function tokenKey(a: Pick<Asset, 'chain' | 'contractAddress' | 'tokenStandard' | 'symbol'>): string {
  return a.contractAddress ? `${a.chain}:${normalizeAddress(a.chain, a.contractAddress)}` : `${a.chain}:${a.tokenStandard}:${a.symbol}`;
}

function load(): string[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function getSnapshot(): string[] {
  current ??= load();
  return current;
}

function save(next: string[]) {
  current = next;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // storage unavailable: keep for this session
  }
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const onStorage = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY) {
      current = load();
      listener();
    }
  };
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', onStorage);
  };
}

export function useHiddenTokens() {
  const hidden = useSyncExternalStore(subscribe, getSnapshot, () => EMPTY);

  const hide = useCallback((key: string) => {
    if (!getSnapshot().includes(key)) save([...getSnapshot(), key]);
  }, []);
  const unhide = useCallback((key: string) => save(getSnapshot().filter((k) => k !== key)), []);

  return { hidden, hide, unhide };
}
