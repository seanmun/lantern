import { PrivacyFacts } from '@/types/privacy';

/**
 * Wallet privacy score, 0 to 100: how hard it is for a stranger to work out
 * who owns a wallet and what else they own. Computed in the browser from
 * public facts, plus what only the browser knows (the viewer's other tracked
 * wallets). Most wallets score low today; the fixes are the point.
 *
 * A heuristic from public explorer data, not what a chain-analysis firm with
 * private datasets can see: it can only be optimistic, never pessimistic.
 */

export interface PrivacyFactor {
  id: string;
  label: string;   // what we found
  impact: number;  // points (negative lowers the score)
  fix?: string;    // what would improve it
}

export interface PrivacyScore {
  score: number;
  band: 'exposed' | 'partial' | 'private';
  factors: PrivacyFactor[];
}

export interface PrivacyContext {
  otherWallets: string[]; // the viewer's other tracked wallets, lowercase
  valueUSD: number;       // the wallet's visible holdings
  nftCount: number;
}

export function privacyScore(facts: PrivacyFacts, ctx: PrivacyContext): PrivacyScore {
  const factors: PrivacyFactor[] = [];

  if (facts.identityTags.length) {
    factors.push({
      id: 'identity-tags', impact: -35,
      label: `Publicly labelled on block explorers as: ${facts.identityTags.slice(0, 3).join(', ')}.`,
      fix: 'Labels can’t be removed. Use a fresh, unlabelled wallet for anything you want kept private.',
    });
  }
  if (facts.ens) {
    factors.push({
      id: 'ens', impact: -25,
      label: `Has a readable name, ${facts.ens}, so its activity can be looked up by name.`,
      fix: 'Keep the named wallet for public use and hold funds in a separate, unnamed one.',
    });
  }
  if (facts.exchanges.length) {
    const names = facts.exchanges.map((e) => e.name).join(', ');
    factors.push({
      id: 'exchanges', impact: -25,
      label: `Sent or received funds directly with ${names}. Exchanges know their customers, so this links the wallet to an identity.`,
      fix: 'Withdraw from exchanges to a fresh wallet and move funds on from there, or through a privacy system such as Railgun.',
    });
  }
  const linked = facts.counterparties.filter((c) => ctx.otherWallets.includes(c));
  if (linked.length) {
    factors.push({
      id: 'linked-wallets', impact: -15,
      label: `Transacts with ${linked.length} of your other tracked wallet${linked.length === 1 ? '' : 's'}, so finding one reveals the others.`,
      fix: 'Avoid sending directly between wallets you want kept apart.',
    });
  }
  if (facts.activeChains.length >= 2) {
    factors.push({
      id: 'cross-chain', impact: -10,
      label: `The same address is used on ${facts.activeChains.length} chains, which ties all that activity together.`,
      fix: 'Use different addresses on different chains for funds you want kept apart.',
    });
  }
  if (facts.transactions > 1000) {
    factors.push({ id: 'history', impact: -15, label: `${facts.transactions.toLocaleString()} public transactions: a long history makes habits easy to read.`, fix: 'Start new activity from a fresh wallet now and then.' });
  } else if (facts.transactions > 100) {
    factors.push({ id: 'history', impact: -8, label: `${facts.transactions.toLocaleString()} public transactions.`, fix: 'Start new activity from a fresh wallet now and then.' });
  }
  if (ctx.valueUSD >= 100_000) {
    factors.push({ id: 'value', impact: -10, label: 'A large balance is visible to anyone, which makes the wallet a target for scams.', fix: 'Spreading holdings across wallets makes any one of them less of a target.' });
  } else if (ctx.valueUSD >= 10_000) {
    factors.push({ id: 'value', impact: -5, label: 'A sizeable balance is visible to anyone.', fix: 'Spreading holdings across wallets makes any one of them less of a target.' });
  }
  if (ctx.nftCount > 0) {
    factors.push({ id: 'nfts', impact: -5, label: 'Holds NFTs, which often tie a wallet to a social profile picture.', fix: 'Keep NFTs you show off in a separate wallet from your savings.' });
  }
  if (facts.privacyTools.length) {
    factors.push({ id: 'privacy-tools', impact: 15, label: `Has used ${facts.privacyTools.join(', ')}, which breaks the link between where funds came from and where they went.` });
  }

  const score = Math.max(0, Math.min(100, 100 + factors.reduce((s, f) => s + f.impact, 0)));
  return { score, band: score >= 70 ? 'private' : score >= 40 ? 'partial' : 'exposed', factors };
}
