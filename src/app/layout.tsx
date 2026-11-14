import type { Metadata } from 'next';
import localFont from 'next/font/local';
import type { ReactNode } from 'react';

import { configuredLlmMode } from '@/adapters/llm/model';
import { Header } from '@/components/header';

import './globals.css';

const display = localFont({
  src: '../fonts/syne-latin.woff2',
  weight: '700 800',
  variable: '--font-display',
  display: 'swap',
});
const sans = localFont({
  src: '../fonts/outfit-latin.woff2',
  weight: '400 600',
  variable: '--font-sans',
  display: 'swap',
});

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: { default: 'Harborline Desk', template: '%s · Harborline Desk' },
  description:
    'Personal demo of one qualification desk for site chat, SMS, email, and Instagram. Synthetic listings. Fictional brokerage.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${sans.variable}`}>
      <body>
        <a className="skip" href="#content">
          Skip to content
        </a>
        <Header mode={configuredLlmMode()} />
        <div id="content">{children}</div>
        <footer className="site-footer">
          Synthetic listings. Harborline Realty is fictional. Personal demo by Muhammad Mustafa.
        </footer>
      </body>
    </html>
  );
}
