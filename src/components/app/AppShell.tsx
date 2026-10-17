'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ReactNode, useEffect, useState } from 'react';
import { Hexagon } from '@/components/hex/Hexagon';
import { usePortfolioContext } from './PortfolioProvider';
import { assetsToCsv } from '@/utils/csv';
import { downloadFile } from '@/utils/ics';

interface NavItem {
  href: string;
  label: string;
  icon: string;
}

const NAV: NavItem[] = [
  { href: '/', label: 'Dashboard', icon: '◈' },
  { href: '/holdings', label: 'Holdings', icon: '▤' },
  { href: '/hex', label: 'HEX', icon: '⬡' },
  { href: '/transactions', label: 'Activity', icon: '⇄' },
  { href: '/tools', label: 'Tools', icon: '⚙' },
  { href: '/collectibles', label: 'Collectibles', icon: '🖼' },
  { href: '/wallets', label: 'Wallets', icon: '👛' },
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
      <header className="sticky top-0 z-40 border-b border-white/50 bg-white/80 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-4 px-4">
          <Link href="/" className="flex shrink-0 items-center gap-2">
            <Hexagon size={28} />
            <span className="bg-gradient-to-r from-pink-600 via-purple-600 to-indigo-600 bg-clip-text text-lg font-bold text-transparent">
              Portfolio
            </span>
          </Link>

          <nav aria-label="Main" className="hidden min-w-0 flex-1 md:block">
            <ul className="flex gap-1 overflow-x-auto text-sm">
              {NAV.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={isActive(pathname, item.href) ? 'page' : undefined}
                    className={`block whitespace-nowrap rounded-lg px-3 py-1.5 font-medium transition-colors ${
                      isActive(pathname, item.href) ? 'bg-purple-100 text-purple-900' : 'text-gray-600 hover:bg-purple-50 hover:text-purple-800'
                    }`}
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          {wallets.length > 0 && (
            <div className="ml-auto flex shrink-0 items-center gap-2 text-sm text-gray-500">
              <span className="hidden lg:inline">{isLoading ? 'Updating…' : lastUpdated ? `Updated ${lastUpdated.toLocaleTimeString()}` : ''}</span>
              <button
                onClick={exportCsv}
                disabled={assets.length === 0}
                className="hidden rounded-lg bg-white px-3 py-1 font-medium text-gray-700 shadow-sm ring-1 ring-gray-200 hover:bg-gray-50 disabled:opacity-50 sm:block"
              >
                ⬇ CSV
              </button>
              <button
                onClick={refresh}
                disabled={isLoading}
                aria-label="Refresh balances"
                className="rounded-lg bg-white px-3 py-1 font-medium text-gray-700 shadow-sm ring-1 ring-gray-200 hover:bg-gray-50 disabled:opacity-50"
              >
                <span className={isLoading ? 'inline-block animate-spin' : ''}>⟳</span>
                <span className="ml-1 hidden sm:inline">Refresh</span>
              </button>
            </div>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6 sm:py-8">{children}</main>

      {/* Phone tab bar */}
      <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-40 border-t border-gray-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md md:hidden">
        <ul className="grid grid-cols-5">
          {TABS.map((item) => (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={isActive(pathname, item.href) ? 'page' : undefined}
                className={`flex h-16 flex-col items-center justify-center gap-0.5 text-[11px] font-medium ${
                  isActive(pathname, item.href) ? 'text-purple-700' : 'text-gray-500'
                }`}
              >
                <span className="text-lg leading-none" aria-hidden="true">{item.icon}</span>
                {item.label}
              </Link>
            </li>
          ))}
          <li>
            <button
              onClick={() => setMoreOpen((v) => !v)}
              aria-expanded={moreOpen}
              className={`flex h-16 w-full flex-col items-center justify-center gap-0.5 text-[11px] font-medium ${
                moreOpen || moreActive ? 'text-purple-700' : 'text-gray-500'
              }`}
            >
              <span className="text-lg leading-none" aria-hidden="true">⋯</span>
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
                className={`flex items-center gap-3 rounded-xl px-4 py-3 text-base font-medium ${
                  isActive(pathname, item.href) ? 'bg-purple-50 text-purple-800' : 'text-gray-700 hover:bg-gray-50'
                }`}
              >
                <span aria-hidden="true">{item.icon}</span>
                {item.label}
              </Link>
            ))}
            {wallets.length > 0 && (
              <button onClick={exportCsv} className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-base font-medium text-gray-700 hover:bg-gray-50">
                <span aria-hidden="true">⬇</span> Export CSV
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
    <div className="rounded-2xl border border-white/20 bg-white/70 p-8 text-center shadow-xl backdrop-blur-sm">
      <p className="text-gray-700">Add a wallet to see {what}.</p>
      <Link href="/wallets" className="mt-4 inline-block rounded-xl bg-gradient-to-r from-purple-600 to-pink-600 px-5 py-2.5 font-semibold text-white shadow-lg">
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
        <h1 className="text-3xl font-bold text-gray-900 sm:text-4xl">{title}</h1>
        {subtitle && <p className="mt-1 text-gray-600">{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}
