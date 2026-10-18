import 'server-only';
import { ethers } from 'ethers';
import { ApprovalItem, ApprovalsReport, ChainApprovals } from '@/types/approvals';
import { createProvider, EvmChainConfig } from './evm';
import { PULSECHAIN_CONFIG } from './pulsechain';
import { ETHEREUM_CONFIG } from './ethereum';
import { BLOCKSCOUT_HOSTS } from './blockscout';
import { labelOf } from './check';

/**
 * Open token approvals for a wallet: permissions it granted contracts (or
 * anyone) to spend its tokens, which stay open until revoked. Forgotten
 * unlimited approvals are what wallet drainers exploit.
 *
 * 1. Every Approval / ApprovalForAll event the wallet ever emitted:
 *    PulseChain's RPC serves the full history in one query; Ethereum's public
 *    RPCs don't, so its events come from Blockscout's indexed log API.
 * 2. Each (token, spender) pair is re-read from the token itself, which is
 *    the source of truth: only approvals still open are kept.
 * 3. Each is ranked by what could go wrong: approvals to a plain wallet,
 *    unlimited approvals to unverified contracts, and value at stake.
 *
 * Lantern stays read-only: revoking is done in the user's wallet (we link to
 * revoke.cash, which lists the same approvals and builds the revoke transactions).
 */

const APPROVAL = ethers.id('Approval(address,address,uint256)');
const APPROVAL_FOR_ALL = ethers.id('ApprovalForAll(address,address,bool)');
const MULTICALL3 = '0xcA11bde05977b3631167028862bE2a173976CA11';
const UNLIMITED = ethers.MaxUint256 / BigInt(2);
const MAX_PAIRS = 400;
const MAX_SPENDER_LOOKUPS = 40;
const TIMEOUT_MS = 30_000;
// PulseChain copied Ethereum's state at this block (May 2023), approvals included
const PULSECHAIN_FORK_BLOCK = 17_233_000;

const CHAINS: Record<string, { config: EvmChainConfig; logs: 'rpc' | 'blockscout'; chainId: number }> = {
  pulsechain: { config: PULSECHAIN_CONFIG, logs: 'rpc', chainId: 369 },
  ethereum: { config: ETHEREUM_CONFIG, logs: 'blockscout', chainId: 1 },
};
export const APPROVAL_CHAINS = Object.keys(CHAINS);

const multicallAbi = new ethers.Interface(['function aggregate3((address target, bool allowFailure, bytes callData)[] calls) view returns ((bool success, bytes returnData)[])']);
const erc20 = new ethers.Interface([
  'function allowance(address owner, address spender) view returns (uint256)',
  'function balanceOf(address owner) view returns (uint256)',
  'function symbol() view returns (string)',
  'function decimals() view returns (uint8)',
  'function isApprovedForAll(address owner, address operator) view returns (bool)',
]);

interface RawLog { address: string; topics: string[]; data: string; blockNumber: number }

async function getJSON<T>(url: string): Promise<T | null> {
  try {
    const response = await fetch(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(TIMEOUT_MS) });
    return response.ok ? ((await response.json()) as T) : null;
  } catch {
    return null;
  }
}

async function approvalLogs(chain: string, owner: string, provider: ethers.JsonRpcProvider): Promise<RawLog[]> {
  const ownerTopic = ethers.zeroPadValue(owner, 32).toLowerCase();
  if (CHAINS[chain].logs === 'rpc') {
    const logs = await provider.getLogs({ fromBlock: 0, toBlock: 'latest', topics: [[APPROVAL, APPROVAL_FOR_ALL], ownerTopic] });
    return logs.map((l) => ({ address: l.address, topics: [...l.topics], data: l.data, blockNumber: l.blockNumber }));
  }
  const host = BLOCKSCOUT_HOSTS[chain];
  const fetchTopic = async (topic0: string) => {
    const body = await getJSON<{ result?: { address: string; topics: (string | null)[]; data: string; blockNumber: string }[] | string }>(
      `${host}/api?module=logs&action=getLogs&fromBlock=0&toBlock=latest&topic0=${topic0}&topic1=${ownerTopic}&topic0_1_opr=and`
    );
    if (!body || !Array.isArray(body.result)) return [];
    return body.result.map((l) => ({ address: l.address, topics: l.topics.filter((t): t is string => !!t), data: l.data, blockNumber: parseInt(l.blockNumber, 16) }));
  };
  return (await Promise.all([fetchTopic(APPROVAL), fetchTopic(APPROVAL_FOR_ALL)])).flat();
}

async function multicall(provider: ethers.JsonRpcProvider, calls: { target: string; data: string }[]) {
  const out: { success: boolean; returnData: string }[] = [];
  for (let i = 0; i < calls.length; i += 200) {
    const chunk = calls.slice(i, i + 200);
    const data = multicallAbi.encodeFunctionData('aggregate3', [chunk.map((c) => ({ target: c.target, allowFailure: true, callData: c.data }))]);
    const raw = await provider.call({ to: MULTICALL3, data });
    out.push(...(multicallAbi.decodeFunctionResult('aggregate3', raw)[0] as { success: boolean; returnData: string }[]));
  }
  return out;
}

const decode = <T,>(fn: string, r: { success: boolean; returnData: string } | undefined): T | null => {
  if (!r?.success || r.returnData === '0x') return null;
  try {
    return erc20.decodeFunctionResult(fn, r.returnData)[0] as T;
  } catch {
    return null;
  }
};

async function prices(chain: string, tokens: string[]): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  for (let i = 0; i < tokens.length; i += 30) {
    const pairs = await getJSON<{ baseToken: { address: string }; priceUsd?: string; liquidity?: { usd?: number } }[]>(
      `https://api.dexscreener.com/tokens/v1/${chain}/${tokens.slice(i, i + 30).join(',')}`
    );
    const depth = new Map<string, number>();
    for (const p of pairs ?? []) {
      const a = p.baseToken.address.toLowerCase();
      const liq = p.liquidity?.usd ?? 0;
      // Ignore dust pools, where a fake token can show any price
      if (p.priceUsd && liq >= 1_000 && liq >= (depth.get(a) ?? -1)) {
        depth.set(a, liq);
        map.set(a, Number(p.priceUsd));
      }
    }
  }
  return map;
}

async function spenderInfo(chain: string, provider: ethers.JsonRpcProvider, spenders: string[]) {
  const info = new Map<string, { isContract: boolean; name: string | null; verified: boolean }>();
  const host = BLOCKSCOUT_HOSTS[chain];
  await Promise.all(spenders.slice(0, MAX_SPENDER_LOOKUPS).map(async (s) => {
    const code = await provider.getCode(s).catch(() => '0x');
    // An EIP-7702 delegation stub is still a personal wallet
    const isContract = code !== '0x' && !code.toLowerCase().startsWith('0xef0100');
    const meta = isContract && host ? await getJSON<{ name?: string; is_verified?: boolean }>(`${host}/api/v2/smart-contracts/${s}`) : null;
    info.set(s.toLowerCase(), { isContract, name: labelOf(s) ?? meta?.name ?? null, verified: !!meta?.is_verified || !!labelOf(s) });
  }));
  return info;
}

function assess(item: Omit<ApprovalItem, 'risk' | 'reasons'>): Pick<ApprovalItem, 'risk' | 'reasons'> {
  const reasons: string[] = [];
  let risk: ApprovalItem['risk'] = 'low';
  const bump = (r: ApprovalItem['risk']) => {
    if (r === 'high' || (r === 'medium' && risk === 'low')) risk = r;
  };
  const what = item.kind === 'nft-all' ? 'all your NFTs in this collection' : item.unlimited ? 'an unlimited amount' : 'part of your balance';

  if (!item.spenderIsContract) {
    reasons.push(`Approved to a personal wallet, not a contract: that wallet can take ${what}. This is a common phishing trick.`);
    bump('high');
  } else if (!item.spenderVerified) {
    reasons.push('Approved to a contract whose source code isn’t verified, so no one can check what it does.');
    bump(item.unlimited || item.kind === 'nft-all' ? 'high' : 'medium');
  }
  if (item.kind === 'nft-all') {
    if (item.spenderIsContract && item.spenderVerified) reasons.push('Can move every NFT you hold in this collection.');
    bump('medium');
  } else if (item.unlimited) {
    if ((item.valueAtRiskUSD ?? 0) >= 100) {
      reasons.push('Unlimited: if this contract is ever exploited, your whole balance of this token could be taken.');
      bump('medium');
    } else if ((item.balance ?? 0) === 0) {
      reasons.push('Unlimited, though you hold none of this token now. Anything you receive later is covered too.');
    } else {
      reasons.push('Unlimited, on a small balance.');
    }
  }
  if (item.chain === 'pulsechain' && item.lastApprovedBlock < PULSECHAIN_FORK_BLOCK) {
    reasons.push('Inherited from Ethereum: you granted this before PulseChain’s May 2023 fork, which copied it here. If you never use this contract on PulseChain, it’s safe to revoke.');
  }
  if (reasons.length === 0) reasons.push('Limited approval to a verified contract.');
  return { risk, reasons };
}

async function chainApprovals(chain: string, owner: string): Promise<ChainApprovals> {
  const { config, chainId } = CHAINS[chain];
  const provider = createProvider(config);
  const logs = await approvalLogs(chain, owner, provider);

  // Latest event per (token, spender); single-NFT approvals are cleared by transfers, so they're skipped
  const pairs = new Map<string, { token: string; spender: string; kind: ApprovalItem['kind']; block: number }>();
  for (const l of logs) {
    if (l.topics.length !== 3) continue;
    const kind: ApprovalItem['kind'] = l.topics[0] === APPROVAL_FOR_ALL ? 'nft-all' : 'erc20';
    const spender = ethers.getAddress(`0x${l.topics[2].slice(26)}`);
    const key = `${l.address.toLowerCase()}:${spender.toLowerCase()}:${kind}`;
    if (!pairs.has(key) || pairs.get(key)!.block < l.blockNumber) pairs.set(key, { token: ethers.getAddress(l.address), spender, kind, block: l.blockNumber });
  }
  const list = [...pairs.values()].slice(0, MAX_PAIRS);
  if (list.length === 0) return { chain, chainId, items: [], scanned: logs.length };

  // Which are still open?
  const state = await multicall(provider, list.map((p) => ({
    target: p.token,
    data: p.kind === 'nft-all' ? erc20.encodeFunctionData('isApprovedForAll', [owner, p.spender]) : erc20.encodeFunctionData('allowance', [owner, p.spender]),
  })));
  const open = list
    .map((p, i) => ({ ...p, allowance: p.kind === 'erc20' ? decode<bigint>('allowance', state[i]) : null, all: p.kind === 'nft-all' ? decode<boolean>('isApprovedForAll', state[i]) : null }))
    .filter((p) => (p.kind === 'erc20' ? (p.allowance ?? BigInt(0)) > BigInt(0) : p.all === true));
  if (open.length === 0) return { chain, chainId, items: [], scanned: logs.length };

  // Token metadata and the wallet's balances
  const tokens = [...new Set(open.map((p) => p.token))];
  const meta = await multicall(provider, tokens.flatMap((t) => [
    { target: t, data: erc20.encodeFunctionData('symbol') },
    { target: t, data: erc20.encodeFunctionData('decimals') },
    { target: t, data: erc20.encodeFunctionData('balanceOf', [owner]) },
  ]));
  const tokenMeta = new Map(tokens.map((t, i) => {
    const decimals = decode<bigint>('decimals', meta[i * 3 + 1]);
    return [t, { symbol: decode<string>('symbol', meta[i * 3]) ?? '?', decimals: decimals !== null ? Number(decimals) : null, balance: decode<bigint>('balanceOf', meta[i * 3 + 2]) }];
  }));
  const [priceMap, spenders] = await Promise.all([
    prices(chain, tokens.filter((t) => tokenMeta.get(t)?.decimals !== null)),
    spenderInfo(chain, provider, [...new Set(open.map((p) => p.spender))]),
  ]);

  const items: ApprovalItem[] = open.map((p) => {
    const m = tokenMeta.get(p.token)!;
    const s = spenders.get(p.spender.toLowerCase()) ?? { isContract: true, name: null, verified: false };
    const unit = (v: bigint | null) => (v !== null && m.decimals !== null ? Number(ethers.formatUnits(v, m.decimals)) : null);
    const unlimited = p.kind === 'erc20' && (p.allowance ?? BigInt(0)) >= UNLIMITED;
    const balance = p.kind === 'erc20' ? unit(m.balance) : null;
    const price = priceMap.get(p.token.toLowerCase()) ?? null;
    const exposed = p.kind === 'erc20' && balance !== null ? (unlimited ? balance : Math.min(balance, unit(p.allowance) ?? 0)) : null;
    const base = {
      chain,
      token: p.token,
      tokenSymbol: m.symbol,
      kind: p.kind,
      spender: p.spender,
      spenderName: s.name,
      spenderVerified: s.verified,
      spenderIsContract: s.isContract,
      allowance: unlimited ? null : unit(p.allowance),
      unlimited,
      balance,
      valueAtRiskUSD: exposed !== null && price !== null ? exposed * price : null,
      lastApprovedBlock: p.block,
    };
    return { ...base, ...assess(base) };
  });

  const order = { high: 0, medium: 1, low: 2 };
  items.sort((a, b) => order[a.risk] - order[b.risk] || (b.valueAtRiskUSD ?? 0) - (a.valueAtRiskUSD ?? 0));
  return { chain, chainId, items, scanned: logs.length };
}

export async function walletApprovals(owner: string, chains = APPROVAL_CHAINS): Promise<ApprovalsReport> {
  const address = ethers.getAddress(owner.toLowerCase());
  const results = await Promise.all(chains.filter((c) => CHAINS[c]).map((c) => chainApprovals(c, address).catch((error) => {
    console.warn(`⚠️ approvals failed on ${c}:`, error instanceof Error ? error.message : error);
    return { chain: c, chainId: CHAINS[c].chainId, items: [], scanned: 0, error: 'Couldn’t read approvals on this chain right now.' } as ChainApprovals;
  })));
  return { address, chains: results };
}
