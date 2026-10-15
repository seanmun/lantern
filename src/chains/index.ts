import 'server-only';
import { Asset, APIResponse } from '@/types';
import { SupportedChain } from '@/utils/address';
import { BitcoinHandler } from './bitcoin';
import { EthereumHandler } from './ethereum';
import { PulsechainHandler } from './pulsechain';
import { BaseHandler } from './base';
import { RobinhoodHandler } from './robinhood';
import { SolanaHandler } from './solana';

/**
 * Chain registry. Server-only: handlers read API keys from the environment,
 * so they must never be bundled into the browser.
 */

export interface ChainHandler {
  getAllAssets(address: string): Promise<APIResponse<Asset[]>>;
}

const HANDLERS: Record<SupportedChain, () => ChainHandler> = {
  bitcoin: () => new BitcoinHandler(),
  ethereum: () => new EthereumHandler(),
  pulsechain: () => new PulsechainHandler(),
  base: () => new BaseHandler(),
  robinhood: () => new RobinhoodHandler(),
  solana: () => new SolanaHandler(),
};

export function getHandler(chain: SupportedChain): ChainHandler {
  return HANDLERS[chain]();
}
