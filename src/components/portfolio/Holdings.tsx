'use client';

import { Fragment, useState } from 'react';
import { Asset } from '@/types';
import { chainLabel } from '@/config/chainDisplay';
import { groupHoldings } from '@/utils/holdings';
import { formatUSD } from '@/utils/prices';

interface HoldingsProps {
  assets: Asset[];
  walletNames: Map<string, string>;
}

const ROWS_COLLAPSED = 15;
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
  const digits = value >= 1000 ? 0 : value >= 1 ? 4 : 6;
  return value.toLocaleString('en-US', { maximumFractionDigits: digits });
}

/**
 * Every wallet combined: one row per asset with total balance, price, value
 * and share of the portfolio. Click a row for the per-wallet breakdown.
 */
export function Holdings({ assets, walletNames }: HoldingsProps) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [showDust, setShowDust] = useState(false);

  const holdings = groupHoldings(assets);
  if (holdings.length === 0) return null;

  const total = holdings.reduce((sum, h) => sum + (h.valueUSD ?? 0), 0);
  const main = holdings.filter((h) => (h.valueUSD ?? 0) >= DUST_USD || h.kind === 'native');
  const dust = holdings.length - main.length;
  const pool = showDust ? holdings : main;
  const rows = showAll ? pool : pool.slice(0, ROWS_COLLAPSED);
  const walletName = (address: string) => walletNames.get(address.toLowerCase()) ?? address;

  return (
    <section className="rounded-2xl border border-white/20 bg-white/70 p-6 shadow-xl backdrop-blur-sm sm:p-8">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-xl font-bold text-gray-800">All holdings</h2>
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
                        {h.imageUrl && h.kind === 'token' && (
                          // eslint-disable-next-line @next/next/no-img-element -- remote token logos
                          <img src={h.imageUrl} alt="" width={20} height={20} loading="lazy" className="h-5 w-5 rounded-full" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
                        )}
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
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="py-2.5 pr-4 text-right tabular-nums">{formatAmount(h.balance)}</td>
                    <td className="py-2.5 pr-4 text-right tabular-nums text-gray-600">{h.priceUSD !== undefined ? formatUSD(h.priceUSD) : '—'}</td>
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

                  {isOpen && h.parts.map((a) => (
                    <tr key={a.id} className="border-b border-gray-100 bg-gray-50/70 text-xs">
                      <td className="py-1.5 pl-8 pr-4 text-gray-600">
                        {walletName(a.walletAddress)} · {chainLabel(a.chain)}
                        {a.type === 'stake' && a.stake && ` · stake #${a.stake.stakeId}`}
                      </td>
                      <td className="py-1.5 pr-4 text-right tabular-nums text-gray-700">
                        {formatAmount(Number(a.balanceFormatted) + (a.stake?.interestHex ?? 0))}
                      </td>
                      <td className="py-1.5 pr-4 text-right tabular-nums text-gray-500">{a.priceUSD !== undefined ? formatUSD(a.priceUSD) : '—'}</td>
                      <td className="py-1.5 pr-4 text-right tabular-nums text-gray-700">{a.valueUSD !== undefined ? formatUSD(a.valueUSD) : '—'}</td>
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
        <span className="text-gray-500">
          Native coins combine across chains (ETH on Ethereum, Base and Robinhood is one row). Tokens stay per chain, since eHEX and pHEX trade separately.
        </span>
      </div>
    </section>
  );
}
