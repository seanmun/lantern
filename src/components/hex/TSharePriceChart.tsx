'use client';

import { useEffect, useState } from 'react';
import { chainLabel } from '@/config/chainDisplay';
import { LineChart, LineSeries } from './LineChart';
import { HEX_CHAIN_COLORS } from './colors';

interface TShareHistory {
  chain: string;
  points: { day: number; tSharePriceHex: number }[];
  note?: string;
}

const compact = (v: number) =>
  v >= 1000 ? `${(v / 1000).toLocaleString('en-US', { maximumFractionDigits: 1 })}k` : v.toLocaleString('en-US', { maximumFractionDigits: 0 });

/**
 * T-Share price (HEX per T-Share) over time on both chains. It only rises:
 * every stake that ends with good returns pushes it up, so the same HEX buys
 * fewer shares later. Loaded lazily since the first fetch scans archive state.
 */
export function TSharePriceChart({ currentPrice }: { currentPrice: number }) {
  const [history, setHistory] = useState<TShareHistory[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/hex/tshare-history')
      .then((r) => r.json())
      .then((body: { history: TShareHistory[] }) => {
        if (cancelled) return;
        if (body.history?.length) setHistory(body.history);
        else setFailed(true);
      })
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, []);

  if (failed) return null;
  if (!history) {
    return (
      <div className="flex h-[240px] items-center justify-center rounded-xl bg-white/50 text-sm text-muted">
        Loading T-Share price history…
      </div>
    );
  }

  const series: LineSeries[] = history.map((h) => ({
    key: h.chain,
    label: chainLabel(h.chain),
    color: HEX_CHAIN_COLORS[h.chain] ?? '#6b7280',
    points: h.points.map((p) => ({ day: p.day, value: p.tSharePriceHex })),
  }));
  const notes = history.map((h) => h.note).filter(Boolean).join(' ');

  return (
    <LineChart
      title="T-Share price (HEX per T-Share)"
      series={series}
      defaultRange="all"
      formatValue={(v) => `${v.toLocaleString('en-US', { maximumFractionDigits: 0 })} HEX`}
      formatAxis={compact}
      reference={{ value: currentPrice, label: `today ${compact(currentPrice)}` }}
      note={`Sampled monthly. Both chains share one history before the May 2023 fork, so the lines overlap there. The price only goes up, so the same HEX buys fewer T-Shares later.${notes ? ` ${notes}` : ''}`}
    />
  );
}
