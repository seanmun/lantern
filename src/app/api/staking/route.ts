import { NextResponse } from 'next/server';
import { getValidatorStats } from '@/chains/validators';

/**
 * GET /api/staking → { networks: ValidatorNetworkStats[] }
 *
 * Ethereum and PulseChain validator economics (reward rates, stake, a year of
 * prices and, for PulseChain, of reward rates). Cached for an hour server-side.
 */
export async function GET() {
  const networks = await getValidatorStats();
  return NextResponse.json({ networks }, { headers: { 'Cache-Control': 'public, max-age=600' } });
}
