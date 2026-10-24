import { Asset } from '@/types';
import { hexDayToDate } from '@/config/hex';

/**
 * The harvest calendar: everything in the portfolio with a known future date,
 * and what it's expected to bring in. HEX stakes pay principal plus interest
 * on their end day (projected at the recent payout rate while still running);
 * Icosa stakes can be ended without penalty once they've served their
 * minimum; Maximus pools end and restake each cycle (shown for information:
 * holders keep the pool token). Values are at today's prices.
 */

export type HarvestKind = 'hex-stake' | 'hex-late' | 'hdrn-mint' | 'icosa' | 'pool-cycle';

export interface HarvestEvent {
  id: string;
  kind: HarvestKind;
  date: Date;            // UTC day the event happens (or became available)
  ready: boolean;        // available now rather than in the future
  title: string;
  detail: string;
  chain: string;
  walletAddress: string;
  amount: number;        // of `symbol`
  symbol: string;
  valueUSD: number | null;
  urgentBy?: Date;       // act before this date (matured HEX stakes: the late penalty starts)
  counts: boolean;       // adds to the harvest totals (pool cycles don't: nothing is paid out)
}

export interface HarvestPrices {
  hex: Record<string, number | null | undefined>;  // per chain
  hdrn: Record<string, number | null | undefined>; // per chain
}

const DAY_MS = 86_400_000;
const GRACE_DAYS = 14;
const startOfUtcDay = (t: number) => Math.floor(t / DAY_MS) * DAY_MS;

/** Price of one unit of an asset, from its own value (stakes are valued at their principal). */
const unitPrice = (a: Asset) => {
  const balance = Number(a.balanceFormatted);
  return a.valueUSD !== undefined && balance > 0 ? a.valueUSD / balance : null;
};

export function harvestEvents(assets: Asset[], prices: HarvestPrices, now = Date.now()): HarvestEvent[] {
  const today = startOfUtcDay(now);
  const events: HarvestEvent[] = [];
  const mintable = new Map<string, { chain: string; walletAddress: string; hdrn: number; stakes: number }>();

  for (const a of assets) {
    if (a.type === 'stake' && a.stake) {
      const s = a.stake;
      const principal = Number(a.balanceFormatted);
      const running = s.status === 'active' || s.status === 'pending';
      const payout = principal + (running ? s.projectedInterestHex : s.interestHex);
      const price = prices.hex[a.chain] ?? unitPrice(a);
      const end = hexDayToDate(s.endDay);
      const label = `${s.hsi ? 'HSI' : 'HEX stake'} #${s.stakeId}`;
      if (s.status === 'late') {
        events.push({
          id: `${a.id}:late`, kind: 'hex-late', date: end, ready: true, chain: a.chain, walletAddress: a.walletAddress,
          title: `${label} is late`, detail: 'Its late-end penalty grows every day it stays open. End it as soon as you can.',
          amount: s.endNow.returnHex, symbol: 'HEX', valueUSD: price ? s.endNow.returnHex * price : null, counts: true,
        });
      } else {
        const matured = s.status === 'matured';
        events.push({
          id: `${a.id}:end`, kind: 'hex-stake', date: end, ready: matured, chain: a.chain, walletAddress: a.walletAddress,
          title: matured ? `${label} is ready to end` : `${label} ends`,
          detail: matured
            ? `End it within ${s.graceDaysLeft ?? GRACE_DAYS} day${(s.graceDaysLeft ?? GRACE_DAYS) === 1 ? '' : 's'} to avoid the late penalty.`
            : `${Math.round(principal).toLocaleString('en-US')} HEX principal + about ${Math.round(s.projectedInterestHex).toLocaleString('en-US')} HEX interest, at the recent payout rate.`,
          amount: payout, symbol: 'HEX', valueUSD: price ? payout * price : null,
          urgentBy: matured ? new Date(end.getTime() + GRACE_DAYS * DAY_MS) : undefined, counts: true,
        });
      }
      if (s.hdrnMintable && s.hdrnMintable > 0 && !s.hdrnLoaned) {
        // One row per wallet and chain: a stake ladder would otherwise list every rung
        const key = `${a.chain}:${a.walletAddress.toLowerCase()}`;
        const m = mintable.get(key) ?? { chain: a.chain, walletAddress: a.walletAddress, hdrn: 0, stakes: 0 };
        m.hdrn += s.hdrnMintable;
        m.stakes += 1;
        mintable.set(key, m);
      }
    }

    if (a.icosa && a.icosa.role === 'principal') {
      const i = a.icosa;
      const date = new Date(today + Math.max(0, i.daysUntilMature) * DAY_MS);
      const ready = i.daysUntilMature <= 0;
      const what = i.pool === 'NFT' ? `WAATSA NFT stake${(i.stakeCount ?? 1) > 1 ? `s (${i.stakeCount})` : ''}` : `${i.pool} stake in Icosa`;
      events.push({
        id: `${a.id}:icosa`, kind: 'icosa', date, ready, chain: a.chain, walletAddress: a.walletAddress,
        title: ready ? `${what} has matured` : `${what} matures`,
        detail: ready ? 'It has served its minimum; ending it now returns the full principal.' : `After ${i.minStakeDays} days served; ending sooner costs a penalty.`,
        amount: Number(a.balanceFormatted), symbol: a.symbol, valueUSD: a.valueUSD ?? null, counts: true,
      });
    }

    if (a.pool?.currentStake) {
      const cs = a.pool.currentStake;
      events.push({
        id: `${a.id}:cycle`, kind: 'pool-cycle', date: new Date(cs.endDate), ready: false, chain: a.chain, walletAddress: a.walletAddress,
        title: `${a.pool.poolName} cycle ends`, detail: 'The pool ends its stake and starts the next cycle; your pool tokens carry on.',
        amount: a.pool.backingHex, symbol: 'HEX', valueUSD: a.pool.backingValueUSD ?? null, counts: false,
      });
    }
  }

  for (const [key, m] of mintable) {
    const hdrnPrice = prices.hdrn[m.chain];
    events.push({
      id: `hdrn:${key}`, kind: 'hdrn-mint', date: new Date(today), ready: true, chain: m.chain, walletAddress: m.walletAddress,
      title: `HDRN ready to mint from ${m.stakes === 1 ? '1 stake' : `${m.stakes} stakes`}`,
      detail: 'Hedron lets these stakes mint HDRN now; minting doesn’t touch the stakes.',
      amount: m.hdrn, symbol: 'HDRN', valueUSD: hdrnPrice ? m.hdrn * hdrnPrice : null, counts: true,
    });
  }

  // Ready items first (most urgent at the top), then by date
  return events.sort((x, y) => Number(y.ready) - Number(x.ready) || (x.urgentBy?.getTime() ?? x.date.getTime()) - (y.urgentBy?.getTime() ?? y.date.getTime()));
}

export interface HarvestPeriod {
  key: string;
  label: string;
  events: HarvestEvent[];
  valueUSD: number;
}

/** Group events into "Ready now", "Next 30 days", "Later this year", then each calendar year. */
export function harvestPeriods(events: HarvestEvent[], now = Date.now()): HarvestPeriod[] {
  const today = startOfUtcDay(now);
  const year = new Date(now).getUTCFullYear();
  const periods = new Map<string, HarvestPeriod>();
  const order: string[] = [];
  const add = (key: string, label: string, e: HarvestEvent) => {
    let p = periods.get(key);
    if (!p) {
      p = { key, label, events: [], valueUSD: 0 };
      periods.set(key, p);
      order.push(key);
    }
    p.events.push(e);
    if (e.counts && e.valueUSD) p.valueUSD += e.valueUSD;
  };
  const sorted = [...events].sort((x, y) => Number(y.ready) - Number(x.ready) || x.date.getTime() - y.date.getTime());
  for (const e of sorted) {
    const t = e.date.getTime();
    if (e.ready) add('ready', 'Ready now', e);
    else if (t < today + 30 * DAY_MS) add('30d', 'Next 30 days', e);
    else if (e.date.getUTCFullYear() === year) add('year', 'Later this year', e);
    else add(String(e.date.getUTCFullYear()), String(e.date.getUTCFullYear()), e);
  }
  return order.map((k) => periods.get(k)!);
}

/** Totals for the headline tiles: what lands within each horizon (ready items count in all). */
export function harvestTotals(events: HarvestEvent[], now = Date.now()) {
  const today = startOfUtcDay(now);
  const within = (days: number) => events.filter((e) => e.counts && (e.ready || e.date.getTime() < today + days * DAY_MS)).reduce((s, e) => s + (e.valueUSD ?? 0), 0);
  return {
    ready: events.filter((e) => e.counts && e.ready).reduce((s, e) => s + (e.valueUSD ?? 0), 0),
    days30: within(30),
    year: within(365),
    years5: within(5 * 365),
    all: events.filter((e) => e.counts).reduce((s, e) => s + (e.valueUSD ?? 0), 0),
  };
}
