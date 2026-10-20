'use client';

import { useEffect, useSyncExternalStore } from 'react';
import { PrivacyFacts } from '@/types/privacy';

/**
 * Privacy facts per (address, chain), shared by every component and kept for
 * the session. Each lookup costs the server a couple of dozen explorer calls,
 * so wallets are fetched one at a time rather than all at once.
 */

export const PRIVACY_COIN_CHAINS = ['bitcoin', 'litecoin', 'dogecoin', 'bitcoincash'];

/** Which chain to score an address on: EVM addresses together, coin addresses by their (first) coin chain */
export function privacyChainOf(address: string, chains: string[]): string | null {
  if (/^0x[0-9a-fA-F]{40}$/.test(address)) return 'evm';
  return chains.find((c) => PRIVACY_COIN_CHAINS.includes(c)) ?? null;
}

type Entry = { facts: PrivacyFacts | null; failed: boolean };
const entries = new Map<string, Entry>();
const listeners = new Set<() => void>();
const queued = new Set<string>();
let queue: Promise<void> = Promise.resolve();
let version = 0;

const keyOf = (address: string, chain: string) => `${chain}:${address.toLowerCase()}`;

function notify() {
  version++;
  listeners.forEach((l) => l());
}

function request(address: string, chain: string) {
  const key = keyOf(address, chain);
  if (entries.has(key) || queued.has(key)) return;
  queued.add(key);
  queue = queue.then(async () => {
    try {
      const url = `/api/privacy?address=${encodeURIComponent(address)}${chain === 'evm' ? '' : `&chain=${chain}`}`;
      const res = await fetch(url);
      const body = await res.json();
      entries.set(key, res.ok ? { facts: body as PrivacyFacts, failed: false } : { facts: null, failed: true });
    } catch {
      entries.set(key, { facts: null, failed: true });
    }
    queued.delete(key);
    notify();
  });
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Facts for one address, or null while loading; `failed` when it couldn't be read. */
export function usePrivacyFacts(address: string | null, chain: string | null): Entry & { loading: boolean } {
  useSyncExternalStore(subscribe, () => version, () => 0);
  useEffect(() => {
    if (address && chain) request(address, chain);
  }, [address, chain]);
  const entry = address && chain ? entries.get(keyOf(address, chain)) : undefined;
  return { facts: entry?.facts ?? null, failed: entry?.failed ?? false, loading: !!address && !!chain && !entry };
}
