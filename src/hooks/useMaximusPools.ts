'use client';

import { useEffect, useState } from 'react';
import { HexPoolStats } from '@/types';

export interface PoolWithPrice extends HexPoolStats {
  priceUSD: number | null; // pool token market price on its chain
}

let cached: Promise<PoolWithPrice[]> | null = null;

/** Every Maximus pool's current cycle plus its token's market price, loaded once per session. */
function loadPools(): Promise<PoolWithPrice[]> {
  cached ??= (async () => {
    const { pools }: { pools: HexPoolStats[] } = await (await fetch('/api/hex/pools')).json();
    if (!pools?.length) throw new Error('No pool data');
    const byChain: Record<string, string[]> = {};
    for (const p of pools) (byChain[p.chain] ??= []).push(p.address);
    const response = await fetch('/api/prices', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tokens: byChain }),
    });
    const { tokens }: { tokens: Record<string, Record<string, number | null>> } = await response.json();
    return pools.map((p) => ({ ...p, priceUSD: tokens?.[p.chain]?.[p.address.toLowerCase()] ?? null }));
  })().catch((error) => {
    cached = null; // let a later mount retry
    throw error;
  });
  return cached;
}

export function useMaximusPools() {
  const [pools, setPools] = useState<PoolWithPrice[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    loadPools()
      .then((p) => !cancelled && setPools(p))
      .catch((error) => console.warn('⚠️ Maximus pools unavailable:', error));
    return () => {
      cancelled = true;
    };
  }, []);
  return pools;
}
