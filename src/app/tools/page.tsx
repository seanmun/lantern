'use client';

import { useMemo } from 'react';
import { usePortfolioContext } from '@/components/app/PortfolioProvider';
import { PageHeader } from '@/components/app/AppShell';
import { StakeEstimator } from '@/components/hex/StakeEstimator';
import { PoolComparison } from '@/components/hex/PoolComparison';
import { ValidatorSimulator } from '@/components/staking/ValidatorSimulator';

export default function ToolsPage() {
  const { hexStats, liquidHex, assets } = usePortfolioContext();
  // Liquid ETH (mainnet) and PLS, for "use my" on the validator simulator
  const natives = useMemo(() => {
    const totals: Record<string, number> = {};
    for (const a of assets) if (a.type === 'native' && (a.chain === 'ethereum' || a.chain === 'pulsechain')) totals[a.chain] = (totals[a.chain] ?? 0) + Number(a.balanceFormatted);
    return totals;
  }, [assets]);
  return (
    <>
      <PageHeader title="Tools" subtitle="Plan a HEX stake, compare it with Maximus pool tokens, and see whether running a validator pays" />
      <div className="space-y-8">
        {hexStats.length === 0 ? (
          <p className="text-muted">Loading HEX network data…</p>
        ) : (
          <>
            <StakeEstimator stats={hexStats} liquidHex={liquidHex} />
            <PoolComparison stats={hexStats} />
          </>
        )}
        <ValidatorSimulator holdings={natives} />
      </div>
    </>
  );
}
