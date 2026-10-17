import 'server-only';

/**
 * GeckoTerminal's free API allows roughly 30 calls a minute per IP, shared by
 * everything here that uses it (price history, logos). One queue spaces the
 * calls out, and a 429 is retried after a growing pause.
 */

const SPACING_MS = 3_000;
const RETRIES = 3;
const TIMEOUT_MS = 12_000;

// On globalThis so dev hot reloads keep one queue
const state = ((globalThis as { __geckoQueue?: { queue: Promise<unknown> } }).__geckoQueue ??= { queue: Promise.resolve() });

function schedule<T>(fn: () => Promise<T>): Promise<T> {
  const run = state.queue.then(fn);
  state.queue = run.catch(() => undefined).then(() => new Promise((r) => setTimeout(r, SPACING_MS)));
  return run;
}

/** GET a GeckoTerminal API URL as JSON, rate limited, retrying on 429. */
export async function geckoJSON(url: string): Promise<any> { // eslint-disable-line @typescript-eslint/no-explicit-any -- callers type the shape
  for (let attempt = 0; ; attempt++) {
    const response = await schedule(() => fetch(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(TIMEOUT_MS) }));
    if (response.status === 429 && attempt < RETRIES) {
      await new Promise((r) => setTimeout(r, 5_000 * 2 ** attempt));
      continue;
    }
    if (!response.ok) throw new Error(`api.geckoterminal.com ${response.status}`);
    return response.json();
  }
}
