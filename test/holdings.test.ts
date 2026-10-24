import { test } from 'node:test';
import assert from 'node:assert/strict';
import { groupHoldings } from '@/utils/holdings';
import { estimateStake } from '@/utils/hexMath';
import { HEX_ADDRESS } from '@/config/hex';
import { Asset } from '@/types';

const token = (chain: string, contractAddress: string, symbol: string, balance: number, valueUSD: number): Asset => ({
  id: `${chain}:${contractAddress}`, type: 'token', chain, walletAddress: '0x1', name: symbol, symbol, decimals: 8,
  contractAddress, balance: String(balance), balanceFormatted: String(balance), valueUSD, lastUpdated: new Date(),
} as Asset);

test('eHEX and pHEX roll into one HEX holding but keep their own prices', () => {
  const [hex] = groupHoldings([token('ethereum', HEX_ADDRESS, 'HEX', 1000, 5), token('pulsechain', HEX_ADDRESS, 'HEX', 1000, 2)]);
  assert.equal(hex.symbol, 'HEX');
  assert.equal(hex.balance, 2000);
  assert.equal(hex.valueUSD, 7, 'each chain valued at its own price');
  assert.equal(hex.blendedPrice, true, 'flagged as a blend, never one shared price');
  assert.deepEqual(hex.chains.sort(), ['ethereum', 'pulsechain']);
});

test('tokens with the same ticker on different contracts stay separate', () => {
  const rows = groupHoldings([token('ethereum', '0x1111111111111111111111111111111111111111', 'USDC', 10, 10), token('ethereum', '0x2222222222222222222222222222222222222222', 'USDC', 10, 0.01)]);
  assert.equal(rows.length, 2);
});

test('HEX stake bonuses: longer pays up to 3x, bigger up to +10%', () => {
  const base = estimateStake(1000, 1, 1, 0);
  const long = estimateStake(1000, 3641, 1, 0);
  const huge = estimateStake(150_000_000, 1, 1, 0);
  // Every stake gets a sliver of the size bonus (1000 / 1.5B), so compare closely, not exactly
  assert.ok(Math.abs(base.tShares - 1000) < 0.001);
  assert.ok(Math.abs(long.tShares - 3000) < 0.001);
  assert.ok(Math.abs(huge.tShares / 150_000_000 - 1.1) < 1e-9);
  assert.equal(estimateStake(1000, 99999, 1, 0).longerPaysBetterPct, 200, 'the length bonus tops out at +200%');
});
