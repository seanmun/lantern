'use client';

import { KeyboardEvent, useState } from 'react';
import { Wallet } from '@/types';
import { shortAddress } from '@/utils/address';
import { formatUSD } from '@/utils/prices';

interface WalletListProps {
  wallets: Wallet[];
  totals: Map<string, number>;
  loading: Set<string>;
  onRename: (id: string, name: string) => void;
  onRemove: (id: string) => void;
}

export function WalletList({ wallets, totals, loading, onRename, onRemove }: WalletListProps) {
  return (
    <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {wallets.map((wallet) => (
        <WalletCard
          key={wallet.id}
          wallet={wallet}
          total={totals.get(wallet.id) ?? 0}
          isLoading={loading.has(wallet.id)}
          onRename={onRename}
          onRemove={onRemove}
        />
      ))}
    </ul>
  );
}

interface WalletCardProps {
  wallet: Wallet;
  total: number;
  isLoading: boolean;
  onRename: (id: string, name: string) => void;
  onRemove: (id: string) => void;
}

function WalletCard({ wallet, total, isLoading, onRename, onRemove }: WalletCardProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(wallet.name);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [copied, setCopied] = useState(false);

  const save = () => {
    onRename(wallet.id, draft);
    setEditing(false);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') save();
    if (event.key === 'Escape') {
      setDraft(wallet.name);
      setEditing(false);
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(wallet.address);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard blocked; the full address is still in the title tooltip
    }
  };

  return (
    <li className="rounded-xl border border-white/40 bg-white/80 p-4 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          {editing ? (
            <input
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onFocus={(e) => e.target.select()}
              onBlur={save}
              onKeyDown={onKeyDown}
              maxLength={40}
              aria-label="Wallet name"
              className="w-full rounded-md border border-purple-300 px-2 py-0.5 font-semibold text-gray-900 focus:outline-none focus:ring-2 focus:ring-purple-400"
            />
          ) : (
            <button
              onClick={() => { setDraft(wallet.name); setEditing(true); }}
              title="Rename"
              className="max-w-full truncate text-left font-semibold text-gray-900 hover:text-purple-700"
            >
              {wallet.name}
            </button>
          )}
          <button
            onClick={copy}
            title={wallet.address}
            className="mt-0.5 block font-mono text-xs text-gray-500 hover:text-gray-800"
          >
            {copied ? 'Copied!' : shortAddress(wallet.address)}
          </button>
        </div>

        {confirmRemove ? (
          <div className="flex shrink-0 gap-1 text-xs">
            <button onClick={() => onRemove(wallet.id)} className="rounded-md bg-red-600 px-2 py-1 font-medium text-white hover:bg-red-700">
              Remove
            </button>
            <button onClick={() => setConfirmRemove(false)} className="rounded-md bg-gray-100 px-2 py-1 text-gray-700 hover:bg-gray-200">
              Cancel
            </button>
          </div>
        ) : (
          <button
            onClick={() => setConfirmRemove(true)}
            aria-label={`Remove ${wallet.name}`}
            className="shrink-0 rounded-md px-2 py-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
          >
            ✕
          </button>
        )}
      </div>

      <div className="mt-3 flex items-end justify-between">
        <span className="text-xs text-gray-500">{wallet.chains.length} chain{wallet.chains.length === 1 ? '' : 's'}</span>
        <span className="text-lg font-bold text-gray-900">
          {isLoading ? <span className="text-sm font-normal text-gray-400">Loading…</span> : formatUSD(total)}
        </span>
      </div>
    </li>
  );
}
