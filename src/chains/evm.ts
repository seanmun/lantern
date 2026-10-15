import 'server-only';
import { ethers } from 'ethers';
import { Asset, APIResponse, HexPoolStats, HexStakeInfo } from '@/types';
import { HEX_ABI, HEX_ADDRESS, HEX_DECIMALS, MAXIMUS_POOLS, hexDayToDate } from '@/config/hex';
import { endStakeToday, getHexState, stakeYield } from './hex';
import { BLOCKSCOUT_HOSTS, collectionAssets, fetchBlockscoutNfts, fetchBlockscoutTokens, looksLikeSpam, toHttpUrl } from './blockscout';

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
  standard?: string; // overrides the chain's tokenStandard, e.g. 'Stock Token'
  logoUrl?: string;
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
  loadExtraTokens?: () => Promise<EvmToken[]>; // dynamic token lists (e.g. an official registry)
}

// Multicall3 is deployed at this address on Ethereum, Base, Robinhood Chain and Pulsechain
const MULTICALL3_ADDRESS = '0xcA11bde05977b3631167028862bE2a173976CA11';
const MULTICALL3_ABI = ['function aggregate3((address target, bool allowFailure, bytes callData)[] calls) view returns ((bool success, bytes returnData)[])'];
const MULTICALL_CHUNK = 250;

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

  /**
   * balanceOf for many tokens: one Multicall3 call per chunk, falling back to
   * individual calls if multicall fails (public RPCs throttle hundreds of calls).
   */
  private async readBalances(address: string, tokens: EvmToken[]): Promise<PromiseSettledResult<{ token: EvmToken; balance: bigint }>[]> {
    const erc20 = new ethers.Interface(ERC20_ABI);
    const multicall = new ethers.Contract(MULTICALL3_ADDRESS, MULTICALL3_ABI, this.provider);
    const callData = erc20.encodeFunctionData('balanceOf', [address]);

    try {
      const out: PromiseSettledResult<{ token: EvmToken; balance: bigint }>[] = [];
      for (let i = 0; i < tokens.length; i += MULTICALL_CHUNK) {
        const chunk = tokens.slice(i, i + MULTICALL_CHUNK);
        const responses: { success: boolean; returnData: string }[] = await multicall.aggregate3(
          chunk.map((t) => ({ target: ethers.getAddress(t.address), allowFailure: true, callData }))
        );
        responses.forEach((r, j) => {
          if (r.success && r.returnData !== '0x') {
            out.push({ status: 'fulfilled', value: { token: chunk[j], balance: erc20.decodeFunctionResult('balanceOf', r.returnData)[0] as bigint } });
          } else {
            out.push({ status: 'rejected', reason: `balanceOf failed for ${chunk[j].symbol}` });
          }
        });
      }
      return out;
    } catch (error) {
      console.warn(`⚠️ ${this.config.key} multicall failed, using individual calls:`, error);
      return Promise.allSettled(tokens.map(async (token) => {
        const contract = new ethers.Contract(ethers.getAddress(token.address), ERC20_ABI, this.provider);
        return { token, balance: (await contract.balanceOf(address)) as bigint };
      }));
    }
  }

  async getTokenBalances(address: string): Promise<APIResponse<Asset[]>> {
    try {
      const extra = await this.config.loadExtraTokens?.().catch((error) => {
        console.warn(`⚠️ ${this.config.key} token registry unavailable:`, error);
        return [] as EvmToken[];
      }) ?? [];
      const known = [...this.config.tokens, ...extra];
      const knownAddresses = new Set(known.map((t) => t.address.toLowerCase()));

      // Explorer-indexed tokens we don't list explicitly (auto-discovery)
      const discovered = await fetchBlockscoutTokens(this.config.key, address)
        .then((tokens) => tokens.filter((t) => !knownAddresses.has(t.address.toLowerCase())))
        .catch((error) => {
          console.warn(`⚠️ ${this.config.key} token discovery unavailable:`, error instanceof Error ? error.message : error);
          return [];
        });

      const results = await this.readBalances(address, known);

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
          tokenStandard: token.standard ?? this.config.tokenStandard,
          imageUrl: token.logoUrl,
        });
      }

      for (const t of discovered) {
        assets.push({
          ...this.baseAsset(address),
          id: `${this.config.idPrefix}_${address}_${t.address}`,
          type: 'token',
          name: t.name,
          symbol: t.symbol,
          decimals: t.decimals,
          balance: t.rawBalance.toString(),
          balanceFormatted: ethers.formatUnits(t.rawBalance, t.decimals),
          contractAddress: t.address,
          tokenStandard: this.config.tokenStandard,
          imageUrl: t.iconUrl,
        });
      }

      return { success: true, data: assets, timestamp: new Date() };
    } catch (error) {
      return errorResponse('Failed to fetch token balances', error);
    }
  }

  /**
   * NFTs: Alchemy NFT API v3 when a key is set (adds OpenSea floor prices and
   * spam flags), otherwise the chain's Blockscout explorer when it has one.
   * Returns the NFTs plus one 'collection' asset per contract for counts/floors.
   */
  async getNFTs(address: string): Promise<APIResponse<Asset[]>> {
    try {
      let nfts: Asset[] = [];
      const floors = new Map<string, { floor: number; currency: 'ETH' | 'USD' }>();

      if (HAS_ALCHEMY && this.config.alchemyNetwork) {
        let pageKey: string | undefined;
        for (let page = 0; page < 10; page++) {
          const url = new URL(`https://${this.config.alchemyNetwork}.g.alchemy.com/nft/v3/${ALCHEMY_KEY}/getNFTsForOwner`);
          url.searchParams.set('owner', address);
          url.searchParams.set('withMetadata', 'true');
          url.searchParams.set('pageSize', '100');
          if (pageKey) url.searchParams.set('pageKey', pageKey);

          const response = await fetch(url, { signal: AbortSignal.timeout(20_000) });
          if (!response.ok) throw new Error(`Alchemy NFT API ${response.status}`);
          const data = await response.json();

          for (const nft of data.ownedNfts ?? []) {
            if (nft.contract?.isSpam || looksLikeSpam(nft.contract?.name, nft.name)) continue;
            const floor = Number(nft.contract?.openSeaMetadata?.floorPrice);
            if (floor > 0) floors.set(String(nft.contract.address).toLowerCase(), { floor, currency: 'ETH' });
            nfts.push({
              ...this.baseAsset(address),
              id: `${this.config.idPrefix}_${address}_${nft.contract.address}_${nft.tokenId}`,
              type: 'nft',
              name: nft.name || nft.raw?.metadata?.name || `${nft.contract.name ?? 'NFT'} #${nft.tokenId}`,
              symbol: nft.contract.symbol || 'NFT',
              balance: nft.balance ?? '1',
              balanceFormatted: nft.balance ?? '1',
              contractAddress: nft.contract.address,
              tokenId: nft.tokenId,
              tokenStandard: nft.tokenType,
              imageUrl: nft.image?.cachedUrl || toHttpUrl(nft.image?.originalUrl),
              collectionName: nft.contract.name || nft.collection?.name,
            });
          }

          pageKey = data.pageKey;
          if (!pageKey) break;
        }
      } else if (BLOCKSCOUT_HOSTS[this.config.key]) {
        nfts = await fetchBlockscoutNfts(this.config.key, address, this.config.idPrefix);
      }

      return { success: true, data: [...nfts, ...collectionAssets(nfts, floors)], timestamp: new Date() };
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
      const endNow = endStakeToday(state, { stakedHearts, stakeShares, lockedDay, stakedDays });
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
        endNow: {
          returnHex: Number(ethers.formatUnits(endNow.returnHearts, HEX_DECIMALS)),
          penaltyHex: Number(ethers.formatUnits(endNow.penaltyHearts, HEX_DECIMALS)),
        },
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

  /** Current cycle of every Maximus pool on this chain (whether or not the viewer holds it). */
  async getPoolStats(): Promise<HexPoolStats[]> {
    if (!this.config.hex) return [];
    const hex = new ethers.Contract(HEX_ADDRESS, HEX_ABI, this.provider);

    const results = await Promise.allSettled(MAXIMUS_POOLS.map(async (pool) => {
      const token = new ethers.Contract(pool.address, ERC20_ABI, this.provider);
      const [supply, stakes]: [bigint, RawStake[]] = await Promise.all([token.totalSupply(), this.readStakes(pool.address, hex)]);
      const latest = stakes[stakes.length - 1];
      if (!latest) return null;
      return {
        chain: this.config.key,
        symbol: pool.symbol,
        name: pool.name,
        address: pool.address,
        cycleDays: pool.cycleDays,
        supply: Number(ethers.formatUnits(supply, HEX_DECIMALS)),
        principalHex: stakes.reduce((sum, s) => sum + Number(ethers.formatUnits(s.stakedHearts, HEX_DECIMALS)), 0),
        interestHex: stakes.reduce((sum, s) => sum + s.interestHex, 0),
        projectedInterestHex: stakes.reduce((sum, s) => sum + s.projectedInterestHex, 0),
        endDay: latest.endDay,
        daysRemaining: latest.daysRemaining,
      };
    }));

    return results.flatMap((r) => (r.status === 'fulfilled' && r.value ? [r.value] : []));
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
