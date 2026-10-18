import { EvmHandler, EvmChainConfig } from './evm';
import { DIEM_ADDRESS, VVV_ADDRESS, venicePositions } from './venice';

/**
 * Base (Coinbase L2) Handler
 */
export const BASE_CONFIG: EvmChainConfig = {
  key: 'base',
  idPrefix: 'base',
  chainId: 8453,
  nativeName: 'Ether',
  nativeSymbol: 'ETH',
  publicRpcUrl: 'https://mainnet.base.org',
  fallbackRpcUrls: ['https://base.drpc.org'],
  alchemyNetwork: 'base-mainnet',
  tokenStandard: 'ERC-20',
  tokens: [
    { address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', symbol: 'USDC', name: 'USD Coin', decimals: 6 },
    { address: '0x4200000000000000000000000000000000000006', symbol: 'WETH', name: 'Wrapped Ether', decimals: 18 },
    { address: '0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb', symbol: 'DAI', name: 'Dai Stablecoin', decimals: 18 },
    { address: VVV_ADDRESS, symbol: 'VVV', name: 'Venice Token', decimals: 18 },
    { address: DIEM_ADDRESS, symbol: 'DIEM', name: 'Diem (Venice compute)', decimals: 18 },
  ],
  loadPositions: venicePositions, // staked VVV, rewards, unstaking cooldown
};

export class BaseHandler extends EvmHandler {
  constructor() {
    super(BASE_CONFIG);
  }
}
