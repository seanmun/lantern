'use client';

import Link from 'next/link';
import { usePortfolioContext } from '@/components/app/PortfolioProvider';
import { ConnectedHoldings } from '@/components/app/Connected';
import { Overview } from '@/components/overview/Overview';
import { AddWalletForm } from '@/components/wallet/AddWalletForm';
import { Hexagon } from '@/components/hex/Hexagon';

const TEST_WALLETS = [
  { address: process.env.NEXT_PUBLIC_TEST_ETH_WALLET, name: 'Test EVM Wallet' },
  { address: process.env.NEXT_PUBLIC_TEST_BTC_WALLET, name: 'Test Bitcoin Wallet' },
].filter((w): w is { address: string; name: string } => !!w.address);

export default function DashboardPage() {
  const { wallets, assets, isLoading, featuredArt, addWallet } = usePortfolioContext();

  if (wallets.length === 0) {
    return (
      <section className="mx-auto max-w-2xl rounded-2xl border border-white/20 bg-white/70 p-6 text-center shadow-xl backdrop-blur-sm sm:p-10">
        <div className="mb-4 flex justify-center"><Hexagon size={56} /></div>
        <h1 className="text-3xl font-bold text-gray-900">Your portfolio, in one place</h1>
        <p className="mt-2 text-gray-600">
          Bitcoin, Ethereum, Pulsechain, Base, Robinhood Chain and Solana, with HEX staking built in.
          Paste a public address to start. It&apos;s saved only in this browser.
        </p>
        <div className="mt-6 text-left"><AddWalletForm onAdd={addWallet} /></div>
        {TEST_WALLETS.length > 0 && (
          <button onClick={() => TEST_WALLETS.forEach((w) => addWallet(w.address, w.name))} className="mt-4 text-sm font-medium text-purple-700 hover:text-purple-900">
            Load test wallets from .env.local →
          </button>
        )}
        <p className="mt-6 text-sm text-gray-500">
          Just exploring? Try the <Link href="/tools" className="font-medium text-purple-700 hover:text-purple-900">HEX stake estimator</Link>.
        </p>
      </section>
    );
  }

  return (
    <div className="space-y-8">
      <Overview assets={assets} isLoading={isLoading} isFeatured={featuredArt.isFeatured} />
      <ConnectedHoldings compact />
    </div>
  );
}
