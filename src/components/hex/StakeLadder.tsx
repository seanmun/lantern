'use client';

import { PointerEvent, useEffect, useRef, useState } from 'react';
import { hexDayToDate } from '@/config/hex';
import { chainLabel } from '@/config/chainDisplay';
import { HexStakeStatus } from '@/types';
import { HEX_CHAIN_COLORS } from './colors';

export interface LadderRow {
  id: string;
  label: string;   // e.g. "#623019" or "MAXI pool"
  sub: string;     // e.g. wallet name
  chain: string;
  lockedDay: number;
  endDay: number;
  status: HexStakeStatus;
  details: { label: string; value: string }[]; // tooltip rows, value-first
}

interface StakeLadderProps {
  rows: LadderRow[];
  currentDay: number;
}

const fmtDate = (day: number) =>
  hexDayToDate(day).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' });

const DAYS_PER_YEAR = 365.25;
const MIN_TICK_SPACING_PX = 48;

/** Year ticks across the domain, thinned so labels keep >= 48px apart. */
function yearTicks(minDay: number, maxDay: number, trackWidth: number): { day: number; label: string }[] {
  const startYear = hexDayToDate(minDay).getUTCFullYear() + 1;
  const endYear = hexDayToDate(maxDay).getUTCFullYear();
  const pxPerYear = trackWidth > 0 ? (trackWidth * DAYS_PER_YEAR) / (maxDay - minDay) : 80;
  const step = [1, 2, 5, 10].find((s) => s * pxPerYear >= MIN_TICK_SPACING_PX) ?? 10;
  const ticks = [];
  for (let year = startYear; year <= endYear; year++) {
    if (year % step !== 0 && step > 1) continue;
    const day = Math.round((Date.UTC(year, 0, 1) - Date.UTC(2019, 11, 3)) / 86_400_000);
    ticks.push({ day, label: String(year) });
  }
  return ticks;
}

type Range = '2y' | '5y' | 'all';
const RANGE_LABEL: Record<Range, string> = { '2y': '2Y', '5y': '5Y', all: 'All' };

/** Zoom in by default when one long stake (e.g. MAXI's 15 years) would flatten the rest. */
function defaultRange(rows: LadderRow[], currentDay: number): Range {
  const remaining = rows.map((r) => r.endDay - currentDay).sort((a, b) => a - b);
  const median = remaining[Math.floor(remaining.length / 2)] ?? 0;
  const max = remaining[remaining.length - 1] ?? 0;
  if (max < 4 * DAYS_PER_YEAR || median > 3 * DAYS_PER_YEAR) return 'all';
  return median < DAYS_PER_YEAR ? '2y' : '5y';
}

const STATUS_LABEL: Record<HexStakeStatus, string | null> = {
  pending: 'Starts tomorrow',
  active: null,
  matured: '✓ Ready to end',
  late: '⚠ Late penalty',
};

/**
 * Stake ladder: every stake as a bar from lock day to end day on one time
 * axis. Solid = days served, faded = days remaining; the line marks today.
 */
export function StakeLadder({ rows, currentDay }: StakeLadderProps) {
  const [hover, setHover] = useState<{ row: LadderRow; x: number; y: number; width: number } | null>(null);
  // Follow the data's default until the viewer picks a range themselves
  const [chosenRange, setRange] = useState<Range | null>(null);
  const [trackWidth, setTrackWidth] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const axisRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = axisRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setTrackWidth(entry.contentRect.width));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  if (rows.length === 0) return null;

  const range = chosenRange ?? defaultRange(rows, currentDay);
  let minDay: number;
  let maxDay: number;
  if (range === 'all') {
    const rawMin = Math.min(currentDay, ...rows.map((r) => r.lockedDay));
    const rawMax = Math.max(currentDay, ...rows.map((r) => r.endDay));
    const pad = Math.max(10, (rawMax - rawMin) * 0.02);
    minDay = rawMin - pad;
    maxDay = rawMax + pad;
  } else {
    const years = range === '2y' ? 2 : 5;
    minDay = currentDay - DAYS_PER_YEAR * (years / 4);
    maxDay = currentDay + DAYS_PER_YEAR * years;
  }
  const clamp = (day: number) => Math.min(maxDay, Math.max(minDay, day));
  const pct = (day: number) => ((clamp(day) - minDay) / (maxDay - minDay)) * 100;

  const chains = [...new Set(rows.map((r) => r.chain))];
  const ticks = yearTicks(minDay, maxDay, trackWidth);
  const todayPct = pct(currentDay);

  const showTooltip = (row: LadderRow, event: PointerEvent<HTMLDivElement> | { clientX: number; clientY: number }) => {
    const box = containerRef.current?.getBoundingClientRect();
    if (!box) return;
    setHover({ row, x: event.clientX - box.left, y: event.clientY - box.top, width: box.width });
  };

  return (
    <figure className="m-0">
      {/* Legend + zoom */}
      <div className="mb-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-muted">
        <div className="mr-auto flex rounded-lg bg-soft p-0.5" role="group" aria-label="Time range">
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
        {chains.map((chain) => (
          <span key={chain} className="flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-4 rounded-[3px]" style={{ background: HEX_CHAIN_COLORS[chain] }} />
            {chainLabel(chain)}
          </span>
        ))}
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-4 rounded-[3px] bg-gray-500" />
          served
          <span className="ml-2 inline-block h-2.5 w-4 rounded-[3px] bg-gray-500/25" />
          remaining
        </span>
      </div>

      <div ref={containerRef} className="relative" onPointerLeave={() => setHover(null)}>
        <div className="max-h-[420px] overflow-y-auto pr-1">
          <div className="relative grid grid-cols-[6.5rem_1fr] sm:grid-cols-[10rem_1fr]">
            {/* Gridlines + today line, behind the bars, spanning the track column */}
            <div className="pointer-events-none absolute inset-y-0 left-[6.5rem] right-0 sm:left-[10rem]" aria-hidden="true">
              {ticks.map((t) => (
                <div key={t.day} className="absolute inset-y-0 w-px bg-line" style={{ left: `${pct(t.day)}%` }} />
              ))}
              <div className="absolute inset-y-0 w-px bg-gray-900" style={{ left: `${todayPct}%` }} />
            </div>

            {rows.map((row) => {
              const color = HEX_CHAIN_COLORS[row.chain] ?? '#6b7280';
              const left = pct(row.lockedDay);
              const width = Math.max(0.6, pct(row.endDay) - left);
              const visibleStart = clamp(row.lockedDay);
              const visibleEnd = clamp(row.endDay);
              const served = visibleEnd > visibleStart
                ? Math.min(1, Math.max(0, (currentDay - visibleStart) / (visibleEnd - visibleStart)))
                : 1;
              const runsPast = row.endDay > maxDay;
              const statusLabel = STATUS_LABEL[row.status];

              return (
                <div key={row.id} className="contents">
                  <div className="flex min-w-0 flex-col justify-center py-1.5 pr-2">
                    <span className="truncate text-xs font-medium text-ink">{row.label}</span>
                    <span className={`truncate text-[11px] ${row.status === 'late' ? 'font-medium text-amber-700' : 'text-muted'}`}>
                      {statusLabel ?? row.sub}
                    </span>
                  </div>
                  <div
                    className="relative flex items-center py-1.5 outline-none focus-visible:ring-2 focus-visible:ring-accent rounded"
                    tabIndex={0}
                    aria-label={`${row.label}: ${fmtDate(row.lockedDay)} to ${fmtDate(row.endDay)}, ${Math.round(served * 100)}% served`}
                    onPointerMove={(e) => showTooltip(row, e)}
                    onFocus={(e) => {
                      const r = e.currentTarget.getBoundingClientRect();
                      showTooltip(row, { clientX: r.left + r.width / 2, clientY: r.top });
                    }}
                    onBlur={() => setHover(null)}
                  >
                    {/* Hit target is the whole row; the bar is drawn inside it */}
                    <div
                      className={`relative h-3 transition-opacity ${runsPast ? 'rounded-l-[4px]' : 'rounded-[4px]'}`}
                      style={{
                        marginLeft: `${left}%`,
                        width: `${width}%`,
                        background: `${color}40`,
                        opacity: hover && hover.row.id !== row.id ? 0.55 : 1,
                      }}
                    >
                      {runsPast && (
                        <span className="absolute -right-3 top-1/2 -translate-y-1/2 text-[10px] leading-none text-muted" aria-hidden="true">›</span>
                      )}
                      {served > 0 && (
                        <div
                          className="absolute inset-y-0 left-0 rounded-[4px]"
                          style={{
                            width: `${served * 100}%`,
                            background: color,
                            // 2px surface gap where served meets remaining
                            boxShadow: served < 1 ? '2px 0 0 #fcfcfb' : undefined,
                          }}
                        />
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Axis */}
        <div className="grid grid-cols-[6.5rem_1fr] sm:grid-cols-[10rem_1fr]" aria-hidden="true">
          <div />
          <div ref={axisRef} className="relative h-6 border-t border-line">
            {ticks.map((t) => (
              <span key={t.day} className="absolute top-1 -translate-x-1/2 text-[11px] tabular-nums text-muted" style={{ left: `${pct(t.day)}%` }}>
                {t.label}
              </span>
            ))}
            <span
              className="absolute -top-5 -translate-x-1/2 rounded bg-gray-900 px-1.5 py-0.5 text-[10px] font-medium text-white"
              style={{ left: `${todayPct}%` }}
            >
              Today
            </span>
          </div>
        </div>

        {/* Tooltip */}
        {hover && (
          <div
            role="tooltip"
            className="pointer-events-none absolute z-20 w-60 rounded-lg border border-line bg-white p-3 text-xs"
            style={{
              left: Math.max(0, Math.min(hover.x + 14, hover.width - 248)),
              top: hover.y + 14,
            }}
          >
            <div className="mb-2 flex items-center gap-2">
              <span className="h-0.5 w-4 rounded" style={{ background: HEX_CHAIN_COLORS[hover.row.chain] }} />
              <span className="font-semibold text-ink">{hover.row.label}</span>
              <span className="text-muted">{chainLabel(hover.row.chain)}</span>
            </div>
            <dl className="space-y-1">
              {hover.row.details.map((d) => (
                <div key={d.label} className="flex justify-between gap-3">
                  <dd className="font-semibold tabular-nums text-ink">{d.value}</dd>
                  <dt className="text-right text-muted">{d.label}</dt>
                </div>
              ))}
            </dl>
          </div>
        )}
      </div>
      <figcaption className="sr-only">Timeline of HEX stakes from lock day to end day. The full list is in the table below.</figcaption>
    </figure>
  );
}
