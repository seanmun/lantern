'use client';

import { useSyncExternalStore } from 'react';
import { Wallet } from '@/types';
import { decryptSync, deriveSyncKeys, encryptSync, generateSyncCode, normalizeSyncCode } from '@/utils/syncCode';

/**
 * Sync codes: the same wallets and choices in every browser, with no account.
 *
 * Synced: tracked wallets, hidden and trusted tokens, and the frame's picks,
 * i.e. the localStorage keys below. They are encrypted in the browser with a
 * key derived from the code; the server stores ciphertext it can't read.
 *
 * Reconciling: the newest copy wins. If both this browser and the stored copy
 * changed since the last sync, they are merged (wallets by address, token
 * lists by union), so an edit on either side is never silently lost.
 */

const STATE_KEY = 'lantern.sync.v1';
const KEYS = {
  wallets: 'cpt.wallets.v1',
  hidden: 'cpt.hiddenTokens.v1',
  trusted: 'cpt.trustedTokens.v1',
  featured: 'cpt.featuredArt.v1',
} as const;

export interface SyncData {
  wallets: Wallet[];
  hidden: string[];
  trusted: string[];
  featured: Record<string, boolean>;
}

interface Envelope {
  v: 1;
  updatedAt: number;
  data: SyncData;
}

interface Linked {
  code: string;
  syncedAt: number; // updatedAt of the copy last agreed on
  fingerprint: string; // this browser's data at that moment
}

export interface SyncSnapshot {
  code: string | null;
  syncedAt: number;
  busy: boolean;
  error: string | null;
  /** The stored copy is gone (deleted from another device). */
  missing: boolean;
}

// ---------------------------------------------------------------- local data

const parse = <T,>(raw: string | null, fallback: T, ok: (v: unknown) => boolean): T => {
  try {
    const v = JSON.parse(raw ?? 'null');
    return ok(v) ? (v as T) : fallback;
  } catch {
    return fallback;
  }
};
const isRecord = (v: unknown) => !!v && typeof v === 'object' && !Array.isArray(v);

function clean(d: Partial<SyncData> | undefined): SyncData {
  return {
    wallets: Array.isArray(d?.wallets) ? d.wallets.filter((w) => w && typeof w.address === 'string' && typeof w.id === 'string') : [],
    hidden: Array.isArray(d?.hidden) ? d.hidden.filter((s) => typeof s === 'string') : [],
    trusted: Array.isArray(d?.trusted) ? d.trusted.filter((s) => typeof s === 'string') : [],
    featured: isRecord(d?.featured) ? (d!.featured as Record<string, boolean>) : {},
  };
}

export function readLocalData(): SyncData {
  return clean({
    wallets: parse(localStorage.getItem(KEYS.wallets), [], Array.isArray),
    hidden: parse(localStorage.getItem(KEYS.hidden), [], Array.isArray),
    trusted: parse(localStorage.getItem(KEYS.trusted), [], Array.isArray),
    featured: parse(localStorage.getItem(KEYS.featured), {}, isRecord),
  });
}

/** Writes each key and tells this tab's stores, which reload on a storage event (other tabs get one natively). */
function writeLocalData(d: SyncData) {
  for (const [name, storageKey] of Object.entries(KEYS) as [keyof SyncData, string][]) {
    const value = JSON.stringify(d[name]);
    if (localStorage.getItem(storageKey) === value) continue;
    localStorage.setItem(storageKey, value);
    window.dispatchEvent(new StorageEvent('storage', { key: storageKey, newValue: value }));
  }
}

const fingerprint = (d: SyncData) => JSON.stringify(d);

const walletKey = (w: Wallet) => (w.address.startsWith('0x') ? w.address.toLowerCase() : w.address);

export function mergeData(a: SyncData, b: SyncData): SyncData {
  const wallets = new Map<string, Wallet>();
  for (const w of [...a.wallets, ...b.wallets]) {
    const k = walletKey(w);
    const prev = wallets.get(k);
    if (!prev || w.updatedAt > prev.updatedAt) wallets.set(k, prev ? { ...w, id: prev.id } : w);
  }
  return {
    wallets: [...wallets.values()],
    hidden: [...new Set([...a.hidden, ...b.hidden])],
    trusted: [...new Set([...a.trusted, ...b.trusted])],
    featured: { ...b.featured, ...a.featured },
  };
}

// ---------------------------------------------------------------- store

let linked: Linked | null = null;
let loaded = false;
let snap: SyncSnapshot = { code: null, syncedAt: 0, busy: false, error: null, missing: false };
const OFF: SyncSnapshot = snap;
const listeners = new Set<() => void>();

function loadLinked() {
  if (loaded) return;
  loaded = true;
  try {
    const v = JSON.parse(localStorage.getItem(STATE_KEY) ?? 'null');
    if (v && typeof v.code === 'string' && normalizeSyncCode(v.code)) linked = v;
  } catch {
    // no saved code
  }
  snap = { ...snap, code: linked?.code ?? null, syncedAt: linked?.syncedAt ?? 0 };
}

function setLinked(next: Linked | null) {
  linked = next;
  try {
    if (next) localStorage.setItem(STATE_KEY, JSON.stringify(next));
    else localStorage.removeItem(STATE_KEY);
  } catch {
    // storage unavailable: sync lasts for this session
  }
  update({ code: next?.code ?? null, syncedAt: next?.syncedAt ?? 0 });
}

function update(patch: Partial<SyncSnapshot>) {
  snap = { ...snap, ...patch };
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  // Another tab linked, unlinked or synced
  const onStorage = (e: StorageEvent) => {
    if (e.key !== STATE_KEY) return;
    loaded = false;
    linked = null;
    loadLinked();
    listener();
  };
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', onStorage);
  };
}

function getSnapshot() {
  loadLinked();
  return snap;
}

export function useSync(): SyncSnapshot {
  return useSyncExternalStore(subscribe, getSnapshot, () => OFF);
}

// ---------------------------------------------------------------- server

class SyncError extends Error {}

async function api(id: string, init?: RequestInit): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(`/api/sync/${id}`, { cache: 'no-store', ...init });
  } catch {
    throw new SyncError('Offline. Changes will sync when you reconnect.');
  }
  if (res.status === 429) throw new SyncError('Too many sync requests. Try again in a few minutes.');
  if (!res.ok && res.status !== 404) throw new SyncError('Sync is unavailable right now. Your data is safe in this browser.');
  return res;
}

async function fetchRemote(code: string): Promise<Envelope | null> {
  const keys = await deriveSyncKeys(code);
  const res = await api(keys.id);
  if (res.status === 404) return null;
  const { blob } = (await res.json()) as { blob: string };
  try {
    const env = await decryptSync<Envelope>(keys, blob);
    return { v: 1, updatedAt: Number(env.updatedAt) || 0, data: clean(env.data) };
  } catch {
    throw new SyncError('Could not unlock the synced copy with this code.');
  }
}

async function pushRemote(code: string, data: SyncData): Promise<number> {
  const keys = await deriveSyncKeys(code);
  const updatedAt = Date.now();
  const blob = await encryptSync(keys, { v: 1, updatedAt, data } satisfies Envelope);
  await api(keys.id, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ blob }) });
  return updatedAt;
}

// ---------------------------------------------------------------- actions

// One operation at a time, in order
let queue: Promise<unknown> = Promise.resolve();
function run<T>(task: () => Promise<T>): Promise<T> {
  const next = queue.then(async () => {
    update({ busy: true });
    try {
      const result = await task();
      update({ busy: false, error: null });
      return result;
    } catch (error) {
      update({ busy: false, error: error instanceof SyncError ? error.message : 'Sync failed. Your data is safe in this browser.' });
      throw error;
    }
  });
  queue = next.catch(() => undefined);
  return next;
}

/** Brings this browser and the stored copy into agreement. Safe to call often. */
export function syncNow(): Promise<void> {
  return run(async () => {
    loadLinked();
    if (!linked) return;
    const { code } = linked;
    const local = readLocalData();
    const localFp = fingerprint(local);
    const localChanged = localFp !== linked.fingerprint;
    const remote = await fetchRemote(code);

    if (!remote) {
      update({ missing: true });
      return;
    }
    update({ missing: false });
    const remoteFp = fingerprint(remote.data);
    if (remoteFp === localFp) {
      setLinked({ code, syncedAt: Math.max(remote.updatedAt, linked.syncedAt), fingerprint: localFp });
      return;
    }
    const remoteChanged = remote.updatedAt > linked.syncedAt;
    if (remoteChanged && !localChanged) {
      writeLocalData(remote.data);
      setLinked({ code, syncedAt: remote.updatedAt, fingerprint: fingerprint(readLocalData()) });
      return;
    }
    const next = remoteChanged ? mergeData(local, remote.data) : local;
    if (remoteChanged) writeLocalData(next);
    const syncedAt = await pushRemote(code, next);
    setLinked({ code, syncedAt, fingerprint: fingerprint(readLocalData()) });
  });
}

/** Starts syncing this browser under a fresh code. */
export function createSyncCode(): Promise<string> {
  return run(async () => {
    const code = generateSyncCode().replace(/-/g, '');
    const local = readLocalData();
    const syncedAt = await pushRemote(code, local);
    setLinked({ code, syncedAt, fingerprint: fingerprint(local) });
    update({ missing: false });
    return code;
  });
}

/** Links this browser to an existing code, merging what's here into it. */
export function joinSyncCode(input: string): Promise<void> {
  return run(async () => {
    const code = normalizeSyncCode(input);
    if (!code) throw new SyncError('That doesn’t look like a sync code. It has 12 letters and numbers, like K7QM-2XRP-9TDA.');
    const remote = await fetchRemote(code);
    if (!remote) throw new SyncError('No synced copy found for that code. Check it, or create a new one.');
    const next = mergeData(readLocalData(), remote.data);
    writeLocalData(next);
    const merged = readLocalData();
    const syncedAt = fingerprint(merged) === fingerprint(remote.data) ? remote.updatedAt : await pushRemote(code, merged);
    setLinked({ code, syncedAt, fingerprint: fingerprint(merged) });
    update({ missing: false });
  });
}

/** Stops syncing in this browser. Local data and the stored copy both stay. */
export function leaveSync() {
  setLinked(null);
  update({ error: null, missing: false });
}

/** Deletes the stored copy for every device, then stops syncing here. Local data stays. */
export function deleteSyncedCopy(): Promise<void> {
  return run(async () => {
    loadLinked();
    if (!linked) return;
    const keys = await deriveSyncKeys(linked.code);
    await api(keys.id, { method: 'DELETE' });
    leaveSync();
  });
}

/** True when this browser has changes the stored copy hasn't seen. */
export function hasLocalChanges(): boolean {
  loadLinked();
  return !!linked && fingerprint(readLocalData()) !== linked.fingerprint;
}
