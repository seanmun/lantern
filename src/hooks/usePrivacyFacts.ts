'use client';

import { useEffect, useSyncExternalStore } from 'react';
import { PrivacyFacts } from '@/types/privacy';

/**
 * Privacy facts per (address, chain), saved in this browser with the date
 * they were checked. A check costs the server a couple of dozen explorer
 * calls and takes seconds, so it runs once per wallet, automatically, the
 * first time; after that the saved result shows instantly on every load, and
 * a fresh check runs only when the viewer asks for one (recheckPrivacy).
 * Checks run one at a time, never all at once.
 */

export const PRIVACY_COIN_CHAINS = ['bitcoin', 'litecoin', 'dogecoin', 'bitcoincash'];

/** Which chain to score an address on: EVM addresses together, coin addresses by their (first) coin chain */
export function privacyChainOf(address: string, chains: string[]): string | null {
  if (/^0x[0-9a-fA-F]{40}$/.test(address)) return 'evm';
  return chains.find((c) => PRIVACY_COIN_CHAINS.includes(c)) ?? null;
}

export interface PrivacyEntry {
  facts: PrivacyFacts | null;
  checkedAt: number | null; // when the saved facts were fetched
  checking: boolean;        // a check is queued or running
  failed: boolean;          // the last check couldn't read this wallet (any saved facts stay)
}

const STORAGE_KEY = 'lantern.privacy.v1';
const MAX_SAVED = 50;
type Saved = Record<string, { facts: PrivacyFacts; checkedAt: number }>;

const saved = new Map<string, { facts: PrivacyFacts; checkedAt: number }>();
const checking = new Set<string>();
const failed = new Set<string>();
const listeners = new Set<() => void>();
let loaded = false;
let queue: Promise<void> = Promise.resolve();
let version = 0;

const keyOf = (address: string, chain: string) => `${chain}:${address.toLowerCase()}`;
export const privacyKey = keyOf;

function load() {
  if (loaded || typeof window === 'undefined') return;
  loaded = true;
  try {
    const data = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as Saved;
    for (const [key, value] of Object.entries(data)) {
      if (value?.facts && typeof value.checkedAt === 'number') saved.set(key, value);
    }
  } catch {
    // nothing saved, or storage blocked: checks still work for this session
  }
}

function persist() {
  // /check saves any address looked up, so keep only the most recent checks
  if (saved.size > MAX_SAVED) {
    const oldest = [...saved].sort((a, b) => a[1].checkedAt - b[1].checkedAt).slice(0, saved.size - MAX_SAVED);
    for (const [key] of oldest) saved.delete(key);
  }
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(Object.fromEntries(saved)));
  } catch {
    // storage full or blocked: the result still shows for this session
  }
}

function notify() {
  version++;
  listeners.forEach((l) => l());
}

/** Queue a check. Without `fresh`, a wallet that already has a saved result is left alone. */
function request(address: string, chain: string, fresh: boolean) {
  load();
  const key = keyOf(address, chain);
  if (checking.has(key) || (!fresh && saved.has(key))) return;
  checking.add(key);
  failed.delete(key);
  notify();
  queue = queue.then(async () => {
    try {
      // `fresh` skips the server's short cache, so a re-run really re-reads the chains
      const url = `/api/privacy?address=${encodeURIComponent(address)}${chain === 'evm' ? '' : `&chain=${chain}`}${fresh ? '&fresh=1' : ''}`;
      const res = await fetch(url, { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      saved.set(key, { facts: (await res.json()) as PrivacyFacts, checkedAt: Date.now() });
      persist();
    } catch {
      failed.add(key);
    }
    checking.delete(key);
    notify();
  });
}

/** Run a fresh check for one wallet; its saved score keeps showing until the new one arrives. */
export function recheckPrivacy(address: string, chain: string) {
  request(address, chain, true);
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  // Another tab finished a check
  const onStorage = (e: StorageEvent) => {
    if (e.key !== STORAGE_KEY) return;
    loaded = false;
    saved.clear();
    load();
    notify();
  };
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', onStorage);
  };
}

const getVersion = () => {
  load();
  return version;
};

function entryOf(key: string): PrivacyEntry {
  const s = saved.get(key);
  return { facts: s?.facts ?? null, checkedAt: s?.checkedAt ?? null, checking: checking.has(key), failed: failed.has(key) };
}

const EMPTY: PrivacyEntry = { facts: null, checkedAt: null, checking: false, failed: false };

/** One wallet's saved facts (checked automatically only if it has never been checked). */
export function usePrivacyFacts(address: string | null, chain: string | null): PrivacyEntry & { loading: boolean } {
  const v = useSyncExternalStore(subscribe, getVersion, () => -1);
  useEffect(() => {
    if (address && chain) request(address, chain, false);
  }, [address, chain]);
  if (v === -1 || !address || !chain) return { ...EMPTY, loading: !!address && !!chain };
  const entry = entryOf(keyOf(address, chain));
  return { ...entry, loading: !entry.facts && !entry.failed };
}

/** Several wallets at once, keyed by privacyKey (each still checked once, then only on request). */
export function usePrivacyFactsMany(items: { address: string; chain: string | null }[]): Map<string, PrivacyEntry> {
  const v = useSyncExternalStore(subscribe, getVersion, () => -1);
  const signature = items.map((i) => `${i.chain}:${i.address}`).join('|');
  useEffect(() => {
    for (const i of items) if (i.chain) request(i.address, i.chain, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the signature covers the items
  }, [signature]);
  const out = new Map<string, PrivacyEntry>();
  if (v === -1) return out;
  for (const i of items) if (i.chain) out.set(keyOf(i.address, i.chain), entryOf(keyOf(i.address, i.chain)));
  return out;
}

// Each wallet's last known value and NFT count, so a saved score can show before balances load
const CONTEXT_KEY = 'lantern.privacy.context.v1';
type WalletContext = { valueUSD: number; nftCount: number };
let contexts: Record<string, WalletContext> | null = null;

function loadContexts(): Record<string, WalletContext> {
  if (contexts) return contexts;
  try {
    contexts = JSON.parse(localStorage.getItem(CONTEXT_KEY) ?? '{}') as Record<string, WalletContext>;
  } catch {
    contexts = {};
  }
  return contexts;
}

/**
 * The context to score with: the live one once balances have loaded (and
 * it's remembered), else the one remembered from the last visit.
 */
export function scoringContext(key: string, live: WalletContext, ready: boolean): WalletContext | null {
  if (typeof window === 'undefined') return ready ? live : null;
  const all = loadContexts();
  if (!ready) return all[key] ?? null;
  const prev = all[key];
  if (!prev || prev.valueUSD !== live.valueUSD || prev.nftCount !== live.nftCount) {
    all[key] = live;
    try {
      localStorage.setItem(CONTEXT_KEY, JSON.stringify(all));
    } catch {
      // storage blocked: fine, the live numbers are used
    }
  }
  return live;
}

/** "Checked today, 3:10 PM" / "Checked Oct 24" */
export function checkedLabel(at: number): string {
  const d = new Date(at);
  const today = new Date().toDateString() === d.toDateString();
  return today
    ? `Checked today, ${d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`
    : `Checked ${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', ...(d.getFullYear() !== new Date().getFullYear() && { year: 'numeric' }) })}`;
}
