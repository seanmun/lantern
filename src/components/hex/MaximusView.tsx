'use client';

import { Asset } from '@/types';
import { BRIDGED_MAXIMUS, MAXIMUS_POOLS, hexDayToDate } from '@/config/hex';
import { chainLabel } from '@/config/chainDisplay';
import { formatUSD } from '@/utils/prices';
import { HexStatsWithPrice } from '@/hooks/useHexStats';
import { PoolWithPrice, useMaximusPools } from '@/hooks/useMaximusPools';
import { HEX_CHAIN_COLORS } from './colors';

interface MaximusViewProps {
  assets: Asset[];
  hexStats: HexStatsWithPrice[];
}

const COLUMNS = ['pulsechain', 'ethereum'] as const;

const fmt = (v: number, digits = 0) =>
  v >= 1e9 ? `${(v / 1e9).toFixed(2)}B` : v >= 1e6 ? `${(v / 1e6).toFixed(2)}M` : v.toLocaleString('en-US', { maximumFractionDigits: digits });
const fmtDate = (day: number) => hexDayToDate(day).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });

interface PerpRow {
  pool: PoolWithPrice;
  owned: number;          // native pool tokens held
  bridged: number;        // eTOKENs on Pulsechain backed by this (Ethereum) pool
  marketUSD: number | null; // what the held tokens trade for (null: no market price)
  perTokenNow: number;    // HEX backing per token today (principal + interest)
  earnedPerToken: number; // HEX interest earned per token this cycle
  perTokenEnd: number;    // HEX backing per token at cycle end (projected)
  hexPrice: number | null;
}

function buildRows(chain: string, pools: PoolWithPrice[], assets: Asset[], hexPrice: number | null): PerpRow[] {
  const holdings = new Map<string, { amount: number; value: number | null }>();
  for (const a of assets) {
    if (a.type !== 'token' || !a.contractAddress) continue;
    const key = `${a.chain}:${a.contractAddress.toLowerCase()}`;
    const h = holdings.get(key) ?? { amount: 0, value: null };
    h.amount += Number(a.balanceFormatted);
    if (a.valueUSD !== undefined) h.value = (h.value ?? 0) + a.valueUSD;
    holdings.set(key, h);
  }
  const none = { amount: 0, value: null };

  return MAXIMUS_POOLS.map((meta) => pools.find((p) => p.chain === chain && p.symbol === meta.symbol))
    .filter((p): p is PoolWithPrice => !!p)
    .map((pool) => {
      const native = holdings.get(`${chain}:${pool.address.toLowerCase()}`) ?? none;
      const bridgedMeta = chain === 'ethereum' ? BRIDGED_MAXIMUS.find((b) => b.poolSymbol === pool.symbol) : undefined;
      const bridged = bridgedMeta ? holdings.get(`pulsechain:${bridgedMeta.address.toLowerCase()}`) ?? none : none;
      // Market value: priced holdings, else the pool token's market price, else unknown
      const nativeValue = native.value ?? (native.amount > 0 && pool.priceUSD !== null ? native.amount * pool.priceUSD : null);
      const known = [nativeValue, bridged.amount > 0 ? bridged.value : null].filter((v): v is number => v !== null);
      const marketUSD = known.length ? known.reduce((sum, v) => sum + v, 0) : null;
      return {
        pool,
        owned: native.amount,
        bridged: bridged.amount,
        marketUSD,
        perTokenNow: (pool.principalHex + pool.interestHex) / pool.supply,
        earnedPerToken: pool.interestHex / pool.supply,
        perTokenEnd: (pool.principalHex + pool.projectedInterestHex) / pool.supply,
        hexPrice,
      };
    });
}

/**
 * Maximus DAO perpetual pools: Pulsechain beside Ethereum. Per pool: what
 * you hold, HEX earned per token this cycle, backing now and projected at
 * cycle end, and your share of each in HEX and dollars.
 */
export function MaximusView({ assets, hexStats }: MaximusViewProps) {
  const pools = useMaximusPools();
  if (!pools) return <p className="text-sm text-gray-500">Loading Maximus pools…</p>;

  const columns = COLUMNS.map((chain) => {
    const hexPrice = hexStats.find((s) => s.chain === chain)?.hexPriceUSD ?? null;
    const rows = buildRows(chain, pools, assets, hexPrice);
    const held = rows.filter((r) => r.owned + r.bridged > 0);
    const sum = (f: (r: PerpRow) => number) => held.reduce((s, r) => s + f(r), 0);
    return {
      chain,
      hexPrice,
      rows,
      totals: {
        market: held.some((r) => r.marketUSD !== null) ? sum((r) => r.marketUSD ?? 0) : null,
        backingHex: sum((r) => (r.owned + r.bridged) * r.perTokenNow),
        earnedHex: sum((r) => (r.owned + r.bridged) * r.earnedPerToken),
        endHex: sum((r) => (r.owned + r.bridged) * r.perTokenEnd),
      },
    };
  });

  return (
    <div>
      <h3 className="mb-1 text-lg font-semibold text-gray-800">Maximus DAO perpetual pools</h3>
      <p className="mb-4 text-xs text-gray-500">
        Backing is each pool&apos;s staked HEX (principal + interest earned this cycle) divided by its token supply. Estimates at
        cycle end use the recent payout rate; dollar values use today&apos;s HEX price on each chain.
      </p>

      <div className="grid gap-6 lg:grid-cols-2">
        {columns.map((col) => {
          const usd = (hex: number) => (col.hexPrice !== null ? formatUSD(hex * col.hexPrice) : '—');
          return (
            <section key={col.chain} className="min-w-0 rounded-2xl bg-white/60 p-4 ring-1 ring-gray-200 sm:p-5">
              <header className="mb-4 flex flex-wrap items-baseline justify-between gap-2 border-b border-gray-100 pb-3">
                <h4 className="flex items-center gap-2 text-base font-bold text-gray-900">
                  <span className="h-3 w-3 rounded-full" style={{ background: HEX_CHAIN_COLORS[col.chain] }} />
                  {chainLabel(col.chain)}
                </h4>
                <dl className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
                  <div><dt className="inline text-gray-500">Market value </dt><dd className="inline font-semibold tabular-nums text-gray-900">{col.totals.market !== null ? formatUSD(col.totals.market) : '—'}</dd></div>
                  <div><dt className="inline text-gray-500">Backing </dt><dd className="inline font-semibold tabular-nums text-gray-900">{fmt(col.totals.backingHex)} HEX · {usd(col.totals.backingHex)}</dd></div>
                  <div><dt className="inline text-gray-500">Est. at cycle ends </dt><dd className="inline font-semibold tabular-nums text-gray-900">{fmt(col.totals.endHex)} HEX · {usd(col.totals.endHex)}</dd></div>
                </dl>
              </header>

              <ul className="space-y-3">
                {col.rows.map((r) => <PerpCard key={r.pool.symbol} row={r} usd={usd} />)}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}

function PerpCard({ row: r, usd }: { row: PerpRow; usd: (hex: number) => string }) {
  const amount = r.owned + r.bridged;
  const held = amount > 0;
  const progress = Math.min(100, Math.max(0, (1 - r.pool.daysRemaining / r.pool.cycleDays) * 100));
  const backingUSD = r.hexPrice !== null ? amount * r.perTokenNow * r.hexPrice : null;
  const vsBacking = held && backingUSD && r.marketUSD ? (r.marketUSD / backingUSD) * 100 : null;

  return (
    <li className={`rounded-xl p-3 ring-1 ${held ? 'bg-white ring-gray-200' : 'bg-gray-50/60 ring-gray-100'}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <div className="min-w-0">
          <span className={`font-bold ${held ? 'text-gray-900' : 'text-gray-500'}`}>{r.pool.symbol}</span>
          <span className="ml-2 text-xs text-gray-500">{r.pool.cycleDays.toLocaleString()}-day cycle</span>
        </div>
        <div className="text-right text-sm">
          {held ? (
            <>
              <span className="font-semibold tabular-nums text-gray-900">{fmt(amount, 2)} {r.pool.symbol}</span>
              <span className="ml-2 tabular-nums text-gray-600" title={r.marketUSD === null ? 'No market price available' : 'Market value'}>
                {r.marketUSD !== null ? formatUSD(r.marketUSD) : 'no market price'}
              </span>
              {r.bridged > 0 && <div className="text-[11px] text-gray-500">incl. {fmt(r.bridged, 2)} bridged to Pulsechain</div>}
            </>
          ) : (
            <span className="text-xs text-gray-400">not held</span>
          )}
        </div>
      </div>

      {/* Cycle progress */}
      <div className="mt-2">
        <div className="h-1.5 overflow-hidden rounded-full bg-gray-200" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress)} aria-label={`${r.pool.symbol} cycle ${Math.round(progress)}% complete`}>
          <div className="h-full rounded-full bg-gradient-to-r from-pink-500 to-purple-600" style={{ width: `${Math.max(progress, 1.5)}%` }} />
        </div>
        <div className="mt-1 flex justify-between text-[11px] tabular-nums text-gray-500">
          <span>{progress.toFixed(0)}% of cycle</span>
          <span>{r.pool.daysRemaining.toLocaleString()} days left · ends {fmtDate(r.pool.endDay)}</span>
        </div>
      </div>

      {/* Per token */}
      <dl className="mt-2 grid grid-cols-3 gap-2 text-center">
        <PerToken label="HEX earned / token" value={r.earnedPerToken} accent />
        <PerToken label="Backing / token" value={r.perTokenNow} />
        <PerToken label="Est. at end / token" value={r.perTokenEnd} />
      </dl>

      {/* Your share */}
      {held && (
        <dl className="mt-2 grid grid-cols-3 gap-2 rounded-lg bg-gradient-to-br from-pink-50 to-purple-50 p-2 text-center ring-1 ring-purple-100">
          <Share label="You earned" hex={amount * r.earnedPerToken} usd={usd(amount * r.earnedPerToken)} accent />
          <Share label="Your backing" hex={amount * r.perTokenNow} usd={usd(amount * r.perTokenNow)} />
          <Share label="Est. at end" hex={amount * r.perTokenEnd} usd={usd(amount * r.perTokenEnd)} />
        </dl>
      )}
      {vsBacking !== null && (
        <p className="mt-1.5 text-right text-[11px] text-gray-500">
          Trades at <span className={vsBacking < 100 ? 'font-medium text-green-700' : 'font-medium text-gray-700'}>{vsBacking.toFixed(0)}%</span> of backing
        </p>
      )}
    </li>
  );
}

function PerToken({ label, value, accent }: { label: string; value: number; accent?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="truncate text-[10px] uppercase tracking-wide text-gray-500">{label}</dt>
      <dd className={`text-sm font-semibold tabular-nums ${accent ? 'text-green-700' : 'text-gray-900'}`}>{value.toLocaleString('en-US', { maximumFractionDigits: 3 })}</dd>
    </div>
  );
}

function Share({ label, hex, usd, accent }: { label: string; hex: number; usd: string; accent?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="truncate text-[10px] uppercase tracking-wide text-gray-500">{label}</dt>
      <dd className={`truncate text-sm font-semibold tabular-nums ${accent ? 'text-green-700' : 'text-gray-900'}`}>{fmt(hex)} HEX</dd>
      <dd className="truncate text-xs tabular-nums text-gray-600">{usd}</dd>
    </div>
  );
}
