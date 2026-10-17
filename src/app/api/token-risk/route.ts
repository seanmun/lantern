import { NextRequest, NextResponse } from 'next/server';
import { checkToken, RISK_CHAINS, RiskSignal } from '@/chains/tokenRisk';

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;
const MAX_TOKENS = 40;
const CONCURRENCY = 4;

/**
 * POST /api/token-risk
 *   { tokens: [{ chain, address, sameAmountWallets? }] }
 * → { reports: TokenRiskReport[] }
 *
 * sameAmountWallets is supplied by the browser: how many of the viewer's
 * wallets hold exactly the same amount (a mass-airdrop tell).
 */
export async function POST(request: NextRequest) {
  let body: { tokens?: { chain?: unknown; address?: unknown; sameAmountWallets?: unknown }[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const tokens = (Array.isArray(body.tokens) ? body.tokens : [])
    .filter((t): t is { chain: string; address: string; sameAmountWallets?: number } =>
      typeof t.chain === 'string' && RISK_CHAINS.includes(t.chain) && typeof t.address === 'string' && ADDRESS_RE.test(t.address))
    .slice(0, MAX_TOKENS);

  const reports = [];
  for (let i = 0; i < tokens.length; i += CONCURRENCY) {
    reports.push(...await Promise.all(tokens.slice(i, i + CONCURRENCY).map((t) => {
      const extra: RiskSignal[] = Number(t.sameAmountWallets) >= 2
        ? [{ id: 'same-airdrop-amount', strength: 'weak', label: `Exactly the same amount in ${t.sameAmountWallets} of your wallets (mass airdrop)` }]
        : [];
      return checkToken(t.chain, t.address, extra);
    })));
  }
  return NextResponse.json({ reports });
}
