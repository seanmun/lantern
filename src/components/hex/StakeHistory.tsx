'use client';

import { useState } from 'react';
import { EndedStake } from '@/types';
import { hexDayToDate } from '@/config/hex';
import { chainLabel } from '@/config/chainDisplay';
import { formatUSD } from '@/utils/prices';
import { HEX_CHAIN_COLORS } from './colors';

interface StakeHistoryProps {
  stakes: EndedStake[];
  unavailable: string[];
  walletName: (address: string) => string;
  hexPrices: Record<string, number | null>;
}

const ROWS_COLLAPSED = 10;
const fmt = (v: number) => v.toLocaleString('en-US', { maximumFractionDigits: 0 });
const fmtDate = (day: number) =>
  hexDayToDate(day).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' });

const OUTCOME: Record<EndedStake['outcome'], { label: string; className: string }> = {
  full: { label: '✓ Full term', className: 'bg-green-100 text-green-800' },
  early: { label: 'Ended early', className: 'bg-amber-100 text-amber-800' },
  late: { label: 'Ended late', className: 'bg-red-100 text-red-800' },
};

/**
 * Ended stakes: what each one returned, penalties paid, and lifetime totals.
 */
export function StakeHistory({ stakes, unavailable, walletName, hexPrices }: StakeHistoryProps) {
  const [showAll, setShowAll] = useState(false);
  if (stakes.length === 0 && unavailable.length === 0) return null;

  const principal = stakes.reduce((s, x) => s + x.stakedHex, 0);
  const returned = stakes.reduce((s, x) => s + x.returnHex, 0);
  const penalties = stakes.reduce((s, x) => s + x.penaltyHex, 0);
  const gross = stakes.reduce((s, x) => s + x.stakedHex + x.payoutHex, 0);
  const net = returned - principal;
  const netUSD = stakes.reduce((s, x) => s + (x.returnHex - x.stakedHex) * (hexPrices[x.chain] ?? 0), 0);
  const counts = { full: 0, early: 0, late: 0 };
  for (const x of stakes) counts[x.outcome]++;
  const shown = showAll ? stakes : stakes.slice(0, ROWS_COLLAPSED);

  return (
    <div>
      <h3 className="mb-3 text-lg font-semibold text-ink">Stake history</h3>

      {stakes.length > 0 ? (
        <>
          <dl className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat label="Stakes ended" value={fmt(stakes.length)} sub={`${counts.full} full · ${counts.early} early · ${counts.late} late`} />
            <Stat label="HEX staked" value={`${fmt(principal)} HEX`} />
            <Stat label="Net earned" value={`${net >= 0 ? '+' : '−'}${fmt(Math.abs(net))} HEX`} sub={hexPrices.pulsechain != null ? `≈ ${formatUSD(netUSD)} at today's prices` : undefined} />
            <Stat label="Penalties paid" value={`${fmt(penalties)} HEX`} sub={gross > 0 ? `${((penalties / gross) * 100).toFixed(1)}% of principal + payout` : undefined} />
          </dl>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="border-b text-left text-xs uppercase tracking-wide text-muted">
                  <th className="py-2 pr-4 font-medium">Stake</th>
                  <th className="py-2 pr-4 text-right font-medium">Principal</th>
                  <th className="py-2 pr-4 text-right font-medium">Served</th>
                  <th className="py-2 pr-4 text-right font-medium">Payout</th>
                  <th className="py-2 pr-4 text-right font-medium">Penalty</th>
                  <th className="py-2 pr-4 text-right font-medium">Returned</th>
                  <th className="py-2 pr-4 font-medium">Outcome</th>
                  <th className="py-2 text-right font-medium">Ended</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((x) => {
                  const o = OUTCOME[x.outcome];
                  return (
                    <tr key={`${x.chain}-${x.stakeId}`} className="border-b border-line last:border-0">
                      <td className="py-2 pr-4">
                        <div className="flex items-center gap-2 font-medium text-ink">
                          <span className="h-2 w-2 rounded-full" style={{ background: HEX_CHAIN_COLORS[x.chain] }} />
                          #{x.stakeId}
                        </div>
                        <div className="text-xs text-muted">
                          {chainLabel(x.chain)}{x.preFork ? ' · before fork' : ''} · {walletName(x.walletAddress)}
                        </div>
                      </td>
                      <td className="py-2 pr-4 text-right tabular-nums">{fmt(x.stakedHex)}</td>
                      <td className="py-2 pr-4 text-right tabular-nums">{fmt(x.servedDays)} / {fmt(x.stakedDays)}d</td>
                      <td className="py-2 pr-4 text-right tabular-nums">{fmt(x.payoutHex)}</td>
                      <td className="py-2 pr-4 text-right tabular-nums">{x.penaltyHex > 0 ? `−${fmt(x.penaltyHex)}` : '—'}</td>
                      <td className={`py-2 pr-4 text-right font-semibold tabular-nums ${x.returnHex < x.stakedHex ? 'text-red-700' : 'text-ink'}`}>
                        {fmt(x.returnHex)}
                      </td>
                      <td className="py-2 pr-4"><span className={`rounded-full px-2 py-0.5 text-xs font-medium ${o.className}`}>{o.label}</span></td>
                      <td className="py-2 text-right text-muted">{fmtDate(x.endedDay)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {stakes.length > ROWS_COLLAPSED && (
            <button
              onClick={() => setShowAll((v) => !v)}
              className="mt-3 inline-flex h-10 items-center gap-1.5 rounded-full bg-soft px-4 text-sm font-semibold text-ink hover:bg-line"
            >
              {showAll ? 'Show fewer' : `Show all ${stakes.length} ended stakes`}
            </button>
          )}
        </>
      ) : (
        <p className="text-sm text-muted">No ended stakes found.</p>
      )}

      {unavailable.length > 0 && (
        <p className="mt-2 text-xs text-muted">
          {unavailable.map(chainLabel).join(' and ')} history needs an RPC that serves full event logs (set ALCHEMY_API_KEY).
          Stakes that ended before the May 2023 fork are included from Pulsechain, which shares that history.
        </p>
      )}
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl bg-white p-4">
      <dt className="text-xs uppercase tracking-wide text-muted">{label}</dt>
      <dd className="mt-1 text-lg font-bold tabular-nums text-ink">{value}</dd>
      {sub && <dd className="text-xs text-muted">{sub}</dd>}
    </div>
  );
}
