'use client';

import { useEffect, useState } from 'react';
import { ServiceState, ServiceStatus, StatusReport } from '@/types/status';

const REFRESH_MS = 60_000;

const STATE: Record<ServiceState, { label: string; text: string; icon: string }> = {
  up: { label: 'Working', text: 'text-[#0B5A38]', icon: 'M5 12.5l4.5 4.5L19 7.5' },
  degraded: { label: 'Degraded', text: 'text-[#7A4B00]', icon: 'M12 8v5M12 16.5h.01' },
  down: { label: 'Down', text: 'text-[#8A1C1C]', icon: 'M6 6l12 12M18 6L6 18' },
};

const ago = (ms: number) => {
  const s = Math.max(0, Math.round(ms / 1000));
  return s < 60 ? `${s}s ago` : s < 3600 ? `${Math.round(s / 60)} min ago` : `${Math.round(s / 3600)} h ago`;
};

/** /status: is PulseChain down, or just something around it? */
export function StatusView() {
  const [report, setReport] = useState<StatusReport | null>(null);
  const [failed, setFailed] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    let cancelled = false;
    const load = () =>
      fetch('/api/status')
        .then((r) => r.json())
        .then((d: StatusReport) => {
          if (cancelled) return;
          setReport(d);
          setFailed(false);
        })
        .catch(() => !cancelled && setFailed(true));
    load();
    const refresh = setInterval(load, REFRESH_MS);
    const tick = setInterval(() => setNow(Date.now()), 5_000);
    return () => {
      cancelled = true;
      clearInterval(refresh);
      clearInterval(tick);
    };
  }, []);

  const troubled = report?.services.filter((s) => s.state !== 'up') ?? [];
  const groups = report ? [...new Set(report.services.map((s) => s.group))] : [];

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <div>
        <h1 className="text-4xl font-extrabold tracking-tight text-ink sm:text-5xl">Is PulseChain down?</h1>
        <p className="mt-2 text-lg text-muted">Live health of the chain and the services around it, checked every minute.</p>
      </div>

      {!report && !failed && <div className="rounded-3xl bg-soft p-8 text-center text-muted">Checking the chain and its services…</div>}
      {failed && !report && <div className="rounded-3xl border border-line p-6 text-ink">Lantern couldn&apos;t run its checks just now. Try again in a minute.</div>}

      {report && (
        <>
          <Headline report={report} troubled={troubled} now={now} />
          {groups.map((group) => (
            <section key={group} aria-labelledby={`g-${group}`}>
              <h2 id={`g-${group}`} className="mb-2 text-lg font-extrabold text-ink">{group}</h2>
              <ul className="overflow-hidden rounded-3xl border border-line">
                {report.services.filter((s) => s.group === group).map((s) => <Row key={s.id} s={s} />)}
              </ul>
            </section>
          ))}
          <p className="text-[13px] text-muted">
            Checked {ago(now - report.checkedAt)}. RPCs are the servers apps use to read the chain; the explorer index and price
            feeds are separate services, so they can fail while the chain runs normally. Lantern itself switches between RPCs
            automatically when one fails.
          </p>
        </>
      )}
    </div>
  );
}

function Headline({ report, troubled, now }: { report: StatusReport; troubled: ServiceStatus[]; now: number }) {
  const { producingBlocks, lastBlock, lastBlockAt } = report.chain;
  const down = troubled.filter((s) => s.state === 'down');
  const tone = !producingBlocks ? 'bg-[#FDECEC] ring-[#F3BDBD]' : down.length ? 'bg-[#FFF4DB] ring-[#F5D78E]' : 'bg-[#E3F5EC] ring-[#B9E4CD]';
  const title = !producingBlocks
    ? 'PulseChain isn’t producing blocks right now'
    : troubled.length === 0 ? 'Everything is working' : 'No, PulseChain is running';
  return (
    <div className={`rounded-3xl p-6 ring-1 ${tone}`} role="status">
      <div className="text-2xl font-extrabold tracking-tight text-ink sm:text-3xl">{title}</div>
      <p className="mt-2 text-[17px] leading-snug text-ink">
        {lastBlock !== null && lastBlockAt !== null
          ? `Latest block ${lastBlock.toLocaleString('en-US')}, ${ago(now - lastBlockAt)}.`
          : 'Couldn’t read the latest block.'}
        {producingBlocks && troubled.length > 0 &&
          ` ${troubled.length} service${troubled.length === 1 ? ' is' : 's are'} having trouble (listed below). Funds and stakes live on the chain, which is fine; only apps that rely on ${troubled.length === 1 ? 'that service' : 'those services'} may look broken.`}
      </p>
    </div>
  );
}

function Row({ s }: { s: ServiceStatus }) {
  const st = STATE[s.state];
  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-line px-5 py-3.5 first:border-t-0">
      <span className={`order-1 flex shrink-0 items-center gap-2 text-sm font-bold sm:w-28 ${st.text}`}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden="true"><path d={st.icon} /></svg>
        {st.label}
      </span>
      <span className="order-3 min-w-0 basis-full sm:order-2 sm:basis-0 sm:flex-1">
        <span className="block break-words font-semibold text-ink">{s.name}</span>
        <span className="block text-[13px] text-muted">{s.detail}</span>
      </span>
      {s.latencyMs !== null && <span className="order-2 ml-auto text-[13px] tabular-nums text-muted sm:order-3">{s.latencyMs.toLocaleString()} ms</span>}
    </li>
  );
}
