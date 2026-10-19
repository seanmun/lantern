'use client';

import Link from 'next/link';
import { usePortfolioContext } from '@/components/app/PortfolioProvider';
import { Dashboard } from '@/components/dashboard/Dashboard';
import { LanternMark } from '@/components/app/AppShell';
import { AddWalletForm } from '@/components/wallet/AddWalletForm';
import { SyncJoinForm } from '@/components/wallet/SyncPanel';

const TEST_WALLETS = [
  { address: process.env.NEXT_PUBLIC_TEST_ETH_WALLET, name: 'Test EVM Wallet' },
  { address: process.env.NEXT_PUBLIC_TEST_BTC_WALLET, name: 'Test Bitcoin Wallet' },
].filter((w): w is { address: string; name: string } => !!w.address);

export default function DashboardPage() {
  const { wallets, assets, isLoading, featuredArt, addWallet, autoHidden } = usePortfolioContext();

  if (wallets.length === 0) {
    return (
      <section className="mx-auto max-w-4xl">
        <div className="text-center">
          <div className="mb-4 flex justify-center"><LanternMark size={64} /></div>
          <h1 className="text-4xl font-extrabold tracking-tight text-ink">Your portfolio, in one place</h1>
          <p className="mx-auto mt-3 max-w-2xl text-lg text-muted">
            Bitcoin, Ethereum, PulseChain, Base, Robinhood Chain and Solana, with HEX staking built in.
          </p>
        </div>
        <div className="mt-8 grid items-stretch gap-4 lg:grid-cols-[1fr_auto_1fr]">
          <div className="rounded-3xl border border-line bg-surface p-6 sm:p-7">
            <h2 className="text-xl font-extrabold tracking-tight text-ink">Add an address</h2>
            <p className="mt-1 mb-5 text-sm text-muted">Paste any public wallet address. No sign-in, no wallet connection.</p>
            <AddWalletForm onAdd={addWallet} stacked />
            {TEST_WALLETS.length > 0 && (
              <button onClick={() => TEST_WALLETS.forEach((w) => addWallet(w.address, w.name))} className="mt-4 text-sm font-semibold text-accent hover:underline">
                Load test wallets from .env.local →
              </button>
            )}
          </div>
          <div className="flex items-center gap-3 lg:flex-col" aria-hidden="true">
            <span className="h-px flex-1 bg-line lg:h-auto lg:w-px" />
            <span className="text-sm font-bold uppercase tracking-wider text-muted">or</span>
            <span className="h-px flex-1 bg-line lg:h-auto lg:w-px" />
          </div>
          <div className="rounded-3xl border border-line bg-surface p-6 sm:p-7">
            <h2 className="text-xl font-extrabold tracking-tight text-ink">Use a sync code</h2>
            <p className="mt-1 mb-5 text-sm text-muted">
              Already set up on another device? Enter the code from its Wallets page and your portfolio comes over, encrypted end to end.
            </p>
            <SyncJoinForm autoFocus={false} showError stacked />
          </div>
        </div>
        <p className="mt-6 text-center text-sm text-muted">
          Just exploring? Try the <Link href="/tools" className="font-semibold text-accent hover:underline">HEX stake estimator</Link>.
        </p>
      </section>
    );
  }

  return (
    <Dashboard assets={assets} isLoading={isLoading} isFeatured={featuredArt.isFeatured} autoHiddenCount={autoHidden.length} />
  );
}
