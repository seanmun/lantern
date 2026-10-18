'use client';

import { useState } from 'react';
import { Asset, EndedStake, HexStakeStatus } from '@/types';
import { chainLabel } from '@/config/chainDisplay';
import { formatUSD } from '@/utils/prices';
import { HexStatsWithPrice } from '@/hooks/useHexStats';
import { Hexagon } from '@/components/hex/Hexagon';
import { HexNetworkStrip } from '@/components/hex/HexNetworkStrip';
import { LadderRow, StakeLadder } from '@/components/hex/StakeLadder';
import { MaturityCalendar } from '@/components/hex/MaturityCalendar';
import { ForkComparison } from '@/components/hex/ForkComparison';
import { buildIcs, downloadFile } from '@/utils/ics';
import { StakeHistory } from '@/components/hex/StakeHistory';
import { StakeAlerts } from '@/components/hex/StakeAlerts';
import { StakeCard } from '@/components/hex/StakeCard';
import { MaximusView } from '@/components/hex/MaximusView';
import { IcosaView } from '@/components/hex/IcosaView';
import { MAXIMUS_TEAM_ADDRESS, hexDayToDate } from '@/config/hex';

interface HexSummaryProps {
  assets: Asset[];
  walletNames: Map<string, string>;
  hexStats: HexStatsWithPrice[];
  endedStakes: EndedStake[];
  historyUnavailable: string[];
}

const formatHex = (value: number) => value.toLocaleString('en-US', { maximumFractionDigits: 0 });
const formatPct = (value: number) => `${value.toLocaleString('en-US', { maximumFractionDigits: 1 })}%`;
const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' });

function StatusBadge({ status, graceDaysLeft }: { status: HexStakeStatus; graceDaysLeft?: number }) {
  if (status === 'late') {
    return <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">⚠ Late penalty</span>;
  }
  if (status === 'matured') {
    return (
      <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800">
        ✓ Matured · {graceDaysLeft}d grace
      </span>
    );
  }
  if (status === 'pending') {
    return <span className="rounded-full bg-soft px-2 py-0.5 text-xs font-medium text-ink/85">Starts tomorrow</span>;
  }
  return <span className="text-xs text-muted">Active</span>;
}

/**
 * HEX-specific view: network stats, portfolio-level stake totals, the stake
 * ladder timeline, and detail tables for stakes and Maximus pools.
 */
const STAKE_ROWS_COLLAPSED = 9; // three rows of cards on wide screens

export function HexSummary({ assets, walletNames, hexStats, endedStakes, historyUnavailable }: HexSummaryProps) {
  const [showAllStakes, setShowAllStakes] = useState(false);
  const stakes = assets
    .filter((a): a is Asset & { stake: NonNullable<Asset['stake']> } => a.type === 'stake' && !!a.stake)
    .sort((a, b) => a.stake.endDay - b.stake.endDay);
  const pools = assets
    .filter((a): a is Asset & { pool: NonNullable<Asset['pool']> } => !!a.pool)
    .sort((a, b) => (b.valueUSD ?? 0) - (a.valueUSD ?? 0));
  const hasLiquidHex = assets.some((a) => a.type === 'token' && a.symbol === 'HEX');
  const hasIcosa = assets.some((a) => a.icosa);
  const hasMaximus = pools.length > 0 || assets.some((a) => a.contractAddress?.toLowerCase() === MAXIMUS_TEAM_ADDRESS.toLowerCase());

  if (stakes.length === 0 && !hasMaximus && !hasIcosa && !hasLiquidHex && endedStakes.length === 0) return null;

  const hexPrices = Object.fromEntries(hexStats.map((x) => [x.chain, x.hexPriceUSD]));
  const walletName = (a: Asset) => walletNames.get(a.walletAddress.toLowerCase()) ?? '';
  const currentDay = hexStats[0]?.currentDay ?? Math.max(0, ...stakes.map((a) => a.stake.endDay - a.stake.daysRemaining));

  const principal = stakes.reduce((sum, a) => sum + Number(a.balanceFormatted), 0);
  const interest = stakes.reduce((sum, a) => sum + a.stake.interestHex, 0);
  const projected = stakes.reduce((sum, a) => sum + a.stake.projectedInterestHex, 0);
  const tShares = stakes.reduce((sum, a) => sum + a.stake.tShares, 0);
  const stakeValue = stakes.reduce((sum, a) => sum + (a.valueUSD ?? 0), 0);
  const weightedApy = principal > 0 ? stakes.reduce((sum, a) => sum + a.stake.apy * Number(a.balanceFormatted), 0) / principal : 0;
  const nextEnd = stakes.find((a) => a.stake.status === 'active');
  const needsAction = stakes.filter((a) => a.stake.status === 'matured' || a.stake.status === 'late');
  const interestUSD = stakes.reduce((sum, a) => sum + (a.priceUSD ?? 0) * a.stake.interestHex, 0);
  const hdrnPrices = Object.fromEntries(hexStats.map((x) => [x.chain, x.hdrnPriceUSD]));
  const hdrnMintable = stakes.reduce((sum, a) => sum + (a.stake.hdrnMintable ?? 0), 0);
  const hdrnMintableUSD = stakes.reduce((sum, a) => sum + (a.stake.hdrnMintable ?? 0) * (hdrnPrices[a.chain] ?? 0), 0);
  const hsiCount = stakes.filter((a) => a.stake.hsi).length;
  const compactHex = (v: number) => (v >= 1e9 ? `${(v / 1e9).toFixed(2)}B` : v >= 1e6 ? `${(v / 1e6).toFixed(2)}M` : formatHex(v));

  const exportCalendar = () => {
    const events = stakes
      .filter((a) => a.stake.status !== 'late')
      .flatMap((a) => {
        const label = `HEX stake #${a.stake.stakeId} (${chainLabel(a.chain)})`;
        const amount = `${formatHex(Number(a.balanceFormatted))} HEX principal + est. ${formatHex(a.stake.projectedInterestHex)} HEX interest`;
        return [
          {
            uid: `${a.id}-end@lantern`,
            title: `${label} ends`,
            date: hexDayToDate(a.stake.endDay),
            description: `${amount}. Wallet: ${walletName(a)} (${a.walletAddress}). End it within 14 days to avoid the late penalty.`,
            alarmDaysBefore: 1,
          },
          {
            uid: `${a.id}-grace@lantern`,
            title: `Last day to end ${label} without penalty`,
            date: hexDayToDate(a.stake.endDay + 14),
            description: `From tomorrow HEX deducts a late-end penalty from this stake. Wallet: ${a.walletAddress}.`,
            alarmDaysBefore: 3,
          },
        ];
      });
    downloadFile('hex-stakes.ics', buildIcs(events));
  };

  const ladderRows: LadderRow[] = [
    ...stakes.map((a) => ({
      id: a.id,
      label: `#${a.stake.stakeId}`,
      sub: walletName(a),
      chain: a.chain,
      lockedDay: a.stake.lockedDay,
      endDay: a.stake.endDay,
      status: a.stake.status,
      details: [
        { label: 'principal', value: `${formatHex(Number(a.balanceFormatted))} HEX` },
        { label: 'interest so far', value: `${formatHex(a.stake.interestHex)} HEX` },
        { label: 'value', value: a.valueUSD !== undefined ? formatUSD(a.valueUSD) : '—' },
        { label: 'T-Shares', value: a.stake.tShares.toLocaleString('en-US', { maximumFractionDigits: 3 }) },
        { label: 'APY', value: formatPct(a.stake.apy) },
        ...(a.stake.hdrnMintable ? [{ label: 'HDRN mintable', value: compactHex(a.stake.hdrnMintable) }] : []),
        {
          label: a.stake.endNow.penaltyHex > 0 ? `if ended today (−${formatHex(a.stake.endNow.penaltyHex)} penalty)` : 'if ended today',
          value: `${formatHex(a.stake.endNow.returnHex)} HEX`,
        },
        { label: a.stake.daysRemaining > 0 ? `${a.stake.daysRemaining.toLocaleString()} days left` : 'ended', value: formatDate(a.stake.endDate) },
      ],
    })),
    ...pools
      .filter((a) => a.pool.currentStake)
      .map((a) => {
        const s = a.pool.currentStake!;
        return {
          id: `${a.id}_pool`,
          label: `${a.symbol} pool`,
          sub: walletName(a),
          chain: a.chain,
          lockedDay: s.lockedDay,
          endDay: s.endDay,
          status: (s.daysRemaining > 0 ? 'active' : 'matured') as HexStakeStatus,
          details: [
            { label: `your ${a.symbol}`, value: formatHex(Number(a.balanceFormatted)) },
            { label: 'HEX backing', value: `${formatHex(a.pool.backingHex)} HEX` },
            { label: 'pool APY', value: formatPct(s.apy) },
            { label: `${s.stakedDays.toLocaleString()}-day cycle ends`, value: formatDate(s.endDate) },
          ],
        };
      }),
  ].sort((a, b) => a.endDay - b.endDay);

  return (
    <section className="rounded-3xl border border-line bg-white p-6 sm:p-8">
      <div className="mb-6 flex items-center gap-3">
        <Hexagon size={36} />
        <h2 className="text-2xl font-extrabold tracking-tight text-ink">HEX</h2>
      </div>

      <div className="mb-6">
        <HexNetworkStrip stats={hexStats} />
      </div>

      {stakes.length > 0 && (
        <>
          <dl className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
            <HeroStat label="Staked value" value={formatUSD(stakeValue)} sub="principal + interest" emphasis />
            <HeroStat label="Principal" value={`${formatHex(principal)} HEX`} />
            <HeroStat label="Interest earned" value={`${formatHex(interest)} HEX`} sub={interestUSD ? formatUSD(interestUSD) : undefined} />
            <HeroStat label="At maturity (est.)" value={`${formatHex(principal + projected)} HEX`} sub="at recent payout rate" />
            <HeroStat label="T-Shares" value={tShares.toLocaleString('en-US', { maximumFractionDigits: 3 })} sub={`avg APY ${formatPct(weightedApy)}${hsiCount ? ` · ${hsiCount} HSI${hsiCount === 1 ? '' : 's'}` : ''}`} />
            <HeroStat
              label="Next maturity"
              value={nextEnd ? `${nextEnd.stake.daysRemaining.toLocaleString()} days` : '—'}
              sub={nextEnd ? formatDate(nextEnd.stake.endDate) : undefined}
            />
          </dl>

          {hdrnMintable > 0 && (
            <div className="mb-6 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-accent/25 bg-accent/10 p-3 text-sm text-ink">
              <span>
                ⬡ <strong className="tabular-nums">{compactHex(hdrnMintable)} HDRN</strong> mintable from your stakes
                {hdrnMintableUSD > 0 && <span className="tabular-nums"> (≈ {formatUSD(hdrnMintableUSD)})</span>}
                {hsiCount > 0 && <span className="text-accent"> · includes {hsiCount} Hedron HSI{hsiCount === 1 ? '' : 's'}</span>}
              </span>
              <span className="text-xs text-accent">Hedron pays 1,000 HDRN per T-Share per day served. Not counted in your total until minted.</span>
            </div>
          )}

          {needsAction.length > 0 && (
            <p className="mb-6 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              ⚠ {needsAction.length} stake{needsAction.length === 1 ? ' has' : 's have'} reached maturity. Interest stopped at the end
              day, and HEX starts a late-end penalty 14 days after it, so end {needsAction.length === 1 ? 'it' : 'them'} soon.
            </p>
          )}
        </>
      )}

      {ladderRows.length > 0 && (
        <div className="mb-8">
          <h3 className="mb-3 text-lg font-semibold text-ink">Stake ladder</h3>
          <StakeLadder rows={ladderRows} currentDay={currentDay} />
        </div>
      )}

      {stakes.length > 0 && (
        <div className="mb-8">
          <h3 className="mb-3 text-lg font-semibold text-ink">Maturity calendar</h3>
          <MaturityCalendar stakes={stakes} hexPrices={hexPrices} />
        </div>
      )}

      <div className="mb-8 empty:hidden">
        <ForkComparison assets={assets} hexPrices={hexPrices} />
      </div>

      {stakes.length > 0 && (
        <div className="mb-8">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-lg font-semibold text-ink">Stakes <span className="text-sm font-normal text-muted">by end date</span></h3>
            <div className="flex flex-wrap gap-2">
            <StakeAlerts stakes={stakes} />
            <button
              onClick={exportCalendar}
              className="inline-flex h-10 items-center gap-1.5 rounded-full bg-soft px-4 text-sm font-semibold text-ink hover:bg-line"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden="true"><path d="M4 6h16v14H4zM4 10h16M8 3v4M16 3v4" /></svg>
              Add end dates to calendar (.ics)
            </button>
            </div>
          </div>
          {/* Soonest end date first, so matured stakes that need ending lead */}
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {(showAllStakes ? stakes : stakes.slice(0, STAKE_ROWS_COLLAPSED)).map((a) => (
              <StakeCard
                key={a.id}
                asset={a}
                walletName={walletName(a)}
                statusBadge={<StatusBadge status={a.stake.status} graceDaysLeft={a.stake.graceDaysLeft} />}
              />
            ))}
          </div>
          {stakes.length > STAKE_ROWS_COLLAPSED && (
            <button
              onClick={() => setShowAllStakes((v) => !v)}
              className="mt-3 inline-flex h-10 items-center gap-1.5 rounded-full bg-soft px-4 text-sm font-semibold text-ink hover:bg-line"
            >
              {showAllStakes ? 'Show fewer' : `Show all ${stakes.length} stakes`}
            </button>
          )}
        </div>
      )}

      {/* Maximus perps + TEAM, Pulsechain beside Ethereum (shown when any are held) */}
      {hasMaximus && (
        <div className="mb-2">
          <MaximusView assets={assets} hexStats={hexStats} />
        </div>
      )}

      {/* HDRN, ICSA and WAATSA NFT stakes in Icosa */}
      {hasIcosa && (
        <div className="mt-8 mb-2">
          <IcosaView assets={assets} />
        </div>
      )}

      <div className="mt-8 empty:hidden">
        <StakeHistory
          stakes={endedStakes}
          unavailable={historyUnavailable}
          walletName={(address) => walletNames.get(address.toLowerCase()) ?? ''}
          hexPrices={hexPrices}
        />
      </div>
    </section>
  );
}

function HeroStat({ label, value, sub, emphasis }: { label: string; value: string; sub?: string; emphasis?: boolean }) {
  return (
    <div className={`rounded-xl p-4 ${emphasis ? 'bg-accent text-white' : 'bg-white'}`}>
      <dt className={`text-xs uppercase tracking-wide ${emphasis ? 'text-white/80' : 'text-muted'}`}>{label}</dt>
      <dd className={`mt-1 text-lg font-bold tabular-nums ${emphasis ? 'text-white' : 'text-ink'}`}>{value}</dd>
      {sub && <dd className={`text-xs ${emphasis ? 'text-white/80' : 'text-muted'}`}>{sub}</dd>}
    </div>
  );
}
