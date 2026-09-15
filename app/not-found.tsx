// app/not-found.tsx — 404, ported from the design package.
//
// It does not guess. No redirect, no "did you mean", no search box that
// pretends to know: it says the page is not there, shows the path that was
// asked for, and lists everything that actually exists. A 404 that offers a
// guess is a 404 that wastes a second click on being wrong.
//
// The path is read on the client because a server component cannot know it,
// and it is CLIPPED rather than rendered whole — see Gone below.
import type { Metadata } from 'next';
import Link from 'next/link';
import './app-shell.css';
import { NotFoundPath } from '@/components/NotFoundPath';

export const metadata: Metadata = {
  title: 'Not a page — Socria',
  robots: { index: false, follow: false },
};

const ROUTES: [string, string, string][] = [
  ['The issue', '/', 'Socria, in its current form'],
  ['Logos', '/logos', 'The reasoning environment'],
  ['Socria One', '/one', 'Membership'],
  ['Blog', '/blog', 'Essays and dispatches'],
  ['Docs', '/docs', 'How the product works'],
];

export default function NotFound() {
  return (
    <div className="app-root">
      <div className="plate-wrap gone">
        <div className="plate wide">
          <Link className="brand" href="/" aria-label="Socria home">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/socria-mark.png" alt="" width={34} height={34} />
          </Link>
          <div>
            <p className="eyebrow">404 · not a page</p>
            <h1 style={{ marginTop: '12px' }}>
              That page doesn&rsquo;t exist. <span className="em">What were you looking for?</span>
            </h1>
          </div>

          <NotFoundPath />

          <p className="lede">
            No redirect, no guess at what you meant. Here is everything there actually is.
          </p>

          <div className="routes">
            {ROUTES.map(([t, href, d]) => (
              <Link key={href} href={href}>
                <span className="t">{t}</span>
                <span className="d">{d}</span>
              </Link>
            ))}
          </div>

          <p className="close-line">
            Nothing here. Which is at least an <em>honest answer.</em>
          </p>
        </div>
      </div>
    </div>
  );
}
