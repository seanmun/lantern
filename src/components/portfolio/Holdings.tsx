'use client';

import { Fragment, useState } from 'react';
import Link from 'next/link';
import { Asset } from '@/types';
import { chainLabel } from '@/config/chainDisplay';
import { groupHoldings } from '@/utils/holdings';
import { tokenKey } from '@/hooks/useHiddenTokens';
import { TokenRiskReport } from '@/hooks/useTokenRisk';
import { formatUSD } from '@/utils/prices';
import { TokenLogo } from '@/components/ui/TokenLogo';

interface HoldingsProps {
  assets: Asset[];
  walletNames: Map<string, string>;
  hiddenAssets: Asset[];
  hiddenKeys: string[];
  onHide: (key: string) => void;
  onUnhide: (key: string) => void;
  risk: Map<string, TokenRiskReport>;
  autoHiddenKeys: string[];   // hidden by the risk check (verdict "scam")
  trustedKeys: string[];
  onTrust: (key: string) => void;
  onUntrust: (key: string) => void;
  compact?: boolean; // dashboard preview: top rows only, links to the full page
}

/** Evidence worth showing a person (skip neutral/positive bookkeeping). */
const evidence = (r?: TokenRiskReport) => (r?.signals ?? []).filter((s) => s.strength !== 'good');

const ROWS_COLLAPSED = 15;
const ROWS_COMPACT = 8;
const DUST_USD = 1;

const CHAIN_DOT: Record<string, string> = {
  bitcoin: 'bg-orange-500',
  ethereum: 'bg-blue-500',
  pulsechain: 'bg-pink-500',
  base: 'bg-indigo-600',
  robinhood: 'bg-green-500',
  solana: 'bg-violet-500',
};

function formatAmount(value: number): string {
  if (value > 0 && value < 0.000001) return '<0.000001';
  const digits = value >= 1000 ? 0 : value >= 1 ? 4 : 6;
  return value.toLocaleString('en-US', { maximumFractionDigits: digits });
}

/**
 * Every wallet combined: one row per asset with total balance, price, value
 * and share of the portfolio. Click a row for the per-wallet breakdown.
 */
export function Holdings({ assets, walletNames, hiddenAssets, hiddenKeys, onHide, onUnhide, risk, autoHiddenKeys, trustedKeys, onTrust, onUntrust, compact = false }: HoldingsProps) {
  const [showAutoHidden, setShowAutoHidden] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [showHidden, setShowHidden] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [showDust, setShowDust] = useState(false);

  const holdings = groupHoldings(assets);
  if (holdings.length === 0 && hiddenKeys.length === 0 && autoHiddenKeys.length === 0) return null;

  // Hidden tokens, one entry per key, with what they'd add (for the unhide list)
  const describeHidden = (key: string) => {
    const parts = hiddenAssets.filter((a) => tokenKey(a) === key);
    const first = parts[0];
    return {
      key,
      label: first ? `${first.symbol} · ${first.name}` : key,
      chain: first?.chain ?? key.split(':')[0],
      valueUSD: parts.reduce((sum, a) => sum + (a.valueUSD ?? 0), 0),
    };
  };
  const hiddenList = hiddenKeys.map(describeHidden);
  const autoHiddenList = autoHiddenKeys.map(describeHidden);

  const total = holdings.reduce((sum, h) => sum + (h.valueUSD ?? 0), 0);
  const main = holdings.filter((h) => (h.valueUSD ?? 0) >= DUST_USD || h.kind === 'native' || h.kind === 'hex');
  const dust = holdings.length - main.length;
  const pool = showDust ? holdings : main;
  const rows = compact ? pool.slice(0, ROWS_COMPACT) : showAll ? pool : pool.slice(0, ROWS_COLLAPSED);
  const walletName = (address: string) => walletNames.get(address.toLowerCase()) ?? address;

  return (
    <section className="rounded-2xl border border-white/20 bg-white/70 p-6 shadow-xl backdrop-blur-sm sm:p-8">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-xl font-bold text-gray-800">{compact ? 'Top holdings' : 'All holdings'}</h2>
        <span className="text-sm text-gray-500">
          {holdings.length} assets across all wallets · {formatUSD(total)}
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b text-left text-xs uppercase tracking-wide text-gray-500">
              <th className="py-2 pr-4 font-medium">Asset</th>
              <th className="py-2 pr-4 text-right font-medium">Balance</th>
              <th className="py-2 pr-4 text-right font-medium">Price</th>
              <th className="py-2 pr-4 text-right font-medium">Value</th>
              <th className="w-40 py-2 font-medium">Share</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((h) => {
              const share = total > 0 && h.valueUSD ? (h.valueUSD / total) * 100 : 0;
              const isOpen = expanded === h.key;
              return (
                <Fragment key={h.key}>
                  <tr
                    onClick={() => setExpanded(isOpen ? null : h.key)}
                    onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), setExpanded(isOpen ? null : h.key))}
                    tabIndex={0}
                    aria-expanded={isOpen}
                    className="cursor-pointer border-b border-gray-100 outline-none hover:bg-purple-50/50 focus-visible:bg-purple-50"
                  >
                    <td className="py-2.5 pr-4">
                      <div className="flex items-center gap-2">
                        <span className={`text-[10px] text-gray-400 transition-transform ${isOpen ? 'rotate-90' : ''}`} aria-hidden="true">▶</span>
                        {h.kind === 'collectibles'
                          ? <span aria-hidden className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-amber-50 text-xs ring-1 ring-amber-200">🖼</span>
                          : <TokenLogo src={h.imageUrl} symbol={h.symbol} size={24} />}
                        <div className="min-w-0">
                          <div className="truncate font-medium text-gray-900">
                            {h.symbol} <span className="font-normal text-gray-500">{h.name !== h.symbol ? h.name : ''}</span>
                          </div>
                          <div className="flex flex-wrap items-center gap-x-2 text-xs text-gray-500">
                            {h.chains.map((c) => (
                              <span key={c} className="flex items-center gap-1">
                                <span className={`h-1.5 w-1.5 rounded-full ${CHAIN_DOT[c] ?? 'bg-gray-400'}`} />
                                {chainLabel(c)}
                              </span>
                            ))}
                            {h.parts.length > 1 && <span>· {h.parts.length} positions</span>}
                            {h.kind === 'token' && (() => {
                              const key = tokenKey(h.parts[0].asset);
                              const r = risk.get(key);
                              if (r?.verdict !== 'suspicious' || trustedKeys.includes(key)) return null;
                              return <span className="rounded bg-amber-100 px-1.5 text-[10px] font-semibold text-amber-800">⚠ Suspicious</span>;
                            })()}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="py-2.5 pr-4 text-right tabular-nums">{formatAmount(h.balance)}{h.kind === 'collectibles' && <span className="text-gray-500"> items</span>}</td>
                    <td className="py-2.5 pr-4 text-right tabular-nums text-gray-600">
                      {h.priceUSD !== undefined ? formatUSD(h.priceUSD) : '—'}
                      {h.blendedPrice && <div className="text-[10px] uppercase tracking-wide text-gray-400" title="Parts trade at different prices; this is total value ÷ total balance">avg</div>}
                    </td>
                    <td className="py-2.5 pr-4 text-right font-semibold tabular-nums text-gray-900">{h.valueUSD !== undefined ? formatUSD(h.valueUSD) : '—'}</td>
                    <td className="py-2.5">
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-gray-200">
                          <div className="h-full rounded-full bg-purple-600" style={{ width: `${Math.max(share > 0 ? 1 : 0, share)}%` }} />
                        </div>
                        <span className="w-12 text-right text-xs tabular-nums text-gray-600">{share >= 0.1 ? `${share.toFixed(1)}%` : share > 0 ? '<0.1%' : '—'}</span>
                      </div>
                    </td>
                  </tr>

                  {isOpen && h.kind === 'token' && (() => {
                    const key = tokenKey(h.parts[0].asset);
                    const r = risk.get(key);
                    const isTrusted = trustedKeys.includes(key);
                    const shown = evidence(r);
                    return (
                      <tr className="border-b border-gray-100 bg-gray-50/70 text-xs">
                        <td colSpan={5} className="space-y-1.5 py-2 pl-8 pr-4">
                          {r && (
                            <div className="text-gray-600">
                              <span className="font-medium text-gray-800">Risk check: </span>
                              {r.verdict === 'trusted' ? 'core coin' : isTrusted ? 'you trust this token' : r.verdict}
                              {r.signals.some((x) => x.id === 'trades-freely') && ` · ${r.signals.find((x) => x.id === 'trades-freely')!.label.toLowerCase()}`}
                              {shown.length > 0 && (
                                <ul className="mt-1 list-disc space-y-0.5 pl-4">
                                  {shown.map((x) => (
                                    <li key={x.id} className={x.strength === 'strong' ? 'text-red-700' : x.strength === 'weak' ? 'text-amber-800' : 'text-gray-500'}>{x.label}</li>
                                  ))}
                                </ul>
                              )}
                            </div>
                          )}
                          <div>
                            <button
                              onClick={() => { onHide(key); setExpanded(null); }}
                              className="font-medium text-red-700 hover:text-red-900"
                            >
                              Hide this token (spam / scam)
                            </button>
                            {r && r.verdict === 'suspicious' && !isTrusted && (
                              <button onClick={() => onTrust(key)} className="ml-4 font-medium text-purple-700 hover:text-purple-900">Trust this token</button>
                            )}
                            {isTrusted && (
                              <button onClick={() => onUntrust(key)} className="ml-4 font-medium text-gray-600 hover:text-gray-900">Stop trusting</button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })()}
                  {isOpen && h.parts.map(({ asset: a, label, amount }) => (
                    <tr key={a.id} className="border-b border-gray-100 bg-gray-50/70 text-xs">
                      <td className="py-1.5 pl-8 pr-4 text-gray-600">
                        {walletName(a.walletAddress)} · {chainLabel(a.chain)} · <span className="text-gray-800">{label}</span>
                      </td>
                      <td className="py-1.5 pr-4 text-right tabular-nums text-gray-700">{formatAmount(amount)}</td>
                      <td className="py-1.5 pr-4 text-right tabular-nums text-gray-500">
                        {a.valueUSD !== undefined && amount > 0 ? formatUSD(a.valueUSD / amount) : '—'}
                      </td>
                      <td className="py-1.5 pr-4 text-right tabular-nums text-gray-700">
                        {a.valueUSD === undefined ? '—' : a.valueUSD > 0 && a.valueUSD < 0.01 ? '<$0.01' : formatUSD(a.valueUSD)}
                      </td>
                      <td />
                    </tr>
                  ))}
                </Fragment>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-gray-200">
              <td className="py-2.5 pr-4 font-semibold text-gray-900">Total</td>
              <td />
              <td />
              <td className="py-2.5 pr-4 text-right font-bold tabular-nums text-gray-900">{formatUSD(total)}</td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>

      {compact ? (
        <div className="mt-3 text-sm">
          <Link href="/holdings" className="font-medium text-purple-700 hover:text-purple-900">View all {holdings.length} holdings →</Link>
        </div>
      ) : (
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs">
        {pool.length > ROWS_COLLAPSED && (
          <button onClick={() => setShowAll((v) => !v)} className="font-medium text-purple-700 hover:text-purple-900">
            {showAll ? `Show top ${ROWS_COLLAPSED}` : `Show all ${pool.length} assets`}
          </button>
        )}
        {dust > 0 && (
          <button onClick={() => setShowDust((v) => !v)} className="font-medium text-purple-700 hover:text-purple-900">
            {showDust ? 'Hide small balances' : `Show ${dust} small or unpriced`}
          </button>
        )}
        {autoHiddenList.length > 0 && (
          <button onClick={() => setShowAutoHidden((v) => !v)} className="font-medium text-purple-700 hover:text-purple-900">
            {showAutoHidden ? 'Hide auto-hidden list' : `${autoHiddenList.length} auto-hidden as scam${autoHiddenList.length === 1 ? '' : 's'}`}
          </button>
        )}
        {hiddenList.length > 0 && (
          <button onClick={() => setShowHidden((v) => !v)} className="font-medium text-purple-700 hover:text-purple-900">
            {showHidden ? 'Hide hidden-token list' : `${hiddenList.length} hidden token${hiddenList.length === 1 ? '' : 's'}`}
          </button>
        )}
        <span className="text-gray-500">
          ETH includes WETH on every chain. HEX includes liquid, staked (principal + interest) and Maximus pools at their HEX
          backing, on both chains; values use each part&apos;s own price, so its price is an average. Other tokens stay per chain.
        </span>
      </div>
      )}
      {!compact && showAutoHidden && autoHiddenList.length > 0 && (
        <ul className="mt-3 divide-y divide-gray-100 rounded-xl bg-white/60 text-sm">
          {autoHiddenList.map((h) => (
            <li key={h.key} className="px-4 py-2">
              <div className="flex items-center justify-between gap-3">
                <span className="min-w-0 truncate">
                  <span className="font-medium text-gray-900">{h.label}</span>
                  <span className="ml-2 text-xs text-gray-500">{chainLabel(h.chain)}{h.valueUSD > 0 && ` · claims ${formatUSD(h.valueUSD)}`}</span>
                </span>
                <button onClick={() => onTrust(h.key)} className="shrink-0 text-xs font-medium text-purple-700 hover:text-purple-900">
                  Trust (show anyway)
                </button>
              </div>
              <ul className="mt-1 list-disc pl-5 text-xs">
                {evidence(risk.get(h.key)).map((x) => (
                  <li key={x.id} className={x.strength === 'strong' ? 'text-red-700' : x.strength === 'weak' ? 'text-amber-800' : 'text-gray-500'}>{x.label}</li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}

      {!compact && showHidden && hiddenList.length > 0 && (
        <ul className="mt-3 divide-y divide-gray-100 rounded-xl bg-white/60 text-sm">
          {hiddenList.map((h) => (
            <li key={h.key} className="flex items-center justify-between gap-3 px-4 py-2">
              <span className="min-w-0 truncate">
                <span className="font-medium text-gray-900">{h.label}</span>
                <span className="ml-2 text-xs text-gray-500">{chainLabel(h.chain)}{h.valueUSD > 0 && ` · claims ${formatUSD(h.valueUSD)}`}</span>
              </span>
              <button onClick={() => onUnhide(h.key)} className="shrink-0 text-xs font-medium text-purple-700 hover:text-purple-900">
                Unhide
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
