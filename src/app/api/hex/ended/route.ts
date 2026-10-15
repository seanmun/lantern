import { NextRequest, NextResponse } from 'next/server';
import { createProvider } from '@/chains/evm';
import { ETHEREUM_CONFIG } from '@/chains/ethereum';
import { PULSECHAIN_CONFIG } from '@/chains/pulsechain';
import { getEndedStakes } from '@/chains/hexEnded';
import { validateAddress } from '@/utils/address';

const CONFIGS = { ethereum: ETHEREUM_CONFIG, pulsechain: PULSECHAIN_CONFIG };

/**
 * GET /api/hex/ended?address=0x... → ended HEX stakes on each HEX chain.
 * A chain whose RPC can't serve the logs is reported in `unavailable`.
 */
export async function GET(request: NextRequest) {
  const address = request.nextUrl.searchParams.get('address')?.trim() ?? '';
  if (validateAddress(address).format !== 'hex') {
    return NextResponse.json({ error: 'Not a valid EVM address' }, { status: 400 });
  }

  const entries = Object.entries(CONFIGS);
  const results = await Promise.allSettled(entries.map(([chain, config]) => getEndedStakes(chain, createProvider(config), address)));

  const unavailable: string[] = [];
  const stakes = results.flatMap((r, i) => {
    if (r.status === 'fulfilled') return r.value;
    console.warn(`⚠️ Stake history unavailable on ${entries[i][0]}:`, r.reason instanceof Error ? r.reason.message : r.reason);
    unavailable.push(entries[i][0]);
    return [];
  });

  return NextResponse.json({ stakes, unavailable });
}
