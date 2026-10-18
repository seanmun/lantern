'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ReactNode, useEffect, useState } from 'react';
import { usePortfolioContext } from './PortfolioProvider';
import { assetsToCsv } from '@/utils/csv';
import { downloadFile } from '@/utils/ics';
import { SITE } from '@/config/site';
import { LanternMark } from './LanternMark';
import { ThemeToggle, useTheme } from './ThemeToggle';
import { LanternLight } from './LanternLight';
import { dayChange } from '@/utils/dayChange';

export { LanternMark };

interface NavItem {
  href: string;
  label: string;
  icon: keyof typeof ICONS;
}

// 24px line icons (stroke follows text color)
const ICONS = {
  home: 'M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z',
  list: 'M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01',
  hex: 'M12 2.5l8.2 4.75v9.5L12 21.5l-8.2-4.75v-9.5z',
  activity: 'M7 7h13l-3-3M17 17H4l3 3',
  tools: 'M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6',
  image: 'M4 4h16v16H4zM4 16l5-5 4 4 3-3 4 4M15 9h.01',
  wallet: 'M3 7h17a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a2 2 0 0 1 2-2h12v3M16 13.5h.01',
  info: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 11v5M12 8h.01',
  search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-4-4',
  pulse: 'M3 12h4l3-7 4 14 3-7h4',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
  refresh: 'M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7',
  download: 'M12 3v12M7 10l5 5 5-5M5 21h14',
};

function Icon({ name, className = 'h-5 w-5' }: { name: keyof typeof ICONS; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={name === 'more' ? 3 : 1.8} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d={ICONS[name]} />
    </svg>
  );
}


interface NavGroup { id: string; label: string; items: (NavItem & { description: string })[] }

const GROUPS: NavGroup[] = [
  {
    id: 'portfolio',
    label: 'Portfolio',
    items: [
      { href: '/', label: 'Dashboard', icon: 'home', description: 'Net worth, the chart and your morning brief' },
      { href: '/holdings', label: 'Holdings', icon: 'list', description: 'Every asset across your wallets' },
      { href: '/hex', label: 'HEX & staking', icon: 'hex', description: 'Stakes, Maximus, Hedron and Icosa' },
      { href: '/transactions', label: 'Activity', icon: 'activity', description: 'Transactions, filtered by wallet and type' },
      { href: '/collectibles', label: 'Collectibles', icon: 'image', description: 'NFTs and Ordinals, and the frame' },
      { href: '/wallets', label: 'Wallets', icon: 'wallet', description: 'Add, rename or remove addresses' },
    ],
  },
  {
    id: 'safety',
    label: 'Safety',
    items: [
      { href: '/check', label: 'Check anything', icon: 'search', description: 'Wallets, tokens, transactions and websites' },
      { href: '/status', label: 'Network status', icon: 'pulse', description: 'Is PulseChain down, or just one service?' },
    ],
  },
  {
    id: 'tools',
    label: 'Tools',
    items: [
      { href: '/tools#estimator', label: 'HEX stake estimator', icon: 'tools', description: 'What a new stake could pay' },
      { href: '/tools#pools', label: 'Pools vs staking', icon: 'hex', description: 'Buy a Maximus perp or stake HEX yourself?' },
      { href: '/tools#validators', label: 'Validator calculator', icon: 'pulse', description: 'Is running an ETH or PLS validator worth it?' },
    ],
  },
];
// Phone tab bar: three destinations + "More", which opens the grouped menu
const TABS: NavItem[] = [
  { href: '/', label: 'Dashboard', icon: 'home' },
  { href: '/holdings', label: 'Holdings', icon: 'list' },
  { href: '/check', label: 'Check', icon: 'search' },
];

const pathOf = (href: string) => href.split('#')[0];
const isActive = (pathname: string, href: string) => (pathOf(href) === '/' ? pathname === '/' : pathname.startsWith(pathOf(href)));
const groupActive = (pathname: string, g: NavGroup) => g.items.some((i) => isActive(pathname, i.href));

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const theme = useTheme();
  const { wallets, assets, isLoading, lastUpdated, refresh, walletNames } = usePortfolioContext();

  // Close the "More" sheet on navigation
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reacting to route changes
    setMoreOpen(false);
    setOpenMenu(null);
  }, [pathname]);

  // Close an open dropdown on outside click or Escape
  useEffect(() => {
    if (!openMenu) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !(e.target as HTMLElement).closest('[data-nav-menu]')) setOpenMenu(null);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', close);
    };
  }, [openMenu]);

  const exportCsv = () =>
    downloadFile(
      `portfolio-${new Date().toISOString().slice(0, 10)}.csv`,
      assetsToCsv(assets, (address) => walletNames.get(address.toLowerCase()) ?? ''),
      'text/csv;charset=utf-8'
    );

  const moreActive = !TABS.some((t) => isActive(pathname, t.href));

  return (
    <div className="flex min-h-screen flex-col pb-[calc(4.5rem+env(safe-area-inset-bottom))] md:pb-0">
      {/* Dark theme: the lantern light; embers follow the day (±5% = full mood) */}
      {theme === 'dark' && <LanternLight mood={(dayChange(assets)?.pct ?? 0) / 5} />}
      {/* Top bar */}
      <header className="sticky top-0 z-40 border-b border-line bg-page/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-4 px-4 sm:px-6">
          <Link href="/" className="flex shrink-0 items-center gap-2 text-xl font-extrabold tracking-tight text-ink">
            <LanternMark size={28} />
            lantern
          </Link>

          <nav aria-label="Main" className="hidden min-w-0 flex-1 md:block">
            <ul className="flex gap-1">
              {GROUPS.map((g) => (
                <li key={g.id} className="relative" data-nav-menu>
                  <button
                    type="button"
                    onClick={() => setOpenMenu((m) => (m === g.id ? null : g.id))}
                    aria-expanded={openMenu === g.id}
                    aria-haspopup="true"
                    className={`flex items-center gap-1 whitespace-nowrap rounded-full px-3.5 py-2 text-[15px] font-semibold transition-colors ${
                      groupActive(pathname, g) || openMenu === g.id ? 'bg-soft text-ink' : 'text-muted hover:text-ink'
                    }`}
                  >
                    {g.label}
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" className={`h-4 w-4 transition-transform ${openMenu === g.id ? 'rotate-180' : ''}`} aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>
                  </button>
                  {openMenu === g.id && (
                    <div className="absolute left-0 top-full z-50 mt-2 w-80 rounded-2xl border border-line bg-surface p-2 shadow-xl">
                      {g.items.map((item) => (
                        <Link
                          key={item.href}
                          href={item.href}
                          onClick={() => setOpenMenu(null)}
                          aria-current={isActive(pathname, item.href) && !item.href.includes('#') ? 'page' : undefined}
                          className="flex gap-3 rounded-xl px-3 py-2.5 hover:bg-soft"
                        >
                          <span className="mt-0.5 text-muted"><Icon name={item.icon} /></span>
                          <span>
                            <span className="block text-[15px] font-semibold text-ink">{item.label}</span>
                            <span className="block text-[13px] text-muted">{item.description}</span>
                          </span>
                        </Link>
                      ))}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </nav>

          {wallets.length > 0 && (
            <div className="ml-auto flex shrink-0 items-center gap-2 text-sm text-muted">
              <span className="hidden xl:inline">{isLoading ? 'Updating…' : lastUpdated ? `Updated ${lastUpdated.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}` : ''}</span>
              <button
                onClick={exportCsv}
                disabled={assets.length === 0}
                aria-label="Export CSV"
                className="hidden h-10 items-center gap-1.5 rounded-full bg-soft px-4 font-semibold text-ink hover:bg-line disabled:opacity-50 sm:flex"
              >
                <Icon name="download" className="h-4 w-4" /> CSV
              </button>
              <button
                onClick={refresh}
                disabled={isLoading}
                aria-label="Refresh balances"
                className="flex h-10 items-center gap-1.5 rounded-full bg-soft px-3 font-semibold text-ink hover:bg-line disabled:opacity-50 sm:px-4"
              >
                <Icon name="refresh" className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
                <span className="hidden sm:inline">Refresh</span>
              </button>
            </div>
          )}
          <span className={wallets.length > 0 ? '' : 'ml-auto'}><ThemeToggle /></span>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 sm:py-8">{children}</main>

      <footer className="mx-auto mt-8 w-full max-w-7xl border-t border-line px-4 py-6 text-sm text-muted sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
          <span className="flex items-center gap-2 font-semibold text-ink"><LanternMark size={20} /> {SITE.name}</span>
          <span className="font-semibold text-ink">We will never DM you or ask for your seed phrase.</span>
          <span className="flex gap-4">
            <Link href="/status" className="hover:text-ink">Status</Link>
            <Link href="/about" className="hover:text-ink">About &amp; privacy</Link>
            <a href={SITE.repoUrl} className="hover:text-ink">Open source</a>
          </span>
        </div>
      </footer>

      {/* Phone tab bar */}
      <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-page/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-md md:hidden">
        <ul className="grid grid-cols-4">
          {TABS.map((item) => (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={isActive(pathname, item.href) ? 'page' : undefined}
                className={`flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-semibold ${
                  isActive(pathname, item.href) ? 'text-accent' : 'text-muted'
                }`}
              >
                <Icon name={item.icon} />
                {item.label}
              </Link>
            </li>
          ))}
          <li>
            <button
              onClick={() => setMoreOpen((v) => !v)}
              aria-expanded={moreOpen}
              className={`flex h-16 w-full flex-col items-center justify-center gap-1 text-[11px] font-semibold ${
                moreOpen || moreActive ? 'text-accent' : 'text-muted'
              }`}
            >
              <Icon name="more" />
              More
            </button>
          </li>
        </ul>
      </nav>

      {/* "More" sheet */}
      {moreOpen && (
        <div className="fixed inset-0 z-30 md:hidden" onClick={() => setMoreOpen(false)}>
          <div className="absolute inset-0 bg-black/20" />
          <div
            className="absolute inset-x-3 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] max-h-[75vh] overflow-y-auto rounded-2xl bg-surface p-2 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {GROUPS.map((g) => (
              <div key={g.id} className="py-1">
                <div className="px-4 pb-1 pt-2 text-xs font-bold uppercase tracking-wide text-muted">{g.label}</div>
                {g.items.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMoreOpen(false)}
                    className={`flex items-center gap-3 rounded-xl px-4 py-2.5 text-base font-semibold ${
                      isActive(pathname, item.href) && !item.href.includes('#') ? 'bg-soft text-ink' : 'text-ink hover:bg-soft'
                    }`}
                  >
                    <Icon name={item.icon} />
                    {item.label}
                  </Link>
                ))}
              </div>
            ))}
            <Link href="/about" onClick={() => setMoreOpen(false)} className="flex items-center gap-3 rounded-xl px-4 py-2.5 text-base font-semibold text-ink hover:bg-soft">
              <Icon name="info" />
              About &amp; privacy
            </Link>
            {wallets.length > 0 && (
              <button onClick={exportCsv} className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-base font-semibold text-ink hover:bg-soft">
                <Icon name="download" /> Export CSV
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/** Shown on data pages when there are no wallets yet. */
export function NoWallets({ what }: { what: string }) {
  return (
    <div className="rounded-3xl border border-line p-8 text-center">
      <p className="text-ink">Add a wallet to see {what}.</p>
      <Link href="/wallets" className="mt-4 inline-flex h-11 items-center rounded-full bg-ink px-5 font-bold text-on-ink hover:bg-ink/85">
        Add a wallet
      </Link>
    </div>
  );
}

/** Page title block used by every page. */
export function PageHeader({ title, subtitle, children }: { title: string; subtitle?: string; children?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight text-ink sm:text-4xl">{title}</h1>
        {subtitle && <p className="mt-1 text-muted">{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}
