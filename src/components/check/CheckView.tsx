'use client';

import Link from 'next/link';
import { FormEvent, ReactNode, useEffect, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Asset } from '@/types';
import { CheckResult, CheckSignal, CheckVerdict, ContractCheck, TokenCheck, TxCheck } from '@/types/check';
import { chainLabel } from '@/config/chainDisplay';
import { applyPrices, formatUSD } from '@/utils/prices';
import { groupHoldings } from '@/utils/holdings';
import { TokenLogo } from '@/components/ui/TokenLogo';
import { usePortfolioContext } from '@/components/app/PortfolioProvider';

const EXPLORERS: Record<string, { tx: (h: string) => string; address: (a: string) => string }> = {
  pulsechain: { tx: (h) => `https://otter.pulsechain.com/tx/${h}`, address: (a) => `https://otter.pulsechain.com/address/${a}` },
  ethereum: { tx: (h) => `https://etherscan.io/tx/${h}`, address: (a) => `https://etherscan.io/address/${a}` },
  base: { tx: (h) => `https://basescan.org/tx/${h}`, address: (a) => `https://basescan.org/address/${a}` },
};

const VERDICT: Record<CheckVerdict, { title: string; body: string; tone: string; icon: 'check' | 'alert' | 'x' | 'question' }> = {
  trusted: { title: 'Core coin', body: 'One of the chain’s core tokens. Lantern never flags these.', tone: 'bg-[#E3F5EC] text-[#0B5A38] ring-[#B9E4CD]', icon: 'check' },
  ok: { title: 'No red flags found', body: 'The contract and its trading look normal. This is a safety check, not a judgement on whether it’s a good investment.', tone: 'bg-[#E3F5EC] text-[#0B5A38] ring-[#B9E4CD]', icon: 'check' },
  suspicious: { title: 'Warning signs', body: 'Several things about this token look off. Be careful before buying, approving or interacting with it.', tone: 'bg-[#FFF4DB] text-[#7A4B00] ring-[#F5D78E]', icon: 'alert' },
  scam: { title: 'Likely a scam', body: 'Lantern found strong evidence this token is fake or a trap. Don’t buy it, approve it, or try to sell it on a site it links to.', tone: 'bg-[#FDECEC] text-[#8A1C1C] ring-[#F3BDBD]', icon: 'x' },
  unknown: { title: 'Not enough data', body: 'There isn’t enough trading or contract information to judge this token either way.', tone: 'bg-soft text-ink ring-line', icon: 'question' },
};

const fmt = (v: number) =>
  v >= 1e12 ? `${(v / 1e12).toFixed(2)}T` : v >= 1e9 ? `${(v / 1e9).toFixed(2)}B` : v >= 1e6 ? `${(v / 1e6).toFixed(2)}M` : v.toLocaleString('en-US', { maximumFractionDigits: v >= 1 ? 2 : 6 });
const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

const EXAMPLES = [
  { label: 'HEX', q: '0x2b591e99afE9f32eAA6214f7B7629768c40Eeb39' },
  { label: 'A fork-copy token (DAI)', q: '0x6B175474E89094C44Da98b954EedeAC495271d0F' },
  { label: 'A failed transaction', q: '0x69c4133bae949a29cff4b0edd4da74e544eed35c7835daccce9c4555492c1b5b' },
];

/** /check: paste an address, token or transaction; get a plain answer. */
export function CheckView() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const q = params.get('q')?.trim() ?? '';
  const [input, setInput] = useState(q);
  const [state, setState] = useState<{ q: string; result: CheckResult | null; loading: boolean }>({ q: '', result: null, loading: false });

  useEffect(() => {
    if (!q) return;
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- starting a fetch for the new query
    setState({ q, result: null, loading: true });
    fetch(`/api/check?q=${encodeURIComponent(q)}`)
      .then((r) => r.json())
      .then((result: CheckResult) => !cancelled && setState({ q, result, loading: false }))
      .catch(() => !cancelled && setState({ q, result: { kind: 'not-found', message: 'Lantern couldn’t reach the network. Try again in a moment.' }, loading: false }));
    return () => {
      cancelled = true;
    };
  }, [q]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const value = input.trim();
    if (value) router.push(`${pathname}?q=${encodeURIComponent(value)}`);
  };

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <div>
        <h1 className="text-4xl font-extrabold tracking-tight text-ink sm:text-5xl">Check anything</h1>
        <p className="mt-2 text-lg text-muted">Paste a wallet, a token contract or a transaction hash. No wallet connection, nothing to sign.</p>
      </div>

      <form onSubmit={submit} role="search" className="flex flex-col gap-2 sm:flex-row">
        <label htmlFor="check-q" className="sr-only">Address, token or transaction hash</label>
        <input
          id="check-q"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="0x… address, token or transaction · bc1… · Solana address"
          autoComplete="off"
          spellCheck={false}
          className="h-14 min-w-0 flex-1 rounded-2xl border border-line bg-white px-5 font-mono text-[15px] text-ink placeholder:font-sans placeholder:text-muted/70 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/25"
        />
        <button type="submit" className="h-14 rounded-2xl bg-ink px-7 text-base font-bold text-white hover:bg-ink/85">Check</button>
      </form>

      {!q && (
        <div className="flex flex-wrap items-center gap-2 text-sm text-muted">
          Try:
          {EXAMPLES.map((e) => (
            <Link key={e.q} href={`${pathname}?q=${e.q}`} onClick={() => setInput(e.q)} className="rounded-full bg-soft px-3 py-1.5 font-semibold text-ink hover:bg-line">{e.label}</Link>
          ))}
        </div>
      )}

      {state.loading && <div className="rounded-3xl bg-soft p-8 text-center text-muted">Looking across PulseChain, Ethereum, Base and more…</div>}
      {!state.loading && state.result && state.q === q && <Result result={state.result} />}
    </div>
  );
}

function Result({ result }: { result: CheckResult }) {
  switch (result.kind) {
    case 'token': return <>{result.tokens.map((t) => <TokenCard key={t.chain} t={t} />)}</>;
    case 'contract': return (
      <>
        <ContractCard contracts={result.contracts} />
        <WalletCard address={result.contracts[0].address} chains={result.contracts.map((c) => c.chain)} title="What this contract holds" />
      </>
    );
    case 'wallet': return <WalletCard address={result.address} chains={result.chains} />;
    case 'tx': return <TxCard tx={result.tx} />;
    default: return <div className="rounded-3xl border border-line p-6 text-ink">{result.message}</div>;
  }
}

function VerdictIcon({ icon }: { icon: 'check' | 'alert' | 'x' | 'question' }) {
  const d = { check: 'M5 12.5l4.5 4.5L19 7.5', alert: 'M12 8v5M12 16.5h.01M10.3 3.9L2.4 18a2 2 0 0 0 1.7 3h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z', x: 'M6 6l12 12M18 6L6 18', question: 'M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3M12 17h.01' }[icon];
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" className="h-7 w-7 shrink-0" aria-hidden="true"><path d={d} /></svg>;
}

const SIGNAL_DOT: Record<CheckSignal['strength'], string> = { strong: 'bg-[#C92A2A]', weak: 'bg-amber-500', info: 'bg-muted/50', good: 'bg-[#0B7A4B]' };

function TokenCard({ t }: { t: TokenCheck }) {
  const isCore = t.verdict === 'trusted';
  // A non-core fork copy leads with "not the original"; the contract check becomes the second line
  const copy = t.forkCopy && !isCore && t.verdict !== 'scam';
  const v = copy
    ? { title: `Not the real ${t.forkCopy!.ethereumSymbol}`, body: `This is PulseChain’s copy of an Ethereum token. Contract check: ${VERDICT[t.verdict].title.toLowerCase()}.`, tone: 'bg-[#FFF4DB] text-[#7A4B00] ring-[#F5D78E]', icon: 'alert' as const }
    : VERDICT[t.verdict];
  return (
    <section className="space-y-4 rounded-3xl border border-line p-5 sm:p-7" aria-label={`${t.symbol} on ${chainLabel(t.chain)}`}>
      <header className="flex items-center gap-3">
        <TokenLogo src={`/api/logos/${t.chain}/${t.address}`} symbol={t.symbol} size={44} />
        <div className="min-w-0">
          <h2 className="truncate text-2xl font-extrabold tracking-tight text-ink">{t.label ?? t.name} <span className="text-muted">{t.symbol}</span></h2>
          <div className="text-sm text-muted">Token on {chainLabel(t.chain)} · <span className="font-mono">{short(t.address)}</span></div>
        </div>
      </header>

      <div className={`flex gap-3 rounded-2xl p-4 ring-1 ${v.tone}`} role="status">
        <VerdictIcon icon={v.icon} />
        <div>
          <div className="text-lg font-extrabold">{v.title}</div>
          <p className="mt-0.5 text-[15px] leading-snug">{v.body}</p>
        </div>
      </div>

      {t.forkCopy && (
        <div className="rounded-2xl bg-soft p-4 text-[15px] leading-snug text-ink">
          <div className="font-bold">{isCore ? 'PulseChain’s own copy' : 'This is a fork copy'}</div>
          {isCore
            ? <p className="mt-1">PulseChain copied every Ethereum token when it launched in May 2023. This is the PulseChain version of {t.forkCopy.ethereumSymbol}, which trades separately{t.forkCopy.ethereumPriceUSD ? ` (on Ethereum: ${formatUSD(t.forkCopy.ethereumPriceUSD)})` : ''}.</p>
            : <p className="mt-1">PulseChain copied every Ethereum token when it launched in May 2023. This is that copy of {t.forkCopy.ethereumSymbol}, not the original. It isn&apos;t backed by the Ethereum token{t.forkCopy.ethereumPriceUSD ? ` (worth ${formatUSD(t.forkCopy.ethereumPriceUSD)} on Ethereum)` : ''} and trades at its own price{t.priceUSD !== null ? `: ${formatUSD(t.priceUSD)}` : ''}. Scammers sell these copies as if they were the real thing.</p>}
        </div>
      )}

      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Price" value={t.priceUSD !== null ? formatUSD(t.priceUSD) : '—'} />
        <Stat label="Liquidity" value={t.liquidityUSD !== null ? formatUSD(t.liquidityUSD) : '—'} />
        <Stat label="24h volume" value={t.volume24hUSD !== null ? formatUSD(t.volume24hUSD) : '—'} />
        <Stat label="Holders" value={t.holders !== null ? t.holders.toLocaleString() : '—'} />
      </dl>

      {t.signals.length > 0 && !isCore && (
        <div>
          <h3 className="text-sm font-bold text-ink">What Lantern looked at</h3>
          <ul className="mt-2 space-y-1.5">
            {t.signals.map((s) => (
              <li key={s.id + s.label} className="flex gap-2.5 text-[15px] text-ink">
                <span className={`mt-[7px] h-2 w-2 shrink-0 rounded-full ${SIGNAL_DOT[s.strength]}`} aria-hidden="true" />
                {s.label}
              </li>
            ))}
          </ul>
        </div>
      )}
      <ExplorerLink chain={t.chain} href={EXPLORERS[t.chain]?.address(t.address)} />
    </section>
  );
}

function ContractCard({ contracts }: { contracts: ContractCheck[] }) {
  const main = contracts.find((c) => c.label || c.verified) ?? contracts[0];
  return (
    <section className="space-y-3 rounded-3xl border border-line p-5 sm:p-7">
      <h2 className="text-2xl font-extrabold tracking-tight text-ink">{main.label ?? main.name ?? 'A smart contract'}</h2>
      <p className="text-[15px] text-muted">This address is a contract, not a wallet or a token. {main.verified ? 'Its source code is verified, so anyone can read what it does.' : 'Its source code isn’t verified on the explorer, so what it does can’t easily be checked.'}</p>
      <ul className="space-y-1.5 text-[15px] text-ink">
        {contracts.map((c) => (
          <li key={c.chain} className="flex flex-wrap justify-between gap-2 border-t border-line pt-2">
            <span>{chainLabel(c.chain)}</span>
            <span className="text-muted">{c.name ?? 'unnamed'} · {c.verified ? 'verified' : 'not verified'}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function WalletCard({ address, chains, title }: { address: string; chains: string[]; title?: string }) {
  const { wallets, addWallet } = usePortfolioContext();
  const [assets, setAssets] = useState<Asset[] | null>(null);
  const tracked = wallets.some((w) => w.address.toLowerCase() === address.toLowerCase());

  useEffect(() => {
    let cancelled = false;
    Promise.all(chains.map((c) => fetch(`/api/assets/${c}?address=${encodeURIComponent(address)}`).then((r) => r.json()).then((d) => (d.success ? (d.data as Asset[]) : [])).catch(() => [])))
      .then((lists) => applyPrices(lists.flat()))
      .then((priced) => !cancelled && setAssets(priced));
    return () => {
      cancelled = true;
    };
  }, [address, chains]);

  const holdings = assets ? groupHoldings(assets).filter((h) => (h.valueUSD ?? 0) > 0.01) : [];
  const total = holdings.reduce((s, h) => s + (h.valueUSD ?? 0), 0);
  const stakes = (assets ?? []).filter((a) => a.stake);
  return (
    <section className="space-y-4 rounded-3xl border border-line p-5 sm:p-7">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm text-muted">{title ?? 'Wallet'} · <span className="font-mono">{short(address)}</span></div>
          <div className="mt-1 text-4xl font-extrabold tracking-tight tabular-nums text-ink">{assets ? formatUSD(total) : '…'}</div>
          <div className="text-sm text-muted">{assets ? `${holdings.length} assets across ${new Set(holdings.flatMap((h) => h.chains)).size} chains` : 'Reading balances…'}</div>
        </div>
        {tracked
          ? <Link href="/" className="inline-flex h-11 items-center rounded-full bg-soft px-5 text-sm font-bold text-ink hover:bg-line">In your wallets · open dashboard</Link>
          : <button type="button" onClick={() => addWallet(address)} className="h-11 rounded-full bg-ink px-5 text-sm font-bold text-white hover:bg-ink/85">Track this wallet</button>}
      </div>
      {stakes.length > 0 && (
        <p className="rounded-2xl bg-soft p-4 text-[15px] text-ink">
          <strong>{stakes.length} HEX stake{stakes.length === 1 ? '' : 's'}</strong> worth {formatUSD(stakes.reduce((s, a) => s + (a.valueUSD ?? 0), 0))}.
        </p>
      )}
      {assets && (
        <ul>
          {holdings.slice(0, 12).map((h) => (
            <li key={h.key} className="flex items-center gap-3 border-t border-line py-3">
              <TokenLogo src={h.imageUrl} symbol={h.symbol} size={32} />
              <span className="min-w-0 flex-1">
                <span className="block font-bold text-ink">{h.symbol}</span>
                <span className="block truncate text-[13px] text-muted">{h.name} · {h.chains.map(chainLabel).join(', ')}</span>
              </span>
              <span className="font-bold tabular-nums text-ink">{formatUSD(h.valueUSD ?? 0)}</span>
            </li>
          ))}
        </ul>
      )}
      <p className="text-[13px] text-muted">Read from public chain data. Tracking a wallet only saves its address in this browser.</p>
    </section>
  );
}

const STATUS = {
  success: { label: 'Succeeded', tone: 'bg-[#E3F5EC] text-[#0B5A38] ring-[#B9E4CD]', icon: 'check' as const },
  failed: { label: 'Failed', tone: 'bg-[#FDECEC] text-[#8A1C1C] ring-[#F3BDBD]', icon: 'x' as const },
  pending: { label: 'Pending', tone: 'bg-[#FFF4DB] text-[#7A4B00] ring-[#F5D78E]', icon: 'question' as const },
};

function TxCard({ tx }: { tx: TxCheck }) {
  const s = STATUS[tx.status];
  return (
    <section className="space-y-4 rounded-3xl border border-line p-5 sm:p-7">
      <div className="text-sm text-muted">Transaction on {chainLabel(tx.chain)} · <span className="font-mono">{short(tx.hash)}</span></div>
      <div className={`flex gap-3 rounded-2xl p-4 ring-1 ${s.tone}`} role="status">
        <VerdictIcon icon={s.icon} />
        <div>
          <div className="text-lg font-extrabold">{s.label}</div>
          <p className="mt-0.5 text-[15px] leading-snug">{tx.summary}</p>
        </div>
      </div>
      <dl className="grid gap-x-6 gap-y-2 text-[15px] sm:grid-cols-2">
        <Row label="From"><span className="font-mono">{short(tx.from)}</span></Row>
        <Row label="To">{tx.to ? (tx.toLabel ?? <span className="font-mono">{short(tx.to)}</span>) : 'New contract'}</Row>
        {tx.method && <Row label="Function">{tx.method}</Row>}
        {tx.value > 0 && <Row label="Value">{fmt(tx.value)} {tx.nativeSymbol}</Row>}
        {tx.feeNative !== null && <Row label="Fee">{fmt(tx.feeNative)} {tx.nativeSymbol}</Row>}
        {tx.timestamp && <Row label="Time">{new Date(tx.timestamp).toLocaleString()}</Row>}
      </dl>
      {tx.transfers.length > 0 && (
        <div>
          <h3 className="text-sm font-bold text-ink">Token movements</h3>
          <ul className="mt-2">
            {tx.transfers.map((x, i) => (
              <li key={i} className="flex flex-wrap items-center justify-between gap-2 border-t border-line py-2 text-[15px]">
                <span className="flex items-center gap-2 font-semibold text-ink">
                  <TokenLogo src={x.nft ? undefined : `/api/logos/${tx.chain}/${x.token}`} symbol={x.symbol} size={22} />
                  {x.amount !== null ? `${fmt(x.amount)} ${x.symbol}` : x.symbol}
                </span>
                <span className="font-mono text-[13px] text-muted">{short(x.from)} → {short(x.to)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      <p className="text-[13px] text-muted">Status read from the chain itself, so it’s right even when an explorer shows it wrong.</p>
      <ExplorerLink chain={tx.chain} href={EXPLORERS[tx.chain]?.tx(tx.hash)} />
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-2xl bg-soft/70 p-3">
      <dt className="text-xs font-semibold text-muted">{label}</dt>
      <dd className="truncate text-lg font-extrabold tabular-nums text-ink">{value}</dd>
    </div>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex justify-between gap-3 border-t border-line pt-2">
      <dt className="text-muted">{label}</dt>
      <dd className="min-w-0 truncate text-right text-ink">{children}</dd>
    </div>
  );
}

function ExplorerLink({ chain, href }: { chain: string; href?: string }) {
  if (!href) return null;
  return <a href={href} target="_blank" rel="noopener noreferrer" className="inline-block text-sm font-semibold text-accent hover:underline">Open in a {chainLabel(chain)} explorer ↗</a>;
}
