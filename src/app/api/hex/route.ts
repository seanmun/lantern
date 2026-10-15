import { NextResponse } from 'next/server';
import { createProvider } from '@/chains/evm';
import { ETHEREUM_CONFIG } from '@/chains/ethereum';
import { PULSECHAIN_CONFIG } from '@/chains/pulsechain';
import { getHexState, networkStats } from '@/chains/hex';
import { HexNetworkStats } from '@/types';

/**
 * GET /api/hex → network-wide HEX stats for each HEX chain.
 * Chains that fail are omitted rather than failing the whole response.
 */
export async function GET() {
  const results = await Promise.allSettled(
    [ETHEREUM_CONFIG, PULSECHAIN_CONFIG].map(async (config) =>
      networkStats(config.key, await getHexState(config.key, createProvider(config)))
    )
  );

  const stats: HexNetworkStats[] = [];
  for (const result of results) {
    if (result.status === 'fulfilled') stats.push(result.value);
    else console.warn('⚠️ HEX stats failed:', result.reason);
  }

  return NextResponse.json({ stats });
}
