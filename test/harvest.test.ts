import { test } from 'node:test';
import assert from 'node:assert/strict';
import { harvestEvents, harvestPeriods, harvestTotals } from '@/utils/harvest';
import { hexDayToDate } from '@/config/hex';
import { Asset, HexStakeInfo } from '@/types';

// Fixed "now": 2026-10-24 00:00 UTC, which is HEX day 2517
const NOW = Date.UTC(2026, 9, 24);
const TODAY = Math.round((NOW - Date.UTC(2019, 11, 3)) / 86_400_000);

const stake = (id: number, chain: string, endDay: number, status: HexStakeInfo['status'], extra: Partial<HexStakeInfo> = {}): Asset => ({
  id: `${chain}-stake-${id}`, type: 'stake', chain, walletAddress: '0xw', name: 'HEX stake', symbol: 'HEX', decimals: 8,
  balance: '1000', balanceFormatted: '1000', valueUSD: 1000 * (chain === 'ethereum' ? 0.005 : 0.002), lastUpdated: new Date(NOW),
  stake: {
    stakeId: id, tShares: 1, lockedDay: endDay - 365, stakedDays: 365, endDay, endDate: hexDayToDate(endDay).toISOString(),
    daysRemaining: endDay - TODAY, interestHex: 50, projectedInterestHex: 100, apy: 10, status,
    endNow: { returnHex: 900, penaltyHex: 100 }, ...extra,
  },
} as Asset);

const prices = { hex: { ethereum: 0.005, pulsechain: 0.002 }, hdrn: { pulsechain: 0.0000001 } };

test('a running stake pays principal plus projected interest, at its own chain’s HEX price', () => {
  const [eth] = harvestEvents([stake(1, 'ethereum', TODAY + 10, 'active')], prices, NOW);
  const [pls] = harvestEvents([stake(2, 'pulsechain', TODAY + 10, 'active')], prices, NOW);
  assert.equal(eth.amount, 1100);
  assert.equal(eth.valueUSD, 1100 * 0.005, 'eHEX at the eHEX price');
  assert.equal(pls.valueUSD, 1100 * 0.002, 'pHEX at the pHEX price');
  assert.equal(eth.ready, false);
});

test('ready items come first, the most urgent at the top', () => {
  const events = harvestEvents([
    stake(1, 'pulsechain', TODAY + 200, 'active'),
    stake(2, 'pulsechain', TODAY - 3, 'matured', { graceDaysLeft: 11 }),
    stake(3, 'pulsechain', TODAY - 30, 'late'),
    stake(4, 'pulsechain', TODAY + 5, 'active', { hdrnMintable: 1e9 }),
    stake(5, 'pulsechain', TODAY + 6, 'active', { hdrnMintable: 2e9 }),
  ], prices, NOW);
  assert.deepEqual(events.map((e) => e.kind), ['hex-late', 'hdrn-mint', 'hex-stake', 'hex-stake', 'hex-stake', 'hex-stake']);
  const mint = events.find((e) => e.kind === 'hdrn-mint')!;
  assert.equal(mint.amount, 3e9, 'one HDRN row per wallet and chain, summed');
  assert.match(mint.title, /2 stakes/);
  const matured = events.find((e) => e.id.includes('stake-2'))!;
  assert.equal(matured.ready, true);
  assert.match(matured.detail, /within 11 days/);
  assert.equal(matured.urgentBy!.getTime(), hexDayToDate(TODAY - 3 + 14).getTime());
  assert.equal(events[0].amount, 900, 'a late stake shows what ending it now returns');
});

test('a loaned HSI offers no HDRN to mint', () => {
  const events = harvestEvents([stake(1, 'pulsechain', TODAY + 5, 'active', { hdrnMintable: 1e9, hdrnLoaned: true })], prices, NOW);
  assert.equal(events.filter((e) => e.kind === 'hdrn-mint').length, 0);
});

test('periods: ready now, next 30 days, later this year, then by year', () => {
  const events = harvestEvents([
    stake(1, 'pulsechain', TODAY - 2, 'matured'),
    stake(2, 'pulsechain', TODAY + 10, 'active'),
    stake(3, 'pulsechain', TODAY + 50, 'active'), // mid-December 2026
    stake(4, 'pulsechain', TODAY + 400, 'active'), // 2027
    stake(5, 'pulsechain', TODAY + 1200, 'active'), // 2030
  ], prices, NOW);
  assert.deepEqual(harvestPeriods(events, NOW).map((p) => p.label), ['Ready now', 'Next 30 days', 'Later this year', '2027', '2030']);
});

test('pool cycle ends are listed but never counted as income', () => {
  const pool = {
    id: 'maxi', type: 'token', chain: 'ethereum', walletAddress: '0xw', name: 'Maximus', symbol: 'MAXI', decimals: 8,
    balance: '10', balanceFormatted: '10', valueUSD: 50, lastUpdated: new Date(NOW),
    pool: { poolName: 'MAXI', cycleDays: 5555, principalBackingHex: 10, backingHex: 12, backingValueUSD: 60,
      currentStake: { lockedDay: 0, stakedDays: 5555, endDay: TODAY + 100, endDate: hexDayToDate(TODAY + 100).toISOString(), daysRemaining: 100, apy: 5 } },
  } as Asset;
  const events = harvestEvents([pool, stake(1, 'ethereum', TODAY + 10, 'active')], prices, NOW);
  assert.ok(events.some((e) => e.kind === 'pool-cycle' && !e.counts));
  const totals = harvestTotals(events, NOW);
  assert.equal(totals.all, 1100 * 0.005);
  assert.equal(totals.days30, 1100 * 0.005);
  assert.equal(totals.ready, 0);
});
