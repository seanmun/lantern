'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Asset, APIResponse, Wallet } from '@/types';
import { applyPrices } from '@/utils/prices';

export type ChainLoadStatus = 'loading' | 'loaded' | 'error' | 'rate_limited';

export interface ChainResult {
  walletId: string;
  chain: string;
  status: ChainLoadStatus;
  assets: Asset[];
  error?: string;
  warnings?: string[];
}

const resultKey = (walletId: string, chain: string) => `${walletId}:${chain}`;

async function fetchChainAssets(chain: string, address: string, refresh: boolean): Promise<APIResponse<Asset[]>> {
  const params = new URLSearchParams({ address });
  if (refresh) params.set('refresh', '1');
  try {
    const response = await fetch(`/api/assets/${chain}?${params}`);
    return await response.json();
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error), timestamp: new Date() };
  }
}

/**
 * Loads every (wallet, chain) pair through /api/assets, then prices it.
 * New wallets load automatically; refresh() reloads everything.
 */
export function usePortfolio(wallets: Wallet[]) {
  const [results, setResults] = useState<Map<string, ChainResult>>(new Map());
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const requested = useRef(new Set<string>());

  const setResult = (result: ChainResult) => {
    setResults((prev) => new Map(prev).set(resultKey(result.walletId, result.chain), result));
  };

  const loadOne = useCallback(async (wallet: Wallet, chain: string, refresh = false) => {
    setResult({ walletId: wallet.id, chain, status: 'loading', assets: [] });

    const response = await fetchChainAssets(chain, wallet.address, refresh);
    if (!response.success || !response.data) {
      setResult({
        walletId: wallet.id,
        chain,
        status: response.errorCode === 'RATE_LIMITED' ? 'rate_limited' : 'error',
        assets: [],
        error: response.error ?? 'Unknown error',
      });
      return;
    }

    const assets = await applyPrices(response.data);
    setResult({ walletId: wallet.id, chain, status: 'loaded', assets, warnings: response.errors });
    setLastUpdated(new Date());
  }, []);

  // Load any (wallet, chain) pair we haven't requested yet
  useEffect(() => {
    for (const wallet of wallets) {
      for (const chain of wallet.chains) {
        const key = resultKey(wallet.id, chain);
        if (requested.current.has(key)) continue;
        requested.current.add(key);
        loadOne(wallet, chain);
      }
    }
  }, [wallets, loadOne]);

  const refresh = useCallback(async () => {
    await Promise.allSettled(wallets.flatMap((w) => w.chains.map((chain) => loadOne(w, chain, true))));
  }, [wallets, loadOne]);

  const retry = useCallback((walletId: string, chain: string) => {
    const wallet = wallets.find((w) => w.id === walletId);
    if (wallet) loadOne(wallet, chain, true);
  }, [wallets, loadOne]);

  // Only report results for wallets that still exist
  const walletIds = new Set(wallets.map((w) => w.id));
  const visible = [...results.values()].filter((r) => walletIds.has(r.walletId));

  return {
    results: visible,
    assets: visible.flatMap((r) => r.assets),
    isLoading: visible.some((r) => r.status === 'loading'),
    lastUpdated,
    refresh,
    retry,
  };
}
