'use client';

import { Asset, IcosaStakeInfo } from '@/types';
import { chainLabel } from '@/config/chainDisplay';
import { formatUSD } from '@/utils/prices';
import { HEX_CHAIN_COLORS } from './colors';

const COLUMNS = ['pulsechain', 'ethereum'] as const;
const POOLS: { key: IcosaStakeInfo['pool']; label: string; earns: string }[] = [
  { key: 'HDRN', label: 'HDRN stake', earns: 'earns ICSA' },
  { key: 'ICSA', label: 'ICSA stake', earns: 'earns ICSA + HDRN' },
  { key: 'NFT', label: 'WAATSA NFT stakes', earns: 'earn ICSA' },
];

type IcosaAsset = Asset & { icosa: IcosaStakeInfo };

const fmt = (v: number) =>
  v >= 1e9 ? `${(v / 1e9).toFixed(2)}B` : v >= 1e6 ? `${(v / 1e6).toFixed(2)}M` : v.toLocaleString('en-US', { maximumFractionDigits: v >= 100 ? 0 : 2 });

interface Amount { symbol: string; amount: number; usd: number | null }

/** Sum by symbol; usd stays null if any part is unpriced. */
function sumBySymbol(assets: IcosaAsset[]): Amount[] {
  const map = new Map<string, Amount>();
  for (const a of assets) {
    const m = map.get(a.symbol) ?? { symbol: a.symbol, amount: 0, usd: 0 };
    m.amount += Number(a.balanceFormatted);
    m.usd = m.usd !== null && a.valueUSD !== undefined ? m.usd + a.valueUSD : null;
    map.set(a.symbol, m);
  }
  return [...map.values()];
}
const usdOf = (amounts: Amount[]) => amounts.reduce((s, a) => s + (a.usd ?? 0), 0);

/**
 * Icosa staking at a glance: what's staked and what it has earned, per chain.
 * HDRN and ICSA stakes show how far they are from their penalty-free minimum.
 */
export function IcosaView({ assets }: { assets: Asset[] }) {
  const stakes = assets.filter((a): a is IcosaAsset => !!a.icosa);
  if (stakes.length === 0) return null;

  const staked = stakes.filter((a) => a.icosa.role === 'principal');
  const earned = stakes.filter((a) => a.icosa.role === 'yield');
  const stakedUSD = usdOf(sumBySymbol(staked));
  const earnedUSD = usdOf(sumBySymbol(earned));

  return (
    <div>
      <h3 className="mb-3 text-lg font-semibold text-gray-800">Hedron &amp; Icosa staking</h3>

      <div className="mb-5 flex flex-wrap items-center gap-x-6 gap-y-3 rounded-2xl bg-gradient-to-br from-indigo-50 to-sky-50 p-4 ring-1 ring-indigo-100 sm:p-5">
        <div className="flex items-center gap-4 sm:gap-6">
          <div>
            <div className="text-xs font-medium uppercase tracking-wide text-gray-500">Staked</div>
            <div className="text-2xl font-bold tabular-nums text-gray-900 sm:text-3xl">{formatUSD(stakedUSD)}</div>
          </div>
          <div className="text-2xl text-indigo-300" aria-hidden>+</div>
          <div>
            <div className="text-xs font-medium uppercase tracking-wide text-gray-500">Earned so far</div>
            <div className="text-2xl font-bold tabular-nums text-indigo-700 sm:text-3xl">{formatUSD(earnedUSD)}</div>
          </div>
        </div>
        <p className="w-full text-[11px] text-gray-500 sm:ml-auto sm:w-auto sm:max-w-xs sm:text-right">
          Yield builds up daily and is paid when a stake ends. Ending before a stake&apos;s minimum length forfeits part of
          the principal and yield.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {COLUMNS.map((chain) => {
          const onChain = stakes.filter((a) => a.chain === chain);
          return (
            <section key={chain} className="min-w-0 rounded-2xl bg-white/60 p-4 ring-1 ring-gray-200">
              <h4 className="mb-2 flex items-center gap-2 text-sm font-bold text-gray-900">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: HEX_CHAIN_COLORS[chain] }} />
                {chainLabel(chain)}
              </h4>
              {onChain.length === 0 ? (
                <p className="py-3 text-sm text-gray-400">No Icosa stakes</p>
              ) : (
                <ul className="divide-y divide-gray-100">
                  {POOLS.map((pool) => {
                    const rows = onChain.filter((a) => a.icosa.pool === pool.key);
                    return rows.length ? <PoolRow key={pool.key} pool={pool} assets={rows} /> : null;
                  })}
                </ul>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}

function PoolRow({ pool, assets }: { pool: (typeof POOLS)[number]; assets: IcosaAsset[] }) {
  const principal = sumBySymbol(assets.filter((a) => a.icosa.role === 'principal'));
  const earned = sumBySymbol(assets.filter((a) => a.icosa.role === 'yield'));
  const value = usdOf(principal) + usdOf(earned);
  const nftCount = assets.reduce((s, a) => s + (a.icosa.stakeCount ?? 0), 0);

  // Penalty-free progress: the least-served stake (one HDRN/ICSA stake per wallet)
  const stakeCount = assets.filter((a) => a.icosa.role === 'principal').length;
  const pending = assets.filter((a) => a.icosa.role === 'principal' && a.icosa.daysUntilMature > 0);
  const blocking = pending.sort((a, b) => b.icosa.daysUntilMature - a.icosa.daysUntilMature)[0];
  const progress = blocking ? Math.min(100, (blocking.icosa.daysServed / blocking.icosa.minStakeDays) * 100) : 100;

  return (
    <li className="py-3">
      <div className="flex items-baseline justify-between gap-3">
        <div className="min-w-0">
          <span className="font-bold text-gray-900">{pool.key === 'NFT' ? `${nftCount} WAATSA` : pool.label}</span>
          <span className="ml-2 text-xs text-gray-500">{pool.key === 'NFT' ? `NFT stake${nftCount === 1 ? '' : 's'} · ` : ''}{pool.earns}</span>
        </div>
        <span className="shrink-0 text-sm font-semibold tabular-nums text-gray-900">{value > 0 ? formatUSD(value) : '—'}</span>
      </div>
      <dl className="mt-1 space-y-0.5 text-sm">
        {principal.length > 0 && (
          <div className="flex justify-between gap-3">
            <dt className="text-gray-500">Staked</dt>
            <dd className="tabular-nums text-gray-700">{principal.map((p) => `${fmt(p.amount)} ${p.symbol}`).join(' + ')}</dd>
          </div>
        )}
        <div className="flex justify-between gap-3">
          <dt className="text-gray-500">Earned</dt>
          <dd className="tabular-nums font-medium text-indigo-700">
            {earned.length ? earned.map((p) => `${fmt(p.amount)} ${p.symbol}`).join(' + ') : 'nothing yet'}
          </dd>
        </div>
      </dl>
      {pool.key !== 'NFT' && (
        <div className="mt-1.5 flex items-center gap-2">
          <div
            className="h-1 flex-1 overflow-hidden rounded-full bg-gray-200"
            role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress)}
            aria-label={`${pool.label} ${Math.round(progress)}% of minimum stake length served`}
          >
            <div className={`h-full rounded-full ${blocking ? 'bg-amber-400' : 'bg-gradient-to-r from-indigo-500 to-sky-500'}`} style={{ width: `${Math.max(progress, 1.5)}%` }} />
          </div>
          <span className={`shrink-0 text-[11px] tabular-nums ${blocking ? 'text-amber-700' : 'text-gray-500'}`}>
            {blocking
              ? stakeCount > 1
                ? `${pending.length} of ${stakeCount} stakes in minimum period · up to ${blocking.icosa.daysUntilMature}d left`
                : `penalty-free in ${blocking.icosa.daysUntilMature} day${blocking.icosa.daysUntilMature === 1 ? '' : 's'}`
              : stakeCount > 1 ? `all ${stakeCount} stakes can end without penalty` : 'can end without penalty'}
          </span>
        </div>
      )}
    </li>
  );
}
