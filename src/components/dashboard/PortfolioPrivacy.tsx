'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import { usePortfolioContext } from '@/components/app/PortfolioProvider';
import { checkedLabel, privacyChainOf, privacyKey, recheckPrivacy, scoringContext, usePrivacyFactsMany } from '@/hooks/usePrivacyFacts';
import { privacyScore, PrivacyScore } from '@/utils/privacyScore';
import { PRIVACY_TONE } from '@/components/wallet/PrivacyBadge';

const RING: Record<PrivacyScore['band'], string> = { exposed: 'var(--color-down)', partial: 'var(--color-warn-solid)', private: 'var(--color-up)' };
const share = (w: number) => (w > 0 && w < 0.01 ? '<1%' : `${Math.round(w * 100)}%`);
const bandOf = (score: number): PrivacyScore['band'] => (score >= 70 ? 'private' : score >= 40 ? 'partial' : 'exposed');

/**
 * The portfolio's privacy at a glance: each wallet's score weighted by its
 * share of the total value, since a leaky wallet matters more the more it
 * holds. Scored in the browser, like each wallet's own score.
 */
export function PortfolioPrivacy() {
  const { wallets, walletTotals, walletLoading, assets } = usePortfolioContext();
  const items = useMemo(() => wallets.map((w) => ({ wallet: w, address: w.address, chain: privacyChainOf(w.address, w.chains) })), [wallets]);
  const facts = usePrivacyFactsMany(items);

  const summary = useMemo(() => {
    const addresses = wallets.map((w) => w.address.toLowerCase());
    const scored = items
      .map((i) => {
        const key = i.chain ? privacyKey(i.address, i.chain) : '';
        const saved = i.chain ? facts.get(key)?.facts : null;
        if (!saved) return null;
        // Before balances load, score with the value seen last visit, so the saved score shows at once
        const live = {
          valueUSD: walletTotals.get(i.wallet.id) ?? 0,
          nftCount: assets.filter((a) => a.walletAddress === i.address && (a.type === 'nft' || a.type === 'ordinal')).length,
        };
        const ctx = scoringContext(key, live, !walletLoading.has(i.wallet.id));
        if (!ctx) return null;
        const result = privacyScore(saved, { otherWallets: addresses.filter((a) => a !== i.address.toLowerCase()), ...ctx });
        return { wallet: i.wallet, value: ctx.valueUSD, score: result.score };
      })
      .filter((w): w is NonNullable<typeof w> => !!w);
    const totalValue = scored.reduce((s, w) => s + w.value, 0);
    // No value yet (or all empty): every wallet counts the same
    const weight = (w: { value: number }) => (totalValue > 0 ? w.value / totalValue : 1 / scored.length);
    const score = scored.length ? Math.round(scored.reduce((s, w) => s + w.score * weight(w), 0)) : null;
    // The wallet costing the most: lowest score times its weight
    const worst = [...scored].sort((a, b) => (100 - b.score) * weight(b) - (100 - a.score) * weight(a))[0];
    const entryOf = (i: (typeof items)[number]) => (i.chain ? facts.get(privacyKey(i.address, i.chain)) : undefined);
    const checkedTimes = items.map((i) => entryOf(i)?.checkedAt).filter((t): t is number => !!t);
    return {
      scored, score, worst, weight,
      scorable: items.filter((i) => i.chain).length,
      // Never read at all (a failed re-check keeps its saved score)
      unreadable: items.filter((i) => entryOf(i)?.failed && !entryOf(i)?.facts).length,
      refreshFailed: items.filter((i) => entryOf(i)?.failed && entryOf(i)?.facts).length,
      checking: items.filter((i) => entryOf(i)?.checking).length,
      // The oldest check is the honest date for the total
      checkedAt: checkedTimes.length ? Math.min(...checkedTimes) : null,
    };
  }, [items, facts, wallets, walletTotals, walletLoading, assets]);

  if (summary.scorable === 0) return null;
  const firstRun = summary.scored.length < summary.scorable - summary.unreadable;
  const recheckAll = () => items.forEach((i) => i.chain && recheckPrivacy(i.address, i.chain));
  const band = summary.score !== null ? bandOf(summary.score) : null;

  return (
    <section aria-labelledby="privacy-total-h" className="mt-4 rounded-3xl border border-line p-5">
      <div className="flex items-center justify-between">
        <h2 id="privacy-total-h" className="text-lg font-extrabold text-ink">Privacy</h2>
        {summary.checking > 0 && (
          <span className="text-[13px] text-muted" aria-live="polite">
            {firstRun ? `Scoring ${summary.scored.length + 1} of ${summary.scorable}…` : `Re-checking ${summary.checking} wallet${summary.checking === 1 ? '' : 's'}…`}
          </span>
        )}
      </div>

      {summary.score === null || !band ? (
        <p className="mt-3 text-[15px] text-muted">Looking at what your wallets reveal…</p>
      ) : (
        <>
          <div className="mt-3 flex items-center gap-4">
            <div className="relative h-16 w-16 shrink-0" role="img" aria-label={`Portfolio privacy ${summary.score} out of 100, ${PRIVACY_TONE[band].label}`}>
              <svg viewBox="0 0 36 36" className="h-16 w-16 -rotate-90" aria-hidden="true">
                <circle cx="18" cy="18" r="15.5" fill="none" stroke="var(--color-line)" strokeWidth="3.4" />
                <circle cx="18" cy="18" r="15.5" fill="none" stroke={RING[band]} strokeWidth="3.4" strokeLinecap="round" strokeDasharray={`${(summary.score / 100) * 97.4} 97.4`} />
              </svg>
              <span className="absolute inset-0 flex items-center justify-center text-xl font-extrabold tabular-nums text-ink">{summary.score}</span>
            </div>
            <div className="min-w-0">
              <div className={`font-extrabold ${band === 'exposed' ? 'text-bad' : band === 'partial' ? 'text-warn' : 'text-good'}`}>{PRIVACY_TONE[band].label}</div>
              <p className="text-[13px] leading-snug text-muted">
                Weighted by value across {summary.scored.length} wallet{summary.scored.length === 1 ? '' : 's'}.
                {summary.worst && summary.scored.length > 1 && summary.worst.score < 70 && (
                  <> {summary.worst.wallet.name} costs the most: it scores {summary.worst.score} and holds {Math.round(summary.weight(summary.worst) * 100)}% of the value.</>
                )}
              </p>
            </div>
          </div>
          <ul className="mt-3">
            {[...summary.scored].sort((a, b) => b.value - a.value).map((w) => (
              <li key={w.wallet.id} className="border-t border-line">
                <Link href={`/check?q=${encodeURIComponent(w.wallet.address)}#privacy`} className="flex items-center gap-3 py-2.5 text-sm hover:opacity-80">
                  <span className="min-w-0 flex-1 truncate font-semibold text-ink">{w.wallet.name}</span>
                  <span className="tabular-nums text-muted">{share(summary.weight(w))}</span>
                  <span className={`inline-flex h-6 min-w-[2.5rem] items-center justify-center rounded-full px-2 text-xs font-bold tabular-nums ring-1 ${PRIVACY_TONE[bandOf(w.score)].className}`}>{w.score}</span>
                </Link>
              </li>
            ))}
          </ul>
          {summary.unreadable > 0 && <p className="mt-1 text-[13px] text-muted">{summary.unreadable} wallet{summary.unreadable === 1 ? '' : 's'} couldn&apos;t be read right now and {summary.unreadable === 1 ? 'is' : 'are'} left out.</p>}
          {summary.refreshFailed > 0 && summary.checking === 0 && <p className="mt-1 text-[13px] text-muted">The last re-check couldn&apos;t reach {summary.refreshFailed === 1 ? 'one wallet' : `${summary.refreshFailed} wallets`}; {summary.refreshFailed === 1 ? 'its' : 'their'} previous score is shown.</p>}
          <div className="mt-3 flex items-center justify-between gap-3 border-t border-line pt-3 text-[13px] text-muted">
            <span>{summary.checkedAt ? checkedLabel(summary.checkedAt) : ' '}</span>
            <button
              type="button"
              onClick={recheckAll}
              disabled={summary.checking > 0}
              className="rounded-full bg-soft px-3 py-1.5 font-bold text-ink ring-1 ring-line hover:bg-line disabled:opacity-50"
            >
              {summary.checking > 0 ? 'Checking…' : 'Re-check'}
            </button>
          </div>
        </>
      )}
    </section>
  );
}
