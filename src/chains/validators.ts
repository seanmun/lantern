import 'server-only';
import { ValidatorNetworkStats } from '@/types';

/**
 * Validator economics for Ethereum and PulseChain from public beacon and
 * execution nodes (no API keys).
 *
 * Consensus rewards: the beacon API's ideal attestation reward for a full
 * validator at a given epoch (it already reflects network participation).
 * Attestations are 54/64 of a validator's ideal duties; block proposals and
 * sync committees make up the rest, so a perfectly online validator earns
 * ideal x 64/54 per epoch on average.
 *
 * Execution rewards: what block proposers get on top. Ethereum: MEV-Boost
 * payments from the Flashbots relay's public data. PulseChain: priority tips
 * from recent blocks' receipts (base fees are burned).
 *
 * PulseChain's beacon node keeps history, so its consensus rate comes with a
 * year of real samples; Ethereum's public node doesn't, so only today's.
 */

const UA = { 'user-agent': 'lantern', accept: 'application/json', 'content-type': 'application/json' };
const TIMEOUT_MS = 30_000;
const SECONDS_PER_YEAR = 365.25 * 86_400;
const HISTORY_POINTS = 26;           // ~every two weeks over a year
const TIP_SAMPLE_BLOCKS = 12;

interface ChainSpec {
  chain: 'ethereum' | 'pulsechain';
  symbol: string;
  coinId: string;
  beacon: string;
  rpc: string;
  secondsPerSlot: number;
  minStake: number;            // to run one validator
  maxEffective: number;        // per validator
  maxEffectiveGwei: bigint;    // beacon units
  incrementGwei: bigint;
  baseRewardFactor: bigint;
}

const SPECS: ChainSpec[] = [
  {
    chain: 'ethereum', symbol: 'ETH', coinId: 'ethereum',
    beacon: 'https://ethereum-beacon-api.publicnode.com', rpc: 'https://ethereum.publicnode.com',
    secondsPerSlot: 12, minStake: 32, maxEffective: 2048,
    maxEffectiveGwei: BigInt(2048e9), incrementGwei: BigInt(1e9), baseRewardFactor: BigInt(64),
  },
  {
    chain: 'pulsechain', symbol: 'PLS', coinId: 'pulsechain',
    beacon: 'https://rpc-pulsechain.g4mm4.io/beacon-api', rpc: 'https://rpc.pulsechain.com',
    secondsPerSlot: 10, minStake: 32_000_000, maxEffective: 32_000_000,
    maxEffectiveGwei: BigInt(32e15), incrementGwei: BigInt(1e15), baseRewardFactor: BigInt(64_000),
  },
];

async function json(url: string, body?: unknown) {
  const response = await fetch(url, {
    method: body === undefined ? 'GET' : 'POST',
    headers: UA,
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`${new URL(url).host} ${response.status}`);
  return response.json();
}

async function rpc(url: string, method: string, params: unknown[]) {
  const { result, error } = await json(url, { jsonrpc: '2.0', id: 1, method, params });
  if (error) throw new Error(`${method}: ${error.message}`);
  return result;
}

const epochsPerYear = (s: ChainSpec) => SECONDS_PER_YEAR / (s.secondsPerSlot * 32);
const slotsPerYear = (s: ChainSpec) => SECONDS_PER_YEAR / s.secondsPerSlot;

/** Ideal reward (all duties) per epoch, in coins, for one max-balance validator. */
async function idealEpochReward(s: ChainSpec, epoch: number): Promise<{ coins: number; effective: number }> {
  const { data } = await json(`${s.beacon}/eth/v1/beacon/rewards/attestations/${epoch}`, ['0']);
  const rows: { effective_balance: string; head: string; target: string; source: string }[] = data.ideal_rewards;
  const top = rows.reduce((a, b) => (BigInt(b.effective_balance) > BigInt(a.effective_balance) ? b : a));
  const attestation = Number(BigInt(top.head) + BigInt(top.target) + BigInt(top.source));
  return { coins: ((attestation * 64) / 54) / 1e9, effective: Number(BigInt(top.effective_balance)) / 1e9 };
}

const aprFrom = (s: ChainSpec, reward: { coins: number; effective: number }) => (reward.coins * epochsPerYear(s)) / reward.effective * 100;

async function currentEpoch(s: ChainSpec): Promise<number> {
  const { data } = await json(`${s.beacon}/eth/v1/beacon/states/head/finality_checkpoints`);
  return Number(data.current_justified.epoch);
}

/** Active validators: every one sits in exactly one committee per epoch, so one slot's committees x 32. */
async function activeValidators(s: ChainSpec, epoch: number): Promise<number> {
  const { data } = await json(`${s.beacon}/eth/v1/beacon/states/head/committees?epoch=${epoch}&slot=${epoch * 32 + 1}`);
  return 32 * (data as { validators: string[] }[]).reduce((sum, c) => sum + c.validators.length, 0);
}

/**
 * Total stake. PulseChain has no balance consolidation, so validators x 32M.
 * Ethereum validators can hold up to 2,048 ETH since Pectra, so it's backed
 * out of the base reward (∝ 1/√total stake) instead: an estimate, slightly
 * high when participation is below 100%.
 */
function totalStake(s: ChainSpec, validators: number, reward: { coins: number; effective: number }): { staked: number; estimated: boolean } {
  if (s.chain === 'pulsechain') return { staked: validators * s.maxEffective, estimated: false };
  const increments = reward.effective / (Number(s.incrementGwei) / 1e9);
  const basePerIncrementGwei = (reward.coins * 1e9) / increments; // per epoch, all duties (= base reward)
  const sqrtTotal = (Number(s.incrementGwei) * Number(s.baseRewardFactor)) / basePerIncrementGwei;
  return { staked: (sqrtTotal * sqrtTotal) / 1e9, estimated: true };
}

/** Average proposer execution reward per block, in coins. */
async function executionPerBlock(s: ChainSpec): Promise<number> {
  if (s.chain === 'ethereum') {
    const bids: { value: string }[] = await json('https://boost-relay.flashbots.net/relay/v1/data/bidtraces/proposer_payload_delivered?limit=200');
    return bids.reduce((sum, b) => sum + Number(b.value) / 1e18, 0) / Math.max(1, bids.length);
  }
  const head = parseInt(await rpc(s.rpc, 'eth_blockNumber', []), 16);
  const blocks = Array.from({ length: TIP_SAMPLE_BLOCKS }, (_, i) => head - 1 - i * 25);
  const tips = await Promise.all(blocks.map(async (n) => {
    const tag = `0x${n.toString(16)}`;
    const [block, receipts] = await Promise.all([rpc(s.rpc, 'eth_getBlockByNumber', [tag, false]), rpc(s.rpc, 'eth_getBlockReceipts', [tag])]);
    const baseFee = BigInt(block.baseFeePerGas ?? 0);
    const wei = (receipts as { effectiveGasPrice: string; gasUsed: string }[])
      .reduce((sum, r) => sum + (BigInt(r.effectiveGasPrice) - baseFee) * BigInt(r.gasUsed), BigInt(0));
    return Number(wei) / 1e18;
  }));
  // Median: a single whale transaction shouldn't set the rate
  tips.sort((a, b) => a - b);
  return tips[Math.floor(tips.length / 2)];
}

async function priceHistory(coinId: string): Promise<{ t: number; price: number }[]> {
  const key = process.env.COINGECKO_API_KEY;
  const response = await fetch(`https://api.coingecko.com/api/v3/coins/${coinId}/market_chart?vs_currency=usd&days=365&interval=daily`, {
    headers: { ...UA, ...(key ? { 'x-cg-demo-api-key': key } : {}) },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`CoinGecko ${response.status}`);
  const { prices }: { prices: [number, number][] } = await response.json();
  return prices.map(([t, price]) => ({ t, price }));
}

async function consensusHistory(s: ChainSpec, epoch: number): Promise<{ t: number; apr: number }[]> {
  if (s.chain !== 'pulsechain') return [];
  const step = Math.floor(epochsPerYear(s) / HISTORY_POINTS);
  const now = Date.now();
  const epochSeconds = s.secondsPerSlot * 32;
  const samples = await Promise.all(Array.from({ length: HISTORY_POINTS + 1 }, (_, i) => epoch - (HISTORY_POINTS - i) * step).map(async (e) => {
    try {
      return { t: now - (epoch - e) * epochSeconds * 1000, apr: aprFrom(s, await idealEpochReward(s, e)) };
    } catch {
      return null; // a pruned or missing epoch just leaves a gap
    }
  }));
  return samples.filter((x): x is { t: number; apr: number } => !!x);
}

async function networkStats(s: ChainSpec): Promise<ValidatorNetworkStats> {
  const epoch = (await currentEpoch(s)) - 1; // last fully processed epoch
  const [reward, validators, perBlock, history, prices] = await Promise.all([
    idealEpochReward(s, epoch),
    activeValidators(s, epoch + 1),
    executionPerBlock(s).catch((error) => (console.warn(`⚠️ ${s.chain} execution rewards unavailable:`, error.message), null)),
    consensusHistory(s, epoch),
    priceHistory(s.coinId).catch((error) => (console.warn(`⚠️ ${s.chain} price history unavailable:`, error.message), [])),
  ]);
  const { staked, estimated } = totalStake(s, validators, reward);
  return {
    chain: s.chain,
    symbol: s.symbol,
    coinId: s.coinId,
    minStake: s.minStake,
    maxEffective: s.maxEffective,
    validators,
    totalStaked: staked,
    totalStakedEstimated: estimated,
    consensusApr: aprFrom(s, reward),
    executionApr: perBlock !== null ? ((perBlock * slotsPerYear(s)) / staked) * 100 : null,
    consensusHistory: history,
    priceHistory: prices,
    updatedAt: new Date().toISOString(),
  };
}

const CACHE_TTL_MS = 60 * 60 * 1000;
let cached: { at: number; data: Promise<ValidatorNetworkStats[]> } | null = null;

export function getValidatorStats(): Promise<ValidatorNetworkStats[]> {
  if (!cached || Date.now() - cached.at > CACHE_TTL_MS) {
    const data = Promise.allSettled(SPECS.map(networkStats)).then((results) => {
      results.forEach((r, i) => r.status === 'rejected' && console.warn(`⚠️ ${SPECS[i].chain} validator stats failed:`, r.reason));
      const ok = results.flatMap((r) => (r.status === 'fulfilled' ? [r.value] : []));
      if (ok.length < SPECS.length) cached = null; // retry the failed chain next time
      return ok;
    });
    cached = { at: Date.now(), data };
  }
  return cached.data;
}
