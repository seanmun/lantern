'use client';

import Link from 'next/link';
import { usePortfolioContext } from '@/components/app/PortfolioProvider';
import { Dashboard } from '@/components/dashboard/Dashboard';
import { LanternMark } from '@/components/app/AppShell';
import { AddWalletForm } from '@/components/wallet/AddWalletForm';
import { SyncJoinForm } from '@/components/wallet/SyncPanel';
import { useState } from 'react';

const TEST_WALLETS = [
  { address: process.env.NEXT_PUBLIC_TEST_ETH_WALLET, name: 'Test EVM Wallet' },
  { address: process.env.NEXT_PUBLIC_TEST_BTC_WALLET, name: 'Test Bitcoin Wallet' },
].filter((w): w is { address: string; name: string } => !!w.address);

export default function DashboardPage() {
  const { wallets, assets, isLoading, featuredArt, addWallet, autoHidden } = usePortfolioContext();
  const [joining, setJoining] = useState(false);

  if (wallets.length === 0) {
    return (
      <section className="mx-auto max-w-2xl rounded-3xl border border-line p-6 text-center sm:p-10">
        <div className="mb-4 flex justify-center"><LanternMark size={64} /></div>
        <h1 className="text-4xl font-extrabold tracking-tight text-ink">Your portfolio, in one place</h1>
        <p className="mt-3 text-lg text-muted">
          Bitcoin, Ethereum, Pulsechain, Base, Robinhood Chain and Solana, with HEX staking built in.
          Paste a public address to start. It&apos;s saved only in this browser.
        </p>
        <div className="mt-6 text-left"><AddWalletForm onAdd={addWallet} /></div>
        <div className="mt-6 border-t border-line pt-5 text-left">
          {joining ? (
            <>
              <h2 className="font-bold text-ink">Enter your sync code</h2>
              <p className="mt-1 text-sm text-muted">From the Wallets page on the device where your portfolio is set up.</p>
              <SyncJoinForm onCancel={() => setJoining(false)} showError />
            </>
          ) : (
            <button onClick={() => setJoining(true)} className="w-full rounded-xl bg-soft px-4 py-3 text-sm font-bold text-ink ring-1 ring-line hover:bg-line">
              Already use Lantern on another device? Enter your sync code
            </button>
          )}
        </div>
        {TEST_WALLETS.length > 0 && (
          <button onClick={() => TEST_WALLETS.forEach((w) => addWallet(w.address, w.name))} className="mt-4 text-sm font-semibold text-accent hover:underline">
            Load test wallets from .env.local →
          </button>
        )}
        <p className="mt-6 text-sm text-muted">
          Just exploring? Try the <Link href="/tools" className="font-semibold text-accent hover:underline">HEX stake estimator</Link>.
        </p>
      </section>
    );
  }

  return (
    <Dashboard assets={assets} isLoading={isLoading} isFeatured={featuredArt.isFeatured} autoHiddenCount={autoHidden.length} />
  );
}
