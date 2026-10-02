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

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { SignedIn, SignedOut, ClerkLoaded, ClerkLoading } from '@clerk/nextjs';
import { CARRY_KEY } from '@/lib/onboarding-script';
import { Button, Label, InkMark } from './ds';

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
        {/* NO ACCOUNT PILL HERE. The masthead used to carry the full control —
            the reader's name beside their picture — and it was the loudest
            thing on a page whose whole argument is about their thinking rather
            than about them. The design's own masthead has never had one: Sign
            in, and the way in. This is that, with the one addition a real
            product needs over a standalone export — somebody already signed in
            is not shown a Sign in link, they are shown the way to their
            account, in the same quiet weight as every other item in the nav.

            THE SLOT IS NEVER EMPTY, which is why ClerkLoading has its own
            branch. Without it the nav rendered with nothing there, inserted a
            link when Clerk resolved and shifted the whole right-hand side —
            and with JavaScript off it never appeared at all. */}
        <ClerkLoading>
          <Link href="/sign-in" className="hs auth">
            Sign in
          </Link>
        </ClerkLoading>
        <ClerkLoaded>
          <SignedOut>
            <Link href="/sign-in" className="hs auth">
              Sign in
            </Link>
          </SignedOut>
          <SignedIn>
            <Link href="/account" className="hs auth">
              Account
            </Link>
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


/**
 * The depth dial, as four concentric rings.
 *
 * Ported with the Logos issue. The claim under it is the whole point of the
 * control: it sets how far the thinking goes and has never set how fast the
 * answer arrives, which is the one thing people assume a "depth" dial means.
 */
export function DepthFig() {
  const rings: [number, string, number, boolean][] = [
    [34, 'Quick', 0.15, false],
    [66, 'Balanced', 0.5, false],
    [98, 'Deep', 0.85, false],
    [130, 'Abstract', 1.2, true],
  ];
  return (
    <Fig n="II" caption="Four registers, one dial." claim="It sets depth, never speed.">
      <svg
        className="depth-viz"
        viewBox="0 0 640 310"
        role="img"
        aria-label="Four concentric rings: Quick, Balanced, Deep, Abstract."
      >
        {rings.map(([r, label, dly, far]) => (
          <circle
            key={label}
            className={'dr draw' + (far ? ' far' : '')}
            cx="320"
            cy="170"
            r={r}
            style={{ '--len': Math.round(2 * Math.PI * r), '--dly': dly + 's' } as React.CSSProperties}
          />
        ))}
        {rings.map(([r, label, dly, far]) => (
          <text
            key={label + 't'}
            className={'dl pop' + (far ? ' faint' : '')}
            x="320"
            y={170 - r + 17}
            textAnchor="middle"
            style={{ '--dly': dly + 0.5 + 's' } as React.CSSProperties}
          >
            {label}
          </text>
        ))}
        <circle className="pop" style={{ '--dly': '.1s' } as React.CSSProperties} cx="320" cy="170" r="4" fill="var(--person)" />
        <text className="dl faint pop" style={{ '--dly': '1.9s' } as React.CSSProperties} x="320" y="300" textAnchor="middle">
          You choose how far, not how fast
        </text>
      </svg>
    </Fig>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   THE DOOR — the issue opens on a composer, not on a headline.
   ═══════════════════════════════════════════════════════════════════ */

/**
 * The questions that type themselves, until somebody types their own.
 *
 * Four, and they are deliberately uneven: one about the reader, one decision,
 * one about their own argument, one piece of work. The point is that the box
 * takes any of them — a cover that only suited one kind of question would be
 * a headline wearing a composer's clothes.
 */
const DOOR_ASKS = [
  'When did you last change your mind?',
  'Should I take the job?',
  'Is my argument actually any good?',
  'Help me check my working.',
];

/**
 * THE COMPOSER IS THE COVER.
 *
 * The first screen of the issue is the thing the product does, with the
 * reader's own question in it, rather than an argument that they should try
 * it. Pressing it carries the sentence into /chat and opens already asking.
 *
 * HOW THE SENTENCE TRAVELS, and why not in the URL. `/onboarding` already has
 * exactly this handover — one key in sessionStorage, read once and cleared by
 * `takeCarried` on the chat's own mount — so this writes the same key rather
 * than adding a second mechanism with its own bugs. A query parameter was the
 * obvious alternative and is the wrong one here: the note under this box
 * promises that nothing is sent anywhere until they press it, and a question
 * in a URL is in their history, in the referer and in any log the navigation
 * touches before they have decided anything.
 */
export function Door({
  issue = 'Issue No. 4 · Logos 2 · MMXXVI',
  to = '/chat',
}: {
  issue?: string;
  to?: string;
}) {
  const router = useRouter();
  const [v, setV] = useState('');
  const [ghost, setGhost] = useState('');
  const [typing, setTyping] = useState(false);
  const field = useRef<HTMLTextAreaElement | null>(null);

  /* Cover-scale type in a fixed two-row box hid the end of anything longer
     than about seventy characters, and a scrollbar inside display type is
     worse than the bug. So the box grows to its content and the type steps
     down as the question lengthens — but the sizing lives in the stylesheet
     and this only reports the length, because an inline font-size did not
     take and a scrollHeight read before layout wrote height:0 and never
     recovered. */
  const grow = useCallback((el: HTMLTextAreaElement | null) => {
    if (!el) return;
    const n = el.value.length;
    el.dataset.len = n > 190 ? 'xl' : n > 110 ? 'l' : n > 58 ? 'm' : 's';
    el.style.height = 'auto';
    /* never collapse: if the box has not been laid out yet, leave the CSS
       min-height standing rather than writing a zero */
    if (el.scrollHeight > 0) el.style.height = `${el.scrollHeight}px`;
  }, []);

  useEffect(() => {
    const el = field.current;
    grow(el);
    /* re-measure once layout and the display face have settled */
    const r = requestAnimationFrame(() => grow(el));
    if (document.fonts?.ready) void document.fonts.ready.then(() => grow(el));
    return () => cancelAnimationFrame(r);
  }, [v, grow]);

  /* the questions type themselves, one after another, until you type your own */
  useEffect(() => {
    if (v) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    let i = 0;
    let k = 0;
    let dir = 1;
    let stop = false;
    let timer: ReturnType<typeof setTimeout>;
    const step = () => {
      if (stop) return;
      const q = DOOR_ASKS[i];
      k += dir;
      if (k >= q.length) {
        dir = -1;
        setGhost(q);
        setTyping(true);
        timer = setTimeout(step, 2600);
        return;
      }
      if (k <= 0) {
        dir = 1;
        i = (i + 1) % DOOR_ASKS.length;
        k = 0;
      }
      setGhost(q.slice(0, Math.max(0, k)));
      setTyping(true);
      timer = setTimeout(step, dir > 0 ? 38 + Math.random() * 34 : 17);
    };
    timer = setTimeout(step, 600);
    return () => {
      stop = true;
      clearTimeout(timer);
    };
  }, [v]);

  /* warm the chat while they read this screen, so pressing it is a navigation
     to something already parsed rather than a cold start. Next's own
     prefetch, not a <link>: the destination is a route, and the router knows
     how to fetch one. */
  useEffect(() => {
    router.prefetch(to);
  }, [router, to]);

  const go = () => {
    const q = v.trim();
    if (q) {
      // The same one-shot handover /onboarding uses; see takeCarried.
      try {
        sessionStorage.setItem(
          CARRY_KEY,
          JSON.stringify({ text: q.slice(0, 2000), intent: null, q: '', n: '' })
        );
      } catch {
        /* a private window with storage blocked still gets to the chat — it
           just arrives empty, which is the chat's own empty state and asks. */
      }
    }
    router.push(to);
  };

  return (
    <section className="door" data-screen-label="The door">
      <div className="wrap">
        <Label tone="moss">{issue}</Label>
        <form
          className="door-ask"
          onSubmit={(e) => {
            e.preventDefault();
            go();
          }}
        >
          {!v && typing && (
            <span className="door-ghost" aria-hidden="true">
              {ghost}
              <i className="car" />
            </span>
          )}
          <textarea
            ref={field}
            rows={2}
            value={v}
            spellCheck={false}
            aria-label="Ask Socria"
            enterKeyHint="go"
            placeholder={typing ? '' : DOOR_ASKS[0]}
            onChange={(e) => {
              setV(e.target.value);
              grow(e.target);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                go();
              }
            }}
          />
          <div className="door-row">
            <span className="door-note">
              Nothing here is sent anywhere until you press it. Your reasoning is yours.
            </span>
            <Button onClick={go} variant="primary" size="xl" arrow>
              Try Socria — free
            </Button>
          </div>
        </form>
        <p className="door-under rv d2">
          Type the thing you have not been able to settle, and Socria opens already asking about it.
          <span className="door-alt">
            {' '}
            Or <a href="#stage">watch it work first</a>.
          </span>
        </p>
        <div className="begin">
          <span className="lbl">The issue</span>
          <span className="ln" />
        </div>
      </div>
    </section>
  );
}

/**
 * The way in, once the door is off screen.
 *
 * Fixed, bottom right, and absent until 700px of scroll — the door IS the
 * invitation above that, and two of them at once would be the page asking
 * twice. Hidden from assistive technology and taken out of the tab order
 * while it is invisible, because a thing that cannot be seen but can be
 * focused is a trap rather than an affordance.
 */
export function AskSlip({ to = '/chat' }: { to?: string }) {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const on = () => setShow((window.scrollY || document.documentElement.scrollTop) > 700);
    window.addEventListener('scroll', on, { passive: true });
    on();
    return () => window.removeEventListener('scroll', on);
  }, []);
  return (
    <Link
      className={`ask-slip${show ? ' on' : ''}`}
      href={to}
      aria-hidden={show ? undefined : 'true'}
      tabIndex={show ? 0 : -1}
    >
      Try Socria{' '}
      <span className="ar" aria-hidden="true">
        →
      </span>
    </Link>
  );
}
