import { EvmHandler, EvmChainConfig, combinePositions } from './evm';
import { BRIDGED_MAXIMUS, HEX_ADDRESS, MAXIMUS_POOLS, MAXIMUS_TEAM_ADDRESS } from '@/config/hex';
import { maximusTeamPositions } from './maximusTeam';
import { ICOSA_ADDRESS, icosaPositions } from './icosa';
import { HEDRON_ADDRESS } from './hedron';

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
  // g4mm4 also serves archive state; PublicNode is fast but not archive, so it goes last
  fallbackRpcUrls: ['https://rpc-pulsechain.g4mm4.io', 'https://pulsechain-rpc.publicnode.com'],
  rpcBatching: false, // batched calls take ~7s here vs ~0.5s unbatched
  tokenStandard: 'PRC-20',
  hex: true,
  // staked TEAM + unclaimed TEAM rewards; HDRN, ICSA and WAATSA stakes in Icosa
  loadPositions: combinePositions(maximusTeamPositions, icosaPositions),
  tokens: [
    { address: HEX_ADDRESS, symbol: 'HEX', name: 'HEX', decimals: 8 },
    { address: '0x95B303987A60C71504D99Aa1b13B4DA07b0790ab', symbol: 'PLSX', name: 'PulseX', decimals: 18 },
    { address: '0x2fa878Ab3F87CC1C9737Fc071108F904c0B0C95d', symbol: 'INC', name: 'Incentive', decimals: 18 },
    { address: '0xA1077a294dDE1B09bB078844df40758a5D0f9a27', symbol: 'WPLS', name: 'Wrapped Pulse', decimals: 18 },
    { address: '0x15D38573d2feeb82e7ad5187aB8c1D52810B1f07', symbol: 'USDC', name: 'USD Coin from Ethereum', decimals: 6 },
    { address: '0xF6f8Db0aBa00007681F8fAF16A0FDa1c9B030b11', symbol: 'PRVX', name: 'ProveX', decimals: 18 },
    { address: '0xc10A4Ed9b4042222d69ff0B374eddd47ed90fC1F', symbol: 'PCOCK', name: 'PulseChain Peacock', decimals: 18 },
    { address: '0xe33a5AE21F93aceC5CfC0b7b0FDBB65A0f0Be5cC', symbol: 'MOST', name: 'MostWanted', decimals: 18 },
    // Fork copies of Ethereum tokens: same address as on Ethereum, but they trade
    // independently on Pulsechain (not backed by BTC or pegged to $1)
    { address: '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599', symbol: 'pWBTC', name: 'Wrapped BTC (Pulsechain fork copy)', decimals: 8 },
    { address: '0x6B175474E89094C44Da98b954EedeAC495271d0F', symbol: 'pDAI', name: 'Dai (Pulsechain fork copy)', decimals: 18 },
    ...MAXIMUS_POOLS.map(({ address, symbol, name }) => ({ address, symbol, name, decimals: 8 })),
    { address: MAXIMUS_TEAM_ADDRESS, symbol: 'TEAM', name: 'Maximus Team', decimals: 8 },
    { address: HEDRON_ADDRESS, symbol: 'HDRN', name: 'Hedron', decimals: 9 },
    { address: ICOSA_ADDRESS, symbol: 'ICSA', name: 'Icosa', decimals: 9 },
    // Ethereum pool tokens bridged to Pulsechain (no stake of their own)
    ...BRIDGED_MAXIMUS.map(({ address, symbol, name }) => ({ address, symbol, name, decimals: 8 })),
  ],
};

export class PulsechainHandler extends EvmHandler {
  constructor() {
    super(PULSECHAIN_CONFIG);
  }
}
