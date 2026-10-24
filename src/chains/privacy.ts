import 'server-only';
import { ethers } from 'ethers';
import { PrivacyFacts } from '@/types/privacy';
import { timezoneOf } from '@/utils/timezone';
import EXCHANGE_LIST from '@/config/exchangeWallets.json';
import { BLOCKSCOUT_HOSTS } from './blockscout';
import { createProvider } from './evm';
import { ETHEREUM_CONFIG } from './ethereum';
import { PULSECHAIN_CONFIG } from './pulsechain';
import { BASE_CONFIG } from './base';

/**
 * Public facts about how identifiable a wallet is, for the privacy score.
 * Everything here is what anyone (a scammer, a chain-analysis firm) can see
 * for free. The score itself is computed in the browser, which also adds
 * what only it knows (links to the viewer's other tracked wallets).
 *
 * Signals:
 * - a readable name (ENS), what its profile publishes, and explorer identity tags
 * - transfers with exchanges, which know their customers' identities
 * - who funded the wallet first (an exchange withdrawal, another wallet)
 * - exchange deposit addresses it pays into: an account in someone's name,
 *   and every other wallet paying into the same one is likely the same person
 * - wallets it both sends to and receives from
 * - a daily pause in its own transactions, which hints at a time zone
 * - the same address used on several chains, which links all that activity
 * - how much history is public
 * - use of a privacy system (Railgun, Tornado Cash), which breaks the link
 *   between deposits and withdrawals
 *
 * Wallets found only by digging (other payers into the same deposit
 * address) are reported as counts, never as addresses: anyone can check any
 * address here, and Lantern shouldn't be a map to a stranger's other wallets.
 * Direct counterparties and the funder are listed, as any explorer shows them.
 */

const TIMEOUT_MS = 15_000;
const CACHE_MS = 10 * 60_000;
const DEPOSIT_CANDIDATES = 3; // each costs two to four explorer calls; the free tier rate-limits
// Exchange names as they appear in explorer labels and tags
const EXCHANGE_RE = /binance|coinbase|kraken|okx|okex|bybit|kucoin|gemini|bitfinex|bitstamp|crypto\.com|huobi|htx|gate\.io|bitget|mexc|upbit|robinhood|exchange/i;
// Exchange hot wallets and deposit addresses on Ethereum (see config/exchangeWallets.NOTICE.md).
// Ethereum only: PulseChain copied these addresses at its fork, but exchanges don't run them there.
const EXCHANGE_WALLETS = new Map<string, string>();
for (const [name, addresses] of Object.entries(EXCHANGE_LIST as Record<string, string[]>)) {
  for (const a of addresses) EXCHANGE_WALLETS.set(a, name);
}
// Privacy systems on Ethereum: interacting with one is a positive signal
const PRIVACY_TOOLS: Record<string, string> = {
  '0xfa7093cdd9ee6932b4eb2c9e1cde7ce00b1fa4b9': 'Railgun',
  '0xd90e2f925da726b50c4ed8d0fb90ad053324f31b': 'Tornado Cash', // router
  '0x12d66f87a04a9e220743712ce6d9bb1b5616b8fc': 'Tornado Cash', // 0.1 ETH pool
  '0x47ce0c6ed5b0ce3d3a51fdb1c52dc66a7c3c2936': 'Tornado Cash', // 1 ETH pool
  '0x910cbd523d972eb0a6f4cae4618ad62622b39dbf': 'Tornado Cash', // 10 ETH pool
  '0xa160cdab225685da1d56aa342ad8841c3b53f291': 'Tornado Cash', // 100 ETH pool
};
// What an ENS profile can publish, by text-record key
const ENS_RECORDS: [string, string][] = [
  ['com.twitter', 'X (Twitter)'], ['com.github', 'GitHub'], ['email', 'Email'], ['url', 'Website'],
  ['org.telegram', 'Telegram'], ['com.discord', 'Discord'], ['com.reddit', 'Reddit'], ['com.linkedin', 'LinkedIn'],
];
// PulseChain copied every Ethereum account at its fork, transaction counter included
const PULSECHAIN_FORK_BLOCK = 17_233_000;

// "kraken" → "Kraken", "crypto.com" stays; a bare "exchange" tag stays generic
const exchangeName = (m: string) => (m.toLowerCase() === 'exchange' ? 'An exchange' : m.toLowerCase() === 'okex' ? 'OKX' : m.length <= 4 ? m.toUpperCase() : m[0].toUpperCase() + m.slice(1).toLowerCase());
const GENERIC_TAGS = /^(token contract|stablecoin|erc-?20|contract|eoa|ens)$/i;

async function getJSON<T>(url: string): Promise<T | null> {
  try {
    const response = await fetch(url, { headers: { Accept: 'application/json', 'User-Agent': 'Lantern/1.0' }, signal: AbortSignal.timeout(TIMEOUT_MS) });
    return response.ok ? ((await response.json()) as T) : null;
  } catch {
    return null;
  }
}

interface BsAddress { hash: string; name?: string | null; ens_domain_name?: string | null; is_contract?: boolean; metadata?: { tags?: { name?: string }[] } | null }
interface BsTx { from?: BsAddress | null; to?: BsAddress | null; timestamp?: string; value?: string }
interface BsTransfer { from?: BsAddress | null; to?: BsAddress | null; timestamp?: string }
interface LegacyTx { from: string; to: string; value: string; timeStamp: string }

const tagsOf = (a?: BsAddress | null) => (a?.metadata?.tags ?? []).map((t) => t.name ?? '').filter(Boolean);
const labelOf = (a?: BsAddress | null) => a?.name ?? a?.ens_domain_name ?? tagsOf(a)[0] ?? null;
/** The exchange behind an address, from the bundled list (Ethereum) or the explorer's own label */
const exchangeOf = (chain: string, address: string, label: string | null) =>
  (chain === 'ethereum' ? EXCHANGE_WALLETS.get(address.toLowerCase()) : undefined) ?? (label?.match(EXCHANGE_RE) ? exchangeName(label.match(EXCHANGE_RE)![0]) : null);

async function chainFacts(chain: string, address: string) {
  const host = BLOCKSCOUT_HOSTS[chain];
  if (!host) return null;
  const [info, counters, txs, transfers] = await Promise.all([
    getJSON<BsAddress>(`${host}/api/v2/addresses/${address}`),
    getJSON<{ transactions_count?: string; token_transfers_count?: string }>(`${host}/api/v2/addresses/${address}/counters`),
    getJSON<{ items?: BsTx[] }>(`${host}/api/v2/addresses/${address}/transactions`),
    getJSON<{ items?: BsTransfer[] }>(`${host}/api/v2/addresses/${address}/token-transfers`),
  ]);
  // Nothing came back: the explorer is down or rate-limiting, not a wallet with no history
  if (!info && !counters && !txs) return null;
  const me = address.toLowerCase();
  const counterparties = new Map<string, { address: string; label: string | null; isContract: boolean }>();
  const sentTo = new Map<string, number>(); // EOAs this wallet paid, with counts
  const receivedFrom = new Set<string>();
  const sentTimes: number[] = [];
  // The explorer attaches tags to addresses inside transaction listings, including this wallet's own
  const ownTags = new Set(tagsOf(info));
  for (const item of [...(txs?.items ?? []), ...(transfers?.items ?? [])]) {
    const from = item.from?.hash?.toLowerCase();
    const to = item.to?.hash?.toLowerCase();
    for (const side of [item.from, item.to]) {
      if (side?.hash?.toLowerCase() === me) tagsOf(side).forEach((t) => ownTags.add(t));
      if (!side?.hash || side.hash.toLowerCase() === me) continue;
      counterparties.set(side.hash.toLowerCase(), { address: side.hash, label: labelOf(side), isContract: !!side.is_contract });
    }
    if (from === me && to && to !== me && !item.to?.is_contract) sentTo.set(to, (sentTo.get(to) ?? 0) + 1);
    if (to === me && from && from !== me && !item.from?.is_contract) receivedFrom.add(from);
  }
  // Only transactions the wallet itself sent say when its owner is awake
  for (const t of txs?.items ?? []) {
    if (t.from?.hash?.toLowerCase() === me && t.timestamp) sentTimes.push(Date.parse(t.timestamp) / 1000);
  }
  return {
    chain,
    host,
    ens: info?.ens_domain_name ?? null,
    tags: [...ownTags].filter((t) => !GENERIC_TAGS.test(t)),
    transactions: Number(counters?.transactions_count ?? 0),
    counterparties: [...counterparties.values()],
    sentTo,
    receivedFrom,
    sentTimes,
  };
}

/**
 * Has this address ever sent a transaction on the chain? On PulseChain only
 * sends after the fork count: a pre-fork Ethereum wallet inherits its count
 * without ever having touched PulseChain.
 */
async function used(config: typeof BASE_CONFIG, address: string) {
  try {
    const provider = createProvider(config);
    if (config === PULSECHAIN_CONFIG) {
      const [now, atFork] = await Promise.all([provider.getTransactionCount(address), provider.getTransactionCount(address, PULSECHAIN_FORK_BLOCK)]);
      return now > atFork;
    }
    return (await provider.getTransactionCount(address)) > 0;
  } catch {
    return false;
  }
}

/** What the wallet's ENS profile publishes about its owner (record kinds, not values). */
async function ensRecords(name: string): Promise<string[]> {
  try {
    const resolver = await createProvider(ETHEREUM_CONFIG).getResolver(name);
    if (!resolver) return [];
    const values = await Promise.all(ENS_RECORDS.map(([key]) => resolver.getText(key).catch(() => null)));
    return ENS_RECORDS.filter((_, i) => values[i]?.trim()).map(([, label]) => label);
  } catch {
    return [];
  }
}

/** The first incoming transfer of value, from the explorer's Etherscan-style API (plain and internal). */
async function firstFunder(chain: string, host: string, address: string): Promise<PrivacyFacts['funder']> {
  const me = address.toLowerCase();
  const lists = await Promise.all(
    ['txlist', 'txlistinternal'].map((action) =>
      getJSON<{ result?: LegacyTx[] | string }>(`${host}/api?module=account&action=${action}&address=${address}&sort=asc&page=1&offset=10`))
  );
  const incoming = lists
    .flatMap((l) => (Array.isArray(l?.result) ? l.result : []))
    .filter((t) => t.to?.toLowerCase() === me && t.from?.toLowerCase() !== me && BigInt(t.value || '0') > BigInt(0))
    .sort((a, b) => Number(a.timeStamp) - Number(b.timeStamp));
  const funder = incoming[0]?.from?.toLowerCase();
  if (!funder) return null;
  const info = await getJSON<BsAddress>(`${host}/api/v2/addresses/${funder}`);
  const label = labelOf(info);
  const exchange = exchangeOf(chain, funder, label);
  if (exchange) return { address: funder, kind: 'exchange', name: exchange, chain };
  if (PRIVACY_TOOLS[funder]) return { address: funder, kind: 'privacy-tool', name: PRIVACY_TOOLS[funder], chain };
  return { address: funder, kind: info?.is_contract ? 'contract' : 'wallet', name: label, chain };
}

/**
 * Exchange deposit addresses: per-customer addresses an exchange sweeps into
 * its hot wallets. A recipient that forwards most of what it gets to an
 * exchange is one, and the other wallets paying into it likely share an owner.
 */
async function depositAddresses(host: string, me: string, sentTo: Map<string, number>): Promise<PrivacyFacts['deposits']> {
  const candidates = [...sentTo]
    .filter(([a]) => !EXCHANGE_WALLETS.has(a)) // already an exchange link
    .sort((a, b) => b[1] - a[1])
    .slice(0, DEPOSIT_CANDIDATES)
    .map(([a]) => a);
  // One at a time, to stay under the explorer's rate limit
  const found: PrivacyFacts['deposits'] = [];
  for (const candidate of candidates) {
    const [out, outTokens] = await Promise.all([
      getJSON<{ items?: BsTx[] }>(`${host}/api/v2/addresses/${candidate}/transactions?filter=from`),
      getJSON<{ items?: BsTransfer[] }>(`${host}/api/v2/addresses/${candidate}/token-transfers?filter=from`),
    ]);
    const destinations = [...(out?.items ?? []), ...(outTokens?.items ?? [])].map((t) => t.to).filter((t): t is BsAddress => !!t?.hash);
    if (destinations.length === 0) continue;
    const exchanges = destinations.map((d) => exchangeOf('ethereum', d.hash, labelOf(d))).filter((e): e is string => !!e);
    if (exchanges.length / destinations.length < 0.6) continue;
    const exchange = [...new Set(exchanges)].sort((a, b) => exchanges.filter((e) => e === b).length - exchanges.filter((e) => e === a).length)[0];
    const [inc, incTokens] = await Promise.all([
      getJSON<{ items?: BsTx[] }>(`${host}/api/v2/addresses/${candidate}/transactions?filter=to`),
      getJSON<{ items?: BsTransfer[] }>(`${host}/api/v2/addresses/${candidate}/token-transfers?filter=to`),
    ]);
    const senders = new Set(
      [...(inc?.items ?? []), ...(incTokens?.items ?? [])]
        .map((t) => t.from)
        .filter((f): f is BsAddress => !!f?.hash && !f.is_contract && f.hash.toLowerCase() !== me && !exchangeOf('ethereum', f.hash, labelOf(f)))
        .map((f) => f.hash.toLowerCase())
    );
    found.push({ exchange, otherSenders: senders.size });
  }
  return found;
}


export class PrivacyUnavailable extends Error {}

const cache: Map<string, { facts: PrivacyFacts; at: number }> = ((globalThis as { __privacyFacts?: Map<string, { facts: PrivacyFacts; at: number }> }).__privacyFacts ??= new Map());

export async function privacyFacts(input: string, { fresh = false }: { fresh?: boolean } = {}): Promise<PrivacyFacts> {
  const address = ethers.getAddress(input.toLowerCase());
  const hit = cache.get(address);
  if (hit && !fresh && Date.now() - hit.at < CACHE_MS) return hit.facts;

  const [eth, pls, ethUsed, plsUsed, baseUsed] = await Promise.all([
    chainFacts('ethereum', address),
    chainFacts('pulsechain', address),
    used(ETHEREUM_CONFIG, address),
    used(PULSECHAIN_CONFIG, address),
    used(BASE_CONFIG, address),
  ]);
  const chains = [eth, pls].filter((c): c is NonNullable<typeof c> => !!c);
  // A wallet that couldn't be read must not score as perfectly private
  if (chains.length === 0) throw new PrivacyUnavailable('Block explorers are unavailable right now');
  const activeChains = [ethUsed && 'ethereum', plsUsed && 'pulsechain', baseUsed && 'base'].filter((c): c is string => !!c);
  const me = address.toLowerCase();

  // Born on PulseChain after the fork: no Ethereum history to find a funder in
  const funderChain = ethUsed || !pls ? eth : pls;
  const [records, funder, deposits] = await Promise.all([
    eth?.ens ? ensRecords(eth.ens) : Promise.resolve([]),
    funderChain ? firstFunder(funderChain.chain, funderChain.host, address) : Promise.resolve(null),
    eth ? depositAddresses(eth.host, me, eth.sentTo) : Promise.resolve([]),
  ]);

  const counterparties = chains.flatMap((c) => c.counterparties.map((p) => ({ ...p, chain: c.chain })));
  const exchanges = new Map<string, number>();
  const privacyTools = new Set<string>();
  for (const p of counterparties) {
    const known = exchangeOf(p.chain, p.address, p.label);
    if (known) exchanges.set(known, (exchanges.get(known) ?? 0) + 1);
    const tool = p.chain === 'ethereum' ? PRIVACY_TOOLS[p.address.toLowerCase()] : undefined;
    if (tool) privacyTools.add(tool);
  }
  if (funder?.kind === 'privacy-tool' && funder.name) privacyTools.add(funder.name);

  const twoWay = new Set(chains.flatMap((c) => [...c.sentTo.keys()].filter((a) => c.receivedFrom.has(a) && !EXCHANGE_WALLETS.has(a))));

  const facts: PrivacyFacts = {
    address,
    ens: eth?.ens ?? null,
    ensRecords: records,
    identityTags: [...new Set(chains.flatMap((c) => c.tags))],
    activeChains,
    transactions: chains.reduce((s, c) => s + c.transactions, 0),
    exchanges: [...exchanges.entries()].map(([name, count]) => ({ name, count })),
    privacyTools: [...privacyTools],
    counterparties: [...new Set(counterparties.map((p) => p.address.toLowerCase()))].slice(0, 500),
    sampled: counterparties.length,
    funder,
    deposits,
    twoWay: twoWay.size,
    timezone: timezoneOf(chains.flatMap((c) => c.sentTimes)),
  };
  cache.set(address, { facts, at: Date.now() });
  return facts;
}
