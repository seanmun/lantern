import { EvmHandler, EvmChainConfig, EvmToken } from './evm';

const ASSETS_URL = 'https://api.robinhood.com/rhj/assets';
const REGISTRY_TTL_MS = 60 * 60 * 1000;
let registry: { tokens: EvmToken[]; at: number } | null = null;

interface RobinhoodAsset {
  tokenSymbol: string;
  tokenName: string;
  tokenDecimals: number;
  status: string;
  logoUrl?: string;
  deployments: { contractAddress: string; chainId: number }[];
}

/**
 * Canonical Stock Tokens from Robinhood's asset API. Only these addresses are
 * Robinhood Stock Tokens; look-alikes with the same ticker are not.
 */
export async function loadStockTokens(): Promise<EvmToken[]> {
  if (registry && Date.now() - registry.at < REGISTRY_TTL_MS) return registry.tokens;
  const response = await fetch(ASSETS_URL, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(15_000) });
  if (!response.ok) throw new Error(`Robinhood assets API ${response.status}`);
  const { assets }: { assets: RobinhoodAsset[] } = await response.json();

  const tokens = assets.flatMap((asset) =>
    asset.deployments
      .filter((d) => d.chainId === 4663)
      .map((d) => ({
        address: d.contractAddress,
        symbol: asset.tokenSymbol,
        name: asset.tokenName.replace(/\s*•\s*Robinhood Token$/, ''),
        decimals: asset.tokenDecimals ?? 18,
        standard: 'Stock Token',
        logoUrl: asset.logoUrl,
      }))
  );
  registry = { tokens, at: Date.now() };
  return tokens;
}

/**
 * Robinhood Chain Handler (Arbitrum Orbit L2, ETH gas)
 *
 * The public RPC is rate-limited; Robinhood recommends Alchemy for real use.
 * Stock Tokens (tokenized equities/ETFs) are loaded from Robinhood's asset
 * API, the canonical registry, and priced from Robinhood's quotes.
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
  loadExtraTokens: loadStockTokens,
};

export class RobinhoodHandler extends EvmHandler {
  constructor() {
    super(ROBINHOOD_CONFIG);
  }
}
