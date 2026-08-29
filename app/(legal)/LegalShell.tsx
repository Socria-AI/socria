'use client';

// The chrome the three policy pages share.

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const TABS = [
  { href: '/privacy', label: 'Privacy' },
  { href: '/terms', label: 'Terms' },
  { href: '/security', label: 'Security' },
  { href: '/subprocessors', label: 'Sub-processors' },
];

export function LegalShell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  return (
    <div className="legal-root">
      <header className="lg-top">
        <Link href="/" className="lg-word">Socria</Link>
        <nav className="lg-tabs" aria-label="Policies">
          {TABS.map((t) => (
            <Link key={t.href} href={t.href} className={path === t.href ? 'is-on' : undefined}
              aria-current={path === t.href ? 'page' : undefined}>
              {t.label}
            </Link>
          ))}
        </nav>
      </header>
      <main>{children}</main>
      <footer className="lg-foot">
        <span>Socria — Human-First AI</span>
        <Link href="/docs">Docs</Link>
        <Link href="/chat">Open Socria</Link>
      </footer>
    </div>
  );
}
