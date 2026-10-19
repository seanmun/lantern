'use client';

import { useCallback, useSyncExternalStore } from 'react';
import { Wallet } from '@/types';
import { toCashAddr, validateAddress } from '@/utils/address';

/**
 * Wallets live only in this browser's localStorage (privacy-first: nothing is
 * stored server-side). If storage is unavailable (private mode, blocked site
 * data) wallets still work for the session, held in memory.
 */

const STORAGE_KEY = 'cpt.wallets.v1';
const WALLET_KIND: Record<string, string> = { solana: 'Solana', litecoin: 'Litecoin', dogecoin: 'Dogecoin', bitcoincash: 'Bitcoin Cash' };
// Bech32 is case-insensitive (stored lowercase); CashAddr is stored with its prefix
const toCashAddrIfBch = (a: string, format: string) => (format === 'cashaddr' ? toCashAddr(a) : a.toLowerCase());
const EMPTY: Wallet[] = [];

let current: Wallet[] | null = null;
const listeners = new Set<() => void>();

function load(): Wallet[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function getSnapshot(): Wallet[] {
  current ??= load();
  return current;
}

function setWallets(next: Wallet[]) {
  current = next;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Storage unavailable: keep the in-memory copy for this session
  }
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  // Keep multiple open tabs in sync
  const onStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY) {
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

export type AddWalletResult = { ok: true; wallet: Wallet } | { ok: false; error: string };

export function useWallets() {
  const wallets = useSyncExternalStore(subscribe, getSnapshot, () => EMPTY);

  const addWallet = useCallback((address: string, name?: string): AddWalletResult => {
    const trimmed = address.trim();
    const validation = validateAddress(trimmed);
    if (!validation.isValid) {
      return { ok: false, error: 'Not a recognized EVM (0x…), Bitcoin, Solana, Litecoin, Dogecoin or Bitcoin Cash address' };
    }

    const existing = getSnapshot();
    const sameAddress = (a: string) =>
      validation.format === 'base58' ? a === trimmed
        : validation.format === 'cashaddr' ? a.toLowerCase() === toCashAddr(trimmed)
          : a.toLowerCase() === trimmed.toLowerCase();
    if (existing.some((w) => sameAddress(w.address))) {
      return { ok: false, error: 'That wallet is already being tracked' };
    }

    const now = new Date().toISOString();
    const wallet: Wallet = {
      id: crypto.randomUUID(),
      name: name?.trim() || `${validation.format === 'hex' ? 'EVM' : WALLET_KIND[validation.compatibleChains[0]] ?? 'Bitcoin'} Wallet ${existing.length + 1}`,
      address: validation.format === 'bech32' || validation.format === 'cashaddr' ? toCashAddrIfBch(trimmed, validation.format) : trimmed,
      chains: validation.compatibleChains,
      createdAt: now,
      updatedAt: now,
    };
    setWallets([...existing, wallet]);
    return { ok: true, wallet };
  }, []);

  const removeWallet = useCallback((id: string) => {
    setWallets(getSnapshot().filter((w) => w.id !== id));
  }, []);

  const renameWallet = useCallback((id: string, name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setWallets(getSnapshot().map((w) => (w.id === id ? { ...w, name: trimmed, updatedAt: new Date().toISOString() } : w)));
  }, []);

  return { wallets, addWallet, removeWallet, renameWallet };
}
