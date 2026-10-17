'use client';

import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { Wallet } from '@/types';

export type TxType = 'receive' | 'send' | 'swap' | 'stake' | 'approval' | 'contract' | 'nft';
export interface TxTransfer { symbol: string; amount: number; direction: 'in' | 'out'; contract?: string; nft?: boolean }
export interface Tx {
  id: string; chain: string; wallet: string; hash: string; timestamp: number; type: TxType;
  method?: string; status: 'success' | 'failed'; fee?: number; counterparty?: string;
  transfers: TxTransfer[]; explorerUrl: string;
}

interface Source {
  key: string; // walletId:chain
  chain: string;
  address: string;
  txs: Tx[];
  cursor: string | null;
  loading: boolean;
  started: boolean;
  error?: string;
  unavailable?: string;
}

/**
 * Transaction history per (wallet, chain), cached for the session so leaving
 * and returning to the Activity page doesn't refetch what's already loaded.
 */
const sources = new Map<string, Source>();
const listeners = new Set<() => void>();
let version = 0;
const emit = () => {
  version++;
  listeners.forEach((l) => l());
};

async function loadPage(source: Source) {
  if (source.loading || (source.started && !source.cursor)) return;
  source.loading = true;
  emit();
  try {
    const params = new URLSearchParams({ chain: source.chain, address: source.address });
    if (source.cursor) params.set('cursor', source.cursor);
    const response = await fetch(`/api/transactions?${params}`);
    const body: { txs?: Tx[]; cursor?: string | null; unavailable?: string; error?: string } = await response.json();
    const seen = new Set(source.txs.map((t) => t.id));
    source.txs = [...source.txs, ...(body.txs ?? []).filter((t) => !seen.has(t.id))];
    source.cursor = body.cursor ?? null;
    source.unavailable = body.unavailable;
    source.error = body.error;
  } catch (error) {
    source.error = error instanceof Error ? error.message : 'Failed to load';
  } finally {
    source.started = true;
    source.loading = false;
    emit();
  }
}

export function useTransactions(wallets: Wallet[]) {
  const subscribe = useCallback((l: () => void) => {
    listeners.add(l);
    return () => listeners.delete(l);
  }, []);
  useSyncExternalStore(subscribe, () => version, () => 0);

  const wanted = wallets.flatMap((w) => w.chains.map((chain) => ({ key: `${w.id}:${chain}`, chain, address: w.address })));

  useEffect(() => {
    for (const w of wanted) {
      if (!sources.has(w.key)) sources.set(w.key, { ...w, txs: [], cursor: null, loading: false, started: false });
    }
    // First page for every source, a few at a time
    const pending = wanted.map((w) => sources.get(w.key)!).filter((s) => !s.started && !s.loading);
    let cancelled = false;
    (async () => {
      for (let i = 0; i < pending.length && !cancelled; i += 4) {
        await Promise.all(pending.slice(i, i + 4).map(loadPage));
      }
    })();
    return () => {
      cancelled = true;
    };
    // wanted is derived from wallets
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wallets]);

  const active = wanted.map((w) => sources.get(w.key)).filter((s): s is Source => !!s);
  const walletOf = new Map(wanted.map((w) => [w.key, w.key.split(':')[0]]));

  const txs = active
    .flatMap((s) => s.txs.map((tx) => ({ ...tx, walletId: walletOf.get(s.key)! })))
    .sort((a, b) => b.timestamp - a.timestamp);

  const loadMore = useCallback(async () => {
    const more = wanted.map((w) => sources.get(w.key)).filter((s): s is Source => !!s && !!s.cursor && !s.loading);
    for (let i = 0; i < more.length; i += 4) await Promise.all(more.slice(i, i + 4).map(loadPage));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wallets]);

  return {
    txs,
    loading: active.some((s) => s.loading),
    initialLoading: active.some((s) => !s.started),
    hasMore: active.some((s) => !!s.cursor),
    notes: [...new Set(active.flatMap((s) => [s.unavailable, s.error && `${s.chain}: ${s.error}`].filter((x): x is string => !!x)))],
    loadMore,
  };
}
