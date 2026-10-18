'use client';

import { HexStatsWithPrice } from '@/hooks/useHexStats';
import { chainLabel } from '@/config/chainDisplay';
import { formatUSD } from '@/utils/prices';
import { HEX_CHAIN_COLORS } from './colors';

const fmt = (value: number, digits = 0) => value.toLocaleString('en-US', { maximumFractionDigits: digits });

/**
 * One row per HEX chain: day, HEX price, T-Share price, daily payout, % staked.
 */
export function HexNetworkStrip({ stats }: { stats: HexStatsWithPrice[] }) {
  if (stats.length === 0) return null;

  return (
    <div className="grid gap-3 md:grid-cols-2">
      {stats.map((s) => {
        const tShareUSD = s.hexPriceUSD != null ? s.tSharePriceHex * s.hexPriceUSD : null;
        const payoutUSD = s.hexPriceUSD != null ? s.payoutPerTShareHex * s.hexPriceUSD : null;
        return (
          <div key={s.chain} className="rounded-xl bg-surface p-4">
            <div className="mb-3 flex items-center justify-between">
              <span className="flex items-center gap-2 text-sm font-semibold text-ink">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: HEX_CHAIN_COLORS[s.chain] }} />
                {chainLabel(s.chain)} HEX
              </span>
              <span className="text-xs text-muted">Day {fmt(s.currentDay)}</span>
            </div>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm sm:grid-cols-4">
              <NetStat label="HEX price" value={s.hexPriceUSD != null ? formatUSD(s.hexPriceUSD) : '—'} />
              <NetStat
                label="T-Share price"
                value={`${fmt(s.tSharePriceHex)} HEX`}
                sub={tShareUSD != null ? formatUSD(tShareUSD) : undefined}
              />
              <NetStat
                label="Payout / T-Share"
                value={`${fmt(s.payoutPerTShareHex, 3)} HEX`}
                sub={payoutUSD != null ? `${formatUSD(payoutUSD)} / day` : 'per day'}
              />
              <NetStat label="Supply staked" value={`${fmt(s.stakedPercent, 1)}%`} sub={`${fmt(s.stakedHex / 1e9, 1)}B HEX`} />
            </dl>
          </div>
        );
      })}
    </div>
  );
}

function NetStat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="truncate font-semibold tabular-nums text-ink">{value}</dd>
      {sub && <dd className="truncate text-xs tabular-nums text-muted">{sub}</dd>}
    </div>
  );
}
