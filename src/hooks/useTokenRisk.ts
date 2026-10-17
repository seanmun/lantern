'use client';

import { useEffect, useMemo, useState } from 'react';
import { Asset } from '@/types';
import { tokenKey } from './useHiddenTokens';

export type RiskVerdict = 'trusted' | 'ok' | 'suspicious' | 'scam' | 'unknown';
export interface RiskSignal { id: string; strength: 'strong' | 'weak' | 'info' | 'good'; label: string }
export interface TokenRiskReport { chain: string; address: string; verdict: RiskVerdict; signals: RiskSignal[] }

const CHECKED_CHAINS = new Set(['ethereum', 'pulsechain', 'base', 'robinhood']);
const BATCH = 40;

/**
 * Runs the server's token risk check on every EVM token in the portfolio
 * (Robinhood Stock Tokens come from the official registry and are skipped).
 * Returns reports keyed by tokenKey. Results only change when the token set does.
 */
export function useTokenRisk(assets: Asset[]) {
  const [reports, setReports] = useState<Map<string, TokenRiskReport>>(new Map());

  const candidates = useMemo(() => {
    const byKey = new Map<string, { chain: string; address: string; amounts: string[] }>();
    for (const a of assets) {
      if (a.type !== 'token' || !a.contractAddress || !CHECKED_CHAINS.has(a.chain)) continue;
      if (a.tokenStandard === 'Stock Token' || a.pool) continue;
      // Venice staking positions share VVV's contract; check the token once
      if (a.tokenStandard && ['Staked', 'Rewards', 'Unstaking'].includes(a.tokenStandard)) continue;
      const key = tokenKey(a);
      const entry = byKey.get(key) ?? { chain: a.chain, address: a.contractAddress, amounts: [] };
      entry.amounts.push(a.balance);
      byKey.set(key, entry);
    }
    return [...byKey].map(([key, t]) => {
      // Mass-airdrop tell: several wallets holding exactly the same raw amount
      const counts = new Map<string, number>();
      for (const amount of t.amounts) counts.set(amount, (counts.get(amount) ?? 0) + 1);
      return { key, chain: t.chain, address: t.address, sameAmountWallets: Math.max(0, ...counts.values()) };
    });
  }, [assets]);

  const requestKey = candidates.map((c) => `${c.key}:${c.sameAmountWallets}`).sort().join('|');

  useEffect(() => {
    if (!requestKey) return;
    let cancelled = false;
    (async () => {
      const next = new Map<string, TokenRiskReport>();
      for (let i = 0; i < candidates.length; i += BATCH) {
        const batch = candidates.slice(i, i + BATCH);
        try {
          const response = await fetch('/api/token-risk', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tokens: batch.map(({ chain, address, sameAmountWallets }) => ({ chain, address, sameAmountWallets })) }),
          });
          const { reports: got }: { reports: TokenRiskReport[] } = await response.json();
          for (const r of got ?? []) next.set(tokenKey({ chain: r.chain, contractAddress: r.address, symbol: '' }), r);
          if (!cancelled) setReports(new Map(next));
        } catch (error) {
          console.warn('⚠️ Token risk check failed:', error);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // candidates is derived from requestKey
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestKey]);

  return reports;
}
