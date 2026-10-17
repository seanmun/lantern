'use client';

import { usePortfolioContext } from '@/components/app/PortfolioProvider';
import { NoWallets, PageHeader } from '@/components/app/AppShell';
import { CollectiblesGallery } from '@/components/portfolio/CollectiblesGallery';

export default function CollectiblesPage() {
  const { wallets, assets, featuredArt, isLoading } = usePortfolioContext();
  const hasArt = assets.some((a) => a.type === 'nft' || a.type === 'ordinal');
  return (
    <>
      <PageHeader title="Collectibles" subtitle="NFTs and Ordinals by collection. Tick “In frame” to hang a piece on the dashboard." />
      {wallets.length === 0 ? <NoWallets what="your NFTs and Ordinals" /> : hasArt ? (
        <CollectiblesGallery
          assets={assets}
          isFeatured={featuredArt.isFeatured}
          onFeaturedChange={featuredArt.setFeatured}
          onResetFeatured={featuredArt.reset}
          featuredCustomized={featuredArt.customized}
        />
      ) : (
        <p className="text-gray-500">{isLoading ? 'Loading…' : 'No NFTs or Ordinals in these wallets.'}</p>
      )}
    </>
  );
}
