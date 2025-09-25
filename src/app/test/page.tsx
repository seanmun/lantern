'use client';

import { useState, useEffect } from 'react';
import { EthereumHandler } from '@/chains/ethereum';
import { PulsechainHandler } from '@/chains/pulsechain';
import { BitcoinHandler } from '@/chains/bitcoin';
import { Asset } from '@/types';
import { useToastHelpers } from '@/components/ui/Toast';
import { ConnectionStatus, ConnectionStatusBar, ConnectionState } from '@/components/ui/ConnectionStatus';
import { ChainError, ErrorState } from '@/components/ui/ErrorState';
import { ChainSectionSkeleton } from '@/components/ui/Skeleton';
import { NFTGrid, AssetWithNFT } from '@/components/ui/NFTDisplay';

export default function TestPage() {
  const [ethAssets, setEthAssets] = useState<Asset[]>([]);
  const [plsAssets, setPlsAssets] = useState<Asset[]>([]);
  const [btcAssets, setBtcAssets] = useState<Asset[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [chainStates, setChainStates] = useState<Map<string, ConnectionState>>(new Map());
  const [chainErrors, setChainErrors] = useState<Map<string, string>>(new Map());
  const [chainLoading, setChainLoading] = useState<Map<string, boolean>>(new Map());

  const toast = useToastHelpers();

  const testEthWallet = process.env.NEXT_PUBLIC_TEST_ETH_WALLET;
  const testBtcWallet = process.env.NEXT_PUBLIC_TEST_BTC_WALLET;
  const testPlsWallet = testEthWallet;

  const updateChainState = (chain: string, state: ConnectionState, error?: string) => {
    setChainStates(prev => new Map(prev.set(chain, state)));
    if (error) {
      setChainErrors(prev => new Map(prev.set(chain, error)));
    } else {
      setChainErrors(prev => {
        const newMap = new Map(prev);
        newMap.delete(chain);
        return newMap;
      });
    }
  };

  const updateChainLoading = (chain: string, loading: boolean) => {
    setChainLoading(prev => new Map(prev.set(chain, loading)));
  };

  const fetchEthereumData = async () => {
    if (!testEthWallet) return;

    try {
      updateChainState('ethereum', 'connecting');
      updateChainLoading('ethereum', true);

      const ethHandler = new EthereumHandler();
      const result = await ethHandler.getAllAssets(testEthWallet);

      if (result.success && result.data) {
        setEthAssets(result.data);
        updateChainState('ethereum', 'connected');
        toast.success('Ethereum Connected', `Found ${result.data.length} assets`);
      } else {
        const errorMsg = result.error || 'Failed to fetch Ethereum assets';
        updateChainState('ethereum', 'error', errorMsg);
        toast.error('Ethereum Error', errorMsg);
      }
    } catch (err: any) {
      const errorMsg = err.message || 'Ethereum fetch failed';
      updateChainState('ethereum', 'error', errorMsg);
      toast.error('Ethereum Error', errorMsg);
    } finally {
      updateChainLoading('ethereum', false);
    }
  };

  const fetchPulsechainData = async () => {
    if (!testPlsWallet) return;

    try {
      updateChainState('pulsechain', 'connecting');
      updateChainLoading('pulsechain', true);

      const plsHandler = new PulsechainHandler();
      const result = await plsHandler.getAllAssets(testPlsWallet);

      if (result.success && result.data) {
        setPlsAssets(result.data);
        updateChainState('pulsechain', 'connected');
        toast.success('Pulsechain Connected', `Found ${result.data.length} assets`);
      } else {
        const errorMsg = result.error || 'Failed to fetch Pulsechain assets';
        updateChainState('pulsechain', 'error', errorMsg);
        toast.error('Pulsechain Error', errorMsg);
      }
    } catch (err: any) {
      const errorMsg = err.message || 'Pulsechain fetch failed';
      updateChainState('pulsechain', 'error', errorMsg);
      toast.error('Pulsechain Error', errorMsg);
    } finally {
      updateChainLoading('pulsechain', false);
    }
  };

  const fetchBitcoinData = async () => {
    if (!testBtcWallet) {
      const errorMsg = 'No test BTC wallet found in environment variables';
      updateChainState('bitcoin', 'error', errorMsg);
      setError(errorMsg);
      return;
    }

    try {
      updateChainState('bitcoin', 'connecting');
      updateChainLoading('bitcoin', true);

      const btcHandler = new BitcoinHandler();
      const result = await btcHandler.getAllAssets(testBtcWallet);

      if (result.success && result.data) {
        setBtcAssets(result.data);
        updateChainState('bitcoin', 'connected');
        toast.success('Bitcoin Connected', `Found ${result.data.length} assets`);
      } else {
        const errorMsg = result.error || 'Failed to fetch Bitcoin assets';
        updateChainState('bitcoin', 'error', errorMsg);

        if (result.errorCode === 'RATE_LIMITED') {
          toast.rateLimit('Bitcoin');
          updateChainState('bitcoin', 'rate_limited', errorMsg);
        } else {
          toast.error('Bitcoin Error', errorMsg);
        }

        setError(errorMsg);
      }
    } catch (err: any) {
      const errorMsg = err.message || `Bitcoin error: ${err}`;
      updateChainState('bitcoin', 'error', errorMsg);
      toast.error('Bitcoin Error', errorMsg);
      setError(errorMsg);
    } finally {
      updateChainLoading('bitcoin', false);
    }
  };

  const fetchAllChains = async () => {
    setIsLoading(true);
    setError(null);

    try {
      ['bitcoin', 'ethereum', 'pulsechain'].forEach(chain => {
        updateChainState(chain, 'connecting');
        updateChainLoading(chain, true);
      });

      toast.info('Fetching All Chains', 'Loading data from Bitcoin, Ethereum, and Pulsechain...');

      await Promise.allSettled([
        fetchEthereumData(),
        fetchPulsechainData(),
        fetchBitcoinData()
      ]);

      toast.success('Multi-Chain Fetch Complete', 'Blockchain data loaded');

    } catch (err) {
      setError(`Error: ${err}`);
      toast.error('Multi-Chain Error', 'Failed to fetch from blockchains');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (testEthWallet || testBtcWallet) {
      fetchAllChains();
    }
  }, [testEthWallet, testBtcWallet]);

  const totalAssets = ethAssets.length + plsAssets.length + btcAssets.length;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header Section */}
        <div className="text-center mb-12">
          <h1 className="text-5xl font-bold mb-6 bg-gradient-to-r from-blue-600 via-purple-600 to-indigo-600 bg-clip-text text-transparent">
            Multi-Chain Portfolio
          </h1>
          <p className="text-xl text-gray-600 max-w-2xl mx-auto">
            Track your assets across Bitcoin, Ethereum, and Pulsechain with real-time blockchain integration
          </p>
        </div>

        {/* Status Overview */}
        <div className="bg-white/70 backdrop-blur-sm rounded-2xl shadow-xl border border-white/20 p-8 mb-8">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-bold text-gray-800">Portfolio Overview</h2>
            <div className="text-right">
              <div className="text-4xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                {totalAssets}
              </div>
              <div className="text-sm text-gray-500 uppercase tracking-wide">Total Assets</div>
            </div>
          </div>

          <div className="mb-6">
            <ConnectionStatusBar statuses={chainStates} />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            <button
              onClick={fetchBitcoinData}
              disabled={chainLoading.get('bitcoin') || !testBtcWallet}
              className="group relative bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 disabled:from-gray-300 disabled:to-gray-400 text-white px-6 py-4 rounded-xl font-semibold transition-all duration-200 shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 disabled:transform-none"
            >
              <span className="flex items-center justify-center">
                {chainLoading.get('bitcoin') ? (
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
                ) : '₿'} Bitcoin
              </span>
            </button>

            <button
              onClick={fetchEthereumData}
              disabled={chainLoading.get('ethereum') || !testEthWallet}
              className="group relative bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 disabled:from-gray-300 disabled:to-gray-400 text-white px-6 py-4 rounded-xl font-semibold transition-all duration-200 shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 disabled:transform-none"
            >
              <span className="flex items-center justify-center">
                {chainLoading.get('ethereum') ? (
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
                ) : 'Ξ'} Ethereum
              </span>
            </button>

            <button
              onClick={fetchPulsechainData}
              disabled={chainLoading.get('pulsechain') || !testPlsWallet}
              className="group relative bg-gradient-to-r from-pink-500 to-pink-600 hover:from-pink-600 hover:to-pink-700 disabled:from-gray-300 disabled:to-gray-400 text-white px-6 py-4 rounded-xl font-semibold transition-all duration-200 shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 disabled:transform-none"
            >
              <span className="flex items-center justify-center">
                {chainLoading.get('pulsechain') ? (
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
                ) : '♦'} Pulsechain
              </span>
            </button>

            <button
              onClick={fetchAllChains}
              disabled={isLoading || (!testEthWallet && !testBtcWallet)}
              className="group relative bg-gradient-to-r from-purple-600 via-blue-600 to-indigo-600 hover:from-purple-700 hover:via-blue-700 hover:to-indigo-700 disabled:from-gray-300 disabled:to-gray-400 text-white px-6 py-4 rounded-xl font-semibold transition-all duration-200 shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 disabled:transform-none"
            >
              <span className="flex items-center justify-center">
                {isLoading ? (
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
                ) : '⚡'} Sync All
              </span>
            </button>
          </div>

          {(!testEthWallet || !testBtcWallet) && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <svg className="h-5 w-5 text-amber-400" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                  </svg>
                </div>
                <div className="ml-3">
                  <p className="text-amber-800 text-sm font-medium">
                    Add wallet addresses to .env.local: {!testEthWallet && 'NEXT_PUBLIC_TEST_ETH_WALLET'} {!testBtcWallet && 'NEXT_PUBLIC_TEST_BTC_WALLET'}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Error Display */}
        {Array.from(chainErrors.entries()).map(([chain, error]) => (
          <div key={chain} className="mb-4">
            <ChainError
              chain={chain.charAt(0).toUpperCase() + chain.slice(1)}
              error={error}
              onRetry={() => {
                if (chain === 'bitcoin') fetchBitcoinData();
                else if (chain === 'ethereum') fetchEthereumData();
                else if (chain === 'pulsechain') fetchPulsechainData();
              }}
            />
          </div>
        ))}

        {/* Chain Asset Sections */}
        <div className="grid xl:grid-cols-3 lg:grid-cols-2 gap-6">
          {/* Bitcoin Assets */}
          {chainLoading.get('bitcoin') ? (
            <ChainSectionSkeleton />
          ) : btcAssets.length > 0 ? (
            <div className="bg-white/70 backdrop-blur-sm border border-white/20 rounded-2xl shadow-xl p-8 hover:shadow-2xl transition-all duration-300">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-2xl font-bold flex items-center">
                  <div className="w-6 h-6 bg-gradient-to-r from-orange-400 to-orange-600 rounded-full mr-4 shadow-lg"></div>
                  <span className="bg-gradient-to-r from-orange-600 to-orange-800 bg-clip-text text-transparent">
                    Bitcoin Assets
                  </span>
                  <span className="ml-3 bg-orange-100 text-orange-800 px-3 py-1 rounded-full text-sm font-medium">
                    {btcAssets.length}
                  </span>
                </h2>
                <ConnectionStatus
                  chain="Bitcoin"
                  status={chainStates.get('bitcoin') || 'disconnected'}
                  error={chainErrors.get('bitcoin')}
                  onRetry={fetchBitcoinData}
                />
              </div>
              <div className="space-y-4">
                {btcAssets.filter(asset => asset.type !== 'ordinal' && asset.type !== 'nft').map((asset) => (
                  <div key={asset.id} className="bg-white/50 backdrop-blur-sm rounded-xl p-4 border border-orange-100 hover:border-orange-200 transition-colors">
                    <AssetWithNFT asset={asset} />
                  </div>
                ))}
              </div>
            </div>
          ) : chainStates.get('bitcoin') === 'error' ? (
            <div className="bg-white/70 backdrop-blur-sm border border-red-200 rounded-2xl shadow-xl p-8">
              <h2 className="text-2xl font-bold flex items-center text-red-600 mb-6">
                <div className="w-6 h-6 bg-red-400 rounded-full mr-4"></div>
                Bitcoin Assets (Failed to Load)
              </h2>
              <ErrorState
                title="Bitcoin Connection Failed"
                message={chainErrors.get('bitcoin') || 'Unknown error'}
                variant="minimal"
                onRetry={fetchBitcoinData}
              />
            </div>
          ) : null}

          {/* Ethereum Assets */}
          {chainLoading.get('ethereum') ? (
            <ChainSectionSkeleton />
          ) : ethAssets.length > 0 ? (
            <div className="bg-white/70 backdrop-blur-sm border border-white/20 rounded-2xl shadow-xl p-8 hover:shadow-2xl transition-all duration-300">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-2xl font-bold flex items-center">
                  <div className="w-6 h-6 bg-gradient-to-r from-blue-400 to-blue-600 rounded-full mr-4 shadow-lg"></div>
                  <span className="bg-gradient-to-r from-blue-600 to-blue-800 bg-clip-text text-transparent">
                    Ethereum Assets
                  </span>
                  <span className="ml-3 bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-sm font-medium">
                    {ethAssets.length}
                  </span>
                </h2>
                <ConnectionStatus
                  chain="Ethereum"
                  status={chainStates.get('ethereum') || 'disconnected'}
                  error={chainErrors.get('ethereum')}
                  onRetry={fetchEthereumData}
                />
              </div>
              <div className="space-y-4">
                {ethAssets.filter(asset => asset.type !== 'ordinal' && asset.type !== 'nft').map((asset) => (
                  <div key={asset.id} className="bg-white/50 backdrop-blur-sm rounded-xl p-4 border border-blue-100 hover:border-blue-200 transition-colors">
                    <AssetWithNFT asset={asset} />
                  </div>
                ))}
              </div>
            </div>
          ) : chainStates.get('ethereum') === 'error' ? (
            <div className="bg-white/70 backdrop-blur-sm border border-red-200 rounded-2xl shadow-xl p-8">
              <h2 className="text-2xl font-bold flex items-center text-red-600 mb-6">
                <div className="w-6 h-6 bg-red-400 rounded-full mr-4"></div>
                Ethereum Assets (Failed to Load)
              </h2>
              <ErrorState
                title="Ethereum Connection Failed"
                message={chainErrors.get('ethereum') || 'Unknown error'}
                variant="minimal"
                onRetry={fetchEthereumData}
              />
            </div>
          ) : null}

          {/* Pulsechain Assets */}
          {chainLoading.get('pulsechain') ? (
            <ChainSectionSkeleton />
          ) : plsAssets.length > 0 ? (
            <div className="bg-white/70 backdrop-blur-sm border border-white/20 rounded-2xl shadow-xl p-8 hover:shadow-2xl transition-all duration-300">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-2xl font-bold flex items-center">
                  <div className="w-6 h-6 bg-gradient-to-r from-pink-400 to-pink-600 rounded-full mr-4 shadow-lg"></div>
                  <span className="bg-gradient-to-r from-pink-600 to-pink-800 bg-clip-text text-transparent">
                    Pulsechain Assets
                  </span>
                  <span className="ml-3 bg-pink-100 text-pink-800 px-3 py-1 rounded-full text-sm font-medium">
                    {plsAssets.length}
                  </span>
                </h2>
                <ConnectionStatus
                  chain="Pulsechain"
                  status={chainStates.get('pulsechain') || 'disconnected'}
                  error={chainErrors.get('pulsechain')}
                  onRetry={fetchPulsechainData}
                />
              </div>
              <div className="space-y-4">
                {plsAssets.filter(asset => asset.type !== 'ordinal' && asset.type !== 'nft').map((asset) => (
                  <div key={asset.id} className="bg-white/50 backdrop-blur-sm rounded-xl p-4 border border-pink-100 hover:border-pink-200 transition-colors">
                    <AssetWithNFT asset={asset} />
                  </div>
                ))}
              </div>
            </div>
          ) : chainStates.get('pulsechain') === 'error' ? (
            <div className="bg-white/70 backdrop-blur-sm border border-red-200 rounded-2xl shadow-xl p-8">
              <h2 className="text-2xl font-bold flex items-center text-red-600 mb-6">
                <div className="w-6 h-6 bg-red-400 rounded-full mr-4"></div>
                Pulsechain Assets (Failed to Load)
              </h2>
              <ErrorState
                title="Pulsechain Connection Failed"
                message={chainErrors.get('pulsechain') || 'Unknown error'}
                variant="minimal"
                onRetry={fetchPulsechainData}
              />
            </div>
          ) : null}
        </div>

        {/* Enhanced NFT & Ordinal Gallery */}
        {(ethAssets.some(a => a.type === 'nft') ||
          plsAssets.some(a => a.type === 'nft') ||
          btcAssets.some(a => a.type === 'ordinal')) && (
          <div className="mt-12 space-y-8">
            <div className="text-center mb-8">
              <h2 className="text-3xl font-bold mb-4 bg-gradient-to-r from-purple-600 via-pink-600 to-indigo-600 bg-clip-text text-transparent">
                Digital Collectibles Gallery
              </h2>
              <p className="text-gray-600 text-lg">
                Your NFTs and Bitcoin Ordinals across all chains
              </p>
            </div>

            {/* Ethereum NFTs */}
            {ethAssets.some(a => a.type === 'nft') && (
              <div className="bg-white/70 backdrop-blur-sm border border-white/20 rounded-2xl shadow-xl p-8">
                <NFTGrid
                  assets={ethAssets}
                  title="Ethereum NFTs"
                  variant="default"
                />
              </div>
            )}

            {/* Pulsechain NFTs */}
            {plsAssets.some(a => a.type === 'nft') && (
              <div className="bg-white/70 backdrop-blur-sm border border-white/20 rounded-2xl shadow-xl p-8">
                <NFTGrid
                  assets={plsAssets}
                  title="Pulsechain NFTs"
                  variant="default"
                />
              </div>
            )}

            {/* Bitcoin Ordinals */}
            {btcAssets.some(a => a.type === 'ordinal') && (
              <div className="bg-white/70 backdrop-blur-sm border border-white/20 rounded-2xl shadow-xl p-8">
                <NFTGrid
                  assets={btcAssets}
                  title="Bitcoin Ordinals"
                  variant="default"
                />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}