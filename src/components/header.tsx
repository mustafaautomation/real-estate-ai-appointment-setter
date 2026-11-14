'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const LINKS = [
  { href: '/', label: 'Desk' },
  { href: '/chat', label: 'Chat' },
  { href: '/dashboard', label: 'Inbox' },
  { href: '/simulator', label: 'Simulator' },
  { href: '/metrics', label: 'Latency' },
  { href: '/voice', label: 'Voice' },
] as const;

export function Header({ mode }: { mode: 'offline' | 'openai' }) {
  const pathname = usePathname();
  return (
    <header className="topbar">
      <Link href="/" className="wordmark">
        Harborline
      </Link>
      <p className="mode-badge" data-testid="llm-mode" data-mode={mode}>
        <span aria-hidden="true" />
        {mode === 'openai' ? 'OpenAI configured' : 'Offline engine'}
      </p>
      <nav aria-label="Primary">
        {LINKS.map((link) => {
          const active = pathname === link.href;
          return (
            <Link key={link.href} href={link.href} aria-current={active ? 'page' : undefined}>
              {link.label}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}
