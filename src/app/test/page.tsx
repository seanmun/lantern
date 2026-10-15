'use client';

import { useState, useEffect, useCallback } from 'react';
import { EthereumHandler } from '@/chains/ethereum';
import { PulsechainHandler } from '@/chains/pulsechain';
import { BaseHandler } from '@/chains/base';
import { RobinhoodHandler } from '@/chains/robinhood';
import { BitcoinHandler } from '@/chains/bitcoin';
import { Asset, APIResponse } from '@/types';
import { useToastHelpers } from '@/components/ui/Toast';
import { ConnectionStatus, ConnectionStatusBar, ConnectionState } from '@/components/ui/ConnectionStatus';
import { ChainError, ErrorState } from '@/components/ui/ErrorState';
import { ChainSectionSkeleton } from '@/components/ui/Skeleton';
import { NFTGrid, AssetWithNFT } from '@/components/ui/NFTDisplay';
import { applyPrices, formatUSD } from '@/utils/prices';

const testEthWallet = process.env.NEXT_PUBLIC_TEST_ETH_WALLET;
const testBtcWallet = process.env.NEXT_PUBLIC_TEST_BTC_WALLET;

interface TestChain {
  key: string;
  label: string;
  icon: string;
  wallet?: string;
  createHandler: () => { getAllAssets(address: string): Promise<APIResponse<Asset[]>> };
  // Literal Tailwind classes so they survive class scanning
  button: string;
  dot: string;
  title: string;
  badge: string;
  border: string;
}

const CHAINS: TestChain[] = [
  {
    key: 'bitcoin', label: 'Bitcoin', icon: '₿', wallet: testBtcWallet, createHandler: () => new BitcoinHandler(),
    button: 'from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700',
    dot: 'from-orange-400 to-orange-600', title: 'from-orange-600 to-orange-800',
    badge: 'bg-orange-100 text-orange-800', border: 'border-orange-100 hover:border-orange-200',
  },
  {
    key: 'ethereum', label: 'Ethereum', icon: 'Ξ', wallet: testEthWallet, createHandler: () => new EthereumHandler(),
    button: 'from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700',
    dot: 'from-blue-400 to-blue-600', title: 'from-blue-600 to-blue-800',
    badge: 'bg-blue-100 text-blue-800', border: 'border-blue-100 hover:border-blue-200',
  },
  {
    key: 'pulsechain', label: 'Pulsechain', icon: '♦', wallet: testEthWallet, createHandler: () => new PulsechainHandler(),
    button: 'from-pink-500 to-pink-600 hover:from-pink-600 hover:to-pink-700',
    dot: 'from-pink-400 to-pink-600', title: 'from-pink-600 to-pink-800',
    badge: 'bg-pink-100 text-pink-800', border: 'border-pink-100 hover:border-pink-200',
  },
  {
    key: 'base', label: 'Base', icon: '◉', wallet: testEthWallet, createHandler: () => new BaseHandler(),
    button: 'from-blue-600 to-indigo-700 hover:from-blue-700 hover:to-indigo-800',
    dot: 'from-blue-500 to-indigo-700', title: 'from-blue-700 to-indigo-900',
    badge: 'bg-indigo-100 text-indigo-800', border: 'border-indigo-100 hover:border-indigo-200',
  },
  {
    key: 'robinhood', label: 'Robinhood', icon: '🪶', wallet: testEthWallet, createHandler: () => new RobinhoodHandler(),
    button: 'from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700',
    dot: 'from-green-400 to-emerald-600', title: 'from-green-600 to-emerald-800',
    badge: 'bg-green-100 text-green-800', border: 'border-green-100 hover:border-green-200',
  },
];

const sumUSD = (assets: Asset[]) => assets.reduce((sum, a) => sum + (a.valueUSD ?? 0), 0);

export default function TestPage() {
  const [assets, setAssets] = useState<Map<string, Asset[]>>(new Map());
  const [isLoading, setIsLoading] = useState(false);
  const [chainStates, setChainStates] = useState<Map<string, ConnectionState>>(new Map());
  const [chainErrors, setChainErrors] = useState<Map<string, string>>(new Map());
  const [chainLoading, setChainLoading] = useState<Map<string, boolean>>(new Map());

  const toast = useToastHelpers();

  const updateChainState = (chain: string, state: ConnectionState, error?: string) => {
    setChainStates(prev => new Map(prev).set(chain, state));
    setChainErrors(prev => {
      const next = new Map(prev);
      if (error) next.set(chain, error);
      else next.delete(chain);
      return next;
    });
  };

  const updateChainLoading = (chain: string, loading: boolean) => {
    setChainLoading(prev => new Map(prev).set(chain, loading));
  };

  const fetchChain = useCallback(async (chain: TestChain) => {
    if (!chain.wallet) {
      updateChainState(chain.key, 'error', `No test wallet for ${chain.label} in .env.local`);
      return;
    }

    try {
      updateChainState(chain.key, 'connecting');
      updateChainLoading(chain.key, true);

      const result = await chain.createHandler().getAllAssets(chain.wallet);

      if (result.success && result.data) {
        const priced = await applyPrices(result.data);
        setAssets(prev => new Map(prev).set(chain.key, priced));
        updateChainState(chain.key, 'connected');
        if (result.partialFailure) {
          toast.warning(`${chain.label} partially loaded`, result.errors?.join('; '));
        }
      } else {
        const errorMsg = result.error || `Failed to fetch ${chain.label} assets`;
        if (result.errorCode === 'RATE_LIMITED') {
          toast.rateLimit(chain.label);
          updateChainState(chain.key, 'rate_limited', errorMsg);
        } else {
          updateChainState(chain.key, 'error', errorMsg);
          toast.error(`${chain.label} Error`, errorMsg);
        }
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : `${chain.label} fetch failed`;
      updateChainState(chain.key, 'error', errorMsg);
      toast.error(`${chain.label} Error`, errorMsg);
    } finally {
      updateChainLoading(chain.key, false);
    }
    // toast helpers are recreated each render; fetch logic doesn't depend on them changing
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchAllChains = useCallback(async () => {
    setIsLoading(true);
    await Promise.allSettled(CHAINS.map(fetchChain));
    setIsLoading(false);
  }, [fetchChain]);

  useEffect(() => {
    if (testEthWallet || testBtcWallet) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data load
      fetchAllChains();
    }
  }, [fetchAllChains]);

  const allAssets = [...assets.values()].flat();
  const totalUSD = sumUSD(allAssets);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header Section */}
        <div className="text-center mb-12">
          <h1 className="text-5xl font-bold mb-6 bg-gradient-to-r from-blue-600 via-purple-600 to-indigo-600 bg-clip-text text-transparent">
            Multi-Chain Portfolio
          </h1>
          <p className="text-xl text-gray-600 max-w-2xl mx-auto">
            Track your assets across Bitcoin, Ethereum, Pulsechain, Base and Robinhood Chain
          </p>
        </div>

        {/* Status Overview */}
        <div className="bg-white/70 backdrop-blur-sm rounded-2xl shadow-xl border border-white/20 p-8 mb-8">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-bold text-gray-800">Portfolio Overview</h2>
            <div className="text-right">
              <div className="text-4xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                {formatUSD(totalUSD)}
              </div>
              <div className="text-sm text-gray-500 uppercase tracking-wide">{allAssets.length} assets</div>
            </div>
          </div>

          <div className="mb-6">
            <ConnectionStatusBar statuses={chainStates} chains={CHAINS.map(c => c.label)} />
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-6">
            {CHAINS.map(chain => (
              <button
                key={chain.key}
                onClick={() => fetchChain(chain)}
                disabled={chainLoading.get(chain.key) || !chain.wallet}
                className={`bg-gradient-to-r ${chain.button} disabled:from-gray-300 disabled:to-gray-400 text-white px-4 py-4 rounded-xl font-semibold transition-all duration-200 shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 disabled:transform-none`}
              >
                <span className="flex items-center justify-center gap-2">
                  {chainLoading.get(chain.key) ? (
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                  ) : chain.icon} {chain.label}
                </span>
              </button>
            ))}

            <button
              onClick={fetchAllChains}
              disabled={isLoading || (!testEthWallet && !testBtcWallet)}
              className="bg-gradient-to-r from-purple-600 via-blue-600 to-indigo-600 hover:from-purple-700 hover:via-blue-700 hover:to-indigo-700 disabled:from-gray-300 disabled:to-gray-400 text-white px-4 py-4 rounded-xl font-semibold transition-all duration-200 shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 disabled:transform-none"
            >
              <span className="flex items-center justify-center gap-2">
                {isLoading ? (
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                ) : '⚡'} Sync All
              </span>
            </button>
          </div>

          {(!testEthWallet || !testBtcWallet) && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
              <p className="text-amber-800 text-sm font-medium">
                Add wallet addresses to .env.local: {!testEthWallet && 'NEXT_PUBLIC_TEST_ETH_WALLET'} {!testBtcWallet && 'NEXT_PUBLIC_TEST_BTC_WALLET'}
              </p>
            </div>
          )}
        </div>

        {/* Error Display */}
        {Array.from(chainErrors.entries()).map(([key, error]) => {
          const chain = CHAINS.find(c => c.key === key);
          if (!chain) return null;
          return (
            <div key={key} className="mb-4">
              <ChainError chain={chain.label} error={error} onRetry={() => fetchChain(chain)} />
            </div>
          );
        })}

        {/* Chain Asset Sections */}
        <div className="grid xl:grid-cols-3 lg:grid-cols-2 gap-6">
          {CHAINS.map(chain => {
            const chainAssets = assets.get(chain.key) ?? [];
            const listed = chainAssets.filter(a => a.type !== 'ordinal' && a.type !== 'nft');

            if (chainLoading.get(chain.key)) return <ChainSectionSkeleton key={chain.key} />;

            if (chainStates.get(chain.key) === 'error') {
              return (
                <div key={chain.key} className="bg-white/70 backdrop-blur-sm border border-red-200 rounded-2xl shadow-xl p-8">
                  <h2 className="text-2xl font-bold flex items-center text-red-600 mb-6">
                    <div className="w-6 h-6 bg-red-400 rounded-full mr-4"></div>
                    {chain.label} Assets (Failed to Load)
                  </h2>
                  <ErrorState
                    title={`${chain.label} Connection Failed`}
                    message={chainErrors.get(chain.key) || 'Unknown error'}
                    variant="minimal"
                    onRetry={() => fetchChain(chain)}
                  />
                </div>
              );
            }

            if (listed.length === 0) return null;

            return (
              <div key={chain.key} className="bg-white/70 backdrop-blur-sm border border-white/20 rounded-2xl shadow-xl p-8 hover:shadow-2xl transition-all duration-300">
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-2xl font-bold flex items-center">
                    <div className={`w-6 h-6 bg-gradient-to-r ${chain.dot} rounded-full mr-4 shadow-lg`}></div>
                    <span className={`bg-gradient-to-r ${chain.title} bg-clip-text text-transparent`}>
                      {chain.label}
                    </span>
                    <span className={`ml-3 ${chain.badge} px-3 py-1 rounded-full text-sm font-medium`}>
                      {formatUSD(sumUSD(chainAssets))}
                    </span>
                  </h2>
                  <ConnectionStatus
                    chain={chain.label}
                    status={chainStates.get(chain.key) || 'disconnected'}
                    error={chainErrors.get(chain.key)}
                    onRetry={() => fetchChain(chain)}
                  />
                </div>
                <div className="space-y-4">
                  {listed
                    .sort((a, b) => (b.valueUSD ?? 0) - (a.valueUSD ?? 0))
                    .map(asset => (
                      <div key={asset.id} className={`bg-white/50 backdrop-blur-sm rounded-xl p-4 border ${chain.border} transition-colors`}>
                        <AssetWithNFT asset={asset} />
                      </div>
                    ))}
                </div>
              </div>
            );
          })}
        </div>

        {/* NFT & Ordinal Gallery */}
        {allAssets.some(a => a.type === 'nft' || a.type === 'ordinal') && (
          <div className="mt-12 space-y-8">
            <div className="text-center mb-8">
              <h2 className="text-3xl font-bold mb-4 bg-gradient-to-r from-purple-600 via-pink-600 to-indigo-600 bg-clip-text text-transparent">
                Digital Collectibles Gallery
              </h2>
              <p className="text-gray-600 text-lg">
                Your NFTs and Bitcoin Ordinals across all chains
              </p>
            </div>

            {CHAINS.map(chain => {
              const chainAssets = assets.get(chain.key) ?? [];
              if (!chainAssets.some(a => a.type === 'nft' || a.type === 'ordinal')) return null;
              return (
                <div key={chain.key} className="bg-white/70 backdrop-blur-sm border border-white/20 rounded-2xl shadow-xl p-8">
                  <NFTGrid
                    assets={chainAssets}
                    title={chain.key === 'bitcoin' ? 'Bitcoin Ordinals' : `${chain.label} NFTs`}
                    variant="default"
                  />
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
