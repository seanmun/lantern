'use client';

import { useMemo } from 'react';
import { useWallets } from '@/hooks/useWallets';
import { usePortfolio } from '@/hooks/usePortfolio';
import { useHexStats } from '@/hooks/useHexStats';
import { CHAIN_DISPLAY } from '@/config/chainDisplay';
import { AddWalletForm } from '@/components/wallet/AddWalletForm';
import { WalletList } from '@/components/wallet/WalletList';
import { ChainSection } from '@/components/portfolio/ChainSection';
import { HexSummary } from '@/components/portfolio/HexSummary';
import { NFTGrid } from '@/components/ui/NFTDisplay';
import { formatUSD } from '@/utils/prices';

const TEST_WALLETS = [
  { address: process.env.NEXT_PUBLIC_TEST_ETH_WALLET, name: 'Test EVM Wallet' },
  { address: process.env.NEXT_PUBLIC_TEST_BTC_WALLET, name: 'Test Bitcoin Wallet' },
].filter((w): w is { address: string; name: string } => !!w.address);

export default function DashboardPage() {
  const { wallets, addWallet, removeWallet, renameWallet } = useWallets();
  const { results, assets, isLoading, lastUpdated, refresh, retry } = usePortfolio(wallets);

  const hexStats = useHexStats(wallets.some((w) => w.chains.includes('ethereum') || w.chains.includes('pulsechain')));

  const totalUSD = assets.reduce((sum, a) => sum + (a.valueUSD ?? 0), 0);

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

  const hasCollectibles = assets.some((a) => a.type === 'nft' || a.type === 'ordinal');

  return (
    <main className="mx-auto max-w-7xl space-y-8">
      {/* Header */}
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="bg-gradient-to-r from-pink-600 via-purple-600 to-indigo-600 bg-clip-text text-4xl font-bold text-transparent sm:text-5xl">
            Portfolio
          </h1>
          <p className="mt-2 text-gray-600">Bitcoin, Ethereum, Pulsechain, Base & Robinhood Chain. Your data stays in your browser.</p>
        </div>
        {wallets.length > 0 && (
          <div className="sm:text-right">
            <div className="text-4xl font-bold tabular-nums text-gray-900">{formatUSD(totalUSD)}</div>
            <div className="mt-1 flex items-center gap-3 text-sm text-gray-500 sm:justify-end">
              <span>
                {isLoading ? 'Updating…' : lastUpdated ? `Updated ${lastUpdated.toLocaleTimeString()}` : ''}
              </span>
              <button
                onClick={refresh}
                disabled={isLoading}
                className="rounded-lg bg-white px-3 py-1 font-medium text-gray-700 shadow-sm ring-1 ring-gray-200 hover:bg-gray-50 disabled:opacity-50"
              >
                ⟳ Refresh
              </button>
            </div>
          </div>
        )}
      </header>

      {/* Wallets */}
      <section className="rounded-2xl border border-white/20 bg-white/70 p-6 shadow-xl backdrop-blur-sm sm:p-8">
        <h2 className="mb-4 text-xl font-bold text-gray-800">Wallets</h2>
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
      </section>

      {wallets.length > 0 && (
        <>
          <HexSummary assets={assets} walletNames={walletNames} hexStats={hexStats} />

          <div className="grid gap-6 lg:grid-cols-2 xl:grid-cols-3">
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

          {hasCollectibles && (
            <section className="space-y-6">
              <h2 className="text-center text-3xl font-bold">
                <span className="bg-gradient-to-r from-purple-600 via-pink-600 to-indigo-600 bg-clip-text text-transparent">
                  Collectibles
                </span>
              </h2>
              {CHAIN_DISPLAY.map((chain) => {
                const chainAssets = assets.filter((a) => a.chain === chain.key);
                if (!chainAssets.some((a) => a.type === 'nft' || a.type === 'ordinal')) return null;
                return (
                  <div key={chain.key} className="rounded-2xl border border-white/20 bg-white/70 p-6 shadow-xl backdrop-blur-sm sm:p-8">
                    <NFTGrid assets={chainAssets} title={chain.key === 'bitcoin' ? 'Bitcoin Ordinals' : `${chain.label} NFTs`} />
                  </div>
                );
              })}
            </section>
          )}
        </>
      )}
    </main>
  );
}
