import { NextRequest, NextResponse } from 'next/server';
import { INSCRIPTION_ID_RE, proxyOrdinals } from '@/utils/ordinalsProxy';

/** Legacy alias of /content/<id>; new code uses /content so recursion paths resolve. */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ inscriptionId: string }> }) {
  const { inscriptionId } = await params;
  if (!INSCRIPTION_ID_RE.test(inscriptionId)) return NextResponse.json({ error: 'Invalid inscription ID' }, { status: 400 });
  return proxyOrdinals(`/content/${inscriptionId}`, { immutable: true });
}
