import 'server-only';
import { rpcHealth } from './rpc';
import { createProvider, rpcUrls } from './evm';
import { PULSECHAIN_CONFIG } from './pulsechain';
import { ETHEREUM_CONFIG } from './ethereum';
import { BASE_CONFIG } from './base';
import { ServiceStatus, StatusReport } from '@/types/status';

/**
 * Live health of the services people (and Lantern) depend on, for /status.
 * The headline separates the chain itself (is it producing blocks?) from the
 * layers around it (RPCs, explorer, indexers, price feeds), which is where
 * most "PulseChain is down" moments actually happen.
 */

const TIMEOUT_MS = 8_000;
const CACHE_MS = 60_000;
const WPLS = '0xA1077a294dDE1B09bB078844df40758a5D0f9a27';
const EXPLORER_API = 'https://api.scan.pulsechain.com/api/v2';
const BEACON_API = 'https://rpc-pulsechain.g4mm4.io/beacon-api';

async function timed<T>(fn: () => Promise<T>): Promise<{ value: T | null; ms: number; error: string | null }> {
  const started = Date.now();
  try {
    return { value: await fn(), ms: Date.now() - started, error: null };
  } catch (error) {
    return { value: null, ms: Date.now() - started, error: error instanceof Error ? error.message : String(error) };
  }
}

async function getJSON<T>(url: string, headers: Record<string, string> = {}): Promise<T> {
  // One retry, so a single blip doesn't show a service as down
  for (let attempt = 0; ; attempt++) {
    try {
      const response = await fetch(url, { headers: { Accept: 'application/json', ...headers }, signal: AbortSignal.timeout(TIMEOUT_MS) });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return (await response.json()) as T;
    } catch (error) {
      if (attempt >= 1) throw error;
      await new Promise((r) => setTimeout(r, 1_500));
    }
  }
}

const fmtBlock = (n: number) => `block ${n.toLocaleString('en-US')}`;

async function rpcServices(group: string, chain: string, urls: string[]): Promise<{ services: ServiceStatus[]; best: number }> {
  const health = await rpcHealth(chain, urls);
  const best = Math.max(0, ...health.map((h) => h.block ?? 0));
  return {
    best,
    services: health.map((h) => ({
      id: `${chain}-rpc-${h.url}`,
      group,
      name: `RPC · ${h.url}`,
      state: !h.ok ? 'down' : (h.lagBlocks ?? 0) > 3 || (h.latencyMs ?? 0) > 3_000 ? 'degraded' : 'up',
      detail: !h.ok
        ? h.lastError ?? 'Not responding'
        : `${h.block !== null ? fmtBlock(h.block) : 'no block yet'}${h.lagBlocks ? ` · ${h.lagBlocks} behind` : ''}`,
      latencyMs: h.latencyMs,
    })),
  };
}

async function build(): Promise<StatusReport> {
  const [pls, eth, base, head, explorerBlock, explorerStats, dexWpls, otter, beaconSync, beaconFinality, dex, gecko, coingecko] = await Promise.all([
    rpcServices('PulseChain', 'pulsechain', rpcUrls(PULSECHAIN_CONFIG)),
    rpcServices('Ethereum', 'ethereum', rpcUrls(ETHEREUM_CONFIG)),
    rpcServices('Base', 'base', rpcUrls(BASE_CONFIG)),
    timed(() => createProvider(PULSECHAIN_CONFIG).getBlock('latest')),
    timed(() => getJSON<{ items: { height: number }[] }>(`${EXPLORER_API}/blocks?type=block`)),
    timed(() => getJSON<{ coin_price?: string | null }>(`${EXPLORER_API}/stats`)),
    timed(() => getJSON<{ priceUsd?: string; liquidity?: { usd?: number } }[]>(`https://api.dexscreener.com/tokens/v1/pulsechain/${WPLS}`)),
    timed(() => fetch('https://otter.pulsechain.com', { signal: AbortSignal.timeout(TIMEOUT_MS) }).then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); })),
    timed(() => getJSON<{ data: { is_syncing: boolean; el_offline: boolean; head_slot: string } }>(`${BEACON_API}/eth/v1/node/syncing`, { 'user-agent': 'lantern' })),
    timed(() => getJSON<{ data: { finalized: { epoch: string } } }>(`${BEACON_API}/eth/v1/beacon/states/head/finality_checkpoints`, { 'user-agent': 'lantern' })),
    timed(() => getJSON('https://api.dexscreener.com/latest/dex/search?q=HEX')),
    timed(() => getJSON('https://api.geckoterminal.com/api/v2/networks/pulsechain/dexes?page=1')),
    timed(() => getJSON('https://api.coingecko.com/api/v3/ping')),
  ]);

  const services: ServiceStatus[] = [...pls.services];

  // Explorer: is it caught up with the chain?
  const indexed = explorerBlock.value?.items?.[0]?.height ?? null;
  const tip = Math.max(pls.best, head.value?.number ?? 0);
  const explorerLag = indexed !== null && tip ? Math.max(0, tip - indexed) : null;
  services.push({
    id: 'pulsechain-explorer',
    group: 'PulseChain',
    name: 'Explorer · scan.pulsechain.com',
    state: indexed === null ? 'down' : (explorerLag ?? 0) > 200 ? 'down' : (explorerLag ?? 0) > 20 ? 'degraded' : 'up',
    detail: indexed === null ? explorerBlock.error ?? 'Not responding' : `indexed to ${fmtBlock(indexed)}${explorerLag && explorerLag > 0 ? ` · ${explorerLag.toLocaleString()} behind` : ''}`,
    latencyMs: explorerBlock.ms,
  });

  // Explorer price data vs the market (it has been frozen for months at a time)
  const marketPls = (dexWpls.value ?? []).sort((a, b) => (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0))[0]?.priceUsd;
  const explorerPls = explorerStats.value?.coin_price ? Number(explorerStats.value.coin_price) : null;
  const priceGap = explorerPls && marketPls ? Math.abs(explorerPls / Number(marketPls) - 1) : null;
  services.push({
    id: 'pulsechain-explorer-prices',
    group: 'PulseChain',
    name: 'Explorer · USD prices',
    state: explorerPls === null || priceGap === null ? 'degraded' : priceGap > 0.3 ? 'degraded' : 'up',
    detail: explorerPls === null
      ? 'No PLS price shown'
      : priceGap !== null && priceGap > 0.3
        ? `Shows PLS at $${explorerPls.toPrecision(3)}, market is $${Number(marketPls).toPrecision(3)}: USD values there are off by ${Math.round(priceGap * 100)}%`
        : `PLS $${explorerPls.toPrecision(3)}, in line with the market`,
    latencyMs: explorerStats.ms,
  });

  services.push({
    id: 'pulsechain-otterscan',
    group: 'PulseChain',
    name: 'Explorer · otter.pulsechain.com',
    state: otter.error ? 'down' : 'up',
    detail: otter.error ?? 'Reachable (reads straight from the RPC, no indexer)',
    latencyMs: otter.ms,
  });

  // Beacon chain: synced, and finalizing?
  const slot = beaconSync.value ? Number(beaconSync.value.data.head_slot) : null;
  const finalized = beaconFinality.value ? Number(beaconFinality.value.data.finalized.epoch) : null;
  const finalityGap = slot !== null && finalized !== null ? Math.floor(slot / 32) - finalized : null;
  services.push({
    id: 'pulsechain-beacon',
    group: 'PulseChain',
    name: 'Beacon chain (consensus)',
    state: slot === null || beaconSync.value?.data.is_syncing ? 'down' : finalityGap !== null && finalityGap > 6 ? 'down' : finalityGap !== null && finalityGap > 3 ? 'degraded' : 'up',
    detail: slot === null
      ? beaconSync.error ?? 'Not responding'
      : finalityGap !== null && finalityGap > 3 ? `Finality delayed: ${finalityGap} epochs behind` : `Finalizing normally · slot ${slot.toLocaleString('en-US')}`,
    latencyMs: beaconSync.ms,
  });

  services.push(...eth.services, ...base.services);
  for (const [id, name, r] of [['dexscreener', 'DexScreener', dex], ['geckoterminal', 'GeckoTerminal', gecko], ['coingecko', 'CoinGecko', coingecko]] as const) {
    services.push({ id, group: 'Price data', name, state: r.error ? 'down' : r.ms > 4_000 ? 'degraded' : 'up', detail: r.error ?? 'Responding', latencyMs: r.ms });
  }

  const lastBlockAt = head.value ? head.value.timestamp * 1000 : null;
  return {
    checkedAt: Date.now(),
    chain: {
      producingBlocks: lastBlockAt !== null && Date.now() - lastBlockAt < 60_000,
      lastBlock: head.value?.number ?? null,
      lastBlockAt,
    },
    services,
  };
}

let cached: { at: number; report: Promise<StatusReport> } | null = null;

export function getStatus(): Promise<StatusReport> {
  if (!cached || Date.now() - cached.at > CACHE_MS) {
    const report = build();
    cached = { at: Date.now(), report };
    report.catch(() => (cached = null));
  }
  return cached.report;
}
