import { EvmHandler, EvmChainConfig } from './evm';

/**
 * Robinhood Chain Handler (Arbitrum Orbit L2, ETH gas)
 *
 * The public RPC is rate-limited; Robinhood recommends Alchemy for real use.
 * Stock Tokens are not tracked yet: only contracts from Robinhood's on-chain
 * asset registry are canonical, so don't add them by name/ticker.
 * Docs: https://docs.robinhood.com/chain
 */
export const ROBINHOOD_CONFIG: EvmChainConfig = {
  key: 'robinhood',
  idPrefix: 'rh',
  chainId: 4663,
  nativeName: 'Ether',
  nativeSymbol: 'ETH',
  publicRpcUrl: 'https://rpc.mainnet.chain.robinhood.com',
  alchemyNetwork: 'robinhood-mainnet',
  tokenStandard: 'ERC-20',
  tokens: [
    { address: '0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73', symbol: 'WETH', name: 'Wrapped Ether', decimals: 18 },
    { address: '0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168', symbol: 'USDG', name: 'Global Dollar', decimals: 6 },
  ],
};

export class RobinhoodHandler extends EvmHandler {
  constructor() {
    super(ROBINHOOD_CONFIG);
  }
}
