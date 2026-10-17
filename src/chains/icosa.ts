import 'server-only';
import { ethers } from 'ethers';
import { Asset, IcosaStakeInfo } from '@/types';
import { HDRN_DECIMALS, HEDRON_ADDRESS } from './hedron';

/**
 * Icosa (ICSA) staking, mirroring the verified Icosa contract (same address on
 * Ethereum and Pulsechain; Pulsechain copied every stake at the fork):
 *
 * - HDRN stakes earn ICSA. ICSA stakes earn ICSA + HDRN. WAATSA NFT stakes
 *   (minted during the launch event) earn ICSA.
 * - One HDRN and one ICSA stake per address. Ending before minStakeLength
 *   days (30-360, by stake size) scales principal and yield by days served /
 *   minimum, the rest going to other stakers.
 *
 * HDRN/ICSA stake ends are simulated as the staker (eth_call), which runs the
 * contract's own daily update and payout math. NFT payouts are computed from
 * the pool's payout-per-point history, since a wallet can hold hundreds.
 */

export const ICOSA_ADDRESS = '0xfc4913214444aF5c715cc9F7b52655e788A569ed';
const ICSA_DECIMALS = 9;
const WAATSA_ADDRESS = '0x2520E62474bA3085693f856B3E93fa6C92a4EF48';
const MULTICALL3_ADDRESS = '0xcA11bde05977b3631167028862bE2a173976CA11';
const MAX_NFTS = 1000;
const POINT_RESOLUTION = BigInt(10) ** BigInt(18);

const STAKE = '(uint64 stakeStart, uint64 capitalAdded, uint120 stakePoints, bool isActive, uint80 payoutPreCapitalAddIcsa, uint80 payoutPreCapitalAddHdrn, uint80 stakeAmount, uint16 minStakeLength)';
const ICOSA_ABI = [
  'function currentDay() view returns (uint256)',
  `function hdrnStakes(address) view returns ${STAKE}`,
  `function icsaStakes(address) view returns ${STAKE}`,
  `function nftStakes(uint256) view returns ${STAKE}`,
  'function nftPoolPayout(uint256) view returns (uint256)',
  'function hdrnStakeEnd() returns (uint256 icsa, uint256 principalPenalty, uint256 icsaPenalty)',
  'function icsaStakeEnd() returns (uint256 icsa, uint256 hdrn, uint256 principalPenalty, uint256 icsaPenalty, uint256 hdrnPenalty)',
];
const WAATSA_ABI = [
  'function balanceOf(address) view returns (uint256)',
  'function tokenOfOwnerByIndex(address, uint256) view returns (uint256)',
];
const HEDRON_ABI = ['function currentDay() view returns (uint256)'];
const MULTICALL3_ABI = ['function aggregate3((address target, bool allowFailure, bytes callData)[] calls) view returns ((bool success, bytes returnData)[])'];

const icosa = new ethers.Interface(ICOSA_ABI);
const waatsa = new ethers.Interface(WAATSA_ABI);

const TOKENS = {
  HDRN: { name: 'Hedron', symbol: 'HDRN', address: HEDRON_ADDRESS, decimals: HDRN_DECIMALS },
  ICSA: { name: 'Icosa', symbol: 'ICSA', address: ICOSA_ADDRESS, decimals: ICSA_DECIMALS },
};

type Stake = { stakeStart: bigint; capitalAdded: bigint; stakePoints: bigint; isActive: boolean; stakeAmount: bigint; minStakeLength: bigint };

export async function icosaPositions(provider: ethers.JsonRpcProvider, address: string, chain: string, idPrefix: string): Promise<Asset[]> {
  const contract = new ethers.Contract(ICOSA_ADDRESS, ICOSA_ABI, provider);
  const [day, hdrnStake, icsaStake, nftCount] = await Promise.all([
    new ethers.Contract(HEDRON_ADDRESS, HEDRON_ABI, provider).currentDay().then(Number) as Promise<number>,
    contract.hdrnStakes(address) as Promise<Stake>,
    contract.icsaStakes(address) as Promise<Stake>,
    (new ethers.Contract(WAATSA_ADDRESS, WAATSA_ABI, provider).balanceOf(address) as Promise<bigint>).then(Number).catch(() => 0),
  ]);

  const assets: Asset[] = [];
  const asset = (suffix: string, amount: bigint, token: (typeof TOKENS)[keyof typeof TOKENS], icosaInfo: IcosaStakeInfo, name: string): Asset => ({
    id: `${idPrefix}_${address}_icosa_${suffix}`,
    type: 'token',
    chain,
    walletAddress: address,
    name,
    symbol: token.symbol,
    decimals: token.decimals,
    balance: amount.toString(),
    balanceFormatted: ethers.formatUnits(amount, token.decimals),
    contractAddress: token.address,
    tokenStandard: icosaInfo.role === 'principal' ? 'Staked' : 'Rewards',
    icosa: icosaInfo,
    lastUpdated: new Date(),
  });
  const timing = (s: Stake) => {
    const minStakeDays = Number(s.minStakeLength);
    const daysServed = Math.max(0, day - Number(s.capitalAdded));
    return { minStakeDays, daysServed, daysUntilMature: Math.max(0, minStakeDays - daysServed) };
  };
  const fmt = (v: bigint, decimals: number) => ethers.formatUnits(v, decimals);

  // HDRN stake -> ICSA yield
  if (hdrnStake.isActive) {
    const [icsa, principalPenalty, icsaPenalty] = (await contract.hdrnStakeEnd.staticCall({ from: address })) as bigint[];
    const t = timing(hdrnStake);
    assets.push(asset('hdrn_staked', hdrnStake.stakeAmount, TOKENS.HDRN, { pool: 'HDRN', role: 'principal', ...t, endNowPenalty: Number(fmt(principalPenalty, HDRN_DECIMALS)) }, 'Hedron (staked in Icosa)'));
    const accrued = icsa + icsaPenalty;
    if (accrued > BigInt(0))
      assets.push(asset('hdrn_yield', accrued, TOKENS.ICSA, { pool: 'HDRN', role: 'yield', ...t, endNowPenalty: Number(fmt(icsaPenalty, ICSA_DECIMALS)) }, 'Icosa (earned by HDRN stake)'));
  }

  // ICSA stake -> ICSA + HDRN yield
  if (icsaStake.isActive) {
    const [icsa, hdrn, principalPenalty, icsaPenalty, hdrnPenalty] = (await contract.icsaStakeEnd.staticCall({ from: address })) as bigint[];
    const t = timing(icsaStake);
    assets.push(asset('icsa_staked', icsaStake.stakeAmount, TOKENS.ICSA, { pool: 'ICSA', role: 'principal', ...t, endNowPenalty: Number(fmt(principalPenalty, ICSA_DECIMALS)) }, 'Icosa (staked)'));
    if (icsa + icsaPenalty > BigInt(0))
      assets.push(asset('icsa_yield_icsa', icsa + icsaPenalty, TOKENS.ICSA, { pool: 'ICSA', role: 'yield', ...t, endNowPenalty: Number(fmt(icsaPenalty, ICSA_DECIMALS)) }, 'Icosa (earned by ICSA stake)'));
    if (hdrn + hdrnPenalty > BigInt(0))
      assets.push(asset('icsa_yield_hdrn', hdrn + hdrnPenalty, TOKENS.HDRN, { pool: 'ICSA', role: 'yield', ...t, endNowPenalty: Number(fmt(hdrnPenalty, HDRN_DECIMALS)) }, 'Hedron (earned by ICSA stake)'));
  }

  // WAATSA NFT stakes -> ICSA yield: points x (payout per point now - when staked)
  if (nftCount > 0) {
    const multicall = new ethers.Contract(MULTICALL3_ADDRESS, MULTICALL3_ABI, provider);
    const call = async (calls: { target: string; data: string }[]) =>
      (await multicall.aggregate3(calls.map((c) => ({ target: c.target, allowFailure: true, callData: c.data })))) as { success: boolean; returnData: string }[];
    const indexes = Array.from({ length: Math.min(nftCount, MAX_NFTS) }, (_, i) => i);
    const ids = (await call(indexes.map((i) => ({ target: WAATSA_ADDRESS, data: waatsa.encodeFunctionData('tokenOfOwnerByIndex', [address, i]) }))))
      .filter((r) => r.success)
      .map((r) => BigInt(waatsa.decodeFunctionResult('tokenOfOwnerByIndex', r.returnData)[0]));
    const stakes = (await call(ids.map((id) => ({ target: ICOSA_ADDRESS, data: icosa.encodeFunctionData('nftStakes', [id]) }))))
      .map((r) => (r.success ? (icosa.decodeFunctionResult('nftStakes', r.returnData) as unknown as Stake) : null))
      .filter((s): s is Stake => !!s?.isActive);
    if (stakes.length) {
      const poolDay = Number(await contract.currentDay());
      const days = [...new Set([poolDay, ...stakes.map((s) => Number(s.capitalAdded))])];
      const payouts = await call(days.map((d) => ({ target: ICOSA_ADDRESS, data: icosa.encodeFunctionData('nftPoolPayout', [d]) })));
      const perPoint = new Map(days.map((d, i) => [d, payouts[i].success ? BigInt(icosa.decodeFunctionResult('nftPoolPayout', payouts[i].returnData)[0]) : BigInt(0)]));
      const now = perPoint.get(poolDay)!;
      const accrued = stakes.reduce((sum, s) => sum + (s.stakePoints * (now - perPoint.get(Number(s.capitalAdded))!)) / POINT_RESOLUTION, BigInt(0));
      const oldest = Math.min(...stakes.map((s) => Number(s.capitalAdded)));
      if (accrued > BigInt(0))
        assets.push(asset('nft_yield', accrued, TOKENS.ICSA, {
          pool: 'NFT', role: 'yield', minStakeDays: 0, daysServed: Math.max(0, day - oldest), daysUntilMature: 0, endNowPenalty: 0, stakeCount: stakes.length,
        }, `Icosa (earned by ${stakes.length} WAATSA NFT stake${stakes.length === 1 ? '' : 's'})`));
    }
  }

  return assets;
}
