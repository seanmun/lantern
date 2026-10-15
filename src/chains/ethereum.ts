import { EvmHandler, EvmChainConfig } from './evm';
import { HEX_ADDRESS, MAXIMUS_POOLS } from '@/config/hex';

/**
 * Ethereum Chain Handler
 *
 * CUSTOMIZATION POINTS:
 * - tokens: Add/remove tokens to automatically check
 * - Set ALCHEMY_API_KEY for faster RPC + NFT support
 */
export const ETHEREUM_CONFIG: EvmChainConfig = {
  key: 'ethereum',
  idPrefix: 'eth',
  chainId: 1,
  nativeName: 'Ethereum',
  nativeSymbol: 'ETH',
  publicRpcUrl: 'https://ethereum.publicnode.com',
  alchemyNetwork: 'eth-mainnet',
  tokenStandard: 'ERC-20',
  hex: true,
  tokens: [
    { address: HEX_ADDRESS, symbol: 'HEX', name: 'HEX', decimals: 8 },
    { address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', symbol: 'USDC', name: 'USD Coin', decimals: 6 },
    { address: '0xdAC17F958D2ee523a2206206994597C13D831ec7', symbol: 'USDT', name: 'Tether USD', decimals: 6 },
    { address: '0x514910771AF9Ca656af840dff83E8264EcF986CA', symbol: 'LINK', name: 'Chainlink', decimals: 18 },
    { address: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', symbol: 'WETH', name: 'Wrapped Ether', decimals: 18 },
    ...MAXIMUS_POOLS.map(({ address, symbol, name }) => ({ address, symbol, name, decimals: 8 })),
  ],
};

export class EthereumHandler extends EvmHandler {
  constructor() {
    super(ETHEREUM_CONFIG);
  }
}
