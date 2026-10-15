'use client';

import { PointerEvent, useEffect, useRef, useState } from 'react';
import { hexDayToDate } from '@/config/hex';

export interface LineSeries {
  key: string;
  label: string;
  color: string;
  points: { day: number; value: number }[]; // sorted by day
}

interface LineChartProps {
  title: string;
  series: LineSeries[];
  formatValue: (value: number) => string;
  formatAxis?: (value: number) => string; // defaults to formatValue
  reference?: { value: number; label: string };
  defaultRange?: Range;
  note?: string;
}

type Range = '1y' | '3y' | 'all';
const RANGE_DAYS: Record<Range, number> = { '1y': 365, '3y': 1096, all: Infinity };
const HEIGHT = 200;
const M = { top: 12, right: 12, bottom: 24, left: 48 };
const MAX_GAP_DAYS = 90; // longer gaps between points are drawn as breaks, not interpolated

const fmtDate = (day: number) =>
  hexDayToDate(day).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' });

function niceTicks(max: number, count = 4): number[] {
  const raw = max / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw;
  return Array.from({ length: Math.floor(max / step) + 1 }, (_, i) => i * step);
}

/** Last point at or before `day` (series are step-like between samples); none inside a gap. */
function valueAt(points: LineSeries['points'], day: number): number | undefined {
  let lo = 0;
  let hi = points.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (points[mid].day <= day) {
      found = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  if (found < 0) return undefined;
  const next = points[found + 1];
  if (next && next.day - points[found].day > MAX_GAP_DAYS) return undefined;
  return points[found].value;
}

/**
 * Time-series line chart over HEX days: 2px lines with a 10% wash for a single
 * series, a legend for 2+, a crosshair tooltip listing every series, and an
 * optional dashed reference line.
 */
export function LineChart({ title, series, formatValue, formatAxis = formatValue, reference, defaultRange = '3y', note }: LineChartProps) {
  const [range, setRange] = useState<Range>(defaultRange);
  const [width, setWidth] = useState(0);
  const [hoverDay, setHoverDay] = useState<number | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const allDays = series.flatMap((s) => s.points.map((p) => p.day));
  if (allDays.length === 0) return null;
  const endDay = Math.max(...allDays);
  const startDay = Math.max(Math.min(...allDays), endDay - RANGE_DAYS[range]);

  const visible = series.map((s) => ({
    ...s,
    points: s.points.filter((p) => p.day >= startDay),
  }));
  const plotW = Math.max(0, width - M.left - M.right);
  const plotH = HEIGHT - M.top - M.bottom;
  const yMax = Math.max(reference?.value ?? 0, ...visible.flatMap((s) => s.points.map((p) => p.value))) * 1.1 || 1;
  const yTicks = niceTicks(yMax);
  const x = (day: number) => M.left + ((day - startDay) / Math.max(1, endDay - startDay)) * plotW;
  const y = (v: number) => M.top + plotH - (v / yMax) * plotH;

  const pxPerYear = (plotW * 365.25) / Math.max(1, endDay - startDay);
  const yearStep = [1, 2, 5].find((s) => s * pxPerYear >= 56) ?? 5;
  const xTicks: { day: number; label: string }[] = [];
  for (let year = hexDayToDate(startDay).getUTCFullYear() + 1; year <= hexDayToDate(endDay).getUTCFullYear(); year++) {
    if (yearStep > 1 && year % yearStep !== 0) continue;
    xTicks.push({ day: Math.round((Date.UTC(year, 0, 1) - Date.UTC(2019, 11, 3)) / 86_400_000), label: String(year) });
  }

  const onMove = (event: PointerEvent<SVGRectElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (event.clientX - box.left) / box.width));
    setHoverDay(Math.round(startDay + ratio * (endDay - startDay)));
  };

  const single = visible.length === 1;

  return (
    <figure className="m-0">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <figcaption className="text-sm font-medium text-gray-800">{title}</figcaption>
        <div className="flex flex-wrap items-center gap-3">
          {!single && visible.map((s) => (
            <span key={s.key} className="flex items-center gap-1.5 text-xs text-gray-600">
              <span className="h-0.5 w-4 rounded" style={{ background: s.color }} />
              {s.label}
            </span>
          ))}
          <div className="flex rounded-lg bg-gray-100 p-0.5 text-xs" role="group" aria-label={`${title} range`}>
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
      </div>

      <div ref={wrapRef} className="relative" onPointerLeave={() => setHoverDay(null)}>
        {width > 0 && (
          <svg width={width} height={HEIGHT} role="img" aria-label={`${title}, ${fmtDate(startDay)} to ${fmtDate(endDay)}`}>
            {yTicks.map((t) => (
              <g key={t}>
                <line x1={M.left} x2={width - M.right} y1={y(t)} y2={y(t)} stroke="#e5e7eb" strokeWidth={1} />
                <text x={M.left - 6} y={y(t)} dy="0.32em" textAnchor="end" className="fill-gray-500 text-[10px] tabular-nums">
                  {formatAxis(t)}
                </text>
              </g>
            ))}
            {xTicks.map((t) => (
              <text key={t.label} x={x(t.day)} y={HEIGHT - 6} textAnchor="middle" className="fill-gray-500 text-[10px] tabular-nums">
                {t.label}
              </text>
            ))}

            {visible.map((s) => {
              if (s.points.length === 0) return null;
              const d = s.points
                .map((p, i) => {
                  const breaks = i === 0 || p.day - s.points[i - 1].day > MAX_GAP_DAYS;
                  return `${breaks ? 'M' : 'L'}${x(p.day).toFixed(1)},${y(p.value).toFixed(1)}`;
                })
                .join('');
              const last = s.points[s.points.length - 1];
              const hasGap = s.points.some((p, i) => i > 0 && p.day - s.points[i - 1].day > MAX_GAP_DAYS);
              return (
                <g key={s.key}>
                  {single && !hasGap && <path d={`${d}L${x(last.day).toFixed(1)},${y(0)}L${x(s.points[0].day).toFixed(1)},${y(0)}Z`} fill={s.color} fillOpacity={0.1} />}
                  <path d={d} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
                  {/* End marker: the latest value, visible even when isolated after a gap */}
                  <circle cx={x(last.day)} cy={y(last.value)} r={4} fill={s.color} stroke="#fcfcfb" strokeWidth={2} />
                </g>
              );
            })}

            {reference && (
              <>
                <line x1={M.left} x2={width - M.right} y1={y(reference.value)} y2={y(reference.value)} stroke="#111827" strokeWidth={1} strokeDasharray="4 3" />
                <text x={width - M.right} y={y(reference.value) - 5} textAnchor="end" className="fill-gray-900 text-[10px] font-semibold">
                  {reference.label}
                </text>
              </>
            )}

            {hoverDay !== null && (
              <>
                <line x1={x(hoverDay)} x2={x(hoverDay)} y1={M.top} y2={M.top + plotH} stroke="#9ca3af" strokeWidth={1} />
                {visible.map((s) => {
                  const v = valueAt(s.points, hoverDay);
                  return v === undefined ? null : (
                    <circle key={s.key} cx={x(hoverDay)} cy={y(v)} r={4} fill={s.color} stroke="#fcfcfb" strokeWidth={2} />
                  );
                })}
              </>
            )}

            <rect x={M.left} y={M.top} width={plotW} height={plotH} fill="transparent" onPointerMove={onMove} />
          </svg>
        )}

        {hoverDay !== null && (
          <div
            role="tooltip"
            className="pointer-events-none absolute top-2 z-10 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs shadow-lg"
            style={{ left: Math.max(0, Math.min(x(hoverDay) + 10, width - 190)) }}
          >
            <div className="text-gray-500">{fmtDate(hoverDay)} · day {hoverDay.toLocaleString()}</div>
            {visible.map((s) => {
              const v = valueAt(s.points, hoverDay);
              return (
                <div key={s.key} className="mt-1 flex items-center gap-2">
                  <span className="h-0.5 w-3 rounded" style={{ background: s.color }} />
                  <span className="font-semibold tabular-nums text-gray-900">{v === undefined ? '—' : formatValue(v)}</span>
                  <span className="text-gray-500">{s.label}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>
      {note && <p className="mt-1 text-xs text-gray-500">{note}</p>}
    </figure>
  );
}
