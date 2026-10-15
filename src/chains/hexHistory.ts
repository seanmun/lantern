import 'server-only';
import { ethers } from 'ethers';
import { HEX_ABI, HEX_ADDRESS } from '@/config/hex';
import { createProvider } from './evm';
import { ETHEREUM_CONFIG } from './ethereum';
import { PULSECHAIN_CONFIG } from './pulsechain';
import { getHexState } from './hex';

/**
 * T-Share price history, sampled from the HEX contract's shareRate at past
 * blocks (requires an archive-capable RPC).
 *
 * Pulsechain's public RPC serves archive state, and its history before the
 * fork is Ethereum's, so it supplies both chains up to the fork. Ethereum
 * after the fork needs an archive RPC (e.g. ALCHEMY_API_KEY); without one
 * that stretch is reported as unavailable rather than guessed.
 */

export interface TSharePoint {
  day: number;
  tSharePriceHex: number;
}

export interface TShareHistory {
  chain: string;
  points: TSharePoint[];
  note?: string;
}

const LAUNCH_TIME = 1575331200;
const HEX_DEPLOY_BLOCK = 9041184;
const FORK_BLOCK = 17233000; // last block Pulsechain shares with Ethereum
const SAMPLE_EVERY_DAYS = 30;
const ANCHOR_COUNT = 24;
const CONCURRENCY = 6;
const TTL_MS = 6 * 60 * 60 * 1000;

let cached: { value: TShareHistory[]; at: number } | null = null;
let inflight: Promise<TShareHistory[]> | null = null;

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]);
    }
  }));
  return results;
}

/** Timestamp → block via interpolation between evenly spaced anchor blocks. */
async function blockLocator(provider: ethers.JsonRpcProvider, fromBlock: number, toBlock: number) {
  const numbers = Array.from({ length: ANCHOR_COUNT + 1 }, (_, i) => Math.round(fromBlock + ((toBlock - fromBlock) * i) / ANCHOR_COUNT));
  const blocks = await mapLimit(numbers, CONCURRENCY, (n) => provider.getBlock(n));
  const anchors = blocks.filter((b): b is ethers.Block => !!b).map((b) => ({ block: b.number, ts: b.timestamp }));

  return (ts: number): number | null => {
    if (ts < anchors[0].ts || ts > anchors[anchors.length - 1].ts) return null;
    const i = anchors.findIndex((a) => a.ts >= ts);
    if (i <= 0) return anchors[0].block;
    const a = anchors[i - 1];
    const b = anchors[i];
    return Math.round(a.block + ((b.block - a.block) * (ts - a.ts)) / (b.ts - a.ts));
  };
}

async function sample(provider: ethers.JsonRpcProvider, fromBlock: number, toBlock: number, fromDay: number, toDay: number): Promise<TSharePoint[]> {
  const locate = await blockLocator(provider, fromBlock, toBlock);
  const hex = new ethers.Contract(HEX_ADDRESS, HEX_ABI, provider);

  const targets: { day: number; block: number }[] = [];
  for (let day = fromDay; day <= toDay; day += SAMPLE_EVERY_DAYS) {
    const block = locate(LAUNCH_TIME + day * 86_400 + 43_200); // midday of that HEX day
    if (block !== null) targets.push({ day, block });
  }

  const points = await mapLimit(targets, CONCURRENCY, async ({ day, block }) => {
    const g: bigint[] = await hex.globalInfo({ blockTag: block });
    return { day, tSharePriceHex: Number(g[2]) / 10 };
  });
  return points;
}

const dayOf = (timestamp: number) => Math.floor((timestamp - LAUNCH_TIME) / 86_400);

async function pulsechainHistory(): Promise<{ history: TShareHistory; forkDay: number }> {
  const provider = createProvider(PULSECHAIN_CONFIG);
  const [head, forkBlock] = await Promise.all([provider.getBlock('latest'), provider.getBlock(FORK_BLOCK)]);
  if (!head || !forkBlock) throw new Error('Pulsechain block lookup failed');

  const points = await sample(provider, HEX_DEPLOY_BLOCK, head.number, 1, dayOf(head.timestamp));
  const state = await getHexState('pulsechain', provider);
  points.push({ day: state.currentDay, tSharePriceHex: Number(state.shareRate) / 10 });

  return { history: { chain: 'pulsechain', points }, forkDay: dayOf(forkBlock.timestamp) };
}

async function ethereumHistory(pulse: TSharePoint[], forkDay: number): Promise<TShareHistory> {
  const shared = pulse.filter((p) => p.day <= forkDay);
  const provider = createProvider(ETHEREUM_CONFIG);
  const state = await getHexState('ethereum', provider);
  const today = { day: state.currentDay, tSharePriceHex: Number(state.shareRate) / 10 };

  try {
    const head = await provider.getBlock('latest');
    if (!head) throw new Error('no head');
    const after = await sample(provider, FORK_BLOCK, head.number, forkDay + SAMPLE_EVERY_DAYS, dayOf(head.timestamp));
    return { chain: 'ethereum', points: [...shared, ...after, today] };
  } catch {
    return {
      chain: 'ethereum',
      points: [...shared, today],
      note: 'Ethereum history after the May 2023 fork needs an archive RPC (set ALCHEMY_API_KEY).',
    };
  }
}

/** Both chains' T-Share price history (cached for 6 hours). */
export function getTShareHistory(): Promise<TShareHistory[]> {
  if (cached && Date.now() - cached.at < TTL_MS) return Promise.resolve(cached.value);

  inflight ??= (async () => {
    const { history: pulse, forkDay } = await pulsechainHistory();
    const eth = await ethereumHistory(pulse.points, forkDay);
    cached = { value: [eth, pulse], at: Date.now() };
    return cached.value;
  })().finally(() => {
    inflight = null;
  });
  return inflight;
}
