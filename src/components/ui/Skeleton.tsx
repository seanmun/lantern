import React from 'react';

interface SkeletonProps {
  className?: string;
  variant?: 'text' | 'circular' | 'rectangular';
  width?: string | number;
  height?: string | number;
  animation?: 'pulse' | 'wave' | 'none';
}

export function Skeleton({
  className = '',
  variant = 'text',
  width,
  height,
  animation = 'pulse'
}: SkeletonProps) {
  const baseClasses = 'bg-line';

  const animationClasses = {
    pulse: 'animate-pulse',
    wave: 'animate-shimmer',
    none: ''
  };

  const variantClasses = {
    text: 'rounded',
    circular: 'rounded-full',
    rectangular: 'rounded-md'
  };

  const style: React.CSSProperties = {
    width: width || (variant === 'circular' ? 40 : '100%'),
    height: height || (variant === 'text' ? 20 : variant === 'circular' ? 40 : 100)
  };

  return (
    <div
      className={`${baseClasses} ${variantClasses[variant]} ${animationClasses[animation]} ${className}`}
      style={style}
    />
  );
}

export function AssetCardSkeleton() {
  return (
    <div className="border rounded-lg p-4">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center space-x-3 mb-2">
            <Skeleton variant="circular" width={40} height={40} />
            <div className="flex-1">
              <Skeleton width="60%" height={20} className="mb-2" />
              <Skeleton width="30%" height={16} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 mt-4">
            <Skeleton width="100%" height={16} />
            <Skeleton width="100%" height={16} />
          </div>
        </div>
      </div>
    </div>
  );
}

export function ChainSectionSkeleton() {
  return (
    <div className="bg-white border rounded-lg p-6">
      <div className="flex items-center mb-4">
        <Skeleton variant="circular" width={16} height={16} className="mr-3" />
        <Skeleton width={200} height={24} />
      </div>
      <div className="space-y-3">
        <AssetCardSkeleton />
        <AssetCardSkeleton />
        <AssetCardSkeleton />
      </div>
    </div>
  );
}

export function NFTGridSkeleton({ count = 12 }: { count?: number }) {
  return (
    <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3">
      {Array.from({ length: count }).map((_, i) => (
        <Skeleton key={i} variant="rectangular" className="aspect-square" />
      ))}
    </div>
  );
}