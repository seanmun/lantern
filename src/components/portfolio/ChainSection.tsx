'use client';

import { useState } from 'react';

import { Asset } from '@/types';
import { ChainDisplay } from '@/config/chainDisplay';
import { ChainResult } from '@/hooks/usePortfolio';
import { AssetWithNFT } from '@/components/ui/NFTDisplay';
import { ChainError } from '@/components/ui/ErrorState';
import { AssetCardSkeleton } from '@/components/ui/Skeleton';
import { NATIVE_COIN, formatUSD } from '@/utils/prices';
import { TokenLogo } from '@/components/ui/TokenLogo';

interface ChainSectionProps {
  chain: ChainDisplay;
  results: ChainResult[];
  walletNames: Map<string, string>;
  showWalletNames: boolean;
  onRetry: (walletId: string, chain: string) => void;
}

const isEmptyNative = (a: Asset) => a.type === 'native' && BigInt(a.balance) === BigInt(0);
const DUST_USD = 1;
const ROWS_COLLAPSED = 10;
// Tiny or unpriced token balances (often airdropped spam) fold behind a toggle
const isDust = (a: Asset) => a.type === 'token' && !a.pool && (a.valueUSD ?? 0) < DUST_USD;

export function ChainSection({ chain, results, walletNames, showWalletNames, onRetry }: ChainSectionProps) {
  const [showDust, setShowDust] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const assets = results.flatMap((r) => r.assets);
  const listed = assets
    .filter((a) => a.type !== 'nft' && a.type !== 'ordinal' && a.type !== 'stake' && a.type !== 'collection' && !isEmptyNative(a))
    .sort((a, b) => (b.valueUSD ?? 0) - (a.valueUSD ?? 0));
  const main = listed.filter((a) => !isDust(a));
  const dust = listed.filter(isDust);
  const stakes = assets.filter((a) => a.type === 'stake');
  const collectibles = assets.filter((a) => a.type === 'nft' || a.type === 'ordinal').length;
  const collectiblesValue = assets.filter((a) => a.type === 'collection').reduce((s, a) => s + (a.valueUSD ?? 0), 0);
  const loading = results.filter((r) => r.status === 'loading').length;
  const failed = results.filter((r) => r.status === 'error' || r.status === 'rate_limited');
  const total = assets.reduce((sum, a) => sum + (a.valueUSD ?? 0), 0);

  // Hide chains where every wallet loaded and holds nothing
  if (loading === 0 && failed.length === 0 && listed.length === 0 && stakes.length === 0 && collectibles === 0) {
    return null;
  }

  return (
    <section className="min-w-0 rounded-3xl border border-line bg-white p-6">
      <div className="mb-5 flex items-center justify-between gap-3">
        <h2 className="flex min-w-0 items-center gap-3 text-xl font-extrabold tracking-tight text-ink">
          <TokenLogo src={NATIVE_COIN[chain.key] ? `/api/logos/native/${NATIVE_COIN[chain.key]}` : undefined} symbol={chain.label} size={28} />
          <span className="truncate">{chain.label}</span>
        </h2>
        <span className="shrink-0 rounded-full bg-soft px-3 py-1 text-sm font-bold tabular-nums text-ink">{formatUSD(total)}</span>
      </div>

      <div className="space-y-3">
        {failed.map((r) => (
          <ChainError
            key={r.walletId}
            chain={`${chain.label}${showWalletNames ? ` · ${walletNames.get(r.walletId) ?? ''}` : ''}`}
            error={r.error ?? 'Unknown error'}
            onRetry={() => onRetry(r.walletId, r.chain)}
          />
        ))}

        {(() => {
          const pool = showDust ? listed : main;
          return showAll ? pool : pool.slice(0, ROWS_COLLAPSED);
        })().map((asset) => (
          <div key={asset.id} className="rounded-2xl border border-line bg-white transition-colors hover:border-[#D6D6DE]">
            {showWalletNames && (
              <div className="px-4 pt-2 text-xs font-medium text-muted">
                {walletNames.get(asset.walletAddress.toLowerCase())}
              </div>
            )}
            <AssetWithNFT asset={asset} />
          </div>
        ))}

        <div className="flex flex-wrap gap-x-4 gap-y-1 empty:hidden">
          {(showDust ? listed : main).length > ROWS_COLLAPSED && (
            <button onClick={() => setShowAll((v) => !v)} className="text-xs font-medium text-accent hover:text-ink">
              {showAll ? 'Show top 10' : `Show all ${(showDust ? listed : main).length} holdings`}
            </button>
          )}
          {dust.length > 0 && (
            <button onClick={() => setShowDust((v) => !v)} className="text-xs font-medium text-accent hover:text-ink">
              {showDust ? 'Hide small balances' : `Show ${dust.length} small or unpriced balance${dust.length === 1 ? '' : 's'}`}
            </button>
          )}
        </div>

        {Array.from({ length: loading }, (_, i) => <AssetCardSkeleton key={`loading-${i}`} />)}

        {(stakes.length > 0 || collectibles > 0) && (
          <p className="pt-1 text-xs text-muted">
            {stakes.length > 0 && `${stakes.length} HEX stake${stakes.length === 1 ? '' : 's'} (${formatUSD(stakes.reduce((s, a) => s + (a.valueUSD ?? 0), 0))}) in HEX Stakes below`}
            {stakes.length > 0 && collectibles > 0 && ' · '}
            {collectibles > 0 && `${collectibles} collectible${collectibles === 1 ? '' : 's'}${collectiblesValue > 0 ? ` (${formatUSD(collectiblesValue)} at floor)` : ''} in the gallery`}
          </p>
        )}
      </div>
    </section>
  );
}
