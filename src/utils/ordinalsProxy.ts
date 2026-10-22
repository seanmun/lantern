import 'server-only';
import { NextResponse } from 'next/server';

/**
 * Mirrors ordinals.com's content and recursion endpoints at the same paths
 * (/content/<id>, /r/..., /blockheight ...), so recursive inscriptions such as
 * Quantum Cats can load their dispatcher, layers and art by absolute path.
 *
 * Inscription code is untrusted: the CSP sandbox gives it an opaque origin (no
 * access to this app's storage or cookies) and limits loads to these mirrored
 * endpoints. CORS is open because an opaque-origin frame's fetch() is cross-origin.
 */

const ORD_SERVER = 'https://ordinals.com';
export const INSCRIPTION_ID_RE = /^[0-9a-f]{64}i\d+$/;

const SANDBOX_CSP = [
  'sandbox allow-scripts',
  "default-src 'self' 'unsafe-eval' 'unsafe-inline' data: blob:",
].join('; ');

export async function proxyOrdinals(path: string, { immutable }: { immutable: boolean }): Promise<NextResponse> {
  try {
    const upstream = await fetch(`${ORD_SERVER}${path}`, {
      // Anyone can inscribe Brotli-compressed content, so never let Node decompress
      // it: CVE-2026-111497 (Oct 2026) is an out-of-bounds write in Node's Brotli
      // decoder. Ask for identity and refuse a br response before reading it.
      headers: { 'User-Agent': 'Crypto-Portfolio-Tracker/1.0', Accept: '*/*', 'Accept-Encoding': 'identity' },
      signal: AbortSignal.timeout(15_000),
    });
    if (/\bbr\b/i.test(upstream.headers.get('content-encoding') ?? '')) {
      await upstream.body?.cancel();
      return new NextResponse(null, { status: 406, headers: { 'Access-Control-Allow-Origin': '*' } });
    }
    if (!upstream.ok) {
      // Recursive art often references inscriptions that don't exist yet; a plain 404 is expected
      return new NextResponse(null, { status: upstream.status, headers: { 'Access-Control-Allow-Origin': '*' } });
    }

    return new NextResponse(await upstream.arrayBuffer(), {
      status: 200,
      headers: {
        'Content-Type': upstream.headers.get('content-type') || 'application/octet-stream',
        'Cache-Control': immutable ? 'public, max-age=31536000, immutable' : 'public, max-age=30',
        'Content-Security-Policy': SANDBOX_CSP,
        'Access-Control-Allow-Origin': '*',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) {
    console.error(`Ordinals proxy failed for ${path}:`, error);
    return NextResponse.json({ error: 'Upstream unavailable' }, { status: 502, headers: { 'Access-Control-Allow-Origin': '*' } });
  }
}
