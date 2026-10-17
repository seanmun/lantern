import { Asset } from '@/types';
import { NATIVE_COIN } from '@/utils/prices';

/** Our logo proxy's URL for an asset: native coins by CoinGecko id, tokens by chain + contract. */
export function logoUrl(asset: Pick<Asset, 'type' | 'chain' | 'contractAddress'>): string | undefined {
  if (asset.type === 'native') return NATIVE_COIN[asset.chain] ? `/api/logos/native/${NATIVE_COIN[asset.chain]}` : undefined;
  if ((asset.type === 'token' || asset.type === 'stake') && asset.contractAddress) return `/api/logos/${asset.chain}/${asset.contractAddress}`;
  return undefined;
}
