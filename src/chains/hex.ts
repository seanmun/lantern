import 'server-only';
import { ethers } from 'ethers';
import { HEX_ABI, HEX_ADDRESS, HEX_DECIMALS } from '@/config/hex';
import { HexNetworkStats, HexStakeStatus } from '@/types';

/**
 * HEX staking math, mirroring the HEX contract (verified source):
 *
 *   payout = Σ dailyData[d].dayPayoutTotal * stakeShares / dailyData[d].dayStakeSharesTotal
 *            for d in [lockedDay, lockedDay + servedDays)
 *          + Big Pay Day slice (+ adoption bonus) if the stake spans day 352
 *
 * Daily data for past days never changes, so it is fetched once per chain and
 * cached in memory; later refreshes only fetch the new days.
 */

const LAUNCH_TIME = 1575331200; // 2019-12-03T00:00:00Z
const BIG_PAY_DAY = 352;
const HEARTS_PER_SATOSHI = BigInt(10_000);
const CLAIMABLE_BTC_ADDR_COUNT = BigInt(27_997_742);
const CLAIMABLE_SATOSHIS_TOTAL = BigInt('910087996911001');
const MASK_72 = (BigInt(1) << BigInt(72)) - BigInt(1);
const LATE_PENALTY_GRACE_DAYS = 14;
const LATE_PENALTY_SCALE_DAYS = 700;
const EARLY_PENALTY_MIN_DAYS = 90;
const RANGE_CHUNK = 500;
const GLOBALS_TTL_MS = 60_000;
const RECENT_DAYS = 30; // window for projecting future payouts
const ONE_T_SHARE = BigInt(10) ** BigInt(12);
const SCALE = BigInt(10) ** BigInt(18);

interface HexState {
  currentDay: number;
  dailyDataCount: number;
  payouts: bigint[]; // dayPayoutTotal, indexed by day
  shares: bigint[];  // dayStakeSharesTotal, indexed by day
  shareRate: bigint;
  lockedHeartsTotal: bigint;
  stakeSharesTotal: bigint;
  stakePenaltyTotal: bigint;
  totalSupply: bigint;
  unclaimedSatoshisTotal: bigint;
  claimedSatoshisTotal: bigint;
  claimedBtcAddrCount: bigint;
  fetchedAt: number;
}

const states = new Map<string, HexState>();
const inflight = new Map<string, Promise<HexState>>();

/**
 * Current HEX globals + full daily payout history for a chain (cached).
 */
export function getHexState(chainKey: string, provider: ethers.JsonRpcProvider): Promise<HexState> {
  const cached = states.get(chainKey);
  if (cached && Date.now() - cached.fetchedAt < GLOBALS_TTL_MS) return Promise.resolve(cached);

  // Concurrent requests for the same chain share one refresh
  let pending = inflight.get(chainKey);
  if (!pending) {
    pending = refreshState(chainKey, provider, cached).finally(() => inflight.delete(chainKey));
    inflight.set(chainKey, pending);
  }
  return pending;
}

async function refreshState(chainKey: string, provider: ethers.JsonRpcProvider, previous?: HexState): Promise<HexState> {
  const hex = new ethers.Contract(HEX_ADDRESS, HEX_ABI, provider);
  const g: bigint[] = await hex.globalInfo();
  const dailyDataCount = Number(g[4]);

  const payouts = previous ? [...previous.payouts] : [];
  const shares = previous ? [...previous.shares] : [];

  const ranges: [number, number][] = [];
  for (let begin = payouts.length; begin < dailyDataCount; begin += RANGE_CHUNK) {
    ranges.push([begin, Math.min(begin + RANGE_CHUNK, dailyDataCount)]);
  }
  const chunks: bigint[][] = await Promise.all(ranges.map(([b, e]) => hex.dailyDataRange(b, e)));
  for (const chunk of chunks) {
    for (const packed of chunk) {
      payouts.push(packed & MASK_72);
      shares.push((packed >> BigInt(72)) & MASK_72);
    }
  }

  const state: HexState = {
    currentDay: Math.floor((Number(g[10]) - LAUNCH_TIME) / 86_400),
    dailyDataCount,
    payouts,
    shares,
    shareRate: g[2],
    lockedHeartsTotal: g[0],
    stakeSharesTotal: g[5],
    stakePenaltyTotal: g[3],
    unclaimedSatoshisTotal: g[7],
    claimedSatoshisTotal: g[8],
    claimedBtcAddrCount: g[9],
    totalSupply: g[11],
    fetchedAt: Date.now(),
  };
  states.set(chainKey, state);
  return state;
}

/** Average payout per share over the most recent stored days, scaled by 1e18. */
function recentPayoutPerShare(state: HexState): bigint {
  const end = state.dailyDataCount;
  const begin = Math.max(0, end - RECENT_DAYS);
  let sum = BigInt(0);
  for (let d = begin; d < end; d++) {
    if (state.shares[d] > BigInt(0)) sum += (state.payouts[d] * SCALE) / state.shares[d];
  }
  return end > begin ? sum / BigInt(end - begin) : BigInt(0);
}

/**
 * Contract-equivalent payout for [beginDay, endDay). Days the contract hasn't
 * stored yet (usually just today) are estimated from the recent average.
 */
function calcPayout(state: HexState, stakeShares: bigint, beginDay: number, endDay: number): bigint {
  let payout = BigInt(0);
  const storedEnd = Math.min(endDay, state.dailyDataCount);

  for (let d = beginDay; d < storedEnd; d++) {
    if (state.shares[d] > BigInt(0)) payout += (state.payouts[d] * stakeShares) / state.shares[d];
  }

  const unstoredDays = endDay - Math.max(beginDay, storedEnd);
  if (unstoredDays > 0) {
    payout += (recentPayoutPerShare(state) * stakeShares * BigInt(unstoredDays)) / SCALE;
  }

  if (beginDay <= BIG_PAY_DAY && endDay > BIG_PAY_DAY && state.shares[BIG_PAY_DAY] > BigInt(0)) {
    const bigPaySlice = (state.unclaimedSatoshisTotal * HEARTS_PER_SATOSHI * stakeShares) / state.shares[BIG_PAY_DAY];
    const viral = (bigPaySlice * state.claimedBtcAddrCount) / CLAIMABLE_BTC_ADDR_COUNT;
    const crit = (bigPaySlice * state.claimedSatoshisTotal) / CLAIMABLE_SATOSHIS_TOTAL;
    payout += bigPaySlice + viral + crit;
  }

  return payout;
}

export interface StakePerformance {
  returnHearts: bigint;  // what stakeEnd would mint to the staker
  payoutHearts: bigint;
  penaltyHearts: bigint; // capped at principal + payout
}

/**
 * Mirrors the contract's _stakePerformance: what ending a stake returns after
 * `servedDays`, ended on `unlockedDay`. Early ends forfeit the payout of the
 * first half of the committed term (min 90 days); ends more than 14 days late
 * lose 1/700 of the return per extra day.
 */
export function stakePerformance(
  state: HexState,
  stake: { stakedHearts: bigint; stakeShares: bigint; lockedDay: number; stakedDays: number },
  servedDays: number,
  unlockedDay: number
): StakePerformance {
  const { stakedHearts, stakeShares, lockedDay, stakedDays } = stake;
  let payout = BigInt(0);
  let penalty = BigInt(0);

  if (servedDays < stakedDays) {
    const penaltyDays = Math.max(EARLY_PENALTY_MIN_DAYS, Math.floor((stakedDays + 1) / 2));
    const servedEnd = lockedDay + servedDays;

    if (servedDays === 0) {
      // Contract estimates one day's payout for the stake and charges it per penalty day
      const allocSupply = state.totalSupply + state.lockedHeartsTotal;
      const dayPayout = (allocSupply * BigInt(10000)) / BigInt(100448995) + state.stakePenaltyTotal;
      const expected = (dayPayout * stakeShares) / (state.stakeSharesTotal + stakeShares);
      penalty = expected * BigInt(penaltyDays);
    } else if (penaltyDays < servedDays) {
      const penaltyEnd = lockedDay + penaltyDays;
      penalty = calcPayout(state, stakeShares, lockedDay, penaltyEnd);
      payout = penalty + calcPayout(state, stakeShares, penaltyEnd, servedEnd);
    } else {
      payout = calcPayout(state, stakeShares, lockedDay, servedEnd);
      penalty = penaltyDays === servedDays ? payout : (payout * BigInt(penaltyDays)) / BigInt(servedDays);
    }
  } else {
    payout = calcPayout(state, stakeShares, lockedDay, lockedDay + stakedDays);
    const maxUnlockedDay = lockedDay + stakedDays + LATE_PENALTY_GRACE_DAYS;
    if (unlockedDay > maxUnlockedDay) {
      penalty = ((stakedHearts + payout) * BigInt(unlockedDay - maxUnlockedDay)) / BigInt(LATE_PENALTY_SCALE_DAYS);
    }
  }

  const gross = stakedHearts + payout;
  const capped = penalty > gross ? gross : penalty;
  return { returnHearts: gross - capped, payoutHearts: payout, penaltyHearts: capped };
}

/** What ending the stake today would return. */
export function endStakeToday(
  state: HexState,
  stake: { stakedHearts: bigint; stakeShares: bigint; lockedDay: number; stakedDays: number }
): StakePerformance {
  if (state.currentDay < stake.lockedDay) {
    // Not yet locked: principal comes back untouched
    return { returnHearts: stake.stakedHearts, payoutHearts: BigInt(0), penaltyHearts: BigInt(0) };
  }
  const servedDays = Math.min(state.currentDay - stake.lockedDay, stake.stakedDays);
  return stakePerformance(state, stake, servedDays, state.currentDay);
}

export interface StakeYield {
  interestHearts: bigint;
  interestHex: number;
  projectedInterestHex: number;
  apy: number;
  status: HexStakeStatus;
  servedDays: number;
  graceDaysLeft?: number;
}

/**
 * Interest earned so far, projected interest at maturity, and realized APY.
 */
export function stakeYield(
  state: HexState,
  stake: { stakedHearts: bigint; stakeShares: bigint; lockedDay: number; stakedDays: number }
): StakeYield {
  const endDay = stake.lockedDay + stake.stakedDays;
  const servedEnd = Math.min(endDay, state.currentDay);
  const servedDays = Math.max(0, servedEnd - stake.lockedDay);

  const accrued = servedDays > 0 ? calcPayout(state, stake.stakeShares, stake.lockedDay, servedEnd) : BigInt(0);
  const remainingDays = endDay - Math.max(servedEnd, stake.lockedDay);
  const projected = accrued + (recentPayoutPerShare(state) * stake.stakeShares * BigInt(Math.max(0, remainingDays))) / SCALE;

  const principal = Number(ethers.formatUnits(stake.stakedHearts, HEX_DECIMALS));
  const interestHex = Number(ethers.formatUnits(accrued, HEX_DECIMALS));
  const apy = principal > 0 && servedDays > 0 ? (interestHex / principal) * (365 / servedDays) * 100 : 0;

  let status: HexStakeStatus = 'active';
  let graceDaysLeft: number | undefined;
  if (state.currentDay < stake.lockedDay) {
    status = 'pending';
  } else if (state.currentDay >= endDay) {
    const lateFrom = endDay + LATE_PENALTY_GRACE_DAYS;
    status = state.currentDay >= lateFrom ? 'late' : 'matured';
    graceDaysLeft = Math.max(0, lateFrom - state.currentDay);
  }

  return {
    interestHearts: accrued,
    interestHex,
    projectedInterestHex: Number(ethers.formatUnits(projected, HEX_DECIMALS)),
    apy,
    status,
    servedDays,
    graceDaysLeft,
  };
}

/** Network-wide HEX numbers for the dashboard's stats strip. */
export function networkStats(chain: string, state: HexState): HexNetworkStats {
  const last = state.dailyDataCount - 1;
  const payoutPerTShare = last >= 0 && state.shares[last] > BigInt(0)
    ? (state.payouts[last] * ONE_T_SHARE) / state.shares[last]
    : BigInt(0);
  const locked = Number(ethers.formatUnits(state.lockedHeartsTotal, HEX_DECIMALS));
  const liquid = Number(ethers.formatUnits(state.totalSupply, HEX_DECIMALS));

  return {
    chain,
    currentDay: state.currentDay,
    // shareRate is hearts-per-share × 1e5, so HEX per T-Share = shareRate / 10
    tSharePriceHex: Number(state.shareRate) / 10,
    payoutPerTShareHex: Number(ethers.formatUnits(payoutPerTShare, HEX_DECIMALS)),
    stakedHex: locked,
    liquidHex: liquid,
    stakedPercent: locked + liquid > 0 ? (locked / (locked + liquid)) * 100 : 0,
    totalTShares: Number(ethers.formatUnits(state.stakeSharesTotal, 12)),
  };
}

/** Daily payout per T-Share (HEX) for every stored day, index = HEX day. */
export function payoutHistory(state: HexState): number[] {
  return state.payouts.map((payout, day) =>
    state.shares[day] > BigInt(0)
      ? Number((payout * ONE_T_SHARE * BigInt(1_000_000)) / state.shares[day]) / 1e6 / 1e8
      : 0
  );
}
