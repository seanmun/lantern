'use client';

import { Asset } from '@/types';
import { BRIDGED_MAXIMUS, MAXIMUS_POOLS, MAXIMUS_TEAM_ADDRESS, hexDayToDate } from '@/config/hex';
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
const fmtDate = (day: number) => hexDayToDate(day).toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' });

interface Holding {
  amount: number;
  value: number | null;   // priced value, when every part has a price
  staked: number;         // TEAM staked (burned from the wallet while staked)
  rewards: number;        // unclaimed TEAM rewards in this token
}

interface PerpRow {
  pool: PoolWithPrice;
  amount: number;          // native + bridged, incl. unclaimed rewards
  bridged: number;         // eTOKENs on Pulsechain backed by this (Ethereum) pool
  rewards: number;
  nowUSD: number | null;   // market value, else HEX backing today
  priced: boolean;         // nowUSD is a market value
  endUSD: number | null;   // HEX backing at cycle end at today's HEX price
  perTokenNow: number;
  earnedPerToken: number;
  perTokenEnd: number;
}

function holdingsByToken(assets: Asset[]) {
  const map = new Map<string, Holding>();
  for (const a of assets) {
    if (a.type !== 'token' || !a.contractAddress) continue;
    const key = `${a.chain}:${a.contractAddress.toLowerCase()}`;
    const h = map.get(key) ?? { amount: 0, value: null, staked: 0, rewards: 0 };
    const amount = Number(a.balanceFormatted);
    h.amount += amount;
    if (a.tokenStandard === 'Staked') h.staked += amount;
    if (a.tokenStandard === 'Rewards') h.rewards += amount;
    if (a.valueUSD !== undefined) h.value = (h.value ?? 0) + a.valueUSD;
    map.set(key, h);
  }
  return map;
}

const EMPTY: Holding = { amount: 0, value: null, staked: 0, rewards: 0 };

function buildRows(chain: string, pools: PoolWithPrice[], holdings: Map<string, Holding>, hexPrice: number | null): PerpRow[] {
  return MAXIMUS_POOLS.map((meta) => pools.find((p) => p.chain === chain && p.symbol === meta.symbol))
    .filter((p): p is PoolWithPrice => !!p)
    .map((pool) => {
      const native = holdings.get(`${chain}:${pool.address.toLowerCase()}`) ?? EMPTY;
      const bridgedMeta = chain === 'ethereum' ? BRIDGED_MAXIMUS.find((b) => b.poolSymbol === pool.symbol) : undefined;
      const bridged = bridgedMeta ? holdings.get(`pulsechain:${bridgedMeta.address.toLowerCase()}`) ?? EMPTY : EMPTY;
      const amount = native.amount + bridged.amount;
      const perTokenNow = (pool.principalHex + pool.interestHex) / pool.supply;
      const perTokenEnd = (pool.principalHex + pool.projectedInterestHex) / pool.supply;

      // Market value: priced holdings, else the pool token's market price
      const nativeMarket = native.value ?? (native.amount > 0 && pool.priceUSD !== null ? native.amount * pool.priceUSD : null);
      const bridgedMarket = bridged.amount > 0 ? bridged.value : 0;
      const market = nativeMarket !== null && bridgedMarket !== null ? nativeMarket + bridgedMarket : null;
      const backingNowUSD = hexPrice !== null ? amount * perTokenNow * hexPrice : null;
      return {
        pool,
        amount,
        bridged: bridged.amount,
        rewards: native.rewards,
        nowUSD: market ?? backingNowUSD,
        priced: market !== null,
        endUSD: hexPrice !== null ? amount * perTokenEnd * hexPrice : null,
        perTokenNow,
        earnedPerToken: pool.interestHex / pool.supply,
        perTokenEnd,
      };
    });
}

/**
 * Maximus DAO at a glance: what your perps and TEAM are worth now, and what
 * the perps' HEX backing should be worth when each cycle ends. Per-pool
 * backing stats sit behind a toggle.
 */
export function MaximusView({ assets, hexStats }: MaximusViewProps) {
  const pools = useMaximusPools();
  if (!pools) return <p className="text-sm text-gray-500">Loading Maximus pools…</p>;

  const holdings = holdingsByToken(assets);
  const columns = COLUMNS.map((chain) => {
    const hexPrice = hexStats.find((s) => s.chain === chain)?.hexPriceUSD ?? null;
    const rows = buildRows(chain, pools, holdings, hexPrice);
    const team = holdings.get(`${chain}:${MAXIMUS_TEAM_ADDRESS.toLowerCase()}`) ?? EMPTY;
    // Skip dust (e.g. a few hundredths of a token left from TEAM rewards)
    const held = rows.filter((r) => r.amount > 0 && (r.nowUSD === null || r.nowUSD >= 0.01));
    return { chain, rows, held, team };
  });

  const all = columns.flatMap((c) => c.held);
  const teamValue = columns.reduce((s, c) => s + (c.team.value ?? 0), 0);
  const nowUSD = all.reduce((s, r) => s + (r.nowUSD ?? 0), 0) + teamValue;
  const endUSD = all.reduce((s, r) => s + (r.endUSD ?? r.nowUSD ?? 0), 0) + teamValue;
  const growth = nowUSD > 0 ? (endUSD / nowUSD - 1) * 100 : null;
  const unpriced = all.some((r) => !r.priced);
  // Note unclaimed rewards only when they're a meaningful part of a position
  const significant = (part: number, whole: number) => part > 0 && part >= whole * 0.005;

  return (
    <div>
      <h3 className="mb-3 text-lg font-semibold text-gray-800">Maximus DAO</h3>

      {/* Headline: worth now -> worth at cycle ends */}
      <div className="mb-5 flex flex-wrap items-center gap-x-6 gap-y-3 rounded-2xl bg-gradient-to-br from-pink-50 to-purple-50 p-4 ring-1 ring-purple-100 sm:p-5">
        <div className="flex items-center gap-4 sm:gap-6">
        <div>
          <div className="text-xs font-medium uppercase tracking-wide text-gray-500">Worth now</div>
          <div className="text-2xl font-bold tabular-nums text-gray-900 sm:text-3xl">{formatUSD(nowUSD)}</div>
        </div>
        <div className="text-2xl text-purple-400" aria-hidden>→</div>
        <div>
          <div className="text-xs font-medium uppercase tracking-wide text-gray-500">Est. at cycle ends</div>
          <div className="flex flex-wrap items-baseline gap-x-2">
            <span className="text-2xl font-bold tabular-nums text-purple-700 sm:text-3xl">{formatUSD(endUSD)}</span>
            {growth !== null && Math.abs(growth) >= 0.5 && (
              <span className={`text-sm font-semibold ${growth >= 0 ? 'text-green-700' : 'text-gray-600'}`}>
                {growth >= 0 ? '+' : ''}{growth.toFixed(0)}%
              </span>
            )}
          </div>
        </div>
        </div>
        <p className="w-full text-[11px] text-gray-500 sm:ml-auto sm:w-auto sm:max-w-xs sm:text-right">
          Each perp redeems its HEX backing at cycle end, valued at today&apos;s HEX price. TEAM is counted at market.
          {unpriced && ' * No market price: valued at its HEX backing today.'}
        </p>
      </div>

      {/* Held positions, Pulsechain beside Ethereum */}
      <div className="grid gap-4 lg:grid-cols-2">
        {columns.map((col) => (
          <section key={col.chain} className="min-w-0 rounded-2xl bg-white/60 p-4 ring-1 ring-gray-200">
            <h4 className="mb-2 flex items-center gap-2 text-sm font-bold text-gray-900">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: HEX_CHAIN_COLORS[col.chain] }} />
              {chainLabel(col.chain)}
            </h4>
            {col.held.length === 0 && col.team.amount === 0 ? (
              <p className="py-3 text-sm text-gray-400">No Maximus holdings</p>
            ) : (
              <ul className="divide-y divide-gray-100">
                {col.held.map((r) => <PerpRow key={r.pool.symbol} row={r} showRewards={significant(r.rewards, r.amount)} />)}
                {col.team.amount > 0 && <TeamRow team={col.team} />}
              </ul>
            )}
          </section>
        ))}
      </div>

      <details className="group mt-4">
        <summary className="cursor-pointer select-none text-sm font-medium text-purple-700 hover:text-purple-900">
          <span className="group-open:hidden">Show</span><span className="hidden group-open:inline">Hide</span> pool details
        </summary>
        <div className="mt-3 grid gap-4 lg:grid-cols-2">
          {columns.map((col) => <PoolTable key={col.chain} chain={col.chain} rows={col.rows} />)}
        </div>
      </details>
    </div>
  );
}

function PerpRow({ row: r, showRewards }: { row: PerpRow; showRewards: boolean }) {
  const progress = Math.min(100, Math.max(0, (1 - r.pool.daysRemaining / r.pool.cycleDays) * 100));
  const notes = [
    r.bridged > 0 && `${fmt(r.bridged, 2)} bridged`,
    showRewards && `${fmt(r.rewards, 2)} unclaimed TEAM rewards`,
  ].filter(Boolean);
  return (
    <li className="py-3">
      <div className="flex items-baseline justify-between gap-3">
        <div className="min-w-0">
          <span className="font-bold text-gray-900">{r.pool.symbol}</span>
          <span className="ml-2 tabular-nums text-sm text-gray-600">{fmt(r.amount, r.amount >= 100 ? 0 : 2)}</span>
        </div>
        <div className="shrink-0 text-right tabular-nums">
          <span className="text-sm text-gray-700" title={r.priced ? 'Market value' : 'No market price: HEX backing today'}>
            {r.nowUSD !== null ? formatUSD(r.nowUSD) : '—'}{!r.priced && '*'}
          </span>
          <span className="mx-1.5 text-gray-400" aria-hidden>→</span>
          <span className="font-semibold text-purple-700" title="HEX backing at cycle end, at today's HEX price">
            {r.endUSD !== null ? formatUSD(r.endUSD) : '—'}
          </span>
        </div>
      </div>
      <div className="mt-1.5 flex items-center gap-2">
        <div
          className="h-1 flex-1 overflow-hidden rounded-full bg-gray-200"
          role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress)}
          aria-label={`${r.pool.symbol} cycle ${Math.round(progress)}% complete`}
        >
          <div className="h-full rounded-full bg-gradient-to-r from-pink-500 to-purple-600" style={{ width: `${Math.max(progress, 1.5)}%` }} />
        </div>
        <span className="shrink-0 text-[11px] tabular-nums text-gray-500">ends {fmtDate(r.pool.endDay)}</span>
      </div>
      {notes.length > 0 && <p className="mt-1 text-[11px] text-gray-500">incl. {notes.join(' · ')}</p>}
    </li>
  );
}

function TeamRow({ team }: { team: Holding }) {
  const notes = [
    team.staked > 0 && `${fmt(team.staked, 0)} staked`,
    team.rewards > 0 && `${fmt(team.rewards, 0)} unclaimed rewards`,
  ].filter(Boolean);
  return (
    <li className="py-3">
      <div className="flex items-baseline justify-between gap-3">
        <div className="min-w-0">
          <span className="font-bold text-gray-900">TEAM</span>
          <span className="ml-2 tabular-nums text-sm text-gray-600">{fmt(team.amount, team.amount >= 100 ? 0 : 2)}</span>
        </div>
        <span className="shrink-0 text-sm tabular-nums text-gray-700">{team.value !== null ? formatUSD(team.value) : 'no market price'}</span>
      </div>
      <p className="mt-1 text-[11px] text-gray-500" title="Staked TEAM earns a share of the perps' bonus yield each staking period">
        {notes.length > 0 ? `incl. ${notes.join(' · ')}` : 'not staked'}
      </p>
    </li>
  );
}

function PoolTable({ chain, rows }: { chain: string; rows: PerpRow[] }) {
  return (
    <div className="min-w-0 overflow-x-auto rounded-xl bg-white/60 p-3 ring-1 ring-gray-200">
      <h5 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">{chainLabel(chain)} pools · HEX per token</h5>
      <table className="w-full text-xs tabular-nums">
        <thead>
          <tr className="text-left text-gray-500">
            <th className="pb-1 font-medium">Pool</th>
            <th className="pb-1 text-right font-medium">Ends</th>
            <th className="pb-1 text-right font-medium">Earned</th>
            <th className="pb-1 text-right font-medium">Backing</th>
            <th className="pb-1 text-right font-medium">At end</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.pool.symbol} className="border-t border-gray-100">
              <td className="py-1 font-medium text-gray-900">{r.pool.symbol}</td>
              <td className="py-1 text-right text-gray-600">{fmtDate(r.pool.endDay)}</td>
              <td className="py-1 text-right text-green-700">{r.earnedPerToken.toFixed(3)}</td>
              <td className="py-1 text-right text-gray-900">{r.perTokenNow.toFixed(3)}</td>
              <td className="py-1 text-right text-gray-900">{r.perTokenEnd.toFixed(3)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
