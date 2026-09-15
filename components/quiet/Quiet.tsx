// components/quiet/Quiet.tsx
//
// The quiet register: the chrome the marketing pages wear.
//
// Ported from quiet-parts.jsx. A masthead that knows which section it is on,
// a reading-progress hairline, a closing invitation, and a footer — so
// /logos, /one and the journal read as one publication rather than three
// pages that happen to share a palette.
//
// The nav deliberately OMITS the page you are on: a link to where you
// already are is a dead control, and the design drops it rather than dimming
// it.
//
// The legal links are NOT repeated here. Colophon already carries them on
// every page, and two footers competing for the same set is how one of them
// quietly goes stale — which is the exact bug the shared colophon was built
// to end.

import Link from 'next/link';
import { Colophon } from '@/components/Colophon';

const NAV: { k: string; href: string; t: string }[] = [
  { k: 'journal', href: '/', t: 'The issue' },
  { k: 'logos', href: '/logos', t: 'Logos' },
  { k: 'one', href: '/one', t: 'Socria One' },
  { k: 'blog', href: '/blog', t: 'Blog' },
];

export function QuietMast({ section, current }: { section: string; current: string }) {
  return (
    <header className="qmast">
      <span className="brand">
        <Link href="/" aria-label="Socria home">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/socria-mark.png" alt="" width={26} height={26} />
        </Link>
        <span className="sec">{section}</span>
      </span>
      <nav>
        {NAV.filter((n) => n.k !== current)
          .slice(0, 3)
          .map((n) => (
            <Link key={n.k} href={n.href} className="hs">
              {n.t}
            </Link>
          ))}
        <Link href="/sign-in">Sign in</Link>
        <Link href="/chat" className="go">
          Ask Socria
        </Link>
      </nav>
    </header>
  );
}

/**
 * The hairline that fills as the page is read.
 *
 * No driver of its own: components/journal/drivers.ts already looks for
 * `.rp` and sets its width on scroll, from the same source file this was
 * ported from.
 */
export function QuietProgress() {
  return <div className="rp" aria-hidden="true" />;
}

export function QuietCTA({
  children,
  href = '/chat?model=logos',
  label = 'Start thinking',
}: {
  children: React.ReactNode;
  href?: string;
  label?: string;
}) {
  return (
    <div className="qcta rv">
      <h3>{children}</h3>
      <Link href={href} className="qcta-go">
        {label} <span aria-hidden="true">→</span>
      </Link>
    </div>
  );
}

export function QuietFoot() {
  return (
    <footer className="qfoot">
      <Colophon />
    </footer>
  );
}
