import { NextRequest, NextResponse } from 'next/server';
import { getHandler } from '@/chains';
import { Asset, APIResponse } from '@/types';
import { isSupportedChain, normalizeAddress, validateAddress } from '@/utils/address';

/**
 * GET /api/assets/[chain]?address=...
 *
 * Runs the chain handler server-side so API keys stay off the browser.
 * Responses are cached briefly in memory to protect free-tier rate limits.
 */

const CACHE_TTL_MS = 30_000;
const TIMEOUT_MS = 45_000; // throttled public RPCs can otherwise retry for minutes
const cache = new Map<string, { body: APIResponse<Asset[]>; at: number }>();

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ chain: string }> }
) {
  const { chain } = await params;
  const address = request.nextUrl.searchParams.get('address')?.trim() ?? '';

  if (!isSupportedChain(chain)) {
    return NextResponse.json({ success: false, error: `Unsupported chain: ${chain}` }, { status: 404 });
  }
  if (!validateAddress(address).compatibleChains.includes(chain)) {
    return NextResponse.json({ success: false, error: `Not a valid ${chain} address` }, { status: 400 });
  }

  const key = `${chain}:${normalizeAddress(chain, address)}`;
  const hit = cache.get(key);
  const refresh = request.nextUrl.searchParams.has('refresh');
  if (hit && !refresh && Date.now() - hit.at < CACHE_TTL_MS) {
    return NextResponse.json(hit.body);
  }

  const body: APIResponse<Asset[]> = await Promise.race([
    getHandler(chain).getAllAssets(address),
    new Promise<APIResponse<Asset[]>>((resolve) =>
      setTimeout(() => resolve({
        success: false,
        error: `${chain} RPC timed out; its public endpoint may be rate-limiting. Try again shortly or configure a dedicated RPC.`,
        errorCode: 'TIMEOUT',
        timestamp: new Date(),
      }), TIMEOUT_MS)
    ),
  ]);
  if (body.success) cache.set(key, { body, at: Date.now() });

  const status = body.success ? 200 : body.errorCode === 'RATE_LIMITED' ? 429 : body.errorCode === 'TIMEOUT' ? 504 : 502;
  return NextResponse.json(body, { status });
}
