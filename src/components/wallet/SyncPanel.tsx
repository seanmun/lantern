'use client';

import { FormEvent, useState } from 'react';
import { createSyncCode, deleteSyncedCopy, joinSyncCode, leaveSync, syncNow, useSync } from '@/hooks/useSync';
import { formatSyncCode } from '@/utils/syncCode';

function ago(ms: number): string {
  const s = Math.max(0, Math.round((Date.now() - ms) / 1000));
  if (s < 45) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86_400) return `${Math.round(s / 3600)} h ago`;
  return new Date(ms).toLocaleDateString();
}

const button = 'inline-flex h-11 items-center justify-center rounded-xl px-5 text-sm font-bold transition disabled:opacity-50';
const primary = `${button} bg-ink text-on-ink hover:bg-ink/85`;
const secondary = `${button} bg-soft text-ink ring-1 ring-line hover:bg-line`;
const quiet = 'text-sm font-semibold text-muted underline-offset-4 hover:text-ink hover:underline disabled:opacity-50';

/** Enter a code from another device. Used on the Wallets page and the empty dashboard. */
export function SyncJoinForm({ onCancel, showError = false }: { onCancel?: () => void; showError?: boolean }) {
  const { busy, error } = useSync();
  const [input, setInput] = useState('');

  const join = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await joinSyncCode(input);
      setInput('');
    } catch {
      // error is shown from the store
    }
  };

  return (
    <div className="mt-5">
      <form onSubmit={join} className="flex flex-col gap-3 sm:flex-row">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="XXXX-XXXX-XXXX"
          aria-label="Sync code"
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          autoFocus
          className="min-w-0 flex-1 rounded-xl border border-line bg-surface px-4 py-3 font-mono text-base tracking-widest text-ink uppercase focus:outline-none focus:ring-2 focus:ring-accent sm:max-w-xs"
        />
        <button type="submit" disabled={busy || !input.trim()} className={primary}>
          {busy ? 'Unlocking…' : 'Connect'}
        </button>
        {onCancel && (
          <button type="button" onClick={onCancel} className={secondary}>
            Cancel
          </button>
        )}
      </form>
      <p className="mt-3 text-[13px] text-muted">Wallets already in this browser are kept and added to the synced set.</p>
      {showError && error && (
        <p role="alert" className="mt-2 text-sm text-bad">
          {error}
        </p>
      )}
    </div>
  );
}

/**
 * Sync codes on the Wallets page: create one, enter one from another device,
 * and see or stop the link. The code is the only key to the synced copy.
 */
export function SyncPanel() {
  const { code, syncedAt, busy, error, missing } = useSync();
  const [mode, setMode] = useState<'idle' | 'join' | 'confirm-delete'>('idle');
  const [shown, setShown] = useState(false);
  const [copied, setCopied] = useState(false);

  const create = async () => {
    try {
      await createSyncCode();
      setShown(true);
    } catch {
      // error is shown from the store
    }
  };

  const copy = async () => {
    if (!code) return;
    try {
      await navigator.clipboard.writeText(formatSyncCode(code));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setShown(true); // clipboard blocked: show it to copy by hand
    }
  };

  const remove = async () => {
    try {
      await deleteSyncedCopy();
      setMode('idle');
      setShown(false);
    } catch {
      // error is shown from the store
    }
  };

  return (
    <section id="sync" aria-labelledby="sync-h" className="mt-6 scroll-mt-24 rounded-3xl border border-line bg-surface p-6 sm:p-8">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="sync-h" className="text-xl font-extrabold tracking-tight text-ink">Use on another device</h2>
        {code && (
          <span className="text-sm text-muted" aria-live="polite">
            {busy ? 'Syncing…' : syncedAt ? `Synced ${ago(syncedAt)}` : 'Linked'}
          </span>
        )}
      </div>

      {!code ? (
        <>
          <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-muted">
            Get a sync code, then enter it in another browser or on your phone. Your wallets, hidden tokens and frame picks follow,
            and stay up to date both ways. No email and no account: everything is encrypted in this browser first, so Lantern&apos;s
            server only stores scrambled data it can&apos;t read.
          </p>
          {mode === 'join' ? (
            <SyncJoinForm onCancel={() => setMode('idle')} />
          ) : (
            <div className="mt-5 flex flex-wrap gap-3">
              <button onClick={create} disabled={busy} className={primary}>
                {busy ? 'Creating…' : 'Create sync code'}
              </button>
              <button onClick={() => setMode('join')} disabled={busy} className={secondary}>
                I have a code
              </button>
            </div>
          )}
        </>
      ) : (
        <>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <code className="rounded-xl bg-soft px-4 py-2.5 font-mono text-lg font-bold tracking-widest text-ink ring-1 ring-line">
              {shown ? formatSyncCode(code) : '••••-••••-' + code.slice(8)}
            </code>
            <button onClick={() => setShown((s) => !s)} className={secondary}>
              {shown ? 'Hide' : 'Show'}
            </button>
            <button onClick={copy} className={secondary}>
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
          <p className="mt-3 max-w-2xl text-[13px] leading-relaxed text-muted">
            Enter this code on the Wallets page of another browser. Treat it like a password: anyone with it can see which wallets you
            track. Lantern can&apos;t recover it, so keep it somewhere safe. It isn&apos;t needed in this browser again.
          </p>

          {missing && (
            <p className="mt-4 rounded-xl border border-warn-line bg-warn-soft px-4 py-3 text-sm text-warn">
              The synced copy for this code was deleted, probably from another device. Your data here is untouched.
              Stop syncing below, then create a new code if you still want one.
            </p>
          )}

          {mode === 'confirm-delete' ? (
            <div className="mt-5 rounded-xl border border-bad-line bg-bad-soft p-4">
              <p className="text-sm text-bad">
                Delete the synced copy for every device? Each browser keeps what it has, but they stop updating each other.
              </p>
              <div className="mt-3 flex flex-wrap gap-3">
                <button onClick={remove} disabled={busy} className={`${button} bg-down text-white hover:opacity-90`}>
                  {busy ? 'Deleting…' : 'Delete synced copy'}
                </button>
                <button onClick={() => setMode('idle')} className={secondary}>
                  Keep it
                </button>
              </div>
            </div>
          ) : (
            <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2">
              <button onClick={() => syncNow().catch(() => undefined)} disabled={busy} className={quiet}>
                Sync now
              </button>
              <button onClick={leaveSync} disabled={busy} className={quiet}>
                Stop syncing in this browser
              </button>
              <button onClick={() => setMode('confirm-delete')} disabled={busy} className={quiet}>
                Delete synced copy
              </button>
            </div>
          )}
        </>
      )}

      {error && (
        <p role="alert" className="mt-4 text-sm text-bad">
          {error}
        </p>
      )}
    </section>
  );
}
