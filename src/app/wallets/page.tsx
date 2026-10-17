'use client';

import { usePortfolioContext } from '@/components/app/PortfolioProvider';
import { PageHeader } from '@/components/app/AppShell';
import { AddWalletForm } from '@/components/wallet/AddWalletForm';
import { WalletList } from '@/components/wallet/WalletList';

const TEST_WALLETS = [
  { address: process.env.NEXT_PUBLIC_TEST_ETH_WALLET, name: 'Test EVM Wallet' },
  { address: process.env.NEXT_PUBLIC_TEST_BTC_WALLET, name: 'Test Bitcoin Wallet' },
].filter((w): w is { address: string; name: string } => !!w.address);

export default function WalletsPage() {
  const { wallets, walletTotals, walletLoading, addWallet, renameWallet, removeWallet } = usePortfolioContext();
  return (
    <>
      <PageHeader title="Wallets" subtitle="Public addresses only. Saved in this browser, never on a server." />
      <section className="rounded-2xl border border-white/20 bg-white/70 p-6 shadow-xl backdrop-blur-sm sm:p-8">
        {wallets.length > 0 && (
          <div className="mb-6">
            <WalletList wallets={wallets} totals={walletTotals} loading={walletLoading} onRename={renameWallet} onRemove={removeWallet} />
          </div>
        )}
        <AddWalletForm onAdd={addWallet} />
        {wallets.length === 0 && TEST_WALLETS.length > 0 && (
          <button onClick={() => TEST_WALLETS.forEach((w) => addWallet(w.address, w.name))} className="mt-4 text-sm font-medium text-purple-700 hover:text-purple-900">
            Load test wallets from .env.local →
          </button>
        )}
      </section>
    </>
  );
}
