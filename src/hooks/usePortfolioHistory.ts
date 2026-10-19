'use client';

import { useEffect, useMemo, useState } from 'react';
import { Asset } from '@/types';
import { NATIVE_COIN } from '@/utils/prices';
import { normalizeAddress } from '@/utils/address';

export type HistoryRange = '1D' | '1W' | '1M' | '1Y' | 'ALL';

/** A native coin's history comes from its wrapped token. */
const WRAPPED: Record<string, { chain: string; address: string }> = {
  ethereum: { chain: 'ethereum', address: '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2' },
  pulsechain: { chain: 'pulsechain', address: '0xa1077a294dde1b09bb078844df40758a5d0f9a27' },
  bitcoin: { chain: 'ethereum', address: '0x2260fac5e5542a773aa44fbcfedf7c193bc2c599' },
  solana: { chain: 'solana', address: 'So11111111111111111111111111111111111111112' },
  // No wrapped versions on the chains above: Binance-pegged tokens track them
  litecoin: { chain: 'bsc', address: '0x4338665cbb7b2485a8855a139b75d5e34ab0db94' },
  dogecoin: { chain: 'bsc', address: '0xba2ae424d960c26247dd6c32edc70b295c744c43' },
  'bitcoin-cash': { chain: 'bsc', address: '0x8ff795a6f4d97e7887c79bea79aba5cc76444adf' },
};
const HISTORY_CHAINS = new Set(['ethereum', 'pulsechain', 'base', 'solana']);
const MAX_SERIES = 10;
const RETRY_MS = 15_000;
const MAX_RETRIES = 8; // series fill in as the server's rate-limited queue gets to them; some tokens have no history at all

/** Which price series an asset moves with, or null when it has none. */
export function priceKeyOf(a: Asset): { key: string; chain: string; address: string } | null {
  if (a.type === 'native') {
    const w = WRAPPED[NATIVE_COIN[a.chain]];
    return w ? { key: `${w.chain}:${w.address}`, ...w } : null;
  }
  if ((a.type === 'token' || a.type === 'stake') && a.contractAddress && HISTORY_CHAINS.has(a.chain)) {
    const address = normalizeAddress(a.chain, a.contractAddress);
    return { key: `${a.chain}:${address}`, chain: a.chain, address };
  }
  return null;
}

export interface PortfolioPoint { t: number; value: number }
export interface PortfolioHistory {
  points: PortfolioPoint[];
  coverage: number;                            // share of today's value that moves with real history
  perKey: Map<string, [number, number][]>;     // price series by price key, for sparklines
  loading: boolean;
}

/** Last price at or before t (step series); the first price before the series starts. */
function priceAt(series: [number, number][], t: number): number {
  let lo = 0;
  let hi = series.length - 1;
  let found = 0;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (series[mid][0] <= t) {
      found = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return series[found][1];
}

const cache = new Map<string, Promise<Record<string, [number, number][]>>>();

/**
 * Today's holdings valued at past prices: each position's units (value now /
 * price now) times its price then. The largest positions with a price series
 * move; the rest are held at today's value.
 */
export function usePortfolioHistory(assets: Asset[], range: HistoryRange): PortfolioHistory {
  const groups = useMemo(() => {
    const byKey = new Map<string, { chain: string; address: string; units: number; value: number }>();
    for (const a of assets) {
      if (!a.valueUSD || !a.priceUSD) continue;
      const k = priceKeyOf(a);
      if (!k) continue;
      const g = byKey.get(k.key) ?? { chain: k.chain, address: k.address, units: 0, value: 0 };
      g.units += a.valueUSD / a.priceUSD;
      g.value += a.valueUSD;
      byKey.set(k.key, g);
    }
    return [...byKey.entries()].sort((a, b) => b[1].value - a[1].value).slice(0, MAX_SERIES);
  }, [assets]);

  const request = useMemo(() => JSON.stringify({ range, tokens: groups.map(([, g]) => ({ chain: g.chain, address: g.address })) }), [groups, range]);
  const [loaded, setLoaded] = useState<{ request: string; series: Record<string, [number, number][]> } | null>(null);
  const [attempt, setAttempt] = useState({ request: '', n: 0 });
  const tries = attempt.request === request ? attempt.n : 0;

  useEffect(() => {
    if (groups.length === 0) return;
    let cancelled = false;
    let pending = cache.get(request);
    if (!pending) {
      pending = fetch('/api/history', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: request })
        .then((r) => r.json())
        .then((d) => d.series ?? {});
      cache.set(request, pending);
      // Keep only complete answers: a series the server couldn't get is asked for again next time
      pending
        .then((series: Record<string, [number, number][]>) => Object.values(series).some((v) => v.length === 0) && cache.delete(request))
        .catch(() => cache.delete(request));
    }
    let retry: ReturnType<typeof setTimeout> | undefined;
    pending
      .then((series) => {
        if (cancelled) return;
        setLoaded({ request, series });
        // Rate-limited series come back empty: ask again shortly
        if (Object.values(series).some((v) => v.length === 0) && tries < MAX_RETRIES) {
          retry = setTimeout(() => setAttempt({ request, n: tries + 1 }), RETRY_MS);
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
      clearTimeout(retry);
    };
  }, [request, groups.length, tries]);

  return useMemo(() => {
    const total = assets.reduce((s, a) => s + (a.valueUSD ?? 0), 0);
    const series = loaded?.request === request ? loaded.series : null;
    const perKey = new Map<string, [number, number][]>();
    if (!series) return { points: [], coverage: 0, perKey, loading: groups.length > 0 };

    const moving = groups.filter(([key]) => (series[key]?.length ?? 0) > 1);
    for (const [key] of moving) perKey.set(key, series[key]);
    const movingNow = moving.reduce((s, [, g]) => s + g.value, 0);
    const flat = total - movingNow;

    // Timeline: the densest series' timestamps
    const timeline = moving.map(([key]) => series[key]).sort((a, b) => b.length - a.length)[0]?.map(([t]) => t) ?? [];
    const points = timeline.map((t) => ({
      t,
      value: flat + moving.reduce((s, [key, g]) => s + g.units * priceAt(series[key], t), 0),
    }));
    // End one step past the last candle on today's value, so the chart meets the headline number
    if (timeline.length > 1) points.push({ t: 2 * timeline[timeline.length - 1] - timeline[timeline.length - 2], value: total });
    return { points, coverage: total > 0 ? movingNow / total : 0, perKey, loading: moving.length === 0 && tries < MAX_RETRIES };
  }, [assets, groups, loaded, request, tries]);
}
