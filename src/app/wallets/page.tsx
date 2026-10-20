'use client';

import { useMemo } from 'react';
import { usePortfolioContext } from '@/components/app/PortfolioProvider';
import { PageHeader } from '@/components/app/AppShell';
import { AddWalletForm } from '@/components/wallet/AddWalletForm';
import { WalletList } from '@/components/wallet/WalletList';
import { SyncPanel } from '@/components/wallet/SyncPanel';
import { useSync } from '@/hooks/useSync';

const TEST_WALLETS = [
  { address: process.env.NEXT_PUBLIC_TEST_ETH_WALLET, name: 'Test EVM Wallet' },
  { address: process.env.NEXT_PUBLIC_TEST_BTC_WALLET, name: 'Test Bitcoin Wallet' },
].filter((w): w is { address: string; name: string } => !!w.address);

export default function WalletsPage() {
  const { wallets, walletTotals, walletLoading, assets, addWallet, renameWallet, removeWallet } = usePortfolioContext();
  const nftCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const w of wallets) counts.set(w.id, assets.filter((a) => a.walletAddress === w.address && (a.type === 'nft' || a.type === 'ordinal')).length);
    return counts;
  }, [wallets, assets]);
  const { code } = useSync();
  return (
    <>
      <PageHeader
        title="Wallets"
        subtitle={code ? 'Public addresses only. Saved in this browser, with an encrypted copy only your sync code can open.' : 'Public addresses only. Saved in this browser, never on a server.'}
      />
      <section className="rounded-3xl border border-line bg-surface p-6 sm:p-8">
        {wallets.length > 0 && (
          <div className="mb-6">
            <WalletList wallets={wallets} totals={walletTotals} loading={walletLoading} nftCounts={nftCounts} onRename={renameWallet} onRemove={removeWallet} />
          </div>
        )}
        <AddWalletForm onAdd={addWallet} />
        {wallets.length === 0 && TEST_WALLETS.length > 0 && (
          <button onClick={() => TEST_WALLETS.forEach((w) => addWallet(w.address, w.name))} className="mt-4 text-sm font-medium text-accent hover:text-ink">
            Load test wallets from .env.local →
          </button>
        )}
      </section>
      <SyncPanel />
    </>
  );
}
