import 'server-only';
import { ethers } from 'ethers';
import { createProvider, EvmChainConfig } from './evm';
import { ETHEREUM_CONFIG } from './ethereum';
import { PULSECHAIN_CONFIG } from './pulsechain';
import { BASE_CONFIG } from './base';
import { ROBINHOOD_CONFIG } from './robinhood';

/**
 * Unified transaction history, one page at a time per (chain, wallet).
 *
 * Sources: Blockscout explorers (Ethereum; Pulsechain's transaction list),
 * Transfer event logs read from Pulsechain's own RPC (its explorer times out
 * on token transfers for airdrop-heavy wallets), mempool.space (Bitcoin),
 * Solana JSON-RPC, and Alchemy's asset-transfers API for Base / Robinhood
 * (their explorers block servers), which needs ALCHEMY_API_KEY.
 */

export type TxType = 'receive' | 'send' | 'swap' | 'stake' | 'approval' | 'contract' | 'nft';

export interface TxTransfer {
  symbol: string;
  amount: number;
  direction: 'in' | 'out';
  contract?: string; // token contract / mint (absent for native coins)
  nft?: boolean;
}

export interface Tx {
  id: string;
  chain: string;
  wallet: string;
  hash: string;
  timestamp: number; // ms
  type: TxType;
  method?: string;
  status: 'success' | 'failed';
  fee?: number;      // in the chain's native coin, paid by this wallet
  counterparty?: string;
  transfers: TxTransfer[];
  explorerUrl: string;
}

export interface TxPage {
  txs: Tx[];
  cursor: string | null;
  unavailable?: string;
}

const EXPLORERS: Record<string, string> = {
  ethereum: 'https://etherscan.io/tx/',
  pulsechain: 'https://scan.pulsechain.com/tx/',
  base: 'https://basescan.org/tx/',
  robinhood: 'https://robinhoodchain.blockscout.com/tx/',
  bitcoin: 'https://mempool.space/tx/',
  solana: 'https://solscan.io/tx/',
};
const NATIVE: Record<string, string> = { ethereum: 'ETH', pulsechain: 'PLS', base: 'ETH', robinhood: 'ETH', bitcoin: 'BTC', solana: 'SOL' };
const BLOCKSCOUT: Record<string, string> = { ethereum: 'https://eth.blockscout.com', pulsechain: 'https://api.scan.pulsechain.com' };
const ALCHEMY_NETWORK: Record<string, string> = { base: 'base-mainnet', robinhood: 'robinhood-mainnet', ethereum: 'eth-mainnet' };
const EVM_CONFIG: Record<string, EvmChainConfig> = { ethereum: ETHEREUM_CONFIG, pulsechain: PULSECHAIN_CONFIG, base: BASE_CONFIG, robinhood: ROBINHOOD_CONFIG };
const ALCHEMY_KEY = process.env.ALCHEMY_API_KEY || process.env.NEXT_PUBLIC_ALCHEMY_API_KEY;
const TRANSFER_TOPIC = ethers.id('Transfer(address,address,uint256)');

const encode = (c: unknown) => Buffer.from(JSON.stringify(c)).toString('base64url');
const decode = <T>(c: string | null | undefined): T | null => {
  if (!c) return null;
  try {
    return JSON.parse(Buffer.from(c, 'base64url').toString()) as T;
  } catch {
    return null;
  }
};

async function getJSON<T>(url: string, init?: RequestInit, timeoutMs = 20_000): Promise<T> {
  const response = await fetch(url, { ...init, headers: { Accept: 'application/json', ...(init?.headers ?? {}) }, signal: AbortSignal.timeout(timeoutMs) });
  if (!response.ok) throw new Error(`${new URL(url).host} ${response.status}`);
  return response.json();
}

/** Classify from the method name and the wallet's net transfers. */
function classify(method: string | undefined, transfers: TxTransfer[]): TxType {
  const m = (method ?? '').toLowerCase();
  if (/^approve$|^setapprovalforall$|^permit/.test(m)) return 'approval';
  if (/stake|unstake|claim|mintnative|mintinstanced|harvest|deposit|withdraw|redeem|cooldown/.test(m)) return 'stake';
  const ins = transfers.filter((t) => t.direction === 'in');
  const outs = transfers.filter((t) => t.direction === 'out');
  if (ins.length && outs.length) return 'swap';
  if (transfers.some((t) => t.nft)) return 'nft';
  if (ins.length) return 'receive';
  if (outs.length) return 'send';
  return 'contract'; // no balance change for this wallet: an interaction, not a receipt
}

function finalize(map: Map<string, Tx>, wallet: string): Tx[] {
  return [...map.values()].map((tx) => {
    // Net out same-token in/out pairs inside one transaction (e.g. routers)
    const net = new Map<string, TxTransfer>();
    for (const t of tx.transfers) {
      const key = `${t.contract ?? 'native'}:${t.nft ? 'nft' : ''}`;
      const signed = (t.direction === 'in' ? 1 : -1) * t.amount;
      const prev = net.get(key);
      const total = (prev ? (prev.direction === 'in' ? 1 : -1) * prev.amount : 0) + signed;
      net.set(key, { ...t, amount: Math.abs(total), direction: total >= 0 ? 'in' : 'out' });
    }
    const transfers = [...net.values()].filter((t) => t.amount > 0);
    return { ...tx, wallet, transfers, type: classify(tx.method, transfers) };
  });
}

// ---------- EVM via Blockscout (+ Pulsechain logs) ----------

interface BsAddress { hash: string }
interface BsTx {
  hash: string; timestamp: string; status: string | null; method: string | null; value: string;
  from: BsAddress; to: BsAddress | null; fee?: { value: string };
}
interface BsTransfer {
  transaction_hash?: string; tx_hash?: string; timestamp: string; from: BsAddress; to: BsAddress;
  total: { value?: string; decimals?: string | null; token_id?: string } | null;
  token: { address_hash?: string; address?: string; symbol: string | null; decimals: string | null; type: string };
}
type BsParams = Record<string, string | number | null>;
const qs = (p: BsParams | null) => (p ? '?' + new URLSearchParams(Object.entries(p).filter(([, v]) => v !== null).map(([k, v]) => [k, String(v)])).toString() : '');

const tokenMeta = new Map<string, { symbol: string; decimals: number }>();
const blockTimes = new Map<string, number>();

async function pulsechainTransferLogs(wallet: string, toBlock: number, minLogs = 25) {
  const provider = createProvider(PULSECHAIN_CONFIG);
  const padded = ethers.zeroPadValue(wallet, 32);
  let window = 200_000; // ~23 days of 10s blocks
  let from = toBlock;
  const logs: ethers.Log[] = [];
  for (let attempt = 0; attempt < 4 && logs.length < minLogs && from > 0; attempt++) {
    const start = Math.max(0, from - window);
    const [outs, ins] = await Promise.all([
      provider.getLogs({ topics: [TRANSFER_TOPIC, padded], fromBlock: start, toBlock: from - 1 }),
      provider.getLogs({ topics: [TRANSFER_TOPIC, null, padded], fromBlock: start, toBlock: from - 1 }),
    ]);
    logs.push(...outs, ...ins);
    from = start;
    window *= 3;
  }

  const unknownTokens = [...new Set(logs.map((l) => l.address.toLowerCase()))].filter((a) => !tokenMeta.has(`pulsechain:${a}`));
  await Promise.all(unknownTokens.map(async (address) => {
    const c = new ethers.Contract(address, ['function symbol() view returns (string)', 'function decimals() view returns (uint8)'], provider);
    const [symbol, decimals] = await Promise.all([c.symbol().catch(() => '?'), c.decimals().then(Number).catch(() => 0)]);
    tokenMeta.set(`pulsechain:${address}`, { symbol: String(symbol).slice(0, 20), decimals });
  }));
  const unknownBlocks = [...new Set(logs.map((l) => l.blockNumber))].filter((b) => !blockTimes.has(`pulsechain:${b}`));
  await Promise.all(unknownBlocks.map(async (b) => {
    const block = await provider.getBlock(b);
    if (block) blockTimes.set(`pulsechain:${b}`, block.timestamp * 1000);
  }));

  return { logs, nextToBlock: from };
}

async function evmBlockscoutPage(chain: string, wallet: string, cursor: string | null): Promise<TxPage> {
  type Cursor = { tx: BsParams | null; tt: BsParams | null; logTo?: number; txDone?: boolean; ttDone?: boolean };
  const c = decode<Cursor>(cursor) ?? { tx: null, tt: null };
  const host = BLOCKSCOUT[chain];
  const me = wallet.toLowerCase();
  const map = new Map<string, Tx>();
  const ensure = (hash: string, timestamp: number): Tx => {
    let tx = map.get(hash);
    if (!tx) {
      tx = { id: `${chain}:${hash}`, chain, wallet, hash, timestamp, type: 'contract', status: 'success', transfers: [], explorerUrl: EXPLORERS[chain] + hash };
      map.set(hash, tx);
    }
    return tx;
  };

  const txReq = c.txDone ? null : getJSON<{ items: BsTx[]; next_page_params: BsParams | null }>(`${host}/api/v2/addresses/${wallet}/transactions${qs(c.tx)}`);
  let next: Cursor = { ...c };

  if (chain === 'pulsechain') {
    // Token transfers from logs, newest first
    const head = c.logTo ?? (await createProvider(PULSECHAIN_CONFIG).getBlockNumber()) + 1;
    const [txs, logPage] = await Promise.all([txReq, c.ttDone ? null : pulsechainTransferLogs(wallet, head)]);
    if (txs) {
      for (const t of txs.items) addBsTx(t);
      next = { ...next, tx: txs.next_page_params, txDone: !txs.next_page_params };
    }
    if (logPage) {
      for (const log of logPage.logs) {
        const meta = tokenMeta.get(`pulsechain:${log.address.toLowerCase()}`) ?? { symbol: '?', decimals: 0 };
        const from = ethers.getAddress('0x' + log.topics[1].slice(26)).toLowerCase();
        const nft = log.topics.length === 4;
        const raw = nft ? BigInt(1) : log.data && log.data !== '0x' ? BigInt(log.data) : BigInt(0);
        const tx = ensure(log.transactionHash, blockTimes.get(`pulsechain:${log.blockNumber}`) ?? 0);
        tx.transfers.push({
          symbol: meta.symbol,
          amount: nft ? 1 : Number(ethers.formatUnits(raw, meta.decimals)),
          direction: from === me ? 'out' : 'in',
          contract: log.address,
          nft,
        });
      }
      next = { ...next, logTo: logPage.nextToBlock, ttDone: logPage.nextToBlock <= 0 };
    }
  } else {
    const ttReq = c.ttDone ? null : getJSON<{ items: BsTransfer[]; next_page_params: BsParams | null }>(`${host}/api/v2/addresses/${wallet}/token-transfers${qs(c.tt)}`);
    const [txs, tts] = await Promise.all([txReq, ttReq]);
    if (txs) {
      for (const t of txs.items) addBsTx(t);
      next = { ...next, tx: txs.next_page_params, txDone: !txs.next_page_params };
    }
    if (tts) {
      for (const t of tts.items) {
        const hash = t.transaction_hash ?? t.tx_hash ?? '';
        const nft = t.token.type !== 'ERC-20';
        const decimals = Number(t.total?.decimals ?? t.token.decimals ?? 0);
        const tx = ensure(hash, Date.parse(t.timestamp));
        tx.transfers.push({
          symbol: t.token.symbol ?? '?',
          amount: nft ? 1 : Number(ethers.formatUnits(t.total?.value ?? '0', decimals)),
          direction: t.from.hash.toLowerCase() === me ? 'out' : 'in',
          contract: t.token.address_hash ?? t.token.address,
          nft,
        });
      }
      next = { ...next, tt: tts.next_page_params, ttDone: !tts.next_page_params };
    }
  }

  function addBsTx(t: BsTx) {
    const tx = ensure(t.hash, Date.parse(t.timestamp));
    const outgoing = t.from.hash.toLowerCase() === me;
    tx.status = t.status === 'error' ? 'failed' : 'success';
    tx.method = t.method ?? undefined;
    tx.counterparty = outgoing ? t.to?.hash : t.from.hash;
    if (outgoing && t.fee?.value) tx.fee = Number(ethers.formatEther(t.fee.value));
    const value = BigInt(t.value || '0');
    if (value > BigInt(0)) {
      tx.transfers.push({ symbol: NATIVE[chain], amount: Number(ethers.formatEther(value)), direction: outgoing ? 'out' : 'in' });
    }
  }

  const done = next.txDone && next.ttDone;
  return { txs: finalize(map, wallet), cursor: done ? null : encode(next) };
}

// ---------- Base / Robinhood via Alchemy ----------

interface AlchemyTransfer {
  hash: string; from: string; to: string | null; value: number | null; asset: string | null; category: string;
  rawContract: { address: string | null }; metadata?: { blockTimestamp?: string };
}

async function evmAlchemyPage(chain: string, wallet: string, cursor: string | null): Promise<TxPage> {
  if (!ALCHEMY_KEY) {
    return { txs: [], cursor: null, unavailable: `${chain === 'base' ? 'Base' : 'Robinhood Chain'} history needs ALCHEMY_API_KEY (its explorer blocks servers).` };
  }
  type Cursor = { out: string | null; in: string | null; outDone?: boolean; inDone?: boolean };
  const c = decode<Cursor>(cursor) ?? { out: null, in: null };
  const url = `https://${ALCHEMY_NETWORK[chain]}.g.alchemy.com/v2/${ALCHEMY_KEY}`;
  const query = (side: 'fromAddress' | 'toAddress', pageKey: string | null) =>
    getJSON<{ result?: { transfers: AlchemyTransfer[]; pageKey?: string } }>(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0', id: 1, method: 'alchemy_getAssetTransfers',
        params: [{ [side]: wallet, category: ['external', 'erc20', 'erc721', 'erc1155'], order: 'desc', withMetadata: true, maxCount: '0x32', excludeZeroValue: true, ...(pageKey ? { pageKey } : {}) }],
      }),
    });

  const [outs, ins] = await Promise.all([c.outDone ? null : query('fromAddress', c.out), c.inDone ? null : query('toAddress', c.in)]);
  const me = wallet.toLowerCase();
  const map = new Map<string, Tx>();
  for (const t of [...(outs?.result?.transfers ?? []), ...(ins?.result?.transfers ?? [])]) {
    let tx = map.get(t.hash);
    if (!tx) {
      tx = { id: `${chain}:${t.hash}`, chain, wallet, hash: t.hash, timestamp: Date.parse(t.metadata?.blockTimestamp ?? '') || 0, type: 'contract', status: 'success', transfers: [], explorerUrl: EXPLORERS[chain] + t.hash };
      map.set(t.hash, tx);
    }
    const out = t.from.toLowerCase() === me;
    tx.counterparty = out ? t.to ?? undefined : t.from;
    tx.transfers.push({
      symbol: t.asset ?? (t.category === 'external' ? NATIVE[chain] : '?'),
      amount: t.value ?? (t.category.startsWith('erc') && t.category !== 'erc20' ? 1 : 0),
      direction: out ? 'out' : 'in',
      contract: t.rawContract.address ?? undefined,
      nft: t.category === 'erc721' || t.category === 'erc1155',
    });
  }
  const next: Cursor = {
    out: outs?.result?.pageKey ?? null, in: ins?.result?.pageKey ?? null,
    outDone: c.outDone || !outs?.result?.pageKey, inDone: c.inDone || !ins?.result?.pageKey,
  };
  return { txs: finalize(map, wallet), cursor: next.outDone && next.inDone ? null : encode(next) };
}

// ---------- Bitcoin via mempool.space ----------

interface BtcTx {
  txid: string; fee: number; status: { confirmed: boolean; block_time?: number };
  vin: { prevout: { scriptpubkey_address?: string; value: number } | null }[];
  vout: { scriptpubkey_address?: string; value: number }[];
}

async function bitcoinPage(wallet: string, cursor: string | null): Promise<TxPage> {
  const after = decode<{ last: string }>(cursor)?.last;
  const txs = await getJSON<BtcTx[]>(`https://mempool.space/api/address/${wallet}/txs${after ? `/chain/${after}` : ''}`);
  const out: Tx[] = txs.map((t) => {
    const sent = t.vin.filter((v) => v.prevout?.scriptpubkey_address === wallet).reduce((s, v) => s + (v.prevout?.value ?? 0), 0);
    const received = t.vout.filter((v) => v.scriptpubkey_address === wallet).reduce((s, v) => s + v.value, 0);
    const net = received - sent;
    const spent = sent > 0;
    return {
      id: `bitcoin:${t.txid}`, chain: 'bitcoin', wallet, hash: t.txid,
      timestamp: (t.status.block_time ?? Date.now() / 1000) * 1000,
      type: net >= 0 ? 'receive' : 'send', status: 'success',
      fee: spent ? t.fee / 1e8 : undefined,
      // Net change excluding the fee, so a self-transfer shows ~0 + fee
      transfers: ([{ symbol: 'BTC', amount: Math.abs(net + (spent ? t.fee : 0)) / 1e8, direction: net >= 0 ? 'in' : 'out' }] as TxTransfer[]).filter((x) => x.amount > 0),
      explorerUrl: EXPLORERS.bitcoin + t.txid,
    };
  });
  // mempool.space pages confirmed history 25 at a time
  const confirmed = txs.filter((t) => t.status.confirmed);
  const last = confirmed[confirmed.length - 1]?.txid;
  return { txs: out, cursor: txs.length >= 25 && last ? encode({ last }) : null };
}

// ---------- Solana via JSON-RPC ----------

const SOLANA_RPC = process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
const SOL_PAGE = 15;

async function solanaRpc<T>(method: string, params: unknown[]): Promise<T> {
  const body = await getJSON<{ result: T; error?: { message: string } }>(SOLANA_RPC, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
  if (body.error) throw new Error(body.error.message);
  return body.result;
}

interface SolTokenBalance { owner?: string; mint: string; uiTokenAmount: { uiAmount: number | null } }
interface SolTx {
  blockTime: number | null;
  meta: { err: unknown; fee: number; preBalances: number[]; postBalances: number[];
    preTokenBalances?: SolTokenBalance[]; postTokenBalances?: SolTokenBalance[] } | null;
  transaction: { message: { accountKeys: { pubkey: string; signer: boolean }[] } };
}

async function solanaPage(wallet: string, cursor: string | null): Promise<TxPage> {
  const before = decode<{ before: string }>(cursor)?.before;
  const sigs = await solanaRpc<{ signature: string; blockTime: number | null; err: unknown }[]>('getSignaturesForAddress', [wallet, { limit: SOL_PAGE, ...(before ? { before } : {}) }]);

  const txs: Tx[] = [];
  for (let i = 0; i < sigs.length; i += 5) {
    const details = await Promise.all(sigs.slice(i, i + 5).map((s) =>
      solanaRpc<SolTx | null>('getTransaction', [s.signature, { encoding: 'jsonParsed', maxSupportedTransactionVersion: 0 }]).catch(() => null)
    ));
    details.forEach((d, j) => {
      const sig = sigs[i + j];
      const transfers: TxTransfer[] = [];
      let fee: number | undefined;
      if (d?.meta) {
        const index = d.transaction.message.accountKeys.findIndex((k) => k.pubkey === wallet);
        if (index >= 0) {
          const signer = d.transaction.message.accountKeys[index].signer;
          if (signer) fee = d.meta.fee / 1e9;
          const delta = (d.meta.postBalances[index] - d.meta.preBalances[index] + (signer ? d.meta.fee : 0)) / 1e9;
          if (Math.abs(delta) > 1e-9) transfers.push({ symbol: 'SOL', amount: Math.abs(delta), direction: delta > 0 ? 'in' : 'out' });
        }
        const mine = (list?: SolTokenBalance[]) =>
          new Map((list ?? []).filter((b) => b.owner === wallet).map((b) => [b.mint, b.uiTokenAmount.uiAmount ?? 0]));
        const pre = mine(d.meta.preTokenBalances);
        const post = mine(d.meta.postTokenBalances);
        for (const mint of new Set([...pre.keys(), ...post.keys()])) {
          const change = (post.get(mint) ?? 0) - (pre.get(mint) ?? 0);
          if (Math.abs(change) > 0) transfers.push({ symbol: `${mint.slice(0, 4)}…`, amount: Math.abs(change), direction: change > 0 ? 'in' : 'out', contract: mint });
        }
      }
      const map = new Map<string, Tx>([[sig.signature, {
        id: `solana:${sig.signature}`, chain: 'solana', wallet, hash: sig.signature,
        timestamp: (sig.blockTime ?? d?.blockTime ?? 0) * 1000, type: 'contract',
        status: sig.err ? 'failed' : 'success', fee, transfers, explorerUrl: EXPLORERS.solana + sig.signature,
      }]]);
      txs.push(...finalize(map, wallet));
    });
  }
  const last = sigs[sigs.length - 1]?.signature;
  return { txs, cursor: sigs.length === SOL_PAGE && last ? encode({ before: last }) : null };
}

export async function transactionsPage(chain: string, wallet: string, cursor: string | null): Promise<TxPage> {
  if (chain === 'bitcoin') return bitcoinPage(wallet, cursor);
  if (chain === 'solana') return solanaPage(wallet, cursor);
  if (BLOCKSCOUT[chain]) return evmBlockscoutPage(chain, wallet, cursor);
  if (EVM_CONFIG[chain]) return evmAlchemyPage(chain, wallet, cursor);
  return { txs: [], cursor: null, unavailable: `No history source for ${chain}` };
}
