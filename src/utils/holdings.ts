import { Asset } from '@/types';
import { NATIVE_COIN } from '@/utils/prices';
import { normalizeAddress } from '@/utils/address';

export interface Holding {
  key: string;
  name: string;
  symbol: string;
  kind: 'native' | 'token' | 'stake';
  chains: string[];
  balance: number;
  valueUSD?: number;
  priceUSD?: number;
  imageUrl?: string;
  parts: Asset[]; // the per-wallet, per-chain assets that make up this row
}

const NATIVE_NAMES: Record<string, string> = { bitcoin: 'Bitcoin', ethereum: 'Ether', pulsechain: 'Pulse', solana: 'Solana' };

/**
 * Which assets are "the same holding":
 * - native coins by the coin they are (ETH on Ethereum, Base and Robinhood Chain is one ETH)
 * - tokens by chain + contract, never by ticker: eHEX and pHEX share a contract
 *   address but trade separately, and same-ticker tokens can be bridged copies or spam
 * - HEX stakes per chain, valued at principal + interest earned
 */
function holdingKey(a: Asset): { key: string; kind: Holding['kind'] } | null {
  if (a.type === 'native') return { key: `native:${NATIVE_COIN[a.chain] ?? a.chain}`, kind: 'native' };
  if (a.type === 'stake') return { key: `stake:${a.chain}`, kind: 'stake' };
  if (a.type === 'token') {
    const id = a.contractAddress ? normalizeAddress(a.chain, a.contractAddress) : `${a.tokenStandard}:${a.symbol}`;
    return { key: `token:${a.chain}:${id}`, kind: 'token' };
  }
  return null; // NFTs and Ordinals are shown in the gallery, not summed
}

const amountOf = (a: Asset) => Number(a.balanceFormatted) + (a.stake?.interestHex ?? 0);

export function groupHoldings(assets: Asset[]): Holding[] {
  const groups = new Map<string, Holding>();

  for (const a of assets) {
    const id = holdingKey(a);
    const amount = amountOf(a);
    if (!id || !(amount > 0)) continue;

    let h = groups.get(id.key);
    if (!h) {
      h = {
        key: id.key,
        kind: id.kind,
        name: id.kind === 'native' ? NATIVE_NAMES[NATIVE_COIN[a.chain]] ?? a.name : id.kind === 'stake' ? 'HEX (staked)' : a.name,
        symbol: a.symbol,
        chains: [],
        balance: 0,
        imageUrl: a.imageUrl,
        parts: [],
      };
      groups.set(id.key, h);
    }
    h.balance += amount;
    if (a.valueUSD !== undefined) h.valueUSD = (h.valueUSD ?? 0) + a.valueUSD;
    if (!h.chains.includes(a.chain)) h.chains.push(a.chain);
    h.parts.push(a);
  }

  for (const h of groups.values()) {
    if (h.valueUSD !== undefined && h.balance > 0) h.priceUSD = h.valueUSD / h.balance;
    h.parts.sort((x, y) => (y.valueUSD ?? 0) - (x.valueUSD ?? 0));
  }
  return [...groups.values()].sort((x, y) => (y.valueUSD ?? -1) - (x.valueUSD ?? -1));
}
