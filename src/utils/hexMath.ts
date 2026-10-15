/**
 * Client-side HEX stake estimates, using the HEX contract's stake-start rules:
 *
 *   Longer Pays Better: +20% per extra year (extraDays / 1820), capped at 3640 extra days (+200%)
 *   Bigger Pays Better: up to +10%, scaled linearly over the first 150M HEX
 *   shares = (hearts + bonusHearts) × 1e5 / shareRate  ⇒  T-Shares = effectiveHex / tSharePriceHex
 *
 * Future interest can't be known; it's projected as T-Shares × an assumed
 * daily payout per T-Share × days, so the caller supplies that assumption.
 */

export const MIN_STAKE_DAYS = 1;
export const MAX_STAKE_DAYS = 5555;
const LPB_DAYS = 1820;
const LPB_MAX_EXTRA_DAYS = 3640;
const BPB_MAX_HEX = 150_000_000;

export interface StakeEstimate {
  longerPaysBetterPct: number;
  biggerPaysBetterPct: number;
  effectiveHex: number;
  tShares: number;
  interestHex: number;
  totalHex: number;
  roiPct: number;  // interest / principal
  apyPct: number;  // simple annualized
}

export function estimateStake(
  principalHex: number,
  stakedDays: number,
  tSharePriceHex: number,
  payoutPerTSharePerDay: number
): StakeEstimate {
  const days = Math.min(MAX_STAKE_DAYS, Math.max(MIN_STAKE_DAYS, Math.round(stakedDays)));
  const hex = Math.max(0, principalHex);

  const longer = Math.min(days - 1, LPB_MAX_EXTRA_DAYS) / LPB_DAYS;
  const bigger = Math.min(hex, BPB_MAX_HEX) / (BPB_MAX_HEX * 10);
  const effectiveHex = hex * (1 + longer + bigger);
  const tShares = tSharePriceHex > 0 ? effectiveHex / tSharePriceHex : 0;

  const interestHex = tShares * payoutPerTSharePerDay * days;
  const roiPct = hex > 0 ? (interestHex / hex) * 100 : 0;

  return {
    longerPaysBetterPct: longer * 100,
    biggerPaysBetterPct: bigger * 100,
    effectiveHex,
    tShares,
    interestHex,
    totalHex: hex + interestHex,
    roiPct,
    apyPct: (roiPct * 365) / days,
  };
}

/** Mean of the last `days` values (or fewer if the series is shorter). */
export function trailingAverage(series: number[], days: number): number {
  const slice = series.slice(-days);
  return slice.length ? slice.reduce((sum, v) => sum + v, 0) / slice.length : 0;
}

/** Centered-free trailing moving average, for smoothing a noisy daily series. */
export function movingAverage(series: number[], window: number): number[] {
  const out: number[] = [];
  let sum = 0;
  for (let i = 0; i < series.length; i++) {
    sum += series[i];
    if (i >= window) sum -= series[i - window];
    out.push(sum / Math.min(i + 1, window));
  }
  return out;
}
