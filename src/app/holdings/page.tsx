'use client';

import { usePortfolioContext } from '@/components/app/PortfolioProvider';
import { ChainCards, ConnectedHoldings } from '@/components/app/Connected';
import { NoWallets, PageHeader } from '@/components/app/AppShell';

export default function HoldingsPage() {
  const { wallets } = usePortfolioContext();
  return (
    <>
      <PageHeader title="Holdings" subtitle="Every asset across all wallets, then chain by chain" />
      {wallets.length === 0 ? <NoWallets what="your holdings" /> : (
        <div className="space-y-8">
          <ConnectedHoldings />
          <ChainCards />
        </div>
      )}
    </>
  );
}
