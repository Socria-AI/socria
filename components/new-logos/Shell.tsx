'use client';
// components/new-logos/Shell.tsx — the frame around every signed-in New Logos page: a thin top bar (home, all
// conversations, archive, the account), the shared state, one place for passing notices, the source library (a small
// button in the bottom-left corner that opens over whatever is there) and the focus viewer. No sidebar and no content
// page: the nested matrix is the navigation, and sources stay out of the way until asked for.

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useClerk, useUser } from '@clerk/nextjs';
import type { ReactNode } from 'react';
import { NLProvider, useNL } from './state';
import { SourcesProvider } from './sources/state';
import { SourceLibrary } from './sources/Library';
import { SourceViewer } from './sources/Viewer';
import { Glyph } from './ui';

function Account() {
  const { user } = useUser();
  const { signOut } = useClerk();
  const email = user?.primaryEmailAddress?.emailAddress ?? '';
  return (
    <span className="nl-row" style={{ gap: 6 }}>
      {email ? (
        <span className="nl-hint nl-account-email" title={email}>
          {email}
        </span>
      ) : null}
      <button type="button" className="nl-btn is-quiet is-small" onClick={() => void signOut({ redirectUrl: '/new-logos/sign-in' })}>
        Sign out
      </button>
    </span>
  );
}

function Frame({ children }: { children: ReactNode }) {
  const path = usePathname() ?? '';
  const { notice, say, loadError, setup } = useNL();
  const here = (p: string) => (path === p || path.startsWith(`${p}/`) ? 'page' : undefined);
  return (
    <>
      <header className="nl-top">
        <Link href="/new-logos" className="nl-home" aria-current={path === '/new-logos' ? 'page' : undefined}>
          <Glyph type="home" />
          Home
        </Link>
        <nav className="nl-top-nav" aria-label="Main">
          <Link href="/new-logos/conversations" className="nl-top-link" aria-current={here('/new-logos/conversations')}>
            Conversations
          </Link>
          <Link href="/new-logos/archive" className="nl-top-link" aria-current={here('/new-logos/archive')}>
            Archive
          </Link>
          <Account />
        </nav>
      </header>
      {loadError ? (
        <div className="nl-page" style={{ paddingBottom: 0 }}>
          <div className="nl-notice" role="alert">
            {loadError}
          </div>
        </div>
      ) : null}
      {setup === false ? (
        <div className="nl-page" style={{ paddingBottom: 0 }}>
          <div className="nl-notice" role="status">
            Objectives, questions, knowledge, decisions and artifacts are not available yet: their storage has not been set up on this database.
            Every conversation is available and works as usual.
          </div>
        </div>
      ) : null}
      {children}
      <SourceLibrary />
      <SourceViewer />
      <div aria-live="polite" className={notice ? '' : 'nl-sr'}>
        {notice ? (
          <div className="nl-toast" role="status">
            <span>{notice}</span>
            <button type="button" onClick={() => say(null)}>
              Dismiss
            </button>
          </div>
        ) : null}
      </div>
    </>
  );
}

export function Shell({ children }: { children: ReactNode }) {
  return (
    <NLProvider>
      <SourcesProvider>
        <Frame>{children}</Frame>
      </SourcesProvider>
    </NLProvider>
  );
}
