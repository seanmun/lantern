'use client';

import { useEffect } from 'react';
import { useWallets } from '@/hooks/useWallets';
import { useHiddenTokens, useTrustedTokens } from '@/hooks/useHiddenTokens';
import { useFeaturedChoices } from '@/hooks/useFeaturedArt';
import { hasLocalChanges, syncNow, useSync } from '@/hooks/useSync';

const PULL_EVERY_MS = 2 * 60_000;
const PUSH_DEBOUNCE_MS = 1500;

/**
 * Keeps a linked browser in sync from any page: checks the stored copy on
 * load, when the tab comes back into view and every couple of minutes, and
 * sends local edits shortly after they happen. Renders nothing.
 */
export function SyncAgent() {
  const { code } = useSync();
  const { wallets } = useWallets();
  const { hidden } = useHiddenTokens();
  const { trusted } = useTrustedTokens();
  const featured = useFeaturedChoices();

  useEffect(() => {
    if (!code) return;
    const pull = () => {
      if (!document.hidden) syncNow().catch(() => undefined);
    };
    pull();
    const timer = setInterval(pull, PULL_EVERY_MS);
    document.addEventListener('visibilitychange', pull);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', pull);
    };
  }, [code]);

  useEffect(() => {
    if (!code || !hasLocalChanges()) return;
    const timer = setTimeout(() => syncNow().catch(() => undefined), PUSH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [code, wallets, hidden, trusted, featured]);

  return null;
}
