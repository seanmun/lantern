'use client';

import Link from 'next/link';
import { privacyChainOf, usePrivacyFacts } from '@/hooks/usePrivacyFacts';
import { privacyScore } from '@/utils/privacyScore';
import { Wallet } from '@/types';

export const PRIVACY_TONE = {
  exposed: { label: 'Exposed', className: 'bg-bad-soft text-bad ring-bad-line' },
  partial: { label: 'Partly private', className: 'bg-warn-soft text-warn ring-warn-line' },
  private: { label: 'Private', className: 'bg-good-soft text-good ring-good-line' },
} as const;

/**
 * A wallet's privacy score as a small badge; it opens the full breakdown on
 * /check. The score is computed here in the browser, so links to the
 * viewer's other wallets never leave it.
 */
export function PrivacyBadge({ wallet, valueUSD, nftCount, ready, otherWallets }: { wallet: Wallet; valueUSD: number; nftCount: number; ready: boolean; otherWallets: string[] }) {
  const chain = privacyChainOf(wallet.address, wallet.chains);
  const { facts, failed } = usePrivacyFacts(wallet.address, chain);
  if (!chain) return null;
  const href = `/check?q=${encodeURIComponent(wallet.address)}#privacy`;
  if (failed) return null;
  if (!facts || !ready) {
    return <span className="inline-flex h-6 items-center rounded-full bg-soft px-2.5 text-xs font-semibold text-muted">Privacy…</span>;
  }
  const { score, band, linked } = privacyScore(facts, { otherWallets, valueUSD, nftCount });
  const tone = PRIVACY_TONE[band];
  return (
    <Link
      href={href}
      title={`${tone.label}${linked.count ? `, likely tied to ${linked.count} other ${linked.unit === 'address' ? (linked.count === 1 ? 'address' : 'addresses') : linked.count === 1 ? 'wallet' : 'wallets'}` : ''}. See why`}
      className={`inline-flex h-6 items-center gap-1 rounded-full px-2.5 text-xs font-bold tabular-nums ring-1 hover:opacity-85 ${tone.className}`}
    >
      Privacy {score}
      <span aria-hidden="true">›</span>
    </Link>
  );
}
