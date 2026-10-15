import 'server-only';
import { Asset, APIResponse } from '@/types';
import { fetchWithRetry, APIError } from '@/utils/api';

/**
 * Bitcoin Handler - BTC + Ordinals Support
 *
 * Handles:
 * - BTC balance (Blockstream) with retry logic
 * - Ordinals (Bitcoin NFTs) via Xverse
 * - Rate limiting and error recovery
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

const XVERSE_API_KEY = process.env.XVERSE_API_KEY;
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
      const ordinals = XVERSE_API_KEY
        ? await this.fetchXverseInscriptions(address)
        : await this.fetchXverseWalletInscriptions(address);

      return { success: true, data: ordinals, timestamp: new Date() };
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
      imageUrl: `/api/ordinals/content/${inscription.id}`,
      collectionName: inscription.collectionName || 'Bitcoin Ordinals',
      floorPrice: inscription.floorPrice,
      lastUpdated: new Date()
    };
  }

  /**
   * Get all Bitcoin assets (BTC + Ordinals)
   */
  async getAllAssets(address: string): Promise<APIResponse<Asset[]>> {
    const [btcResult, ordinalsResult] = await Promise.all([
      this.getBTCBalance(address),
      this.getOrdinals(address),
    ]);

    if (!btcResult.success) {
      return btcResult as APIResponse<never>;
    }

    const allAssets: Asset[] = [btcResult.data!, ...(ordinalsResult.data ?? [])];
    const errors = ordinalsResult.success ? undefined : [ordinalsResult.error ?? 'Ordinals unavailable'];

    return {
      success: true,
      data: allAssets,
      partialFailure: !!errors,
      errors,
      timestamp: new Date()
    };
  }
}
