import 'server-only';
import { SiteCheck } from '@/types/check';

/**
 * "Is this the real site?" for /check. Lantern never visits the site itself;
 * it only looks at the name:
 *
 * - Official: the domain (or a subdomain) of a project we know.
 * - Known phishing: on MetaMask's open phishing list (eth-phishing-detect).
 * - Look-alike: a misspelling of a known project's name (pulsechlan, puIsex),
 *   or its name dressed up with extra words on another domain
 *   (pulsechain-bridge.app), which is how fake bridges and swap sites are named.
 * - Age: the registration date from the registry's RDAP server (found through
 *   IANA's bootstrap file); phishing domains are usually new.
 */

// Domains confirmed as the real ones. Kept short on purpose: a wrong entry here
// would vouch for a scam, so only projects whose domains are well established.
const OFFICIAL: { brand: string; label: string; domains: string[] }[] = [
  { brand: 'pulsechain', label: 'PulseChain', domains: ['pulsechain.com'] },
  { brand: 'pulsex', label: 'PulseX', domains: ['pulsex.com'] },
  { brand: 'hex', label: 'HEX', domains: ['hex.com'] },
  { brand: 'maximus', label: 'Maximus DAO', domains: ['maximus.cash'] },
  { brand: 'hedron', label: 'Hedron', domains: ['hedron.pro'] },
  { brand: 'icosa', label: 'Icosa', domains: ['icosa.pro'] },
  { brand: 'metamask', label: 'MetaMask', domains: ['metamask.io'] },
  { brand: 'uniswap', label: 'Uniswap', domains: ['uniswap.org'] },
  { brand: 'etherscan', label: 'Etherscan', domains: ['etherscan.io'] },
  { brand: 'revoke', label: 'Revoke.cash', domains: ['revoke.cash'] },
];
// Names too generic to match on their own (e.g. "hex" appears in plenty of honest domains)
const SHORT_BRAND = 4;

const LIST_URL = 'https://raw.githubusercontent.com/MetaMask/eth-phishing-detect/main/src/config.json';
const LIST_TTL_MS = 6 * 60 * 60 * 1000;
const NEW_DOMAIN_DAYS = 90;
const TIMEOUT_MS = 10_000;

let list: { at: number; blocked: Set<string>; allowed: Set<string> } | null = null;

async function phishingList() {
  if (list && Date.now() - list.at < LIST_TTL_MS) return list;
  try {
    const response = await fetch(LIST_URL, { signal: AbortSignal.timeout(20_000) });
    const config: { blacklist?: string[]; whitelist?: string[] } = await response.json();
    list = { at: Date.now(), blocked: new Set(config.blacklist ?? []), allowed: new Set(config.whitelist ?? []) };
  } catch (error) {
    console.warn('⚠️ phishing list unavailable:', error instanceof Error ? error.message : error);
    if (!list) return null;
  }
  return list;
}

/** "https://Bridge.Example.com/x" → "bridge.example.com"; null when it isn't a domain. */
export function parseDomain(input: string): string | null {
  const trimmed = input.trim().toLowerCase();
  if (!trimmed || /\s/.test(trimmed)) return null;
  try {
    const host = new URL(/^[a-z]+:\/\//.test(trimmed) ? trimmed : `https://${trimmed}`).hostname.replace(/\.$/, '');
    return /^([a-z0-9-]+\.)+[a-z0-9-]{2,}$/.test(host) && !/^\d+(\.\d+){3}$/.test(host) ? host : null;
  } catch {
    return null;
  }
}

// The registrable part: last two labels, or three for co.uk-style suffixes
const SECOND_LEVEL = new Set(['co', 'com', 'net', 'org', 'gov', 'ac', 'edu']);
function registrable(host: string): string {
  const parts = host.split('.');
  const n = parts.length >= 3 && SECOND_LEVEL.has(parts[parts.length - 2]) && parts[parts.length - 1].length === 2 ? 3 : 2;
  return parts.slice(-n).join('.');
}

// Characters scammers swap in for look-alikes
const normalize = (s: string) =>
  s.replace(/rn/g, 'm').replace(/vv/g, 'w').replace(/[0]/g, 'o').replace(/[1|]/g, 'l').replace(/[3]/g, 'e').replace(/[5]/g, 's').replace(/[-_]/g, '').replace(/i/g, 'l');

function distance(a: string, b: string): number {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
  }
  return dp[a.length][b.length];
}

let rdapServers: { at: number; byTld: Map<string, string> } | null = null;

/** Registry RDAP servers by TLD, from IANA's bootstrap file. */
async function rdapServer(tld: string): Promise<string | null> {
  if (!rdapServers || Date.now() - rdapServers.at > 24 * 60 * 60 * 1000) {
    try {
      const response = await fetch('https://data.iana.org/rdap/dns.json', { signal: AbortSignal.timeout(TIMEOUT_MS) });
      const { services }: { services: [string[], string[]][] } = await response.json();
      const byTld = new Map<string, string>();
      for (const [tlds, urls] of services) for (const t of tlds) byTld.set(t, urls[0].replace(/\/?$/, '/'));
      rdapServers = { at: Date.now(), byTld };
    } catch {
      if (!rdapServers) return null;
    }
  }
  return rdapServers.byTld.get(tld) ?? null;
}

async function registeredAt(domain: string): Promise<number | null> {
  const server = await rdapServer(domain.split('.').pop()!);
  if (!server) return null;
  try {
    const response = await fetch(`${server}domain/${domain}`, { headers: { Accept: 'application/rdap+json' }, signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!response.ok) return null;
    const body: { events?: { eventAction?: string; eventDate?: string }[] } = await response.json();
    const date = body.events?.find((e) => e.eventAction === 'registration')?.eventDate;
    return date ? Date.parse(date) : null;
  } catch {
    return null;
  }
}

export async function checkSite(host: string): Promise<SiteCheck> {
  const domain = registrable(host);
  const name = domain.split('.')[0];
  const [phish, registered] = await Promise.all([phishingList(), registeredAt(domain)]);
  const ageDays = registered !== null ? Math.floor((Date.now() - registered) / 86_400_000) : null;
  const base = { host, domain, registeredAt: registered, ageDays };

  const official = OFFICIAL.find((o) => o.domains.some((d) => host === d || host.endsWith(`.${d}`)));
  if (official) return { ...base, verdict: 'official', brand: official.label, notes: [`This is ${official.label}’s real domain.`] };

  const blocked = phish && (phish.blocked.has(host) || phish.blocked.has(domain)) && !phish.allowed.has(host) && !phish.allowed.has(domain);
  // Look-alikes: misspelled brand names, or brand names with extra words on someone else's domain
  const n = normalize(name);
  const imitated = OFFICIAL.find((o) => {
    const b = normalize(o.brand); // compare like with like: both sides normalized
    if (n === b) return true; // pulsechain.app, pu1sechain.com
    if (b.length >= 6 && distance(n, b) <= (b.length >= 9 ? 2 : 1)) return true;
    return b.length > SHORT_BRAND && n.includes(b);
  });

  const notes: string[] = [];
  if (blocked) notes.push('Listed as a phishing site on MetaMask’s public blocklist.');
  if (imitated) {
    notes.push(n === normalize(imitated.brand) || n.includes(normalize(imitated.brand))
      ? `Uses the ${imitated.label} name, but ${imitated.label}’s real site is ${imitated.domains[0]}.`
      : `Looks like a misspelling of ${imitated.label}. The real site is ${imitated.domains[0]}.`);
  }
  if (ageDays !== null && ageDays < NEW_DOMAIN_DAYS) notes.push(`Registered only ${ageDays} day${ageDays === 1 ? '' : 's'} ago. Scam sites are usually new.`);
  else if (ageDays !== null) notes.push(`Registered ${new Date(registered!).toLocaleDateString('en-US', { year: 'numeric', month: 'long' })}.`);

  const verdict: SiteCheck['verdict'] = blocked || (imitated && (ageDays === null || ageDays < 365 * 2))
    ? 'phishing'
    : imitated || (ageDays !== null && ageDays < NEW_DOMAIN_DAYS)
      ? 'caution'
      : 'unknown';
  if (verdict === 'unknown') notes.push('No warnings found. Lantern can’t vouch for sites it doesn’t know, so double-check before connecting a wallet.');
  return { ...base, verdict, brand: imitated?.label ?? null, notes };
}
