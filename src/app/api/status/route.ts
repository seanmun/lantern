import { NextResponse } from 'next/server';
import { getStatus } from '@/chains/status';

/** GET /api/status → StatusReport (see src/types/status.ts). Refreshed at most once a minute. */
export async function GET() {
  return NextResponse.json(await getStatus(), { headers: { 'Cache-Control': 'public, max-age=30' } });
}
