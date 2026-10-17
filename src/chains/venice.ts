import 'server-only';
import { ethers } from 'ethers';
import { Asset } from '@/types';

/**
 * Venice (VVV) staking on Base, mirroring the verified StakingV2 contract
 * (an upgradeable proxy at STAKING_ADDRESS):
 *
 * - balanceOf(user)      sVVV, staked 1:1 with VVV (non-transferable)
 * - lockedStakes(user)   sVVV locked to mint DIEM (still part of the balance)
 * - pendingRewards(user) VVV emissions claimable now
 * - stakes(user)         an unstake waiting out the 7-day cooldown
 *
 * Positions use the VVV contract address so they're priced as VVV and roll
 * into the VVV holding.
 */

export const VVV_ADDRESS = '0xacfE6019Ed1A7Dc6f7B508C02d1b04ec88cC21bf';
export const DIEM_ADDRESS = '0xF4d97F2da56e8c3098f3a8D538DB630A2606a024';
const STAKING_ADDRESS = '0x321b7ff75154472B18EDb199033fF4D116F340Ff';

const STAKING_ABI = [
  'function balanceOf(address) view returns (uint256)',
  'function pendingRewards(address) view returns (uint256)',
  'function stakes(address) view returns (uint256 rewardDebt, uint256 cooldownEnd, uint256 cooldownAmount)',
  'function lockedStakes(address) view returns (uint256 sVVVLockedAmount, uint256 outstandingDiemAmount)',
];

export async function venicePositions(provider: ethers.JsonRpcProvider, address: string, chain: string, idPrefix: string): Promise<Asset[]> {
  const staking = new ethers.Contract(STAKING_ADDRESS, STAKING_ABI, provider);
  const [staked, rewards, cooldown, locked] = await Promise.all([
    staking.balanceOf(address) as Promise<bigint>,
    staking.pendingRewards(address) as Promise<bigint>,
    staking.stakes(address),
    staking.lockedStakes(address),
  ]);

  const base = (suffix: string, amount: bigint, extra: Partial<Asset>): Asset => ({
    id: `${idPrefix}_${address}_venice_${suffix}`,
    type: 'token',
    chain,
    walletAddress: address,
    name: 'Venice Token',
    symbol: 'VVV',
    decimals: 18,
    balance: amount.toString(),
    balanceFormatted: ethers.formatEther(amount),
    contractAddress: VVV_ADDRESS,
    lastUpdated: new Date(),
    ...extra,
  });

  const assets: Asset[] = [];
  if (staked > BigInt(0)) {
    const lockedAmount = BigInt(locked.sVVVLockedAmount);
    assets.push(base('staked', staked, {
      symbol: 'sVVV',
      tokenStandard: 'Staked',
      name: lockedAmount > BigInt(0)
        ? `Venice Token (${Number(ethers.formatEther(lockedAmount)).toLocaleString('en-US', { maximumFractionDigits: 2 })} locked for DIEM)`
        : 'Venice Token',
    }));
  }
  if (rewards > BigInt(0)) {
    assets.push(base('rewards', rewards, { tokenStandard: 'Rewards', name: 'Venice staking rewards' }));
  }
  const cooldownAmount = BigInt(cooldown.cooldownAmount);
  if (cooldownAmount > BigInt(0)) {
    const ready = new Date(Number(cooldown.cooldownEnd) * 1000);
    const label = ready.getTime() <= Date.now()
      ? 'ready to withdraw'
      : `ready ${ready.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })}`;
    assets.push(base('unstaking', cooldownAmount, { tokenStandard: 'Unstaking', name: `Venice Token (unstaking, ${label})` }));
  }
  return assets;
}
