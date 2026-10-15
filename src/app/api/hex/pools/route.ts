import { NextResponse } from 'next/server';
import { EvmHandler } from '@/chains/evm';
import { ETHEREUM_CONFIG } from '@/chains/ethereum';
import { PULSECHAIN_CONFIG } from '@/chains/pulsechain';
import { HexPoolStats } from '@/types';

const TTL_MS = 5 * 60_000;
let cached: { pools: HexPoolStats[]; at: number } | null = null;

/**
 * GET /api/hex/pools → every Maximus pool's current cycle on both chains.
 * About 30 RPC calls, so results are cached for 5 minutes.
 */
export async function GET() {
  if (!cached || Date.now() - cached.at > TTL_MS) {
    const perChain = await Promise.allSettled([ETHEREUM_CONFIG, PULSECHAIN_CONFIG].map((c) => new EvmHandler(c).getPoolStats()));
    const pools = perChain.flatMap((r) => (r.status === 'fulfilled' ? r.value : []));
    if (pools.length) cached = { pools, at: Date.now() };
    else return NextResponse.json({ pools: [] }, { status: 502 });
  }
  return NextResponse.json({ pools: cached.pools });
}
