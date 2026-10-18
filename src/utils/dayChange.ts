import { Asset } from '@/types';

/** 24h move in USD and %, from assets whose price source reports a 24h change. */
export function dayChange(assets: Asset[]): { delta: number; pct: number } | null {
  let delta = 0;
  let previous = 0;
  for (const a of assets) {
    if (a.valueUSD === undefined || a.change24hPct === undefined || a.change24hPct <= -100) continue;
    const before = a.valueUSD / (1 + a.change24hPct / 100);
    delta += a.valueUSD - before;
    previous += before;
  }
  return previous > 0 ? { delta, pct: (delta / previous) * 100 } : null;
}
