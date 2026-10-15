import { NextRequest, NextResponse } from 'next/server';

const INSCRIPTION_ID_RE = /^[0-9a-f]{64}i\d+$/;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ inscriptionId: string }> }
) {
  const { inscriptionId } = await params;

  if (!INSCRIPTION_ID_RE.test(inscriptionId)) {
    return NextResponse.json({ error: 'Invalid inscription ID' }, { status: 400 });
  }

  try {
    // Use Ordinals.com content endpoint
    const ordinalsUrl = `https://ordinals.com/content/${inscriptionId}`;

    const response = await fetch(ordinalsUrl, {
      headers: {
        'User-Agent': 'Crypto-Portfolio-Tracker/1.0',
      },
      signal: AbortSignal.timeout(15_000),
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch ordinal content: ${response.status}`);
    }

    const contentType = response.headers.get('content-type') || 'application/octet-stream';
    const data = await response.arrayBuffer();

    return new NextResponse(data, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=86400', // Inscriptions are immutable
        // Inscription HTML/SVG is untrusted: even if opened directly it runs in
        // an opaque origin and can't touch this app's storage or cookies.
        'Content-Security-Policy': 'sandbox allow-scripts',
        'X-Content-Type-Options': 'nosniff',
      },
    });

  } catch (error) {
    console.error('Error fetching ordinal content:', error);
    return NextResponse.json(
      { error: 'Failed to fetch ordinal content' },
      { status: 502 }
    );
  }
}
