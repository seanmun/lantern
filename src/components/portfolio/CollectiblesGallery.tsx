'use client';

import { createContext, useContext, useState } from 'react';
import { Asset } from '@/types';
import { CHAIN_DISPLAY } from '@/config/chainDisplay';
import { NFTCard } from '@/components/ui/NFTDisplay';
import { formatUSD } from '@/utils/prices';

interface GalleryProps {
  assets: Asset[];
  isFeatured: (a: Asset) => boolean;
  onFeaturedChange: (id: string, featured: boolean) => void;
  onResetFeatured: () => void;
  featuredCustomized: boolean;
}

// The "In frame" checkboxes read and write the Overview frame's selection
const FeaturedContext = createContext<Pick<GalleryProps, 'isFeatured' | 'onFeaturedChange'> | null>(null);

function ArtCard({ asset }: { asset: Asset }) {
  const featured = useContext(FeaturedContext);
  return (
    <NFTCard
      asset={asset}
      featured={featured?.isFeatured(asset)}
      onFeaturedChange={featured && asset.imageUrl ? (v) => featured.onFeaturedChange(asset.id, v) : undefined}
    />
  );
}

interface CollectionGroup {
  key: string;
  name: string;
  count: number;
  floorUSD?: number;  // per item, when known in USD terms
  valueUSD?: number;
  sample?: Asset;     // collection asset, for its sample image when no items matched
  items: Asset[];
}

const ITEMS_PER_COLLECTION = 6;
const UNCATEGORIZED_PAGE = 24;
const isText = (a: Asset) => /^text\/plain|json/i.test(a.contentType ?? '');

function groupCollections(chainAssets: Asset[]): { groups: CollectionGroup[]; uncategorized: Asset[] } {
  const items = chainAssets.filter((a) => a.type === 'nft' || a.type === 'ordinal');
  const collections = chainAssets.filter((a) => a.type === 'collection');
  const keyOf = (a: Asset) => (a.contractAddress ? `c:${a.contractAddress.toLowerCase()}` : `n:${a.collectionName}`);

  // Same collection held in several wallets → one group
  const groups = new Map<string, CollectionGroup>();
  for (const c of collections) {
    const key = keyOf(c);
    const g = groups.get(key) ?? { key, name: c.name, count: 0, items: [], sample: c };
    g.count += Number(c.balanceFormatted) || 0;
    if (c.valueUSD !== undefined) g.valueUSD = (g.valueUSD ?? 0) + c.valueUSD;
    groups.set(key, g);
  }
  for (const g of groups.values()) {
    if (g.valueUSD !== undefined && g.count > 0) g.floorUSD = g.valueUSD / g.count;
  }

  const uncategorized: Asset[] = [];
  for (const item of items) {
    const g = (item.contractAddress || item.collectionName) ? groups.get(keyOf(item)) : undefined;
    if (g) g.items.push(item);
    else uncategorized.push(item);
  }

  const sorted = [...groups.values()].sort((a, b) => (b.valueUSD ?? 0) - (a.valueUSD ?? 0) || b.count - a.count);
  return { groups: sorted, uncategorized };
}

/**
 * NFTs and Ordinals grouped by collection, with counts and floor value.
 * Bitcoin text inscriptions (mostly BRC-20 token records) are folded away.
 */
export function CollectiblesGallery({ assets, isFeatured, onFeaturedChange, onResetFeatured, featuredCustomized }: GalleryProps) {
  const chains = CHAIN_DISPLAY.filter((c) => assets.some((a) => a.chain === c.key && (a.type === 'nft' || a.type === 'ordinal' || a.type === 'collection')));
  if (chains.length === 0) return null;

  const totalFloor = assets.filter((a) => a.type === 'collection').reduce((s, a) => s + (a.valueUSD ?? 0), 0);

  return (
    <section className="space-y-6">
      <div className="text-center">
        <h2 className="text-3xl font-bold">
          <span className="bg-gradient-to-r from-purple-600 via-pink-600 to-indigo-600 bg-clip-text text-transparent">Collectibles</span>
        </h2>
        {totalFloor > 0 && <p className="mt-1 text-sm text-gray-500">{formatUSD(totalFloor)} at floor prices</p>}
        <p className="mt-1 text-sm text-gray-500">
          Checked pieces hang in the Overview frame · {assets.filter((a) => (a.type === 'nft' || a.type === 'ordinal') && isFeatured(a)).length} in frame
          {featuredCustomized && (
            <button onClick={onResetFeatured} className="ml-2 font-medium text-purple-700 hover:text-purple-900">
              Reset to automatic
            </button>
          )}
        </p>
      </div>
      <FeaturedContext.Provider value={{ isFeatured, onFeaturedChange }}>
      {chains.map((chain) => (
        <ChainGallery key={chain.key} title={chain.key === 'bitcoin' ? 'Bitcoin Ordinals' : `${chain.label} NFTs`} assets={assets.filter((a) => a.chain === chain.key)} />
      ))}
      </FeaturedContext.Provider>
    </section>
  );
}

function ChainGallery({ title, assets }: { title: string; assets: Asset[] }) {
  const [showText, setShowText] = useState(false);
  const [uncategorizedShown, setUncategorizedShown] = useState(UNCATEGORIZED_PAGE);
  const { groups, uncategorized } = groupCollections(assets);
  const textItems = uncategorized.filter(isText);
  const visibleUncategorized = showText ? uncategorized : uncategorized.filter((a) => !isText(a));
  const itemCount = assets.filter((a) => a.type === 'nft' || a.type === 'ordinal').length;
  const value = groups.reduce((s, g) => s + (g.valueUSD ?? 0), 0);

  return (
    <div className="min-w-0 rounded-2xl border border-white/20 bg-white/70 p-4 shadow-xl backdrop-blur-sm sm:p-8">
      <div className="mb-6 flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-2xl font-bold">
          <span className="bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent">{title}</span>
        </h3>
        <span className="text-sm text-gray-500">
          {itemCount.toLocaleString()} items · {groups.length} collection{groups.length === 1 ? '' : 's'}
          {value > 0 && ` · ${formatUSD(value)} at floor`}
        </span>
      </div>

      <div className="space-y-6">
        {/* Big collections get a full row; 1-2 item collections sit side by side */}
        {groups.filter((g) => g.items.length > 2).map((g) => <CollectionBlock key={g.key} group={g} />)}
        {groups.some((g) => g.items.length <= 2) && (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {groups.filter((g) => g.items.length <= 2).map((g) => <CollectionBlock key={g.key} group={g} compact />)}
          </div>
        )}

        {visibleUncategorized.length > 0 && (
          <div>
            {groups.length > 0 && <h4 className="mb-3 text-sm font-semibold text-gray-700">Not in a known collection</h4>}
            <div className="grid w-full grid-cols-2 gap-2 sm:gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
              {visibleUncategorized.slice(0, uncategorizedShown).map((a) => <ArtCard key={a.id} asset={a} />)}
            </div>
            {visibleUncategorized.length > uncategorizedShown && (
              <button
                onClick={() => setUncategorizedShown((n) => n + UNCATEGORIZED_PAGE * 2)}
                className="mt-4 rounded-lg bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm ring-1 ring-gray-200 hover:bg-gray-50"
              >
                Show more ({(visibleUncategorized.length - uncategorizedShown).toLocaleString()} remaining)
              </button>
            )}
          </div>
        )}

        {textItems.length > 0 && (
          <button onClick={() => setShowText((v) => !v)} className="text-xs font-medium text-purple-700 hover:text-purple-900">
            {showText ? 'Hide text inscriptions' : `Show ${textItems.length.toLocaleString()} text inscriptions (mostly BRC-20 token records)`}
          </button>
        )}
      </div>
    </div>
  );
}

function CollectionBlock({ group, compact = false }: { group: CollectionGroup; compact?: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const shown = expanded ? group.items : group.items.slice(0, ITEMS_PER_COLLECTION);
  const hidden = group.count - shown.length;

  return (
    <div className="min-w-0 rounded-xl bg-white/60 p-3 sm:p-4">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <div className="min-w-0 break-words">
          <span className="font-semibold text-gray-900">{group.name}</span>
          <span className="ml-2 text-sm text-gray-500">{group.count.toLocaleString()} item{group.count === 1 ? '' : 's'}</span>
        </div>
        <div className="text-right text-sm">
          {group.valueUSD !== undefined ? (
            <>
              <span className="font-semibold tabular-nums text-gray-900">{formatUSD(group.valueUSD)}</span>
              <span className="ml-2 text-gray-500">floor {formatUSD(group.floorUSD ?? 0)}</span>
            </>
          ) : (
            <span className="text-gray-500">no floor price</span>
          )}
        </div>
      </div>

      <div className={`grid w-full grid-cols-2 gap-2 sm:gap-4 ${compact ? '' : 'sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6'}`}>
        {shown.length > 0
          ? shown.map((a) => <ArtCard key={a.id} asset={a} />)
          : group.sample && <NFTCard asset={{ ...group.sample, type: group.sample.chain === 'bitcoin' ? 'ordinal' : 'nft', name: group.name }} />}
      </div>

      {hidden > 0 && (
        <p className="mt-3 text-xs text-gray-500">
          {group.items.length > shown.length ? (
            <button onClick={() => setExpanded(true)} className="font-medium text-purple-700 hover:text-purple-900">
              Show all {group.items.length} loaded
            </button>
          ) : (
            `+${hidden.toLocaleString()} more in this collection`
          )}
        </p>
      )}
    </div>
  );
}
