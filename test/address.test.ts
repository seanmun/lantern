import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeAddress, shortAddress, toCashAddr, validateAddress } from '@/utils/address';

const chainsOf = (a: string) => validateAddress(a).compatibleChains;

test('detects each address format by chain', () => {
  assert.deepEqual(chainsOf('0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045'), ['ethereum', 'pulsechain', 'base', 'robinhood']);
  assert.deepEqual(chainsOf('bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh'), ['bitcoin']);
  assert.deepEqual(chainsOf('MQd1fJwqBJvwLuyhr17PhEFx1swiqDbPQS'), ['litecoin']);
  assert.deepEqual(chainsOf('LQL9pVH1LsMfKwt82Y2wGhNGkrjF8vwUst'), ['litecoin']);
  assert.deepEqual(chainsOf('ltc1qzvcgmntglcuv4smv3lzj6k8szcvsrmvk0phrr9wfq8w493r096ssm2fgsw'), ['litecoin']);
  assert.deepEqual(chainsOf('DH5yaieqoZN36fDVciNyRueRGvGLR3mr7L'), ['dogecoin']);
  assert.deepEqual(chainsOf('A8Rp4tXdxFcpF2RHwGfVZ9uBrC7NZWa7kR'), ['dogecoin']);
  assert.deepEqual(chainsOf('qzd9yxl925kqyc9ymcnxrqjyvpcqnnsjwc5dz6q6uz'), ['bitcoincash']);
  assert.deepEqual(chainsOf('bitcoincash:qpm2qsznhks23z7629mms6s4cwef74vcwvy22gdx6a'), ['bitcoincash']);
  assert.deepEqual(chainsOf('9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM'), ['solana']);
});

test('legacy Bitcoin addresses also hold Bitcoin Cash from the 2017 split', () => {
  assert.deepEqual(chainsOf('1BpEi6DfDAUFd7GtittLSdBeYJvcoaVggu'), ['bitcoin', 'bitcoincash']);
  assert.deepEqual(chainsOf('3CWFddi6m4ndiGyKqzYvsFYagqDLPVMTzC'), ['bitcoin', 'bitcoincash']);
});

test('rejects things that are not addresses', () => {
  for (const junk of ['', 'junk', '0x123', 'bc1qnotreal', '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA9604G']) {
    assert.equal(validateAddress(junk).isValid, false, junk);
  }
});

test('converts legacy addresses to CashAddr (spec test vectors)', () => {
  assert.equal(toCashAddr('1BpEi6DfDAUFd7GtittLSdBeYJvcoaVggu'), 'bitcoincash:qpm2qsznhks23z7629mms6s4cwef74vcwvy22gdx6a');
  assert.equal(toCashAddr('1KXrWXciRDZUpQwQmuM1DbwsKDLYAYsVLR'), 'bitcoincash:qr95sy3j9xwd2ap32xkykttr4cvcu7as4y0qverfuy');
  assert.equal(toCashAddr('3CWFddi6m4ndiGyKqzYvsFYagqDLPVMTzC'), 'bitcoincash:ppm2qsznhks23z7629mms6s4cwef74vcwvn0h829pq');
  // CashAddr in, prefixed CashAddr out
  assert.equal(toCashAddr('QPM2QSZNHKS23Z7629MMS6S4CWEF74VCWVY22GDX6A'), 'bitcoincash:qpm2qsznhks23z7629mms6s4cwef74vcwvy22gdx6a');
});

test('normalizes keys: EVM lowercase, Solana case-sensitive', () => {
  assert.equal(normalizeAddress('ethereum', '0xABCdef'), '0xabcdef');
  assert.equal(normalizeAddress('solana', 'So11111111111111111111111111111111111111112'), 'So11111111111111111111111111111111111111112');
});

test('shortens addresses for display, dropping the CashAddr prefix', () => {
  assert.equal(shortAddress('0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045'), '0xd8dA…6045');
  assert.equal(shortAddress('bitcoincash:qzd9yxl925kqyc9ymcnxrqjyvpcqnnsjwc5dz6q6uz'), 'qzd9yx…q6uz');
});
