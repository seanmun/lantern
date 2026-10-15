'use client';

import { useEffect, useState } from 'react';
import { EndedStake, Wallet } from '@/types';

/**
 * Ended HEX stakes for every EVM wallet. Reloads only when the set of
 * addresses changes (renames don't refetch).
 */
export function useStakeHistory(wallets: Wallet[]) {
  const [stakes, setStakes] = useState<EndedStake[]>([]);
  const [unavailable, setUnavailable] = useState<string[]>([]);
  const addresses = wallets.filter((w) => w.chains.includes('pulsechain')).map((w) => w.address);
  const key = addresses.join(',');

  useEffect(() => {
    if (!key) return;
    let cancelled = false;

    (async () => {
      const results = await Promise.allSettled(
        key.split(',').map(async (address) => {
          const response = await fetch(`/api/hex/ended?address=${encodeURIComponent(address)}`);
          return (await response.json()) as { stakes: EndedStake[]; unavailable: string[] };
        })
      );
      if (cancelled) return;
      const ok = results.flatMap((r) => (r.status === 'fulfilled' && r.value.stakes ? [r.value] : []));
      setStakes(ok.flatMap((r) => r.stakes));
      setUnavailable([...new Set(ok.flatMap((r) => r.unavailable ?? []))]);
    })();

    return () => {
      cancelled = true;
    };
  }, [key]);

  return { stakes: key ? stakes : [], unavailable: key ? unavailable : [] };
}
