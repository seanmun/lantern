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
  description: 'Shine a light on your whole crypto portfolio. A free, open-source, read-only tracker for Bitcoin, Ethereum, PulseChain, Base, Solana, Robinhood Chain, Litecoin, Dogecoin and Bitcoin Cash, with deep HEX and PulseChain support.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover', // lets the phone tab bar sit above the home indicator
  themeColor: '#09090b',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" data-theme="dark" className={manrope.variable} suppressHydrationWarning>
      <head>
        {/* Apply a saved light/dark choice before first paint (dark is the default) */}
        <script dangerouslySetInnerHTML={{ __html: "try{var t=localStorage.getItem('lantern.theme');if(t=='light'||t=='dark')document.documentElement.dataset.theme=t}catch(e){}" }} />
      </head>
      <body className="min-h-screen bg-page font-sans text-ink antialiased">
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
