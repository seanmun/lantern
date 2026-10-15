'use client';

import { useEffect, useState } from 'react';
import { HexNetworkStats } from '@/types';
import { fetchHexPrices } from '@/utils/prices';

export interface HexStatsWithPrice extends HexNetworkStats {
  hexPriceUSD: number | null;
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
        if (!cancelled) {
          setStats(network.map((s) => ({ ...s, hexPriceUSD: prices[s.chain] ?? null })));
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
