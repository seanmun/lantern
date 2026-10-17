/**
 * HEX + Maximus DAO perpetual pool configuration.
 *
 * HEX staking lives inside the HEX token contract itself, at the same address
 * on Ethereum and Pulsechain. The Maximus pool contracts also share addresses
 * across both chains (Pulsechain forked Ethereum state), but each chain's pool
 * holds its own independent HEX stake.
 */

export const HEX_ADDRESS = '0x2b591e99afE9f32eAA6214f7B7629768c40Eeb39';
export const HEX_DECIMALS = 8;

// HEX day 0 began 2019-12-03 00:00 UTC
const HEX_LAUNCH_MS = Date.UTC(2019, 11, 3);
const DAY_MS = 24 * 60 * 60 * 1000;

export function hexDayToDate(day: number): Date {
  return new Date(HEX_LAUNCH_MS + day * DAY_MS);
}

export const HEX_ABI = [
  'function currentDay() view returns (uint256)',
  'function globalInfo() view returns (uint256[13])',
  'function dailyDataRange(uint256 beginDay, uint256 endDay) view returns (uint256[] list)',
  'function stakeCount(address stakerAddr) view returns (uint256)',
  'function stakeLists(address, uint256) view returns (uint40 stakeId, uint72 stakedHearts, uint72 stakeShares, uint16 lockedDay, uint16 stakedDays, uint16 unlockedDay, bool isAutoStake)',
];

export interface MaximusPool {
  symbol: string;
  name: string;
  address: string;
  cycleDays: number;
}

// Verified on-chain 2026-10-15: each contract holds a HEX stake of cycleDays length
export const MAXIMUS_POOLS: MaximusPool[] = [
  { symbol: 'MAXI', name: 'Maximus', address: '0x0d86EB9f43C57f6FF3BC9E23D8F9d82503f0e84b', cycleDays: 5555 },
  { symbol: 'DECI', name: 'Maximus Decimus', address: '0x6b32022693210cD2Cfc466b9Ac0085DE8fC34eA6', cycleDays: 3696 },
  { symbol: 'LUCKY', name: 'Maximus Lucky', address: '0x6B0956258fF7bd7645aa35369B55B61b8e6d6140', cycleDays: 2555 },
  { symbol: 'TRIO', name: 'Maximus Trio', address: '0xF55cD1e399e1cc3D95303048897a680be3313308', cycleDays: 1111 },
  { symbol: 'BASE', name: 'Maximus Base', address: '0xe9f84d418B008888A992Ff8c6D22389C2C3504e0', cycleDays: 369 },
];

// Ethereum pool tokens bridged to Pulsechain: no stake of their own; each is
// backed by its Ethereum pool, so it counts toward that pool's holdings
export const BRIDGED_MAXIMUS = [
  { symbol: 'eDECI', name: 'Maximus Decimus from Ethereum', address: '0x189a3CA3cC1337e85c7bC0a43b8d3457FD5AaE89', poolSymbol: 'DECI' },
  { symbol: 'eLUCKY', name: 'Maximus Lucky from Ethereum', address: '0x8924f56df76CA9e7babB53489D7bEF4fb7caFF19', poolSymbol: 'LUCKY' },
  { symbol: 'eTRIO', name: 'Maximus Trio from Ethereum', address: '0x0f3C6134F4022D85127476BC4d3787860E5C5569', poolSymbol: 'TRIO' },
  { symbol: 'eBASE', name: 'Maximus Base from Ethereum', address: '0xda073388422065Fe8D3B5921Ec2AE475Bae57BED', poolSymbol: 'BASE' },
];
