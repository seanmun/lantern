import { NextRequest, NextResponse } from 'next/server';
import { proxyOrdinals } from '@/utils/ordinalsProxy';

const SEGMENT_RE = /^[A-Za-z0-9:._-]{1,100}$/;

/**
 * GET /r/...: ordinals.com recursive endpoints (/r/sat/<n>, /r/children/<id>,
 * /r/metadata/<id>, /r/blockheight, ...), passed through for recursive art.
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  if (path.length === 0 || path.length > 6 || !path.every((s) => SEGMENT_RE.test(s))) {
    return NextResponse.json({ error: 'Invalid path' }, { status: 400 });
  }
  // Content under /r/ (e.g. /r/content) is immutable; chain-state endpoints are not
  const immutable = path[0] === 'content' || path[0] === 'metadata';
  return proxyOrdinals(`/r/${path.map(encodeURIComponent).join('/')}`, { immutable });
}
