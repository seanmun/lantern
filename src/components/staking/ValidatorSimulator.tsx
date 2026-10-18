'use client';

import { ReactNode, useEffect, useMemo, useState } from 'react';
import { ValidatorNetworkStats } from '@/types';
import { formatUSD } from '@/utils/prices';
import { LineChart } from '@/components/hex/LineChart';
import { HEX_CHAIN_COLORS } from '@/components/hex/colors';
import { TokenLogo } from '@/components/ui/TokenLogo';

/*
 * Offline model (Altair rewards): a missed epoch forfeits that epoch's reward
 * and is charged the source + target penalties, 40/64 of a full reward.
 * Execution rewards only come with blocks you propose while online.
 */
const OFFLINE_PENALTY = 40 / 64;

const DEFAULTS: Record<string, { hardware: number; monthly: number; fee: number }> = {
  ethereum: { hardware: 1500, monthly: 25, fee: 10 },
  pulsechain: { hardware: 2000, monthly: 35, fee: 10 },
};
const YEARS = [1, 2, 3, 5];
const BACKTEST = [
  { label: '3 months', days: 91 },
  { label: '6 months', days: 182 },
  { label: '1 year', days: 365 },
];
const MIN_LOG_MULT = -1; // 0.1x
const MAX_LOG_MULT = 1;  // 10x
const HEX_EPOCH_MS = Date.UTC(2019, 11, 3);

const fmt = (v: number, digits = 0) =>
  v >= 1e12 ? `${(v / 1e12).toFixed(2)}T` : v >= 1e9 ? `${(v / 1e9).toFixed(2)}B` : v >= 1e6 ? `${(v / 1e6).toFixed(2)}M` : v.toLocaleString('en-US', { maximumFractionDigits: digits });
const pct = (v: number, digits = 2) => `${v.toFixed(digits)}%`;
const usdCompact = (v: number) => (v >= 1e9 ? `$${(v / 1e9).toFixed(2)}B` : v >= 1e6 ? `$${(v / 1e6).toFixed(2)}M` : formatUSD(v));
const multLabel = (m: number) => (Math.abs(m - 1) < 0.005 ? "Today's price" : m < 1 ? `−${fmt((1 - m) * 100)}%` : `${fmt(m, m < 10 ? 1 : 0)}×`);

/** "32,000,000", "32M", "1.5k" -> number */
function parseAmount(input: string): number {
  const m = input.replace(/[,\s]/g, '').match(/^(\d*\.?\d+)([kmbt]?)$/i);
  if (!m) return 0;
  return Number(m[1]) * ({ '': 1, k: 1e3, m: 1e6, b: 1e9, t: 1e12 }[m[2].toLowerCase()] ?? 1);
}

let cached: Promise<ValidatorNetworkStats[]> | null = null;
function useValidatorStats() {
  const [networks, setNetworks] = useState<ValidatorNetworkStats[] | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let cancelled = false;
    cached ??= fetch('/api/staking').then((r) => r.json()).then((d) => d.networks as ValidatorNetworkStats[]);
    cached
      .then((n) => !cancelled && (n.length ? setNetworks(n) : setFailed(true)))
      .catch(() => {
        cached = null;
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);
  return { networks, failed };
}

/** Annual reward rate (%) at an uptime, net of offline penalties. */
const netRate = (consensus: number, execution: number, uptime: number) =>
  Math.max(0, consensus * (uptime - (1 - uptime) * OFFLINE_PENALTY) + execution * uptime);

/**
 * Is running your own validator worth it? Live reward rates for Ethereum and
 * PulseChain, a forward simulator (solo vs pooled, uptime, price scenarios),
 * and what the past year would have paid.
 */
export function ValidatorSimulator({ holdings }: { holdings: Record<string, number> }) {
  const { networks, failed } = useValidatorStats();
  const [chain, setChain] = useState<'ethereum' | 'pulsechain'>('pulsechain');

  if (failed) return null;
  return (
    <section className="rounded-3xl border border-line bg-white p-6 sm:p-8">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-ink">Run a validator?</h2>
          <p className="text-sm text-muted">What staking ETH or PLS on your own validator pays, and whether it beats a pooled service</p>
        </div>
        <div className="flex rounded-lg bg-soft p-1" role="tablist" aria-label="Network">
          {(['pulsechain', 'ethereum'] as const).map((c) => (
            <button
              key={c}
              role="tab"
              aria-selected={chain === c}
              onClick={() => setChain(c)}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium ${chain === c ? 'bg-white text-ink shadow-sm' : 'text-muted hover:text-ink'}`}
            >
              <TokenLogo src={`/api/logos/native/${c}`} symbol={c === 'ethereum' ? 'ETH' : 'PLS'} size={16} />
              {c === 'ethereum' ? 'Ethereum' : 'PulseChain'}
            </button>
          ))}
        </div>
      </div>
      {!networks ? (
        <p className="text-sm text-muted">Loading validator data from the beacon chain…</p>
      ) : (
        (() => {
          const n = networks.find((x) => x.chain === chain);
          return n ? <Network key={chain} n={n} held={holdings[chain] ?? 0} /> : <p className="text-sm text-muted">No data for this network right now.</p>;
        })()
      )}
    </section>
  );
}

function Network({ n, held }: { n: ValidatorNetworkStats; held: number }) {
  const d = DEFAULTS[n.chain];
  const price = n.priceHistory[n.priceHistory.length - 1]?.price ?? 0;
  const execution = n.executionApr ?? 0;
  const history = n.consensusHistory;
  const yearAvg = history.length ? history.reduce((s, h) => s + h.apr, 0) / history.length : null;

  const [amountInput, setAmountInput] = useState(fmt(n.minStake));
  const [hardware, setHardware] = useState(d.hardware);
  const [monthly, setMonthly] = useState(d.monthly);
  const [fee, setFee] = useState(d.fee);
  const [uptime, setUptime] = useState(99);
  const [years, setYears] = useState(2);
  const [basis, setBasis] = useState<'today' | 'year'>('today');
  const [logMult, setLogMult] = useState(0);
  const [backtestDays, setBacktestDays] = useState(365);

  const amount = parseAmount(amountInput);
  // Solo: whole validators only on PulseChain (32M each); Ethereum validators take 32-2,048 ETH each
  const validators = n.chain === 'pulsechain' ? Math.floor(amount / n.minStake) : amount >= n.minStake ? Math.ceil(amount / n.maxEffective) : 0;
  const soloStake = n.chain === 'pulsechain' ? validators * n.minStake : validators ? amount : 0;
  const consensus = basis === 'year' && yearAvg !== null ? yearAvg : n.consensusApr;
  const soloRate = netRate(consensus, execution, uptime / 100);
  const pooledRate = (consensus + execution) * (1 - fee / 100);
  const mult = 10 ** logMult;
  const futurePrice = price * mult;

  const sim = useMemo(() => {
    const soloEarned = (soloStake * soloRate * years) / 100;
    const pooledEarned = (amount * pooledRate * years) / 100;
    const costs = hardware + monthly * 12 * years; // one machine runs any number of validators
    return {
      soloEarned,
      pooledEarned,
      costs,
      soloNet: soloEarned * futurePrice - costs,
      pooledNet: pooledEarned * futurePrice,
      breakEvenPrice: soloEarned > 0 ? costs / soloEarned : null,
      // Stake where solo's extra rewards (no fee) pay for its costs
      breakEvenStake: (soloRate - pooledRate) > 0 && futurePrice > 0 ? costs / (((soloRate - pooledRate) / 100) * years * futurePrice) : null,
    };
  }, [soloStake, soloRate, amount, pooledRate, years, hardware, monthly, futurePrice]);

  const backtest = useMemo(() => {
    // Anchored to the latest price sample, so the period ends where the data does
    const start = (n.priceHistory[n.priceHistory.length - 1]?.t ?? 0) - backtestDays * 86_400_000;
    const prices = n.priceHistory.filter((p) => p.t >= start - 86_400_000);
    if (prices.length < 2) return null;
    // Consensus rate on each day: PulseChain's samples (step-wise), Ethereum's today's rate
    const rateAt = (t: number) => {
      const past = history.filter((h) => h.t <= t);
      const before = past[past.length - 1] ?? history[0];
      return before ? before.apr : n.consensusApr;
    };
    let solo = 0;
    let pooled = 0;
    for (const p of prices.slice(1)) {
      const c = rateAt(p.t);
      solo += (soloStake * netRate(c, execution, uptime / 100)) / 100 / 365;
      pooled += (amount * (c + execution) * (1 - fee / 100)) / 100 / 365;
    }
    const startPrice = prices[0].price;
    const costs = hardware + monthly * (backtestDays / 30.44);
    return {
      startPrice,
      priceChange: (price / startPrice - 1) * 100,
      solo,
      pooled,
      costs,
      holdValue: amount * price,
      startValue: amount * startPrice,
      soloNet: solo * price - costs,
      pooledNet: pooled * price,
    };
  }, [backtestDays, n, history, soloStake, execution, uptime, amount, fee, hardware, monthly, price]);

  const color = HEX_CHAIN_COLORS[n.chain];
  const chartPoints = history.map((h) => ({ day: Math.round((h.t - HEX_EPOCH_MS) / 86_400_000), value: h.apr }));
  const short = n.chain === 'pulsechain' && amount > 0 && amount < n.minStake;

  return (
    <div className="space-y-6">
      {/* Network today */}
      <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile label="Reward rate today" value={pct(n.consensusApr + execution)} sub={`${pct(n.consensusApr)} protocol + ${n.executionApr !== null ? pct(execution) : '—'} ${n.chain === 'ethereum' ? 'MEV' : 'tips'}`} emphasis />
        <Tile label="One validator" value={`${fmt(n.minStake)} ${n.symbol}`} sub={price ? `≈ ${formatUSD(n.minStake * price)}` : undefined} />
        <Tile label="Active validators" value={fmt(n.validators)} />
        <Tile label="Total staked" value={`${n.totalStakedEstimated ? '≈ ' : ''}${fmt(n.totalStaked)} ${n.symbol}`} sub={price ? usdCompact(n.totalStaked * price) : undefined} />
      </dl>

      {chartPoints.length > 1 ? (
        <div>
        <LineChart
          title="Protocol reward rate, past year (perfect uptime)"
          series={[{ key: 'apr', label: `${n.symbol} validator`, color, points: chartPoints }]}
          formatValue={(v) => pct(v)}
          formatAxis={(v) => `${v.toFixed(0)}%`}
          reference={yearAvg !== null ? { value: yearAvg, label: `1-year avg ${pct(yearAvg)}` } : undefined}
          defaultRange="1y"
          note="Sampled every two weeks from PulseChain's beacon chain. The rate falls as more PLS is staked."
        />
        </div>
      ) : (
        <p className="rounded-xl bg-soft/60 p-3 text-xs text-muted">
          Ethereum&apos;s public beacon nodes don&apos;t keep history, so this uses today&apos;s rate. It has drifted down slowly
          for years as more ETH is staked; the rate is ∝ 1/√(total staked).
        </p>
      )}

      {/* Simulator */}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <div className="space-y-4">
          <Field label={`Amount (${n.symbol})`}>
            <div className="flex gap-2">
              <input
                inputMode="decimal"
                value={amountInput}
                onChange={(e) => setAmountInput(e.target.value)}
                className="min-w-0 flex-1 rounded-lg border border-line bg-white px-3 py-2 tabular-nums"
              />
              {held > 0 && (
                <button onClick={() => setAmountInput(fmt(held, 4))} className="shrink-0 rounded-lg bg-white px-3 py-2 text-xs font-medium text-ink/85 ring-1 ring-line hover:bg-soft/60">
                  Use my {fmt(held, 2)}
                </button>
              )}
            </div>
            <p className={`mt-1 text-xs ${short ? 'text-amber-700' : 'text-muted'}`}>
              {short
                ? `Solo needs ${fmt(n.minStake)} ${n.symbol}; below that only pooled staking works.`
                : validators > 0
                  ? `${validators} validator${validators === 1 ? '' : 's'}${n.chain === 'pulsechain' && amount > soloStake ? ` · ${fmt(amount - soloStake)} ${n.symbol} left over, unstaked` : ''}`
                  : `Solo needs at least ${fmt(n.minStake)} ${n.symbol}.`}
            </p>
          </Field>

          <Field label="How long">
            <Segmented options={YEARS.map((y) => ({ value: y, label: `${y}Y` }))} value={years} onChange={setYears} />
          </Field>

          {yearAvg !== null && (
            <Field label="Reward rate">
              <Segmented
                options={[{ value: 'today', label: `Today ${pct(n.consensusApr, 1)}` }, { value: 'year', label: `1-yr avg ${pct(yearAvg, 1)}` }]}
                value={basis}
                onChange={setBasis}
              />
            </Field>
          )}

          <Field label={`Uptime: ${uptime}%`}>
            <input type="range" min={90} max={100} step={0.5} value={uptime} onChange={(e) => setUptime(Number(e.target.value))} className="w-full accent-accent" aria-label="Validator uptime" />
            <p className="text-xs text-muted">Offline time earns nothing and costs a small penalty. Slashing is only for double-signing, never for downtime.</p>
          </Field>

          <div className="grid grid-cols-3 gap-2">
            <NumberField label="Hardware $" value={hardware} onChange={setHardware} />
            <NumberField label="Power + net $/mo" value={monthly} onChange={setMonthly} />
            <NumberField label="Pool fee %" value={fee} onChange={setFee} />
          </div>

          <Field label={`${n.symbol} price: ${multLabel(mult)}${price ? ` (${formatUSD(futurePrice)})` : ''}`}>
            <input type="range" min={MIN_LOG_MULT} max={MAX_LOG_MULT} step={0.01} value={logMult} onChange={(e) => setLogMult(Number(e.target.value))} className="w-full accent-accent" aria-label="Price scenario" />
            <div className="flex justify-between text-[10px] text-muted/70"><span>0.1×</span><button onClick={() => setLogMult(0)} className="hover:text-muted">today</button><span>10×</span></div>
          </Field>
        </div>

        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Option
              title="Your own validator"
              rate={validators ? soloRate : null}
              earned={sim.soloEarned}
              symbol={n.symbol}
              value={sim.soloEarned * futurePrice}
              costs={sim.costs}
              net={validators ? sim.soloNet : null}
            />
            <Option
              title={`Pooled (${fee}% fee)`}
              rate={pooledRate}
              earned={sim.pooledEarned}
              symbol={n.symbol}
              value={sim.pooledEarned * futurePrice}
              costs={0}
              net={sim.pooledNet}
            />
          </div>
          <Verdict
            validators={validators}
            soloNet={sim.soloNet}
            pooledNet={sim.pooledNet}
            breakEvenPrice={sim.breakEvenPrice}
            breakEvenStake={sim.breakEvenStake}
            price={price}
            symbol={n.symbol}
            years={years}
          />
          <p className="text-[11px] text-muted">
            Rewards aren&apos;t compounded and are valued at the scenario price. Pooled assumes a service or liquid-staking token that
            passes on rewards minus its fee. Your {fmt(amount)} {n.symbol} itself moves with the price either way.
          </p>
        </div>
      </div>

      {/* Backtest */}
      {backtest && (
        <div className="rounded-2xl bg-soft/50 p-4 ring-1 ring-line sm:p-5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-base font-semibold text-ink">If you&apos;d started…</h3>
            <Segmented options={BACKTEST.map((b) => ({ value: b.days, label: `${b.label} ago` }))} value={backtestDays} onChange={setBacktestDays} />
          </div>
          <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Tile label={`${n.symbol} price since`} value={`${backtest.priceChange >= 0 ? '+' : ''}${backtest.priceChange.toFixed(0)}%`} sub={`${formatUSD(backtest.startPrice)} → ${formatUSD(price)}`} />
            <Tile label="Solo earned" value={validators ? `${fmt(backtest.solo, 2)} ${n.symbol}` : '—'} sub={validators ? `${formatUSD(backtest.solo * price)} today, ${formatUSD(backtest.costs)} costs` : 'below one validator'} />
            <Tile label="Pooled earned" value={`${fmt(backtest.pooled, 2)} ${n.symbol}`} sub={`${formatUSD(backtest.pooledNet)} today`} />
            <Tile
              label="Stake + rewards today"
              value={formatUSD(backtest.holdValue + Math.max(validators ? backtest.soloNet : 0, backtest.pooledNet))}
              sub={`vs ${formatUSD(backtest.startValue)} at the start`}
              emphasis
            />
          </dl>
          <p className="mt-2 text-[11px] text-muted">
            Uses {n.consensusHistory.length ? 'PulseChain’s actual protocol rate over the period' : 'today’s protocol rate'} plus today&apos;s{' '}
            {n.chain === 'ethereum' ? 'MEV' : 'tip'} rate, your uptime and costs, and CoinGecko&apos;s daily prices. Staking adds{' '}
            {n.symbol} to your stack; it doesn&apos;t protect the dollar value from a falling price.
          </p>
        </div>
      )}

      <details className="group rounded-xl bg-white p-4 ring-1 ring-line">
        <summary className="cursor-pointer select-none text-sm font-medium text-accent">What running {n.chain === 'ethereum' ? 'an ETH' : 'a PLS'} validator takes</summary>
        <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sm text-ink/85">
          {n.chain === 'ethereum' ? (
            <>
              <li>32 ETH per validator. Since the Pectra upgrade (May 2025) one validator with compounding (0x02) credentials can hold up to 2,048 ETH, and its rewards compound automatically.</li>
              <li>An execution client and a consensus client running 24/7: a fast multi-terabyte NVMe SSD, 16–32 GB RAM and steady internet.</li>
              <li>Entering and exiting go through queues that can take days to weeks when many people move at once.</li>
              <li>MEV-Boost lets builders pay you for block space; without it, expect less execution income.</li>
            </>
          ) : (
            <>
              <li>32,000,000 PLS per validator, deposited through the PulseChain launchpad. Balances above 32M earn nothing extra; rewards are paid out to your withdrawal address.</li>
              <li>PulseChain&apos;s clients (go-pulse plus a PulseChain build of Lighthouse or Prysm) running 24/7 on Ethereum-class hardware: fast NVMe SSD, 16–32 GB RAM, steady internet.</li>
              <li>The protocol rate is about {pct(n.consensusApr, 1)} now and falls as total stake grows; block tips add about {pct(execution, 1)}.</li>
            </>
          )}
          <li>Keep your validator keys on one machine only: running the same keys twice is how validators get slashed.</li>
        </ul>
      </details>
    </div>
  );
}

function Verdict({ validators, soloNet, pooledNet, breakEvenPrice, breakEvenStake, price, symbol, years }: {
  validators: number; soloNet: number; pooledNet: number; breakEvenPrice: number | null; breakEvenStake: number | null; price: number; symbol: string; years: number;
}) {
  if (validators === 0) {
    return <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">Not enough for a validator of your own. Pooled staking is the way to earn on this amount.</p>;
  }
  const soloWins = soloNet > pooledNet;
  return (
    <div className={`rounded-xl p-3 text-sm ${soloWins ? 'bg-green-50 text-green-900 ring-1 ring-green-200' : 'bg-accent/10 text-ink ring-1 ring-accent/25'}`}>
      <p className="font-semibold">
        {soloWins
          ? `Running your own validator comes out ${formatUSD(soloNet - pooledNet)} ahead over ${years} year${years === 1 ? '' : 's'}.`
          : `Pooled comes out ${formatUSD(pooledNet - soloNet)} ahead: hardware and running costs outweigh the fee you'd save.`}
      </p>
      <p className="mt-1 text-xs opacity-80">
        {breakEvenPrice !== null && `Solo covers its costs if ${symbol} averages above ${formatUSD(breakEvenPrice)}${price ? (breakEvenPrice <= price ? ", which today's price clears" : `, ${(breakEvenPrice / price).toFixed(1)}× today's price`) : ''}. `}
        {breakEvenStake !== null && `At this price, solo beats pooled from about ${fmt(breakEvenStake)} ${symbol} staked.`}
      </p>
    </div>
  );
}

function Option({ title, rate, earned, symbol, value, costs, net }: {
  title: string; rate: number | null; earned: number; symbol: string; value: number; costs: number; net: number | null;
}) {
  return (
    <div className="min-w-0 rounded-xl bg-white p-3 ring-1 ring-line">
      <div className="text-xs font-medium uppercase tracking-wide text-muted">{title}</div>
      <div className="mt-1 text-xl font-bold tabular-nums text-ink">{net !== null ? formatUSD(net) : '—'}</div>
      <div className="text-[11px] text-muted">net, after costs</div>
      <dl className="mt-2 space-y-0.5 text-xs tabular-nums">
        <div className="flex justify-between gap-2"><dt className="text-muted">Rate</dt><dd className="text-ink">{rate !== null ? pct(rate) : '—'}</dd></div>
        <div className="flex justify-between gap-2"><dt className="text-muted">Earned</dt><dd className="truncate text-ink">{fmt(earned, 2)} {symbol}</dd></div>
        <div className="flex justify-between gap-2"><dt className="text-muted">Worth</dt><dd className="text-ink">{formatUSD(value)}</dd></div>
        <div className="flex justify-between gap-2"><dt className="text-muted">Costs</dt><dd className="text-ink">{costs ? `−${formatUSD(costs)}` : '—'}</dd></div>
      </dl>
    </div>
  );
}

function Tile({ label, value, sub, emphasis }: { label: string; value: string; sub?: string; emphasis?: boolean }) {
  return (
    <div className={`min-w-0 rounded-xl p-3 ring-1 ${emphasis ? 'bg-accent/5 ring-accent/25' : 'bg-white ring-line'}`}>
      <dt className="text-xs font-medium uppercase tracking-wide text-muted">{label}</dt>
      <dd className={`truncate text-lg font-bold tabular-nums ${emphasis ? 'text-accent' : 'text-ink'}`}>{value}</dd>
      {sub && <dd className="text-xs tabular-nums text-muted">{sub}</dd>}
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <div className="mb-1 text-sm font-medium text-ink/85">{label}</div>
      {children}
    </div>
  );
}

function NumberField({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <label className="block min-w-0">
      <span className="mb-1 block truncate text-xs font-medium text-muted">{label}</span>
      <input
        inputMode="decimal"
        value={value}
        onChange={(e) => onChange(Number(e.target.value.replace(/[^0-9.]/g, '')) || 0)}
        className="w-full rounded-lg border border-line bg-white px-2 py-1.5 text-sm tabular-nums"
      />
    </label>
  );
}

function Segmented<T extends string | number>({ options, value, onChange }: { options: { value: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="inline-flex flex-wrap rounded-lg bg-soft p-1">
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          aria-pressed={value === o.value}
          className={`rounded-md px-3 py-1 text-xs font-medium tabular-nums ${value === o.value ? 'bg-white text-ink shadow-sm' : 'text-muted hover:text-ink'}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
