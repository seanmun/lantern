import 'server-only';
import { getAddress } from 'ethers';
import { normalizeAddress } from '@/utils/address';
import { BLOCKSCOUT_HOSTS } from '@/chains/blockscout';
import { loadStockTokens } from '@/chains/robinhood';
import { geckoJSON } from '@/utils/gecko';
import { BRIDGED_MAXIMUS, MAXIMUS_POOLS } from '@/config/hex';

/**
 * Token logo resolution, server-side so the browser never asks a third party
 * for a logo (which would reveal what the wallet holds).
 *
 * Candidates per (chain, address), tried in order until one is a real image:
 * Robinhood's registry (stock tokens), DexScreener, GeckoTerminal, Blockscout,
 * PulseX's token images (Pulsechain), Trust Wallet's assets repo (Ethereum).
 * Pulsechain tokens with no logo fall back to the Ethereum token at the same
 * address: fork copies and cross-chain projects (MAXI, HDRN, ...) share it.
 *
 * Lookups for one chain are coalesced into batched API calls, and resolved
 * images (or misses) are cached in memory.
 */

export interface Logo { body: ArrayBuffer; contentType: string }

const HIT_TTL_MS = 24 * 60 * 60 * 1000;
const MISS_TTL_MS = 6 * 60 * 60 * 1000;
const RETRY_MISS_MS = 2 * 60 * 1000;
const MAX_CACHED = 1000;
const MAX_IMAGE_BYTES = 1024 * 1024;
const BATCH_SIZE = 30;
const BATCH_WAIT_MS = 30;
const TIMEOUT_MS = 8_000;

// chain key -> [DexScreener chain id, GeckoTerminal network id]
const NETWORKS: Record<string, [string, string]> = {
  ethereum: ['ethereum', 'eth'],
  pulsechain: ['pulsechain', 'pulsechain'],
  base: ['base', 'base'],
  robinhood: ['robinhood', 'robinhood'],
  solana: ['solana', 'solana'],
};

// Native coins: CoinGecko's images (stable URLs)
const NATIVE_LOGOS: Record<string, string> = {
  bitcoin: 'https://coin-images.coingecko.com/coins/images/1/large/bitcoin.png',
  ethereum: 'https://coin-images.coingecko.com/coins/images/279/large/ethereum.png',
  pulsechain: 'https://coin-images.coingecko.com/coins/images/25666/large/PLS-LogoTransparent_1.png',
  solana: 'https://coin-images.coingecko.com/coins/images/4128/large/solana.png',
};

// Bridged tokens wear their origin token's logo
const ALIASES: Record<string, [string, string]> = Object.fromEntries(
  BRIDGED_MAXIMUS.map((b) => [`pulsechain:${b.address.toLowerCase()}`, ['ethereum', MAXIMUS_POOLS.find((p) => p.symbol === b.poolSymbol)!.address]])
);

export const isLogoChain = (chain: string) => chain === 'native' || chain in NETWORKS;

const cache = new Map<string, { logo: Logo | null; at: number }>();
const inflight = new Map<string, Promise<Logo | null>>();

function remember(key: string, logo: Logo | null, ttlMs?: number) {
  if (cache.size >= MAX_CACHED) cache.delete(cache.keys().next().value!);
  // A shorter-lived miss is stored as if it were older
  cache.set(key, { logo, at: ttlMs ? Date.now() - MISS_TTL_MS + ttlMs : Date.now() });
}

async function getJSON(url: string) {
  const response = await fetch(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!response.ok) throw new Error(`${new URL(url).host} ${response.status}`);
  return response.json();
}

/** Fetch a candidate image; null unless it's a raster/SVG image under the size cap. */
async function fetchImage(url: string): Promise<Logo | null> {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    const contentType = response.headers.get('content-type')?.split(';')[0].trim() ?? '';
    if (!response.ok || !/^image\/(png|jpe?g|gif|webp|svg\+xml|avif)$/.test(contentType)) return null;
    const body = await response.arrayBuffer();
    return body.byteLength > 0 && body.byteLength <= MAX_IMAGE_BYTES ? { body, contentType } : null;
  } catch {
    return null;
  }
}

// --- candidate URLs, batched per chain ---------------------------------------

async function dexScreenerImages(chain: string, addresses: string[]) {
  const images: Record<string, string> = {};
  const pairs: { baseToken: { address: string }; info?: { imageUrl?: string }; liquidity?: { usd?: number } }[] =
    await getJSON(`https://api.dexscreener.com/tokens/v1/${NETWORKS[chain][0]}/${addresses.join(',')}`);
  const depth: Record<string, number> = {};
  for (const pair of pairs) {
    const address = normalizeAddress(chain, pair.baseToken.address);
    const liquidity = pair.liquidity?.usd ?? 0;
    if (pair.info?.imageUrl && liquidity >= (depth[address] ?? -1)) {
      depth[address] = liquidity;
      images[address] = pair.info.imageUrl;
    }
  }
  return images;
}

async function geckoTerminalImages(chain: string, addresses: string[]) {
  const images: Record<string, string> = {};
  const { data }: { data?: { attributes: { address: string; image_url?: string | null } }[] } =
    await geckoJSON(`https://api.geckoterminal.com/api/v2/networks/${NETWORKS[chain][1]}/tokens/multi/${addresses.join(',')}`);
  for (const t of data ?? []) {
    const url = t.attributes.image_url;
    if (url && !url.includes('missing')) images[normalizeAddress(chain, t.attributes.address)] = url;
  }
  return images;
}

async function blockscoutImage(chain: string, address: string) {
  const host = BLOCKSCOUT_HOSTS[chain];
  if (!host) return undefined;
  const token: { icon_url?: string | null } = await getJSON(`${host}/api/v2/tokens/${address}`);
  return token.icon_url ?? undefined;
}

/** Candidate URLs per address; `unsure` when a source errored, so a miss may not be real. */
async function candidates(chain: string, addresses: string[]): Promise<{ urls: Record<string, string[]>; unsure: boolean }> {
  const result: Record<string, string[]> = Object.fromEntries(addresses.map((a) => [a, []]));
  let unsure = false;
  const add = (images: Record<string, string>) => {
    for (const [address, url] of Object.entries(images)) result[address]?.push(url);
  };
  const settle = async <T,>(p: Promise<T>) => p.catch((error) => {
    unsure = true;
    console.warn(`⚠️ logo source failed for ${chain}:`, error.message ?? error);
    return undefined;
  });

  if (chain === 'robinhood') {
    const tokens = (await settle(loadStockTokens())) ?? [];
    add(Object.fromEntries(tokens.filter((t) => t.logoUrl).map((t) => [normalizeAddress(chain, t.address), t.logoUrl!])));
  }
  const [dex, gecko] = await Promise.all([settle(dexScreenerImages(chain, addresses)), settle(geckoTerminalImages(chain, addresses))]);
  if (dex) add(dex);
  if (gecko) add(gecko);

  // Per-token sources, only for what the batch APIs didn't cover
  await Promise.all(addresses.filter((a) => result[a].length === 0).map(async (address) => {
    const icon = await settle(blockscoutImage(chain, address));
    if (icon) result[address].push(icon);
  }));
  for (const address of addresses) {
    if (chain === 'pulsechain') result[address].push(`https://tokens.app.pulsex.com/images/tokens/${getAddress(address)}.png`);
    if (chain === 'ethereum') result[address].push(`https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/${getAddress(address)}/logo.png`);
  }
  return { urls: result, unsure };
}

// --- coalescing --------------------------------------------------------------

type Found = { logo: Logo | null; unsure: boolean };
const queues = new Map<string, { addresses: Map<string, ((found: Found) => void)[]>; timer: ReturnType<typeof setTimeout> }>();

function enqueue(chain: string, address: string): Promise<Found> {
  return new Promise((resolve) => {
    let queue = queues.get(chain);
    if (!queue) {
      queue = { addresses: new Map(), timer: setTimeout(() => flush(chain), BATCH_WAIT_MS) };
      queues.set(chain, queue);
    }
    queue.addresses.set(address, [...(queue.addresses.get(address) ?? []), resolve]);
  });
}

async function flush(chain: string) {
  const queue = queues.get(chain)!;
  queues.delete(chain);
  const all = [...queue.addresses.keys()];
  for (let i = 0; i < all.length; i += BATCH_SIZE) {
    const batch = all.slice(i, i + BATCH_SIZE);
    const { urls, unsure } = await candidates(chain, batch).catch(() => ({ urls: {} as Record<string, string[]>, unsure: true }));
    await Promise.all(batch.map(async (address) => {
      let logo: Logo | null = null;
      for (const url of urls[address] ?? []) if ((logo = await fetchImage(url))) break;
      for (const resolve of queue.addresses.get(address)!) resolve({ logo, unsure });
    }));
  }
}

// --- public ------------------------------------------------------------------

/** Logo for a token (chain + contract) or a native coin (chain 'native', id = CoinGecko id). */
export async function resolveLogo(chain: string, id: string): Promise<Logo | null> {
  const address = chain === 'native' ? id : normalizeAddress(chain, id);
  const key = `${chain}:${address}`;
  const alias = ALIASES[key];
  if (alias) return resolveLogo(...alias);
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < (hit.logo ? HIT_TTL_MS : MISS_TTL_MS)) return hit.logo;

  let pending = inflight.get(key);
  if (!pending) {
    pending = (async () => {
      let logo: Logo | null = null;
      let unsure = false;
      if (chain === 'native') logo = NATIVE_LOGOS[address] ? await fetchImage(NATIVE_LOGOS[address]) : null;
      else {
        ({ logo, unsure } = await enqueue(chain, address));
        // Same address on Ethereum: Pulsechain fork copies and shared projects
        if (!logo && chain === 'pulsechain') logo = await resolveLogo('ethereum', address);
      }
      // A miss while a source was down (rate limits) is only remembered briefly
      if (logo || !unsure) remember(key, logo);
      else remember(key, null, RETRY_MISS_MS);
      return logo;
    })().finally(() => inflight.delete(key));
    inflight.set(key, pending);
  }
  return pending;
}
