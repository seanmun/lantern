import 'server-only';
import { ethers } from 'ethers';
import { Asset } from '@/types';
import { HEX_ADDRESS, MAXIMUS_POOLS, MAXIMUS_TEAM_ADDRESS } from '@/config/hex';

/**
 * Maximus TEAM staking, mirroring the verified TEAM contract (same address on
 * Ethereum and Pulsechain, independent state on each):
 *
 * - Staking burns TEAM from the wallet, so staked TEAM never shows up as a
 *   balance; USER_AMOUNT_STAKED(user) is the running total.
 * - Periods follow the BASE pool: odd periods are staking periods, even ones
 *   reloads. A stake's ID is the staking period it started in.
 * - After each staking period the pools' bonus yield is split per TEAM staked:
 *   claimable = rate(ticker, period) * TEAM served that period / 1e8, paid by
 *   the StakeRewardDistribution contract, which logs what's been claimed.
 *
 * Staked TEAM is priced as TEAM; unclaimed rewards use each reward token's
 * address so they roll into those holdings (HEX, HDRN, MAXI, ...).
 */

const HDRN_ADDRESS = '0x3819f64f282bf135d62168c1e513280daf905e06';
const MULTICALL3_ADDRESS = '0xcA11bde05977b3631167028862bE2a173976CA11';

const TEAM_ABI = [
  'function USER_AMOUNT_STAKED(address) view returns (uint256)',
  'function getCurrentPeriod() view returns (uint256)',
  'function STAKE_REWARD_DISTRIBUTION_ADDRESS() view returns (address)',
  'function stakes(address, uint256) view returns (address staker, uint256 balance, uint256 stakeID, uint256 stake_expiry_period, bool initiated)',
  'function getPeriodRedemptionRates(string ticker, uint256 period) view returns (uint256)',
  'function getClaimableAmount(address user, uint256 period, string ticker, uint256 stakeID) view returns (uint256, address)',
];
const DISTRIBUTION_ABI = ['function didUserStakeClaimFromPeriod(address, uint256, uint256, string) view returns (bool)'];
const MULTICALL3_ABI = ['function aggregate3((address target, bool allowFailure, bytes callData)[] calls) view returns ((bool success, bytes returnData)[])'];

const REWARD_TOKENS = [
  { ticker: 'HEX', name: 'HEX', address: HEX_ADDRESS, decimals: 8 },
  { ticker: 'HDRN', name: 'Hedron', address: HDRN_ADDRESS, decimals: 9 },
  ...MAXIMUS_POOLS.map((p) => ({ ticker: p.symbol, name: p.name, address: p.address, decimals: 8 })),
  { ticker: 'TEAM', name: 'Maximus Team', address: MAXIMUS_TEAM_ADDRESS, decimals: 8 },
];

const team = new ethers.Interface(TEAM_ABI);
const distribution = new ethers.Interface(DISTRIBUTION_ABI);

export async function maximusTeamPositions(provider: ethers.JsonRpcProvider, address: string, chain: string, idPrefix: string): Promise<Asset[]> {
  const contract = new ethers.Contract(MAXIMUS_TEAM_ADDRESS, TEAM_ABI, provider);
  const multicall = new ethers.Contract(MULTICALL3_ADDRESS, MULTICALL3_ABI, provider);
  const call = async (calls: { target: string; data: string }[]) =>
    (await multicall.aggregate3(calls.map((c) => ({ target: c.target, allowFailure: true, callData: c.data })))) as { success: boolean; returnData: string }[];

  const [staked, period, distributor] = await Promise.all([
    contract.USER_AMOUNT_STAKED(address) as Promise<bigint>,
    contract.getCurrentPeriod().then(Number) as Promise<number>,
    contract.STAKE_REWARD_DISTRIBUTION_ADDRESS() as Promise<string>,
  ]);

  // Stake records live at odd period IDs, up to the next staking period
  const stakeIds: number[] = [];
  for (let id = 1; id <= period + 2; id += 2) stakeIds.push(id);
  const records = (await call(stakeIds.map((id) => ({ target: MAXIMUS_TEAM_ADDRESS, data: team.encodeFunctionData('stakes', [address, id]) }))))
    .map((r, i) => {
      if (!r.success) return null;
      const s = team.decodeFunctionResult('stakes', r.returnData);
      return s.initiated ? { id: stakeIds[i], expiry: Number(s.stake_expiry_period) } : null;
    })
    .filter((s): s is { id: number; expiry: number } => !!s);

  // Unclaimed rewards: each stake x each completed staking period it served x each reward token
  const claims: { stakeId: number; period: number; token: (typeof REWARD_TOKENS)[number] }[] = [];
  for (const s of records)
    for (let p = s.id; p < period && p <= s.expiry; p += 2)
      for (const token of REWARD_TOKENS) claims.push({ stakeId: s.id, period: p, token });
  const unclaimed = new Map<string, bigint>();
  if (claims.length) {
    const results = await call(claims.flatMap((c) => [
      { target: MAXIMUS_TEAM_ADDRESS, data: team.encodeFunctionData('getClaimableAmount', [address, c.period, c.token.ticker, c.stakeId]) },
      { target: distributor, data: distribution.encodeFunctionData('didUserStakeClaimFromPeriod', [address, c.stakeId, c.period, c.token.ticker]) },
    ]));
    claims.forEach((c, i) => {
      const [amount, claimed] = [results[i * 2], results[i * 2 + 1]];
      if (!amount.success || !claimed.success) return;
      if (distribution.decodeFunctionResult('didUserStakeClaimFromPeriod', claimed.returnData)[0]) return;
      const value = BigInt(team.decodeFunctionResult('getClaimableAmount', amount.returnData)[0]);
      if (value > BigInt(0)) unclaimed.set(c.token.ticker, (unclaimed.get(c.token.ticker) ?? BigInt(0)) + value);
    });
  }

  const asset = (suffix: string, amount: bigint, token: (typeof REWARD_TOKENS)[number], extra: Partial<Asset>): Asset => ({
    id: `${idPrefix}_${address}_maxteam_${suffix}`,
    type: 'token',
    chain,
    walletAddress: address,
    name: token.name,
    symbol: token.ticker,
    decimals: token.decimals,
    balance: amount.toString(),
    balanceFormatted: ethers.formatUnits(amount, token.decimals),
    contractAddress: token.address,
    lastUpdated: new Date(),
    ...extra,
  });

  const assets: Asset[] = [];
  const teamToken = REWARD_TOKENS.find((t) => t.ticker === 'TEAM')!;
  if (staked > BigInt(0)) assets.push(asset('staked', staked, teamToken, { tokenStandard: 'Staked', name: 'Maximus Team (staked)' }));
  for (const [ticker, amount] of unclaimed) {
    const token = REWARD_TOKENS.find((t) => t.ticker === ticker)!;
    assets.push(asset(`rewards_${ticker}`, amount, token, { tokenStandard: 'Rewards', name: `${token.name} (unclaimed TEAM rewards)` }));
  }
  return assets;
}
