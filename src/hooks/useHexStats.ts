'use client';

import { useEffect, useState } from 'react';
import { HexNetworkStats } from '@/types';
import { fetchHexPrices } from '@/utils/prices';

export interface HexStatsWithPrice extends HexNetworkStats {
  hexPriceUSD: number | null;
  hdrnPriceUSD: number | null;
  payoutHistory?: number[]; // daily payout per T-Share, index = HEX day
}

/**
 * Network-wide HEX stats (T-Share price, daily payout, % staked) for each
 * HEX chain, with that chain's HEX price. Loaded once when enabled.
 */
export function useHexStats(enabled: boolean) {
  const [stats, setStats] = useState<HexStatsWithPrice[]>([]);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;

    (async () => {
      try {
        const response = await fetch('/api/hex');
        const { stats: network }: { stats: HexNetworkStats[] } = await response.json();
        const prices = await fetchHexPrices(network.map((s) => s.chain));
        if (cancelled) return;
        setStats(network.map((s) => ({ ...s, hexPriceUSD: prices[s.chain]?.hex ?? null, hdrnPriceUSD: prices[s.chain]?.hdrn ?? null })));

        // History is larger and only needed by the estimator chart; load it second
        const historyResponse = await fetch('/api/hex/history');
        const { history }: { history: Record<string, number[]> } = await historyResponse.json();
        if (!cancelled) {
          setStats((prev) => prev.map((s) => ({ ...s, payoutHistory: history[s.chain] })));
        }
      } catch (error) {
        console.warn('⚠️ HEX stats unavailable:', error);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [enabled]);

  return stats;
}
