import { PrivacyFacts } from '@/types/privacy';

const MIN_TIMEZONE_SAMPLE = 20;
const MIN_TIMEZONE_DAYS = 7; // a single burst of activity has a 'quiet' stretch by accident

/**
 * Most people send nothing while asleep. The quietest six hours of a
 * wallet's own transactions, taken as roughly midnight to 6 a.m. local time,
 * give its likely UTC offset; no clear pause (bots, shared wallets) gives none.
 */
export function timezoneOf(times: number[]): PrivacyFacts['timezone'] {
  if (times.length < MIN_TIMEZONE_SAMPLE) return null;
  if (new Set(times.map((t) => new Date(t * 1000).toISOString().slice(0, 10))).size < MIN_TIMEZONE_DAYS) return null;
  const hours = new Array(24).fill(0);
  for (const t of times) hours[new Date(t * 1000).getUTCHours()]++;
  let start = 0;
  let quietest = Infinity;
  for (let s = 0; s < 24; s++) {
    let sum = 0;
    for (let k = 0; k < 6; k++) sum += hours[(s + k) % 24];
    if (sum < quietest) [quietest, start] = [sum, s];
  }
  if (quietest / times.length > 0.08) return null;
  // The window starts at local midnight
  const offset = ((((0 - start) % 24) + 36) % 24) - 12;
  return { offset, sample: times.length };
}
