'use client';

import { usePortfolioContext } from '@/components/app/PortfolioProvider';
import { PageHeader } from '@/components/app/AppShell';
import { StakeEstimator } from '@/components/hex/StakeEstimator';
import { PoolComparison } from '@/components/hex/PoolComparison';

export default function ToolsPage() {
  const { hexStats, liquidHex } = usePortfolioContext();
  return (
    <>
      <PageHeader title="Tools" subtitle="Plan a HEX stake and compare it with buying Maximus pool tokens" />
      {hexStats.length === 0 ? (
        <p className="text-gray-500">Loading HEX network data…</p>
      ) : (
        <div className="space-y-8">
          <StakeEstimator stats={hexStats} liquidHex={liquidHex} />
          <PoolComparison stats={hexStats} />
        </div>
      )}
    </>
  );
}
