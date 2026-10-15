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
          className="flex-1 min-w-0 rounded-xl border border-gray-200 bg-white px-4 py-3 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-purple-400"
        />
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Name (optional)"
          aria-label="Wallet name"
          maxLength={40}
          className="sm:w-48 rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400"
        />
        <button
          type="submit"
          disabled={!detected?.isValid}
          className="rounded-xl bg-gradient-to-r from-purple-600 to-pink-600 px-6 py-3 font-semibold text-white shadow-lg transition hover:from-purple-700 hover:to-pink-700 disabled:from-gray-300 disabled:to-gray-400 disabled:shadow-none"
        >
          Add wallet
        </button>
      </div>

      <p className={`text-xs ${error || (detected && !detected.isValid) ? 'text-red-600' : 'text-gray-500'}`}>
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
