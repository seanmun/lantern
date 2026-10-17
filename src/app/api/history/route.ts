import { NextRequest, NextResponse } from 'next/server';
import { HISTORY_RANGES, HistoryRange, hasHistoryNetwork, priceHistory } from '@/utils/priceHistory';

/**
 * POST /api/history
 *   { range: '1M', tokens: [{ chain: 'pulsechain', address: '0x2b59…' }, …] }
 * → { series: { 'pulsechain:0x2b59…': [[ms, usd], …] } }
 *
 * Price history for the dashboard chart. Native coins are asked for by their
 * wrapped token (WETH, WPLS, WBTC, wSOL).
 */

const MAX_TOKENS = 12;
// Answer with what's ready by then; the rest keeps loading server-side and the client asks again
const WAIT_MS = 8_000;
const ADDRESS_RE = /^(0x[0-9a-fA-F]{40}|[1-9A-HJ-NP-Za-km-z]{32,44})$/;

export async function POST(request: NextRequest) {
  let body: { range?: unknown; tokens?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const range = HISTORY_RANGES.includes(body.range as HistoryRange) ? (body.range as HistoryRange) : '1M';
  const tokens = (Array.isArray(body.tokens) ? body.tokens : [])
    .filter((t): t is { chain: string; address: string } =>
      typeof t?.chain === 'string' && typeof t?.address === 'string' && hasHistoryNetwork(t.chain) && ADDRESS_RE.test(t.address))
    .slice(0, MAX_TOKENS);

  const deadline = new Promise<null>((resolve) => setTimeout(() => resolve(null), WAIT_MS));
  const results = await Promise.all(tokens.map((t) => Promise.race([priceHistory(t.chain, t.address, range), deadline])));
  return NextResponse.json({
    // A series still loading comes back empty, which the client treats as "ask again"
    series: Object.fromEntries(tokens.map((t, i) => [`${t.chain}:${t.address}`, results[i] ?? []])),
  });
}
