'use client';

import Link from 'next/link';
import { PointerEvent, useMemo, useRef, useState } from 'react';
import { Asset } from '@/types';
import { chainLabel } from '@/config/chainDisplay';
import { Holding, groupHoldings } from '@/utils/holdings';
import { formatUSD } from '@/utils/prices';
import { morningBrief } from '@/utils/brief';
import { dayChange } from '@/utils/dayChange';
import { HistoryRange, PortfolioPoint, priceKeyOf, usePortfolioHistory } from '@/hooks/usePortfolioHistory';
import { artByFloor } from '@/hooks/useFeaturedArt';
import { Artwork, PaintingFrame } from '@/components/overview/PaintingFrame';
import { TokenLogo } from '@/components/ui/TokenLogo';

interface DashboardProps {
  assets: Asset[];
  isLoading: boolean;
  isFeatured: (a: Asset) => boolean;
  autoHiddenCount: number;
}

const RANGES: { key: HistoryRange; label: string; since: string; days: number }[] = [
  { key: '1D', label: '1D', since: 'Past day', days: 1 },
  { key: '1W', label: '1W', since: 'Past week', days: 7 },
  { key: '1M', label: '1M', since: 'Past month', days: 30 },
  { key: '1Y', label: '1Y', since: 'Past year', days: 365 },
  { key: 'ALL', label: 'All', since: 'All time', days: Infinity },
];
const UP = 'var(--color-up)';
const DOWN = 'var(--color-down)';
const RAIL_ROWS = 8;

const signed = (v: number) => `${v >= 0 ? '+' : '−'}${formatUSD(Math.abs(v))}`;
const pct = (v: number) => `${v >= 0 ? '+' : '−'}${Math.abs(v) >= 10 ? Math.abs(v).toFixed(0) : Math.abs(v).toFixed(2)}%`;

/** Featured pieces for the frame, best floors first. */
function pickArtworks(assets: Asset[], isFeatured: (a: Asset) => boolean): Artwork[] {
  return artByFloor(assets)
    .filter(({ asset }) => isFeatured(asset))
    .map(({ asset: a, floor }) => {
      // "Inscription 1a2b…" says nothing on a plaque; lead with the collection instead
      const generic = /^Inscription\b/.test(a.name) && a.collectionName && a.collectionName !== 'Bitcoin Ordinals';
      return {
        id: a.id,
        title: generic ? a.collectionName! : a.name,
        subtitle: (generic ? [a.name, chainLabel(a.chain)] : [a.collectionName, chainLabel(a.chain)]).filter(Boolean).join(' · '),
        detail: floor > 0 ? `Floor ${formatUSD(floor)}` : undefined,
        imageUrl: a.imageUrl!,
        live: a.type === 'ordinal' && /html|svg|javascript|text\/plain|json/i.test(a.contentType ?? ''),
        pixelated: a.type === 'ordinal',
      };
    });
}


/**
 * The dashboard: one number, one chart, a short brief, what's earning, and
 * the assets that matter, in that order.
 */
export function Dashboard({ assets, isLoading, isFeatured, autoHiddenCount }: DashboardProps) {
  const [range, setRange] = useState<HistoryRange>('1M');
  const [hover, setHover] = useState<number | null>(null);
  const holdings = useMemo(() => groupHoldings(assets), [assets]);
  const history = usePortfolioHistory(assets, range);
  const artworks = useMemo(() => pickArtworks(assets, isFeatured), [assets, isFeatured]);

  const total = assets.reduce((s, a) => s + (a.valueUSD ?? 0), 0);
  const day = dayChange(assets);
  const brief = useMemo(
    () => morningBrief({ assets, holdings, delta24h: day?.delta ?? null, changePct24h: day?.pct ?? null, autoHiddenCount }),
    [assets, holdings, day?.delta, day?.pct, autoHiddenCount]
  );

  // Headline: the hovered point, else now vs the start of the range (1D uses the 24h change)
  const points = history.points;
  const first = points[0]?.value;
  const shown = hover !== null && points[hover] ? points[hover] : null;
  const value = shown ? shown.value : total;
  const change = range === '1D' && day && !shown
    ? { delta: day.delta, pct: day.pct }
    : first ? { delta: value - first, pct: ((value - first) / first) * 100 } : null;
  const rising = (change?.delta ?? 0) >= 0;
  const rangeInfo = RANGES.find((r) => r.key === range)!;
  // Free price history reaches back about six months: say where the line starts when it's short of the range
  const span = points.length > 1 ? (points[points.length - 1].t - points[0].t) / 86_400_000 : 0;
  const sinceLabel = points.length > 1 && span < rangeInfo.days * 0.9
    ? `Since ${new Date(points[0].t).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
    : rangeInfo.since;

  return (
    <div className="flex flex-wrap gap-10">
      <div className="flex min-w-0 flex-[999_1_560px] flex-col gap-9">
        <section aria-label="Portfolio value">
          {/* Hero: the number and the brief, with the framed collectibles beside them */}
          <div className="flex flex-wrap items-start gap-x-8 gap-y-6">
          <div className="min-w-0 flex-[1_1_340px]">
          <div className="text-5xl font-extrabold tracking-tight tabular-nums text-ink sm:text-7xl">{formatUSD(value)}</div>
          <div className="mt-2 flex flex-wrap items-baseline gap-x-2 text-base font-semibold sm:text-lg">
            {change ? (
              <span style={{ color: rising ? UP : DOWN }} className="tabular-nums">{signed(change.delta)} ({pct(change.pct)})</span>
            ) : (
              <span className="text-muted">{isLoading ? 'Updating…' : ' '}</span>
            )}
            <span className="font-medium text-muted">
              {shown ? new Date(shown.t).toLocaleString('en-US', range === '1D' || range === '1W' ? { month: 'short', day: 'numeric', hour: 'numeric' } : { month: 'short', day: 'numeric', year: 'numeric' }) : sinceLabel}
            </span>
          </div>

          {brief.length > 0 && (
            <ul className="mt-5 max-w-2xl space-y-1.5 text-[17px] leading-snug text-ink">
              {brief.map((line) => (
                <li key={line} className="flex gap-2.5">
                  <span aria-hidden="true" className="mt-[9px] h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
                  {line}
                </li>
              ))}
            </ul>
          )}
          </div>

          {artworks.length > 0 && (
            <figure className="m-0 w-full shrink-0 sm:w-[340px] xl:w-[380px]" aria-label="On the wall">
              <PaintingFrame artworks={artworks} />
              <figcaption className="mt-2 text-right text-[13px]">
                <Link href="/collectibles" className="font-semibold text-accent hover:underline">Choose what hangs here</Link>
              </figcaption>
            </figure>
          )}
          </div>

          <ValueChart points={points} color={rising ? UP : DOWN} loading={history.loading} hover={hover} onHover={setHover} />

          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-4">
            <div role="group" aria-label="Chart range" className="flex flex-wrap gap-1.5">
              {RANGES.map((r) => (
                <button
                  key={r.key}
                  type="button"
                  onClick={() => setRange(r.key)}
                  aria-pressed={range === r.key}
                  className={`h-10 rounded-full px-4 text-sm font-bold transition-colors ${range === r.key ? 'bg-accent text-on-accent' : 'bg-soft text-ink hover:bg-line'}`}
                >
                  {r.label}
                </button>
              ))}
            </div>
            {points.length > 0 && history.coverage < 0.98 && (
              <span className="text-xs text-muted">Today&apos;s holdings at past prices · {Math.round(history.coverage * 100)}% of value tracked</span>
            )}
            {points.length > 0 && history.coverage >= 0.98 && <span className="text-xs text-muted">Today&apos;s holdings at past prices</span>}
          </div>
        </section>

        <Earning assets={assets} />

      </div>

      <AssetRail holdings={holdings} total={total} perKey={history.perKey} />
    </div>
  );
}

/** The hero line chart: hover or drag to read any point (it drives the headline). */
function ValueChart({ points, color, loading, hover, onHover }: {
  points: PortfolioPoint[]; color: string; loading: boolean; hover: number | null; onHover: (i: number | null) => void;
}) {
  const ref = useRef<SVGSVGElement>(null);
  const W = 800;
  const H = 280;
  const geometry = useMemo(() => {
    if (points.length < 2) return null;
    const values = points.map((p) => p.value);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const pad = (max - min) * 0.1 || max * 0.01 || 1;
    const t0 = points[0].t;
    const t1 = points[points.length - 1].t;
    const x = (t: number) => ((t - t0) / Math.max(1, t1 - t0)) * W;
    const y = (v: number) => H - 8 - ((v - (min - pad)) / (max + pad - (min - pad))) * (H - 16);
    return { x, y, d: `M${points.map((p) => `${x(p.t).toFixed(1)},${y(p.value).toFixed(1)}`).join('L')}`, baseY: y(points[0].value) };
  }, [points]);

  const move = (e: PointerEvent<SVGSVGElement>) => {
    if (!geometry || !ref.current) return;
    const box = ref.current.getBoundingClientRect();
    const tx = ((e.clientX - box.left) / box.width) * W;
    let best = 0;
    for (let i = 1; i < points.length; i++) if (Math.abs(geometry.x(points[i].t) - tx) < Math.abs(geometry.x(points[best].t) - tx)) best = i;
    onHover(best);
  };

  if (!geometry) {
    return (
      <div className="mt-6 flex h-[280px] items-center justify-center rounded-2xl bg-soft text-sm text-muted">
        {loading ? 'Loading price history…' : 'No price history for these holdings yet'}
      </div>
    );
  }
  const hp = hover !== null ? points[hover] : null;
  return (
    <svg
      ref={ref}
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      className="mt-6 block h-[220px] w-full touch-none sm:h-[280px]"
      role="img"
      aria-label={`Portfolio value from ${formatUSD(points[0].value)} to ${formatUSD(points[points.length - 1].value)}`}
      onPointerMove={move}
      onPointerDown={move}
      onPointerLeave={() => onHover(null)}
    >
      <line x1="0" x2={W} y1={geometry.baseY} y2={geometry.baseY} stroke="var(--color-line-strong)" strokeWidth="1.5" strokeDasharray="2 6" vectorEffect="non-scaling-stroke" />
      <path d={geometry.d} fill="none" stroke={color} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      {hp && (
        <>
          <line x1={geometry.x(hp.t)} x2={geometry.x(hp.t)} y1="0" y2={H} stroke="var(--color-muted)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
          <circle cx={geometry.x(hp.t)} cy={geometry.y(hp.value)} r="5" fill={color} stroke="var(--color-surface)" strokeWidth="2" vectorEffect="non-scaling-stroke" />
        </>
      )}
    </svg>
  );
}

/** "Earning while you sleep": HEX stakes, Maximus perps, Hedron & Icosa: only what's held. */
function Earning({ assets }: { assets: Asset[] }) {
  const stakes = assets.filter((a) => a.stake);
  const pools = assets.filter((a) => a.pool);
  const icosa = assets.filter((a) => a.icosa);
  const hdrn = stakes.reduce((s, a) => s + (a.stake!.hdrnMintable ?? 0), 0);
  if (!stakes.length && !pools.length && !icosa.length && !hdrn) return null;

  const sum = (xs: Asset[]) => xs.reduce((s, a) => s + (a.valueUSD ?? 0), 0);
  const active = stakes.filter((a) => a.stake!.status === 'active').sort((a, b) => a.stake!.daysRemaining - b.stake!.daysRemaining);
  const next = active[0]?.stake;
  const interest = stakes.reduce((s, a) => s + a.stake!.interestHex, 0);
  const hexFmt = (v: number) => (v >= 1e9 ? `${(v / 1e9).toFixed(2)}B` : v >= 1e6 ? `${(v / 1e6).toFixed(1)}M` : v.toLocaleString('en-US', { maximumFractionDigits: 0 }));

  return (
    <section aria-labelledby="earning-h">
      <h2 id="earning-h" className="mb-3 text-xl font-extrabold tracking-tight text-ink">Earning while you sleep</h2>
      <div className="grid gap-3.5 [grid-template-columns:repeat(auto-fit,minmax(min(100%,230px),1fr))]">
        {stakes.length > 0 && (
          <EarnCard
            href="/hex"
            title={`HEX stakes · ${stakes.length}`}
            value={formatUSD(sum(stakes))}
            gain={`+${hexFmt(interest)} HEX interest so far`}
            progress={next ? (1 - next.daysRemaining / Math.max(1, next.stakedDays)) * 100 : 100}
            note={next ? `Next ends in ${next.daysRemaining.toLocaleString()} days` : 'All stakes have matured'}
          />
        )}
        {pools.length > 0 && (
          <EarnCard
            href="/hex"
            title="Maximus perps"
            value={formatUSD(sum(pools))}
            gain={`${pools.length} pool position${pools.length === 1 ? '' : 's'}`}
            note="Redeem their HEX backing at cycle end"
          />
        )}
        {(icosa.length > 0 || hdrn > 0) && (
          <EarnCard
            href="/hex"
            title="Hedron & Icosa"
            value={icosa.length ? formatUSD(sum(icosa)) : '—'}
            gain={hdrn > 0 ? `${hexFmt(hdrn)} HDRN ready to mint` : `${icosa.filter((a) => a.icosa!.role === 'principal').length} Icosa stakes`}
            note={icosa.some((a) => a.icosa!.daysUntilMature > 0) ? 'Some stakes still in their minimum period' : 'Penalty-free now'}
          />
        )}
      </div>
    </section>
  );
}

function EarnCard({ href, title, value, gain, progress, note }: { href: string; title: string; value: string; gain: string; progress?: number; note: string }) {
  return (
    <Link href={href} className="block rounded-[20px] border border-line p-5 transition-colors hover:border-line-strong hover:bg-soft/40">
      <div className="text-sm font-semibold text-muted">{title}</div>
      <div className="mt-1.5 text-3xl font-extrabold tracking-tight tabular-nums text-ink">{value}</div>
      <div className="mt-0.5 text-sm font-semibold" style={{ color: UP }}>{gain}</div>
      {progress !== undefined && (
        <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-line" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress)} aria-label={`${title} progress`}>
          <div className="h-full rounded-full bg-accent" style={{ width: `${Math.max(2, Math.min(100, progress))}%` }} />
        </div>
      )}
      <div className="mt-2 text-[13px] text-muted">{note}</div>
    </Link>
  );
}

/** The assets that matter: logo, amount, sparkline, value and 24h move. */
function AssetRail({ holdings, total, perKey }: { holdings: Holding[]; total: number; perKey: Map<string, [number, number][]> }) {
  const rows = holdings.filter((h) => (h.valueUSD ?? 0) > 0).slice(0, RAIL_ROWS);
  // pHEX and eHEX (or any same-ticker pair) get their chain named
  const seen = new Map<string, number>();
  rows.forEach((h) => seen.set(h.symbol, (seen.get(h.symbol) ?? 0) + 1));
  const chains = new Set(holdings.flatMap((h) => h.chains)).size;
  return (
    <aside aria-labelledby="assets-h" className="min-w-0 flex-[1_1_320px]">
      <div className="rounded-3xl border border-line py-2">
        <div className="flex items-center justify-between px-5 py-3">
          <h2 id="assets-h" className="text-lg font-extrabold text-ink">Your assets</h2>
          <span className="text-[13px] text-muted">{chains} chain{chains === 1 ? '' : 's'}</span>
        </div>
        {total > 0 && <AllocationBar rows={rows} total={total} />}
        <ul>
          {rows.map((h, i) => <AssetRow key={h.key} h={h} color={slotColor(i)} perKey={perKey} showChain={(seen.get(h.symbol) ?? 0) > 1} />)}
        </ul>
        <Link href="/holdings" className="mx-5 mb-2 mt-1 flex h-11 items-center justify-center rounded-full bg-soft text-sm font-bold text-ink hover:bg-line">
          See all {holdings.length} holdings
        </Link>
      </div>
      <p className="mx-1 mt-3.5 text-[13px] leading-relaxed text-muted">Read-only. Your keys stay in your wallet; your addresses stay in this browser.</p>
    </aside>
  );
}

// Top four holdings get their own color; everything else is "Other"
const SLOTS = ['var(--color-cat-1)', 'var(--color-cat-2)', 'var(--color-cat-3)', 'var(--color-cat-4)'];
const OTHER = 'var(--color-cat-other)';
const slotColor = (i: number) => SLOTS[i] ?? OTHER;

function AllocationBar({ rows, total }: { rows: Holding[]; total: number }) {
  const [hover, setHover] = useState<number | null>(null);
  const top = rows.slice(0, SLOTS.length);
  const rest = total - top.reduce((s, h) => s + (h.valueUSD ?? 0), 0);
  const segments = [
    ...top.map((h, i) => ({ key: h.key, label: h.symbol, value: h.valueUSD ?? 0, color: SLOTS[i] })),
    ...(rest / total > 0.001 ? [{ key: 'other', label: 'Other', value: rest, color: OTHER }] : []),
  ];
  const share = (v: number) => `${((v / total) * 100).toFixed(v / total < 0.1 ? 1 : 0)}%`;
  const hovered = hover !== null ? segments[hover] : null;
  return (
    <div className="relative px-5 pb-3">
      <div
        className="flex h-2.5 gap-[2px]"
        role="img"
        aria-label={`Allocation: ${segments.map((g) => `${g.label} ${share(g.value)}`).join(', ')}`}
        onPointerLeave={() => setHover(null)}
      >
        {segments.map((g, i) => (
          <div
            key={g.key}
            className={`h-full transition-opacity first:rounded-l-full last:rounded-r-full ${hover !== null && hover !== i ? 'opacity-40' : ''}`}
            style={{ width: `${(g.value / total) * 100}%`, minWidth: 3, background: g.color }}
            onPointerEnter={() => setHover(i)}
          />
        ))}
      </div>
      {hovered && (
        <div role="tooltip" className="pointer-events-none absolute -top-9 left-5 z-10 rounded-lg border border-line bg-surface px-2.5 py-1 text-xs shadow-lg">
          <span className="font-bold text-ink">{hovered.label}</span>
          <span className="ml-2 tabular-nums text-muted">{share(hovered.value)} · {formatUSD(hovered.value)}</span>
        </div>
      )}
    </div>
  );
}

function AssetRow({ h, color, perKey, showChain }: { h: Holding; color: string; perKey: Map<string, [number, number][]>; showChain: boolean }) {
  // 24h move of the whole holding, from its parts
  let delta = 0;
  let before = 0;
  for (const p of h.parts) {
    const a = p.asset;
    if (a.valueUSD === undefined || a.change24hPct === undefined || a.change24hPct <= -100) continue;
    const b = a.valueUSD / (1 + a.change24hPct / 100);
    delta += a.valueUSD - b;
    before += b;
  }
  const change = before > 0 ? (delta / before) * 100 : null;
  const up = (change ?? 0) >= 0;

  // Sparkline: the price series of the holding's largest part
  const main = [...h.parts].sort((a, b) => (b.asset.valueUSD ?? 0) - (a.asset.valueUSD ?? 0))[0];
  const key = main ? priceKeyOf(main.asset)?.key : undefined;
  const series = key ? perKey.get(key) : undefined;
  const spark = series && series.length > 1 ? sparkPath(series.map(([, v]) => v)) : null;
  const qty = h.balance >= 1e12 ? `${(h.balance / 1e12).toFixed(2)}T` : h.balance >= 1e9 ? `${(h.balance / 1e9).toFixed(2)}B` : h.balance >= 1e6 ? `${(h.balance / 1e6).toFixed(2)}M`
    : h.balance.toLocaleString('en-US', { maximumFractionDigits: h.balance >= 100 ? 0 : 4 });
  const amount = h.kind === 'collectibles' ? `${h.balance} items` : `${qty} ${h.symbol}${showChain && h.chains.length === 1 ? ` · ${chainLabel(h.chains[0])}` : ''}`;

  return (
    <li className="border-t border-line">
      <Link href="/holdings" className="flex items-center gap-3 px-5 py-3.5 hover:bg-soft/50">
        {h.kind === 'collectibles'
          ? <span aria-hidden className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-soft text-xs font-bold text-muted">NFT</span>
          : <TokenLogo src={h.imageUrl} symbol={h.symbol} size={36} />}
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5 text-[15px] font-bold text-ink">
            {/* Matches this holding's slice of the allocation bar */}
            <span aria-hidden="true" className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: color }} />
            {h.symbol}
          </span>
          <span className="block truncate text-[13px] text-muted">{amount}</span>
        </span>
        {spark && (
          <svg width="48" height="24" viewBox="0 0 64 28" preserveAspectRatio="none" aria-hidden="true" className="shrink-0">
            <path d={spark} fill="none" stroke={series![series!.length - 1][1] >= series![0][1] ? UP : DOWN} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
          </svg>
        )}
        <span className="min-w-[88px] shrink-0 text-right">
          <span className="block text-[15px] font-bold tabular-nums text-ink">{formatUSD(h.valueUSD ?? 0)}</span>
          {change !== null && (
            <span
              className="mt-0.5 inline-block rounded-full px-2 py-0.5 text-xs font-bold tabular-nums"
              style={{ background: up ? 'var(--color-good-soft)' : 'var(--color-bad-soft)', color: up ? UP : DOWN }}
            >
              {up ? '+' : '−'}{Math.abs(change).toFixed(1)}%
            </span>
          )}
        </span>
      </Link>
    </li>
  );
}

function sparkPath(values: number[]): string {
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  return `M${values.map((v, i) => `${((i / (values.length - 1)) * 62 + 1).toFixed(1)},${(26 - ((v - lo) / (hi - lo || 1)) * 24).toFixed(1)}`).join('L')}`;
}
