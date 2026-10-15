import { AddressValidation } from '@/types';

/**
 * Address detection shared by the browser (add-wallet form) and the server
 * (API input validation). One EVM address covers every EVM chain.
 */

export const EVM_CHAINS = ['ethereum', 'pulsechain', 'base', 'robinhood'] as const;
export const SUPPORTED_CHAINS = ['bitcoin', ...EVM_CHAINS, 'solana'] as const;
export type SupportedChain = (typeof SUPPORTED_CHAINS)[number];

const EVM_RE = /^0x[0-9a-fA-F]{40}$/;
const BTC_BASE58_RE = /^[13][a-km-zA-HJ-NP-Z1-9]{25,34}$/;  // Legacy P2PKH / P2SH
const BTC_BECH32_RE = /^bc1[ac-hj-np-z02-9]{39,59}$/;        // SegWit + Taproot
const BASE58_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

/** Decoded byte length of a base58 string (leading '1's are zero bytes). */
function base58ByteLength(value: string): number {
  let n = BigInt(0);
  for (const char of value) n = n * BigInt(58) + BigInt(BASE58_ALPHABET.indexOf(char));
  let bytes = 0;
  while (n > BigInt(0)) {
    n >>= BigInt(8);
    bytes++;
  }
  let leadingZeros = 0;
  while (value[leadingZeros] === '1') leadingZeros++;
  return bytes + leadingZeros;
}

export function validateAddress(input: string): AddressValidation {
  const address = input.trim();
  if (EVM_RE.test(address)) {
    return { isValid: true, format: 'hex', compatibleChains: [...EVM_CHAINS] };
  }
  // Legacy BTC and Solana are both base58: BTC decodes to 25 bytes, a Solana key to 32
  if (BASE58_RE.test(address) || BTC_BASE58_RE.test(address)) {
    const length = base58ByteLength(address);
    if (length === 25 && BTC_BASE58_RE.test(address)) {
      return { isValid: true, format: 'base58', compatibleChains: ['bitcoin'] };
    }
    if (length === 32) {
      return { isValid: true, format: 'base58', compatibleChains: ['solana'] };
    }
  }
  if (BTC_BECH32_RE.test(address.toLowerCase())) {
    return { isValid: true, format: 'bech32', compatibleChains: ['bitcoin'] };
  }
  return { isValid: false, format: 'unknown', compatibleChains: [] };
}

export function isSupportedChain(chain: string): chain is SupportedChain {
  return (SUPPORTED_CHAINS as readonly string[]).includes(chain);
}

export function shortAddress(address: string): string {
  return address.length > 14 ? `${address.slice(0, 6)}…${address.slice(-4)}` : address;
}

/** Map key for an address: EVM addresses are case-insensitive, Solana mints are not. */
export function normalizeAddress(chain: string, address: string): string {
  return chain === 'solana' ? address : address.toLowerCase();
}
