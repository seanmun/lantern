import { NextRequest, NextResponse } from 'next/server';
import { isLogoChain, resolveLogo } from '@/utils/logoResolver';

/**
 * GET /api/logos/[chain]/[address]   token logo
 * GET /api/logos/native/[coinId]     native coin logo (bitcoin, ethereum, ...)
 *
 * Serves the image bytes from this origin (see logoResolver), or 404 when no
 * source has one. Images are sandboxed so an SVG can't run script here.
 */

const ID_RE = /^(0x[0-9a-fA-F]{40}|[1-9A-HJ-NP-Za-km-z]{32,44}|[a-z-]{2,32})$/;

export async function GET(_request: NextRequest, { params }: { params: Promise<{ chain: string; id: string }> }) {
  const { chain, id } = await params;
  if (!isLogoChain(chain) || !ID_RE.test(id)) return new NextResponse(null, { status: 404 });

  const logo = await resolveLogo(chain, id);
  // Short browser cache on a miss: it may be a rate-limited source that recovers
  if (!logo) return new NextResponse(null, { status: 404, headers: { 'Cache-Control': 'public, max-age=300' } });

  return new NextResponse(logo.body, {
    headers: {
      'Content-Type': logo.contentType,
      'Cache-Control': 'public, max-age=86400, stale-while-revalidate=604800',
      'Content-Security-Policy': "default-src 'none'; img-src data:; style-src 'unsafe-inline'; sandbox",
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
