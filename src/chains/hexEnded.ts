import 'server-only';
import { ethers } from 'ethers';
import { HEX_ADDRESS, HEX_DECIMALS } from '@/config/hex';
import { EndedStake } from '@/types';

/**
 * A wallet's ended HEX stakes, from the contract's StakeEnd/StakeStart events.
 * Needs an RPC that serves eth_getLogs over the full history: Pulsechain's
 * public RPC does; Ethereum's public RPC doesn't (set ALCHEMY_API_KEY).
 */

const LAUNCH_TIME = 1575331200;
const HEX_DEPLOY_BLOCK = 9041184;
const FORK_BLOCK = 17233000;
const MASK_40 = (BigInt(1) << BigInt(40)) - BigInt(1);
const MASK_72 = (BigInt(1) << BigInt(72)) - BigInt(1);
const TTL_MS = 10 * 60_000;

const STAKE_START = ethers.id('StakeStart(uint256,address,uint40)');
const STAKE_END = ethers.id('StakeEnd(uint256,uint256,address,uint40)');
const coder = ethers.AbiCoder.defaultAbiCoder();
const dayOf = (timestamp: number) => Math.floor((timestamp - LAUNCH_TIME) / 86_400);
const hex = (hearts: bigint) => Number(ethers.formatUnits(hearts, HEX_DECIMALS));

const cache = new Map<string, { stakes: EndedStake[]; at: number }>();
let forkDay: number | null = null;

export async function getEndedStakes(chain: string, provider: ethers.JsonRpcProvider, address: string): Promise<EndedStake[]> {
  const key = `${chain}:${address.toLowerCase()}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.stakes;

  const staker = ethers.zeroPadValue(ethers.getAddress(address), 32);
  const range = { address: HEX_ADDRESS, fromBlock: HEX_DEPLOY_BLOCK, toBlock: 'latest' as const };
  const [ends, starts] = await Promise.all([
    provider.getLogs({ ...range, topics: [STAKE_END, staker] }),
    provider.getLogs({ ...range, topics: [STAKE_START, staker] }),
  ]);

  if (forkDay === null) {
    const block = await provider.getBlock(FORK_BLOCK);
    forkDay = block ? dayOf(block.timestamp) : 1257;
  }

  const startsById = new Map<string, bigint>();
  for (const log of starts) startsById.set(log.topics[2], BigInt(coder.decode(['uint256'], log.data)[0]));

  const stakes: EndedStake[] = [];
  for (const log of ends) {
    const [d0, d1] = coder.decode(['uint256', 'uint256'], log.data).map((v) => BigInt(v));
    const start = startsById.get(log.topics[2]);
    const stakedHearts = (d0 >> BigInt(40)) & MASK_72;
    const payout = (d0 >> BigInt(184)) & MASK_72;
    const penalty = d1 & MASK_72;
    const servedDays = Number((d1 >> BigInt(72)) & BigInt(0xffff));
    const stakedDays = start !== undefined ? Number((start >> BigInt(184)) & BigInt(0xffff)) : servedDays;
    const lockedDay = start !== undefined ? dayOf(Number(start & MASK_40)) + 1 : 0;
    const endedDay = dayOf(Number(d0 & MASK_40));
    const gross = stakedHearts + payout;

    stakes.push({
      chain,
      walletAddress: address,
      stakeId: Number(BigInt(log.topics[2])),
      stakedHex: hex(stakedHearts),
      payoutHex: hex(payout),
      penaltyHex: hex(penalty > gross ? gross : penalty),
      returnHex: hex(penalty > gross ? BigInt(0) : gross - penalty),
      stakedDays,
      servedDays,
      lockedDay,
      endedDay,
      outcome: servedDays < stakedDays ? 'early' : penalty > BigInt(0) ? 'late' : 'full',
      preFork: endedDay < forkDay,
    });
  }

  stakes.sort((a, b) => b.endedDay - a.endedDay);
  cache.set(key, { stakes, at: Date.now() });
  return stakes;
}
