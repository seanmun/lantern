import 'server-only';
import { NextResponse } from 'next/server';
import { fetchUntrusted, UntrustedFetchError } from '@/server/untrustedFetch';

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
// Inscriptions are capped by Bitcoin's 4 MB block weight; leave headroom for recursion endpoints
const MAX_CONTENT_BYTES = 8 * 1024 * 1024;
export const INSCRIPTION_ID_RE = /^[0-9a-f]{64}i\d+$/;

const SANDBOX_CSP = [
  'sandbox allow-scripts',
  "default-src 'self' 'unsafe-eval' 'unsafe-inline' data: blob:",
].join('; ');

export async function proxyOrdinals(path: string, { immutable }: { immutable: boolean }): Promise<NextResponse> {
  try {
    // Anyone can inscribe compressed content, so the response is never decompressed
    // here (see server/untrustedFetch.ts, CVE-2026-111497); compressed content is refused
    const upstream = await fetchUntrusted(`${ORD_SERVER}${path}`, {
      timeoutMs: 15_000,
      maxBytes: MAX_CONTENT_BYTES,
      headers: { 'User-Agent': 'Lantern/1.0 (+https://github.com/seanmun/lantern)', Accept: '*/*' },
    });
    if (!upstream.ok) {
      // Recursive art often references inscriptions that don't exist yet; a plain 404 is expected
      return new NextResponse(null, { status: upstream.status, headers: { 'Access-Control-Allow-Origin': '*' } });
    }

    return new NextResponse(new Uint8Array(upstream.body), {
      status: 200,
      headers: {
        'Content-Type': upstream.contentType || 'application/octet-stream',
        'Cache-Control': immutable ? 'public, max-age=31536000, immutable' : 'public, max-age=30',
        'Content-Security-Policy': SANDBOX_CSP,
        'Access-Control-Allow-Origin': '*',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) {
    if (error instanceof UntrustedFetchError && (error.reason === 'encoded' || error.reason === 'too-large')) {
      return new NextResponse(null, { status: error.reason === 'encoded' ? 406 : 413, headers: { 'Access-Control-Allow-Origin': '*' } });
    }
    console.error(`Ordinals proxy failed for ${path}:`, error);
    return NextResponse.json({ error: 'Upstream unavailable' }, { status: 502, headers: { 'Access-Control-Allow-Origin': '*' } });
  }
}
