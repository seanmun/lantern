import { NextRequest, NextResponse } from 'next/server';
import { walletApprovals } from '@/chains/approvals';

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

/** GET /api/approvals?address=0x… → ApprovalsReport: a wallet's open token approvals on PulseChain and Ethereum. */
export async function GET(request: NextRequest) {
  const address = request.nextUrl.searchParams.get('address')?.trim() ?? '';
  if (!ADDRESS_RE.test(address)) return NextResponse.json({ error: 'Not an EVM address' }, { status: 400 });
  return NextResponse.json(await walletApprovals(address), { headers: { 'Cache-Control': 'public, max-age=120' } });
}
