'use client';

import { ReactNode } from 'react';
import { Asset } from '@/types';
import { hexDayToDate } from '@/config/hex';
import { chainLabel } from '@/config/chainDisplay';
import { formatUSD } from '@/utils/prices';
import { HEX_CHAIN_COLORS } from './colors';

type StakeAsset = Asset & { stake: NonNullable<Asset['stake']> };

const fmtHex = (v: number) =>
  v >= 1e9 ? `${(v / 1e9).toFixed(2)}B` : v >= 1e6 ? `${(v / 1e6).toFixed(2)}M` : v.toLocaleString('en-US', { maximumFractionDigits: 0 });
const fmtDate = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });

const BAR: Record<string, string> = {
  active: 'from-pink-500 to-purple-600',
  pending: 'from-gray-300 to-gray-400',
  matured: 'from-green-500 to-emerald-600',
  late: 'from-amber-500 to-orange-600',
};

/**
 * One HEX stake: progress through its term and what it's worth now and at
 * the end, in HEX and in dollars at today's price on its chain.
 */
export function StakeCard({ asset, walletName, statusBadge }: { asset: StakeAsset; walletName: string; statusBadge: ReactNode }) {
  const s = asset.stake;
  const price = asset.priceUSD;
  const principal = Number(asset.balanceFormatted);
  const current = principal + s.interestHex;
  const atEnd = principal + (s.status === 'active' || s.status === 'pending' ? s.projectedInterestHex : s.interestHex);

  const served = s.status === 'pending' ? 0 : Math.min(s.stakedDays, s.stakedDays - s.daysRemaining);
  const pct = s.stakedDays > 0 ? Math.min(100, (served / s.stakedDays) * 100) : 0;
  const usd = (hex: number) => (price !== undefined ? formatUSD(hex * price) : '—');
  const net = s.endNow.returnHex - principal;

  return (
    <article className="flex min-w-0 flex-col rounded-2xl bg-white/85 p-4 shadow-sm ring-1 ring-gray-200 transition-shadow hover:shadow-md sm:p-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5 font-semibold text-gray-900">
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: HEX_CHAIN_COLORS[asset.chain] }} />
            Stake #{s.stakeId}
            {s.hsi && (
              <span className="rounded bg-indigo-100 px-1.5 py-0.5 text-[10px] font-semibold text-indigo-800" title={`HEX Stake Instance ${s.hsi.address}`}>
                HSI{s.hsi.tokenId ? ` #${s.hsi.tokenId}` : ''}
              </span>
            )}
            {s.hdrnLoaned && <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800" title="Collateral for an HDRN loan">LOANED</span>}
          </div>
          <div className="mt-0.5 truncate text-xs text-gray-500">{chainLabel(asset.chain)} · {walletName}</div>
        </div>
        <div className="shrink-0">{statusBadge}</div>
      </div>

      {/* Progress through the term */}
      <div className="mt-4">
        <div className="flex items-baseline justify-between text-xs">
          <span className="font-semibold tabular-nums text-gray-900">{pct.toFixed(pct < 10 ? 1 : 0)}% complete</span>
          <span className="tabular-nums text-gray-500">
            {s.daysRemaining > 0 ? `${s.daysRemaining.toLocaleString()} days left` : 'Term complete'}
          </span>
        </div>
        <div
          className="mt-1.5 h-2.5 overflow-hidden rounded-full bg-gray-200"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(pct)}
          aria-label={`Stake #${s.stakeId} ${Math.round(pct)}% complete`}
        >
          <div className={`h-full rounded-full bg-gradient-to-r ${BAR[s.status] ?? BAR.active}`} style={{ width: `${Math.max(pct, 1.5)}%` }} />
        </div>
        <div className="mt-1 flex justify-between text-[11px] tabular-nums text-gray-500">
          <span>{fmtDate(hexDayToDate(s.lockedDay))}</span>
          <span>{served.toLocaleString()} / {s.stakedDays.toLocaleString()} days</span>
          <span>{fmtDate(new Date(s.endDate))}</span>
        </div>
      </div>

      {/* What it's worth */}
      <dl className="mt-4 grid grid-cols-2 gap-2">
        <Metric label="Principal" hex={principal} usd={usd(principal)} />
        <Metric label="Interest earned" hex={s.interestHex} usd={usd(s.interestHex)} accent="text-green-700" prefix="+" />
        <Metric label="Current total" hex={current} usd={usd(current)} strong />
        <Metric label="Est. total at end" hex={atEnd} usd={usd(atEnd)} note="at today's price" />
      </dl>

      {/* Details */}
      <div className="mt-auto pt-4">
        <div className="flex flex-wrap gap-x-3 gap-y-1 border-t border-gray-100 pt-3 text-xs text-gray-600">
          <span><span className="text-gray-400">T-Shares</span> {s.tShares.toLocaleString('en-US', { maximumFractionDigits: 3 })}</span>
          <span><span className="text-gray-400">APY</span> {s.apy.toLocaleString('en-US', { maximumFractionDigits: 1 })}%</span>
          {s.hdrnMintable ? <span className="text-indigo-700"><span className="text-indigo-400">Mint</span> {fmtHex(s.hdrnMintable)} HDRN</span> : null}
        </div>
        <div className={`mt-1.5 text-xs ${s.endNow.penaltyHex > 0 && net < 0 ? 'text-red-700' : 'text-gray-600'}`}>
          <span className="text-gray-400">If ended today</span> {fmtHex(s.endNow.returnHex)} HEX
          {s.endNow.penaltyHex > 0
            ? ` (−${fmtHex(s.endNow.penaltyHex)} penalty${net < 0 ? `, loses ${fmtHex(-net)} principal` : ''})`
            : ' · no penalty'}
        </div>
      </div>
    </article>
  );
}

function Metric({ label, hex, usd, strong, accent, prefix = '', note }: {
  label: string; hex: number; usd: string; strong?: boolean; accent?: string; prefix?: string; note?: string;
}) {
  return (
    <div className={`min-w-0 rounded-xl p-2.5 ${strong ? 'bg-gradient-to-br from-pink-50 to-purple-50 ring-1 ring-purple-100' : 'bg-gray-50'}`}>
      <dt className="text-[11px] uppercase tracking-wide text-gray-500">{label}</dt>
      <dd className={`mt-0.5 truncate text-sm font-semibold tabular-nums ${accent ?? 'text-gray-900'}`}>{prefix}{fmtHex(hex)} HEX</dd>
      <dd className={`truncate tabular-nums ${strong ? 'text-base font-bold text-gray-900' : 'text-sm text-gray-700'}`}>{usd}</dd>
      {note && <dd className="text-[10px] text-gray-400">{note}</dd>}
    </div>
  );
}
