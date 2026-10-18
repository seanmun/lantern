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
        <Link href="/tools" className="inline-flex h-10 items-center gap-1.5 rounded-full bg-soft px-4 text-sm font-semibold text-ink hover:bg-line">
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
