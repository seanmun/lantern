import { NextRequest, NextResponse } from 'next/server';
import { transactionsPage } from '@/chains/transactions';
import { isSupportedChain, validateAddress } from '@/utils/address';

/**
 * GET /api/transactions?chain=&address=&cursor=
 * One page of a wallet's history on one chain; pass back `cursor` for more.
 */
export async function GET(request: NextRequest) {
  const chain = request.nextUrl.searchParams.get('chain') ?? '';
  const address = request.nextUrl.searchParams.get('address')?.trim() ?? '';
  const cursor = request.nextUrl.searchParams.get('cursor');

  if (!isSupportedChain(chain)) return NextResponse.json({ error: 'Unsupported chain' }, { status: 404 });
  if (!validateAddress(address).compatibleChains.includes(chain)) return NextResponse.json({ error: 'Invalid address' }, { status: 400 });
  if (cursor && cursor.length > 2000) return NextResponse.json({ error: 'Invalid cursor' }, { status: 400 });

  try {
    return NextResponse.json(await transactionsPage(chain, address, cursor));
  } catch (error) {
    console.error(`❌ Transactions failed for ${chain}:`, error);
    return NextResponse.json({ txs: [], cursor: cursor ?? null, error: error instanceof Error ? error.message : 'History unavailable' }, { status: 502 });
  }
}
