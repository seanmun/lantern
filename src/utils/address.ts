import { AddressValidation } from '@/types';

/**
 * Address detection shared by the browser (add-wallet form) and the server
 * (API input validation). One EVM address covers every EVM chain.
 */

export const EVM_CHAINS = ['ethereum', 'pulsechain', 'base', 'robinhood'] as const;
export const SUPPORTED_CHAINS = ['bitcoin', ...EVM_CHAINS] as const;
export type SupportedChain = (typeof SUPPORTED_CHAINS)[number];

const EVM_RE = /^0x[0-9a-fA-F]{40}$/;
const BTC_BASE58_RE = /^[13][a-km-zA-HJ-NP-Z1-9]{25,34}$/;  // Legacy P2PKH / P2SH
const BTC_BECH32_RE = /^bc1[ac-hj-np-z02-9]{39,59}$/;        // SegWit + Taproot

export function validateAddress(input: string): AddressValidation {
  const address = input.trim();
  if (EVM_RE.test(address)) {
    return { isValid: true, format: 'hex', compatibleChains: [...EVM_CHAINS] };
  }
  if (BTC_BASE58_RE.test(address)) {
    return { isValid: true, format: 'base58', compatibleChains: ['bitcoin'] };
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
