import { NextRequest, NextResponse } from 'next/server';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ inscriptionId: string }> }
) {
  const { inscriptionId } = await params;

  if (!inscriptionId) {
    return NextResponse.json({ error: 'Inscription ID is required' }, { status: 400 });
  }

  try {
    // Use Ordinals.com content endpoint
    const ordinalsUrl = `https://ordinals.com/content/${inscriptionId}`;

    const response = await fetch(ordinalsUrl, {
      headers: {
        'User-Agent': 'Crypto-Portfolio-Tracker/1.0',
      }
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
        'Cache-Control': 'public, max-age=86400', // Cache for 24 hours
        'Access-Control-Allow-Origin': '*',
      },
    });

  } catch (error) {
    console.error('Error fetching ordinal content:', error);
    return NextResponse.json(
      { error: 'Failed to fetch ordinal content' },
      { status: 500 }
    );
  }
}