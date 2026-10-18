'use client';

import { useMemo, useState } from 'react';
import { usePortfolioContext } from '@/components/app/PortfolioProvider';
import { NoWallets, PageHeader } from '@/components/app/AppShell';
import { Tx, TxType, useTransactions } from '@/hooks/useTransactions';
import { chainLabel } from '@/config/chainDisplay';
import { normalizeAddress, shortAddress } from '@/utils/address';
import { formatUSD } from '@/utils/prices';

const TYPE_LABEL: Record<TxType, string> = {
  receive: 'Received', send: 'Sent', swap: 'Swap', stake: 'Staking', approval: 'Approval', contract: 'Contract', nft: 'NFT',
};
const TYPE_STYLE: Record<TxType, { icon: string; className: string }> = {
  receive: { icon: '↓', className: 'bg-good-soft text-good' },
  send: { icon: '↑', className: 'bg-warn-soft text-warn' },
  swap: { icon: '⇄', className: 'bg-info-soft text-info' },
  stake: { icon: '⬡', className: 'bg-accent/15 text-accent' },
  approval: { icon: '✓', className: 'bg-warn-soft text-warn' },
  contract: { icon: '⚙', className: 'bg-soft text-ink/85' },
  nft: { icon: '▣', className: 'bg-accent/10 text-accent' },
};
const NATIVE_SYMBOL: Record<string, string> = { ethereum: 'ETH', pulsechain: 'PLS', base: 'ETH', robinhood: 'ETH', bitcoin: 'BTC', solana: 'SOL' };

// Readable names for common HEX / Hedron / Maximus / Venice methods
const METHOD_NAMES: Record<string, string> = {
  stakestart: 'Started HEX stake',
  stakeend: 'Ended HEX stake',
  stakegoodaccounting: 'Good-accounted a HEX stake',
  mintnative: 'Minted HDRN',
  mintinstanced: 'Minted HDRN from an HSI',
  hexstakestart: 'Started an HSI stake',
  hexstakeend: 'Ended an HSI stake',
  hexstaketokenize: 'Tokenized an HSI',
  hexstakedetokenize: 'Detokenized an HSI',
  claimandstake: 'Claimed and restaked VVV',
  claim: 'Claimed rewards',
  stake: 'Staked',
  initiateunstake: 'Started unstaking',
  finalizeunstake: 'Finished unstaking',
  pledge: 'Pledged',
  redeem: 'Redeemed',
};
const methodName = (m?: string) => (m ? METHOD_NAMES[m.toLowerCase()] ?? m : undefined);

const fmt = (v: number) => (v >= 1e9 ? `${(v / 1e9).toFixed(2)}B` : v >= 1e6 ? `${(v / 1e6).toFixed(2)}M` : v.toLocaleString('en-US', { maximumFractionDigits: v >= 1 ? 4 : 8 }));
const dayLabel = (ts: number) => {
  const d = new Date(ts);
  const today = new Date();
  const yesterday = new Date(Date.now() - 86_400_000);
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: d.getFullYear() === today.getFullYear() ? undefined : 'numeric' });
};

export default function TransactionsPage() {
  const { wallets, assets, walletNames, hiddenKeySet } = usePortfolioContext();
  const { txs, loading, initialLoading, hasMore, notes, loadMore } = useTransactions(wallets);
  const [walletFilter, setWalletFilter] = useState('all');
  const [coinFilter, setCoinFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState<'all' | TxType>('all');
  const [hideSpam, setHideSpam] = useState(true);

  // Names and today's prices from the portfolio: chain:contract → symbol / price
  const { symbols, prices, held } = useMemo(() => {
    const symbols = new Map<string, string>();
    const prices = new Map<string, number>();
    const held = new Set<string>();
    for (const a of assets) {
      if (a.type === 'native' && a.priceUSD !== undefined) prices.set(`${a.chain}:native`, a.priceUSD);
      if (!a.contractAddress) continue;
      const key = `${a.chain}:${normalizeAddress(a.chain, a.contractAddress)}`;
      held.add(key);
      if (a.type === 'token' && !a.tokenStandard?.match(/Staked|Rewards|Unstaking/)) symbols.set(key, a.symbol);
      if (a.priceUSD !== undefined && (a.type === 'token' || a.type === 'stake') && !prices.has(key)) prices.set(key, a.priceUSD);
    }
    return { symbols, prices, held };
  }, [assets]);

  const transferKey = (chain: string, contract?: string) => (contract ? `${chain}:${normalizeAddress(chain, contract)}` : `${chain}:native`);
  const symbolOf = (tx: Tx, t: Tx['transfers'][number]) => (t.contract ? symbols.get(transferKey(tx.chain, t.contract)) ?? t.symbol : t.symbol);

  /** Incoming airdrops of tokens you hid, the risk check hid, or don't hold at all. */
  const isSpam = (tx: Tx) =>
    tx.type === 'receive' && tx.transfers.length > 0 &&
    tx.transfers.every((t) => t.contract && (hiddenKeySet.has(transferKey(tx.chain, t.contract)) || !held.has(transferKey(tx.chain, t.contract))));

  const coins = useMemo(() => {
    const set = new Set<string>();
    for (const tx of txs) for (const t of tx.transfers) if (!t.nft) set.add(symbolOf(tx, t));
    return [...set].sort((a, b) => a.localeCompare(b));
    // symbolOf depends only on symbols
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [txs, symbols]);

  const visible = txs.filter((tx) =>
    (walletFilter === 'all' || tx.walletId === walletFilter) &&
    (typeFilter === 'all' || tx.type === typeFilter) &&
    (coinFilter === 'all' || tx.transfers.some((t) => symbolOf(tx, t) === coinFilter) || (coinFilter === NATIVE_SYMBOL[tx.chain] && tx.fee !== undefined && tx.transfers.length === 0)) &&
    (!hideSpam || !isSpam(tx))
  );
  const spamCount = hideSpam ? txs.filter(isSpam).length : 0;

  const groups: { day: string; items: (Tx & { walletId: string })[] }[] = [];
  for (const tx of visible) {
    const day = dayLabel(tx.timestamp);
    if (groups[groups.length - 1]?.day !== day) groups.push({ day, items: [] });
    groups[groups.length - 1].items.push(tx);
  }

  if (wallets.length === 0) {
    return (
      <>
        <PageHeader title="Activity" subtitle="Transactions across all your wallets" />
        <NoWallets what="your transactions" />
      </>
    );
  }

  const select = 'w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent sm:w-auto';

  return (
    <>
      <PageHeader title="Activity" subtitle="Transactions across all your wallets" />

      {/* Filters */}
      <div className="mb-4 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center">
        <select aria-label="Wallet" value={walletFilter} onChange={(e) => setWalletFilter(e.target.value)} className={select}>
          <option value="all">All wallets</option>
          {wallets.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
        </select>
        <select aria-label="Coin" value={coinFilter} onChange={(e) => setCoinFilter(e.target.value)} className={select}>
          <option value="all">All coins</option>
          {coins.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <select aria-label="Type" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value as 'all' | TxType)} className={select}>
          <option value="all">All types</option>
          {(Object.keys(TYPE_LABEL) as TxType[]).map((t) => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}
        </select>
        <label className="flex items-center gap-2 rounded-lg bg-surface px-3 py-2 text-sm text-ink/85 ring-1 ring-line">
          <input type="checkbox" checked={hideSpam} onChange={(e) => setHideSpam(e.target.checked)} className="accent-accent" />
          Hide airdrop spam
        </label>
      </div>

      {notes.length > 0 && (
        <ul className="mb-4 space-y-1 text-xs text-muted">
          {notes.map((n) => <li key={n}>ℹ {n}</li>)}
        </ul>
      )}

      <section className="rounded-2xl border border-line bg-surface">
        {initialLoading && txs.length === 0 ? (
          <p className="p-6 text-sm text-muted">Loading transactions…</p>
        ) : groups.length === 0 ? (
          <p className="p-6 text-sm text-muted">No transactions match these filters{hasMore ? ' yet. Load more to search older history.' : '.'}</p>
        ) : (
          groups.map((g) => (
            <div key={g.day}>
              <h2 className="sticky top-16 z-10 border-b border-line bg-surface/90 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-muted backdrop-blur sm:px-6">{g.day}</h2>
              <ul className="divide-y divide-line">
                {g.items.map((tx) => <TxRow key={`${tx.walletId}:${tx.id}`} tx={tx} walletName={walletNames.get(tx.walletId) ?? ''} symbolOf={symbolOf} priceOf={(t) => prices.get(transferKey(tx.chain, t.contract))} />)}
              </ul>
            </div>
          ))
        )}
      </section>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-muted">
        <span>
          {visible.length.toLocaleString()} shown of {txs.length.toLocaleString()} loaded
          {spamCount > 0 && ` · ${spamCount} spam airdrop${spamCount === 1 ? '' : 's'} hidden`}
        </span>
        {hasMore && (
          <button
            onClick={loadMore}
            disabled={loading}
            className="rounded-xl bg-ink px-5 py-2.5 font-bold text-on-ink hover:bg-ink/85 disabled:opacity-60"
          >
            {loading ? 'Loading…' : 'Load more'}
          </button>
        )}
      </div>
    </>
  );
}

function TxRow({ tx, walletName, symbolOf, priceOf }: {
  tx: Tx; walletName: string;
  symbolOf: (tx: Tx, t: Tx['transfers'][number]) => string;
  priceOf: (t: Tx['transfers'][number]) => number | undefined;
}) {
  const style = TYPE_STYLE[tx.type];
  const outs = tx.transfers.filter((t) => t.direction === 'out');
  const ins = tx.transfers.filter((t) => t.direction === 'in');
  const describe = (list: Tx['transfers']) => list.map((t) => (t.nft ? `${symbolOf(tx, t)} NFT` : `${fmt(t.amount)} ${symbolOf(tx, t)}`)).join(' + ');

  let title: string;
  if (tx.type === 'swap') title = `Swapped ${describe(outs)} → ${describe(ins)}`;
  else if (tx.type === 'approval') title = `Approved a contract${tx.method ? ` (${tx.method})` : ''}`;
  else if (tx.type === 'stake') title = `${methodName(tx.method) ?? 'Staking'}${tx.transfers.length ? ` · ${describe(tx.transfers)}` : ''}`;
  else if (ins.length && !outs.length) title = `Received ${describe(ins)}`;
  else if (outs.length && !ins.length) title = `Sent ${describe(outs)}`;
  else title = tx.method ? methodName(tx.method) !== tx.method ? methodName(tx.method)! : `Called ${tx.method}` : 'Contract interaction';

  // Today's value (current prices, not historical): what came in for swaps,
  // what moved for stakes (unsigned: staking isn't a loss), net otherwise
  const valued = (list: Tx['transfers']) => list.reduce((sum, t) => {
    const p = priceOf(t);
    return p === undefined || t.nft ? sum : sum + t.amount * p;
  }, 0);
  const neutral = tx.type === 'stake' || tx.type === 'swap';
  const value = tx.type === 'swap' ? valued(ins) : tx.type === 'stake' ? valued(tx.transfers) : valued(ins) - valued(outs);
  const time = new Date(tx.timestamp).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

  return (
    <li className="flex items-start gap-3 px-4 py-3 sm:px-6">
      <span className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold ${style.className}`} aria-hidden="true">{style.icon}</span>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-3">
          <p className="min-w-0 break-words text-sm font-medium text-ink">
            {title}
            {tx.status === 'failed' && <span className="ml-2 rounded bg-bad-soft px-1.5 py-0.5 text-[10px] font-semibold text-bad">FAILED</span>}
          </p>
          {value !== 0 && (
            <span className={`shrink-0 text-sm font-semibold tabular-nums ${neutral ? 'text-muted' : value > 0 ? 'text-good' : 'text-ink'}`} title="At today's prices">
              {neutral ? '' : value > 0 ? '+' : '−'}{formatUSD(Math.abs(value))}
            </span>
          )}
        </div>
        <p className="mt-0.5 flex flex-wrap gap-x-2 text-xs text-muted">
          <span>{walletName}</span>
          <span>· {chainLabel(tx.chain)}</span>
          <span>· {time}</span>
          {tx.counterparty && <span>· {tx.type === 'receive' ? 'from' : 'with'} {shortAddress(tx.counterparty)}</span>}
          {tx.fee !== undefined && tx.fee > 0 && <span>· fee {fmt(tx.fee)} {NATIVE_SYMBOL[tx.chain]}</span>}
          <a href={tx.explorerUrl} target="_blank" rel="noopener noreferrer" className="font-medium text-accent hover:text-ink">· view ↗</a>
        </p>
      </div>
    </li>
  );
}

