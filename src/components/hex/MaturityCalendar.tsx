'use client';

import { useState } from 'react';
import { Asset } from '@/types';
import { hexDayToDate } from '@/config/hex';
import { chainLabel } from '@/config/chainDisplay';
import { formatUSD } from '@/utils/prices';
import { HEX_CHAIN_COLORS } from './colors';

type StakeAsset = Asset & { stake: NonNullable<Asset['stake']> };

interface MaturityCalendarProps {
  stakes: StakeAsset[];
  hexPrices: Record<string, number | null>; // per chain
}

type Range = '1y' | '5y' | 'all';
type Unit = 'hex' | 'usd';
const RANGE_LABEL: Record<Range, string> = { '1y': 'Next 12 months', '5y': 'Next 5 years', all: 'All' };
const CHART_HEIGHT = 180;

interface Bucket {
  key: string;
  label: string;
  hex: Record<string, number>;
  count: number;
}

const compact = (v: number) =>
  v >= 1e9 ? `${(v / 1e9).toFixed(1)}B` : v >= 1e6 ? `${(v / 1e6).toFixed(1)}M` : v >= 1e3 ? `${(v / 1e3).toFixed(0)}k` : v.toFixed(0);

/** HEX a stake returns at its end: principal + interest (projected if still running). */
function payoutAtEnd(a: StakeAsset): number {
  const interest = a.stake.status === 'active' || a.stake.status === 'pending' ? a.stake.projectedInterestHex : a.stake.interestHex;
  return Number(a.balanceFormatted) + interest;
}

function bucketKey(date: Date, range: Range): { key: string; label: string } {
  const y = date.getUTCFullYear();
  if (range === '1y') {
    const m = date.getUTCMonth();
    return { key: `${y}-${m}`, label: date.toLocaleDateString('en-US', { month: 'short', year: '2-digit', timeZone: 'UTC' }) };
  }
  if (range === '5y') {
    const q = Math.floor(date.getUTCMonth() / 3) + 1;
    return { key: `${y}-Q${q}`, label: `Q${q} ’${String(y).slice(2)}` };
  }
  return { key: String(y), label: String(y) };
}

/**
 * When your HEX comes back: principal + interest unlocking per period,
 * stacked by chain, with already-matured stakes in a "Ready now" column.
 */
export function MaturityCalendar({ stakes, hexPrices }: MaturityCalendarProps) {
  const [range, setRange] = useState<Range>('5y');
  const [unit, setUnit] = useState<Unit>('hex');
  const [hover, setHover] = useState<string | null>(null);

  if (stakes.length === 0) return null;

  const now = new Date();
  const horizonDays = range === '1y' ? 365 : range === '5y' ? 1826 : Infinity;
  const chains = [...new Set(stakes.map((a) => a.chain))].sort();

  // Pre-fill the period buckets so empty months/quarters still show as gaps
  const buckets = new Map<string, Bucket>();
  const ready: Bucket = { key: 'ready', label: 'Ready now', hex: {}, count: 0 };
  if (range !== 'all') {
    const steps = range === '1y' ? 12 : 20;
    for (let i = 0; i < steps; i++) {
      const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + (range === '1y' ? i : i * 3), 1));
      const { key, label } = bucketKey(d, range);
      if (!buckets.has(key)) buckets.set(key, { key, label, hex: {}, count: 0 });
    }
  }

  let beyond = 0;
  for (const a of stakes) {
    const amount = payoutAtEnd(a);
    if (a.stake.status === 'matured' || a.stake.status === 'late') {
      ready.hex[a.chain] = (ready.hex[a.chain] ?? 0) + amount;
      ready.count++;
      continue;
    }
    if (a.stake.daysRemaining > horizonDays) {
      beyond++;
      continue;
    }
    const { key, label } = bucketKey(hexDayToDate(a.stake.endDay), range);
    const bucket = buckets.get(key) ?? { key, label, hex: {}, count: 0 };
    bucket.hex[a.chain] = (bucket.hex[a.chain] ?? 0) + amount;
    bucket.count++;
    buckets.set(key, bucket);
  }

  const ordered = [...buckets.values()].sort((a, b) => a.key.localeCompare(b.key, undefined, { numeric: true }));
  const columns = ready.count > 0 ? [ready, ...ordered] : ordered;

  const toUnit = (chain: string, hex: number) => (unit === 'hex' ? hex : hex * (hexPrices[chain] ?? 0));
  const total = (b: Bucket) => chains.reduce((sum, c) => sum + toUnit(c, b.hex[c] ?? 0), 0);
  const max = Math.max(1, ...columns.map(total));
  const fmtUnit = (v: number) => (unit === 'hex' ? `${compact(v)} HEX` : formatUSD(v));
  const peak = columns.reduce((best, b) => (total(b) > total(best) ? b : best), columns[0]);
  const hovered = columns.find((b) => b.key === hover);

  return (
    <figure className="m-0">
      <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs">
        <div className="flex rounded-lg bg-soft p-0.5" role="group" aria-label="Calendar range">
          {(Object.keys(RANGE_LABEL) as Range[]).map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              aria-pressed={range === r}
              className={`rounded-md px-2.5 py-1 font-medium ${range === r ? 'bg-white text-ink shadow-sm' : 'text-muted hover:text-ink'}`}
            >
              {RANGE_LABEL[r]}
            </button>
          ))}
        </div>
        <div className="flex rounded-lg bg-soft p-0.5" role="group" aria-label="Unit">
          {(['hex', 'usd'] as Unit[]).map((u) => (
            <button
              key={u}
              onClick={() => setUnit(u)}
              aria-pressed={unit === u}
              className={`rounded-md px-2.5 py-1 font-medium ${unit === u ? 'bg-white text-ink shadow-sm' : 'text-muted hover:text-ink'}`}
            >
              {u.toUpperCase()}
            </button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-4 text-muted">
          {chains.map((c) => (
            <span key={c} className="flex items-center gap-1.5">
              <span className="inline-block h-2.5 w-2.5 rounded-[3px]" style={{ background: HEX_CHAIN_COLORS[c] }} />
              {chainLabel(c)}
            </span>
          ))}
        </div>
      </div>

      <div className="relative" onPointerLeave={() => setHover(null)}>
        {/* Gridlines */}
        <div className="pointer-events-none absolute inset-x-0 top-0" style={{ height: CHART_HEIGHT }} aria-hidden="true">
          {[0.5, 1].map((f) => (
            <div key={f} className="absolute inset-x-0 border-t border-line" style={{ bottom: `${f * 100}%` }}>
              <span className="absolute -top-2 left-0 bg-[#fcfcfb] pr-1 text-[10px] tabular-nums text-muted">{fmtUnit(max * f)}</span>
            </div>
          ))}
        </div>

        <div className="flex items-end gap-1 pl-12" style={{ height: CHART_HEIGHT }}>
          {columns.map((b) => {
            const t = total(b);
            return (
              <div
                key={b.key}
                tabIndex={0}
                aria-label={`${b.label}: ${fmtUnit(t)} from ${b.count} stake${b.count === 1 ? '' : 's'}`}
                onPointerEnter={() => setHover(b.key)}
                onFocus={() => setHover(b.key)}
                onBlur={() => setHover(null)}
                className="group relative flex h-full flex-1 flex-col items-center justify-end rounded outline-none focus-visible:ring-2 focus-visible:ring-accent"
              >
                {b.key === peak.key && t > 0 && (
                  <span className="mb-1 whitespace-nowrap text-[10px] font-semibold tabular-nums text-ink/85">{fmtUnit(t)}</span>
                )}
                {/* Stacked segments with a 2px surface gap; rounded data-end, square base */}
                <div className="flex w-full max-w-6 flex-col-reverse gap-[2px]" style={{ height: `${(t / max) * 100}%`, opacity: hover && hover !== b.key ? 0.55 : 1 }}>
                  {chains.map((c, i) => {
                    const v = toUnit(c, b.hex[c] ?? 0);
                    if (v <= 0) return null;
                    const isTop = chains.slice(i + 1).every((later) => toUnit(later, b.hex[later] ?? 0) <= 0);
                    return (
                      <div
                        key={c}
                        className={isTop ? 'rounded-t-[4px]' : ''}
                        style={{ height: `${(v / t) * 100}%`, minHeight: 2, background: HEX_CHAIN_COLORS[c] }}
                      />
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        {/* Column labels, thinned when there are many */}
        <div className="flex gap-1 pl-12 pt-1" aria-hidden="true">
          {columns.map((b, i) => (
            <span key={b.key} className={`flex-1 truncate text-center text-[10px] ${b.key === 'ready' ? 'font-semibold text-green-700' : 'text-muted'}`}>
              {columns.length > 12 && i % 2 === 1 && b.key !== 'ready' ? '' : b.label}
            </span>
          ))}
        </div>

        {hovered && (
          <div role="tooltip" className="pointer-events-none absolute right-0 top-0 z-10 w-56 rounded-lg border border-line bg-white p-3 text-xs shadow-lg">
            <div className="mb-1.5 font-semibold text-ink">{hovered.label}</div>
            {chains.filter((c) => hovered.hex[c]).map((c) => (
              <div key={c} className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-1.5">
                  <span className="h-0.5 w-3 rounded" style={{ background: HEX_CHAIN_COLORS[c] }} />
                  <span className="font-semibold tabular-nums text-ink">{compact(hovered.hex[c])} HEX</span>
                </span>
                <span className="tabular-nums text-muted">{hexPrices[c] != null ? formatUSD(hovered.hex[c] * hexPrices[c]!) : chainLabel(c)}</span>
              </div>
            ))}
            {hovered.count === 0 && <div className="text-muted">Nothing unlocks</div>}
            {hovered.count > 0 && <div className="mt-1.5 text-muted">{hovered.count} stake{hovered.count === 1 ? '' : 's'} · principal + {hovered.key === 'ready' ? 'interest' : 'est. interest'}</div>}
          </div>
        )}
      </div>

      <figcaption className="mt-2 text-xs text-muted">
        Principal plus interest returned when each stake ends; interest for running stakes is projected at the recent payout rate.
        {beyond > 0 && ` ${beyond} stake${beyond === 1 ? ' ends' : 's end'} later than this range.`}
        {unit === 'usd' && ' USD at today’s price on each chain.'}
      </figcaption>
    </figure>
  );
}
