import { EvmHandler, EvmChainConfig } from './evm';
import { HEX_ADDRESS, MAXIMUS_POOLS } from '@/config/hex';

/**
 * Pulsechain Handler - HEX-Focused Portfolio Tracker
 *
 * Pulsechain is where most HEX activity happens now. HEX and the Maximus pools
 * live at the same addresses as on Ethereum (copied at the fork), but trade at
 * different prices and hold independent stakes.
 *
 * CUSTOMIZATION POINTS:
 * - publicRpcUrl: Pulsechain RPC endpoint
 * - tokens: PRC-20 tokens to automatically check
 */
export const PULSECHAIN_CONFIG: EvmChainConfig = {
  key: 'pulsechain',
  idPrefix: 'pls',
  chainId: 369,
  nativeName: 'Pulse',
  nativeSymbol: 'PLS',
  publicRpcUrl: 'https://rpc.pulsechain.com',
  rpcBatching: false, // batched calls take ~7s here vs ~0.5s unbatched
  tokenStandard: 'PRC-20',
  hex: true,
  tokens: [
    { address: HEX_ADDRESS, symbol: 'HEX', name: 'HEX', decimals: 8 },
    { address: '0x95B303987A60C71504D99Aa1b13B4DA07b0790ab', symbol: 'PLSX', name: 'PulseX', decimals: 18 },
    { address: '0x2fa878Ab3F87CC1C9737Fc071108F904c0B0C95d', symbol: 'INC', name: 'Incentive', decimals: 18 },
    { address: '0xA1077a294dDE1B09bB078844df40758a5D0f9a27', symbol: 'WPLS', name: 'Wrapped Pulse', decimals: 18 },
    { address: '0x15D38573d2feeb82e7ad5187aB8c1D52810B1f07', symbol: 'USDC', name: 'USD Coin from Ethereum', decimals: 6 },
    ...MAXIMUS_POOLS.map(({ address, symbol, name }) => ({ address, symbol, name, decimals: 8 })),
    // Ethereum pool tokens bridged to Pulsechain (no stake of their own)
    { address: '0x189a3CA3cC1337e85c7bC0a43b8d3457FD5AaE89', symbol: 'eDECI', name: 'Maximus Decimus from Ethereum', decimals: 8 },
    { address: '0x8924f56df76CA9e7babB53489D7bEF4fb7caFF19', symbol: 'eLUCKY', name: 'Maximus Lucky from Ethereum', decimals: 8 },
    { address: '0x0f3C6134F4022D85127476BC4d3787860E5C5569', symbol: 'eTRIO', name: 'Maximus Trio from Ethereum', decimals: 8 },
    { address: '0xda073388422065Fe8D3B5921Ec2AE475Bae57BED', symbol: 'eBASE', name: 'Maximus Base from Ethereum', decimals: 8 },
  ],
};

export class PulsechainHandler extends EvmHandler {
  constructor() {
    super(PULSECHAIN_CONFIG);
  }
}
