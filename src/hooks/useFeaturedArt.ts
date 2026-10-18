'use client';

import { useCallback, useMemo, useSyncExternalStore } from 'react';
import { Asset } from '@/types';

/**
 * Which collectibles hang in the Overview frame. Until the viewer picks, the
 * top pieces by floor are in; each checkbox then records an explicit in/out
 * choice (stored in this browser only).
 */

const STORAGE_KEY = 'cpt.featuredArt.v1';
const AUTO_COUNT = 24;
const EMPTY: Record<string, boolean> = {};
let current: Record<string, boolean> | null = null;
const listeners = new Set<() => void>();

function load(): Record<string, boolean> {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}');
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function getSnapshot() {
  current ??= load();
  return current;
}

function save(next: Record<string, boolean>) {
  current = next;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // storage unavailable: keep for this session
  }
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const onStorage = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY) {
      current = load();
      listener();
    }
  };
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', onStorage);
  };
}

const collectionKey = (a: Asset) => (a.contractAddress ? `c:${a.contractAddress.toLowerCase()}` : `n:${a.collectionName}`);
const isTextInscription = (a: Asset) => /^text\/plain|json/i.test(a.contentType ?? '');

/** Displayable collectibles, highest collection floor first. */
export function artByFloor(assets: Asset[]): { asset: Asset; floor: number }[] {
  const floors = new Map<string, number>();
  for (const c of assets) {
    if (c.type !== 'collection' || c.valueUSD === undefined) continue;
    const perItem = c.valueUSD / (Number(c.balanceFormatted) || 1);
    floors.set(collectionKey(c), Math.max(floors.get(collectionKey(c)) ?? 0, perItem));
  }
  return assets
    .filter((a) => (a.type === 'nft' || a.type === 'ordinal') && a.imageUrl)
    .map((asset) => ({ asset, floor: floors.get(collectionKey(asset)) ?? 0 }))
    .sort((x, y) => y.floor - x.floor);
}

/** The raw in/out choices, for sync. */
export function useFeaturedChoices() {
  return useSyncExternalStore(subscribe, getSnapshot, () => EMPTY);
}

export function useFeaturedArt(assets: Asset[]) {
  const choices = useFeaturedChoices();

  // Default picks: best floors, skipping BRC-20 text records
  const autoIds = useMemo(
    () => new Set(artByFloor(assets).filter(({ asset }) => !isTextInscription(asset)).slice(0, AUTO_COUNT).map(({ asset }) => asset.id)),
    [assets]
  );

  const isFeatured = useCallback((a: Asset) => choices[a.id] ?? autoIds.has(a.id), [choices, autoIds]);
  const setFeatured = useCallback((id: string, featured: boolean) => save({ ...getSnapshot(), [id]: featured }), []);
  const reset = useCallback(() => save({}), []);

  return { isFeatured, setFeatured, reset, customized: Object.keys(choices).length > 0 };
}
