import 'server-only';
import { Asset, APIResponse } from '@/types';
import { fetchWithRetry, APIError } from '@/utils/api';
import { collectionAssets } from './blockscout';

/**
 * Bitcoin Handler - BTC + Ordinals Support
 *
 * Handles:
 * - BTC balance (Blockstream) with retry logic
 * - Ordinals (Bitcoin NFTs) via Xverse
 * - Rate limiting and error recovery
 *
 * Fungible tokens:
 * - Runes via the keyless Xverse wallet endpoint (balances + USD prices)
 * - BRC-20 balances via Unisat when UNISAT_API_KEY is set (free developer
 *   key); priced from Xverse's keyless BRC-20 price feed
 *
 * Ordinals sources (Hiro's Ordinals API shut down in March 2026):
 * 1. Xverse / Secret Key Labs API when XVERSE_API_KEY is set (documented,
 *    includes inscription numbers, collections and floor prices)
 * 2. Otherwise the keyless endpoint the Xverse wallet uses (undocumented;
 *    inscription ids and content types only)
 *
 * CUSTOMIZATION POINTS:
 * - API_BASE_URL: Bitcoin API endpoint (Blockstream, Mempool, etc.)
 * - Address format validation (Legacy, SegWit, Taproot)
 */

interface XverseInscription {
  id: string;
  number?: number;
  name?: string;
  contentType?: string;
  effectiveContentType?: string;
  collectionName?: string;
  collectionFloorPrice?: { valueInUsd?: string };
}

interface XverseUtxoPage {
  total: number;
  results: { inscriptions: { id: string; content_type?: string }[] }[];
}

interface XverseCollection {
  collection_id: string;
  collection_name: string;
  total_inscriptions: number;
  inscription_floor_price_usd?: number | null;
  thumbnail_inscriptions?: { id: string; content_type?: string }[];
}

const DEFAULT_COLLECTION = 'Bitcoin Ordinals';
const UNCATEGORIZED_ID = 'other_collectibles';

interface XverseRune {
  id: string;
  runeName: string;
  symbol?: string;
  amount: number | string; // raw units
  divisibility: number;
  currentPrice?: number;   // USD per whole rune
}

interface UnisatBrc20Summary {
  code: number;
  msg: string;
  data?: { total: number; detail: { ticker: string; overallBalance: string }[] };
}

const XVERSE_API_KEY = process.env.XVERSE_API_KEY;
const UNISAT_API_KEY = process.env.UNISAT_API_KEY;
const UTXO_PAGE_SIZE = 60;
const MAX_UTXO_PAGES = 20;

export class BitcoinHandler {
  private readonly CHAIN_NAME = 'bitcoin';

  // CUSTOMIZATION: Bitcoin API endpoints
  private readonly API_BASE_URL = 'https://blockstream.info/api';

  // Bitcoin address format detection
  private readonly ADDRESS_PATTERNS = {
    legacy: /^[13][a-km-zA-HJ-NP-Z1-9]{25,34}$/,     // P2PKH/P2SH
    segwit: /^bc1q[a-z0-9]{38,58}$/,                  // Bech32
    taproot: /^bc1p[a-z0-9]{58}$/                     // Bech32m
  };

  /**
   * Validate Bitcoin address format
   */
  private validateBitcoinAddress(address: string): boolean {
    return Object.values(this.ADDRESS_PATTERNS).some(pattern => pattern.test(address));
  }

  /**
   * Get address type for display purposes
   */
  private getAddressType(address: string): string {
    if (this.ADDRESS_PATTERNS.legacy.test(address)) return 'Legacy';
    if (this.ADDRESS_PATTERNS.segwit.test(address)) return 'SegWit';
    if (this.ADDRESS_PATTERNS.taproot.test(address)) return 'Taproot';
    return 'Unknown';
  }

  /**
   * Get BTC balance for an address
   */
  async getBTCBalance(address: string): Promise<APIResponse<Asset>> {
    try {
      if (!this.validateBitcoinAddress(address)) {
        throw new Error('Invalid Bitcoin address format');
      }

      console.log(`🟠 Fetching BTC balance for: ${address} (${this.getAddressType(address)})`);

      const response = await fetchWithRetry(
        `${this.API_BASE_URL}/address/${address}`,
        {},
        {
          maxRetries: 3,
          onRetry: (attempt, error, delay) => {
            console.log(`⚠️ Bitcoin API retry attempt ${attempt} after ${delay}ms:`, error.message);
          }
        }
      );

      const data = await response.json();

      // Convert satoshis to BTC (1 BTC = 100,000,000 satoshis)
      const balanceSatoshis = data.chain_stats.funded_txo_sum - data.chain_stats.spent_txo_sum;
      const balanceBTC = balanceSatoshis / 100000000;

      const asset: Asset = {
        id: `btc_${address}_native`,
        type: 'native',
        chain: this.CHAIN_NAME,
        walletAddress: address,
        name: 'Bitcoin',
        symbol: 'BTC',
        decimals: 8,
        balance: balanceSatoshis.toString(),
        balanceFormatted: balanceBTC.toFixed(8),
        lastUpdated: new Date()
      };

      return {
        success: true,
        data: asset,
        timestamp: new Date()
      };
    } catch (error) {
      console.error('❌ Error fetching BTC balance:', error);

      let errorMessage = 'Failed to fetch BTC balance';
      let errorCode = 'UNKNOWN_ERROR';

      if (error instanceof APIError) {
        errorMessage = error.message;
        errorCode = error.code || 'API_ERROR';

        if (error.rateLimitInfo?.isRateLimited) {
          errorCode = 'RATE_LIMITED';
          errorMessage = `Rate limited. Retry after ${Math.ceil((error.rateLimitInfo.retryAfter || 0) / 1000)}s`;
        }
      } else if (error instanceof Error) {
        errorMessage = error.message;
      }

      return {
        success: false,
        error: errorMessage,
        errorCode,
        timestamp: new Date()
      };
    }
  }

  /**
   * Get Ordinals (Bitcoin NFTs) owned by an address
   */
  async getOrdinals(address: string): Promise<APIResponse<Asset[]>> {
    try {
      if (XVERSE_API_KEY) {
        // Documented API: every inscription carries its collection and floor
        const ordinals = await this.fetchXverseInscriptions(address);
        const floors = new Map<string, { floor: number; currency: 'USD' }>();
        for (const o of ordinals) {
          if (o.collectionName && o.floorPrice) floors.set(o.collectionName, { floor: o.floorPrice, currency: 'USD' });
        }
        const inCollections = ordinals.filter((o) => o.collectionName && o.collectionName !== DEFAULT_COLLECTION);
        return { success: true, data: [...ordinals, ...collectionAssets(inCollections, floors)], timestamp: new Date() };
      }

      const [ordinals, collections] = await Promise.all([
        this.fetchXverseWalletInscriptions(address),
        this.fetchXverseCollections(address).catch((error) => {
          console.warn('⚠️ Ordinals collections unavailable:', error instanceof Error ? error.message : error);
          return [] as XverseCollection[];
        }),
      ]);
      return { success: true, data: [...ordinals, ...this.applyCollections(address, ordinals, collections)], timestamp: new Date() };
    } catch (error) {
      console.error('❌ Error fetching Ordinals:', error);
      return {
        success: false,
        error: `Failed to fetch Ordinals: ${error instanceof Error ? error.message : error}`,
        timestamp: new Date()
      };
    }
  }

  /**
   * Keyless Xverse wallet endpoint: the address's collections with counts and
   * USD floor prices, plus up to 4 sample inscriptions each.
   */
  private async fetchXverseCollections(address: string): Promise<XverseCollection[]> {
    const all: XverseCollection[] = [];
    for (let offset = 0; offset < 500; offset += 50) {
      const response = await fetchWithRetry(
        `https://api.xverse.app/v1/address/${address}/ordinals/collections?offset=${offset}&limit=50`,
        { headers: { Accept: 'application/json' } },
        { maxRetries: 2 }
      );
      const page: { total: number; results: XverseCollection[] } = await response.json();
      all.push(...(page.results ?? []));
      if (offset + 50 >= page.total) break;
    }
    return all;
  }

  /**
   * Tag the inscriptions we can match (collection samples) and add one
   * 'collection' asset per collection, valued at count × floor.
   */
  private applyCollections(address: string, ordinals: Asset[], collections: XverseCollection[]): Asset[] {
    const byInscription = new Map<string, XverseCollection>();
    for (const c of collections) {
      if (c.collection_id === UNCATEGORIZED_ID) continue;
      for (const t of c.thumbnail_inscriptions ?? []) byInscription.set(t.id, c);
    }
    for (const o of ordinals) {
      const c = o.inscriptionId ? byInscription.get(o.inscriptionId) : undefined;
      if (c) o.collectionName = c.collection_name;
    }

    return collections
      .filter((c) => c.collection_id !== UNCATEGORIZED_ID && c.total_inscriptions > 0)
      .map((c): Asset => {
        const floor = c.inscription_floor_price_usd && c.inscription_floor_price_usd > 0 ? c.inscription_floor_price_usd : undefined;
        const sample = c.thumbnail_inscriptions?.[0];
        return {
          id: `btc_${address}_collection_${c.collection_id}`,
          type: 'collection',
          chain: this.CHAIN_NAME,
          walletAddress: address,
          name: c.collection_name,
          symbol: 'ORD',
          balance: String(c.total_inscriptions),
          balanceFormatted: String(c.total_inscriptions),
          collectionName: c.collection_name,
          inscriptionId: sample?.id,
          contentType: sample?.content_type,
          imageUrl: sample ? `/content/${sample.id}` : undefined,
          floorPrice: floor,
          floorCurrency: floor !== undefined ? 'USD' : undefined,
          valueUSD: floor !== undefined ? floor * c.total_inscriptions : undefined,
          lastUpdated: new Date(),
        };
      });
  }

  /**
   * Documented Xverse API: full inscription list with metadata.
   */
  private async fetchXverseInscriptions(address: string): Promise<Asset[]> {
    const response = await fetchWithRetry(
      `https://api.secretkeylabs.io/v1/ordinals/address/${address}/inscriptions`,
      { headers: { Accept: 'application/json', 'x-api-key': XVERSE_API_KEY! } },
      { maxRetries: 2 }
    );
    const data: { items?: XverseInscription[] } = await response.json();

    return (data.items ?? []).map((item) => {
      const floor = Number(item.collectionFloorPrice?.valueInUsd);
      return this.ordinalAsset(address, {
        id: item.id,
        name: item.name || (item.collectionName && item.number !== undefined
          ? `${item.collectionName} #${item.number}`
          : `Inscription #${item.number ?? item.id.slice(0, 8)}`),
        number: item.number,
        contentType: item.effectiveContentType || item.contentType,
        collectionName: item.collectionName,
        floorPrice: Number.isFinite(floor) && floor > 0 ? floor : undefined,
      });
    });
  }

  /**
   * Keyless fallback: walks the address's inscription-bearing UTXOs.
   */
  private async fetchXverseWalletInscriptions(address: string): Promise<Asset[]> {
    const fetchPage = async (page: number): Promise<XverseUtxoPage> => {
      const response = await fetchWithRetry(
        `https://api.xverse.app/v1/address/${address}/ordinal-utxo?offset=${page * UTXO_PAGE_SIZE}&limit=${UTXO_PAGE_SIZE}`,
        { headers: { Accept: 'application/json' } },
        { maxRetries: 2 }
      );
      return response.json();
    };

    // First page tells us the total; fetch the rest in parallel
    const first = await fetchPage(0);
    const pageCount = Math.min(MAX_UTXO_PAGES, Math.ceil(first.total / UTXO_PAGE_SIZE));
    const rest = await Promise.all(Array.from({ length: Math.max(0, pageCount - 1) }, (_, i) => fetchPage(i + 1)));

    const ordinals: Asset[] = [];
    const seen = new Set<string>();
    for (const page of [first, ...rest]) {
      for (const utxo of page.results ?? []) {
        for (const inscription of utxo.inscriptions ?? []) {
          if (seen.has(inscription.id)) continue;
          seen.add(inscription.id);
          ordinals.push(this.ordinalAsset(address, {
            id: inscription.id,
            name: `Inscription ${inscription.id.slice(0, 8)}…`,
            contentType: inscription.content_type,
          }));
        }
      }
    }

    return ordinals;
  }

  private ordinalAsset(
    address: string,
    inscription: { id: string; name: string; number?: number; contentType?: string; collectionName?: string; floorPrice?: number }
  ): Asset {
    return {
      id: `btc_${address}_ordinal_${inscription.id}`,
      type: 'ordinal',
      chain: this.CHAIN_NAME,
      walletAddress: address,
      name: inscription.name,
      symbol: 'ORD',
      balance: '1',
      balanceFormatted: '1',
      tokenId: inscription.id,
      inscriptionId: inscription.id,
      inscriptionNumber: inscription.number,
      contentType: inscription.contentType,
      // Served through our proxy to avoid CORS and sandbox untrusted content
      imageUrl: `/content/${inscription.id}`,
      collectionName: inscription.collectionName || 'Bitcoin Ordinals',
      floorPrice: inscription.floorPrice,
      lastUpdated: new Date()
    };
  }

  private tokenAsset(address: string, t: { id: string; name: string; symbol: string; standard: string; balance: number; priceUSD?: number }): Asset {
    return {
      id: `btc_${address}_${t.standard}_${t.id}`,
      type: 'token',
      chain: this.CHAIN_NAME,
      walletAddress: address,
      name: t.name,
      symbol: t.symbol,
      balance: String(t.balance),
      balanceFormatted: String(t.balance),
      tokenStandard: t.standard,
      // Priced here: Runes/BRC-20 have no contract address for /api/prices
      priceUSD: t.priceUSD,
      valueUSD: t.priceUSD !== undefined ? t.balance * t.priceUSD : undefined,
      lastUpdated: new Date(),
    };
  }

  /**
   * Runes balances (keyless Xverse wallet endpoint).
   */
  async getRunes(address: string): Promise<APIResponse<Asset[]>> {
    try {
      const response = await fetchWithRetry(
        `https://api.xverse.app/v2/address/${address}/rune-balance`,
        { headers: { Accept: 'application/json' } },
        { maxRetries: 2 }
      );
      const runes: XverseRune[] = await response.json();
      const assets = (Array.isArray(runes) ? runes : []).map((r) => {
        const balance = Number(r.amount) / 10 ** (r.divisibility ?? 0);
        return this.tokenAsset(address, {
          id: r.id,
          name: r.runeName,
          symbol: r.symbol || r.runeName.split('•')[0],
          standard: 'Rune',
          balance,
          priceUSD: r.currentPrice ?? undefined,
        });
      });
      return { success: true, data: assets, timestamp: new Date() };
    } catch (error) {
      return { success: false, error: `Failed to fetch Runes: ${error instanceof Error ? error.message : error}`, timestamp: new Date() };
    }
  }

  /**
   * BRC-20 balances. Needs UNISAT_API_KEY (balances); prices come from Xverse.
   */
  async getBrc20(address: string): Promise<APIResponse<Asset[]>> {
    if (!UNISAT_API_KEY) return { success: true, data: [], timestamp: new Date() };

    try {
      const [summaryResponse, priceResponse] = await Promise.all([
        fetchWithRetry(
          `https://open-api.unisat.io/v1/indexer/address/${address}/brc20/summary?start=0&limit=100`,
          { headers: { Accept: 'application/json', Authorization: `Bearer ${UNISAT_API_KEY}` } },
          { maxRetries: 2 }
        ),
        fetchWithRetry(
          `https://api.xverse.app/v1/brc20/tokens?address=${address}&currency=USD`,
          { headers: { Accept: 'application/json' } },
          { maxRetries: 1 }
        ).catch(() => null),
      ]);

      const summary: UnisatBrc20Summary = await summaryResponse.json();
      if (summary.code !== 0) throw new Error(summary.msg || `Unisat error ${summary.code}`);

      const priceList: { ticker: string; tokenFiatRate?: string }[] = priceResponse ? await priceResponse.json() : [];
      const prices = new Map(
        (Array.isArray(priceList) ? priceList : []).map((p) => [p.ticker.toLowerCase(), Number(p.tokenFiatRate)])
      );

      const assets = (summary.data?.detail ?? [])
        .map((t) => ({ t, balance: Number(t.overallBalance) }))
        .filter(({ balance }) => balance > 0)
        .map(({ t, balance }) => {
          const price = prices.get(t.ticker.toLowerCase());
          return this.tokenAsset(address, {
            id: t.ticker,
            name: t.ticker,
            symbol: t.ticker.toUpperCase(),
            standard: 'BRC-20',
            balance,
            priceUSD: price !== undefined && Number.isFinite(price) ? price : undefined,
          });
        });
      return { success: true, data: assets, timestamp: new Date() };
    } catch (error) {
      return { success: false, error: `Failed to fetch BRC-20: ${error instanceof Error ? error.message : error}`, timestamp: new Date() };
    }
  }

  /**
   * Get all Bitcoin assets (BTC + Runes + BRC-20 + Ordinals)
   */
  async getAllAssets(address: string): Promise<APIResponse<Asset[]>> {
    const [btcResult, ordinalsResult, runesResult, brc20Result] = await Promise.all([
      this.getBTCBalance(address),
      this.getOrdinals(address),
      this.getRunes(address),
      this.getBrc20(address),
    ]);

    if (!btcResult.success) {
      return btcResult as APIResponse<never>;
    }

    const optional = [ordinalsResult, runesResult, brc20Result];
    const allAssets: Asset[] = [btcResult.data!, ...optional.flatMap((r) => r.data ?? [])];
    const failures = optional.filter((r) => !r.success).map((r) => r.error ?? 'Unavailable');
    const errors = failures.length ? failures : undefined;

    return {
      success: true,
      data: allAssets,
      partialFailure: !!errors,
      errors,
      timestamp: new Date()
    };
  }
}
