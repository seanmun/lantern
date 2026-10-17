'use client';

import { useMemo, useState } from 'react';
import { Asset } from '@/types';
import { chainLabel } from '@/config/chainDisplay';
import { groupHoldings } from '@/utils/holdings';
import { formatUSD } from '@/utils/prices';
import { Artwork, PaintingFrame } from './PaintingFrame';

interface OverviewProps {
  assets: Asset[];
  isLoading: boolean;
}

// Categorical slots 1-4 in fixed order (validated palette), neutral gray for "Other"
const ALLOCATION_COLORS = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100'];
const OTHER_COLOR = '#a8a29e';
const TOP_N = 4;
const MAX_ARTWORKS = 24;

const isTextInscription = (a: Asset) => /^text\/plain|json/i.test(a.contentType ?? '');
const pct = (v: number) => `${v >= 10 ? v.toFixed(0) : v.toFixed(1)}%`;

/** Pieces worth hanging: has an image, not a BRC-20 text record, best floors first. */
function pickArtworks(assets: Asset[]): Artwork[] {
  const floors = new Map<string, number>();
  for (const c of assets.filter((a) => a.type === 'collection')) {
    const key = c.contractAddress ? `c:${c.contractAddress.toLowerCase()}` : `n:${c.collectionName}`;
    const count = Number(c.balanceFormatted) || 1;
    if (c.valueUSD !== undefined) floors.set(key, Math.max(floors.get(key) ?? 0, c.valueUSD / count));
  }
  const keyOf = (a: Asset) => (a.contractAddress ? `c:${a.contractAddress.toLowerCase()}` : `n:${a.collectionName}`);

  return assets
    .filter((a) => (a.type === 'nft' || a.type === 'ordinal') && a.imageUrl && !isTextInscription(a))
    .map((a) => ({ a, floor: floors.get(keyOf(a)) ?? 0 }))
    .sort((x, y) => y.floor - x.floor)
    .slice(0, MAX_ARTWORKS)
    .map(({ a, floor }) => {
      // "Inscription 1a2b…" says nothing on a plaque; lead with the collection instead
      const generic = /^Inscription\b/.test(a.name) && a.collectionName && a.collectionName !== 'Bitcoin Ordinals';
      return {
      id: a.id,
      title: generic ? a.collectionName! : a.name,
      subtitle: (generic ? [a.name, chainLabel(a.chain)] : [a.collectionName, chainLabel(a.chain)]).filter(Boolean).join(' · '),
      detail: floor > 0 ? `Floor ${formatUSD(floor)}` : undefined,
      imageUrl: a.imageUrl!,
      live: a.type === 'ordinal' && /html|svg|javascript/i.test(a.contentType ?? ''),
      pixelated: a.type === 'ordinal',
      };
    });
}

/**
 * Top-of-page summary: the framed collectibles on the left; net worth, 24h
 * change, headline stats, allocation and chain split on the right.
 */
export function Overview({ assets, isLoading }: OverviewProps) {
  const [hoverSlice, setHoverSlice] = useState<number | null>(null);
  const artworks = useMemo(() => pickArtworks(assets), [assets]);
  const holdings = useMemo(() => groupHoldings(assets), [assets]);

  const total = assets.reduce((s, a) => s + (a.valueUSD ?? 0), 0);
  const collectibles = assets.filter((a) => a.type === 'collection').reduce((s, a) => s + (a.valueUSD ?? 0), 0);

  // 24h change from assets whose price source reports it
  let delta = 0;
  let previous = 0;
  let covered = 0;
  for (const a of assets) {
    if (a.valueUSD === undefined || a.change24hPct === undefined || a.change24hPct <= -100) continue;
    const before = a.valueUSD / (1 + a.change24hPct / 100);
    delta += a.valueUSD - before;
    previous += before;
    covered += a.valueUSD;
  }
  const changePct = previous > 0 ? (delta / previous) * 100 : null;
  const coverage = total > 0 ? covered / total : 0;

  const priced = holdings.filter((h) => (h.valueUSD ?? 0) > 0);
  const top = priced.slice(0, TOP_N);
  const otherValue = priced.slice(TOP_N).reduce((s, h) => s + (h.valueUSD ?? 0), 0);
  const slices = [
    ...top.map((h, i) => ({ label: h.symbol, name: h.name, value: h.valueUSD ?? 0, color: ALLOCATION_COLORS[i] })),
    ...(otherValue > 0 ? [{ label: 'Other', name: `${priced.length - TOP_N} more assets`, value: otherValue, color: OTHER_COLOR }] : []),
  ];

  const byChain = Object.entries(
    assets.reduce<Record<string, number>>((acc, a) => {
      if (a.valueUSD) acc[a.chain] = (acc[a.chain] ?? 0) + a.valueUSD;
      return acc;
    }, {})
  ).sort((a, b) => b[1] - a[1]);
  const maxChain = byChain[0]?.[1] ?? 0;

  const hex = holdings.find((h) => h.kind === 'hex');
  const largest = priced[0];

  return (
    <section className="grid gap-6 overflow-hidden rounded-2xl border border-white/20 bg-white/70 p-4 shadow-xl backdrop-blur-sm sm:p-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
      <PaintingFrame artworks={artworks} />

      <div className="flex min-w-0 flex-col gap-6 py-2">
        {/* Net worth */}
        <div>
          <div className="text-xs font-medium uppercase tracking-wide text-gray-500">Net worth</div>
          <div className="mt-1 flex flex-wrap items-baseline gap-x-4 gap-y-1">
            <span className="text-4xl font-bold tabular-nums text-gray-900 sm:text-5xl">{formatUSD(total)}</span>
            {changePct !== null && (
              <span className={`text-lg font-semibold tabular-nums ${delta >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                {delta >= 0 ? '▲' : '▼'} {formatUSD(Math.abs(delta))} ({delta >= 0 ? '+' : '−'}{pct(Math.abs(changePct))})
                <span className="ml-1 text-sm font-normal text-gray-500">24h</span>
              </span>
            )}
          </div>
          <div className="mt-1 text-xs text-gray-500">
            {isLoading ? 'Updating…' : collectibles > 0 ? `incl. ${formatUSD(collectibles)} collectibles at floor value` : ' '}
            {changePct !== null && coverage < 0.95 && ` · 24h change covers ${pct(coverage * 100)} of value`}
          </div>
        </div>

        {/* Headline stats */}
        <dl className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          <Tile label="HEX" value={hex ? `${(hex.balance / 1e6).toLocaleString('en-US', { maximumFractionDigits: 1 })}M` : '—'} sub={hex?.valueUSD !== undefined ? formatUSD(hex.valueUSD) : 'liquid + staked + pools'} />
          <Tile label="Collectibles" value={collectibles > 0 ? formatUSD(collectibles) : '—'} sub={`${artworks.length ? `${assets.filter((a) => a.type === 'nft' || a.type === 'ordinal').length} items` : 'none yet'}`} />
          <Tile label="Positions" value={String(priced.length)} sub={`${byChain.length} chain${byChain.length === 1 ? '' : 's'}`} />
          <Tile label="Largest" value={largest?.symbol ?? '—'} sub={largest && total > 0 ? `${pct(((largest.valueUSD ?? 0) / total) * 100)} of portfolio` : undefined} />
        </dl>

        {/* Allocation: part-to-whole stacked bar, legend doubles as labels */}
        {slices.length > 0 && total > 0 && (
          <div>
            <div className="mb-2 text-sm font-medium text-gray-800">Allocation</div>
            <div className="relative flex h-4 w-full gap-[2px]" role="img" aria-label={`Allocation: ${slices.map((s) => `${s.label} ${pct((s.value / total) * 100)}`).join(', ')}`}>
              {slices.map((s, i) => (
                <div
                  key={s.label}
                  className={`h-full transition-opacity first:rounded-l-[4px] last:rounded-r-[4px] ${hoverSlice !== null && hoverSlice !== i ? 'opacity-50' : ''}`}
                  style={{ width: `${(s.value / total) * 100}%`, minWidth: 3, background: s.color }}
                  onPointerEnter={() => setHoverSlice(i)}
                  onPointerLeave={() => setHoverSlice(null)}
                />
              ))}
              {hoverSlice !== null && slices[hoverSlice] && (
                <div role="tooltip" className="pointer-events-none absolute -top-14 left-0 z-10 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs shadow-lg">
                  <span className="font-semibold tabular-nums text-gray-900">{formatUSD(slices[hoverSlice].value)}</span>
                  <span className="ml-2 text-gray-500">{slices[hoverSlice].label} · {pct((slices[hoverSlice].value / total) * 100)}</span>
                </div>
              )}
            </div>
            <ul className="mt-3 grid gap-x-6 gap-y-1.5 text-sm sm:grid-cols-2">
              {slices.map((s, i) => (
                <li key={s.label} className="flex items-center gap-2" onPointerEnter={() => setHoverSlice(i)} onPointerLeave={() => setHoverSlice(null)}>
                  <span className="h-2.5 w-2.5 shrink-0 rounded-[3px]" style={{ background: s.color }} />
                  <span className="min-w-0 flex-1 truncate text-gray-800">
                    {s.label} <span className="text-gray-500">{s.name !== s.label && s.name.length <= 18 ? s.name : ''}</span>
                  </span>
                  <span className="tabular-nums text-gray-600">{pct((s.value / total) * 100)}</span>
                  <span className="w-28 text-right font-medium tabular-nums text-gray-900">{formatUSD(s.value)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* By chain: ranked bars in one hue */}
        {byChain.length > 1 && (
          <div>
            <div className="mb-2 text-sm font-medium text-gray-800">By chain</div>
            <ul className="space-y-1.5 text-sm">
              {byChain.map(([chain, value]) => (
                <li key={chain} className="grid grid-cols-[7.5rem_1fr_auto] items-center gap-3">
                  <span className="truncate text-gray-700">{chainLabel(chain)}</span>
                  <span className="h-2 overflow-hidden rounded-full bg-gray-200">
                    <span className="block h-full rounded-full bg-purple-600" style={{ width: `${Math.max(1, (value / maxChain) * 100)}%` }} />
                  </span>
                  <span className="w-28 text-right tabular-nums text-gray-900">{formatUSD(value)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </section>
  );
}

function Tile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="min-w-0 rounded-xl bg-white/70 p-3">
      <dt className="text-[11px] uppercase tracking-wide text-gray-500">{label}</dt>
      <dd className="mt-0.5 truncate text-lg font-bold tabular-nums text-gray-900">{value}</dd>
      {sub && <dd className="truncate text-xs text-gray-500">{sub}</dd>}
    </div>
  );
}
