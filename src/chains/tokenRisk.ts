import 'server-only';
import { ethers } from 'ethers';
import { createProvider, EvmChainConfig } from './evm';
import { ETHEREUM_CONFIG } from './ethereum';
import { PULSECHAIN_CONFIG } from './pulsechain';
import { BASE_CONFIG } from './base';
import { ROBINHOOD_CONFIG } from './robinhood';
import { HEX_ADDRESS } from '@/config/hex';
import { simulateTrade } from './honeypot';

/**
 * Token risk check. Principles (agreed with the user):
 * - Judge behaviour and contract evidence, never reputation: CoinGecko listing,
 *   reviews or "scam" labels are not inputs.
 * - Core coins are exempt. Proof of real two-way trading clears a token of
 *   weak signals. Missing data (e.g. scanners that don't cover Pulsechain)
 *   counts as unknown, never as risky.
 * - One strong signal (a balance for a never-used wallet, a confirmed honeypot,
 *   a sell tax over 50%) means scam; weak signals need company.
 */

export type RiskVerdict = 'trusted' | 'ok' | 'suspicious' | 'scam' | 'unknown';

export interface RiskSignal {
  id: string;
  strength: 'strong' | 'weak' | 'info' | 'good';
  label: string;
}

export interface TokenRiskReport {
  chain: string;
  address: string;
  verdict: RiskVerdict;
  signals: RiskSignal[];
  checkedAt: number;
}

const CONFIGS: Record<string, EvmChainConfig> = {
  ethereum: ETHEREUM_CONFIG,
  pulsechain: PULSECHAIN_CONFIG,
  base: BASE_CONFIG,
  robinhood: ROBINHOOD_CONFIG,
};

// Core coins: never flagged (the native PLS has no contract and isn't checked)
const CORE: Record<string, string[]> = {
  ethereum: [HEX_ADDRESS],
  pulsechain: [
    HEX_ADDRESS,
    '0x95B303987A60C71504D99Aa1b13B4DA07b0790ab', // PLSX
    '0x2fa878Ab3F87CC1C9737Fc071108F904c0B0C95d', // INC
    '0xF6f8Db0aBa00007681F8fAF16A0FDa1c9B030b11', // PRVX
    '0xA1077a294dDE1B09bB078844df40758a5D0f9a27', // WPLS (wrapped native PLS)
  ],
};

const GOPLUS_CHAIN: Record<string, number> = { ethereum: 1, base: 8453 };
const HONEYPOT_CHAIN: Record<string, number> = { ethereum: 1, base: 8453 };
const DEXSCREENER_CHAIN: Record<string, string> = { ethereum: 'ethereum', pulsechain: 'pulsechain', base: 'base', robinhood: 'robinhood' };

// Real, two-way trading that a fake pool can't cheaply imitate
const CLEAR = { sells24h: 100, volume24h: 10_000, liquidity: 25_000 };
const EIP1967_IMPL_SLOT = '0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc';
const RISKY_FN = /(^|_)(set|update)?(buy|sell|transfer)?(fee|tax)|blacklist|bot|whitelist|pause|maxtx|maxwallet|enabletrading|opentrading|cooldown|setbalance|excludefrom/i;

const TTL_MS = 6 * 60 * 60 * 1000;
const cache = new Map<string, TokenRiskReport>();
const selectorNames = new Map<string, string | null>();

export const isCore = (chain: string, address: string) =>
  (CORE[chain] ?? []).some((a) => a.toLowerCase() === address.toLowerCase());

async function getJSON<T>(url: string): Promise<T | null> {
  try {
    const response = await fetch(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(15_000) });
    return response.ok ? ((await response.json()) as T) : null;
  } catch {
    return null;
  }
}

/** 4-byte selectors pushed by the contract's function dispatcher. */
function extractSelectors(code: string): string[] {
  const bytes = ethers.getBytes(code);
  const found = new Set<string>();
  for (let i = 0; i < bytes.length; i++) {
    const op = bytes[i];
    if (op === 0x63 && i + 4 < bytes.length) found.add(ethers.hexlify(bytes.slice(i + 1, i + 5)));
    if (op >= 0x60 && op <= 0x7f) i += op - 0x5f; // skip PUSH1..PUSH32 data
  }
  return [...found];
}

async function nameSelectors(selectors: string[]): Promise<string[]> {
  const unknown = selectors.filter((s) => !selectorNames.has(s)).slice(0, 150);
  if (unknown.length) {
    const body = await getJSON<{ result?: { function?: Record<string, { name: string }[] | null> } }>(
      `https://api.openchain.xyz/signature-database/v1/lookup?filter=true&function=${unknown.join(',')}`
    );
    for (const s of unknown) selectorNames.set(s, body?.result?.function?.[s]?.[0]?.name ?? null);
  }
  return selectors.map((s) => selectorNames.get(s)).filter((n): n is string => !!n);
}

async function contractEvidence(chain: string, address: string, signals: RiskSignal[]) {
  const provider = createProvider(CONFIGS[chain]);
  const token = new ethers.Contract(address, ['function balanceOf(address) view returns (uint256)'], provider);
  const neverUsed = ethers.Wallet.createRandom().address;

  const [code, ghost, implSlot] = await Promise.all([
    provider.getCode(address),
    token.balanceOf(neverUsed).catch(() => null) as Promise<bigint | null>,
    provider.getStorage(address, EIP1967_IMPL_SLOT).catch(() => ethers.ZeroHash),
  ]);
  if (code === '0x') return;

  if (ghost !== null && ghost > BigInt(0)) {
    signals.push({ id: 'ghost-balance', strength: 'strong', label: 'Reports a balance for a brand-new wallet that never received any (fake airdrop)' });
  }
  if (BigInt(implSlot) !== BigInt(0)) {
    signals.push({ id: 'upgradeable', strength: 'info', label: 'Upgradeable: its code can be replaced by an admin' });
  }

  const names = await nameSelectors(extractSelectors(code));
  const risky = [...new Set(names.filter((n) => RISKY_FN.test(n.split('(')[0])).map((n) => n.split('(')[0]))].slice(0, 6);
  if (risky.length) {
    signals.push({ id: 'risky-functions', strength: 'weak', label: `Owner-style controls in the code: ${risky.join(', ')}` });
  }
}

interface DexPair { liquidity?: { usd?: number }; volume?: { h24?: number }; txns?: { h24?: { buys?: number; sells?: number } }; fdv?: number }

async function marketEvidence(chain: string, address: string, signals: RiskSignal[]): Promise<boolean> {
  const pairs = await getJSON<DexPair[]>(`https://api.dexscreener.com/tokens/v1/${DEXSCREENER_CHAIN[chain]}/${address}`);
  if (!pairs || pairs.length === 0) return false;
  const liquidity = pairs.reduce((s, p) => s + (p.liquidity?.usd ?? 0), 0);
  const volume = pairs.reduce((s, p) => s + (p.volume?.h24 ?? 0), 0);
  const sells = pairs.reduce((s, p) => s + (p.txns?.h24?.sells ?? 0), 0);
  const fdv = Math.max(0, ...pairs.map((p) => p.fdv ?? 0));

  const cleared = sells >= CLEAR.sells24h && volume >= CLEAR.volume24h && liquidity >= CLEAR.liquidity;
  if (cleared) {
    signals.push({ id: 'trades-freely', strength: 'good', label: `Trades freely: ${sells.toLocaleString()} sells and $${Math.round(volume).toLocaleString()} volume in 24h` });
  } else if (liquidity > 1_000 && sells < 5) {
    signals.push({ id: 'no-sellers', strength: 'weak', label: `Almost no one sells: ${sells} sells in 24h despite a $${Math.round(liquidity).toLocaleString()} pool` });
  }
  if (fdv > 0 && liquidity > fdv) {
    signals.push({ id: 'liquidity-over-mcap', strength: 'weak', label: 'Pool is worth more than the whole token supply (price is propped up)' });
  }
  return cleared;
}

const pct = (v: number) => (v < 0.0005 ? '0%' : `${(v * 100).toFixed(v < 0.1 ? 1 : 0)}%`);

/** PulseChain: Lantern's own buy-and-sell simulation (scanners don't cover the chain). */
async function simulationEvidence(chain: string, address: string, signals: RiskSignal[]) {
  if (chain !== 'pulsechain') return;
  const r = await simulateTrade(address);
  if (r.outcome === 'sell-failed' || r.outcome === 'approve-failed') {
    signals.push({ id: 'sim-cant-sell', strength: 'strong', label: 'Simulated sale failed: you could buy this token but not sell it (honeypot)' });
    return;
  }
  if (r.outcome === 'buy-failed') {
    signals.push({ id: 'sim-cant-buy', strength: 'weak', label: 'A simulated purchase failed: trading may be switched off or restricted' });
    return;
  }
  if (r.outcome === 'no-pool') return; // nothing to test against; not a risk in itself
  const buy = r.buyTax ?? 0;
  const sell = r.sellTax ?? 0;
  if (sell >= 0.5) signals.push({ id: 'sim-sell-tax', strength: 'strong', label: `Simulated sell lost ${pct(sell)} to a hidden tax` });
  else if (sell >= 0.1 || buy >= 0.1) signals.push({ id: 'sim-high-tax', strength: 'weak', label: `High trading tax: ${pct(buy)} on buys, ${pct(sell)} on sells (simulated)` });
  else if (sell >= 0.005 || buy >= 0.005) signals.push({ id: 'sim-tax', strength: 'info', label: `Trading tax: ${pct(buy)} on buys, ${pct(sell)} on sells (simulated)` });
  else signals.push({ id: 'sim-ok', strength: 'good', label: 'A simulated buy and sell on PulseX both went through, with no hidden tax' });
}

async function scannerEvidence(chain: string, address: string, signals: RiskSignal[]) {
  const lower = address.toLowerCase();
  const [goplus, honeypot] = await Promise.all([
    GOPLUS_CHAIN[chain]
      ? getJSON<{ result?: Record<string, Record<string, string>> }>(`https://api.gopluslabs.io/api/v1/token_security/${GOPLUS_CHAIN[chain]}?contract_addresses=${lower}`)
      : null,
    HONEYPOT_CHAIN[chain]
      ? getJSON<{ honeypotResult?: { isHoneypot?: boolean }; simulationResult?: { sellTax?: number }; summary?: { flags?: ({ flag: string } | string)[] } }>(`https://api.honeypot.is/v2/IsHoneypot?address=${address}&chainID=${HONEYPOT_CHAIN[chain]}`)
      : null,
  ]);

  const g = goplus?.result?.[lower];
  if (g) {
    if (g.is_honeypot === '1') signals.push({ id: 'goplus-honeypot', strength: 'strong', label: 'GoPlus: honeypot (buys work, sells are blocked)' });
    if (Number(g.sell_tax) > 0.5) signals.push({ id: 'goplus-sell-tax', strength: 'strong', label: `GoPlus: ${Math.round(Number(g.sell_tax) * 100)}% sell tax` });
    if (g.owner_change_balance === '1') signals.push({ id: 'owner-change-balance', strength: 'strong', label: 'GoPlus: owner can change anyone’s balance' });
    if (g.cannot_sell_all === '1') signals.push({ id: 'cannot-sell-all', strength: 'weak', label: 'GoPlus: holders can’t sell their full balance' });
    if (g.is_open_source === '0') signals.push({ id: 'closed-source', strength: 'weak', label: 'Contract code isn’t published' });
  }
  if (honeypot) {
    if (honeypot.honeypotResult?.isHoneypot === true) signals.push({ id: 'sim-honeypot', strength: 'strong', label: 'Sell simulation failed (honeypot.is)' });
    const tax = honeypot.simulationResult?.sellTax;
    if (typeof tax === 'number' && tax > 50) signals.push({ id: 'sim-sell-tax', strength: 'strong', label: `Simulated sell tax ${Math.round(tax)}% (honeypot.is)` });
    const flags = (honeypot.summary?.flags ?? []).map((f) => (typeof f === 'string' ? f : f.flag));
    if (flags.includes('high_fail_rate')) signals.push({ id: 'high-fail-rate', strength: 'weak', label: 'Many transactions with this token fail (typical when sells are blocked)' });
    if (flags.includes('closed_source') && !signals.some((s) => s.id === 'closed-source')) {
      signals.push({ id: 'closed-source', strength: 'weak', label: 'Contract code isn’t published' });
    }
  }
}

function decide(signals: RiskSignal[], cleared: boolean, hadData: boolean): RiskVerdict {
  // A balance for a never-used wallet is direct proof of fakery, whatever the market looks like.
  // Everything else, even "owner can change balances" (legitimately true of mint/burn-by-protocol
  // tokens like Venice's DIEM), can be outweighed by real two-way trading.
  // A failed sell simulation is the same kind of proof: trading volume can be the scammer's own buys.
  if (signals.some((s) => s.id === 'ghost-balance' || s.id === 'sim-cant-sell')) return 'scam';
  if (cleared) return 'ok'; // thousands of people successfully selling outweighs scanner opinions
  if (signals.some((s) => s.strength === 'strong')) return 'scam';
  const weak = signals.filter((s) => s.strength === 'weak').length;
  if (weak >= 3) return 'scam';
  if (weak >= 2) return 'suspicious';
  return hadData ? 'ok' : 'unknown';
}

export async function checkToken(chain: string, address: string, extraSignals: RiskSignal[] = []): Promise<TokenRiskReport> {
  if (isCore(chain, address)) {
    return { chain, address, verdict: 'trusted', signals: [{ id: 'core', strength: 'good', label: 'Core coin' }], checkedAt: Date.now() };
  }
  const key = `${chain}:${address.toLowerCase()}:${extraSignals.map((s) => s.id).join(',')}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.checkedAt < TTL_MS) return hit;

  const signals: RiskSignal[] = [...extraSignals];
  const results = await Promise.allSettled([
    contractEvidence(chain, address, signals),
    marketEvidence(chain, address, signals),
    scannerEvidence(chain, address, signals),
    simulationEvidence(chain, address, signals),
  ]);
  const cleared = results[1].status === 'fulfilled' && results[1].value;
  const hadData = results.some((r) => r.status === 'fulfilled') && signals.length > 0;

  const report = { chain, address, verdict: decide(signals, cleared, hadData), signals, checkedAt: Date.now() };
  cache.set(key, report);
  return report;
}

export const RISK_CHAINS = Object.keys(CONFIGS);
