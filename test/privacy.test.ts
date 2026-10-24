import { test } from 'node:test';
import assert from 'node:assert/strict';
import { privacyScore } from '@/utils/privacyScore';
import { timezoneOf } from '@/utils/timezone';
import { PrivacyFacts } from '@/types/privacy';

const facts = (over: Partial<PrivacyFacts> = {}): PrivacyFacts => ({
  address: '0x0000000000000000000000000000000000000001', ens: null, ensRecords: [], identityTags: [], activeChains: ['ethereum'],
  transactions: 10, exchanges: [], privacyTools: [], counterparties: [], sampled: 10, funder: null, deposits: [], twoWay: 0, timezone: null,
  ...over,
});
const ctx = { otherWallets: [] as string[], valueUSD: 0, nftCount: 0 };
const ids = (s: ReturnType<typeof privacyScore>) => s.factors.map((f) => f.id);

test('a quiet wallet with nothing public scores 100 and private', () => {
  const s = privacyScore(facts(), ctx);
  assert.equal(s.score, 100);
  assert.equal(s.band, 'private');
  assert.equal(s.linked.count, 0);
});

test('identity signals lower the score into the right band', () => {
  const s = privacyScore(facts({ ens: 'me.eth', ensRecords: ['X (Twitter)'], identityTags: ['Someone'] }), ctx);
  assert.deepEqual(ids(s), ['identity-tags', 'ens', 'ens-records']);
  assert.equal(s.score, 30);
  assert.equal(s.band, 'exposed');
});

test('a deposit at an exchange already counted costs less (no double count)', () => {
  const both = privacyScore(facts({ exchanges: [{ name: 'Binance', count: 1 }], deposits: [{ exchange: 'Binance', otherSenders: 0 }] }), ctx);
  const onlyDeposit = privacyScore(facts({ deposits: [{ exchange: 'Binance', otherSenders: 0 }] }), ctx);
  assert.equal(both.factors.find((f) => f.id === 'deposits')!.impact, -10);
  assert.equal(onlyDeposit.factors.find((f) => f.id === 'deposits')!.impact, -20);
});

test('deposit peers count as linked wallets, but not when the address is shared by many', () => {
  const few = privacyScore(facts({ deposits: [{ exchange: 'Coinbase', otherSenders: 4 }] }), ctx);
  const many = privacyScore(facts({ deposits: [{ exchange: 'Coinbase', otherSenders: 48 }] }), ctx);
  assert.equal(few.linked.count, 4);
  assert.equal(many.linked.count, 0);
});

test('links to the viewer’s own wallets are found in the browser, including the funder', () => {
  const mine = '0x00000000000000000000000000000000000000aa';
  const s = privacyScore(facts({ funder: { address: mine, kind: 'wallet', name: null, chain: 'ethereum' } }), { ...ctx, otherWallets: [mine] });
  assert.ok(ids(s).includes('linked-wallets'));
});

test('coin chains: address reuse and co-spending, counted as addresses', () => {
  const s = privacyScore(facts({ coin: { chain: 'bitcoin', received: 1188, coSpent: 2, cluster: 10 } }), ctx);
  assert.equal(s.factors.find((f) => f.id === 'reuse')!.impact, -25);
  assert.equal(s.factors.find((f) => f.id === 'co-spend')!.impact, -10);
  assert.equal(s.linked.count, 9);
  assert.equal(s.linked.unit, 'address');
});

test('CoinJoin and Tornado count in favor; Tornado carries the exchange-freeze caveat', () => {
  const s = privacyScore(facts({ privacyTools: ['Tornado Cash'], ens: 'me.eth' }), ctx);
  const tool = s.factors.find((f) => f.id === 'privacy-tools')!;
  assert.equal(tool.impact, 15);
  assert.match(tool.label, /freeze/);
});

test('"could reach" only counts what can still change on the wallet', () => {
  const s = privacyScore(facts({ ens: 'me.eth', identityTags: ['Someone'] }), { ...ctx, valueUSD: 200_000, nftCount: 2 });
  // ENS (-25), value (-10) and NFTs (-5) are fixable; the identity tag (-35) is permanent
  assert.equal(s.score, 25);
  assert.equal(s.potential, 65);
});

const day = 86_400;
const at = (dayIndex: number, utcHour: number) => Date.UTC(2026, 8, 1) / 1000 + dayIndex * day + utcHour * 3600;

test('time zone: a daily pause at 05:00–11:00 UTC reads as UTC−5', () => {
  // Sends from 13:00 to 04:00 UTC (08:00–23:00 in UTC−5), quiet from 05:00 UTC, over 10 days
  const times = Array.from({ length: 10 }, (_, d) => [13, 15, 17, 19, 21, 23, 1, 3, 4].map((h) => at(d, h))).flat();
  assert.deepEqual(timezoneOf(times), { offset: -5, sample: times.length });
});

test('time zone: no read from a short burst or round-the-clock activity', () => {
  const burst = Array.from({ length: 3 }, (_, d) => [13, 15, 17, 19, 21, 23, 1, 3].map((h) => at(d, h))).flat();
  assert.equal(timezoneOf(burst), null, 'needs 7+ days');
  const bot = Array.from({ length: 10 }, (_, d) => Array.from({ length: 24 }, (_, h) => at(d, h))).flat();
  assert.equal(timezoneOf(bot), null, 'no pause');
});
