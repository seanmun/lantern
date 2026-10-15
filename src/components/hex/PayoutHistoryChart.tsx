'use client';

import { PointerEvent, useEffect, useMemo, useRef, useState } from 'react';
import { hexDayToDate } from '@/config/hex';
import { movingAverage } from '@/utils/hexMath';

interface PayoutHistoryChartProps {
  series: number[];   // daily payout per T-Share, index = HEX day
  color: string;
  assumption: number; // the estimator's payout assumption, drawn as a reference line
}

type Range = '1y' | '3y' | 'all';
const RANGE_DAYS: Record<Range, number> = { '1y': 365, '3y': 1096, all: Infinity };
const HEIGHT = 200;
const M = { top: 12, right: 12, bottom: 24, left: 44 };
const SMOOTHING_DAYS = 7;

const fmtDate = (day: number) =>
  hexDayToDate(day).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' });

function niceTicks(max: number, count = 4): number[] {
  const raw = max / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw;
  return Array.from({ length: Math.floor(max / step) + 1 }, (_, i) => i * step);
}

/**
 * Daily payout per T-Share (7-day average) with a crosshair tooltip and the
 * estimator's assumption as a dashed reference line.
 */
export function PayoutHistoryChart({ series, color, assumption }: PayoutHistoryChartProps) {
  const [range, setRange] = useState<Range>('3y');
  const [width, setWidth] = useState(0);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const smoothed = useMemo(() => movingAverage(series, SMOOTHING_DAYS), [series]);
  const startDay = Math.max(1, series.length - RANGE_DAYS[range]);
  const days = smoothed.slice(startDay);

  const plotW = Math.max(0, width - M.left - M.right);
  const plotH = HEIGHT - M.top - M.bottom;
  const yMax = Math.max(assumption, ...days) * 1.1 || 1;
  const yTicks = niceTicks(yMax);
  const x = (i: number) => M.left + (days.length > 1 ? (i / (days.length - 1)) * plotW : 0);
  const y = (v: number) => M.top + plotH - (v / yMax) * plotH;

  const line = days.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join('');
  const area = days.length ? `${line}L${x(days.length - 1).toFixed(1)},${y(0)}L${x(0).toFixed(1)},${y(0)}Z` : '';

  // Year ticks, thinned to keep labels >= 56px apart
  const firstYear = hexDayToDate(startDay).getUTCFullYear() + 1;
  const lastYear = hexDayToDate(series.length - 1).getUTCFullYear();
  const pxPerYear = days.length > 1 ? (plotW * 365.25) / days.length : plotW;
  const yearStep = [1, 2, 5].find((s) => s * pxPerYear >= 56) ?? 5;
  const xTicks = [];
  for (let year = firstYear; year <= lastYear; year++) {
    if (year % yearStep !== 0 && yearStep > 1) continue;
    const day = Math.round((Date.UTC(year, 0, 1) - Date.UTC(2019, 11, 3)) / 86_400_000);
    if (day >= startDay) xTicks.push({ i: day - startDay, label: String(year) });
  }

  const onMove = (event: PointerEvent<SVGRectElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (event.clientX - box.left) / box.width));
    setHoverIndex(Math.round(ratio * (days.length - 1)));
  };

  const hoverDay = hoverIndex !== null ? startDay + hoverIndex : null;

  return (
    <figure className="m-0">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <figcaption className="text-sm font-medium text-gray-800">Daily payout per T-Share ({SMOOTHING_DAYS}-day avg)</figcaption>
        <div className="flex rounded-lg bg-gray-100 p-0.5 text-xs" role="group" aria-label="History range">
          {(Object.keys(RANGE_DAYS) as Range[]).map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              aria-pressed={range === r}
              className={`rounded-md px-2.5 py-1 font-medium ${range === r ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-800'}`}
            >
              {r === 'all' ? 'All' : r.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      <div ref={wrapRef} className="relative" onPointerLeave={() => setHoverIndex(null)}>
        {width > 0 && days.length > 1 && (
          <svg width={width} height={HEIGHT} role="img" aria-label={`Payout per T-Share, ${fmtDate(startDay)} to ${fmtDate(series.length - 1)}`}>
            {yTicks.map((t) => (
              <g key={t}>
                <line x1={M.left} x2={width - M.right} y1={y(t)} y2={y(t)} stroke="#e5e7eb" strokeWidth={1} />
                <text x={M.left - 6} y={y(t)} dy="0.32em" textAnchor="end" className="fill-gray-500 text-[10px] tabular-nums">
                  {t.toLocaleString('en-US', { maximumFractionDigits: 2 })}
                </text>
              </g>
            ))}
            {xTicks.map((t) => (
              <text key={t.label} x={x(t.i)} y={HEIGHT - 6} textAnchor="middle" className="fill-gray-500 text-[10px] tabular-nums">
                {t.label}
              </text>
            ))}

            <path d={area} fill={color} fillOpacity={0.1} />
            <path d={line} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />

            {/* The estimator's assumption */}
            <line x1={M.left} x2={width - M.right} y1={y(assumption)} y2={y(assumption)} stroke="#111827" strokeWidth={1} strokeDasharray="4 3" />
            <text x={width - M.right} y={y(assumption) - 5} textAnchor="end" className="fill-gray-900 text-[10px] font-semibold">
              your assumption {assumption.toFixed(3)}
            </text>

            {hoverIndex !== null && (
              <>
                <line x1={x(hoverIndex)} x2={x(hoverIndex)} y1={M.top} y2={M.top + plotH} stroke="#9ca3af" strokeWidth={1} />
                <circle cx={x(hoverIndex)} cy={y(days[hoverIndex])} r={4} fill={color} stroke="#fcfcfb" strokeWidth={2} />
              </>
            )}

            <rect
              x={M.left}
              y={M.top}
              width={plotW}
              height={plotH}
              fill="transparent"
              onPointerMove={onMove}
            />
          </svg>
        )}

        {hoverIndex !== null && hoverDay !== null && (
          <div
            role="tooltip"
            className="pointer-events-none absolute top-2 z-10 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs shadow-lg"
            style={{ left: Math.min(x(hoverIndex) + 10, width - 170) }}
          >
            <div className="text-gray-500">{fmtDate(hoverDay)} · day {hoverDay.toLocaleString()}</div>
            <div className="mt-1 flex items-center gap-2">
              <span className="h-0.5 w-3 rounded" style={{ background: color }} />
              <span className="font-semibold tabular-nums text-gray-900">{days[hoverIndex].toFixed(3)} HEX</span>
              <span className="text-gray-500">7-day avg</span>
            </div>
            <div className="mt-0.5 pl-5 tabular-nums text-gray-500">{series[hoverDay]?.toFixed(3)} that day</div>
          </div>
        )}
      </div>
    </figure>
  );
}
