import { NextRequest, NextResponse } from 'next/server';
import { privacyFacts } from '@/chains/privacy';
import { utxoPrivacyFacts } from '@/chains/privacyUtxo';
import { validateAddress } from '@/utils/address';

const COIN_CHAINS = ['bitcoin', 'litecoin', 'dogecoin', 'bitcoincash'];
const CACHE_MS = 10 * 60_000;
const cache: Map<string, { body: unknown; at: number }> = ((globalThis as { __coinPrivacyFacts?: Map<string, { body: unknown; at: number }> }).__coinPrivacyFacts ??= new Map());

/**
 * GET /api/privacy?address=…[&chain=bitcoin] → PrivacyFacts: the public
 * signals behind a wallet's privacy score. EVM addresses cover Ethereum,
 * PulseChain and Base together; coin-chain addresses take the chain to read
 * (a legacy 1…/3… address is valid on both Bitcoin and Bitcoin Cash).
 */
export async function GET(request: NextRequest) {
  const address = request.nextUrl.searchParams.get('address')?.trim() ?? '';
  const validation = validateAddress(address);
  if (validation.format === 'hex') {
    return NextResponse.json(await privacyFacts(address), { headers: { 'Cache-Control': 'public, max-age=300' } });
  }
  const wanted = request.nextUrl.searchParams.get('chain');
  const chain = validation.compatibleChains.find((c) => COIN_CHAINS.includes(c) && (!wanted || c === wanted));
  if (!chain) return NextResponse.json({ error: 'Privacy scores cover EVM, Bitcoin, Litecoin, Dogecoin and Bitcoin Cash addresses' }, { status: 400 });

  const key = `${chain}:${address}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return NextResponse.json(hit.body);
  const body = await utxoPrivacyFacts(chain, address);
  // A failed read (no coin facts) is retried next time rather than cached
  if (body.coin) cache.set(key, { body, at: Date.now() });
  return NextResponse.json(body, { headers: { 'Cache-Control': 'public, max-age=300' } });
}
