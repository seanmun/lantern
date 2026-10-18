import 'server-only';
import { ethers } from 'ethers';
import { PrivacyFacts } from '@/types/privacy';
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
 * - a readable name (ENS) or public identity tags on the explorer
 * - transfers with exchanges, which know their customers' identities
 * - the same address used on several chains, which links all that activity
 * - how much history is public
 * - use of a privacy system (Railgun), which breaks the link between deposits
 *   and withdrawals
 */

const TIMEOUT_MS = 15_000;
// Exchange names as they appear in explorer labels and tags
const EXCHANGE_RE = /binance|coinbase|kraken|okx|okex|bybit|kucoin|gemini|bitfinex|bitstamp|crypto\.com|huobi|htx|gate\.io|bitget|mexc|upbit|robinhood|exchange/i;
// Well-known exchange hot wallets (Ethereum mainnet)
const EXCHANGE_WALLETS: Record<string, string> = {
  '0x28c6c06298d514db089934071355e5743bf21d60': 'Binance',
  '0x21a31ee1afc51d94c2efccaa2092ad1028285549': 'Binance',
  '0xdfd5293d8e347dfe59e90efd55b2956a1343963d': 'Binance',
  '0xa9d1e08c7793af67e9d92fe308d5697fb81d3e43': 'Coinbase',
  '0x71660c4005ba85c37ccec55d0c4493e66fe775d3': 'Coinbase',
  '0x503828976d22510aad0201ac7ec88293211d23da': 'Coinbase',
};
// Privacy systems: interacting with one is a positive signal.
// Railgun's Ethereum contract (a PausableUpgradableProxy).
const PRIVACY_TOOLS: Record<string, string> = {
  '0xfa7093cdd9ee6932b4eb2c9e1cde7ce00b1fa4b9': 'Railgun',
};
// "kraken" → "Kraken", "crypto.com" stays; a bare "exchange" tag stays generic
const exchangeName = (m: string) => (m.toLowerCase() === 'exchange' ? 'An exchange' : m.toLowerCase() === 'okex' ? 'OKX' : m.length <= 4 ? m.toUpperCase() : m[0].toUpperCase() + m.slice(1).toLowerCase());
const GENERIC_TAGS = /^(token contract|stablecoin|erc-?20|contract|eoa|ens)$/i;

async function getJSON<T>(url: string): Promise<T | null> {
  try {
    const response = await fetch(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(TIMEOUT_MS) });
    return response.ok ? ((await response.json()) as T) : null;
  } catch {
    return null;
  }
}

interface BsAddress { hash: string; name?: string | null; ens_domain_name?: string | null; is_contract?: boolean; metadata?: { tags?: { name?: string }[] } | null }
interface BsTx { from?: BsAddress | null; to?: BsAddress | null }
interface BsTransfer { from?: BsAddress | null; to?: BsAddress | null }

const tagsOf = (a?: BsAddress | null) => (a?.metadata?.tags ?? []).map((t) => t.name ?? '').filter(Boolean);

async function chainFacts(chain: string, address: string) {
  const host = BLOCKSCOUT_HOSTS[chain];
  if (!host) return null;
  const [info, counters, txs, transfers] = await Promise.all([
    getJSON<BsAddress>(`${host}/api/v2/addresses/${address}`),
    getJSON<{ transactions_count?: string; token_transfers_count?: string }>(`${host}/api/v2/addresses/${address}/counters`),
    getJSON<{ items?: BsTx[] }>(`${host}/api/v2/addresses/${address}/transactions`),
    getJSON<{ items?: BsTransfer[] }>(`${host}/api/v2/addresses/${address}/token-transfers`),
  ]);
  const me = address.toLowerCase();
  const counterparties = new Map<string, { address: string; label: string | null; isContract: boolean }>();
  // The explorer attaches tags to addresses inside transaction listings, including this wallet's own
  const ownTags = new Set(tagsOf(info));
  for (const item of [...(txs?.items ?? []), ...(transfers?.items ?? [])]) {
    for (const side of [item.from, item.to]) {
      if (side?.hash?.toLowerCase() === me) tagsOf(side).forEach((t) => ownTags.add(t));
      if (!side?.hash || side.hash.toLowerCase() === me) continue;
      const label = side.name ?? side.ens_domain_name ?? tagsOf(side)[0] ?? null;
      counterparties.set(side.hash.toLowerCase(), { address: side.hash, label, isContract: !!side.is_contract });
    }
  }
  return {
    chain,
    ens: info?.ens_domain_name ?? null,
    tags: [...ownTags].filter((t) => !GENERIC_TAGS.test(t)),
    transactions: Number(counters?.transactions_count ?? 0),
    tokenTransfers: Number(counters?.token_transfers_count ?? 0),
    counterparties: [...counterparties.values()],
  };
}

/** Has this address ever sent a transaction on the chain? */
async function used(config: typeof BASE_CONFIG, address: string) {
  try {
    return (await createProvider(config).getTransactionCount(address)) > 0;
  } catch {
    return false;
  }
}

export async function privacyFacts(input: string): Promise<PrivacyFacts> {
  const address = ethers.getAddress(input.toLowerCase());
  const [eth, pls, baseUsed] = await Promise.all([
    chainFacts('ethereum', address),
    chainFacts('pulsechain', address),
    used(BASE_CONFIG, address),
  ]);
  const chains = [eth, pls].filter((c): c is NonNullable<typeof c> => !!c);
  // Sent-transaction counts from the chains themselves, for the cross-chain check
  const [ethUsed, plsUsed] = await Promise.all([used(ETHEREUM_CONFIG, address), used(PULSECHAIN_CONFIG, address)]);
  const activeChains = [ethUsed && 'ethereum', plsUsed && 'pulsechain', baseUsed && 'base'].filter((c): c is string => !!c);

  const counterparties = chains.flatMap((c) => c.counterparties.map((p) => ({ ...p, chain: c.chain })));
  const exchanges = new Map<string, number>();
  const privacyTools = new Set<string>();
  for (const p of counterparties) {
    const match = p.label?.match(EXCHANGE_RE)?.[0];
    const known = EXCHANGE_WALLETS[p.address.toLowerCase()] ?? (match ? exchangeName(match) : null);
    if (known) exchanges.set(known, (exchanges.get(known) ?? 0) + 1);
    const tool = PRIVACY_TOOLS[p.address.toLowerCase()];
    if (tool) privacyTools.add(tool);
  }

  return {
    address,
    ens: eth?.ens ?? null,
    identityTags: [...new Set(chains.flatMap((c) => c.tags))],
    activeChains,
    transactions: chains.reduce((s, c) => s + c.transactions, 0),
    exchanges: [...exchanges.entries()].map(([name, count]) => ({ name, count })),
    privacyTools: [...privacyTools],
    counterparties: [...new Set(counterparties.map((p) => p.address.toLowerCase()))].slice(0, 500),
    sampled: counterparties.length,
  };
}
