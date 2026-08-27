'use client';

// The docs chrome: header, grouped sidebar, content column.
//
// A client component only because the sidebar highlights the current page,
// which needs the pathname; the content itself arrives as children from the
// server pages, so the prose stays server-rendered.

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { DOC_GROUPS, DOC_PAGES } from './registry';

export function DocsShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [navOpen, setNavOpen] = useState(false);
  const activeSlug =
    pathname === '/docs' ? 'overview' : pathname.replace(/^\/docs\//, '').replace(/\/$/, '');

  return (
    <div className="docs-root">
      <header className="d-top">
        <button
          type="button"
          className="d-nav-toggle"
          aria-expanded={navOpen}
          aria-controls="docs-nav"
          onClick={() => setNavOpen((v) => !v)}
        >
          <span aria-hidden="true">☰</span> Contents
        </button>
        <Link href="/docs" className="d-word">
          Socria <em>Docs</em>
        </Link>
        <nav className="d-top-links" aria-label="Site">
          <Link href="/">The journal</Link>
          <Link href="/logos">Logos</Link>
          <Link href="/one">Socria One</Link>
          <Link href="/chat" className="d-open">Open Socria</Link>
        </nav>
      </header>

      <div className="d-body">
        <nav id="docs-nav" className={`d-nav${navOpen ? ' is-open' : ''}`} aria-label="Documentation">
          {DOC_GROUPS.map((g) => (
            <div key={g} className="d-group">
              <span className="d-group-name">{g}</span>
              {DOC_PAGES.filter((p) => p.group === g).map((p) => (
                <Link
                  key={p.slug}
                  href={p.slug === 'overview' ? '/docs' : `/docs/${p.slug}`}
                  className={`d-nav-link${p.slug === activeSlug ? ' is-active' : ''}`}
                  aria-current={p.slug === activeSlug ? 'page' : undefined}
                  onClick={() => setNavOpen(false)}
                >
                  {p.title}
                </Link>
              ))}
            </div>
          ))}
        </nav>

        <main className="d-main">{children}</main>
      </div>

      <footer className="d-foot">
        <span>Socria — Human-First AI</span>
        <span className="d-foot-links">
          <Link href="/logos">What Logos is</Link>
          <Link href="/one">Socria One</Link>
          <Link href="/chat">Open Socria</Link>
        </span>
      </footer>
    </div>
  );
}
