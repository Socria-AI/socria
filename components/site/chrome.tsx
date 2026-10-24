// components/site/chrome.tsx — what every page of the public site wears: the
// grain, the masthead and the foot, from the design project's three screens
// (Socria Landing, Socria One, Socria Charter).
//
// The links are the design's, page by page; the masthead drops the page you
// are on, because a link to where you already are is a dead control. Privacy
// and Terms are in every foot — a policy nobody can navigate to is not a
// published policy — even where the design's foot carried fewer.

import Link from 'next/link';
import { Logo } from '@/components/ds';
import './site.css';

export interface SiteLink {
  href: string;
  label: string;
  /** a file to save rather than a page to open */
  download?: boolean;
  className?: string;
}

/** One link, internal or not: Link for the product's own pages, an anchor for the rest. */
export function SiteA({ l }: { l: SiteLink }) {
  if (l.download || /^(https?:|#)/.test(l.href)) {
    const external = /^https?:/.test(l.href);
    return (
      <a
        href={l.href}
        {...(l.download ? { download: '' } : {})}
        {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
        className={l.className}
      >
        {l.label}
      </a>
    );
  }
  return (
    <Link href={l.href} className={l.className}>
      {l.label}
    </Link>
  );
}

/** The page itself: the paper, the grain and the design's scope. */
export function SitePage({ tone, children }: { tone?: 'one'; children: React.ReactNode }) {
  return (
    <div className={'site-root lg-tokens' + (tone === 'one' ? ' is-one' : '')}>
      <div className="s-grain" aria-hidden="true" />
      {children}
    </div>
  );
}

/** The sticky masthead: the lock-up, the page's links, and its one action. */
export function SiteMast({ links, go }: { links: SiteLink[]; go: React.ReactNode }) {
  return (
    <header className="s-mast">
      <Logo size="sm" markSrc="/socria-mark.png" href="/" />
      <nav className="s-nav" aria-label="Socria">
        <div className="s-navlinks">
          {links.map((l) => (
            <SiteA key={l.href} l={l} />
          ))}
        </div>
        <div className="s-mast-go">{go}</div>
      </nav>
    </header>
  );
}

/** The foot: the signature, an optional middle, and the links. */
export function SiteFoot({ links, middle }: { links: SiteLink[]; middle?: React.ReactNode }) {
  return (
    <footer className="s-foot">
      <span className="s-foot-sign">
        Socria · <em>Think For Yourself.</em>
      </span>
      {middle}
      <div className="s-foot-links">
        {links.map((l) => (
          <SiteA key={l.href} l={l} />
        ))}
      </div>
    </footer>
  );
}

export const PRIVACY: SiteLink = { href: '/privacy', label: 'Privacy' };
export const TERMS: SiteLink = { href: '/terms', label: 'Terms' };
export const DOCS: SiteLink = { href: '/docs', label: 'Docs' };
export const CHARTER: SiteLink = { href: '/charter', label: 'The Charter' };
export const ONE: SiteLink = { href: '/one', label: 'Socria One' };
export const HOME: SiteLink = { href: '/', label: 'Socria' };
/** Where "Start a conversation" goes: Logos, the product the site is about. */
export const START = '/logos';
/** The Charter as a document to keep, beside the page that reads it. */
export const CHARTER_PDF = '/socria-charter.pdf';
