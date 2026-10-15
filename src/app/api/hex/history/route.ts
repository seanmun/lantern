import { NextResponse } from 'next/server';
import { createProvider } from '@/chains/evm';
import { ETHEREUM_CONFIG } from '@/chains/ethereum';
import { PULSECHAIN_CONFIG } from '@/chains/pulsechain';
import { getHexState, payoutHistory } from '@/chains/hex';

/**
 * GET /api/hex/history → daily payout per T-Share for each HEX chain.
 * { history: { ethereum: number[], pulsechain: number[] } }, index = HEX day.
 */
export async function GET() {
  const configs = [ETHEREUM_CONFIG, PULSECHAIN_CONFIG];
  const results = await Promise.allSettled(
    configs.map(async (config) => payoutHistory(await getHexState(config.key, createProvider(config))))
  );

  const history: Record<string, number[]> = {};
  results.forEach((result, i) => {
    if (result.status === 'fulfilled') history[configs[i].key] = result.value;
    else console.warn(`⚠️ HEX history failed for ${configs[i].key}:`, result.reason);
  });

  return NextResponse.json({ history }, { headers: { 'Cache-Control': 'public, max-age=300' } });
}
