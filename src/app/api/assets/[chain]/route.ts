import { NextRequest, NextResponse } from 'next/server';
import { getHandler } from '@/chains';
import { Asset, APIResponse } from '@/types';
import { isSupportedChain, validateAddress } from '@/utils/address';

/**
 * GET /api/assets/[chain]?address=...
 *
 * Runs the chain handler server-side so API keys stay off the browser.
 * Responses are cached briefly in memory to protect free-tier rate limits.
 */

const CACHE_TTL_MS = 30_000;
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

  const key = `${chain}:${address.toLowerCase()}`;
  const hit = cache.get(key);
  const refresh = request.nextUrl.searchParams.has('refresh');
  if (hit && !refresh && Date.now() - hit.at < CACHE_TTL_MS) {
    return NextResponse.json(hit.body);
  }

  const body = await getHandler(chain).getAllAssets(address);
  if (body.success) cache.set(key, { body, at: Date.now() });

  const status = body.success ? 200 : body.errorCode === 'RATE_LIMITED' ? 429 : 502;
  return NextResponse.json(body, { status });
}
