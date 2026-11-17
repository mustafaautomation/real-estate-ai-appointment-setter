import type { Metadata, Viewport } from 'next';
import localFont from 'next/font/local';
import type { ReactNode } from 'react';

import { configuredLlmMode } from '@/adapters/llm/model';
import { Header } from '@/components/header';

import './globals.css';

const sans = localFont({
  src: '../fonts/geist-variable.woff2',
  weight: '100 900',
  variable: '--font-sans',
  display: 'swap',
});

const display = localFont({
  src: [
    {
      path: '../fonts/instrument-serif-regular.ttf',
      weight: '400',
      style: 'normal',
    },
    {
      path: '../fonts/instrument-serif-italic.ttf',
      weight: '400',
      style: 'italic',
    },
  ],
  variable: '--font-display',
  display: 'swap',
});

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: { default: 'Harborline Desk', template: '%s · Harborline Desk' },
  description:
    'Personal demo of one qualification desk for site chat, SMS, email, and Instagram. Synthetic listings. Fictional brokerage.',
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f4f0e8' },
    { media: '(prefers-color-scheme: dark)', color: '#100f0d' },
  ],
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
