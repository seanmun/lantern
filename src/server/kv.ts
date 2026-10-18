/**
 * A tiny key-value store: Upstash Redis over its REST API when configured
 * (Vercel's integration sets KV_REST_API_*, Upstash's own UPSTASH_REDIS_REST_*),
 * otherwise an in-memory map so local development works without an account.
 * Server-only: the token must never reach a browser.
 */

const URL_ = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

/** False in production without Redis: the memory stand-in would lose data on every cold start. */
export const kvAvailable = !!(URL_ && TOKEN) || process.env.NODE_ENV !== 'production';

type Entry = { value: string; expires: number };
const memory: Map<string, Entry> = ((globalThis as { __lanternKv?: Map<string, Entry> }).__lanternKv ??= new Map());

async function redis(command: (string | number)[]): Promise<unknown> {
  const res = await fetch(URL_!, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(command),
    cache: 'no-store',
    signal: AbortSignal.timeout(8000),
  });
  const body = (await res.json().catch(() => ({}))) as { result?: unknown; error?: string };
  if (!res.ok || body.error) throw new Error(`KV ${command[0]} failed: ${body.error ?? res.status}`);
  return body.result;
}

function live(key: string): Entry | undefined {
  const hit = memory.get(key);
  if (hit && hit.expires <= Date.now()) {
    memory.delete(key);
    return undefined;
  }
  return hit;
}

export async function kvGet(key: string): Promise<string | null> {
  if (URL_ && TOKEN) return ((await redis(['GET', key])) as string | null) ?? null;
  return live(key)?.value ?? null;
}

export async function kvSet(key: string, value: string, ttlSeconds: number): Promise<void> {
  if (URL_ && TOKEN) {
    await redis(['SET', key, value, 'EX', ttlSeconds]);
    return;
  }
  memory.set(key, { value, expires: Date.now() + ttlSeconds * 1000 });
}

export async function kvExpire(key: string, ttlSeconds: number): Promise<void> {
  if (URL_ && TOKEN) {
    await redis(['EXPIRE', key, ttlSeconds]);
    return;
  }
  const hit = live(key);
  if (hit) hit.expires = Date.now() + ttlSeconds * 1000;
}

export async function kvDel(key: string): Promise<void> {
  if (URL_ && TOKEN) {
    await redis(['DEL', key]);
    return;
  }
  memory.delete(key);
}

/** Increments a counter that expires ttlSeconds after it was first created; returns the new count. */
export async function kvIncr(key: string, ttlSeconds: number): Promise<number> {
  if (URL_ && TOKEN) {
    const n = Number(await redis(['INCR', key]));
    if (n === 1) await redis(['EXPIRE', key, ttlSeconds]);
    return n;
  }
  const hit = live(key);
  const n = (hit ? Number(hit.value) : 0) + 1;
  memory.set(key, { value: String(n), expires: hit?.expires ?? Date.now() + ttlSeconds * 1000 });
  return n;
}
