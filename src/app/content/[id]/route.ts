import { NextRequest, NextResponse } from 'next/server';
import { INSCRIPTION_ID_RE, proxyOrdinals } from '@/utils/ordinalsProxy';

/** GET /content/<inscription id>: same path as ordinals.com, for recursive inscriptions. */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!INSCRIPTION_ID_RE.test(id)) return NextResponse.json({ error: 'Invalid inscription ID' }, { status: 400 });
  return proxyOrdinals(`/content/${id}`, { immutable: true });
}
