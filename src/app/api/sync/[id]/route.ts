import { NextRequest, NextResponse } from 'next/server';
import { kvAvailable, kvDel, kvExpire, kvGet, kvIncr, kvSet } from '@/server/kv';

/**
 * GET / PUT / DELETE /api/sync/[id]
 *
 * Stores one encrypted blob per sync code. The browser derives both the id
 * and the encryption key from the code (see utils/syncCode.ts), so the server
 * only ever sees an opaque id and ciphertext: no code, no key, no addresses.
 * Copies expire after a year without use; each read or write renews them.
 */

const TTL_SECONDS = 365 * 24 * 60 * 60;
const MAX_BLOB = 400_000; // characters of base64url; real portfolios are a few KB
const RATE_WINDOW_SECONDS = 600;
const RATE_LIMIT = 120; // requests per IP per window
const ID = /^[0-9a-f]{64}$/;
const BLOB = /^[A-Za-z0-9_-]+$/;

const key = (id: string) => `lantern:sync:${id}`;

async function guard(request: NextRequest, id: string): Promise<NextResponse | null> {
  if (!kvAvailable) return NextResponse.json({ error: 'Sync is not configured on this server' }, { status: 503 });
  if (!ID.test(id)) return NextResponse.json({ error: 'Bad sync id' }, { status: 400 });
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || request.headers.get('x-real-ip') || 'local';
  const window = Math.floor(Date.now() / 1000 / RATE_WINDOW_SECONDS);
  try {
    if ((await kvIncr(`lantern:rl:sync:${ip}:${window}`, RATE_WINDOW_SECONDS)) > RATE_LIMIT) {
      return NextResponse.json({ error: 'Too many sync requests. Try again in a few minutes.' }, { status: 429 });
    }
  } catch (error) {
    console.error('❌ sync rate limit:', error);
    return NextResponse.json({ error: 'Sync storage is unavailable' }, { status: 503 });
  }
  return null;
}

type Ctx = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const blocked = await guard(request, id);
  if (blocked) return blocked;
  try {
    const blob = await kvGet(key(id));
    if (!blob) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    await kvExpire(key(id), TTL_SECONDS);
    return NextResponse.json({ blob }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('❌ sync read:', error);
    return NextResponse.json({ error: 'Sync storage is unavailable' }, { status: 503 });
  }
}

export async function PUT(request: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const blocked = await guard(request, id);
  if (blocked) return blocked;
  const body = (await request.json().catch(() => null)) as { blob?: unknown } | null;
  const blob = body?.blob;
  if (typeof blob !== 'string' || blob.length === 0 || blob.length > MAX_BLOB || !BLOB.test(blob)) {
    return NextResponse.json({ error: 'Bad sync data' }, { status: 400 });
  }
  try {
    await kvSet(key(id), blob, TTL_SECONDS);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('❌ sync write:', error);
    return NextResponse.json({ error: 'Sync storage is unavailable' }, { status: 503 });
  }
}

export async function DELETE(request: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const blocked = await guard(request, id);
  if (blocked) return blocked;
  try {
    await kvDel(key(id));
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('❌ sync delete:', error);
    return NextResponse.json({ error: 'Sync storage is unavailable' }, { status: 503 });
  }
}
