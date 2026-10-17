'use client';

import { createContext, ReactNode, useContext, useMemo } from 'react';
import { useWallets } from '@/hooks/useWallets';
import { usePortfolio } from '@/hooks/usePortfolio';
import { useHexStats } from '@/hooks/useHexStats';
import { useStakeHistory } from '@/hooks/useStakeHistory';
import { tokenKey, useHiddenTokens, useTrustedTokens } from '@/hooks/useHiddenTokens';
import { useTokenRisk } from '@/hooks/useTokenRisk';
import { useFeaturedArt } from '@/hooks/useFeaturedArt';
import { HEX_ADDRESS } from '@/config/hex';
import { Asset } from '@/types';

/**
 * Portfolio state shared by every page. It lives in the root layout, so
 * moving between pages never refetches: wallets, balances, prices, HEX data,
 * risk checks and the viewer's hide / trust / frame choices load once.
 */
function usePortfolioState() {
  const walletsApi = useWallets();
  const { wallets } = walletsApi;
  const portfolio = usePortfolio(wallets);

  // Hidden tokens (by the viewer, or auto-hidden by the risk check) are
  // removed here, so every total and section skips them
  const hiddenApi = useHiddenTokens();
  const trustedApi = useTrustedTokens();
  const { hidden } = hiddenApi;
  const { trusted } = trustedApi;
  const risk = useTokenRisk(portfolio.assets);
  const autoHidden = useMemo(
    () => [...risk].filter(([key, r]) => r.verdict === 'scam' && !trusted.includes(key) && !hidden.includes(key)).map(([key]) => key),
    [risk, trusted, hidden]
  );
  const { results, assets, hiddenAssets, hiddenKeySet } = useMemo(() => {
    const hiddenSet = new Set([...hidden, ...autoHidden]);
    const isHidden = (a: Asset) => a.type === 'token' && hiddenSet.has(tokenKey(a));
    const visibleResults = portfolio.results.map((r) => ({ ...r, assets: r.assets.filter((a) => !isHidden(a)) }));
    return {
      results: visibleResults,
      assets: visibleResults.flatMap((r) => r.assets),
      hiddenAssets: portfolio.assets.filter(isHidden),
      hiddenKeySet: hiddenSet,
    };
  }, [portfolio.results, portfolio.assets, hidden, autoHidden]);

  const featuredArt = useFeaturedArt(assets);
  // Always loaded: the stake estimator works even before any wallet is added
  const hexStats = useHexStats(true);
  const stakeHistory = useStakeHistory(wallets);

  const { walletNames, walletTotals, walletLoading } = useMemo(() => {
    const names = new Map<string, string>();
    for (const w of wallets) {
      names.set(w.id, w.name);
      names.set(w.address.toLowerCase(), w.name);
    }
    const totals = new Map<string, number>();
    const loading = new Set<string>();
    for (const r of results) {
      totals.set(r.walletId, (totals.get(r.walletId) ?? 0) + r.assets.reduce((s, a) => s + (a.valueUSD ?? 0), 0));
      if (r.status === 'loading') loading.add(r.walletId);
    }
    return { walletNames: names, walletTotals: totals, walletLoading: loading };
  }, [wallets, results]);

  const liquidHex = useMemo(() => {
    const totals: Record<string, number> = {};
    for (const a of assets) {
      if (a.type === 'token' && a.contractAddress?.toLowerCase() === HEX_ADDRESS.toLowerCase()) {
        totals[a.chain] = (totals[a.chain] ?? 0) + Number(a.balanceFormatted);
      }
    }
    return totals;
  }, [assets]);

  return {
    ...walletsApi,
    isLoading: portfolio.isLoading,
    lastUpdated: portfolio.lastUpdated,
    refresh: portfolio.refresh,
    retry: portfolio.retry,
    results,
    assets,
    hiddenAssets,
    hiddenKeySet,
    ...hiddenApi,
    ...trustedApi,
    risk,
    autoHidden,
    featuredArt,
    hexStats,
    stakeHistory,
    walletNames,
    walletTotals,
    walletLoading,
    liquidHex,
  };
}

export type PortfolioState = ReturnType<typeof usePortfolioState>;
const PortfolioContext = createContext<PortfolioState | null>(null);

export function PortfolioProvider({ children }: { children: ReactNode }) {
  const state = usePortfolioState();
  return <PortfolioContext.Provider value={state}>{children}</PortfolioContext.Provider>;
}

export function usePortfolioContext(): PortfolioState {
  const ctx = useContext(PortfolioContext);
  if (!ctx) throw new Error('usePortfolioContext must be used inside PortfolioProvider');
  return ctx;
}
