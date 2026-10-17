'use client';

import { Holdings } from '@/components/portfolio/Holdings';
import { ChainSection } from '@/components/portfolio/ChainSection';
import { CHAIN_DISPLAY } from '@/config/chainDisplay';
import { usePortfolioContext } from './PortfolioProvider';

/** Holdings table wired to the shared portfolio state. */
export function ConnectedHoldings({ compact = false }: { compact?: boolean }) {
  const p = usePortfolioContext();
  return (
    <Holdings
      compact={compact}
      assets={p.assets}
      walletNames={p.walletNames}
      hiddenAssets={p.hiddenAssets}
      hiddenKeys={p.hidden}
      onHide={p.hide}
      onUnhide={p.unhide}
      risk={p.risk}
      autoHiddenKeys={p.autoHidden}
      trustedKeys={p.trusted}
      onTrust={(key) => { p.trust(key); p.unhide(key); }}
      onUntrust={p.untrust}
    />
  );
}

/** One card per chain the wallets touch. */
export function ChainCards() {
  const p = usePortfolioContext();
  return (
    <div className="grid gap-6 lg:grid-cols-2 xl:grid-cols-3">
      {CHAIN_DISPLAY.map((chain) => (
        <ChainSection
          key={chain.key}
          chain={chain}
          results={p.results.filter((r) => r.chain === chain.key)}
          walletNames={p.walletNames}
          showWalletNames={p.wallets.length > 1}
          onRetry={p.retry}
        />
      ))}
    </div>
  );
}
