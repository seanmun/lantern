import { NextRequest, NextResponse } from 'next/server';
import { privacyFacts } from '@/chains/privacy';

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

/** GET /api/privacy?address=0x… → PrivacyFacts: the public signals behind a wallet's privacy score. */
export async function GET(request: NextRequest) {
  const address = request.nextUrl.searchParams.get('address')?.trim() ?? '';
  if (!ADDRESS_RE.test(address)) return NextResponse.json({ error: 'Not an EVM address' }, { status: 400 });
  return NextResponse.json(await privacyFacts(address), { headers: { 'Cache-Control': 'public, max-age=300' } });
}
