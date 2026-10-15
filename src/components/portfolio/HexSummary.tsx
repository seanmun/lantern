'use client';

import { Asset } from '@/types';
import { chainLabel } from '@/config/chainDisplay';
import { formatUSD } from '@/utils/prices';

interface HexSummaryProps {
  assets: Asset[];
  walletNames: Map<string, string>;
}

const formatHex = (value: number) => value.toLocaleString('en-US', { maximumFractionDigits: 0 });
const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' });

/**
 * HEX-specific view: native stakes (T-Shares, maturity) and Maximus pool
 * positions across all wallets and both HEX chains.
 */
export function HexSummary({ assets, walletNames }: HexSummaryProps) {
  const stakes = assets
    .filter((a) => a.type === 'stake' && a.stake)
    .sort((a, b) => a.stake!.endDay - b.stake!.endDay);
  const pools = assets
    .filter((a) => a.pool)
    .sort((a, b) => (b.valueUSD ?? 0) - (a.valueUSD ?? 0));

  if (stakes.length === 0 && pools.length === 0) return null;

  const stakedHex = stakes.reduce((sum, a) => sum + Number(a.balanceFormatted), 0);
  const tShares = stakes.reduce((sum, a) => sum + a.stake!.tShares, 0);
  const stakeValue = stakes.reduce((sum, a) => sum + (a.valueUSD ?? 0), 0);
  const nextEnd = stakes.find((a) => a.stake!.daysRemaining > 0);
  const walletName = (a: Asset) => walletNames.get(a.walletAddress.toLowerCase()) ?? '';

  return (
    <section className="rounded-2xl border border-white/20 bg-white/70 p-6 shadow-xl backdrop-blur-sm sm:p-8">
      <h2 className="mb-6 text-2xl font-bold">
        <span className="bg-gradient-to-r from-pink-600 via-purple-600 to-orange-500 bg-clip-text text-transparent">
          HEX Stakes & Pools
        </span>
      </h2>

      {stakes.length > 0 && (
        <>
          <dl className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
            <Stat label="Staked principal" value={`${formatHex(stakedHex)} HEX`} />
            <Stat label="T-Shares" value={tShares.toLocaleString('en-US', { maximumFractionDigits: 3 })} />
            <Stat label="Principal value" value={formatUSD(stakeValue)} />
            <Stat
              label="Next maturity"
              value={nextEnd ? `${nextEnd.stake!.daysRemaining.toLocaleString()} days` : 'All matured'}
              sub={nextEnd ? formatDate(nextEnd.stake!.endDate) : undefined}
            />
          </dl>

          <div className="mb-8 overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b text-left text-xs uppercase tracking-wide text-gray-500">
                  <th className="py-2 pr-4 font-medium">Stake</th>
                  <th className="py-2 pr-4 font-medium">Chain</th>
                  <th className="py-2 pr-4 text-right font-medium">Principal</th>
                  <th className="py-2 pr-4 text-right font-medium">T-Shares</th>
                  <th className="py-2 pr-4 font-medium">Progress</th>
                  <th className="py-2 text-right font-medium">Ends</th>
                </tr>
              </thead>
              <tbody>
                {stakes.map((a) => {
                  const s = a.stake!;
                  const progress = Math.min(100, ((s.stakedDays - s.daysRemaining) / s.stakedDays) * 100);
                  return (
                    <tr key={a.id} className="border-b border-gray-100 last:border-0">
                      <td className="py-2 pr-4">
                        <div className="font-medium text-gray-900">#{s.stakeId}</div>
                        <div className="text-xs text-gray-500">{walletName(a)}</div>
                      </td>
                      <td className="py-2 pr-4 text-gray-600">{chainLabel(a.chain)}</td>
                      <td className="py-2 pr-4 text-right tabular-nums">
                        {formatHex(Number(a.balanceFormatted))}
                        {a.valueUSD !== undefined && <div className="text-xs text-gray-500">{formatUSD(a.valueUSD)}</div>}
                      </td>
                      <td className="py-2 pr-4 text-right tabular-nums">{s.tShares.toLocaleString('en-US', { maximumFractionDigits: 3 })}</td>
                      <td className="py-2 pr-4">
                        <div className="h-1.5 w-28 overflow-hidden rounded-full bg-gray-200">
                          <div className="h-full bg-gradient-to-r from-pink-500 to-purple-600" style={{ width: `${progress}%` }} />
                        </div>
                        <div className="mt-1 text-xs text-gray-500">{s.stakedDays.toLocaleString()} days</div>
                      </td>
                      <td className="py-2 text-right">
                        <div className={s.daysRemaining === 0 ? 'font-medium text-green-700' : 'text-gray-900'}>
                          {s.daysRemaining === 0 ? 'Matured' : `${s.daysRemaining.toLocaleString()}d`}
                        </div>
                        <div className="text-xs text-gray-500">{formatDate(s.endDate)}</div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {pools.length > 0 && (
        <>
          <h3 className="mb-3 text-lg font-semibold text-gray-800">Maximus Perpetual Pools</h3>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b text-left text-xs uppercase tracking-wide text-gray-500">
                  <th className="py-2 pr-4 font-medium">Pool</th>
                  <th className="py-2 pr-4 font-medium">Chain</th>
                  <th className="py-2 pr-4 text-right font-medium">Balance</th>
                  <th className="py-2 pr-4 text-right font-medium">Principal backing</th>
                  <th className="py-2 pr-4 text-right font-medium">Market value</th>
                  <th className="py-2 text-right font-medium">Pool stake ends</th>
                </tr>
              </thead>
              <tbody>
                {pools.map((a) => {
                  const p = a.pool!;
                  return (
                    <tr key={a.id} className="border-b border-gray-100 last:border-0">
                      <td className="py-2 pr-4">
                        <div className="font-medium text-gray-900">{a.symbol}</div>
                        <div className="text-xs text-gray-500">{p.cycleDays.toLocaleString()}-day cycle · {walletName(a)}</div>
                      </td>
                      <td className="py-2 pr-4 text-gray-600">{chainLabel(a.chain)}</td>
                      <td className="py-2 pr-4 text-right tabular-nums">{formatHex(Number(a.balanceFormatted))}</td>
                      <td className="py-2 pr-4 text-right tabular-nums">
                        {formatHex(p.backingHex)} HEX
                        {p.backingValueUSD !== undefined && <div className="text-xs text-gray-500">{formatUSD(p.backingValueUSD)}</div>}
                      </td>
                      <td className="py-2 pr-4 text-right tabular-nums">
                        {a.valueUSD !== undefined ? formatUSD(a.valueUSD) : '—'}
                        {a.valueUSD !== undefined && p.backingValueUSD ? (
                          <div className="text-xs text-gray-500">{((a.valueUSD / p.backingValueUSD) * 100).toFixed(0)}% of principal</div>
                        ) : null}
                      </td>
                      <td className="py-2 text-right">
                        {p.currentStake ? (
                          <>
                            <div className="text-gray-900">{p.currentStake.daysRemaining.toLocaleString()}d</div>
                            <div className="text-xs text-gray-500">{formatDate(p.currentStake.endDate)}</div>
                          </>
                        ) : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-xs text-gray-500">
            Principal backing is the HEX staked by the pool divided by supply. Stake interest isn&apos;t
            recorded until the stake ends, so pools usually trade above principal.
          </p>
        </>
      )}
    </section>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl bg-white/60 p-4">
      <dt className="text-xs uppercase tracking-wide text-gray-500">{label}</dt>
      <dd className="mt-1 text-lg font-bold text-gray-900">{value}</dd>
      {sub && <dd className="text-xs text-gray-500">{sub}</dd>}
    </div>
  );
}
