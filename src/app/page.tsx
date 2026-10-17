'use client';

import { useMemo, useState } from 'react';
import { useWallets } from '@/hooks/useWallets';
import { usePortfolio } from '@/hooks/usePortfolio';
import { useHexStats } from '@/hooks/useHexStats';
import { useStakeHistory } from '@/hooks/useStakeHistory';
import { tokenKey, useHiddenTokens } from '@/hooks/useHiddenTokens';
import { Asset } from '@/types';
import { assetsToCsv } from '@/utils/csv';
import { downloadFile } from '@/utils/ics';
import { CHAIN_DISPLAY } from '@/config/chainDisplay';
import { AddWalletForm } from '@/components/wallet/AddWalletForm';
import { WalletList } from '@/components/wallet/WalletList';
import { ChainSection } from '@/components/portfolio/ChainSection';
import { HexSummary } from '@/components/portfolio/HexSummary';
import { Holdings } from '@/components/portfolio/Holdings';
import { Overview } from '@/components/overview/Overview';
import { StakeEstimator } from '@/components/hex/StakeEstimator';
import { PoolComparison } from '@/components/hex/PoolComparison';
import { HEX_ADDRESS } from '@/config/hex';
import { CollectiblesGallery } from '@/components/portfolio/CollectiblesGallery';
import { formatUSD } from '@/utils/prices';

const TEST_WALLETS = [
  { address: process.env.NEXT_PUBLIC_TEST_ETH_WALLET, name: 'Test EVM Wallet' },
  { address: process.env.NEXT_PUBLIC_TEST_BTC_WALLET, name: 'Test Bitcoin Wallet' },
].filter((w): w is { address: string; name: string } => !!w.address);

export default function DashboardPage() {
  const { wallets, addWallet, removeWallet, renameWallet } = useWallets();
  const portfolio = usePortfolio(wallets);
  const { isLoading, lastUpdated, refresh, retry } = portfolio;

  // Hidden (spam) tokens are removed here, so every total and section skips them
  const { hidden, hide, unhide } = useHiddenTokens();
  const { results, assets, hiddenAssets } = useMemo(() => {
    const hiddenSet = new Set(hidden);
    const isHidden = (a: Asset) => a.type === 'token' && hiddenSet.has(tokenKey(a));
    const visibleResults = portfolio.results.map((r) => ({ ...r, assets: r.assets.filter((a) => !isHidden(a)) }));
    return {
      results: visibleResults,
      assets: visibleResults.flatMap((r) => r.assets),
      hiddenAssets: portfolio.assets.filter(isHidden),
    };
  }, [portfolio.results, portfolio.assets, hidden]);

  // Always loaded: the stake estimator works even before any wallet is added
  const hexStats = useHexStats(true);
  const [walletsOpen, setWalletsOpen] = useState(false);
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


  const sections = [
    { id: 'overview', label: 'Overview', show: wallets.length > 0 },
    { id: 'holdings', label: 'Holdings', show: wallets.length > 0 },
    { id: 'hex', label: 'HEX', show: wallets.length > 0 },
    { id: 'tools', label: 'Tools', show: hexStats.length > 0 },
    { id: 'chains', label: 'Chains', show: wallets.length > 0 },
    { id: 'collectibles', label: 'Collectibles', show: assets.some((a) => a.type === 'nft' || a.type === 'ordinal') },
    { id: 'wallets', label: 'Wallets', show: true },
  ].filter((x) => x.show);

  return (
    <main className="mx-auto max-w-7xl space-y-8">
      {/* Header */}
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="bg-gradient-to-r from-pink-600 via-purple-600 to-indigo-600 bg-clip-text text-4xl font-bold text-transparent sm:text-5xl">
            Portfolio
          </h1>
          <p className="mt-2 text-gray-600">Bitcoin, Ethereum, Pulsechain, Base, Robinhood Chain & Solana. Your data stays in your browser.</p>
        </div>
        {wallets.length > 0 && (
          <div className="flex items-center gap-3 text-sm text-gray-500 sm:justify-end">
            <span>{isLoading ? 'Updating…' : lastUpdated ? `Updated ${lastUpdated.toLocaleTimeString()}` : ''}</span>
            <button
              onClick={() => downloadFile(
                `portfolio-${new Date().toISOString().slice(0, 10)}.csv`,
                assetsToCsv(assets, (address) => walletNames.get(address.toLowerCase()) ?? ''),
                'text/csv;charset=utf-8'
              )}
              disabled={assets.length === 0}
              className="rounded-lg bg-white px-3 py-1 font-medium text-gray-700 shadow-sm ring-1 ring-gray-200 hover:bg-gray-50 disabled:opacity-50"
            >
              ⬇ CSV
            </button>
            <button
              onClick={refresh}
              disabled={isLoading}
              className="rounded-lg bg-white px-3 py-1 font-medium text-gray-700 shadow-sm ring-1 ring-gray-200 hover:bg-gray-50 disabled:opacity-50"
            >
              ⟳ Refresh
            </button>
          </div>
        )}
      </header>

      {/* Section menu */}
      {wallets.length > 0 && (
        <nav aria-label="Sections" className="sticky top-0 z-30 -mx-4 overflow-x-auto border-b border-white/40 bg-white/75 px-4 py-2 backdrop-blur-md">
          <ul className="flex gap-1 text-sm">
            {sections.map((x) => (
              <li key={x.id}>
                <a href={`#${x.id}`} className="block whitespace-nowrap rounded-lg px-3 py-1.5 font-medium text-gray-600 hover:bg-purple-50 hover:text-purple-800">
                  {x.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      )}

      {wallets.length > 0 && (
        <div id="overview" className="scroll-mt-16">
          <Overview assets={assets} isLoading={isLoading} />
        </div>
      )}

      {/* Wallets: open until set up, then tucked away */}
      <section id="wallets" className="scroll-mt-16 rounded-2xl border border-white/20 bg-white/70 p-6 shadow-xl backdrop-blur-sm sm:p-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xl font-bold text-gray-800">
            Wallets{wallets.length > 0 && <span className="ml-2 text-base font-normal text-gray-500">{wallets.length}</span>}
          </h2>
          {wallets.length > 0 && (
            <button
              onClick={() => setWalletsOpen(!walletsOpen)}
              aria-expanded={walletsOpen}
              className="rounded-lg bg-white px-3 py-1.5 text-sm font-medium text-gray-700 shadow-sm ring-1 ring-gray-200 hover:bg-gray-50"
            >
              {walletsOpen ? 'Done' : 'Manage wallets'}
            </button>
          )}
        </div>
        {wallets.length > 0 && !walletsOpen && (
          <ul className="mt-3 flex flex-wrap gap-2 text-sm">
            {wallets.map((w) => (
              <li key={w.id} className="rounded-full bg-white/80 px-3 py-1 shadow-sm ring-1 ring-gray-200">
                <span className="font-medium text-gray-800">{w.name}</span>
                <span className="ml-2 tabular-nums text-gray-500">{walletLoading.has(w.id) ? '…' : formatUSD(walletTotals.get(w.id) ?? 0)}</span>
              </li>
            ))}
          </ul>
        )}
        {(walletsOpen || wallets.length === 0) && (
          <div className="mt-4">
            {wallets.length > 0 && (
              <div className="mb-6">
                <WalletList
                  wallets={wallets}
                  totals={walletTotals}
                  loading={walletLoading}
                  onRename={renameWallet}
                  onRemove={removeWallet}
                />
              </div>
            )}
            <AddWalletForm onAdd={addWallet} />
            {wallets.length === 0 && TEST_WALLETS.length > 0 && (
              <button
                onClick={() => TEST_WALLETS.forEach((w) => addWallet(w.address, w.name))}
                className="mt-4 text-sm font-medium text-purple-700 hover:text-purple-900"
              >
                Load test wallets from .env.local →
              </button>
            )}
          </div>
        )}
      </section>

      {wallets.length > 0 && (
        <div id="holdings" className="scroll-mt-16">
          <Holdings assets={assets} walletNames={walletNames} hiddenAssets={hiddenAssets} hiddenKeys={hidden} onHide={hide} onUnhide={unhide} />
        </div>
      )}

      {wallets.length > 0 && (
        <div id="hex" className="scroll-mt-16 empty:hidden">
          <HexSummary assets={assets} walletNames={walletNames} hexStats={hexStats} endedStakes={stakeHistory.stakes} historyUnavailable={stakeHistory.unavailable} />
        </div>
      )}

      {hexStats.length > 0 && (
        <div id="tools" className="scroll-mt-16 space-y-8">
          <StakeEstimator stats={hexStats} liquidHex={liquidHex} />
          <PoolComparison stats={hexStats} />
        </div>
      )}

      {wallets.length > 0 && (
        <>
          <div id="chains" className="grid scroll-mt-16 gap-6 lg:grid-cols-2 xl:grid-cols-3">
            {CHAIN_DISPLAY.map((chain) => (
              <ChainSection
                key={chain.key}
                chain={chain}
                results={results.filter((r) => r.chain === chain.key)}
                walletNames={walletNames}
                showWalletNames={wallets.length > 1}
                onRetry={retry}
              />
            ))}
          </div>

          <div id="collectibles" className="scroll-mt-16">
            <CollectiblesGallery assets={assets} />
          </div>
        </>
      )}
    </main>
  );
}
