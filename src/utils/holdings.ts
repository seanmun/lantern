import { Asset } from '@/types';
import { HEX_ADDRESS } from '@/config/hex';
import { NATIVE_COIN } from '@/utils/prices';
import { normalizeAddress } from '@/utils/address';
import { logoUrl } from '@/utils/logos';

// Position labels like "Icosa (staked)" describe a part, not the token itself
const baseName = (a: Asset) => (a.tokenStandard === 'Staked' || a.tokenStandard === 'Rewards' ? a.name.replace(/\s*\([^)]*\)$/, '') : a.name);

export interface Holding {
  key: string;
  name: string;
  symbol: string;
  kind: 'native' | 'token' | 'hex' | 'collectibles';
  chains: string[];
  balance: number;     // in the holding's unit (ETH, HEX, ...)
  valueUSD?: number;
  priceUSD?: number;   // value / balance; a blend when parts trade at different prices
  blendedPrice: boolean;
  imageUrl?: string;
  parts: HoldingPart[];
}

export interface HoldingPart {
  asset: Asset;
  label: string;  // what this part is, e.g. "liquid", "stake #123", "MAXI pool"
  amount: number; // contribution in the holding's unit
}

const NATIVE_NAMES: Record<string, string> = { bitcoin: 'Bitcoin', ethereum: 'Ether', pulsechain: 'Pulse', solana: 'Solana' };

// Wrapped ETH by contract (never by ticker, so look-alikes don't fold in)
const WETH = new Set([
  'ethereum:0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2',
  'base:0x4200000000000000000000000000000000000006',
  'robinhood:0x0bd7d308f8e1639fab988df18a8011f41eacad73',
]);
const HEX_CONTRACT = HEX_ADDRESS.toLowerCase();

/**
 * Which assets roll up into one holding:
 * - ETH: native ETH on every chain + WETH
 * - HEX: liquid HEX, stakes (principal + interest) and Maximus pool tokens
 *   (counted at their HEX backing), on Ethereum and Pulsechain together
 * - other native coins by coin; other tokens by chain + contract, never by ticker
 */
function classify(a: Asset): { key: string; kind: Holding['kind']; label: string; amount: number } | null {
  const contract = a.contractAddress ? `${a.chain}:${normalizeAddress(a.chain, a.contractAddress)}` : null;
  const balance = Number(a.balanceFormatted);

  if (a.type === 'collection') {
    return { key: 'collectibles', kind: 'collectibles', label: `${a.name} (${a.balanceFormatted})`, amount: Number(a.balanceFormatted) };
  }
  if (a.type === 'stake' && a.stake) {
    const label = a.stake.hsi ? `HSI ${a.stake.hsi.tokenId ? `#${a.stake.hsi.tokenId}` : ''} (stake #${a.stake.stakeId})`.replace('  ', ' ') : `stake #${a.stake.stakeId}`;
    return { key: 'hex', kind: 'hex', label, amount: balance + a.stake.interestHex };
  }
  if (a.type === 'token' && a.pool) {
    return { key: 'hex', kind: 'hex', label: `${a.symbol} pool (${balance.toLocaleString('en-US', { maximumFractionDigits: 0 })} ${a.symbol})`, amount: a.pool.backingHex };
  }
  if (a.type === 'token' && contract === `${a.chain}:${HEX_CONTRACT}`) {
    return { key: 'hex', kind: 'hex', label: 'liquid', amount: balance };
  }
  if (a.type === 'native') {
    const coin = NATIVE_COIN[a.chain] ?? a.chain;
    return { key: `native:${coin}`, kind: 'native', label: a.symbol, amount: balance };
  }
  if (a.type === 'token' && contract && WETH.has(contract)) {
    return { key: 'native:ethereum', kind: 'native', label: 'WETH', amount: balance };
  }
  if (a.type === 'token') {
    const id = contract ?? `${a.chain}:${a.tokenStandard}:${a.symbol}`;
    // Staked / reward / unstaking positions share the token's contract, so they roll into its row
    const label = a.tokenStandard && ['Staked', 'Rewards', 'Unstaking'].includes(a.tokenStandard) ? a.tokenStandard.toLowerCase() : a.symbol;
    return { key: `token:${id}`, kind: 'token', label, amount: balance };
  }
  return null; // NFTs and Ordinals are shown in the gallery, not summed
}

export function groupHoldings(assets: Asset[]): Holding[] {
  const groups = new Map<string, Holding>();

  for (const a of assets) {
    const c = classify(a);
    if (!c || !(c.amount > 0)) continue;

    let h = groups.get(c.key);
    if (!h) {
      const coin = NATIVE_COIN[a.chain];
      h = {
        key: c.key,
        kind: c.kind,
        name: c.kind === 'hex' ? 'HEX (liquid + staked + pools)' : c.kind === 'collectibles' ? 'NFTs & Ordinals (floor value)' : c.kind === 'native' ? NATIVE_NAMES[c.key === 'native:ethereum' ? 'ethereum' : coin] ?? a.name : baseName(a),
        symbol: c.kind === 'hex' ? 'HEX' : c.kind === 'collectibles' ? 'Collectibles' : c.key === 'native:ethereum' ? 'ETH' : a.symbol,
        chains: [],
        balance: 0,
        blendedPrice: false,
        imageUrl: c.kind === 'hex'
          ? `/api/logos/pulsechain/${HEX_ADDRESS}`
          : c.kind === 'native'
            ? `/api/logos/native/${c.key.slice('native:'.length)}`
            : c.kind === 'token' ? logoUrl(a) : undefined,
        parts: [],
      };
      groups.set(c.key, h);
    }
    h.balance += c.amount;
    if (a.valueUSD !== undefined) h.valueUSD = (h.valueUSD ?? 0) + a.valueUSD;
    if (!h.chains.includes(a.chain)) h.chains.push(a.chain);
    h.parts.push({ asset: a, label: c.label, amount: c.amount });
  }

  for (const h of groups.values()) {
    // A per-item price across different collections means nothing; parts show each floor
    if (h.valueUSD !== undefined && h.balance > 0 && h.kind !== 'collectibles') h.priceUSD = h.valueUSD / h.balance;
    // Flag a blend when parts imply prices more than 1% apart (eHEX vs pHEX, pools vs HEX)
    const unitPrices = h.parts
      .filter((p) => p.asset.valueUSD !== undefined && p.amount > 0)
      .map((p) => p.asset.valueUSD! / p.amount);
    h.blendedPrice = unitPrices.length > 1 && Math.max(...unitPrices) > Math.min(...unitPrices) * 1.01;
    h.parts.sort((x, y) => (y.asset.valueUSD ?? 0) - (x.asset.valueUSD ?? 0));
  }
  return [...groups.values()].sort((x, y) => (y.valueUSD ?? -1) - (x.valueUSD ?? -1));
}
