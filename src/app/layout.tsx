import "./globals.css";
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { ToastProvider } from '@/components/ui/Toast';
import { PortfolioProvider } from '@/components/app/PortfolioProvider';
import { AppShell } from '@/components/app/AppShell';
import type { Metadata, Viewport } from 'next';
import { Manrope } from 'next/font/google';

// Self-hosted at build time: no request to Google from the browser
const manrope = Manrope({ subsets: ['latin'], variable: '--font-manrope', display: 'swap' });

export const metadata: Metadata = {
  title: { default: 'Lantern', template: '%s · Lantern' },
  description: 'Shine a light on any PulseChain wallet or token. A free, open-source, read-only portfolio tracker built for the HEX and PulseChain community.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover', // lets the phone tab bar sit above the home indicator
  themeColor: '#ffffff',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={manrope.variable}>
      <body className="min-h-screen bg-white font-sans text-ink antialiased">
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
