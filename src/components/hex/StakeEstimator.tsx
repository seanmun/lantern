'use client';

import { useState } from 'react';
import { HexStatsWithPrice } from '@/hooks/useHexStats';
import { chainLabel } from '@/config/chainDisplay';
import { hexDayToDate } from '@/config/hex';
import { MAX_STAKE_DAYS, MIN_STAKE_DAYS, estimateStake, trailingAverage } from '@/utils/hexMath';
import { formatUSD } from '@/utils/prices';
import { Hexagon } from './Hexagon';
import { PayoutHistoryChart } from './PayoutHistoryChart';
import { HEX_CHAIN_COLORS } from './colors';

interface StakeEstimatorProps {
  stats: HexStatsWithPrice[];
  liquidHex: Record<string, number>; // the viewer's liquid HEX per chain, for "use my HEX"
}

type PayoutMode = '30d' | '365d' | 'custom';

const LENGTH_PRESETS = [
  { label: '1Y', days: 365 },
  { label: '3Y', days: 1111 },
  { label: '5Y', days: 1826 },
  { label: '10Y', days: 3641 },
  { label: 'Max', days: MAX_STAKE_DAYS },
];
const PRICE_PRESETS = [0.1, 0.5, 1, 2, 5, 10, 100];
const MIN_LOG_MULT = -1; // 0.1×
const MAX_LOG_MULT = 2;  // 100×

const fmt = (value: number, digits = 0) => value.toLocaleString('en-US', { maximumFractionDigits: digits });
const fmtDate = (day: number) =>
  hexDayToDate(day).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' });
const multLabel = (m: number) =>
  Math.abs(m - 1) < 0.005 ? "Today's price" : m < 1 ? `−${fmt((1 - m) * 100)}%` : `${fmt(m, m < 10 ? 1 : 0)}×`;

/**
 * "What would a stake pay?" Uses the contract's share bonuses and the current
 * T-Share price; interest is projected from an assumed daily payout per
 * T-Share, chosen from recent history or set by hand.
 */
export function StakeEstimator({ stats, liquidHex }: StakeEstimatorProps) {
  const [chain, setChain] = useState(() => (stats.some((s) => s.chain === 'pulsechain') ? 'pulsechain' : stats[0]?.chain));
  const [amountInput, setAmountInput] = useState('1,000,000');
  const [days, setDays] = useState(3641);
  const [payoutMode, setPayoutMode] = useState<PayoutMode>('30d');
  const [customPayout, setCustomPayout] = useState<number | null>(null);
  const [logMult, setLogMult] = useState(0);

  const s = stats.find((x) => x.chain === chain) ?? stats[0];
  if (!s) return null;

  const history = s.payoutHistory ?? [];
  const avg30 = history.length ? trailingAverage(history, 30) : s.payoutPerTShareHex;
  const avg365 = history.length ? trailingAverage(history, 365) : s.payoutPerTShareHex;
  const payout = payoutMode === '30d' ? avg30 : payoutMode === '365d' ? avg365 : customPayout ?? avg30;

  const amount = Number(amountInput.replace(/[,\s]/g, '')) || 0;
  const est = estimateStake(amount, days, s.tSharePriceHex, payout);
  const startDay = s.currentDay + 1; // new stakes lock from the next HEX day
  const endDay = startDay + days;

  const multiplier = 10 ** logMult;
  const todayPrice = s.hexPriceUSD;
  const price = todayPrice != null ? todayPrice * multiplier : null;
  const myLiquid = liquidHex[s.chain] ?? 0;
  const color = HEX_CHAIN_COLORS[s.chain];

  return (
    <section className="rounded-2xl border border-white/20 bg-white/70 p-6 shadow-xl backdrop-blur-sm sm:p-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Hexagon size={36} />
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Stake estimator</h2>
            <p className="text-sm text-gray-500">What a new stake could pay, in HEX and in dollars</p>
          </div>
        </div>
        <div className="flex rounded-lg bg-gray-100 p-0.5 text-sm" role="group" aria-label="Chain">
          {stats.map((x) => (
            <button
              key={x.chain}
              onClick={() => { setChain(x.chain); setCustomPayout(null); }}
              aria-pressed={x.chain === s.chain}
              className={`flex items-center gap-2 rounded-md px-3 py-1.5 font-medium ${x.chain === s.chain ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-800'}`}
            >
              <span className="h-2 w-2 rounded-full" style={{ background: HEX_CHAIN_COLORS[x.chain] }} />
              {chainLabel(x.chain)}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Inputs */}
        <div className="space-y-6">
          <div>
            <label htmlFor="est-amount" className="mb-1.5 block text-sm font-medium text-gray-800">Amount to stake</label>
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <input
                  id="est-amount"
                  inputMode="decimal"
                  value={amountInput}
                  onChange={(e) => setAmountInput(e.target.value)}
                  onBlur={() => amount > 0 && setAmountInput(fmt(amount, 8))}
                  className="w-full rounded-xl border border-gray-200 bg-white py-2.5 pl-4 pr-14 text-lg font-semibold tabular-nums focus:outline-none focus:ring-2 focus:ring-purple-400"
                />
                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm text-gray-500">HEX</span>
              </div>
            </div>
            <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2 text-xs text-gray-500">
              <span>{todayPrice != null ? `≈ ${formatUSD(amount * todayPrice)} today` : ''}</span>
              {myLiquid > 0 && (
                <button onClick={() => setAmountInput(fmt(myLiquid, 8))} className="font-medium text-purple-700 hover:text-purple-900">
                  Use my liquid {chainLabel(s.chain)} HEX ({fmt(myLiquid)})
                </button>
              )}
            </div>
          </div>

          <div>
            <div className="mb-1.5 flex items-baseline justify-between">
              <label htmlFor="est-days" className="text-sm font-medium text-gray-800">Stake length</label>
              <span className="text-sm tabular-nums text-gray-600">
                <input
                  aria-label="Stake length in days"
                  type="number"
                  min={MIN_STAKE_DAYS}
                  max={MAX_STAKE_DAYS}
                  value={days}
                  onChange={(e) => setDays(Math.min(MAX_STAKE_DAYS, Math.max(MIN_STAKE_DAYS, Number(e.target.value) || MIN_STAKE_DAYS)))}
                  className="w-20 rounded-md border border-gray-200 bg-white px-2 py-0.5 text-right font-semibold text-gray-900"
                />{' '}
                days · ends {fmtDate(endDay)}
              </span>
            </div>
            <input
              id="est-days"
              type="range"
              min={MIN_STAKE_DAYS}
              max={MAX_STAKE_DAYS}
              value={days}
              onChange={(e) => setDays(Number(e.target.value))}
              className="w-full accent-purple-600"
            />
            <div className="mt-2 flex flex-wrap gap-1.5">
              {LENGTH_PRESETS.map((p) => (
                <button
                  key={p.label}
                  onClick={() => setDays(p.days)}
                  aria-pressed={days === p.days}
                  className={`rounded-md px-2.5 py-1 text-xs font-medium ${days === p.days ? 'bg-purple-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <p className="mt-1.5 text-xs text-gray-500">
              The Longer Pays Better bonus maxes out at 3,641 days; longer stakes earn interest for more days but no extra bonus.
            </p>
          </div>

          <div>
            <div className="mb-1.5 text-sm font-medium text-gray-800">Daily payout per T-Share (assumption)</div>
            <div className="flex flex-wrap gap-1.5">
              {([
                ['30d', `30-day avg · ${avg30.toFixed(3)}`],
                ['365d', `1-year avg · ${avg365.toFixed(3)}`],
                ['custom', 'Custom'],
              ] as [PayoutMode, string][]).map(([mode, label]) => (
                <button
                  key={mode}
                  onClick={() => setPayoutMode(mode)}
                  aria-pressed={payoutMode === mode}
                  className={`rounded-md px-2.5 py-1 text-xs font-medium ${payoutMode === mode ? 'bg-purple-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
                >
                  {label}
                </button>
              ))}
            </div>
            {payoutMode === 'custom' && (
              <div className="mt-3 flex items-center gap-3">
                <input
                  type="range"
                  aria-label="Custom daily payout per T-Share"
                  min={0.1}
                  max={8}
                  step={0.01}
                  value={payout}
                  onChange={(e) => setCustomPayout(Number(e.target.value))}
                  className="flex-1 accent-purple-600"
                />
                <span className="w-24 text-right text-sm font-semibold tabular-nums text-gray-900">{payout.toFixed(2)} HEX</span>
              </div>
            )}
          </div>
        </div>

        {/* Results */}
        <div className="space-y-4">
          <div className="rounded-2xl bg-gradient-to-br from-pink-600 to-purple-700 p-5 text-white shadow-lg">
            <div className="text-xs uppercase tracking-wide text-white/80">Estimated HEX at end of stake</div>
            <div className="mt-1 text-3xl font-bold tabular-nums">{fmt(est.totalHex)} HEX</div>
            <div className="mt-1 text-sm text-white/85">
              {fmt(amount)} principal + {fmt(est.interestHex)} interest · +{fmt(est.roiPct, 1)}% ({fmt(est.apyPct, 2)}% APY)
            </div>
          </div>

          <dl className="grid grid-cols-2 gap-3 text-sm">
            <ResultStat label="T-Shares" value={fmt(est.tShares, 3)} sub={`at ${fmt(s.tSharePriceHex)} HEX / T-Share`} />
            <ResultStat label="Bonus shares" value={`+${fmt(est.longerPaysBetterPct + est.biggerPaysBetterPct, 2)}%`} sub={`Longer +${fmt(est.longerPaysBetterPct, 1)}% · Bigger +${fmt(est.biggerPaysBetterPct, 2)}%`} />
            <ResultStat label="Daily interest" value={`${fmt(est.tShares * payout, 2)} HEX`} sub={`${payout.toFixed(3)} HEX per T-Share`} />
            <ResultStat label="Stake ends" value={fmtDate(endDay)} sub={`HEX day ${fmt(endDay)}`} />
          </dl>

          {/* Price scenario */}
          {todayPrice != null && price != null && (
            <div className="rounded-xl bg-white/60 p-4">
              <div className="mb-2 flex items-baseline justify-between">
                <label htmlFor="est-price" className="text-sm font-medium text-gray-800">HEX price at end</label>
                <span className="text-sm tabular-nums text-gray-600">
                  <span className="font-semibold text-gray-900">{formatUSD(price)}</span> · {multLabel(multiplier)}
                </span>
              </div>
              <input
                id="est-price"
                type="range"
                min={MIN_LOG_MULT}
                max={MAX_LOG_MULT}
                step={0.01}
                value={logMult}
                onChange={(e) => setLogMult(Number(e.target.value))}
                className="w-full accent-purple-600"
              />
              <div className="mt-3 flex items-end justify-between gap-3">
                <div>
                  <div className="text-xs text-gray-500">Stake value at end</div>
                  <div className="text-2xl font-bold tabular-nums text-gray-900">{formatUSD(est.totalHex * price)}</div>
                </div>
                <div className="text-right text-xs text-gray-500">
                  vs. {formatUSD(amount * todayPrice)} today
                  <div className={`text-sm font-semibold tabular-nums ${est.totalHex * price >= amount * todayPrice ? 'text-green-700' : 'text-red-700'}`}>
                    {est.totalHex * price >= amount * todayPrice ? '+' : '−'}
                    {formatUSD(Math.abs(est.totalHex * price - amount * todayPrice))}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Price scenarios table: every outcome readable without dragging */}
      {todayPrice != null && (
        <div className="mt-6 overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="border-b text-left text-xs uppercase tracking-wide text-gray-500">
                <th className="py-2 pr-4 font-medium">Price scenario</th>
                <th className="py-2 pr-4 text-right font-medium">HEX price</th>
                <th className="py-2 pr-4 text-right font-medium">Stake value at end</th>
                <th className="py-2 pr-4 text-right font-medium">Just holding</th>
                <th className="py-2 text-right font-medium">Change vs. today</th>
              </tr>
            </thead>
            <tbody>
              {PRICE_PRESETS.map((m) => {
                const p = todayPrice * m;
                const value = est.totalHex * p;
                const change = value - amount * todayPrice;
                const selected = Math.abs(Math.log10(m) - logMult) < 0.005;
                return (
                  <tr
                    key={m}
                    onClick={() => setLogMult(Math.log10(m))}
                    className={`cursor-pointer border-b border-gray-100 last:border-0 hover:bg-purple-50/60 ${selected ? 'bg-purple-50' : ''}`}
                  >
                    <td className="py-2 pr-4 font-medium text-gray-900">{multLabel(m)}</td>
                    <td className="py-2 pr-4 text-right tabular-nums">{formatUSD(p)}</td>
                    <td className="py-2 pr-4 text-right font-semibold tabular-nums text-gray-900">{formatUSD(value)}</td>
                    <td className="py-2 pr-4 text-right tabular-nums text-gray-600">{formatUSD(amount * p)}</td>
                    <td className={`py-2 text-right tabular-nums ${change >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                      {change >= 0 ? '+' : '−'}{formatUSD(Math.abs(change))}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="mt-2 text-xs text-gray-500">
            &ldquo;Just holding&rdquo; is the same HEX left unstaked, valued at that price.
          </p>
        </div>
      )}

      {history.length > 0 && (
        <div className="mt-8">
          <PayoutHistoryChart series={history} color={color} assumption={payout} />
        </div>
      )}

      <p className="mt-4 text-xs text-gray-500">
        Estimates only, not financial advice. Real payouts depend on future total T-Shares, end-stake penalties paid into the
        pool, and HEX inflation. Ending a stake early forfeits interest and principal.
      </p>
    </section>
  );
}

function ResultStat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl bg-white/60 p-3">
      <dt className="text-xs text-gray-500">{label}</dt>
      <dd className="mt-0.5 font-bold tabular-nums text-gray-900">{value}</dd>
      {sub && <dd className="text-xs text-gray-500">{sub}</dd>}
    </div>
  );
}
