'use client';
// app/error.tsx — what a page that broke says, instead of a blank screen.
//
// Without it, one exception thrown while rendering took the whole app down to
// Next's "Application error: a client-side exception has occurred", with no
// way back but the address bar. This catches it below the root layout — so
// the fonts and the paper are still there — says plainly what happened and
// what was kept, and offers the three ways back: draw the page again, load it
// fresh, or go to the start.
//
// It claims only what is true. A conversation is saved as each reply lands
// (to the account, or for a guest to this browser); what they were still
// typing, or a reply still streaming, lived in the page and may be gone.
// The reference is Next's digest of the error, which is what the server's
// log is searchable by — never the error's own message, which can carry
// anything.
import { useEffect } from 'react';
import Link from 'next/link';
import './app-shell.css';

export default function PageError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error('[socria] a page stopped:', error);
  }, [error]);

  return (
    <div className="app-root">
      <div className="plate-wrap gone">
        <div className="plate wide" role="alert">
          <div>
            <p className="eyebrow">Something broke · this page</p>
            <h1 style={{ marginTop: '12px' }}>
              This page stopped working. <span className="em">What was saved is still there.</span>
            </h1>
          </div>

          <p className="lede">
            A conversation is saved as each reply arrives. Anything you were still typing, or a reply still on its way, may need saying again.
          </p>

          <div className="routes">
            <button type="button" onClick={() => reset()}>
              <span className="t">Try again</span>
              <span className="d">Draw this page again</span>
            </button>
            <button type="button" onClick={() => window.location.reload()}>
              <span className="t">Reload</span>
              <span className="d">Start this page fresh</span>
            </button>
            <Link href="/">
              <span className="t">Socria</span>
              <span className="d">Back to the start</span>
            </Link>
          </div>

          {error.digest ? (
            <p className="d" style={{ fontSize: '.86rem', color: 'var(--ink-70)' }}>
              If it keeps happening, email hellosocria@gmail.com with this reference: <code>{error.digest}</code>
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
