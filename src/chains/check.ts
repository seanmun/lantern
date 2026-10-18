import 'server-only';
import { ethers } from 'ethers';
import { CheckResult, ContractCheck, TokenCheck, TxCheck, TxTransferCheck } from '@/types/check';
import { validateAddress } from '@/utils/address';
import { BRIDGED_MAXIMUS, HEX_ADDRESS, MAXIMUS_POOLS, MAXIMUS_TEAM_ADDRESS } from '@/config/hex';
import { createProvider, EvmChainConfig } from './evm';
import { ETHEREUM_CONFIG } from './ethereum';
import { PULSECHAIN_CONFIG } from './pulsechain';
import { BASE_CONFIG } from './base';
import { ROBINHOOD_CONFIG } from './robinhood';
import { BLOCKSCOUT_HOSTS } from './blockscout';
import { checkToken } from './tokenRisk';
import { HEDRON_ADDRESS, HSIM_ADDRESS } from './hedron';
import { ICOSA_ADDRESS } from './icosa';

/**
 * The public lookup behind /check: paste an address or a transaction hash.
 *
 * - A transaction is found by asking each EVM chain for its receipt; success or
 *   failure comes from the receipt itself (the PulseChain explorer has shown
 *   some reverted transactions as successful).
 * - An address with code is a token (ERC-20 calls answer) or another contract.
 *   PulseChain copied every Ethereum contract at its fork in May 2023, so a
 *   PulseChain token that also exists on Ethereum is flagged as a fork copy.
 * - Anything else is a wallet, which the page loads like a portfolio.
 */

const CHAINS: { key: string; config: EvmChainConfig; symbol: string }[] = [
  { key: 'pulsechain', config: PULSECHAIN_CONFIG, symbol: 'PLS' },
  { key: 'ethereum', config: ETHEREUM_CONFIG, symbol: 'ETH' },
  { key: 'base', config: BASE_CONFIG, symbol: 'ETH' },
  { key: 'robinhood', config: ROBINHOOD_CONFIG, symbol: 'ETH' },
];
const providers = new Map<string, ethers.JsonRpcProvider>();
const provider = (chain: string) => {
  let p = providers.get(chain);
  if (!p) providers.set(chain, (p = createProvider(CHAINS.find((c) => c.key === chain)!.config)));
  return p;
};

const TIMEOUT_MS = 12_000;
const MAX_UINT = ethers.MaxUint256;
const TRANSFER_TOPIC = ethers.id('Transfer(address,address,uint256)');
const ERC20 = new ethers.Interface([
  'function name() view returns (string)',
  'function symbol() view returns (string)',
  'function decimals() view returns (uint8)',
  'function totalSupply() view returns (uint256)',
]);
// Calls we can describe in plain English
const KNOWN_CALLS = new ethers.Interface([
  'function transfer(address to, uint256 amount)',
  'function approve(address spender, uint256 amount)',
  'function stakeStart(uint256 newStakedHearts, uint256 newStakedDays)',
  'function stakeEnd(uint256 stakeIndex, uint40 stakeIdParam)',
]);

// Well-known contracts, by lowercase address (the same on every chain they exist on)
const LABELS: Record<string, string> = Object.fromEntries([
  [HEX_ADDRESS, 'HEX'],
  [HEDRON_ADDRESS, 'Hedron (HDRN)'],
  [HSIM_ADDRESS, 'Hedron HEX Stake Instance manager'],
  [ICOSA_ADDRESS, 'Icosa (ICSA)'],
  [MAXIMUS_TEAM_ADDRESS, 'Maximus TEAM'],
  ...MAXIMUS_POOLS.map((p) => [p.address, `Maximus ${p.symbol} perpetual pool`]),
  ...BRIDGED_MAXIMUS.map((b) => [b.address, `${b.symbol} (Ethereum ${b.poolSymbol} bridged to PulseChain)`]),
  ['0x95B303987A60C71504D99Aa1b13B4DA07b0790ab', 'PulseX (PLSX)'],
  ['0x2fa878Ab3F87CC1C9737Fc071108F904c0B0C95d', 'Incentive (INC)'],
  ['0xA1077a294dDE1B09bB078844df40758a5D0f9a27', 'Wrapped PLS (WPLS)'],
  ['0xcA11bde05977b3631167028862bE2a173976CA11', 'Multicall3'],
].map(([a, l]) => [a.toLowerCase(), l]));
export const labelOf = (address: string | null | undefined) => (address ? LABELS[address.toLowerCase()] : undefined);

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
const who = (a: string) => labelOf(a) ?? short(a);
const fmt = (v: number) =>
  v >= 1e9 ? `${(v / 1e9).toFixed(2)}B` : v >= 1e6 ? `${(v / 1e6).toFixed(2)}M` : v.toLocaleString('en-US', { maximumFractionDigits: v >= 1 ? 2 : 6 });

const withTimeout = <T,>(p: Promise<T>, ms = TIMEOUT_MS) =>
  Promise.race([p, new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), ms))]);

async function getJSON<T>(url: string): Promise<T | null> {
  try {
    const response = await fetch(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(TIMEOUT_MS) });
    return response.ok ? ((await response.json()) as T) : null;
  } catch {
    return null;
  }
}

// --- function names ----------------------------------------------------------

const selectorCache = new Map<string, string | null>();
async function methodName(input: string): Promise<string | null> {
  if (!input || input === '0x' || input.length < 10) return null;
  try {
    const known = KNOWN_CALLS.parseTransaction({ data: input });
    if (known) return known.name;
  } catch {
    // not one of ours: look it up
  }
  const selector = input.slice(0, 10).toLowerCase();
  if (!selectorCache.has(selector)) {
    const body = await getJSON<{ result?: { function?: Record<string, { name: string; hasVerifiedContract?: boolean }[] | null> } }>(
      `https://api.openchain.xyz/signature-database/v1/lookup?filter=true&function=${selector}`
    );
    // Selectors collide; prefer a name seen in a verified contract
    const names = body?.result?.function?.[selector] ?? [];
    const best = names.find((n) => n.hasVerifiedContract) ?? names[0];
    selectorCache.set(selector, best?.name.split('(')[0] ?? null);
  }
  return selectorCache.get(selector)!;
}

// --- tokens ------------------------------------------------------------------

async function erc20(chain: string, address: string) {
  const c = new ethers.Contract(address, ERC20, provider(chain));
  const [name, symbol, decimals, supply] = await Promise.all([
    withTimeout(c.name()).catch(() => null),
    withTimeout(c.symbol()).catch(() => null),
    withTimeout(c.decimals()).catch(() => null),
    withTimeout(c.totalSupply()).catch(() => null),
  ]);
  if (symbol === null || decimals === null) return null;
  return {
    name: String(name ?? symbol),
    symbol: String(symbol),
    decimals: Number(decimals),
    totalSupply: supply !== null ? Number(ethers.formatUnits(supply as bigint, Number(decimals))) : null,
  };
}

async function market(chain: string, address: string) {
  const pairs = await getJSON<{ baseToken: { address: string }; priceUsd?: string; liquidity?: { usd?: number }; volume?: { h24?: number } }[]>(
    `https://api.dexscreener.com/tokens/v1/${chain}/${address}`
  );
  const mine = (pairs ?? []).filter((p) => p.baseToken.address.toLowerCase() === address.toLowerCase());
  const best = mine.sort((a, b) => (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0))[0];
  return {
    priceUSD: best?.priceUsd ? Number(best.priceUsd) : null,
    liquidityUSD: mine.length ? mine.reduce((s, p) => s + (p.liquidity?.usd ?? 0), 0) : null,
    volume24hUSD: mine.length ? mine.reduce((s, p) => s + (p.volume?.h24 ?? 0), 0) : null,
  };
}

async function holders(chain: string, address: string): Promise<number | null> {
  const host = BLOCKSCOUT_HOSTS[chain];
  if (!host) return null;
  const token = await getJSON<{ holders?: string; holders_count?: string }>(`${host}/api/v2/tokens/${address}`);
  const n = Number(token?.holders_count ?? token?.holders);
  return Number.isFinite(n) && n > 0 ? n : null;
}

async function tokenCheck(chain: string, address: string, meta: NonNullable<Awaited<ReturnType<typeof erc20>>>): Promise<TokenCheck> {
  const [risk, mkt, holderCount, ethTwin] = await Promise.all([
    checkToken(chain, address).catch(() => null),
    market(chain, address),
    holders(chain, address),
    chain === 'pulsechain'
      ? provider('ethereum').getCode(address).then(async (code) => {
        if (code === '0x') return null;
        const eth = await erc20('ethereum', address);
        return eth ? { ethereumSymbol: eth.symbol, ethereumPriceUSD: (await market('ethereum', address)).priceUSD } : null;
      }).catch(() => null)
      : Promise.resolve(null),
  ]);
  return {
    chain,
    address,
    ...meta,
    ...mkt,
    holders: holderCount,
    verdict: risk?.verdict ?? 'unknown',
    signals: risk?.signals ?? [],
    label: labelOf(address),
    ...(ethTwin && { forkCopy: ethTwin }),
  };
}

async function contractCheck(chain: string, address: string): Promise<ContractCheck> {
  const host = BLOCKSCOUT_HOSTS[chain];
  const info = host ? await getJSON<{ name?: string; is_verified?: boolean }>(`${host}/api/v2/smart-contracts/${address}`) : null;
  return { chain, address, name: info?.name ?? null, verified: !!info?.is_verified, label: labelOf(address) };
}

// --- transactions ------------------------------------------------------------

async function findTx(hash: string) {
  const found = await Promise.all(CHAINS.map(async (c) => {
    try {
      const tx = await withTimeout(provider(c.key).getTransaction(hash));
      return tx ? { chain: c, tx } : null;
    } catch {
      return null;
    }
  }));
  return found.find((f) => f !== null) ?? null;
}

async function txCheck(hash: string): Promise<TxCheck | null> {
  const hit = await findTx(hash);
  if (!hit) return null;
  const { chain, tx } = hit;
  const p = provider(chain.key);
  const [receipt, method, toContract] = await Promise.all([
    withTimeout(p.getTransactionReceipt(hash)).catch(() => null),
    methodName(tx.data),
    // Name the contract called, from its verified source, when it isn't a well-known one
    tx.to && !labelOf(tx.to) ? contractCheck(chain.key, tx.to).catch(() => null) : Promise.resolve(null),
  ]);
  const block = receipt ? await withTimeout(p.getBlock(receipt.blockNumber)).catch(() => null) : null;

  // Token movements from Transfer events (ERC-20: 3 topics; NFTs: 4)
  const transferLogs = (receipt?.logs ?? []).filter((l) => l.topics[0] === TRANSFER_TOPIC && (l.topics.length === 3 || l.topics.length === 4)).slice(0, 25);
  const tokens = [...new Set(transferLogs.map((l) => l.address.toLowerCase()))].slice(0, 12);
  const metas = new Map(await Promise.all(tokens.map(async (t) => [t, await erc20(chain.key, t).catch(() => null)] as const)));
  const transfers: TxTransferCheck[] = transferLogs.map((l) => {
    const meta = metas.get(l.address.toLowerCase());
    const nft = l.topics.length === 4;
    return {
      token: l.address,
      symbol: meta?.symbol ?? (nft ? 'NFT' : short(l.address)),
      amount: nft || !meta ? null : Number(ethers.formatUnits(BigInt(l.data), meta.decimals)),
      from: ethers.getAddress(`0x${l.topics[1].slice(26)}`),
      to: ethers.getAddress(`0x${l.topics[2].slice(26)}`),
      nft,
    };
  });

  const status = !receipt ? 'pending' : receipt.status === 1 ? 'success' : 'failed';
  const feeNative = receipt ? Number(ethers.formatEther(receipt.gasUsed * (receipt.gasPrice ?? tx.gasPrice ?? BigInt(0)))) : null;
  const value = Number(ethers.formatEther(tx.value));
  const result: TxCheck = {
    chain: chain.key,
    hash,
    status,
    blockNumber: receipt?.blockNumber ?? null,
    timestamp: block ? block.timestamp * 1000 : null,
    from: tx.from,
    to: tx.to,
    toLabel: labelOf(tx.to) ?? toContract?.name ?? undefined,
    value,
    nativeSymbol: chain.symbol,
    feeNative,
    method,
    transfers,
    summary: '',
  };
  // Approvals name what they approve: the token's symbol and the spender's verified name
  let approval: { token: string; spender: string } | undefined;
  if (method === 'approve' && tx.to) {
    try {
      const args = KNOWN_CALLS.decodeFunctionData('approve', tx.data);
      const [meta, spender] = await Promise.all([erc20(chain.key, tx.to).catch(() => null), contractCheck(chain.key, args[0]).catch(() => null)]);
      approval = { token: labelOf(tx.to) ?? meta?.symbol ?? short(tx.to), spender: labelOf(args[0]) ?? spender?.name ?? short(args[0]) };
    } catch {
      approval = undefined;
    }
  }
  result.summary = summarize(result, tx.data, approval);
  return result;
}

/** One or two plain sentences on what the transaction did. */
function summarize(t: TxCheck, data: string, approval?: { token: string; spender: string }): string {
  const fee = t.feeNative !== null ? ` The fee was ${fmt(t.feeNative)} ${t.nativeSymbol}.` : '';
  if (t.status === 'pending') return 'This transaction has not been included in a block yet.';
  if (t.status === 'failed') {
    return `This transaction failed: it was reverted, so nothing moved except the fee.${t.method ? ` It tried to call ${t.method}${t.toLabel ? ` on ${t.toLabel}` : ''}.` : ''}${fee}`;
  }
  if (!t.to) return `Deployed a new contract.${fee}`;

  let parsed: ethers.TransactionDescription | null = null;
  try {
    parsed = KNOWN_CALLS.parseTransaction({ data });
  } catch {
    parsed = null;
  }
  const isHex = t.to.toLowerCase() === HEX_ADDRESS.toLowerCase();
  if (parsed?.name === 'stakeStart' && isHex) {
    return `Started a HEX stake of ${fmt(Number(ethers.formatUnits(parsed.args[0], 8)))} HEX for ${Number(parsed.args[1]).toLocaleString()} days.${fee}`;
  }
  if (parsed?.name === 'stakeEnd' && isHex) {
    const back = t.transfers.find((x) => x.to.toLowerCase() === t.from.toLowerCase() && x.token.toLowerCase() === HEX_ADDRESS.toLowerCase());
    return `Ended HEX stake #${parsed.args[1]}${back?.amount ? `, returning ${fmt(back.amount)} HEX` : ''}.${fee}`;
  }
  if (parsed?.name === 'approve') {
    const token = approval?.token ?? labelOf(t.to) ?? short(t.to);
    const unlimited = BigInt(parsed.args[1]) >= MAX_UINT / BigInt(2);
    return `Approved ${approval?.spender ?? who(parsed.args[0])} to spend ${unlimited ? 'an unlimited amount of' : 'some'} ${token} from this wallet.${unlimited ? ' Unlimited approvals stay open until revoked.' : ''}${fee}`;
  }

  // Swaps: the sender gives one token and gets another back
  const me = t.from.toLowerCase();
  const out = t.transfers.filter((x) => x.from.toLowerCase() === me && x.amount !== null);
  const into = t.transfers.filter((x) => x.to.toLowerCase() === me && x.amount !== null);
  const gave = out[0] ? `${fmt(out[0].amount!)} ${out[0].symbol}` : t.value > 0 ? `${fmt(t.value)} ${t.nativeSymbol}` : null;
  const got = into[into.length - 1] ? `${fmt(into[into.length - 1].amount!)} ${into[into.length - 1].symbol}` : null;
  if (gave && got && (out[0]?.symbol ?? t.nativeSymbol) !== into[into.length - 1].symbol) return `Swapped ${gave} for ${got}.${fee}`;

  if (t.transfers.length === 1 && t.transfers[0].amount !== null) {
    const x = t.transfers[0];
    return `Sent ${fmt(x.amount!)} ${x.symbol} from ${who(x.from)} to ${who(x.to)}.${fee}`;
  }
  if (t.transfers.length === 0 && t.value > 0 && (data === '0x' || !data)) {
    return `Sent ${fmt(t.value)} ${t.nativeSymbol} from ${who(t.from)} to ${who(t.to)}.${fee}`;
  }
  const moved = t.transfers.length ? ` ${t.transfers.length} token transfer${t.transfers.length === 1 ? '' : 's'}.` : '';
  return `Called ${t.method ?? 'a contract function'} on ${t.toLabel ?? short(t.to)}.${moved}${fee}`;
}

// --- entry -------------------------------------------------------------------

const TX_RE = /^0x[0-9a-fA-F]{64}$/;

export async function check(query: string): Promise<CheckResult> {
  const q = query.trim();
  if (TX_RE.test(q)) {
    const tx = await txCheck(q);
    return tx ? { kind: 'tx', tx } : { kind: 'not-found', message: 'No transaction with this hash on PulseChain, Ethereum, Base or Robinhood Chain.' };
  }

  const validation = validateAddress(q);
  if (!validation.isValid) return { kind: 'invalid', message: 'Paste a wallet address, a token contract address or a transaction hash.' };
  if (validation.format !== 'hex') return { kind: 'wallet', address: q, chains: validation.compatibleChains };

  const address = ethers.getAddress(q.toLowerCase());
  const codes = await Promise.all(CHAINS.map((c) => withTimeout(provider(c.key).getCode(address)).catch(() => '0x')));
  // EIP-7702: a regular wallet that delegates to a contract carries a 23-byte 0xef0100… stub. Still a wallet.
  const isContract = (code: string) => code !== '0x' && !code.toLowerCase().startsWith('0xef0100');
  const withCode = CHAINS.filter((_, i) => isContract(codes[i]));
  if (withCode.length === 0) return { kind: 'wallet', address, chains: [...validation.compatibleChains] };

  const metas = await Promise.all(withCode.map((c) => erc20(c.key, address).catch(() => null)));
  const tokenChains = withCode.filter((_, i) => metas[i]);
  if (tokenChains.length) {
    const tokens = await Promise.all(tokenChains.map((c) => tokenCheck(c.key, address, metas[withCode.indexOf(c)]!)));
    return { kind: 'token', tokens };
  }
  return { kind: 'contract', contracts: await Promise.all(withCode.map((c) => contractCheck(c.key, address))) };
}
