'use client';

import { useEffect, useState } from 'react';
import { HexPoolStats } from '@/types';
import { HexStatsWithPrice } from '@/hooks/useHexStats';
import { chainLabel } from '@/config/chainDisplay';
import { hexDayToDate } from '@/config/hex';
import { estimateStake, trailingAverage } from '@/utils/hexMath';
import { formatUSD } from '@/utils/prices';
import { Hexagon } from './Hexagon';
import { HEX_CHAIN_COLORS } from './colors';

const fmt = (v: number, digits = 0) => v.toLocaleString('en-US', { maximumFractionDigits: digits });
const fmtPct = (v: number) => `${v >= 0 ? '+' : ''}${fmt(v, 1)}%`;
const fmtDate = (day: number) =>
  hexDayToDate(day).toLocaleDateString('en-US', { year: 'numeric', month: 'short', timeZone: 'UTC' });

interface Row {
  pool: HexPoolStats;
  priceHex: number | null;     // pool token price in that chain's HEX
  priceUSD: number | null;
  backingNow: number;          // HEX per token today (principal + interest so far)
  backingAtEnd: number;        // HEX per token at cycle end (projected)
  poolReturn: number | null;   // % in HEX, buying now and getting backing at cycle end
  directReturn: number;        // % in HEX, staking yourself for the same days
}

/**
 * Buy a Maximus pool token at market, or stake HEX yourself until the same
 * date? Compares both in HEX terms, from today to the pool's cycle end.
 */
export function PoolComparison({ stats }: { stats: HexStatsWithPrice[] }) {
  const [pools, setPools] = useState<HexPoolStats[] | null>(null);
  const [prices, setPrices] = useState<Record<string, Record<string, number | null>>>({});

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { pools: list }: { pools: HexPoolStats[] } = await (await fetch('/api/hex/pools')).json();
        if (cancelled || !list?.length) return;
        const byChain: Record<string, string[]> = {};
        for (const p of list) (byChain[p.chain] ??= []).push(p.address);
        const response = await fetch('/api/prices', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tokens: byChain }),
        });
        const body: { tokens: Record<string, Record<string, number | null>> } = await response.json();
        if (!cancelled) {
          setPrices(body.tokens ?? {});
          setPools(list);
        }
      } catch (error) {
        console.warn('⚠️ Pool comparison unavailable:', error);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!pools || stats.length === 0) return null;

  const rows: Row[] = pools.map((pool) => {
    const s = stats.find((x) => x.chain === pool.chain);
    const priceUSD = prices[pool.chain]?.[pool.address.toLowerCase()] ?? null;
    const priceHex = priceUSD != null && s?.hexPriceUSD ? priceUSD / s.hexPriceUSD : null;
    const backingNow = (pool.principalHex + pool.interestHex) / pool.supply;
    const backingAtEnd = (pool.principalHex + pool.projectedInterestHex) / pool.supply;
    const payout = s?.payoutHistory?.length ? trailingAverage(s.payoutHistory, 30) : s?.payoutPerTShareHex ?? 0;
    const direct = estimateStake(1000, Math.max(1, pool.daysRemaining), s?.tSharePriceHex ?? 1, payout);
    return {
      pool,
      priceHex,
      priceUSD,
      backingNow,
      backingAtEnd,
      poolReturn: priceHex ? (backingAtEnd / priceHex - 1) * 100 : null,
      directReturn: direct.roiPct,
    };
  }).sort((a, b) => a.pool.daysRemaining - b.pool.daysRemaining || a.pool.chain.localeCompare(b.pool.chain));

  return (
    <section className="rounded-2xl border border-white/20 bg-white/70 p-6 shadow-xl backdrop-blur-sm sm:p-8">
      <div className="mb-5 flex items-center gap-3">
        <Hexagon size={36} />
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Maximus pools vs. staking yourself</h2>
          <p className="text-sm text-gray-500">Buy the pool token at market, or stake HEX directly until the same date?</p>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[820px] text-sm">
          <thead>
            <tr className="border-b text-left text-xs uppercase tracking-wide text-gray-500">
              <th className="py-2 pr-4 font-medium">Pool</th>
              <th className="py-2 pr-4 text-right font-medium">Price</th>
              <th className="py-2 pr-4 text-right font-medium">HEX backing</th>
              <th className="py-2 pr-4 text-right font-medium">Cycle ends</th>
              <th className="py-2 pr-4 text-right font-medium">Buy pool</th>
              <th className="py-2 pr-4 text-right font-medium">Stake directly</th>
              <th className="py-2 text-right font-medium">Better by</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const edge = r.poolReturn !== null ? r.poolReturn - r.directReturn : null;
              return (
                <tr key={`${r.pool.chain}-${r.pool.symbol}`} className="border-b border-gray-100 last:border-0">
                  <td className="py-2 pr-4">
                    <div className="flex items-center gap-2 font-medium text-gray-900">
                      <span className="h-2 w-2 rounded-full" style={{ background: HEX_CHAIN_COLORS[r.pool.chain] }} />
                      {r.pool.symbol}
                    </div>
                    <div className="text-xs text-gray-500">{chainLabel(r.pool.chain)} · {fmt(r.pool.cycleDays)}-day cycle</div>
                  </td>
                  <td className="py-2 pr-4 text-right tabular-nums">
                    {r.priceHex !== null ? `${fmt(r.priceHex, 3)} HEX` : '—'}
                    {r.priceUSD !== null && <div className="text-xs text-gray-500">{formatUSD(r.priceUSD)}</div>}
                  </td>
                  <td className="py-2 pr-4 text-right tabular-nums">
                    {fmt(r.backingNow, 3)} now
                    <div className="text-xs text-gray-500">≈ {fmt(r.backingAtEnd, 3)} at end</div>
                  </td>
                  <td className="py-2 pr-4 text-right">
                    <div className="tabular-nums text-gray-900">{fmt(r.pool.daysRemaining)}d</div>
                    <div className="text-xs text-gray-500">{fmtDate(r.pool.endDay)}</div>
                  </td>
                  <td className="py-2 pr-4 text-right font-semibold tabular-nums text-gray-900">
                    {r.poolReturn !== null ? fmtPct(r.poolReturn) : '—'}
                  </td>
                  <td className="py-2 pr-4 text-right tabular-nums">{fmtPct(r.directReturn)}</td>
                  <td className="py-2 text-right tabular-nums">
                    {edge === null ? '—' : (
                      <span className={edge >= 0 ? 'font-medium text-green-700' : 'text-gray-700'}>
                        {edge >= 0 ? `Pool ${fmt(edge, 1)} pts` : `Stake ${fmt(-edge, 1)} pts`}
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="mt-3 text-xs text-gray-500">
        Returns are in HEX, from today to the pool&apos;s cycle end. &ldquo;Buy pool&rdquo; assumes the token is worth its HEX
        backing when the cycle ends; &ldquo;Stake directly&rdquo; uses today&apos;s T-Share price and the 30-day average
        payout. A pool token can be sold any time at market; a direct stake can&apos;t be ended early without penalty.
      </p>
    </section>
  );
}
