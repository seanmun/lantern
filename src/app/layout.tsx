import "./globals.css";
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { ToastProvider } from '@/components/ui/Toast';
import { PortfolioProvider } from '@/components/app/PortfolioProvider';
import { AppShell } from '@/components/app/AppShell';
import type { Metadata, Viewport } from 'next';

export const metadata: Metadata = {
  title: 'Crypto Portfolio Tracker',
  description: 'Privacy-first, self-hosted multi-chain portfolio tracker with HEX staking support',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover', // lets the phone tab bar sit above the home indicator
  themeColor: '#faf5ff',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50">
        <ErrorBoundary>
          <ToastProvider>
            <PortfolioProvider>
              <AppShell>{children}</AppShell>
            </PortfolioProvider>
          </ToastProvider>
        </ErrorBoundary>
      </body>
    </html>
  );
}
