import { Asset } from '@/types';
import { HEX_ADDRESS } from '@/config/hex';

// Chain → CoinGecko id of its native gas coin
const NATIVE_COIN: Record<string, string> = {
  bitcoin: 'bitcoin',
  ethereum: 'ethereum',
  base: 'ethereum',
  robinhood: 'ethereum',
  pulsechain: 'pulsechain',
};

interface PriceResponse {
  natives: Record<string, number | null>;
  tokens: Record<string, Record<string, number | null>>;
}

/**
 * Returns copies of the assets with priceUSD/valueUSD filled in via /api/prices.
 * Stakes are valued at their HEX principal. NFTs and Ordinals are left unpriced.
 * On failure the assets are returned unchanged.
 */
export async function applyPrices(assets: Asset[]): Promise<Asset[]> {
  const natives = new Set<string>();
  const tokens: Record<string, Set<string>> = {};

  for (const asset of assets) {
    if (asset.type === 'native' && NATIVE_COIN[asset.chain]) {
      natives.add(NATIVE_COIN[asset.chain]);
    } else if ((asset.type === 'token' || asset.type === 'stake') && asset.contractAddress) {
      (tokens[asset.chain] ??= new Set()).add(asset.contractAddress.toLowerCase());
    }
    if (asset.pool) {
      (tokens[asset.chain] ??= new Set()).add(HEX_ADDRESS.toLowerCase());
    }
  }

  if (natives.size === 0 && Object.keys(tokens).length === 0) return assets;

  let prices: PriceResponse;
  try {
    const response = await fetch('/api/prices', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        natives: [...natives],
        tokens: Object.fromEntries(Object.entries(tokens).map(([chain, set]) => [chain, [...set]])),
      }),
    });
    if (!response.ok) throw new Error(`Price API ${response.status}`);
    prices = await response.json();
  } catch (error) {
    console.warn('⚠️ Pricing unavailable:', error);
    return assets;
  }

  return assets.map((asset) => {
    let priceUSD: number | null | undefined;
    if (asset.type === 'native') {
      priceUSD = prices.natives[NATIVE_COIN[asset.chain]];
    } else if (asset.contractAddress && (asset.type === 'token' || asset.type === 'stake')) {
      priceUSD = prices.tokens[asset.chain]?.[asset.contractAddress.toLowerCase()];
    }

    const priced: Asset = { ...asset };
    if (priceUSD != null) {
      priced.priceUSD = priceUSD;
      // A stake is worth its principal plus the interest it has earned so far
      const amount = Number(asset.balanceFormatted) + (asset.stake?.interestHex ?? 0);
      priced.valueUSD = amount * priceUSD;
    }

    const hexPrice = prices.tokens[asset.chain]?.[HEX_ADDRESS.toLowerCase()];
    if (asset.pool && hexPrice != null) {
      priced.pool = { ...asset.pool, backingValueUSD: asset.pool.backingHex * hexPrice };
    }
    return priced;
  });
}

/** HEX price per HEX chain (eHEX and pHEX trade separately). */
export async function fetchHexPrices(chains: string[]): Promise<Record<string, number | null>> {
  try {
    const response = await fetch('/api/prices', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tokens: Object.fromEntries(chains.map((c) => [c, [HEX_ADDRESS]])) }),
    });
    const prices: PriceResponse = await response.json();
    return Object.fromEntries(chains.map((c) => [c, prices.tokens[c]?.[HEX_ADDRESS.toLowerCase()] ?? null]));
  } catch {
    return {};
  }
}

export function formatUSD(value: number): string {
  // Sub-dollar prices (HEX, PLS) need significant digits, not cents
  if (value !== 0 && Math.abs(value) < 1) {
    return value.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumSignificantDigits: 3 });
  }
  return value.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}
