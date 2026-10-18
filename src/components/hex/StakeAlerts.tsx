'use client';

import { useEffect, useState } from 'react';
import { Asset } from '@/types';
import { chainLabel } from '@/config/chainDisplay';

type StakeAsset = Asset & { stake: NonNullable<Asset['stake']> };

const OPT_IN_KEY = 'cpt.notify.v1';
const SENT_KEY = 'cpt.notify.sent.v1';
const SOON_DAYS = 1;
const GRACE_WARNING_DAYS = 3;

function readSent(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(SENT_KEY) ?? '{}');
  } catch {
    return {};
  }
}

/** What needs attention: ending within a day, matured, or about to go late. */
function alertsFor(stakes: StakeAsset[]): { id: string; title: string; body: string }[] {
  return stakes.flatMap((a) => {
    const name = `HEX stake #${a.stake.stakeId} (${chainLabel(a.chain)})`;
    const { status, daysRemaining, graceDaysLeft } = a.stake;
    if (status === 'late') return [{ id: `${a.id}:late`, title: `${name} is accruing a late penalty`, body: 'End it as soon as possible.' }];
    if (status === 'matured' && (graceDaysLeft ?? 99) <= GRACE_WARNING_DAYS) {
      return [{ id: `${a.id}:grace`, title: `${name}: ${graceDaysLeft} days left to end without penalty`, body: 'The late-end penalty starts after the 14-day grace period.' }];
    }
    if (status === 'matured') return [{ id: `${a.id}:matured`, title: `${name} has matured`, body: `End it within ${graceDaysLeft} days to avoid the late penalty.` }];
    if (status === 'active' && daysRemaining <= SOON_DAYS) return [{ id: `${a.id}:soon`, title: `${name} ends tomorrow`, body: 'You can end it penalty-free once it matures.' }];
    return [];
  });
}

/**
 * Opt-in browser notifications for stakes that need action. They fire while
 * the dashboard is open, at most once per stake and alert type per day.
 */
export function StakeAlerts({ stakes }: { stakes: StakeAsset[] }) {
  const [enabled, setEnabled] = useState(false);
  const [supported, setSupported] = useState(true);

  // Read browser-only state after mount so server and client render the same markup
  useEffect(() => {
    const available = typeof window !== 'undefined' && 'Notification' in window;
    let optedIn = false;
    try {
      optedIn = localStorage.getItem(OPT_IN_KEY) === '1';
    } catch {
      // storage blocked: notifications stay off
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time sync from browser APIs
    setSupported(available);
    setEnabled(available && optedIn && Notification.permission === 'granted');
  }, []);

  useEffect(() => {
    if (!enabled) return;
    const today = new Date().toISOString().slice(0, 10);
    const sent = readSent();
    for (const alert of alertsFor(stakes)) {
      if (sent[alert.id] === today) continue;
      try {
        new Notification(alert.title, { body: alert.body, tag: alert.id });
        sent[alert.id] = today;
      } catch {
        // Some browsers only allow notifications from a service worker
      }
    }
    try {
      localStorage.setItem(SENT_KEY, JSON.stringify(sent));
    } catch {
      // ignore
    }
  }, [enabled, stakes]);

  if (!supported) return null;

  const toggle = async () => {
    if (enabled) {
      setEnabled(false);
      try { localStorage.removeItem(OPT_IN_KEY); } catch { /* ignore */ }
      return;
    }
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') return;
    try { localStorage.setItem(OPT_IN_KEY, '1'); } catch { /* ignore */ }
    setEnabled(true);
  };

  const pending = alertsFor(stakes).length;
  return (
    <button
      onClick={toggle}
      aria-pressed={enabled}
      className="inline-flex h-10 items-center gap-1.5 rounded-full bg-soft px-4 text-sm font-semibold text-ink hover:bg-line"
      title="Browser notifications while this dashboard is open"
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden="true"><path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.94 1.94 0 0 0 3.4 0" /></svg>
      {enabled ? 'Alerts on' : 'Stake alerts'}
      {pending > 0 && <span className="ml-1.5 rounded-full bg-warn-soft px-1.5 text-xs text-warn">{pending}</span>}
    </button>
  );
}
