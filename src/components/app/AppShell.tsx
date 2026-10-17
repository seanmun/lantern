'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ReactNode, useEffect, useState } from 'react';
import { usePortfolioContext } from './PortfolioProvider';
import { assetsToCsv } from '@/utils/csv';
import { downloadFile } from '@/utils/ics';

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

/** The Pulse mark: a heartbeat line in the accent color. */
export function PulseMark({ size = 26 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 28 28" aria-hidden="true">
      <path d="M3 15h5l3-8 5 14 3-6h6" fill="none" stroke="var(--color-accent)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const NAV: NavItem[] = [
  { href: '/', label: 'Dashboard', icon: 'home' },
  { href: '/holdings', label: 'Holdings', icon: 'list' },
  { href: '/hex', label: 'HEX', icon: 'hex' },
  { href: '/transactions', label: 'Activity', icon: 'activity' },
  { href: '/tools', label: 'Tools', icon: 'tools' },
  { href: '/collectibles', label: 'Collectibles', icon: 'image' },
  { href: '/wallets', label: 'Wallets', icon: 'wallet' },
];
// Phone tab bar: four destinations + "More" for the rest
const TABS = NAV.slice(0, 4);
const MORE = NAV.slice(4);

const isActive = (pathname: string, href: string) => (href === '/' ? pathname === '/' : pathname.startsWith(href));

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);
  const { wallets, assets, isLoading, lastUpdated, refresh, walletNames } = usePortfolioContext();

  // Close the "More" sheet on navigation
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reacting to route changes
    setMoreOpen(false);
  }, [pathname]);

  const exportCsv = () =>
    downloadFile(
      `portfolio-${new Date().toISOString().slice(0, 10)}.csv`,
      assetsToCsv(assets, (address) => walletNames.get(address.toLowerCase()) ?? ''),
      'text/csv;charset=utf-8'
    );

  const moreActive = MORE.some((m) => isActive(pathname, m.href));

  return (
    <div className="min-h-screen pb-[calc(4.5rem+env(safe-area-inset-bottom))] md:pb-0">
      {/* Top bar */}
      <header className="sticky top-0 z-40 border-b border-line bg-white/90 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-4 px-4 sm:px-6">
          <Link href="/" className="flex shrink-0 items-center gap-2 text-xl font-extrabold tracking-tight text-ink">
            <PulseMark />
            pulse
          </Link>

          <nav aria-label="Main" className="hidden min-w-0 flex-1 md:block">
            <ul className="flex gap-1 overflow-x-auto text-sm">
              {NAV.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={isActive(pathname, item.href) ? 'page' : undefined}
                    className={`block whitespace-nowrap rounded-full px-3.5 py-2 text-[15px] font-semibold transition-colors ${
                      isActive(pathname, item.href) ? 'bg-soft text-ink' : 'text-muted hover:text-ink'
                    }`}
                  >
                    {item.label}
                  </Link>
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
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">{children}</main>

      {/* Phone tab bar */}
      <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md md:hidden">
        <ul className="grid grid-cols-5">
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
            className="absolute inset-x-3 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] rounded-2xl bg-white p-2 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {MORE.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 rounded-xl px-4 py-3 text-base font-semibold ${
                  isActive(pathname, item.href) ? 'bg-soft text-ink' : 'text-ink hover:bg-soft'
                }`}
              >
                <Icon name={item.icon} />
                {item.label}
              </Link>
            ))}
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
      <Link href="/wallets" className="mt-4 inline-flex h-11 items-center rounded-full bg-ink px-5 font-bold text-white hover:bg-ink/85">
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
