import { NextResponse } from 'next/server';
import { getTShareHistory } from '@/chains/hexHistory';

/**
 * GET /api/hex/tshare-history → monthly T-Share price samples per HEX chain.
 * The first call scans archive state (~100 RPC calls); later calls are cached.
 */
export async function GET() {
  try {
    return NextResponse.json({ history: await getTShareHistory() }, { headers: { 'Cache-Control': 'public, max-age=3600' } });
  } catch (error) {
    console.error('❌ T-Share history failed:', error);
    return NextResponse.json({ history: [], error: 'T-Share history unavailable' }, { status: 502 });
  }
}
