import { Asset, APIResponse } from '@/types';
import { toCashAddr } from '@/utils/address';

/**
 * Litecoin, Dogecoin and Bitcoin Cash: one native coin each, read from
 * keyless public indexers tried in order (node RPCs such as Alchemy's can't
 * look up an address's balance, so an indexer is required).
 *
 * - Litecoin: litecoinspace.org (an Esplora API, like Bitcoin's), then BitPay's Bitcore
 * - Dogecoin: Bitcore, then BlockCypher
 * - Bitcoin Cash: Bitcore. Legacy 1…/3… Bitcoin addresses are checked here
 *   too, since anyone holding BTC at the August 2017 split also got BCH;
 *   those only show up when there is some.
 */

type Source = (address: string) => Promise<bigint>; // confirmed balance in base units

const UA = { Accept: 'application/json', 'User-Agent': 'Lantern/1.0 (+https://github.com/seanmun/lantern)' };

async function getJSON<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: UA, signal: AbortSignal.timeout(12_000) });
  if (!res.ok) throw new Error(`${new URL(url).host} ${res.status}`);
  return res.json() as Promise<T>;
}

const esplora = (base: string): Source => async (address) => {
  const d = await getJSON<{ chain_stats: { funded_txo_sum: number; spent_txo_sum: number } }>(`${base}/address/${address}`);
  return BigInt(d.chain_stats.funded_txo_sum) - BigInt(d.chain_stats.spent_txo_sum);
};

const bitcore = (coin: string): Source => async (address) => {
  const d = await getJSON<{ confirmed: number }>(`https://api.bitcore.io/api/${coin}/mainnet/address/${address}/balance`);
  return BigInt(d.confirmed);
};

const blockcypher = (coin: string): Source => async (address) => {
  const d = await getJSON<{ balance: number }>(`https://api.blockcypher.com/v1/${coin}/main/addrs/${address}/balance`);
  return BigInt(d.balance);
};

export interface UtxoChainConfig {
  key: 'litecoin' | 'dogecoin' | 'bitcoincash';
  name: string;
  symbol: string;
  sources: [string, Source][];
  /** The form each indexer expects */
  toQuery?: (address: string) => string;
}

export const UTXO_CONFIGS: Record<UtxoChainConfig['key'], UtxoChainConfig> = {
  litecoin: {
    key: 'litecoin', name: 'Litecoin', symbol: 'LTC',
    sources: [['litecoinspace.org', esplora('https://litecoinspace.org/api')], ['Bitcore', bitcore('LTC')]],
  },
  dogecoin: {
    key: 'dogecoin', name: 'Dogecoin', symbol: 'DOGE',
    sources: [['Bitcore', bitcore('DOGE')], ['BlockCypher', blockcypher('doge')]],
  },
  bitcoincash: {
    key: 'bitcoincash', name: 'Bitcoin Cash', symbol: 'BCH',
    sources: [['Bitcore', bitcore('BCH')]],
    // Bitcore wants CashAddr without the prefix, and reports 0 (not an error) for legacy forms
    toQuery: (a) => toCashAddr(a).replace(/^bitcoincash:/, ''),
  },
};

const isLegacyBitcoin = (address: string) => /^[13]/.test(address);

export class UtxoHandler {
  constructor(private readonly config: UtxoChainConfig) {}

  async getAllAssets(address: string): Promise<APIResponse<Asset[]>> {
    const { key, name, symbol, sources, toQuery } = this.config;
    const query = toQuery ? toQuery(address) : address;
    const errors: string[] = [];
    for (const [label, source] of sources) {
      try {
        const units = await source(query);
        // A Bitcoin wallet checked for split-off BCH: only worth showing when there is some
        if (key === 'bitcoincash' && isLegacyBitcoin(address) && units === BigInt(0)) {
          return { success: true, data: [], timestamp: new Date() };
        }
        const asset: Asset = {
          id: `${key}_${address}_native`,
          type: 'native',
          chain: key,
          walletAddress: address,
          name,
          symbol,
          decimals: 8,
          balance: units.toString(),
          balanceFormatted: (Number(units) / 1e8).toFixed(8),
          lastUpdated: new Date(),
        };
        return { success: true, data: [asset], timestamp: new Date() };
      } catch (error) {
        console.warn(`⚠️ ${name} balance via ${label} failed:`, error);
        errors.push(`${label}: ${error instanceof Error ? error.message : error}`);
      }
    }
    return { success: false, error: `Could not read ${name} balance (${errors.join('; ')})`, timestamp: new Date() };
  }
}
