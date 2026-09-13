'use client';
// components/journal/parts.tsx
//
// The issue's own furniture: the masthead, one turn of the interrogation, a
// reading interlude, the figures, the silences.
//
// Unlike ds-bundle.ts these ARE hand-written, because they are the part the
// journal owns. They carry no styling of their own — every class name here is
// defined in app/journal.css, ported from the prototype — so the markup is
// deliberately thin and the CSS is the single source of how it looks.
//
// The one rule that matters: class names are the contract with that
// stylesheet AND with drivers.ts, which finds elements by selector
// (`.rv`, `.turn`, `.fig`, `.aside-note`, `.jargon`, `[data-split]`,
// `[data-i]`). Rename one here and the reveal silently stops happening —
// nothing throws, the page just arrives static. Grep drivers.ts before
// touching a className.

import type { ReactNode } from 'react';
import Link from 'next/link';
import { SignedIn, SignedOut, UserButton, ClerkLoaded } from '@clerk/nextjs';
import { Label, InkMark } from './ds';

/* Where the issue system's pages actually live in the app.
 *
 * The prototype linked flat files — "Socria Logos.html", "blog/index.html" —
 * because it was a standalone export. These are the real routes, and `Blog` is
 * what the section has been called everywhere else since it was built; the
 * prototype's "Writing" was the odd one out. */
export const PAGES = [
  { k: 'journal', href: '/', t: 'The issue' },
  { k: 'logos', href: '/logos', t: 'Logos' },
  { k: 'one', href: '/one', t: 'Socria One' },
  { k: 'blog', href: '/blog', t: 'Blog' },
  { k: 'docs', href: '/docs', t: 'Docs' },
] as const;

export function Grain() {
  return <div className="grain" aria-hidden="true" />;
}

export function Progress() {
  return <div className="progress" aria-hidden="true" />;
}

export function Mast({
  current,
  cta,
}: {
  current?: string;
  cta?: { href: string; t: string };
}) {
  return (
    <header className="mast">
      <Link className="brand" href="/">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/socria-mark.png" alt="" />
        <span className="nm">Socria</span>
      </Link>
      <nav>
        {PAGES.filter((p) => p.k !== current)
          .slice(0, 3)
          .map((p) => (
            <Link key={p.k} href={p.href} className="hs">
              {p.t}
            </Link>
          ))}
        {/* The prototype had no auth chrome — it was a standalone export with
            nowhere to sign in to. Dropping it here would have quietly removed
            the only way into an account from the front page, so it is kept,
            wrapped in ClerkLoaded so nothing flickers between states. */}
        <ClerkLoaded>
          <SignedOut>
            <Link href="/sign-in" className="hs auth">
              Sign in
            </Link>
          </SignedOut>
          <SignedIn>
            <span className="auth-btn">
              <UserButton afterSignOutUrl="/" />
            </span>
          </SignedIn>
        </ClerkLoaded>
        <Link href={cta ? cta.href : '/chat'} className="go">
          {cta ? cta.t : 'Ask Socria'}
        </Link>
      </nav>
    </header>
  );
}

/** The margin counter — how far through the questioning you are. Filled by drivers.ts. */
export function Count() {
  return (
    <div className="count" aria-hidden="true">
      <span className="n">i</span>
      <span className="bar">
        <i />
      </span>
      <span className="t" />
    </div>
  );
}

/** The reader's own marginal note. Revealed only once you have stopped scrolling. */
export function Aside({ children }: { children: ReactNode }) {
  return <p className="aside-note">{children}</p>;
}

/** One turn of the interrogation. */
export function Turn({
  i,
  who,
  socria,
  quiet,
  ground,
  slam,
  children,
  answer,
  aside,
}: {
  i: string;
  who: string;
  socria?: boolean;
  quiet?: boolean;
  ground?: string;
  slam?: boolean;
  children: ReactNode;
  answer?: ReactNode;
  aside?: ReactNode;
}) {
  const cls = [
    'turn',
    socria && 'socria',
    quiet && 'quiet',
    slam && 'slam',
    ground && `g-${ground}`,
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <section className={cls} data-i={i} data-screen-label={`Turn ${i}`}>
      <span className="rn" aria-hidden="true">
        {i}
      </span>
      <div className="wrap">
        <span className="who">{who}</span>
        <p className="q">{children}</p>
        {answer && <p className="a">{answer}</p>}
        {aside && <Aside>{aside}</Aside>}
      </div>
    </section>
  );
}

/** A held beat between spreads. */
export function Silence({ children }: { children: ReactNode }) {
  return (
    <div className="silence" aria-hidden="true">
      <div>
        <span className="dot" />
        <p>{children}</p>
      </div>
    </div>
  );
}

/** A dense reading interlude — the opposite register to a turn. */
export function Reading({
  n,
  name,
  title,
  deck,
  tint,
  children,
  id,
  aside,
}: {
  n: string;
  name: string;
  title: ReactNode;
  deck?: string;
  tint?: boolean;
  children: ReactNode;
  id?: string;
  aside?: ReactNode;
}) {
  return (
    <section
      className={`reading${tint ? ' tint' : ''}`}
      id={id}
      data-screen-label={`Reading ${n}`}
    >
      <div className="wrap">
        <div className="rhead">
          <span className="lbl moss">
            Reading {n} · {name}
          </span>
          <span className="lbl">Socria · Issue No. 4</span>
        </div>
        <h2>{title}</h2>
        {deck && <p className="deck">{deck}</p>}
        {children}
        {aside && <Aside>{aside}</Aside>}
      </div>
    </section>
  );
}

/** The guard, writing the answer and then refusing it. Typed out by drivers.ts. */
export function GuardType({
  answer,
  children,
}: {
  answer: string;
  children: ReactNode;
}) {
  return (
    <p className="guard-type" data-answer={answer}>
      {children}
    </p>
  );
}

export function Fig({
  n,
  caption,
  claim,
  keys,
  children,
  scrub,
}: {
  n: string;
  caption: string;
  claim?: string;
  keys?: [string, string][];
  children: ReactNode;
  scrub?: boolean;
}) {
  return (
    <figure className={`fig${scrub ? ' scrub' : ''}`}>
      <div className="fig-frame">{children}</div>
      <figcaption>
        Fig. {n} · {caption}
        {claim && <span className="cl"> {claim}</span>}
      </figcaption>
      {keys && (
        <div className="key">
          {keys.map((k) => (
            <span key={k[0]}>
              <i className={`k-${k[0]}`} />
              {k[1]}
            </span>
          ))}
        </div>
      )}
    </figure>
  );
}

/** The two curves — the figure the whole argument rests on. Scroll-scrubbed. */
export function TradeFig() {
  return (
    <Fig
      n="I"
      caption="Two curves, one decade."
      claim="Only one of them is yours."
      scrub
      keys={[
        ['machine', 'The machine'],
        ['person', 'The person'],
      ]}
    >
      <svg
        viewBox="0 0 640 250"
        role="img"
        aria-label="Machine capability climbs steeply while human judgment stays flat."
      >
        <line className="ax" x1="52" y1="206" x2="616" y2="206" />
        <line className="ax" x1="52" y1="20" x2="52" y2="206" />
        <path
          className="l-machine draw"
          data-rate="1.35"
          d="M52,196 C190,190 300,158 400,104 C470,66 540,42 610,30"
        />
        <path
          className="l-person draw dp"
          data-rate=".8"
          d="M52,200 C190,199 320,198 440,197 C520,196 566,196 610,195"
        />
        <circle className="pop" style={{ '--dly': '1.5s' } as never} cx="610" cy="30" r="5" fill="var(--machine)" />
        <circle className="pop" style={{ '--dly': '1.7s' } as never} cx="610" cy="195" r="5" fill="var(--person)" />
        <text className="fl machine pop" style={{ '--dly': '1.6s' } as never} x="600" y="18" textAnchor="end">
          Capability
        </text>
        <text className="fl person pop" style={{ '--dly': '1.8s' } as never} x="600" y="182" textAnchor="end">
          Judgment
        </text>
        <text className="fl faint" x="52" y="230">
          2016
        </text>
        <text className="fl faint" x="616" y="230" textAnchor="end">
          Now
        </text>
      </svg>
    </Fig>
  );
}

/**
 * The refusal: the answer races toward you and is held at the line.
 *
 * The path is scrubbed against scroll by drivers.ts through `[data-ans]` and
 * `[data-head]`, so the markup here is the frozen end state — which is also
 * exactly what somebody with reduced motion, or a frozen timeline, sees.
 */
export function Refusal({ i }: { i: string }) {
  return (
    <section className="refusal" data-i={i} data-screen-label={`Turn ${i}`}>
      <div className="pinr">
        <span className="rn" aria-hidden="true">
          {i}
        </span>
        <div className="wrap">
          <span className="who">The machine answers</span>
          <p className="q">It could have written the conclusion.</p>
          <svg
            viewBox="0 0 1000 150"
            role="img"
            aria-label="The answer travels toward you and is stopped at a line."
          >
            <path className="ans" data-ans="" d="M40,75 L700,75" />
            <path className="head" data-head="" d="M690,64 L708,75 L690,86 Z" />
            <line className="wall" x1="740" y1="18" x2="740" y2="132" />
            <circle className="you" cx="930" cy="75" r="9" />
            <text className="fl m" x="40" y="52">
              The answer
            </text>
            <text className="fl s" x="760" y="52">
              Your turn to reach it
            </text>
            <text className="fl" x="930" y="118" textAnchor="middle">
              You
            </text>
          </svg>
          <p className="held">
            Held. At the line. <em>Every time.</em>
          </p>
          <p className="a">
            It had the paragraph ready. Every year its capability line climbs, and the line
            that is actually yours has not moved with it. Nobody agreed to that trade —{' '}
            <em>it arrived as convenience, one reasonable Tuesday at a time.</em> So this is
            where it stops.
          </p>
        </div>
      </div>
    </section>
  );
}

export function PrintLink({ children = 'Print this issue' }: { children?: ReactNode }) {
  return (
    <a
      href="#"
      className="print-link"
      onClick={(e) => {
        e.preventDefault();
        window.print();
      }}
    >
      {children}
    </a>
  );
}

export { Label, InkMark };
