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
  /** Other wallets this one is likely tied to, and why */
  linked: { count: number; reasons: string[]; unit: 'wallet' | 'address' };
  /** Where the score could get by fixing what can still change on this wallet (ENS, balance, NFTs) */
  potential: number;
}

const MAX_DEPOSIT_PEERS = 10;
const FIXABLE_IN_PLACE = new Set(['ens', 'ens-records', 'value', 'nfts']);
const plural = (n: number, word: string, many = `${word}s`) => `${n.toLocaleString()} ${n === 1 ? word : many}`;

/** "UTC−5", with a rough region so the number means something */
function zoneLabel(offset: number): string {
  const sign = offset < 0 ? '−' : '+';
  const utc = offset === 0 ? 'UTC' : `UTC${sign}${Math.abs(offset)}`;
  const region = offset <= -3 ? 'the Americas' : offset <= 3 ? 'Europe or Africa' : offset <= 6 ? 'the Middle East or South Asia' : 'East Asia or Oceania';
  return `${utc} (${region})`;
}

export interface PrivacyContext {
  otherWallets: string[]; // the viewer's other tracked wallets, lowercase
  valueUSD: number;       // the wallet's visible holdings
  nftCount: number;
}

const listOf = (items: string[]) => (items.length <= 1 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`);

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
  if (facts.ensRecords.length) {
    factors.push({
      id: 'ens-records', impact: -10,
      label: `Its ENS profile publishes ${listOf(facts.ensRecords)}, tying the wallet to accounts elsewhere.`,
      fix: 'Remove the records you don’t need from the ENS profile (app.ens.domains → Records).',
    });
  }
  // A deposit address paid by a few other wallets points to one person; by many, it's a shared or payment address
  const depositsWithOthers = facts.deposits.filter((d) => d.otherSenders > 0 && d.otherSenders <= MAX_DEPOSIT_PEERS);
  if (facts.deposits.length) {
    const names = [...new Set(facts.deposits.map((d) => d.exchange))];
    // Exchanges already counted above cost less here: the deposit address only sharpens that link
    const fresh = names.some((n) => !facts.exchanges.some((e) => e.name === n));
    factors.push({
      id: 'deposits', impact: fresh ? -20 : -10,
      label: `Pays into ${names.length === 1 ? `a ${names[0]} deposit address` : `deposit addresses at ${listOf(names)}`}. Each one belongs to a single customer account, so the exchange (and anyone it shares data with) can name this wallet’s owner.`,
      fix: 'Send to exchanges from a separate wallet that holds nothing else, never from your main one.',
    });
  }
  if (facts.funder?.kind === 'exchange') {
    factors.push({
      id: 'funder-exchange', impact: facts.exchanges.some((e) => e.name === facts.funder!.name) ? -5 : -15,
      label: `Its very first funds came straight from ${facts.funder.name}, which ties it to an exchange account from day one.`,
      fix: 'Fund new wallets through an intermediate wallet or a privacy system rather than directly from an exchange.',
    });
  }
  if (facts.exchanges.length) {
    const names = facts.exchanges.map((e) => e.name).join(', ');
    factors.push({
      id: 'exchanges', impact: -25,
      label: `Sent or received funds directly with ${names}. Exchanges know their customers, so this links the wallet to an identity.`,
      fix: facts.coin
        ? 'Withdraw from exchanges to a fresh address, and consider a wallet with CoinJoin before moving funds on.'
        : 'Withdraw from exchanges to a fresh wallet and move funds on from there, or through a privacy system such as Railgun.',
    });
  }
  const ownLinked = new Set(facts.counterparties.filter((c) => ctx.otherWallets.includes(c)));
  const fundedByOwn = !!facts.funder && ctx.otherWallets.includes(facts.funder.address.toLowerCase());
  if (fundedByOwn) ownLinked.add(facts.funder!.address.toLowerCase());
  if (ownLinked.size) {
    factors.push({
      id: 'linked-wallets', impact: -15,
      label: `${fundedByOwn ? 'Was funded by, or transacts with,' : 'Transacts with'} ${ownLinked.size} of your other tracked wallet${ownLinked.size === 1 ? '' : 's'}, so finding one reveals the others.`,
      fix: 'Avoid sending directly between wallets you want kept apart.',
    });
  }

  // How many other wallets an observer could tie to this one, and why
  const reasons: string[] = [];
  let linkedCount = 0;
  const depositPeers = depositsWithOthers.reduce((s, d) => s + d.otherSenders, 0);
  if (depositPeers) {
    linkedCount += depositPeers;
    reasons.push(`${plural(depositPeers, 'wallet')} paying into the same exchange deposit address${depositsWithOthers.length === 1 ? '' : 'es'}`);
  }
  if (facts.funder?.kind === 'wallet') {
    linkedCount += 1;
    reasons.push('the wallet that first funded it');
  }
  // Coin chains: the whole-history cluster when known, else what recent co-spending shows
  const coinPeers = facts.coin ? Math.max((facts.coin.cluster ?? 1) - 1, facts.coin.coSpent) : 0;
  if (coinPeers) {
    linkedCount += coinPeers;
    reasons.push(facts.coin!.cluster && facts.coin!.cluster - 1 >= facts.coin!.coSpent ? 'addresses grouped with it by how they were spent together, across its whole history' : 'addresses spent together with it');
  }
  if (facts.twoWay) {
    linkedCount += facts.twoWay;
    reasons.push(`${plural(facts.twoWay, 'wallet')} it both sends to and receives from`);
  }
  if (linkedCount >= 3) {
    factors.push({
      id: 'cluster', impact: linkedCount >= 10 ? -15 : -10,
      label: `Likely tied to about ${facts.coin ? plural(linkedCount, 'other address', 'other addresses') : plural(linkedCount, 'other wallet')}: ${listOf(reasons)}. Finding any of them leads here.`,
      fix: 'Keep wallets you want separate from ever paying each other, sharing a funder or sharing an exchange deposit address.',
    });
  }
  if (facts.activeChains.length >= 2) {
    factors.push({
      id: 'cross-chain', impact: -10,
      label: `The same address is used on ${facts.activeChains.length} chains, which ties all that activity together.`,
      fix: 'Use different addresses on different chains for funds you want kept apart.',
    });
  }
  if (facts.coin) {
    const { received, receivedAtLeast, coSpent } = facts.coin;
    if (received >= 2) {
      factors.push({
        id: 'reuse', impact: received >= 10 ? -25 : -15,
        label: `This one address has received ${received.toLocaleString()}${receivedAtLeast ? '+' : ''} payments. Reusing an address ties every payment, and everyone who paid it, to the same owner.`,
        fix: 'Use a wallet that gives a fresh receiving address every time (most modern wallets do) and move funds off this one.',
      });
    }
    if (coSpent > 0) {
      factors.push({
        id: 'co-spend', impact: coSpent >= 5 ? -15 : -10,
        label: `It was spent in the same transaction as ${plural(coSpent, 'other address', 'other addresses')}, which marks them all as one owner (the rule chain analysis is built on).`,
        fix: 'Avoid combining coins from different sources in one payment. Wallets with coin control let you pick which coins to spend.',
      });
    }
  }
  if (facts.timezone) {
    factors.push({
      id: 'timezone', impact: -5,
      label: `Its own transactions stop around the same hours every day, which suggests ${zoneLabel(facts.timezone.offset)} (from ${facts.timezone.sample} recent sends).`,
      fix: 'Hard to avoid by hand. Scheduling or batching transactions blurs the pattern.',
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
    const tornado = facts.privacyTools.includes('Tornado Cash');
    factors.push({
      id: 'privacy-tools', impact: 15,
      label: `Has used ${listOf(facts.privacyTools)}, which breaks the link between where funds came from and where they went.${tornado ? ' Tornado Cash is no longer under US sanctions (since March 2025), but some exchanges still freeze deposits traced back to it.' : ''}`,
    });
  }

  const clamp = (n: number) => Math.max(0, Math.min(100, n));
  const score = clamp(100 + factors.reduce((s, f) => s + f.impact, 0));
  // Only these can still change on this wallet; the rest is permanent public history
  const potential = clamp(score - factors.filter((f) => FIXABLE_IN_PLACE.has(f.id)).reduce((s, f) => s + f.impact, 0));
  return { score, band: score >= 70 ? 'private' : score >= 40 ? 'partial' : 'exposed', factors, linked: { count: linkedCount, reasons, unit: facts.coin ? 'address' : 'wallet' }, potential: Math.max(score, potential) };
}
