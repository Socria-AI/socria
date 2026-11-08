'use client';

// The docs chrome: the site's masthead and foot (components/site/chrome.tsx),
// the grouped sidebar, and the content column.
//
// The masthead is the one every public page wears, with the section's name
// beside the lock-up (Socria Docs), Docs marked as where you are, and the
// sidebar's Contents button before it on a narrow screen, where the sidebar
// folds away.
//
// A client component only because the sidebar highlights the current page,
// which needs the pathname; the content itself arrives as children from the
// server pages, so the prose stays server-rendered.

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { DOCS, SiteFoot, SiteMast } from '@/components/site/chrome';
import { DOC_GROUPS, DOC_PAGES } from './registry';

export function DocsShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [navOpen, setNavOpen] = useState(false);
  const front = pathname === '/docs';
  const activeSlug = front ? 'overview' : pathname.replace(/^\/docs\//, '').replace(/\/$/, '');

  return (
    <div className="docs-root">
      <SiteMast
        section={DOCS}
        current={front ? DOCS.href : { section: DOCS.href }}
        lead={
          <button
            type="button"
            className="d-nav-toggle"
            aria-expanded={navOpen}
            aria-controls="docs-nav"
            onClick={() => setNavOpen((v) => !v)}
          >
            <span aria-hidden="true">☰</span> <span className="d-nav-toggle-t">Contents</span>
          </button>
        }
      />

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

      <SiteFoot />
    </div>
  );
}
