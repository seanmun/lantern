'use client';

import Link from 'next/link';
import { usePortfolioContext } from '@/components/app/PortfolioProvider';
import { NoWallets, PageHeader } from '@/components/app/AppShell';
import { HexSummary } from '@/components/portfolio/HexSummary';

export default function HexPage() {
  const { wallets, assets, walletNames, hexStats, stakeHistory } = usePortfolioContext();
  return (
    <>
      <PageHeader title="HEX" subtitle="Stakes, HSIs, Maximus pools and stake history">
        <Link href="/tools" className="rounded-lg bg-white px-3 py-1.5 text-sm font-medium text-gray-700 shadow-sm ring-1 ring-gray-200 hover:bg-gray-50">
          Stake estimator →
        </Link>
      </PageHeader>
      {wallets.length === 0 ? <NoWallets what="your HEX stakes" /> : (
        <div className="empty:hidden">
          <HexSummary assets={assets} walletNames={walletNames} hexStats={hexStats} endedStakes={stakeHistory.stakes} historyUnavailable={stakeHistory.unavailable} />
        </div>
      )}
    </>
  );
}
