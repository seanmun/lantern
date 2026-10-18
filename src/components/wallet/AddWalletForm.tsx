'use client';

import { FormEvent, useState } from 'react';
import { validateAddress } from '@/utils/address';
import { chainLabel } from '@/config/chainDisplay';
import { AddWalletResult } from '@/hooks/useWallets';

interface AddWalletFormProps {
  onAdd: (address: string, name?: string) => AddWalletResult;
}

export function AddWalletForm({ onAdd }: AddWalletFormProps) {
  const [address, setAddress] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);

  const detected = address.trim() ? validateAddress(address) : null;

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    const result = onAdd(address, name);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setAddress('');
    setName('');
    setError(null);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="flex flex-col sm:flex-row gap-3">
        <input
          value={address}
          onChange={(e) => { setAddress(e.target.value); setError(null); }}
          placeholder="Public address (0x…, bc1… or Solana)"
          spellCheck={false}
          autoComplete="off"
          aria-label="Wallet address"
          className="flex-1 min-w-0 rounded-xl border border-line bg-surface px-4 py-3 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-accent"
        />
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Name (optional)"
          aria-label="Wallet name"
          maxLength={40}
          className="sm:w-48 rounded-xl border border-line bg-surface px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-accent"
        />
        <button
          type="submit"
          disabled={!detected?.isValid}
          className="rounded-xl bg-ink px-6 py-3 font-bold text-on-ink transition hover:bg-ink/85 disabled:bg-line disabled:text-muted"
        >
          Add wallet
        </button>
      </div>

      <p className={`text-xs ${error || (detected && !detected.isValid) ? 'text-bad' : 'text-muted'}`}>
        {error
          ? error
          : detected?.isValid
            ? `Will track: ${detected.compatibleChains.map(chainLabel).join(', ')}`
            : detected
              ? 'Not a recognized EVM, Bitcoin or Solana address'
              : 'Public addresses only. Wallets are saved in this browser, never on a server.'}
      </p>
    </form>
  );
}
