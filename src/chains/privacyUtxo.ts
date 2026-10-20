import 'server-only';
import { PrivacyFacts } from '@/types/privacy';
import { toCashAddr } from '@/utils/address';
import { timezoneOf } from './privacy';

/**
 * Privacy facts for coin-chain addresses (Bitcoin, Litecoin, Dogecoin,
 * Bitcoin Cash). Here the big leaks are different from EVM wallets:
 *
 * - address reuse: every payment to one address is visibly linked
 * - co-spending: addresses spent together in one transaction almost always
 *   share an owner (the "common-input" rule chain analysis is built on)
 * - for Bitcoin, WalletExplorer applies that rule across all history and
 *   reports how many addresses fall in the same cluster, and labels known
 *   services (exchanges, mixers)
 * - CoinJoin transactions (many equal outputs) are a deliberate defence
 *
 * Linked addresses are counted, never listed.
 */

const TIMEOUT_MS = 10_000;
const MAX_CLUSTER = 1_000; // bigger clusters are services or CoinJoin merges, not one person
const WALLETEXPLORER = 'https://www.walletexplorer.com/api/1';
const EXCHANGE_LABEL = /binance|coinbase|kraken|okx|okex|bybit|kucoin|gemini|bitfinex|bitstamp|huobi|htx|gate\.io|bitget|mexc|upbit|bittrex|poloniex|bithumb|cex\.io|localbitcoins|paxful|exchange/i;
const ESPLORA: Record<string, string> = { bitcoin: 'https://mempool.space/api', litecoin: 'https://litecoinspace.org/api' };
const BITCORE: Record<string, string> = { dogecoin: 'DOGE', bitcoincash: 'BCH', litecoin: 'LTC' };
const LABEL_LOOKUPS = 3;
const BITCORE_COINS = 200;

async function getJSON<T>(url: string): Promise<T | null> {
  try {
    const response = await fetch(url, { headers: { Accept: 'application/json', 'User-Agent': 'Lantern/1.0 (+https://github.com/seanmun/lantern)' }, signal: AbortSignal.timeout(TIMEOUT_MS) });
    return response.ok ? ((await response.json()) as T) : null;
  } catch {
    return null;
  }
}

interface EsploraTx {
  status: { block_time?: number };
  vin: { prevout: { scriptpubkey_address?: string; value: number } | null }[];
  vout: { scriptpubkey_address?: string; value: number }[];
}
interface EsploraAddress { chain_stats: { funded_txo_count: number; tx_count: number }; mempool_stats: { funded_txo_count: number; tx_count: number } }
interface WeAddress { found?: boolean; label?: string; wallet_id?: string }

const empty = (address: string): PrivacyFacts => ({
  address, ens: null, ensRecords: [], identityTags: [], activeChains: [], transactions: 0, exchanges: [],
  privacyTools: [], counterparties: [], sampled: 0, funder: null, deposits: [], twoWay: 0, timezone: null,
});

/** "Kraken.com" → "Kraken"; WalletExplorer labels services by their domain */
const serviceName = (label: string) => label.replace(/\.(com|net|io|org|info|eu|co)(-.*)?$/i, '').replace(/-old.*$/i, '');

/** WalletExplorer: the address's cluster label and size (Bitcoin only) */
async function cluster(address: string): Promise<{ label: string | null; size: number | null }> {
  const info = await getJSON<WeAddress>(`${WALLETEXPLORER}/address?address=${address}&from=0&count=0&caller=lantern`);
  if (!info?.found || !info.wallet_id) return { label: null, size: null };
  // CoinJoin rounds merge thousands of strangers into one 'wallet': no owner signal there
  if (info.label && /coinjoin/i.test(info.label)) return { label: info.label, size: null };
  const wallet = await getJSON<{ addresses_count?: number }>(`${WALLETEXPLORER}/wallet-addresses?wallet=${info.wallet_id}&from=0&count=0&caller=lantern`);
  const size = wallet?.addresses_count ?? null;
  return { label: info.label ?? null, size: size !== null && size <= MAX_CLUSTER ? size : null };
}

async function esploraFacts(chain: string, address: string): Promise<PrivacyFacts> {
  const base = ESPLORA[chain];
  const [stats, txs] = await Promise.all([
    getJSON<EsploraAddress>(`${base}/address/${address}`),
    getJSON<EsploraTx[]>(`${base}/address/${address}/txs`),
  ]);
  // Esplora unavailable: Bitcore still shows address reuse
  if (!stats) return BITCORE[chain] ? bitcoreFacts(chain, address) : empty(address);
  const facts = empty(address);
  facts.activeChains = [chain];
  facts.transactions = stats.chain_stats.tx_count + stats.mempool_stats.tx_count;
  const received = stats.chain_stats.funded_txo_count + stats.mempool_stats.funded_txo_count;

  const coSpent = new Set<string>();
  const recipients = new Map<string, number>();
  const senders = new Set<string>();
  const sendTimes: number[] = [];
  let coinjoin = false;
  for (const tx of txs ?? []) {
    const inputs = tx.vin.map((v) => v.prevout?.scriptpubkey_address).filter((a): a is string => !!a);
    const spends = inputs.includes(address);
    if (spends) {
      inputs.filter((a) => a !== address).forEach((a) => coSpent.add(a));
      if (tx.status.block_time) sendTimes.push(tx.status.block_time);
      for (const o of tx.vout) if (o.scriptpubkey_address && o.scriptpubkey_address !== address && !inputs.includes(o.scriptpubkey_address)) recipients.set(o.scriptpubkey_address, (recipients.get(o.scriptpubkey_address) ?? 0) + 1);
    } else {
      inputs.forEach((a) => senders.add(a));
    }
    // CoinJoin: five or more distinct owners' inputs, five or more outputs of exactly the
    // same amount, and this wallet taking part (an exchange's batch payout has few inputs)
    const sizes = new Map<number, number>();
    for (const o of tx.vout) sizes.set(o.value, (sizes.get(o.value) ?? 0) + 1);
    const [denomination, equal] = [...sizes].sort((a, b) => b[1] - a[1])[0] ?? [0, 0];
    const joined = spends || tx.vout.some((o) => o.scriptpubkey_address === address && o.value === denomination);
    if (new Set(inputs).size >= 5 && equal >= 5 && joined) coinjoin = true;
  }

  // Bitcoin: whole-history clustering and service labels, for the wallet and its main recipients
  let clusterSize: number | null = null;
  if (chain === 'bitcoin') {
    const own = await cluster(address);
    clusterSize = own.size;
    if (own.label && !/coinjoin/i.test(own.label)) facts.identityTags.push(`Part of a wallet labelled ${own.label}`);
    if (own.label && /coinjoin/i.test(own.label)) coinjoin = true;
    const top = [...recipients].sort((a, b) => b[1] - a[1]).slice(0, LABEL_LOOKUPS).map(([a]) => a);
    const exchanges = new Map<string, number>();
    for (const r of top) {
      const info = await getJSON<WeAddress>(`${WALLETEXPLORER}/address?address=${r}&from=0&count=0&caller=lantern`);
      if (info?.label && EXCHANGE_LABEL.test(info.label)) {
        const name = serviceName(info.label);
        exchanges.set(name, (exchanges.get(name) ?? 0) + recipients.get(r)!);
      }
    }
    facts.exchanges = [...exchanges].map(([name, count]) => ({ name, count }));
  }

  if (coinjoin) facts.privacyTools.push('CoinJoin');
  facts.counterparties = [...new Set([...recipients.keys(), ...senders])].map((a) => a.toLowerCase()).slice(0, 500);
  facts.sampled = txs?.length ?? 0;
  facts.timezone = timezoneOf(sendTimes);
  facts.coin = { chain, received, coSpent: coSpent.size, cluster: clusterSize };
  return facts;
}

/** Dogecoin and Bitcoin Cash: Bitcore lists coins, which is enough for address reuse */
async function bitcoreFacts(chain: string, address: string): Promise<PrivacyFacts> {
  const query = chain === 'bitcoincash' ? toCashAddr(address).replace(/^bitcoincash:/, '') : address;
  const coins = await getJSON<{ mintTxid: string; spentTxid: string }[]>(`https://api.bitcore.io/api/${BITCORE[chain]}/mainnet/address/${query}/txs?limit=${BITCORE_COINS}`);
  const facts = empty(address);
  if (!coins) return chain === 'dogecoin' ? blockcypherFacts(address) : facts;
  facts.activeChains = [chain];
  facts.transactions = new Set(coins.flatMap((c) => [c.mintTxid, c.spentTxid].filter(Boolean))).size;
  facts.sampled = coins.length;
  facts.coin = { chain, received: coins.length, receivedAtLeast: coins.length >= BITCORE_COINS, coSpent: 0, cluster: null };
  return facts;
}

/** Dogecoin backup: BlockCypher's address view lists outputs received, enough for address reuse */
async function blockcypherFacts(address: string): Promise<PrivacyFacts> {
  const facts = empty(address);
  const data = await getJSON<{ n_tx?: number; txrefs?: { tx_output_n: number }[]; hasMore?: boolean }>(`https://api.blockcypher.com/v1/doge/main/addrs/${address}?limit=${BITCORE_COINS}`);
  if (!data) return facts;
  const received = (data.txrefs ?? []).filter((t) => t.tx_output_n >= 0).length;
  facts.activeChains = ['dogecoin'];
  facts.transactions = data.n_tx ?? 0;
  facts.sampled = data.txrefs?.length ?? 0;
  facts.coin = { chain: 'dogecoin', received, receivedAtLeast: !!data.hasMore, coSpent: 0, cluster: null };
  return facts;
}

export function utxoPrivacyFacts(chain: string, address: string): Promise<PrivacyFacts> {
  return ESPLORA[chain] ? esploraFacts(chain, address) : bitcoreFacts(chain, address);
}
