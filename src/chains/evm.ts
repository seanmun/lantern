import 'server-only';
import { ethers } from 'ethers';
import { Asset, APIResponse, HexStakeInfo } from '@/types';
import { HEX_ABI, HEX_ADDRESS, HEX_DECIMALS, MAXIMUS_POOLS, hexDayToDate } from '@/config/hex';
import { getHexState, stakeYield } from './hex';

/**
 * Generic EVM Chain Handler
 *
 * Shared by Ethereum, Pulsechain, Base and Robinhood Chain. Each chain only
 * supplies an EvmChainConfig (RPC, native token, token list, features).
 *
 * Handles:
 * - Native balance
 * - ERC-20 balances for the configured token list (fetched in parallel)
 * - NFTs via Alchemy NFT API v3 (when an Alchemy key and network are set)
 * - HEX stakes (T-Shares) and Maximus perpetual pool backing, on HEX chains
 */

export interface EvmToken {
  address: string;
  symbol: string;
  name: string;
  decimals: number;
}

export interface EvmChainConfig {
  key: string;            // 'ethereum', 'pulsechain', ...
  idPrefix: string;       // asset id prefix, e.g. 'eth'
  chainId: number;
  nativeName: string;
  nativeSymbol: string;
  publicRpcUrl: string;
  alchemyNetwork?: string; // e.g. 'eth-mainnet'; enables Alchemy RPC + NFTs
  tokenStandard: string;
  tokens: EvmToken[];
  hex?: boolean;          // chain has HEX staking + Maximus pools
  rpcBatching?: boolean;  // default true; some public RPCs answer JSON-RPC batches very slowly
}

const ERC20_ABI = [
  'function balanceOf(address owner) view returns (uint256)',
  'function totalSupply() view returns (uint256)',
];

// Server-side only. NEXT_PUBLIC_ fallback keeps older .env.local files working.
const ALCHEMY_KEY = process.env.ALCHEMY_API_KEY || process.env.NEXT_PUBLIC_ALCHEMY_API_KEY;
const HAS_ALCHEMY = !!ALCHEMY_KEY && ALCHEMY_KEY !== 'your_alchemy_key_here';

function errorResponse<T>(message: string, error: unknown): APIResponse<T> {
  console.error(`❌ ${message}:`, error);
  return { success: false, error: `${message}: ${error}`, timestamp: new Date() };
}

export function createProvider(config: EvmChainConfig): ethers.JsonRpcProvider {
  const rpcUrl = HAS_ALCHEMY && config.alchemyNetwork
    ? `https://${config.alchemyNetwork}.g.alchemy.com/v2/${ALCHEMY_KEY}`
    : config.publicRpcUrl;
  // staticNetwork skips the eth_chainId probe on every request
  return new ethers.JsonRpcProvider(rpcUrl, config.chainId, {
    staticNetwork: true,
    ...(config.rpcBatching === false && { batchMaxCount: 1 }),
  });
}

interface RawStake extends HexStakeInfo {
  stakedHearts: bigint;
  interestHearts: bigint;
}

export class EvmHandler {
  protected provider: ethers.JsonRpcProvider;

  constructor(protected readonly config: EvmChainConfig) {
    this.provider = createProvider(config);
  }

  private baseAsset(address: string): Pick<Asset, 'chain' | 'walletAddress' | 'lastUpdated'> {
    return { chain: this.config.key, walletAddress: address, lastUpdated: new Date() };
  }

  async getNativeBalance(address: string): Promise<APIResponse<Asset>> {
    try {
      const balance = await this.provider.getBalance(address);
      return {
        success: true,
        data: {
          ...this.baseAsset(address),
          id: `${this.config.idPrefix}_${address}_native`,
          type: 'native',
          name: this.config.nativeName,
          symbol: this.config.nativeSymbol,
          decimals: 18,
          balance: balance.toString(),
          balanceFormatted: ethers.formatEther(balance),
        },
        timestamp: new Date(),
      };
    } catch (error) {
      return errorResponse(`Failed to fetch ${this.config.nativeSymbol} balance`, error);
    }
  }

  async getTokenBalances(address: string): Promise<APIResponse<Asset[]>> {
    try {
      const results = await Promise.allSettled(
        this.config.tokens.map(async (token) => {
          const contract = new ethers.Contract(ethers.getAddress(token.address), ERC20_ABI, this.provider);
          const balance: bigint = await contract.balanceOf(address);
          return { token, balance };
        })
      );

      const assets: Asset[] = [];
      for (const result of results) {
        if (result.status === 'rejected') {
          console.warn(`⚠️ ${this.config.key} token fetch failed:`, result.reason);
          continue;
        }
        const { token, balance } = result.value;
        if (balance === BigInt(0)) continue;

        assets.push({
          ...this.baseAsset(address),
          id: `${this.config.idPrefix}_${address}_${token.address}`,
          type: 'token',
          name: token.name,
          symbol: token.symbol,
          decimals: token.decimals,
          balance: balance.toString(),
          balanceFormatted: ethers.formatUnits(balance, token.decimals),
          contractAddress: token.address,
          tokenStandard: this.config.tokenStandard,
        });
      }

      return { success: true, data: assets, timestamp: new Date() };
    } catch (error) {
      return errorResponse('Failed to fetch token balances', error);
    }
  }

  /**
   * NFTs via Alchemy NFT API v3, following pageKey pagination.
   */
  async getNFTs(address: string): Promise<APIResponse<Asset[]>> {
    if (!HAS_ALCHEMY || !this.config.alchemyNetwork) {
      return { success: true, data: [], timestamp: new Date() };
    }

    try {
      const assets: Asset[] = [];
      let pageKey: string | undefined;
      const MAX_PAGES = 10;

      for (let page = 0; page < MAX_PAGES; page++) {
        const url = new URL(`https://${this.config.alchemyNetwork}.g.alchemy.com/nft/v3/${ALCHEMY_KEY}/getNFTsForOwner`);
        url.searchParams.set('owner', address);
        url.searchParams.set('withMetadata', 'true');
        url.searchParams.set('pageSize', '100');
        if (pageKey) url.searchParams.set('pageKey', pageKey);

        const response = await fetch(url);
        if (!response.ok) throw new Error(`Alchemy NFT API ${response.status}`);
        const data = await response.json();

        for (const nft of data.ownedNfts ?? []) {
          assets.push({
            ...this.baseAsset(address),
            id: `${this.config.idPrefix}_${address}_${nft.contract.address}_${nft.tokenId}`,
            type: 'nft',
            name: nft.name || nft.raw?.metadata?.name || 'Unknown NFT',
            symbol: nft.contract.symbol || 'NFT',
            balance: nft.balance ?? '1',
            balanceFormatted: nft.balance ?? '1',
            contractAddress: nft.contract.address,
            tokenId: nft.tokenId,
            tokenStandard: nft.tokenType,
            imageUrl: nft.image?.cachedUrl || nft.image?.originalUrl,
            collectionName: nft.contract.name || nft.collection?.name,
          });
        }

        pageKey = data.pageKey;
        if (!pageKey) break;
      }

      return { success: true, data: assets, timestamp: new Date() };
    } catch (error) {
      return errorResponse('Failed to fetch NFTs', error);
    }
  }

  private async readStakes(staker: string, hex: ethers.Contract): Promise<RawStake[]> {
    const [count, state] = await Promise.all([
      hex.stakeCount(staker).then(Number),
      getHexState(this.config.key, this.provider),
    ]);
    const stakes = await Promise.all(
      Array.from({ length: count }, (_, i) => hex.stakeLists(staker, i))
    );

    return stakes.map((s) => {
      const lockedDay = Number(s.lockedDay);
      const stakedDays = Number(s.stakedDays);
      const endDay = lockedDay + stakedDays;
      const stakedHearts = s.stakedHearts as bigint;
      const stakeShares = s.stakeShares as bigint;
      const yieldInfo = stakeYield(state, { stakedHearts, stakeShares, lockedDay, stakedDays });
      return {
        stakeId: Number(s.stakeId),
        stakedHearts,
        interestHearts: yieldInfo.interestHearts,
        tShares: Number(ethers.formatUnits(stakeShares, 12)),
        lockedDay,
        stakedDays,
        endDay,
        endDate: hexDayToDate(endDay).toISOString(),
        daysRemaining: Math.max(0, endDay - state.currentDay),
        interestHex: yieldInfo.interestHex,
        projectedInterestHex: yieldInfo.projectedInterestHex,
        apy: yieldInfo.apy,
        status: yieldInfo.status,
        graceDaysLeft: yieldInfo.graceDaysLeft,
      };
    });
  }

  /**
   * HEX stakes owned directly by the wallet. balance = staked principal;
   * stake.interestHex carries the interest earned so far.
   */
  async getHEXStakes(address: string): Promise<APIResponse<Asset[]>> {
    if (!this.config.hex) return { success: true, data: [], timestamp: new Date() };

    try {
      const hex = new ethers.Contract(HEX_ADDRESS, HEX_ABI, this.provider);
      const stakes = await this.readStakes(address, hex);

      const assets: Asset[] = stakes.map(({ stakedHearts, interestHearts: _interest, ...stake }) => ({
        ...this.baseAsset(address),
        id: `${this.config.idPrefix}_${address}_stake_${stake.stakeId}`,
        type: 'stake',
        name: `HEX Stake #${stake.stakeId}`,
        symbol: 'HEX',
        decimals: HEX_DECIMALS,
        balance: stakedHearts.toString(),
        balanceFormatted: ethers.formatUnits(stakedHearts, HEX_DECIMALS),
        contractAddress: HEX_ADDRESS,
        stake,
      }));

      return { success: true, data: assets, timestamp: new Date() };
    } catch (error) {
      return errorResponse('Failed to fetch HEX stakes', error);
    }
  }

  /**
   * For Maximus pool tokens the wallet holds, attach the HEX (principal and
   * principal + interest so far) backing their share of the pool.
   */
  async attachPoolBacking(assets: Asset[]): Promise<void> {
    if (!this.config.hex) return;

    const poolAssets = assets
      .map((asset) => ({
        asset,
        pool: MAXIMUS_POOLS.find((p) => p.address.toLowerCase() === asset.contractAddress?.toLowerCase()),
      }))
      .filter((x): x is { asset: Asset; pool: (typeof MAXIMUS_POOLS)[number] } => !!x.pool);

    if (poolAssets.length === 0) return;

    try {
      const hex = new ethers.Contract(HEX_ADDRESS, HEX_ABI, this.provider);

      await Promise.all(poolAssets.map(async ({ asset, pool }) => {
        const token = new ethers.Contract(pool.address, ERC20_ABI, this.provider);
        const [supply, stakes] = await Promise.all([
          token.totalSupply() as Promise<bigint>,
          this.readStakes(pool.address, hex),
        ]);
        const balance = BigInt(asset.balance);
        const share = (total: bigint) => (supply > BigInt(0) ? (balance * total) / supply : BigInt(0));

        const principal = stakes.reduce((sum, s) => sum + s.stakedHearts, BigInt(0));
        const interest = stakes.reduce((sum, s) => sum + s.interestHearts, BigInt(0));
        const latest = stakes[stakes.length - 1];

        asset.pool = {
          poolName: pool.name,
          cycleDays: pool.cycleDays,
          principalBackingHex: Number(ethers.formatUnits(share(principal), HEX_DECIMALS)),
          backingHex: Number(ethers.formatUnits(share(principal + interest), HEX_DECIMALS)),
          currentStake: latest && {
            lockedDay: latest.lockedDay,
            stakedDays: latest.stakedDays,
            endDay: latest.endDay,
            endDate: latest.endDate,
            daysRemaining: latest.daysRemaining,
            apy: latest.apy,
          },
        };
      }));
    } catch (error) {
      console.warn('⚠️ Failed to read Maximus pool backing:', error);
    }
  }

  async getAllAssets(address: string): Promise<APIResponse<Asset[]>> {
    try {
      const results = await Promise.all([
        this.getNativeBalance(address),
        this.getTokenBalances(address),
        this.getHEXStakes(address),
        this.getNFTs(address),
      ]);

      const allAssets: Asset[] = [];
      const errors: string[] = [];
      for (const result of results) {
        if (!result.success) {
          errors.push(result.error ?? 'Unknown error');
          continue;
        }
        if (Array.isArray(result.data)) allAssets.push(...result.data);
        else if (result.data) allAssets.push(result.data);
      }

      await this.attachPoolBacking(allAssets);

      if (allAssets.length === 0 && errors.length > 0) {
        return { success: false, error: errors.join('; '), timestamp: new Date() };
      }

      return {
        success: true,
        data: allAssets,
        partialFailure: errors.length > 0,
        errors: errors.length > 0 ? errors : undefined,
        timestamp: new Date(),
      };
    } catch (error) {
      return errorResponse(`Failed to fetch ${this.config.key} assets`, error);
    }
  }
}
