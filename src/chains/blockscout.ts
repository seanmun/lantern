import 'server-only';
import { Asset } from '@/types';

/**
 * Keyless Blockscout explorer APIs (v2) for NFT lists and token discovery.
 * Ethereum's and Pulsechain's explorers allow server requests; Base's and
 * Robinhood's sit behind a bot challenge, so those chains use Alchemy.
 */

export const BLOCKSCOUT_HOSTS: Record<string, string> = {
  ethereum: 'https://eth.blockscout.com',
  pulsechain: 'https://api.scan.pulsechain.com',
};

const MAX_NFT_PAGES = 10; // 50 per page
const TIMEOUT_MS = 15_000;

/** ipfs:// and ar:// URIs → public HTTP gateways so <img> can load them. */
export function toHttpUrl(url?: string | null): string | undefined {
  if (!url) return undefined;
  if (url.startsWith('ipfs://')) return `https://ipfs.io/ipfs/${url.slice(7).replace(/^ipfs\//, '')}`;
  if (url.startsWith('ar://')) return `https://arweave.net/${url.slice(5)}`;
  return url;
}

/**
 * Airdropped scam tokens/NFTs usually advertise a site in their name
 * ("https://claim-xyz.io", "EthFork2.com", "Visit … to claim").
 */
export function looksLikeSpam(...labels: (string | null | undefined)[]): boolean {
  return labels.some((label) => {
    if (!label) return false;
    const text = label.toLowerCase();
    return /https?:\/\/|www\.|\.(com|net|io|org|xyz|gd|app|site|top|live|cc|me|claim)\b|claim|airdrop|visit|voucher/.test(text);
  });
}

async function getJSON<T>(url: string, timeoutMs = TIMEOUT_MS): Promise<T> {
  const response = await fetch(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(timeoutMs) });
  if (!response.ok) throw new Error(`${new URL(url).host} ${response.status}`);
  return response.json();
}

interface BlockscoutNftItem {
  id: string;
  value?: string;
  image_url?: string | null;
  animation_url?: string | null;
  metadata?: { name?: string; image?: string } | null;
  token: { address_hash?: string; address?: string; name?: string | null; symbol?: string | null; type: string; reputation?: string | null };
}

export async function fetchBlockscoutNfts(chain: string, address: string, idPrefix: string): Promise<Asset[]> {
  const host = BLOCKSCOUT_HOSTS[chain];
  if (!host) return [];

  const assets: Asset[] = [];
  let params = '';
  for (let page = 0; page < MAX_NFT_PAGES; page++) {
    const body = await getJSON<{ items: BlockscoutNftItem[]; next_page_params: Record<string, string | number> | null }>(
      `${host}/api/v2/addresses/${address}/nft?type=ERC-721%2CERC-1155${params}`
    );
    for (const item of body.items ?? []) {
      const contract = item.token.address_hash ?? item.token.address ?? '';
      if (item.token.reputation === 'scam' || looksLikeSpam(item.token.name, item.token.symbol, item.metadata?.name)) continue;
      assets.push({
        id: `${idPrefix}_${address}_${contract}_${item.id}`,
        type: 'nft',
        chain,
        walletAddress: address,
        name: item.metadata?.name || `${item.token.name ?? 'NFT'} #${item.id.length > 12 ? `${item.id.slice(0, 6)}…` : item.id}`,
        symbol: item.token.symbol || 'NFT',
        balance: item.value ?? '1',
        balanceFormatted: item.value ?? '1',
        contractAddress: contract,
        tokenId: item.id,
        tokenStandard: item.token.type,
        imageUrl: toHttpUrl(item.image_url || item.metadata?.image),
        collectionName: item.token.name ?? undefined,
        lastUpdated: new Date(),
      });
    }
    if (!body.next_page_params) break;
    params = '&' + new URLSearchParams(Object.entries(body.next_page_params).map(([k, v]) => [k, String(v)])).toString();
  }
  return assets;
}

export interface DiscoveredToken {
  address: string;
  symbol: string;
  name: string;
  decimals: number;
  rawBalance: bigint;
  iconUrl?: string;
}

const MAX_TOKEN_PAGES = 6;      // 50 per page; Ethereum's explorer returns the most valuable first
const TOKEN_BUDGET_MS = 20_000; // stop paging (keeping what we have) after this long

interface BlockscoutTokenItem {
  value: string;
  token: {
    address?: string;
    address_hash?: string;
    symbol?: string | null;
    name?: string | null;
    decimals?: string | null;
    type: string;
    icon_url?: string | null;
    reputation?: string | null;
  };
}

/** ERC-20s the explorer has indexed for the address, minus obvious spam. */
export async function fetchBlockscoutTokens(chain: string, address: string): Promise<DiscoveredToken[]> {
  const host = BLOCKSCOUT_HOSTS[chain];
  if (!host) return [];

  const started = Date.now();
  const items: BlockscoutTokenItem[] = [];
  let params = '';
  for (let page = 0; page < MAX_TOKEN_PAGES; page++) {
    if (page > 0 && Date.now() - started > TOKEN_BUDGET_MS) break;
    try {
      const body = await getJSON<{ items: BlockscoutTokenItem[]; next_page_params: Record<string, string | number | null> | null }>(
        `${host}/api/v2/addresses/${address}/tokens?type=ERC-20${params}`,
        page === 0 ? 25_000 : TIMEOUT_MS // very large wallets make the explorer slow
      );
      items.push(...(body.items ?? []));
      if (!body.next_page_params) break;
      params = '&' + new URLSearchParams(
        Object.entries(body.next_page_params).filter(([, v]) => v !== null).map(([k, v]) => [k, String(v)])
      ).toString();
    } catch (error) {
      if (page === 0) throw error; // nothing at all → report; later pages → keep what we have
      break;
    }
  }

  return items
    .filter((b) => b.token.type === 'ERC-20' && b.token.reputation !== 'scam' && !looksLikeSpam(b.token.name, b.token.symbol))
    .map((b) => ({
      address: b.token.address_hash ?? b.token.address ?? '',
      symbol: b.token.symbol ?? '?',
      name: b.token.name ?? 'Unknown token',
      decimals: Number(b.token.decimals ?? 18),
      rawBalance: BigInt(b.value || '0'),
      iconUrl: b.token.icon_url ?? undefined,
    }))
    .filter((t) => t.address && t.rawBalance > BigInt(0));
}

/** One 'collection' asset per contract / collection, used for counts and floor value. */
export function collectionAssets(nfts: Asset[], floors: Map<string, { floor: number; currency: 'ETH' | 'USD' }> = new Map()): Asset[] {
  const groups = new Map<string, Asset[]>();
  for (const nft of nfts) {
    const key = nft.contractAddress?.toLowerCase() ?? nft.collectionName ?? 'unknown';
    groups.set(key, [...(groups.get(key) ?? []), nft]);
  }
  return [...groups].map(([key, items]) => {
    const first = items[0];
    const count = items.reduce((sum, i) => sum + (Number(i.balance) || 1), 0);
    const floor = floors.get(key);
    return {
      id: `${first.chain}_${first.walletAddress}_collection_${key}`,
      type: 'collection',
      chain: first.chain,
      walletAddress: first.walletAddress,
      name: first.collectionName ?? 'Unknown collection',
      symbol: first.symbol,
      balance: String(count),
      balanceFormatted: String(count),
      contractAddress: first.contractAddress,
      collectionName: first.collectionName,
      imageUrl: items.find((i) => i.imageUrl)?.imageUrl,
      floorPrice: floor?.floor,
      floorCurrency: floor?.currency,
      valueUSD: floor?.currency === 'USD' ? floor.floor * count : undefined,
      lastUpdated: new Date(),
    } satisfies Asset;
  });
}
