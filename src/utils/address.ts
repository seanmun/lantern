import { AddressValidation } from '@/types';

/**
 * Address detection shared by the browser (add-wallet form) and the server
 * (API input validation). One EVM address covers every EVM chain.
 */

export const EVM_CHAINS = ['ethereum', 'pulsechain', 'base', 'robinhood'] as const;
export const UTXO_CHAINS = ['litecoin', 'dogecoin', 'bitcoincash'] as const;
export const SUPPORTED_CHAINS = ['bitcoin', ...EVM_CHAINS, 'solana', ...UTXO_CHAINS] as const;
export type SupportedChain = (typeof SUPPORTED_CHAINS)[number];

const EVM_RE = /^0x[0-9a-fA-F]{40}$/;
const BASE58_RE = /^[1-9A-HJ-NP-Za-km-z]{25,44}$/;
const BTC_BECH32_RE = /^bc1[ac-hj-np-z02-9]{39,59}$/;  // SegWit + Taproot
const LTC_BECH32_RE = /^ltc1[ac-hj-np-z02-9]{39,59}$/; // Litecoin SegWit
const CASHADDR_RE = /^(bitcoincash:)?[qp][qpzry9x8gf2tvdw0s3jn54khce6mua7l]{41}$/; // Bitcoin Cash
const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

/** Base58 decode (leading '1's are zero bytes). */
function base58Decode(value: string): Uint8Array {
  let n = BigInt(0);
  for (const char of value) n = n * BigInt(58) + BigInt(BASE58_ALPHABET.indexOf(char));
  const bytes: number[] = [];
  while (n > BigInt(0)) {
    bytes.unshift(Number(n & BigInt(255)));
    n >>= BigInt(8);
  }
  let leadingZeros = 0;
  while (value[leadingZeros] === '1') leadingZeros++;
  return Uint8Array.from([...new Array(leadingZeros).fill(0), ...bytes]);
}

// Version byte of a 25-byte base58check address → the chains it belongs to.
// Legacy Bitcoin addresses also hold Bitcoin Cash: the coins split in 2017.
const BASE58_VERSIONS: Record<number, SupportedChain[]> = {
  0x00: ['bitcoin', 'bitcoincash'], // P2PKH, 1…
  0x05: ['bitcoin', 'bitcoincash'], // P2SH, 3…
  0x30: ['litecoin'],               // L…
  0x32: ['litecoin'],               // M…
  0x1e: ['dogecoin'],               // D…
  0x16: ['dogecoin'],               // 9… / A…
};

export function validateAddress(input: string): AddressValidation {
  const address = input.trim();
  if (EVM_RE.test(address)) {
    return { isValid: true, format: 'hex', compatibleChains: [...EVM_CHAINS] };
  }
  // UTXO legacy addresses decode to 25 bytes (version + hash + checksum), a Solana key to 32
  if (BASE58_RE.test(address)) {
    const bytes = base58Decode(address);
    if (bytes.length === 25 && BASE58_VERSIONS[bytes[0]]) {
      return { isValid: true, format: 'base58', compatibleChains: [...BASE58_VERSIONS[bytes[0]]] };
    }
    if (bytes.length === 32) {
      return { isValid: true, format: 'base58', compatibleChains: ['solana'] };
    }
  }
  const lower = address.toLowerCase();
  if (BTC_BECH32_RE.test(lower)) {
    return { isValid: true, format: 'bech32', compatibleChains: ['bitcoin'] };
  }
  if (LTC_BECH32_RE.test(lower)) {
    return { isValid: true, format: 'bech32', compatibleChains: ['litecoin'] };
  }
  if (CASHADDR_RE.test(lower)) {
    return { isValid: true, format: 'cashaddr', compatibleChains: ['bitcoincash'] };
  }
  return { isValid: false, format: 'unknown', compatibleChains: [] };
}

// ---------- Bitcoin Cash CashAddr (spec: github.com/bitcoincashorg/bitcoincash.org/blob/master/spec/cashaddr.md)

const CASH_CHARSET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';
const CASH_PREFIX = 'bitcoincash';

function cashPolymod(values: number[]): bigint {
  const B = BigInt;
  const GEN = ['0x98f2bc8e61', '0x79b76d99e2', '0xf33e5fb3c4', '0xae2eabe2a8', '0x1e4f43e470'].map(B);
  let c = B(1);
  for (const d of values) {
    const c0 = c >> B(35);
    c = ((c & B('0x07ffffffff')) << B(5)) ^ B(d);
    for (let i = 0; i < 5; i++) if ((c0 >> B(i)) & B(1)) c ^= GEN[i];
  }
  return c ^ B(1);
}

/** CashAddr for an address on Bitcoin Cash: legacy 1…/3… addresses are converted. */
export function toCashAddr(address: string): string {
  const lower = address.trim().toLowerCase();
  if (CASHADDR_RE.test(lower)) return lower.startsWith(`${CASH_PREFIX}:`) ? lower : `${CASH_PREFIX}:${lower}`;
  const bytes = base58Decode(address.trim());
  const type = bytes[0] === 0x05 ? 1 : 0;
  const payload = [type << 3, ...bytes.slice(1, 21)];
  // 8-bit → 5-bit groups
  const data: number[] = [];
  let acc = 0, bits = 0;
  for (const b of payload) {
    acc = (acc << 8) | b;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      data.push((acc >> bits) & 31);
    }
  }
  if (bits > 0) data.push((acc << (5 - bits)) & 31);
  const mod = cashPolymod([...[...CASH_PREFIX].map((ch) => ch.charCodeAt(0) & 31), 0, ...data, 0, 0, 0, 0, 0, 0, 0, 0]);
  const checksum = Array.from({ length: 8 }, (_, i) => Number((mod >> BigInt(5 * (7 - i))) & BigInt(31)));
  return `${CASH_PREFIX}:${[...data, ...checksum].map((d) => CASH_CHARSET[d]).join('')}`;
}

export function isSupportedChain(chain: string): chain is SupportedChain {
  return (SUPPORTED_CHAINS as readonly string[]).includes(chain);
}

/** Map key for an address: EVM addresses are case-insensitive, Solana mints are not. */
export function normalizeAddress(chain: string, address: string): string {
  return chain === 'solana' ? address : address.toLowerCase();
}

/** Display form: CashAddr's 'bitcoincash:' prefix is dropped (the chain label says it). */
export function shortAddress(address: string): string {
  const bare = address.replace(/^bitcoincash:/i, '');
  return bare.length > 14 ? `${bare.slice(0, 6)}…${bare.slice(-4)}` : bare;
}
