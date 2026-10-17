import 'server-only';
import { ethers } from 'ethers';

/**
 * Hedron (HDRN) on Ethereum and Pulsechain (same addresses; Pulsechain copied
 * them at the fork). Mirrors the verified Hedron source:
 *
 * - Any HEX stake mints HDRN: stakeShares × days served, minus days already
 *   minted (tracked in shareList[stakeId]), plus a launch bonus stored on the
 *   share and a daily "loan to mint" multiplier when over half of HDRN is loaned.
 * - HEX Stake Instances (HSIs) are HEX stakes held by per-stake contracts the
 *   HSI Manager creates. They don't show in the wallet's own HEX stake list,
 *   so they're read separately: plain HSIs via hsiLists, tokenized ones as
 *   ERC-721 tokens (hsiToken → instance address).
 */

export const HEDRON_ADDRESS = '0x3819f64f282bf135d62168C1e513280dAF905e06';
export const HSIM_ADDRESS = '0x8BD3d1472A656e312E94fB1BbdD599B8C51D18e3';
export const HDRN_DECIMALS = 9;

const HEDRON_LAUNCH = 1645833600; // 2022-02-26
const HEDRON_ABI = [
  'function shareList(uint256) view returns (tuple(uint40 stakeId, uint72 stakeShares, uint16 lockedDay, uint16 stakedDays) stake, uint16 mintedDays, uint8 launchBonus, uint16 loanStart, uint16 loanedDays, uint32 interestRate, uint8 paymentsMade, bool isLoaned)',
  'function dailyDataList(uint256) view returns (uint72 dayMintedTotal, uint72 dayLoanedTotal, uint72 dayBurntTotal, uint32 dayInterestRate, uint8 dayMintMultiplier)',
  'function loanedSupply() view returns (uint256)',
  'function totalSupply() view returns (uint256)',
];
const HSIM_ABI = [
  'function hsiCount(address user) view returns (uint256)',
  'function hsiLists(address, uint256) view returns (address)',
  'function balanceOf(address owner) view returns (uint256)',
  'function tokenOfOwnerByIndex(address owner, uint256 index) view returns (uint256)',
  'function hsiToken(uint256) view returns (address)',
];

export interface HsiRef {
  address: string;
  tokenId?: string; // set when the HSI is tokenized (an NFT in the wallet)
}

/** Every HSI the wallet controls: plain (hsiLists) and tokenized (ERC-721). */
export async function listHsis(provider: ethers.JsonRpcProvider, owner: string): Promise<HsiRef[]> {
  const hsim = new ethers.Contract(HSIM_ADDRESS, HSIM_ABI, provider);
  const [plainCount, tokenCount] = (await Promise.all([hsim.hsiCount(owner), hsim.balanceOf(owner)])).map(Number);

  const [plain, tokenized] = await Promise.all([
    Promise.all(Array.from({ length: plainCount }, (_, i) => hsim.hsiLists(owner, i) as Promise<string>)),
    Promise.all(Array.from({ length: tokenCount }, async (_, i) => {
      const tokenId: bigint = await hsim.tokenOfOwnerByIndex(owner, i);
      return { address: (await hsim.hsiToken(tokenId)) as string, tokenId: tokenId.toString() };
    })),
  ]);
  return [...plain.map((address) => ({ address })), ...tokenized].filter((h) => h.address !== ethers.ZeroAddress);
}

export interface HedronMintInfo {
  mintableHdrn: number;
  loaned: boolean;
}

interface MintContext {
  hedron: ethers.Contract;
  multiplier: number; // today's loan-to-mint bonus, ×10 scale
}

const contexts = new Map<string, { ctx: MintContext; at: number }>();

async function mintContext(chain: string, provider: ethers.JsonRpcProvider): Promise<MintContext> {
  const hit = contexts.get(chain);
  if (hit && Date.now() - hit.at < 60_000) return hit.ctx;

  const hedron = new ethers.Contract(HEDRON_ADDRESS, HEDRON_ABI, provider);
  const day = Math.floor((Date.now() / 1000 - HEDRON_LAUNCH) / 86_400);
  const [today, loaned, supply] = await Promise.all([hedron.dailyDataList(day), hedron.loanedSupply(), hedron.totalSupply()]);

  // Stored once the day has activity; otherwise compute it the way the contract will
  let multiplier = Number(today.dayMintMultiplier);
  if (Number(today.dayInterestRate) === 0 && loaned > BigInt(0) && supply > BigInt(0)) {
    const loanedToMinted = Number((loaned * BigInt(100)) / supply);
    multiplier = loanedToMinted > 50 ? (loanedToMinted - 50) * 2 : 0;
  }

  const ctx = { hedron, multiplier };
  contexts.set(chain, { ctx, at: Date.now() });
  return ctx;
}

/** HDRN a stake can mint right now, and whether it's collateral for an HDRN loan. */
export async function hedronMintable(
  chain: string,
  provider: ethers.JsonRpcProvider,
  stake: { stakeId: number; stakeShares: bigint; lockedDay: number; stakedDays: number },
  hexCurrentDay: number
): Promise<HedronMintInfo> {
  if (hexCurrentDay < stake.lockedDay) return { mintableHdrn: 0, loaned: false };

  const { hedron, multiplier } = await mintContext(chain, provider);
  const share = await hedron.shareList(stake.stakeId);
  const matches =
    Number(share.stake.stakeId) === stake.stakeId &&
    BigInt(share.stake.stakeShares) === stake.stakeShares &&
    Number(share.stake.lockedDay) === stake.lockedDay &&
    Number(share.stake.stakedDays) === stake.stakedDays;

  const servedDays = Math.min(hexCurrentDay - stake.lockedDay, stake.stakedDays);
  const mintDays = Math.max(0, servedDays - (matches ? Number(share.mintedDays) : 0));

  let payout = stake.stakeShares * BigInt(mintDays);
  const launchBonus = matches ? Number(share.launchBonus) : 0;
  if (launchBonus > 0) payout += (payout * BigInt(launchBonus)) / BigInt(10);
  if (multiplier > 0) payout += (payout * BigInt(multiplier)) / BigInt(10);

  return {
    mintableHdrn: Number(ethers.formatUnits(payout, HDRN_DECIMALS)),
    loaned: matches && Boolean(share.isLoaned),
  };
}
