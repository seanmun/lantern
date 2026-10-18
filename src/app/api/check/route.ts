import { NextRequest, NextResponse } from 'next/server';
import { check } from '@/chains/check';

/**
 * GET /api/check?q=<address | token contract | transaction hash>
 * → CheckResult (see src/types/check.ts). Read-only lookups of public chain data.
 */
export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get('q')?.trim() ?? '';
  if (!q || q.length > 100) return NextResponse.json({ kind: 'invalid', message: 'Paste a wallet address, a token contract address or a transaction hash.' });
  try {
    return NextResponse.json(await check(q), { headers: { 'Cache-Control': 'public, max-age=60' } });
  } catch (error) {
    console.warn('⚠️ check failed:', error);
    return NextResponse.json({ kind: 'not-found', message: 'Something went wrong looking that up. Try again in a moment.' }, { status: 502 });
  }
}
