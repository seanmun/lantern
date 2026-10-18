'use client';

import { Asset, HexStakeInfo } from '@/types';
import { useState } from 'react';
import { formatUSD } from '@/utils/prices';
import { TokenLogo } from './TokenLogo';
import { logoUrl } from '@/utils/logos';

// HTML, SVG, text and JSON inscriptions can't render in <img>; show them in a sandboxed frame
function rendersInFrame(asset: Asset): boolean {
  const type = asset.contentType?.toLowerCase() ?? '';
  return /html|svg|text\/|json|javascript/.test(type) || !!asset.collectionName?.toLowerCase().includes('quantum cat');
}

const TOKEN_BADGES: Record<string, string> = {
  'Stock Token': 'STOCK',
  Rune: 'RUNE',
  'BRC-20': 'BRC-20',
  Staked: 'STAKED',
  Rewards: 'REWARDS',
  Unstaking: 'UNSTAKING',
};

/** Hash-style token IDs (70+ digits) don't fit a card; keep the ends. */
function shortTokenId(id: string): string {
  return id.length > 12 ? `${id.slice(0, 6)}…${id.slice(-4)}` : id;
}

function formatAmount(value: string): string {
  return Number(value).toLocaleString('en-US', { maximumFractionDigits: 4 });
}

function StakeProgress({ lockedDay, stakedDays, endDate, daysRemaining }: Pick<HexStakeInfo, 'lockedDay' | 'stakedDays' | 'endDate' | 'daysRemaining'>) {
  const progress = Math.min(100, ((stakedDays - daysRemaining) / stakedDays) * 100);
  const ends = new Date(endDate).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' });
  return (
    <div title={`Locked on HEX day ${lockedDay}`}>
      <div className="h-1.5 w-full rounded-full bg-line overflow-hidden">
        <div className="h-full bg-accent" style={{ width: `${progress}%` }} />
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
  featured?: boolean;                         // shown in the Overview frame
  onFeaturedChange?: (featured: boolean) => void;
}

export function NFTCard({ asset, variant = 'default', featured, onFeaturedChange }: NFTCardProps) {
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

  return (
    <div className={`group relative w-full min-w-0 rounded-2xl border bg-surface p-2 transition-colors sm:p-4 ${featured ? 'border-accent/50 ring-1 ring-accent/30' : 'border-line hover:border-line-strong'}`}>
      {onFeaturedChange && (
        <label
          className="absolute left-1.5 top-1.5 z-20 flex cursor-pointer items-center gap-1 rounded-md bg-surface/90 px-1.5 py-0.5 text-[10px] font-medium text-ink/85 shadow-sm ring-1 ring-line sm:left-2 sm:top-2"
          title="Show this piece in the Overview frame"
        >
          <input
            type="checkbox"
            checked={!!featured}
            onChange={(e) => onFeaturedChange(e.target.checked)}
            className="h-3 w-3 accent-accent"
            aria-label={`Show ${asset.name} in the frame`}
          />
          In frame
        </label>
      )}
      {/* NFT Image: square, fills the column up to 160px so 2 columns fit on a phone */}
      <div className="relative mx-auto mb-3 aspect-square w-full max-w-40 overflow-hidden rounded-lg bg-soft transition-shadow group-hover:shadow-md">
        {isHTMLOrdinal && asset.imageUrl ? (
          <>
            {imageLoading && (
              <div className="absolute inset-0 flex items-center justify-center z-10 bg-soft">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-info-solid"></div>
              </div>
            )}
            <iframe
              loading="lazy"
              src={asset.imageUrl}
              title={asset.name}
              className="h-full w-full border-0"
              onLoad={handleImageLoad}
              onError={handleImageError}
              sandbox="allow-scripts"
            />
          </>
        ) : asset.imageUrl && !imageError ? (
          <>
            {imageLoading && (
              <div className="absolute inset-0 flex items-center justify-center z-10 bg-soft">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-info-solid"></div>
              </div>
            )}
            <img
              loading="lazy"
              src={asset.imageUrl}
              alt={asset.name}
              className="h-full w-full object-cover object-center"
              onError={handleImageError}
              onLoad={handleImageLoad}
            />
          </>
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-soft">
            {isOrdinal ? (
              <div className="text-center">
                <div className="text-xs font-bold uppercase tracking-wide text-muted">Ordinal</div>
              </div>
            ) : (
              <div className="text-center">
                <div className="text-xs font-bold uppercase tracking-wide text-muted">NFT</div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* NFT Info */}
      <div className="text-center">
        <h3 className="font-medium text-ink mb-1 text-base truncate">
          {asset.name}
        </h3>

        {asset.collectionName && (
          <p className="text-muted mb-2 text-sm truncate">
            {asset.collectionName}
          </p>
        )}

        {/* Ordinal specific info */}
        {isOrdinal && asset.inscriptionNumber !== undefined && (
          <p className="text-xs text-warn mb-1">
            Inscription #{asset.inscriptionNumber}
          </p>
        )}

        {/* Token ID for regular NFTs */}
        {isNFT && asset.tokenId && (
          <p className="mb-1 truncate text-xs text-info" title={`Token #${asset.tokenId}`}>
            Token #{shortTokenId(asset.tokenId)}
          </p>
        )}

        {/* Chain indicator */}
        <div className="flex items-center justify-center mt-2">
          <div className={`w-2 h-2 rounded-full mr-2 ${
            asset.chain === 'bitcoin' ? 'bg-warn-solid' :
            asset.chain === 'ethereum' ? 'bg-info-solid' :
            asset.chain === 'pulsechain' ? 'bg-pink-500' :
            asset.chain === 'base' ? 'bg-base' :
            asset.chain === 'robinhood' ? 'bg-robinhood' : 'bg-muted'
          }`}></div>
          <span className="text-xs text-muted capitalize">{asset.chain}</span>
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
          <h3 className="mb-2 flex items-center text-2xl font-extrabold tracking-tight text-ink">
            <span>{title}</span>
            <span className="ml-3 bg-accent/10 text-accent px-3 py-1 rounded-full text-sm font-medium">
              {nftAssets.length}
            </span>
          </h3>
          <div className="h-1 bg-accent rounded-full w-24"></div>
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
            className="inline-flex h-10 items-center gap-1.5 rounded-full bg-soft px-4 text-sm font-semibold text-ink hover:bg-line"
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
            className="flex-shrink-0 overflow-hidden rounded-lg relative bg-soft"
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
              <div className="w-full h-full flex items-center justify-center bg-soft">
                <span className="text-2xl">
                  {asset.type === 'ordinal' ? 'Ordinal' : 'NFT'}
                </span>
              </div>
            )}
          </div>
        )}

        {/* Asset Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <h3 className="flex min-w-0 items-center gap-2 font-medium text-ink">
              {(asset.type === 'token' || asset.type === 'native' || asset.type === 'stake') && (
                <TokenLogo src={logoUrl(asset)} symbol={asset.symbol} />
              )}
              <span className="truncate">{asset.name} ({asset.symbol})</span>
            </h3>

            {/* Type Badge */}
            <span className={`px-2 py-1 text-xs font-medium rounded-full ${
              asset.type === 'ordinal' ? 'bg-warn-soft text-warn' :
              asset.type === 'nft' ? 'bg-info-soft text-info' :
              asset.type === 'token' ? 'bg-good-soft text-good' :
              asset.type === 'stake' ? 'bg-accent/15 text-accent' :
              'bg-soft text-ink'
            }`}>
              {asset.pool ? 'POOL' : TOKEN_BADGES[asset.tokenStandard ?? ''] ?? asset.type.toUpperCase()}
            </span>
          </div>

          <p className="mt-1 break-words text-sm text-muted">
            {asset.type === 'stake' ? 'Principal' : 'Balance'}: {formatAmount(asset.balanceFormatted)} {asset.symbol}
            {asset.valueUSD !== undefined && (
              <span className="ml-2 font-medium text-ink">{formatUSD(asset.valueUSD)}</span>
            )}
          </p>

          {asset.stake && (
            <div className="mt-2 space-y-1 text-xs text-muted">
              <p>{asset.stake.tShares.toLocaleString('en-US', { maximumFractionDigits: 3 })} T-Shares · {asset.stake.stakedDays.toLocaleString()} days</p>
              <StakeProgress {...asset.stake} />
            </div>
          )}

          {asset.pool && (
            <div className="mt-2 space-y-1 text-xs text-muted">
              <p>
                Backing: {formatAmount(String(asset.pool.backingHex))} HEX
                {asset.pool.backingValueUSD !== undefined && ` (${formatUSD(asset.pool.backingValueUSD)})`}
                {asset.valueUSD !== undefined && asset.pool.backingValueUSD ? (
                  <span className="ml-1 font-medium text-ink/85">
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
                <p className="text-xs text-muted">
                  Collection: {asset.collectionName}
                </p>
              )}

              {asset.tokenId && (
                <p className="text-xs text-muted">
                  Token ID: {shortTokenId(asset.tokenId)}
                </p>
              )}

              {asset.inscriptionNumber !== undefined && (
                <p className="text-xs text-warn">
                  Inscription #{asset.inscriptionNumber}
                </p>
              )}

              {asset.contentType && (
                <p className="text-xs text-muted">
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