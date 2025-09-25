// Core Types for Crypto Portfolio Tracker

export interface Chain {
  name: string;
  symbol: string;
  chainId?: number;
  rpcUrl: string;
  explorerUrl: string;
  addressFormat: 'hex' | 'base58' | 'bech32';
  color: string;
  features: ('tokens' | 'nfts' | 'ordinals')[];
  tokenStandards?: string[];
  nftStandard?: string;
  nftApis?: Record<string, string>;
  ordinalsApi?: string;
}

export interface Wallet {
  id: string;
  name: string; // User-defined name, inline editable
  address: string;
  chains: Record<string, ChainStatus>; // Which chains are enabled for this wallet
  avatar?: NFTAvatar;
  createdAt: Date;
  updatedAt: Date;
}

export interface ChainStatus {
  enabled: boolean;
  hasAssets: boolean;
  lastFetched?: Date;
}

export interface NFTAvatar {
  nftId: string;
  imageUrl: string;
  collectionName?: string;
  chain: string;
}

export interface Asset {
  id: string;
  type: 'native' | 'token' | 'nft' | 'ordinal';
  chain: string;
  walletAddress: string;
  
  // Basic info
  name: string;
  symbol: string;
  decimals?: number;
  
  // Balance info
  balance: string;
  balanceFormatted: string;
  
  // Pricing
  priceUSD?: number;
  valueUSD?: number;
  
  // Token specific
  contractAddress?: string;
  tokenStandard?: string;
  
  // NFT specific
  tokenId?: string;
  imageUrl?: string;
  collectionName?: string;
  floorPrice?: number;
  
  // Ordinal specific (Bitcoin NFTs)
  inscriptionId?: string;
  inscriptionNumber?: number;
  contentType?: string; // image/png, text/plain, text/html, etc.
  contentUrl?: string;  // Direct link to inscription content
  
  lastUpdated: Date;
}

export interface Portfolio {
  wallets: Wallet[];
  totalValueUSD: number;
  assets: Asset[];
  avatar?: NFTAvatar; // Portfolio-wide avatar from any owned NFT
  lastUpdated: Date;
}

export interface ChainBalance {
  chain: string;
  totalValueUSD: number;
  assets: Asset[];
  breakdown: {
    native: number;
    tokens: number;
    nfts: number;
    ordinals: number;
  };
}

export interface APIResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  errorCode?: string;
  partialFailure?: boolean;
  errors?: string[];
  timestamp: Date;
}

// Validation types
export interface AddressValidation {
  isValid: boolean;
  format: 'hex' | 'base58' | 'bech32' | 'unknown';
  compatibleChains: string[];
}

// Configuration types
export interface ChainConfig {
  [key: string]: Chain;
}

export interface DisplayConfig {
  displayOrder: string[];
  defaultExpanded: string[];
  grouping: Record<string, string[]>;
  assetCategories: Record<string, {
    priority: number;
    icon: string;
    label: string;
  }>;
  avatarSettings: {
    defaultStyle: string;
    imageCaching: boolean;
    supportedFormats: string[];
    thumbnailSize: number;
    ipfsGateways: string[];
  };
}

// Hook return types
export interface UseWalletAssets {
  assets: Asset[];
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export interface UsePortfolio {
  portfolio: Portfolio;
  isLoading: boolean;
  error: string | null;
  addWallet: (wallet: Omit<Wallet, 'id' | 'createdAt' | 'updatedAt'>) => void;
  removeWallet: (walletId: string) => void;
  updateWallet: (walletId: string, updates: Partial<Wallet>) => void;
  refreshPortfolio: () => Promise<void>;
}