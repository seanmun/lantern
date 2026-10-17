import 'server-only';
import { normalizeAddress } from '@/utils/address';
import { geckoJSON } from '@/utils/gecko';

/**
 * Token price history for the dashboard chart, keyed by (chain, address).
 *
 * The deepest DexScreener pool for a token is looked up once, then its
 * candles come from GeckoTerminal's OHLCV API (closing price, USD, quoted in
 * the token itself): one hourly and one daily fetch per token, cached, with
 * every range cut from those. GeckoTerminal calls share one rate-limited queue.
 */

export type HistoryRange = '1D' | '1W' | '1M' | '1Y' | 'ALL';
export const HISTORY_RANGES: HistoryRange[] = ['1D', '1W', '1M', '1Y', 'ALL'];

// chain key -> [DexScreener chain id, GeckoTerminal network id]
const NETWORKS: Record<string, [string, string]> = {
  ethereum: ['ethereum', 'eth'],
  pulsechain: ['pulsechain', 'pulsechain'],
  base: ['base', 'base'],
  solana: ['solana', 'solana'],
};

// Two cached resolutions per token; each range is a slice of one
type Resolution = 'hour' | 'day';
const RESOLUTIONS: Record<Resolution, { ttlMs: number }> = {
  hour: { ttlMs: 20 * 60_000 },     // 1,000 hourly candles: about 41 days
  day: { ttlMs: 6 * 60 * 60_000 },  // 1,000 daily candles: about 2.7 years
};
const RANGE_SLICE: Record<HistoryRange, { resolution: Resolution; days: number; step: number }> = {
  '1D': { resolution: 'hour', days: 1, step: 1 },
  '1W': { resolution: 'hour', days: 7, step: 2 },
  '1M': { resolution: 'hour', days: 30, step: 6 },
  '1Y': { resolution: 'day', days: 365, step: 1 },
  ALL: { resolution: 'day', days: Infinity, step: 1 },
};
const CANDLES = 1000;          // GeckoTerminal's max per request
const POOL_TTL_MS = 24 * 60 * 60_000;
const TIMEOUT_MS = 12_000;

export const hasHistoryNetwork = (chain: string) => chain in NETWORKS;

// On globalThis so dev hot reloads don't drop the caches (and re-burst the API)
const store = ((globalThis as { __priceHistory?: unknown }).__priceHistory ??= {
  pools: new Map<string, { pool: string | null; at: number }>(),
  series: new Map<string, { points: [number, number][]; at: number }>(),
  inflight: new Map<string, Promise<[number, number][]>>(),
}) as {
  pools: Map<string, { pool: string | null; at: number }>;
  series: Map<string, { points: [number, number][]; at: number }>;
  inflight: Map<string, Promise<[number, number][]>>;
};

async function getJSON(url: string) {
  const response = await fetch(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!response.ok) throw new Error(`${new URL(url).host} ${response.status}`);
  return response.json();
}

async function deepestPool(chain: string, address: string): Promise<string | null> {
  const key = `${chain}:${address}`;
  const hit = store.pools.get(key);
  if (hit && Date.now() - hit.at < POOL_TTL_MS) return hit.pool;
  const pairs: { pairAddress: string; baseToken: { address: string }; quoteToken: { address: string }; liquidity?: { usd?: number } }[] =
    await getJSON(`https://api.dexscreener.com/tokens/v1/${NETWORKS[chain][0]}/${address}`);
  const mine = pairs.filter((p) => [p.baseToken.address, p.quoteToken.address].some((a) => normalizeAddress(chain, a) === address));
  mine.sort((a, b) => (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0));
  const pool = mine[0]?.pairAddress ?? null;
  store.pools.set(key, { pool, at: Date.now() });
  return pool;
}

async function fetchCandles(chain: string, address: string, resolution: Resolution): Promise<[number, number][]> {
  const pool = await deepestPool(chain, address);
  if (!pool) return [];
  const { data } = await geckoJSON(
    `https://api.geckoterminal.com/api/v2/networks/${NETWORKS[chain][1]}/pools/${pool}/ohlcv/${resolution}?aggregate=1&limit=${CANDLES}&currency=usd&token=${address}`
  );
  const candles: number[][] = data?.attributes?.ohlcv_list ?? [];
  return candles.filter((c) => c[4] > 0).map(([t, , , , close]) => [t * 1000, close] as [number, number]).sort((a, b) => a[0] - b[0]);
}

/** One resolution of a token's candles, cached; failures aren't cached so they're retried. */
function candles(chain: string, address: string, resolution: Resolution): Promise<[number, number][]> {
  const key = `${chain}:${address}:${resolution}`;
  const hit = store.series.get(key);
  if (hit && Date.now() - hit.at < RESOLUTIONS[resolution].ttlMs) return Promise.resolve(hit.points);
  let pending = store.inflight.get(key);
  if (!pending) {
    pending = fetchCandles(chain, address, resolution)
      .then((points) => {
        store.series.set(key, { points, at: Date.now() });
        return points;
      })
      .catch((error) => {
        console.warn(`⚠️ price history failed for ${key}:`, error.message ?? error);
        return [] as [number, number][];
      })
      .finally(() => store.inflight.delete(key));
    store.inflight.set(key, pending);
  }
  return pending;
}

/** Closing prices for a range, oldest first, as [ms, usd]; empty when no pool or history exists. */
export async function priceHistory(chain: string, rawAddress: string, range: HistoryRange): Promise<[number, number][]> {
  const { resolution, days, step } = RANGE_SLICE[range];
  const all = await candles(chain, normalizeAddress(chain, rawAddress), resolution);
  if (!all.length) return all;
  const since = all[all.length - 1][0] - days * 86_400_000;
  const inRange = all.filter(([t]) => t >= since);
  // Thin long hourly ranges, always keeping the latest candle
  return inRange.filter((_, i) => (inRange.length - 1 - i) % step === 0);
}
