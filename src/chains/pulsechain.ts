import { ethers } from 'ethers';
import { Asset, APIResponse } from '@/types';

/**
 * Pulsechain Handler - HEX-Focused Portfolio Tracker
 * 
 * Pulsechain is where most HEX activity happens now. This handler focuses on:
 * - PLS (native token) balance
 * - HEX token balance and staking detection
 * - PRC-20 tokens
 * - HEX staking contract interactions
 * 
 * CUSTOMIZATION POINTS:
 * - RPC_URL: Pulsechain RPC endpoint
 * - HEX_TOKENS: HEX contract addresses
 * - STAKE_CONTRACT: HEX staking contract for T-Shares
 */

export class PulsechainHandler {
  private provider: ethers.JsonRpcProvider;
  private readonly CHAIN_ID = 369;
  private readonly CHAIN_NAME = 'pulsechain';

  // CUSTOMIZATION: Pulsechain RPC - using public endpoint
  private readonly RPC_URL = 'https://rpc.pulsechain.com';

  // HEX-FOCUSED: Core HEX contracts on Pulsechain
  private readonly HEX_CONTRACTS = {
    // Main HEX token contract on Pulsechain
    HEX_TOKEN: '0x2b591e99afE9f32eAA6214f7B7629768c40Eeb39',
    // HEX Staking contract for T-Shares (same address as Ethereum)
    HEX_STAKE: '0x2b591e99afE9f32eAA6214f7B7629768c40Eeb39', // TODO: Verify actual staking contract
  };

  // CUSTOMIZATION: Popular Pulsechain tokens (HEX-focused ecosystem)
  private readonly POPULAR_TOKENS = [
    {
      address: '0x2b591e99afE9f32eAA6214f7B7629768c40Eeb39',
      symbol: 'HEX',
      name: 'HEX',
      decimals: 8,
      isHEX: true // Special flag for HEX token
    },
    {
      address: '0x95B303987A60C71504D99Aa1b13B4DA07b0790ab',
      symbol: 'PLSX',
      name: 'PulseX',
      decimals: 18
    },
    {
      address: '0x2fa878Ab3F87CC1C9737Fc071108F904c0B0C95d',
      symbol: 'INC',
      name: 'Incentive',
      decimals: 18
    },
    {
      address: '0xA1077a294dDE1B09bB078844df40758a5D0f9a27',
      symbol: 'WPLS',
      name: 'Wrapped Pulse',
      decimals: 18
    },
    {
      address: '0x15D38573d2feeb82e7ad5187aB8c1D52810B1f07',
      symbol: 'USDC',
      name: 'USD Coin from Ethereum',
      decimals: 6
    }
  ];

  constructor() {
    this.provider = new ethers.JsonRpcProvider(this.RPC_URL);
  }

  /**
   * Get PLS (native token) balance
   */
  async getPLSBalance(address: string): Promise<APIResponse<Asset>> {
    try {
      console.log(`🔮 Fetching PLS balance for: ${address}`);
      
      const balance = await this.provider.getBalance(address);
      const balanceFormatted = ethers.formatEther(balance);
      
      const asset: Asset = {
        id: `pls_${address}_native`,
        type: 'native',
        chain: this.CHAIN_NAME,
        walletAddress: address,
        name: 'Pulse',
        symbol: 'PLS',
        decimals: 18,
        balance: balance.toString(),
        balanceFormatted: balanceFormatted,
        lastUpdated: new Date()
      };

      console.log(`✅ PLS Balance: ${balanceFormatted} PLS`);
      
      return {
        success: true,
        data: asset,
        timestamp: new Date()
      };
    } catch (error) {
      console.error('❌ Error fetching PLS balance:', error);
      return {
        success: false,
        error: `Failed to fetch PLS balance: ${error}`,
        timestamp: new Date()
      };
    }
  }

  /**
   * Get HEX token balance (liquid HEX only)
   */
  async getHEXBalance(address: string): Promise<APIResponse<Asset>> {
    try {
      console.log(`🔥 Fetching liquid HEX balance for: ${address}`);
      
      const hexContract = new ethers.Contract(
        this.HEX_CONTRACTS.HEX_TOKEN,
        [
          'function balanceOf(address owner) view returns (uint256)',
          'function decimals() view returns (uint8)',
          'function symbol() view returns (string)',
          'function name() view returns (string)'
        ],
        this.provider
      );

      const balance = await hexContract.balanceOf(address);
      const balanceFormatted = ethers.formatUnits(balance, 8); // HEX has 8 decimals
      
      const asset: Asset = {
        id: `pls_${address}_hex`,
        type: 'token',
        chain: this.CHAIN_NAME,
        walletAddress: address,
        name: 'HEX',
        symbol: 'HEX',
        decimals: 8,
        balance: balance.toString(),
        balanceFormatted: balanceFormatted,
        contractAddress: this.HEX_CONTRACTS.HEX_TOKEN,
        tokenStandard: 'PRC-20',
        lastUpdated: new Date()
      };

      console.log(`🔥 Liquid HEX Balance: ${balanceFormatted} HEX`);
      
      return {
        success: true,
        data: asset,
        timestamp: new Date()
      };
    } catch (error) {
      console.error('❌ Error fetching HEX balance:', error);
      return {
        success: false,
        error: `Failed to fetch HEX balance: ${error}`,
        timestamp: new Date()
      };
    }
  }

  /**
   * Get HEX Stakes (T-Shares) - This is the core HEX functionality!
   */
  async getHEXStakes(address: string): Promise<APIResponse<Asset[]>> {
    try {
      console.log(`🎯 Fetching HEX stakes (T-Shares) for: ${address}`);
      
      // TODO: Implement actual HEX staking contract calls
      // For now, we'll return empty array but structure is ready
      
      console.log(`⚠️ HEX staking integration coming next - structure ready!`);
      
      return {
        success: true,
        data: [], // Will populate with actual stakes
        timestamp: new Date()
      };
    } catch (error) {
      console.error('❌ Error fetching HEX stakes:', error);
      return {
        success: false,
        error: `Failed to fetch HEX stakes: ${error}`,
        timestamp: new Date()
      };
    }
  }

  /**
   * Get PRC-20 token balances
   */
  async getTokenBalances(address: string): Promise<APIResponse<Asset[]>> {
    try {
      console.log(`🪙 Fetching Pulsechain token balances for: ${address}`);
      
      const assets: Asset[] = [];
      
      // PRC-20 ABI (same as ERC-20)
      const prc20ABI = [
        'function balanceOf(address owner) view returns (uint256)',
        'function decimals() view returns (uint8)',
        'function symbol() view returns (string)',
        'function name() view returns (string)'
      ];

      for (const token of this.POPULAR_TOKENS) {
        try {
          console.log(`🔍 Checking ${token.symbol} balance...`);
          
          const contract = new ethers.Contract(
            ethers.getAddress(token.address),
            prc20ABI, 
            this.provider
          );
          const balance = await contract.balanceOf(address);
          
          console.log(`📊 ${token.symbol} raw balance:`, balance.toString());
          
          if (balance > 0) {
            const balanceFormatted = ethers.formatUnits(balance, token.decimals);
            
            const asset: Asset = {
              id: `pls_${address}_${token.address}`,
              type: 'token',
              chain: this.CHAIN_NAME,
              walletAddress: address,
              name: token.name,
              symbol: token.symbol,
              decimals: token.decimals,
              balance: balance.toString(),
              balanceFormatted: balanceFormatted,
              contractAddress: token.address,
              tokenStandard: 'PRC-20',
              lastUpdated: new Date()
            };

            assets.push(asset);
            console.log(`✅ ${token.symbol}: ${balanceFormatted}`);
          } else {
            console.log(`⚪ ${token.symbol}: 0 balance`);
          }
        } catch (tokenError) {
          console.warn(`⚠️ Failed to fetch ${token.symbol}:`, tokenError);
        }
      }

      return {
        success: true,
        data: assets,
        timestamp: new Date()
      };
    } catch (error) {
      console.error('❌ Error fetching token balances:', error);
      return {
        success: false,
        error: `Failed to fetch token balances: ${error}`,
        timestamp: new Date()
      };
    }
  }

  /**
   * Get all Pulsechain assets (PLS + HEX + other tokens + stakes)
   */
  async getAllAssets(address: string): Promise<APIResponse<Asset[]>> {
    try {
      console.log(`🔄 Fetching all Pulsechain assets for: ${address}`);
      
      const allAssets: Asset[] = [];
      
      // Fetch PLS balance
      const plsResult = await this.getPLSBalance(address);
      if (plsResult.success && plsResult.data) {
        allAssets.push(plsResult.data);
      }
      
      // Fetch token balances (including liquid HEX)
      const tokensResult = await this.getTokenBalances(address);
      if (tokensResult.success && tokensResult.data) {
        allAssets.push(...tokensResult.data);
      }
      
      // Fetch HEX stakes (T-Shares) - coming next!
      const stakesResult = await this.getHEXStakes(address);
      if (stakesResult.success && stakesResult.data) {
        allAssets.push(...stakesResult.data);
      }

      console.log(`✅ Total Pulsechain assets found: ${allAssets.length}`);
      
      return {
        success: true,
        data: allAssets,
        timestamp: new Date()
      };
    } catch (error) {
      console.error('❌ Error fetching all Pulsechain assets:', error);
      return {
        success: false,
        error: `Failed to fetch all assets: ${error}`,
        timestamp: new Date()
      };
    }
  }
}