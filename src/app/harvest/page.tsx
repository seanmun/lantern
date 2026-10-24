'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import { usePortfolioContext } from '@/components/app/PortfolioProvider';
import { NoWallets, PageHeader } from '@/components/app/AppShell';
import { chainLabel } from '@/config/chainDisplay';
import { formatUSD } from '@/utils/prices';
import { HarvestEvent, harvestEvents, harvestPeriods, harvestTotals } from '@/utils/harvest';
import { buildIcs, CalendarEvent, downloadFile } from '@/utils/ics';

const fmtDate = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
const fmtAmount = (n: number) => (n >= 1e9 ? `${(n / 1e9).toFixed(2)}B` : n >= 1e6 ? `${(n / 1e6).toFixed(2)}M` : n.toLocaleString('en-US', { maximumFractionDigits: n >= 100 ? 0 : 2 }));

const KIND_DOT: Record<HarvestEvent['kind'], string> = {
  'hex-stake': 'bg-accent',
  'hex-late': 'bg-down',
  'hdrn-mint': 'bg-warn-solid',
  icosa: 'bg-info-solid',
  'pool-cycle': 'bg-line-strong',
};

export default function HarvestPage() {
  const { wallets, assets, hexStats, walletNames, isLoading } = usePortfolioContext();
  const events = useMemo(() => {
    const prices = {
      hex: Object.fromEntries(hexStats.map((s) => [s.chain, s.hexPriceUSD])),
      hdrn: Object.fromEntries(hexStats.map((s) => [s.chain, s.hdrnPriceUSD])),
    };
    return harvestEvents(assets, prices);
  }, [assets, hexStats]);
  const periods = useMemo(() => harvestPeriods(events), [events]);
  const totals = useMemo(() => harvestTotals(events), [events]);

  const walletName = (address: string) => walletNames.get(address.toLowerCase()) ?? `${address.slice(0, 6)}…${address.slice(-4)}`;

  const exportCalendar = () => {
    const cal: CalendarEvent[] = events
      .filter((e) => !e.ready)
      .map((e) => ({
        uid: `${e.id}@lantern`,
        title: e.title,
        date: e.date,
        description: `${e.detail} About ${fmtAmount(e.amount)} ${e.symbol}${e.valueUSD ? ` (${formatUSD(e.valueUSD)} at today's prices)` : ''}. ${chainLabel(e.chain)}, wallet ${e.walletAddress}.`,
        alarmDaysBefore: e.kind === 'pool-cycle' ? undefined : 3,
      }));
    downloadFile('lantern-harvest.ics', buildIcs(cal));
  };

  return (
    <>
      <PageHeader title="Harvest" subtitle="What's coming to you, and when. Values at today's prices.">
        {events.some((e) => !e.ready) && (
          <button onClick={exportCalendar} className="inline-flex h-10 items-center gap-1.5 rounded-full bg-soft px-4 text-sm font-semibold text-ink hover:bg-line">
            Add all to calendar
          </button>
        )}
      </PageHeader>

      {wallets.length === 0 ? (
        <NoWallets what="what's coming to you" />
      ) : events.length === 0 ? (
        <section className="rounded-3xl border border-line p-8 text-center">
          <p className="text-lg font-bold text-ink">{isLoading ? 'Reading your stakes…' : 'Nothing with a date on it yet'}</p>
          {!isLoading && (
            <p className="mx-auto mt-2 max-w-xl text-muted">
              Harvest lists HEX stakes, HDRN you can mint, Icosa stakes and Maximus pool cycles. Try the{' '}
              <Link href="/tools#estimator" className="font-semibold text-accent hover:underline">stake estimator</Link> to see what a stake could pay.
            </p>
          )}
        </section>
      ) : (
        <div className="space-y-8">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[
              { label: 'Ready now', value: totals.ready },
              { label: 'Within 30 days', value: totals.days30 },
              { label: 'Within a year', value: totals.year },
              { label: 'Everything dated', value: totals.all },
            ].map((t) => (
              <div key={t.label} className="rounded-3xl border border-line bg-surface p-5">
                <div className="text-[13px] font-semibold text-muted">{t.label}</div>
                <div className="mt-1 text-2xl font-extrabold tabular-nums text-ink sm:text-3xl">{formatUSD(t.value)}</div>
              </div>
            ))}
          </div>

          {periods.map((p) => {
            const near = p.key === 'ready' || p.key === '30d' || p.key === 'year';
            const rows = (
              <ul className="overflow-hidden rounded-3xl border border-line bg-surface">
                {p.events.map((e) => <EventRow key={e.id} e={e} walletName={walletName} />)}
              </ul>
            );
            // Near-term periods stay open; later years fold into one line each
            return near ? (
              <section key={p.key} aria-labelledby={`h-${p.key}`}>
                <div className="mb-2 flex items-baseline justify-between gap-3">
                  <h2 id={`h-${p.key}`} className={`text-xl font-extrabold tracking-tight ${p.key === 'ready' ? 'text-good' : 'text-ink'}`}>{p.label}</h2>
                  {p.valueUSD > 0 && <span className="font-bold tabular-nums text-muted">{formatUSD(p.valueUSD)}</span>}
                </div>
                {rows}
              </section>
            ) : (
              <details key={p.key} className="group rounded-3xl border border-line bg-surface open:border-transparent open:bg-transparent">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-3xl px-5 py-4 hover:bg-soft/50 group-open:mb-2 group-open:px-0 group-open:py-0 group-open:hover:bg-transparent [&::-webkit-details-marker]:hidden">
                  <span className="flex items-baseline gap-3">
                    <span className="text-xl font-extrabold tracking-tight text-ink">{p.label}</span>
                    <span className="text-[13px] text-muted">{p.events.length} item{p.events.length === 1 ? '' : 's'}</span>
                  </span>
                  <span className="flex items-center gap-3">
                    {p.valueUSD > 0 && <span className="font-bold tabular-nums text-muted">{formatUSD(p.valueUSD)}</span>}
                    <span aria-hidden="true" className="text-muted transition-transform group-open:rotate-90">›</span>
                  </span>
                </summary>
                {rows}
              </details>
            );
          })}

          <p className="text-[13px] text-muted">
            Running stakes are projected at the recent payout rate, and every value uses today&apos;s price, so treat amounts as estimates.
            Maximus cycle ends are shown for timing only and aren&apos;t counted in the totals: the pool restakes and your tokens carry on.
          </p>
        </div>
      )}
    </>
  );
}

function EventRow({ e, walletName }: { e: HarvestEvent; walletName: (address: string) => string }) {
  const when = e.ready ? (e.kind === 'hex-late' ? 'Late' : 'Now') : fmtDate(e.date);
  return (
    <li className="flex items-start gap-4 border-t border-line px-5 py-4 first:border-t-0">
      <div className="hidden w-24 shrink-0 pt-0.5 text-[13px] font-semibold tabular-nums text-muted sm:block">{when}</div>
      <div className="min-w-0 flex-1">
        <div className="text-[13px] font-semibold tabular-nums text-muted sm:hidden">{when}</div>
        <div className="flex items-start gap-2 font-bold text-ink">
          <span aria-hidden="true" className={`mt-[7px] h-2.5 w-2.5 shrink-0 rounded-full ${KIND_DOT[e.kind]}`} />
          <span>{e.title}</span>
        </div>
        <p className="mt-0.5 text-[14px] text-muted">{e.detail}</p>
        <p className="mt-0.5 text-[13px] text-muted">
          {walletName(e.walletAddress)} · {chainLabel(e.chain)}
          {e.urgentBy && <span className="font-semibold text-warn"> · end by {fmtDate(e.urgentBy)}</span>}
        </p>
      </div>
      <div className="shrink-0 text-right">
        <div className={`font-bold tabular-nums ${e.counts ? 'text-ink' : 'text-muted'}`}>{e.valueUSD !== null ? formatUSD(e.valueUSD) : '—'}</div>
        <div className="text-[13px] tabular-nums text-muted">{fmtAmount(e.amount)} {e.symbol}</div>
      </div>
    </li>
  );
}
