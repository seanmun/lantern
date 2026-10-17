import { Asset } from '@/types';
import { Holding } from '@/utils/holdings';
import { formatUSD } from '@/utils/prices';

/**
 * The morning brief: a few plain sentences on what changed and what needs
 * attention, most important first. Every line comes from portfolio data.
 */

const compact = (v: number) =>
  v >= 1e9 ? `${(v / 1e9).toFixed(2)}B` : v >= 1e6 ? `${(v / 1e6).toFixed(1)}M` : v >= 1e4 ? `${(v / 1e3).toFixed(0)}k` : v.toLocaleString('en-US', { maximumFractionDigits: 0 });
const money = (v: number) => (Math.abs(v) >= 1000 ? `$${compact(Math.abs(v))}` : formatUSD(Math.abs(v)));

export interface BriefInput {
  assets: Asset[];
  holdings: Holding[];
  delta24h: number | null;     // USD
  changePct24h: number | null; // %
  autoHiddenCount: number;
}

export function morningBrief({ assets, holdings, delta24h, changePct24h, autoHiddenCount }: BriefInput): string[] {
  const lines: string[] = [];

  // What needs doing comes first
  const due = assets.filter((a) => a.stake && (a.stake.status === 'matured' || a.stake.status === 'late'));
  if (due.length) {
    const grace = Math.min(...due.map((a) => a.stake!.graceDaysLeft ?? 0));
    lines.push(`${due.length} HEX stake${due.length === 1 ? ' has' : 's have'} matured: end ${due.length === 1 ? 'it' : 'them'}${grace > 0 ? ` within ${grace} day${grace === 1 ? '' : 's'}` : ' now'} to avoid the late penalty.`);
  }

  // The day's move and what drove it
  if (delta24h !== null && changePct24h !== null && Math.abs(changePct24h) >= 0.05) {
    const movers = holdings
      .map((h) => ({ h, d: h.parts.reduce((s, p) => {
        const a = p.asset;
        if (a.valueUSD === undefined || a.change24hPct === undefined || a.change24hPct <= -100) return s;
        return s + a.valueUSD - a.valueUSD / (1 + a.change24hPct / 100);
      }, 0) }))
      .filter((m) => Math.sign(m.d) === Math.sign(delta24h))
      .sort((a, b) => Math.abs(b.d) - Math.abs(a.d));
    const lead = movers[0];
    const direction = delta24h >= 0 ? 'Up' : 'Down';
    const share = lead && Math.abs(delta24h) > 0 ? Math.abs(lead.d / delta24h) : 0;
    lines.push(`${direction} ${money(delta24h)} (${Math.abs(changePct24h).toFixed(1)}%) since yesterday${lead && share >= 0.4 ? `, mostly ${lead.h.symbol}` : ''}.`);
  }

  // The next HEX stake to land
  const next = assets
    .filter((a) => a.stake && a.stake.status === 'active')
    .sort((a, b) => a.stake!.daysRemaining - b.stake!.daysRemaining)[0];
  if (next?.stake) {
    const hex = Number(next.balanceFormatted) + next.stake.projectedInterestHex;
    const usd = next.priceUSD ? hex * next.priceUSD : null;
    const days = next.stake.daysRemaining;
    lines.push(`Your next HEX stake ends ${days <= 1 ? 'tomorrow' : `in ${days.toLocaleString()} days`}, returning about ${compact(hex)} HEX${usd ? ` (${money(usd)} today)` : ''}.`);
  }

  // Free money waiting
  const hdrn = assets.reduce((s, a) => s + (a.stake?.hdrnMintable ?? 0), 0);
  if (hdrn >= 1e6) lines.push(`${compact(hdrn)} HDRN is ready to mint from your stakes.`);

  if (autoHiddenCount > 0) lines.push(`${autoHiddenCount} suspicious token${autoHiddenCount === 1 ? ' was' : 's were'} hidden from your totals.`);

  return lines.slice(0, 3);
}
