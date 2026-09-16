// components/auth/AuthPlate.tsx
//
// One centred plate, no chrome — the design's sign-in page, in place of the
// two-column shell that framed Clerk's card.
//
// The old shell put the argument for signing in on the left and the card on
// the right, which reads as a landing page with a form bolted to it. The
// design's answer is narrower and better: the mark, the sentence, the form,
// the vow, and three links out. Nothing to read past before acting.
//
// The stylesheet is app/app-shell.css under .app-root — and here .app-root is
// the page rather than a region, so no `app-inline`: this screen wants the
// register's full-viewport background and its min-height, which is exactly
// what that class exists to withhold from /chat.

import Link from 'next/link';
import Image from 'next/image';
import { AUTH_CROSSLINK, authUrl, otherAuth, type AuthKind } from '@/lib/auth-links';
import { Label } from '@/components/journal/ds';

export function AuthPlate({
  kind,
  redirectTo,
  eyebrow,
  title,
  emphasis,
  lede,
  children,
}: {
  kind: AuthKind;
  redirectTo?: string;
  eyebrow: string;
  /** the plain head of the sentence */
  title: string;
  /** its last clause, set in italic moss — the design's `.em` */
  emphasis?: string;
  lede: string;
  children: React.ReactNode;
}) {
  const other = otherAuth(kind);
  const cross = AUTH_CROSSLINK[kind];
  return (
    <div className="app-root">
      <div className="plate-wrap">
        <div className="plate">
          <Link href="/" className="auth-mark" aria-label="Socria home">
            <Image src="/socria-logo.png" alt="" width={34} height={34} />
            <span>Socria</span>
          </Link>

          <div>
            <Label tone="moss">{eyebrow}</Label>
            <h1 style={{ marginTop: '12px' }}>
              {title} {emphasis && <span className="em">{emphasis}</span>}
            </h1>
          </div>
          <p className="lede">{lede}</p>

          {children}

          <hr className="rule" />
          <div className="stack" style={{ gap: '14px' }}>
            <p className="auth-cross">
              {cross.lead}{' '}
              <Link href={authUrl(other, redirectTo)}>{cross.action}</Link>
            </p>
            {/* The door out that is not a door in. Somebody who does not want
                an account yet is a person to keep, not to block — /chat runs
                signed out, and saying so here is more honest than letting
                them find out by pressing Back. */}
            <p className="auth-cross">
              <Link href="/chat">or keep thinking without an account</Link>
            </p>
            <p className="vow">
              Nothing here is sent anywhere. Your reasoning is yours — signed
              in or not.
            </p>
          </div>
        </div>

        <div className="foot-links">
          <Link href="/">The issue</Link>
          <Link href="/logos">Logos</Link>
          <Link href="/one">Socria One</Link>
          <Link href="/privacy">Privacy</Link>
        </div>
      </div>
    </div>
  );
}
