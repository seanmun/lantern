import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decryptSync, deriveSyncKeys, encryptSync, formatSyncCode, generateSyncCode, normalizeSyncCode } from '@/utils/syncCode';
import { mergeData, SyncData } from '@/hooks/useSync';
import { Wallet } from '@/types';

test('generates 12-character codes in groups of four', () => {
  const code = generateSyncCode();
  assert.match(code, /^[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$/);
  assert.notEqual(generateSyncCode(), code);
});

test('reads codes forgivingly: case, spaces, dashes, O for 0, I/L for 1', () => {
  assert.equal(normalizeSyncCode('k7qm-2xrp-9tda'), 'K7QM2XRP9TDA');
  assert.equal(normalizeSyncCode(' K7QM 2XRP 9TDA '), 'K7QM2XRP9TDA');
  assert.equal(normalizeSyncCode('O0IL-0000-0000'), '001100000000');
  assert.equal(normalizeSyncCode('K7QM-2XRP-9TD'), null); // too short
  assert.equal(normalizeSyncCode('K7QM-2XRP-9TDU'), null); // U isn't in the alphabet
  assert.equal(formatSyncCode('K7QM2XRP9TDA'), 'K7QM-2XRP-9TDA');
});

test('the same code always derives the same id; different codes differ', async () => {
  const a = await deriveSyncKeys('K7QM2XRP9TDA');
  const again = await deriveSyncKeys('K7QM2XRP9TDA');
  const b = await deriveSyncKeys('K7QM2XRP9TDB');
  assert.match(a.id, /^[0-9a-f]{64}$/);
  assert.equal(a.id, again.id);
  assert.notEqual(a.id, b.id);
});

test('encrypts and decrypts; a wrong code or tampering fails', async () => {
  const keys = await deriveSyncKeys('K7QM2XRP9TDA');
  const payload = { v: 1, updatedAt: 1, data: { wallets: [], hidden: ['x'], trusted: [], featured: {} } };
  const blob = await encryptSync(keys, payload);
  assert.match(blob, /^[A-Za-z0-9_-]+$/);
  assert.ok(!blob.includes('hidden'), 'ciphertext must not contain plaintext');
  assert.deepEqual(await decryptSync(keys, blob), payload);

  const wrong = await deriveSyncKeys('K7QM2XRP9TDB');
  await assert.rejects(decryptSync(wrong, blob));
  const tampered = blob.slice(0, -2) + (blob.endsWith('A') ? 'BB' : 'AA');
  await assert.rejects(decryptSync(keys, tampered));
});

const wallet = (id: string, address: string, updatedAt: string, name = id): Wallet => ({ id, name, address, chains: ['ethereum'], createdAt: updatedAt, updatedAt });
const data = (wallets: Wallet[], extra: Partial<SyncData> = {}): SyncData => ({ wallets, hidden: [], trusted: [], featured: {}, ...extra });

test('merging keeps every wallet once, matching EVM addresses case-insensitively', () => {
  const merged = mergeData(
    data([wallet('a', '0xAbC0000000000000000000000000000000000001', '2026-10-01')]),
    data([wallet('b', '0xabc0000000000000000000000000000000000001', '2026-10-02', 'renamed'), wallet('c', 'bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh', '2026-10-01')]),
  );
  assert.equal(merged.wallets.length, 2);
  const same = merged.wallets.find((w) => w.address.toLowerCase().endsWith('0001'))!;
  assert.equal(same.name, 'renamed', 'the newer edit wins');
  assert.equal(same.id, 'a', 'but the first id is kept');
});

test('merging unions hidden and trusted tokens; this browser wins frame picks', () => {
  const merged = mergeData(
    data([], { hidden: ['h1'], trusted: ['t1'], featured: { n1: true } }),
    data([], { hidden: ['h1', 'h2'], trusted: ['t2'], featured: { n1: false, n2: true } }),
  );
  assert.deepEqual(merged.hidden.sort(), ['h1', 'h2']);
  assert.deepEqual(merged.trusted.sort(), ['t1', 't2']);
  assert.deepEqual(merged.featured, { n1: true, n2: true });
});
