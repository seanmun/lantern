import type { Metadata } from 'next';
import Link from 'next/link';
import { LanternMark } from '@/components/app/AppShell';
import { SITE } from '@/config/site';

export const metadata: Metadata = {
  title: 'About',
  description: 'What Lantern is, what it will never do, and how your data is handled.',
};

const NEVER = [
  'Ask for your seed phrase, private key or recovery words.',
  'Ask you to connect your wallet or sign anything to see your portfolio.',
  'Message you first on Telegram, X, Discord or anywhere else. Anyone claiming to be "Lantern support" in your DMs is a scammer.',
  'Hold, move or "recover" funds. Lantern is read-only.',
];

const DATA = [
  { title: 'Your addresses stay in your browser', body: 'Wallet addresses you add are saved in this browser’s local storage. There are no accounts and no database of users.' },
  { title: 'Sync is encrypted, and optional', body: 'If you turn on a sync code, your wallet list is encrypted in your browser with a key made from that code before it is uploaded. Lantern’s server stores only the scrambled copy and can’t read it, and no email or name is attached. Lose the code and the copy can’t be opened by anyone, including us. Unused copies are deleted after a year.' },
  { title: 'Lookups go through Lantern’s server', body: 'To read balances, prices and logos, your browser asks Lantern’s server, which asks public blockchain nodes and price services. Third parties see Lantern asking, not you. The server keeps short-lived caches of public data, not a record of who looked up what. NFT images are the exception: your browser loads them directly from where they are hosted.' },
  { title: 'No tracking', body: 'No analytics, no ads, no cookies for tracking.' },
  { title: 'You can run your own', body: 'Lantern is open source under the MIT license. Run it on your own computer and nothing passes through anyone else’s server.' },
];

export default function AboutPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-10">
      <section className="flex flex-col items-start gap-4">
        <LanternMark size={56} />
        <h1 className="text-4xl font-extrabold tracking-tight text-ink sm:text-5xl">Shine a light on your portfolio</h1>
        <p className="text-lg leading-relaxed text-muted">
          Lantern is a free, open-source portfolio tracker for every wallet you own: Bitcoin, Ethereum, PulseChain, Base, Solana,
          Robinhood Chain, Litecoin, Dogecoin and Bitcoin Cash in one view. It reads public blockchain data and explains it plainly: what you hold, what your
          stakes will pay, and whether a token looks safe. It was born in the HEX and PulseChain community, so it goes deepest
          there, with full HEX, Maximus, Hedron and Icosa support. It is an independent project, not affiliated with PulseChain,
          HEX or their founders.
        </p>
      </section>

      <section aria-labelledby="never-h" className="rounded-3xl border-2 border-ink p-6 sm:p-8">
        <h2 id="never-h" className="text-2xl font-extrabold tracking-tight text-ink">Lantern will never</h2>
        <ul className="mt-4 space-y-3">
          {NEVER.map((line) => (
            <li key={line} className="flex gap-3 text-[17px] leading-snug text-ink">
              <svg viewBox="0 0 24 24" fill="none" stroke="var(--color-down)" strokeWidth={2.2} strokeLinecap="round" className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
              {line}
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="data-h">
        <h2 id="data-h" className="text-2xl font-extrabold tracking-tight text-ink">Your data</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {DATA.map((d) => (
            <div key={d.title} className="rounded-3xl border border-line p-5">
              <h3 className="font-bold text-ink">{d.title}</h3>
              <p className="mt-1.5 text-[15px] leading-relaxed text-muted">{d.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section aria-labelledby="oss-h" className="rounded-3xl bg-soft p-6 sm:p-8">
        <h2 id="oss-h" className="text-2xl font-extrabold tracking-tight text-ink">Open source</h2>
        <p className="mt-2 text-[17px] leading-relaxed text-ink">
          Every line is public, so anyone can check that Lantern never touches keys. Found a bug, a scam token we missed, or
          want to help? Contributions are welcome.
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <a href={SITE.repoUrl} className="inline-flex h-11 items-center rounded-full bg-ink px-5 font-bold text-on-ink hover:bg-ink/85">View the code on GitHub</a>
          <Link href="/" className="inline-flex h-11 items-center rounded-full bg-surface px-5 font-bold text-ink ring-1 ring-line hover:bg-line">Open the dashboard</Link>
        </div>
      </section>

      <p className="text-sm text-muted">
        Prices and data come from public sources (DexScreener, GeckoTerminal, CoinGecko, Blockscout and public RPC nodes) and can be
        wrong or late. Estimates of future value are illustrations, not promises or financial advice.
      </p>
    </div>
  );
}
