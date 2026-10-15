'use client';

import { Asset, HexStakeInfo } from '@/types';
import { useState } from 'react';
import { formatUSD } from '@/utils/prices';

// HTML, SVG, text and JSON inscriptions can't render in <img>; show them in a sandboxed frame
function rendersInFrame(asset: Asset): boolean {
  const type = asset.contentType?.toLowerCase() ?? '';
  return /html|svg|text\/|json|javascript/.test(type) || !!asset.collectionName?.toLowerCase().includes('quantum cat');
}

const TOKEN_BADGES: Record<string, string> = {
  'Stock Token': 'STOCK',
  Rune: 'RUNE',
  'BRC-20': 'BRC-20',
};

function formatAmount(value: string): string {
  return Number(value).toLocaleString('en-US', { maximumFractionDigits: 4 });
}

function StakeProgress({ lockedDay, stakedDays, endDate, daysRemaining }: Pick<HexStakeInfo, 'lockedDay' | 'stakedDays' | 'endDate' | 'daysRemaining'>) {
  const progress = Math.min(100, ((stakedDays - daysRemaining) / stakedDays) * 100);
  const ends = new Date(endDate).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' });
  return (
    <div title={`Locked on HEX day ${lockedDay}`}>
      <div className="h-1.5 w-full rounded-full bg-gray-200 overflow-hidden">
        <div className="h-full bg-gradient-to-r from-pink-500 to-purple-600" style={{ width: `${progress}%` }} />
      </div>
      <p className="mt-1">
        {daysRemaining > 0 ? `${daysRemaining.toLocaleString()} days left · ends ${ends}` : `Matured ${ends}`}
      </p>
    </div>
  );
}

interface NFTCardProps {
  asset: Asset;
  variant?: 'default' | 'compact' | 'large';
}

export function NFTCard({ asset, variant = 'default' }: NFTCardProps) {
  const [imageError, setImageError] = useState(false);
  const [imageLoading, setImageLoading] = useState(true);

  const handleImageError = () => {
    setImageError(true);
    setImageLoading(false);
  };

  const handleImageLoad = () => {
    setImageLoading(false);
  };

  const isOrdinal = asset.type === 'ordinal';
  const isNFT = asset.type === 'nft';
  const isHTMLOrdinal = isOrdinal && rendersInFrame(asset);

  if (!isNFT && !isOrdinal) return null;

  // Fixed pixel dimensions that cannot be overridden
  const FIXED_IMAGE_SIZE = {
    width: '128px',
    height: '128px',
    minWidth: '128px',
    maxWidth: '128px',
    minHeight: '128px',
    maxHeight: '128px'
  };

  return (
    <div className="bg-white/90 backdrop-blur-sm border border-white/40 rounded-xl p-4 hover:shadow-xl hover:bg-white transition-all duration-300 w-full max-w-none group">
      {/* NFT Image */}
      <div
        className="mx-auto mb-3 relative overflow-hidden rounded-lg bg-gradient-to-br from-gray-50 to-gray-100 flex-shrink-0 group-hover:shadow-lg transition-shadow"
        style={FIXED_IMAGE_SIZE}
      >
        {isHTMLOrdinal && asset.imageUrl ? (
          <>
            {imageLoading && (
              <div className="absolute inset-0 flex items-center justify-center z-10 bg-gray-100">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-500"></div>
              </div>
            )}
            <iframe
              loading="lazy"
              src={asset.imageUrl}
              title={asset.name}
              className="border-0"
              style={{
                width: '128px',
                height: '128px',
                maxWidth: '128px',
                maxHeight: '128px',
                minWidth: '128px',
                minHeight: '128px'
              }}
              onLoad={handleImageLoad}
              onError={handleImageError}
              sandbox="allow-scripts"
            />
          </>
        ) : asset.imageUrl && !imageError ? (
          <>
            {imageLoading && (
              <div className="absolute inset-0 flex items-center justify-center z-10 bg-gray-100">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-500"></div>
              </div>
            )}
            <img
              loading="lazy"
              src={asset.imageUrl}
              alt={asset.name}
              className="object-cover object-center"
              style={{
                width: '128px',
                height: '128px',
                maxWidth: '128px',
                maxHeight: '128px',
                minWidth: '128px',
                minHeight: '128px'
              }}
              onError={handleImageError}
              onLoad={handleImageLoad}
            />
          </>
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-gray-100 to-gray-200">
            {isOrdinal ? (
              <div className="text-center">
                <div className="mb-1 text-2xl">🟠</div>
                <div className="text-gray-500 text-xs">Ordinal</div>
              </div>
            ) : (
              <div className="text-center">
                <div className="mb-1 text-2xl">🖼️</div>
                <div className="text-gray-500 text-xs">NFT</div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* NFT Info */}
      <div className="text-center">
        <h3 className="font-medium text-gray-900 mb-1 text-base truncate">
          {asset.name}
        </h3>

        {asset.collectionName && (
          <p className="text-gray-500 mb-2 text-sm truncate">
            {asset.collectionName}
          </p>
        )}

        {/* Ordinal specific info */}
        {isOrdinal && asset.inscriptionNumber !== undefined && (
          <p className="text-xs text-orange-600 mb-1">
            Inscription #{asset.inscriptionNumber}
          </p>
        )}

        {/* Token ID for regular NFTs */}
        {isNFT && asset.tokenId && (
          <p className="text-xs text-blue-600 mb-1">
            Token #{asset.tokenId}
          </p>
        )}

        {/* Chain indicator */}
        <div className="flex items-center justify-center mt-2">
          <div className={`w-2 h-2 rounded-full mr-2 ${
            asset.chain === 'bitcoin' ? 'bg-orange-500' :
            asset.chain === 'ethereum' ? 'bg-blue-500' :
            asset.chain === 'pulsechain' ? 'bg-pink-500' :
            asset.chain === 'base' ? 'bg-base' :
            asset.chain === 'robinhood' ? 'bg-robinhood' : 'bg-gray-400'
          }`}></div>
          <span className="text-xs text-gray-500 capitalize">{asset.chain}</span>
        </div>
      </div>
    </div>
  );
}

interface NFTGridProps {
  assets: Asset[];
  variant?: 'default' | 'compact' | 'large';
  title?: string;
}

const NFT_PAGE_SIZE = 24;

export function NFTGrid({ assets, title }: NFTGridProps) {
  const [visible, setVisible] = useState(NFT_PAGE_SIZE);
  const nftAssets = assets.filter(asset => asset.type === 'nft' || asset.type === 'ordinal');

  if (nftAssets.length === 0) return null;

  // Cards are a fixed 128px wide, so 2 columns fit on a phone
  const gridClasses = 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6';

  return (
    <div>
      {title && (
        <div className="mb-6">
          <h3 className="text-2xl font-bold mb-2 flex items-center">
            <span className="mr-3 text-2xl">🖼️</span>
            <span className="bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent">
              {title}
            </span>
            <span className="ml-3 bg-indigo-100 text-indigo-800 px-3 py-1 rounded-full text-sm font-medium">
              {nftAssets.length}
            </span>
          </h3>
          <div className="h-1 bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 rounded-full w-24"></div>
        </div>
      )}

      <div className={`grid gap-4 ${gridClasses} w-full`}>
        {nftAssets.slice(0, visible).map((asset) => (
          <div key={asset.id} className="transform hover:scale-105 transition-transform duration-200">
            <NFTCard
              asset={asset}
              variant="default"
            />
          </div>
        ))}
      </div>

      {visible < nftAssets.length && (
        <div className="mt-6 text-center">
          <button
            onClick={() => setVisible(v => v + NFT_PAGE_SIZE * 2)}
            className="rounded-lg bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm ring-1 ring-gray-200 hover:bg-gray-50"
          >
            Show more ({(nftAssets.length - visible).toLocaleString()} remaining)
          </button>
        </div>
      )}
    </div>
  );
}

interface AssetWithNFTProps {
  asset: Asset;
  showNFTPreview?: boolean;
}

export function AssetWithNFT({ asset, showNFTPreview = true }: AssetWithNFTProps) {
  const isNFTOrOrdinal = asset.type === 'nft' || asset.type === 'ordinal';
  const isHTMLOrdinal = asset.type === 'ordinal' && rendersInFrame(asset);

  return (
    <div className="rounded-lg p-4">
      <div className="flex items-start space-x-3">
        {/* NFT/Ordinal Image Preview */}
        {isNFTOrOrdinal && showNFTPreview && (
          <div
            className="flex-shrink-0 overflow-hidden rounded-lg relative bg-gray-100"
            style={{
              width: '128px',
              height: '128px',
              minWidth: '128px',
              maxWidth: '128px',
              minHeight: '128px',
              maxHeight: '128px'
            }}
          >
            {asset.imageUrl ? (
              isHTMLOrdinal ? (
                <iframe
              loading="lazy"
                  src={asset.imageUrl}
                  title={asset.name}
                  className="border-0"
                  style={{
                    width: '128px',
                    height: '128px',
                    maxWidth: '128px',
                    maxHeight: '128px'
                  }}
                  sandbox="allow-scripts"
                />
              ) : (
                <img
              loading="lazy"
                  src={asset.imageUrl}
                  alt={asset.name}
                  className="object-cover object-center"
                  style={{
                    width: '100%',
                    height: '100%',
                    maxWidth: '128px',
                    maxHeight: '128px'
                  }}
                  onError={(e) => {
                    const target = e.target as HTMLImageElement;
                    target.style.display = 'none';
                  }}
                />
              )
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-gray-100 to-gray-200">
                <span className="text-2xl">
                  {asset.type === 'ordinal' ? '🟠' : '🖼️'}
                </span>
              </div>
            )}
          </div>
        )}

        {/* Asset Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <h3 className="flex min-w-0 items-center gap-2 font-medium text-gray-900">
              {asset.type === 'token' && asset.imageUrl && (
                // eslint-disable-next-line @next/next/no-img-element -- remote token logos, not optimizable assets
                <img
                  src={asset.imageUrl}
                  alt=""
                  width={20}
                  height={20}
                  loading="lazy"
                  className="h-5 w-5 shrink-0 rounded-full"
                  onError={(e) => { e.currentTarget.style.display = 'none'; }}
                />
              )}
              <span className="truncate">{asset.name} ({asset.symbol})</span>
            </h3>

            {/* Type Badge */}
            <span className={`px-2 py-1 text-xs font-medium rounded-full ${
              asset.type === 'ordinal' ? 'bg-orange-100 text-orange-800' :
              asset.type === 'nft' ? 'bg-blue-100 text-blue-800' :
              asset.type === 'token' ? 'bg-green-100 text-green-800' :
              asset.type === 'stake' ? 'bg-pink-100 text-pink-800' :
              'bg-gray-100 text-gray-800'
            }`}>
              {asset.pool ? 'POOL' : TOKEN_BADGES[asset.tokenStandard ?? ''] ?? asset.type.toUpperCase()}
            </span>
          </div>

          <p className="mt-1 break-words text-sm text-gray-500">
            {asset.type === 'stake' ? 'Principal' : 'Balance'}: {formatAmount(asset.balanceFormatted)} {asset.symbol}
            {asset.valueUSD !== undefined && (
              <span className="ml-2 font-medium text-gray-800">{formatUSD(asset.valueUSD)}</span>
            )}
          </p>

          {asset.stake && (
            <div className="mt-2 space-y-1 text-xs text-gray-500">
              <p>{asset.stake.tShares.toLocaleString('en-US', { maximumFractionDigits: 3 })} T-Shares · {asset.stake.stakedDays.toLocaleString()} days</p>
              <StakeProgress {...asset.stake} />
            </div>
          )}

          {asset.pool && (
            <div className="mt-2 space-y-1 text-xs text-gray-500">
              <p>
                Backing: {formatAmount(String(asset.pool.backingHex))} HEX
                {asset.pool.backingValueUSD !== undefined && ` (${formatUSD(asset.pool.backingValueUSD)})`}
                {asset.valueUSD !== undefined && asset.pool.backingValueUSD ? (
                  <span className="ml-1 font-medium text-gray-700">
                    · trades at {((asset.valueUSD / asset.pool.backingValueUSD) * 100).toFixed(0)}% of backing
                  </span>
                ) : null}
              </p>
              {asset.pool.currentStake && <StakeProgress {...asset.pool.currentStake} />}
            </div>
          )}

          {/* Additional NFT/Ordinal Info */}
          {isNFTOrOrdinal && (
            <div className="mt-2 space-y-1">
              {asset.collectionName && (
                <p className="text-xs text-gray-500">
                  Collection: {asset.collectionName}
                </p>
              )}

              {asset.tokenId && (
                <p className="text-xs text-gray-500">
                  Token ID: {asset.tokenId}
                </p>
              )}

              {asset.inscriptionNumber !== undefined && (
                <p className="text-xs text-orange-600">
                  Inscription #{asset.inscriptionNumber}
                </p>
              )}

              {asset.contentType && (
                <p className="text-xs text-gray-500">
                  Type: {asset.contentType}
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}