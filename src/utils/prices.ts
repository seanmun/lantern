import { Asset } from '@/types';
import { HEX_ADDRESS } from '@/config/hex';
import { normalizeAddress } from '@/utils/address';

// Chain → CoinGecko id of its native gas coin
export const NATIVE_COIN: Record<string, string> = {
  bitcoin: 'bitcoin',
  ethereum: 'ethereum',
  base: 'ethereum',
  robinhood: 'ethereum',
  pulsechain: 'pulsechain',
  solana: 'solana',
  litecoin: 'litecoin',
  dogecoin: 'dogecoin',
  bitcoincash: 'bitcoin-cash',
};

interface PriceResponse {
  natives: Record<string, number | null>;
  tokens: Record<string, Record<string, number | null>>;
  changes24h?: { natives: Record<string, number>; tokens: Record<string, Record<string, number>> };
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
      (tokens[asset.chain] ??= new Set()).add(normalizeAddress(asset.chain, asset.contractAddress));
    }
    if (asset.pool) {
      (tokens[asset.chain] ??= new Set()).add(HEX_ADDRESS.toLowerCase());
    }
    if (asset.type === 'collection' && asset.floorCurrency === 'ETH') natives.add('ethereum');
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
      priceUSD = prices.tokens[asset.chain]?.[normalizeAddress(asset.chain, asset.contractAddress)];
    }

    const priced: Asset = { ...asset };
    const change = asset.type === 'native'
      ? prices.changes24h?.natives[NATIVE_COIN[asset.chain]]
      : asset.contractAddress ? prices.changes24h?.tokens[asset.chain]?.[normalizeAddress(asset.chain, asset.contractAddress)] : undefined;
    if (change !== undefined) priced.change24hPct = change;
    if (priceUSD != null) {
      priced.priceUSD = priceUSD;
      // A stake is worth its principal plus the interest it has earned so far
      const amount = Number(asset.balanceFormatted) + (asset.stake?.interestHex ?? 0);
      priced.valueUSD = amount * priceUSD;
    }

    // Collections priced in ETH (OpenSea floors via Alchemy): count × floor × ETH
    const ethPrice = prices.natives.ethereum;
    if (asset.type === 'collection' && asset.floorCurrency === 'ETH' && asset.floorPrice && ethPrice != null) {
      priced.valueUSD = Number(asset.balanceFormatted) * asset.floorPrice * ethPrice;
    }

    const hexPrice = prices.tokens[asset.chain]?.[HEX_ADDRESS.toLowerCase()];
    if (asset.pool && hexPrice != null) {
      priced.pool = { ...asset.pool, backingValueUSD: asset.pool.backingHex * hexPrice };
    }
    return priced;
  });
}

const HDRN_ADDRESS = '0x3819f64f282bf135d62168c1e513280daf905e06';

/** HEX and HDRN price per HEX chain (eHEX and pHEX trade separately). */
export async function fetchHexPrices(chains: string[]): Promise<Record<string, { hex: number | null; hdrn: number | null }>> {
  try {
    const response = await fetch('/api/prices', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tokens: Object.fromEntries(chains.map((c) => [c, [HEX_ADDRESS, HDRN_ADDRESS]])) }),
    });
    const prices: PriceResponse = await response.json();
    return Object.fromEntries(chains.map((c) => [c, {
      hex: prices.tokens[c]?.[HEX_ADDRESS.toLowerCase()] ?? null,
      hdrn: prices.tokens[c]?.[HDRN_ADDRESS] ?? null,
    }]));
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
