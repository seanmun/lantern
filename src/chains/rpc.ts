import 'server-only';
import { ethers } from 'ethers';

/**
 * RPC failover. Public endpoints stall, rate-limit and fall behind, and when
 * the one an app uses does, the app looks broken while the chain is fine.
 *
 * Each chain has an ordered list of endpoints, most capable first (e.g. the
 * one with archive state). A request goes to the first healthy endpoint and
 * moves down the list when one fails: network errors, timeouts, HTTP errors,
 * rate limits, or an error that means "this node can't serve that" (missing
 * archive state, log range too wide). A real answer, such as "execution
 * reverted", is returned as is. A failing endpoint sits out for a minute;
 * one that lags behind the others' block height sits out until it catches up.
 */

const ATTEMPT_TIMEOUT_MS = 25_000;
const COOLDOWN_MS = 60_000;
const PROBE_EVERY_MS = 2 * 60_000;
const PROBE_TIMEOUT_MS = 6_000;
const MAX_LAG_BLOCKS = 10;
// JSON-RPC errors that are about the node, not the request
const NODE_LIMITATION = /missing trie node|archive|historical state|header not found|ranges? over|block range|limit|exceed|too many|rate|timeout|timed out|capacity|busy|unavailable|not supported|unsupported|method not found|does not exist\/is not available|-32005|-32601/i;

export interface EndpointHealth {
  url: string;
  ok: boolean;              // usable now
  latencyMs: number | null; // smoothed
  block: number | null;     // latest seen by the health probe
  lagBlocks: number | null; // behind the best endpoint
  lastError: string | null;
  lastErrorAt: number | null;
  checkedAt: number | null;
}

interface EndpointState extends EndpointHealth { cooldownUntil: number }
interface ChainState { endpoints: EndpointState[]; probedAt: number; probing: Promise<void> | null }

// On globalThis so dev hot reloads keep one set of health records
const chains = ((globalThis as { __rpcHealth?: Map<string, ChainState> }).__rpcHealth ??= new Map<string, ChainState>());

function stateFor(chain: string, urls: string[]): ChainState {
  let s = chains.get(chain);
  if (!s || s.endpoints.map((e) => e.url).join() !== urls.join()) {
    s = {
      endpoints: urls.map((url) => ({ url, ok: true, latencyMs: null, block: null, lagBlocks: null, lastError: null, lastErrorAt: null, checkedAt: null, cooldownUntil: 0 })),
      probedAt: 0,
      probing: null,
    };
    chains.set(chain, s);
  }
  return s;
}

const host = (url: string) => {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
};

function recordOk(e: EndpointState, ms: number) {
  e.latencyMs = e.latencyMs === null ? ms : Math.round(e.latencyMs * 0.7 + ms * 0.3);
  if (Date.now() >= e.cooldownUntil) e.ok = true;
}

function recordFailure(e: EndpointState, error: string) {
  e.lastError = error.slice(0, 160);
  e.lastErrorAt = Date.now();
  e.cooldownUntil = Date.now() + COOLDOWN_MS;
  e.ok = false;
}

async function rawCall(url: string, body: string, timeoutMs: number) {
  const started = Date.now();
  const response = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body, signal: AbortSignal.timeout(timeoutMs) });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return { json: await response.json(), ms: Date.now() - started };
}

/** Block height and latency of every endpoint; marks laggards. */
async function probe(s: ChainState) {
  const body = JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_blockNumber', params: [] });
  await Promise.all(s.endpoints.map(async (e) => {
    e.checkedAt = Date.now();
    try {
      const { json, ms } = await rawCall(e.url, body, PROBE_TIMEOUT_MS);
      if (!json?.result) throw new Error(json?.error?.message ?? 'no result');
      e.block = parseInt(json.result, 16);
      recordOk(e, ms);
    } catch (error) {
      recordFailure(e, error instanceof Error ? error.message : String(error));
    }
  }));
  const best = Math.max(...s.endpoints.map((e) => e.block ?? 0));
  for (const e of s.endpoints) {
    e.lagBlocks = e.block !== null && best > 0 ? best - e.block : null;
    if (e.lagBlocks !== null && e.lagBlocks > MAX_LAG_BLOCKS) recordFailure(e, `${e.lagBlocks} blocks behind`);
  }
  s.probedAt = Date.now();
}

function maybeProbe(s: ChainState) {
  if (s.probing || Date.now() - s.probedAt < PROBE_EVERY_MS) return;
  s.probing = probe(s).finally(() => (s.probing = null));
}

/** Health of a chain's endpoints, probing first if the last check is stale. */
export async function rpcHealth(chain: string, urls: string[]): Promise<EndpointHealth[]> {
  const s = stateFor(chain, urls);
  if (Date.now() - s.probedAt >= PROBE_EVERY_MS) await (s.probing ??= probe(s).finally(() => (s.probing = null)));
  return s.endpoints.map((e) => ({
    url: host(e.url), // never the full URL: it can carry an API key
    ok: e.ok && Date.now() >= e.cooldownUntil, latencyMs: e.latencyMs, block: e.block, lagBlocks: e.lagBlocks,
    lastError: e.lastError, lastErrorAt: e.lastErrorAt, checkedAt: e.checkedAt,
  }));
}

const nodeLimited = (items: unknown[]) =>
  items.some((r) => {
    const err = (r as { error?: { message?: string; code?: number } })?.error;
    return !!err && NODE_LIMITATION.test(`${err.message ?? ''} ${err.code ?? ''}`) && !/revert/i.test(err.message ?? '');
  });

/** A JsonRpcProvider that spreads its requests over a chain's endpoints, in order, skipping unhealthy ones. */
export class FailoverProvider extends ethers.JsonRpcProvider {
  readonly #chain: string;
  readonly #urls: string[];

  constructor(chain: string, urls: string[], chainId: number, options?: ethers.JsonRpcApiProviderOptions) {
    super(urls[0], chainId, options);
    this.#chain = chain;
    this.#urls = urls;
  }

  // ethers types this as results only, though JSON-RPC errors travel the same way
  async _send(payload: ethers.JsonRpcPayload | ethers.JsonRpcPayload[]): Promise<ethers.JsonRpcResult[]> {
    const s = stateFor(this.#chain, this.#urls);
    maybeProbe(s);
    const now = Date.now();
    // Healthy endpoints in priority order, then the rest as a last resort
    const order = [...s.endpoints.filter((e) => now >= e.cooldownUntil), ...s.endpoints.filter((e) => now < e.cooldownUntil)];
    const body = JSON.stringify(payload);
    let fallback: ethers.JsonRpcResult[] | null = null;
    let lastError: unknown = null;

    for (const e of order) {
      try {
        const { json, ms } = await rawCall(e.url, body, ATTEMPT_TIMEOUT_MS);
        const items = (Array.isArray(json) ? json : [json]) as ethers.JsonRpcResult[];
        recordOk(e, ms);
        if (nodeLimited(items)) {
          // This node can't serve the request; try the next one, but keep its answer in case none can
          fallback ??= items;
          continue;
        }
        return items;
      } catch (error) {
        lastError = error;
        recordFailure(e, error instanceof Error ? error.message : String(error));
        console.warn(`⚠️ RPC ${host(e.url)} failed for ${this.#chain}, trying the next one:`, error instanceof Error ? error.message : error);
      }
    }
    if (fallback) return fallback;
    throw lastError instanceof Error ? lastError : new Error(`All ${this.#chain} RPC endpoints failed`);
  }
}
