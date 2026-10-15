import { NextRequest, NextResponse } from 'next/server';

/**
 * Price API
 *
 * POST /api/prices
 *   { natives: ['bitcoin', 'ethereum', 'pulsechain'],
 *     tokens: { pulsechain: ['0x2b59...'], ethereum: [...] } }
 * → { natives: { bitcoin: 82000 }, tokens: { pulsechain: { '0x2b59...': 0.0013 } } }
 *
 * Tokens are always priced by (chain, contract address) because the same
 * address can trade at different prices per chain (eHEX vs pHEX).
 *
 * Sources: CoinGecko for natives (optional COINGECKO_API_KEY, server-side),
 * DexScreener for tokens with GeckoTerminal as fallback. Results are cached
 * in memory so the free tiers' rate limits aren't hit on every refresh.
 */

const CACHE_TTL_MS = 60_000;
const BATCH_SIZE = 30;
const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

// chain key → [DexScreener chain id, GeckoTerminal network id]
const TOKEN_NETWORKS: Record<string, [string, string]> = {
  ethereum: ['ethereum', 'eth'],
  pulsechain: ['pulsechain', 'pulsechain'],
  base: ['base', 'base'],
  robinhood: ['robinhood', 'robinhood'],
};

// Native coin → wrapped token used as a fallback when CoinGecko fails
const NATIVE_FALLBACKS: Record<string, [string, string]> = {
  bitcoin: ['ethereum', '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599'], // WBTC
  ethereum: ['ethereum', '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2'], // WETH
  pulsechain: ['pulsechain', '0xA1077a294dDE1B09bB078844df40758a5D0f9a27'], // WPLS
};

const cache = new Map<string, { price: number | null; at: number }>();

function cached(key: string): number | null | undefined {
  const hit = cache.get(key);
  return hit && Date.now() - hit.at < CACHE_TTL_MS ? hit.price : undefined;
}

function chunk<T>(items: T[], size: number): T[][] {
  return Array.from({ length: Math.ceil(items.length / size) }, (_, i) => items.slice(i * size, i * size + size));
}

async function getJSON(url: string, headers: Record<string, string> = {}) {
  const response = await fetch(url, { headers: { Accept: 'application/json', ...headers }, signal: AbortSignal.timeout(10_000) });
  if (!response.ok) throw new Error(`${new URL(url).host} ${response.status}`);
  return response.json();
}

interface DexPair {
  baseToken: { address: string };
  priceUsd?: string;
  liquidity?: { usd?: number };
}

/** DexScreener: price from the deepest-liquidity pair where the token is the base. */
async function fromDexScreener(chain: string, addresses: string[]): Promise<Record<string, number>> {
  const prices: Record<string, number> = {};
  const best: Record<string, number> = {};
  for (const batch of chunk(addresses, BATCH_SIZE)) {
    const pairs: DexPair[] = await getJSON(`https://api.dexscreener.com/tokens/v1/${TOKEN_NETWORKS[chain][0]}/${batch.join(',')}`);
    for (const pair of pairs) {
      const address = pair.baseToken.address.toLowerCase();
      const liquidity = pair.liquidity?.usd ?? 0;
      if (pair.priceUsd && liquidity >= (best[address] ?? -1)) {
        best[address] = liquidity;
        prices[address] = Number(pair.priceUsd);
      }
    }
  }
  return prices;
}

async function fromGeckoTerminal(chain: string, addresses: string[]): Promise<Record<string, number>> {
  const prices: Record<string, number> = {};
  for (const batch of chunk(addresses, BATCH_SIZE)) {
    const data = await getJSON(`https://api.geckoterminal.com/api/v2/simple/networks/${TOKEN_NETWORKS[chain][1]}/token_price/${batch.join(',')}`);
    for (const [address, price] of Object.entries<string | null>(data.data?.attributes?.token_prices ?? {})) {
      if (price != null) prices[address.toLowerCase()] = Number(price);
    }
  }
  return prices;
}

async function priceTokens(chain: string, addresses: string[]): Promise<Record<string, number | null>> {
  const result: Record<string, number | null> = {};
  let missing: string[] = [];
  for (const address of addresses) {
    const hit = cached(`${chain}:${address}`);
    if (hit !== undefined) result[address] = hit;
    else missing.push(address);
  }

  for (const source of [fromDexScreener, fromGeckoTerminal]) {
    if (missing.length === 0) break;
    try {
      const prices = await source(chain, missing);
      for (const address of missing) {
        if (prices[address] !== undefined) result[address] = prices[address];
      }
      missing = missing.filter((address) => result[address] === undefined);
    } catch (error) {
      console.warn(`⚠️ ${source.name} failed for ${chain}:`, error);
    }
  }

  for (const address of addresses) {
    result[address] ??= null;
    cache.set(`${chain}:${address}`, { price: result[address], at: Date.now() });
  }
  return result;
}

async function priceNatives(ids: string[]): Promise<Record<string, number | null>> {
  const result: Record<string, number | null> = {};
  const missing = ids.filter((id) => {
    const hit = cached(`native:${id}`);
    if (hit !== undefined) result[id] = hit;
    return hit === undefined;
  });
  if (missing.length === 0) return result;

  try {
    const key = process.env.COINGECKO_API_KEY;
    const data = await getJSON(
      `https://api.coingecko.com/api/v3/simple/price?ids=${missing.join(',')}&vs_currencies=usd`,
      key ? { 'x-cg-demo-api-key': key } : {}
    );
    for (const id of missing) {
      if (data[id]?.usd != null) result[id] = data[id].usd;
    }
  } catch (error) {
    console.warn('⚠️ CoinGecko failed, falling back to wrapped tokens:', error);
  }

  for (const id of missing) {
    if (result[id] === undefined && NATIVE_FALLBACKS[id]) {
      const [chain, address] = NATIVE_FALLBACKS[id];
      const prices = await priceTokens(chain, [address.toLowerCase()]);
      result[id] = prices[address.toLowerCase()];
    }
    result[id] ??= null;
    cache.set(`native:${id}`, { price: result[id], at: Date.now() });
  }
  return result;
}

export async function POST(request: NextRequest) {
  let body: { natives?: unknown; tokens?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const natives = (Array.isArray(body.natives) ? body.natives : [])
    .filter((id): id is string => typeof id === 'string' && id in NATIVE_FALLBACKS);

  const tokenRequests = Object.entries(typeof body.tokens === 'object' && body.tokens ? body.tokens : {})
    .filter(([chain, addresses]) => chain in TOKEN_NETWORKS && Array.isArray(addresses))
    .map(([chain, addresses]) => [
      chain,
      [...new Set((addresses as unknown[]).filter((a): a is string => typeof a === 'string' && ADDRESS_RE.test(a)).map((a) => a.toLowerCase()))].slice(0, 100),
    ] as const);

  const [nativePrices, ...tokenPrices] = await Promise.all([
    priceNatives(natives),
    ...tokenRequests.map(([chain, addresses]) => priceTokens(chain, addresses)),
  ]);

  return NextResponse.json({
    natives: nativePrices,
    tokens: Object.fromEntries(tokenRequests.map(([chain], i) => [chain, tokenPrices[i]])),
  });
}
