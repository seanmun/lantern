'use client';

import { Asset } from '@/types';
import { normalizeAddress } from '@/utils/address';
import { useStoredSet } from './useStoredSet';

/** Stable id for a token across wallets: chain + contract (or standard + symbol). */
export function tokenKey(a: Pick<Asset, 'chain' | 'contractAddress' | 'tokenStandard' | 'symbol'>): string {
  return a.contractAddress ? `${a.chain}:${normalizeAddress(a.chain, a.contractAddress)}` : `${a.chain}:${a.tokenStandard}:${a.symbol}`;
}

/**
 * Tokens the viewer has hidden (spam airdrops the filters missed). Stored in
 * this browser only; hidden tokens are left out of every total.
 */
export function useHiddenTokens() {
  const { values, add, remove } = useStoredSet('cpt.hiddenTokens.v1');
  return { hidden: values, hide: add, unhide: remove };
}

/** Tokens the viewer vouches for: never auto-hidden or badged by the risk check. */
export function useTrustedTokens() {
  const { values, add, remove } = useStoredSet('cpt.trustedTokens.v1');
  return { trusted: values, trust: add, untrust: remove };
}
