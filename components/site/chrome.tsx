// components/site/chrome.tsx — what every public page wears: the masthead and
// the foot; and, on the site's own pages (/, /one, /charter), the paper, the
// grain and the design's scope, from the design project's three screens
// (Socria Landing, Socria One, Socria Charter).
//
// ONE MASTHEAD, ONE FOOT. The homepage, /one, /charter, the blog, the docs,
// the policies, /explore and /support all wear these two, so the bar a person
// reads at the top and the links they find at the bottom do not change from
// page to page. Both mount outside SitePage too: site.css scopes their tokens
// to themselves, so the docs, the blog and the policies wear them without
// taking on SitePage's resets, which would restyle their prose.
//
// The masthead's links are one list (NAV). On the site's own pages the page
// you are on is left out, because a link to where you already are is a dead
// control (navWithout); on the sections with pages inside them (the blog, the
// docs) it is marked as where you are instead. Its one action is "Start a
// conversation", to Logos, everywhere but /one, which sells One in its own
// blue at the same size.
//
// The foot's links are one list too (FOOT): every page there is, the
// policies, and where else Socria is. Privacy and Terms are in every foot — a
// policy nobody can navigate to is not a published policy — and so is a way
// to Support, the one page a stuck person looks for.

import Link from 'next/link';
import { Button, Logo } from '@/components/ds';
import './site.css';

export interface SiteLink {
  href: string;
  label: string;
  /** a file to save rather than a page to open */
  download?: boolean;
  className?: string;
}

/** One link, internal or not: Link for the product's own pages, an anchor for the rest. */
export function SiteA({ l, current }: { l: SiteLink; current?: 'page' | 'true' }) {
  if (l.download || /^(https?:|#)/.test(l.href)) {
    const external = /^https?:/.test(l.href);
    return (
      <a
        href={l.href}
        {...(l.download ? { download: '' } : {})}
        {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
        className={l.className}
        aria-current={current}
      >
        {l.label}
      </a>
    );
  }
  return (
    <Link href={l.href} className={l.className} aria-current={current}>
      {l.label}
    </Link>
  );
}

export const ONE: SiteLink = { href: '/one', label: 'Socria One' };
export const CHARTER: SiteLink = { href: '/charter', label: 'The Charter' };
export const EXPLORE: SiteLink = { href: '/explore', label: 'Explore' };
export const BLOG: SiteLink = { href: '/blog', label: 'Blog' };
export const DOCS: SiteLink = { href: '/docs', label: 'Docs' };
export const SUPPORT: SiteLink = { href: '/support', label: 'Support' };
export const PRIVACY: SiteLink = { href: '/privacy', label: 'Privacy' };
export const TERMS: SiteLink = { href: '/terms', label: 'Terms' };
export const SECURITY: SiteLink = { href: '/security', label: 'Security' };
/** Named as the page names itself. */
export const SUBPROCESSORS: SiteLink = { href: '/subprocessors', label: 'Sub-processors' };

/** Where "Start a conversation" goes: Logos, the product the site is about. */
export const START = '/logos';
/** The Charter as a document to keep, beside the page that reads it. */
export const CHARTER_PDF = '/socria-charter.pdf';

/**
 * The masthead's links, the same on every page. Four, because four, the lock-up
 * and the action are what fit across the bar down to the width where it
 * collapses (760px) — with the blog's "Sign in" or the docs' name beside them
 * too. Explore and Support are in every foot.
 */
export const NAV: readonly SiteLink[] = [ONE, CHARTER, BLOG, DOCS];

/** The three policies and the register, in the order their pages list them. */
export const POLICIES: readonly SiteLink[] = [PRIVACY, TERMS, SECURITY, SUBPROCESSORS];

/** Where else Socria is. */
export const ELSEWHERE: readonly SiteLink[] = [
  { href: 'https://www.linkedin.com/company/socria', label: 'LinkedIn' },
  { href: 'https://www.instagram.com/socriaai', label: 'Instagram' },
  { href: 'https://www.tiktok.com/@socriaai', label: 'TikTok' },
];

/** The foot's links: every page there is, the policies, and where else Socria is. */
export const FOOT: readonly SiteLink[] = [ONE, CHARTER, EXPLORE, BLOG, DOCS, SUPPORT, ...POLICIES, ...ELSEWHERE];

/** The masthead's links less the page you are on: a link to where you already are is a dead control. */
export function navWithout(href: string): readonly SiteLink[] {
  return NAV.filter((l) => l.href !== href);
}

/** Not a prop React 18 knows: a picture of the product is not controls to tab through. */
export const INERT = { inert: '' } as Record<string, string>;

/** The page itself: the paper, the grain and the design's scope. */
export function SitePage({ tone, children }: { tone?: 'one'; children: React.ReactNode }) {
  return (
    <div className={'site-root lg-tokens' + (tone === 'one' ? ' is-one' : '')}>
      <div className="s-grain" aria-hidden="true" />
      {children}
    </div>
  );
}

/** The masthead's one action. */
export function StartButton() {
  return (
    <Button as="a" href={START} variant="primary" size="sm">
      Start a conversation
    </Button>
  );
}

/**
 * The sticky masthead: the lock-up, the site's links, and one action.
 *
 * What genuinely differs from page to page is a prop, and nothing else is:
 * the section's name beside the lock-up (the docs), something before it (the
 * docs' Contents, on a narrow screen), the way in beside the action (the
 * blog), and a row of the section's own pages under the bar (the policies).
 */
export function SiteMast({
  links = NAV,
  current,
  go = <StartButton />,
  section,
  lead,
  account,
  sub,
}: {
  /** NAV, or NAV less the page you are on (navWithout) */
  links?: readonly SiteLink[];
  /** where you are, marked rather than left out: the page itself, or a page inside that section */
  current?: string | { section: string };
  /** the one action: "Start a conversation", unless the page sells something of its own */
  go?: React.ReactNode;
  /** the section's name beside the lock-up: Socria Docs */
  section?: SiteLink;
  /** before the lock-up */
  lead?: React.ReactNode;
  /** beside the action: the way in, as a word, or the account once signed in */
  account?: React.ReactNode;
  /** the section's own pages, in a row under the bar */
  sub?: { label: string; links: readonly SiteLink[]; current?: string | null };
}) {
  const here = typeof current === 'string' ? current : current?.section;
  const said = typeof current === 'string' ? 'page' : 'true';
  return (
    <>
      <header className={'s-mast' + (lead || account ? ' is-busy' : '')}>
        {lead}
        <div className="s-mast-id">
          <Logo size="sm" markSrc="/socria-mark.png" href="/" />
          {section && (
            <Link href={section.href} className="s-mast-section">
              {section.label}
            </Link>
          )}
        </div>
        <nav className="s-nav" aria-label="Socria">
          <div className="s-navlinks">
            {links.map((l) => (
              <SiteA key={l.href} l={l} current={l.href === here ? said : undefined} />
            ))}
          </div>
          {account}
          <div className="s-mast-go">{go}</div>
        </nav>
      </header>
      {sub && (
        <nav className="s-mast-sub" aria-label={sub.label}>
          {sub.links.map((l) => (
            <SiteA key={l.href} l={l} current={l.href === sub.current ? 'page' : undefined} />
          ))}
        </nav>
      )}
    </>
  );
}

/**
 * The foot: the signature, an optional line of the page's own (how One
 * renews, the Charter's PDF), the year, and every link there is. It sits
 * outside a page's <main>, so every page has a footer landmark.
 */
export function SiteFoot({ middle }: { middle?: React.ReactNode }) {
  return (
    <footer className="s-colophon">
      <div className="s-colophon-head">
        <span className="s-colophon-sign">
          Socria · <em>Think For Yourself.</em>
        </span>
        {middle && <span className="s-colophon-mid">{middle}</span>}
        <span className="s-colophon-year">
          {/* Rendered from the clock so it cannot rot into last year. */}©{' '}
          <span suppressHydrationWarning>{new Date().getFullYear()}</span>
        </span>
      </div>
      <div className="s-colophon-links">
        {FOOT.map((l) => (
          <SiteA key={l.href} l={l} />
        ))}
      </div>
    </footer>
  );
}
