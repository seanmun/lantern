'use client';

import { Asset } from '@/types';
import { HEX_ADDRESS } from '@/config/hex';
import { chainLabel } from '@/config/chainDisplay';
import { formatUSD } from '@/utils/prices';
import { HEX_CHAIN_COLORS } from './colors';

const HEX_CHAINS = ['ethereum', 'pulsechain'];
const fmt = (v: number) => v.toLocaleString('en-US', { maximumFractionDigits: 0 });

interface ChainHex {
  liquid: number;
  staked: number;   // principal
  interest: number; // earned so far
  value: number;    // USD
  price: number | null;
}

/**
 * Ethereum vs Pulsechain side by side. HEX held before the May 2023 fork
 * exists on both chains, but eHEX and pHEX trade at different prices.
 */
export function ForkComparison({ assets, hexPrices }: { assets: Asset[]; hexPrices: Record<string, number | null> }) {
  const byChain: Record<string, ChainHex> = Object.fromEntries(
    HEX_CHAINS.map((c) => [c, { liquid: 0, staked: 0, interest: 0, value: 0, price: hexPrices[c] ?? null }])
  );

  const stakeKeys: Record<string, Set<string>> = { ethereum: new Set(), pulsechain: new Set() };
  for (const a of assets) {
    const entry = byChain[a.chain];
    if (!entry) continue;
    if (a.type === 'token' && a.contractAddress?.toLowerCase() === HEX_ADDRESS.toLowerCase()) {
      entry.liquid += Number(a.balanceFormatted);
      entry.value += a.valueUSD ?? 0;
    } else if (a.type === 'stake' && a.stake) {
      entry.staked += Number(a.balanceFormatted);
      entry.interest += a.stake.interestHex;
      entry.value += a.valueUSD ?? 0;
      stakeKeys[a.chain].add(`${a.walletAddress.toLowerCase()}:${a.stake.stakeId}`);
    }
  }

  const [eth, pls] = [byChain.ethereum, byChain.pulsechain];
  const totalHex = (c: ChainHex) => c.liquid + c.staked + c.interest;
  if (totalHex(eth) === 0 || totalHex(pls) === 0) return null; // only meaningful with HEX on both

  const twins = [...stakeKeys.ethereum].filter((k) => stakeKeys.pulsechain.has(k)).length;
  const ratio = eth.price && pls.price ? pls.price / eth.price : null;

  return (
    <div>
      <h3 className="mb-3 text-lg font-semibold text-ink">Ethereum vs Pulsechain</h3>
      <div className="grid gap-3 sm:grid-cols-2">
        {HEX_CHAINS.map((c) => {
          const x = byChain[c];
          return (
            <div key={c} className="rounded-xl bg-white p-4">
              <div className="mb-2 flex items-center justify-between">
                <span className="flex items-center gap-2 text-sm font-semibold text-ink">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: HEX_CHAIN_COLORS[c] }} />
                  {chainLabel(c)}
                </span>
                <span className="text-xs tabular-nums text-muted">{x.price != null ? `${formatUSD(x.price)} / HEX` : ''}</span>
              </div>
              <div className="text-2xl font-bold tabular-nums text-ink">{formatUSD(x.value)}</div>
              <div className="text-sm tabular-nums text-muted">{fmt(totalHex(x))} HEX</div>
              <dl className="mt-3 grid grid-cols-3 gap-2 text-xs">
                <div><dt className="text-muted">Liquid</dt><dd className="font-semibold tabular-nums text-ink">{fmt(x.liquid)}</dd></div>
                <div><dt className="text-muted">Staked</dt><dd className="font-semibold tabular-nums text-ink">{fmt(x.staked)}</dd></div>
                <div><dt className="text-muted">Interest</dt><dd className="font-semibold tabular-nums text-ink">{fmt(x.interest)}</dd></div>
              </dl>
            </div>
          );
        })}
      </div>
      <p className="mt-2 text-xs text-muted">
        {ratio !== null && `pHEX trades at ${ratio.toFixed(2)}× the price of eHEX. `}
        {twins > 0 && `${twins} stake${twins === 1 ? ' predates' : 's predate'} the fork and exist${twins === 1 ? 's' : ''} on both chains. `}
        Stakes started after the fork earn separately on each chain.
      </p>
    </div>
  );
}
