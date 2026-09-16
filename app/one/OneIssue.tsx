'use client';
// app/one/OneIssue.tsx — Socria One, as an invitation.
//
// Ported from `Socria One.html`, in the journal's editorial register and
// built from the same parts as the homepage and the Logos issue.
//
// The price is read from lib/socria-one rather than written into the copy,
// so the page and the checkout can never disagree about what One costs —
// the mockup hardcodes $15 in four places and that is exactly the kind of
// number that goes stale in one of them.

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Count, Grain, Mast, PrintLink, Progress, Turn } from '@/components/journal/parts';
import { Label, LogosNode, OneLock, OneMark, SpecTable, type NodeType } from '@/components/journal/ds';
import { Colophon } from '@/components/Colophon';
import { initJournal } from '@/components/journal/drivers';
import { priceLabel, priceWithPeriod } from '@/lib/socria-one';

/* The free map: four real nodes, and the two it was about to draw. */
const OPEN: { t: NodeType; l: string; x: number; y: number }[] = [
  { t: 'question', l: 'Should I take the job?', x: 13, y: 48 },
  { t: 'claim', l: 'It pays more', x: 40, y: 19 },
  { t: 'claim', l: "I've stopped growing", x: 38, y: 78 },
  { t: 'assumption', l: 'money = progress', x: 66, y: 22 },
];
const LOCKED = [
  { l: 'the tension you were about to name', x: 63, y: 56 },
  { l: 'research across the whole map', x: 87, y: 80 },
];
const E_OPEN: [number, number, number, number][] = [
  [13, 48, 40, 19],
  [13, 48, 38, 78],
  [40, 19, 66, 22],
];
const E_LOCK: [number, number, number, number][] = [
  [38, 78, 63, 56],
  [40, 19, 63, 56],
  [66, 22, 87, 80],
];

const PLATES: [string, string, string[], string, [string, string]][] = [
  ['I', 'The map',
    ['Full, <em>extended Thinking Maps</em> — no boundary on how far a thought can grow.',
     'Branch every line of inquiry as far as it deserves to go.',
     'Every way of seeing it: <em>Structure, Graph and Board.</em>'],
    '— so a thought can grow to its real size.',
    ['Free pauses at four branches', 'One branches without end']],
  ['II', 'The depth',
    ['All four depth modes, at will: <em>Quick, Balanced, Deep, Abstract.</em>',
     'Run full <em>Research across the map</em> — as often as the question calls.',
     'More Logos conversations, at the pace your thinking sets.'],
    '— so no question has to stay shallow.',
    ['Free tastes Research once', 'One researches without asking twice']],
  ['III', 'The craft',
    ['<em>Draft Space</em> — a studio for advanced writing and creative work.',
     'Long-form and pasted-content workflows, for real material.',
     'Images and multimodal reasoning, when available.'],
    '— so the thinking becomes the work.',
    ['Free drafts in fragments', 'One opens the full Draft Space']],
  ['IV', 'The continuity',
    ['<em>Persistent reasoning</em> and history — every map, every thread, kept.',
     'Personalisation that learns <em>how you reason</em>, not just what you ask.',
     'Connected sources — Drive, Docs and Notion, when available.'],
    '— so nothing you build is ever lost.',
    ['Free forgets between visits', 'One keeps every thread']],
];

const STANDARD: [string, string][] = [
  ['Thinking Maps', 'Free draws real maps and pauses at four branches. One branches without end.'],
  ['Research', 'Free runs it once per map, in full. One runs it across the whole map, as often as it is called for.'],
  ['Depth', 'Free reasons at Quick and Balanced. One adds Deep and Abstract.'],
  ['Draft Space', 'Free drafts in fragments. One opens the full studio, with long-form and pasted material.'],
  ['Memory', 'Free forgets between visits. One keeps every thread, on every device.'],
  ['Sources', 'One connects Drive, Docs and Notion, where available.'],
  ['The guard', 'Identical at both tiers. It never relaxes for members.'],
  ['What is yours', 'Identical at both tiers. Every map you have made stays yours, always.'],
];

/** The boundary, demonstrated rather than described. */
function Boundary() {
  const [open, setOpen] = useState(false);
  return (
    <section className="demo deep" data-screen-label="The boundary">
      <div className="wrap">
        <span className="eb">
          <Label tone="paper">The boundary · demonstrated</Label>
        </span>
        <h2>
          This is where a free map <span className="em">stops.</span>
        </h2>
        <p className="deck">
          Not a paywall across your work — everything you built stays open, visible and yours. It
          simply stops growing.
        </p>
        <div className={'stage' + (open ? ' unlocked' : '')}>
          <svg className="edges" viewBox="0 0 100 100" preserveAspectRatio="none">
            {E_OPEN.map((e, i) => (
              <path key={i} className="e-open" vectorEffect="non-scaling-stroke" d={`M${e[0]},${e[1]} L${e[2]},${e[3]}`} />
            ))}
            {E_LOCK.map((e, i) => (
              <path key={i} className="e-lock" vectorEffect="non-scaling-stroke" style={{ opacity: open ? 1 : 0 }} d={`M${e[0]},${e[1]} L${e[2]},${e[3]}`} />
            ))}
          </svg>
          {OPEN.map((n, i) => (
            <div className="nd" key={i} style={{ left: n.x + '%', top: n.y + '%' }}>
              <LogosNode type={n.t} label={n.l} />
            </div>
          ))}
          {LOCKED.map((n, i) => (
            <div className="locked" key={i} style={{ left: n.x + '%', top: n.y + '%' }}>
              <span className="ghost">{n.l}</span>
              {!open && <OneLock onClick={() => setOpen(true)} />}
            </div>
          ))}
          <div className="capline">
            {open ? (
              <>
                <span className="off-state">Free · four branches, then it holds</span>
                <span className="on-state">With One · it keeps going</span>
              </>
            ) : (
              <span className="off-state">Free · four branches, then it holds</span>
            )}
          </div>
        </div>
        <div className="controls">
          <button type="button" className="btn-one" onClick={() => setOpen(!open)}>
            {open ? 'Show the free map again' : 'See it with One'} <span aria-hidden="true">→</span>
          </button>
          <Link className="btn-quiet" href="#join">
            what else opens
          </Link>
        </div>
        <p className="vow">
          Your free map has reached its limit — not been taken away. Socria One is what lets you
          keep developing it.
        </p>
      </div>
    </section>
  );
}

export function OneIssue() {
  const [bloom, setBloom] = useState(false);

  useEffect(() => {
    // Both teardowns, not one: initJournal returns a cleanup that releases
    // its per-tab latch, and without it an in-app navigation back to this
    // page leaves every driver uninstalled.
    const stopJournal = initJournal();
    const reduce =
      typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) {
      setBloom(true);
      return stopJournal;
    }
    const t = setTimeout(() => setBloom(true), 1000);
    return () => {
      clearTimeout(t);
      stopJournal();
    };
  }, []);

  return (
    <div className="jr-root one-issue">
      <Grain />
      <Progress />
      <Count />
      <Mast current="one" cta={{ href: '#join', t: 'Become a member' }} />

      <section
        className={'cover one-cover deep one-deep' + (bloom ? ' bloom' : '')}
        data-screen-label="Cover"
      >
        <div className="flood" aria-hidden="true" />
        <div className="wrap">
          <span className="eb">
            <Label tone="paper">Socria · An invitation · MMXXVI</Label>
          </span>
          <div className="rv" style={{ margin: 'clamp(18px,3.6vh,34px) 0 0' }}>
            <OneMark size={96} tone="dark" drawn={bloom} />
          </div>
          <h1 data-split="">
            Socria <span className="em">One.</span>
          </h1>
          <div className="priceline rv d2">
            <span className="amt">{priceLabel()}</span>
            <span className="per">/ month</span>
          </div>
          <p className="st rv d2">
            Everything Socria does, without the ceiling. Not more AI — the complete reasoning
            environment, and every thread you have already started.
          </p>
          <div className="begin">
            <span className="lbl">Begin</span>
            <span className="ln" />
          </div>
        </div>
      </section>

      <Turn
        i="i"
        who="Socria asks"
        socria
        ground="question"
        answer="Most people can name it exactly. A branch you wanted to open. A second research pass. The thread you came back for and could not find."
      >
        What stopped you last time?
      </Turn>

      <Boundary />

      <Turn
        i="ii"
        who="Socria asks"
        socria
        aside="name it — you already know"
        answer="That is the whole of what One is for. Not more output — the room to keep going when the question turns out to be larger than a trial can responsibly hold."
      >
        What were you about to find?
      </Turn>

      <section className="ledger" data-screen-label="The ledger">
        <div className="wrap">
          <div className="rhead">
            <Label tone="moss">The ledger · what a member gets</Label>
            <Label tone="faint">Socria One · MMXXVI</Label>
          </div>
          <h2>
            The whole instrument, in your <span className="em">hands.</span>
          </h2>
          <p className="deck">
            Four chapters, each sealed. Everything below is what the boundary was holding back.
          </p>
          <p className="ledger-note">
            Not a bundle of credits, and not a quota.{' '}
            <span className="jargon">Unlock more value with our Pro tier.</span> A membership opens
            the room; what you do in it is still entirely yours.
          </p>
          <div className="plates">
            {PLATES.map(([rn, name, items, payoff, stop]) => (
              <div className="plate rv" key={rn}>
                <div className="seal">
                  <OneMark size={54} tone="light" letter={rn} />
                  <span className="ct">{name}</span>
                </div>
                <div>
                  <ul>
                    {items.map((it, i) => (
                      // Ours, from the table above — never anything typed.
                      <li key={i} dangerouslySetInnerHTML={{ __html: it }} />
                    ))}
                  </ul>
                  <p className="payoff">{payoff}</p>
                  <p className="stop">
                    <span className="o" />
                    {stop[0]}
                    <span className="sep">·</span>
                    <span className="f" />
                    {stop[1]}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="standard" data-screen-label="The standard">
        <div className="wrap">
          <Label tone="moss">The standard · free and One, side by side</Label>
          <h2>Written down, so nothing is implied.</h2>
          <div className="rv">
            <SpecTable head={['Dimension', 'Free · and what One changes']} rows={STANDARD} />
          </div>
        </div>
      </section>

      <Turn
        i="iii"
        who="Socria asks"
        socria
        ground="person"
        answer="That is the only arithmetic that matters here, and it is not one we can do for you — which is, as ever, the point."
      >
        What is {priceLabel()} against one decision you got right?
      </Turn>

      <section className="vowplate deep one-deep" data-screen-label="The vow">
        <div className="wrap">
          <span className="eb">
            <Label tone="paper">The vow · identical at every tier</Label>
          </span>
          <h2>
            Membership buys room. <span className="em">Never permission.</span>
          </h2>
          <div className="vowgrid rv">
            <div className="c">
              <span className="rn2">i.</span>
              <h3>Nothing is held hostage</h3>
              <p>
                Reach the free limit and your map stays whole — visible, interactive, and yours.
                Cancel a membership and it is still there.
              </p>
            </div>
            <div className="c">
              <span className="rn2">ii.</span>
              <h3>The guard does not relax</h3>
              <p>
                Members do not get answers handed to them either. Values that disappear when they
                are expensive are not values.
              </p>
            </div>
            <div className="c">
              <span className="rn2">iii.</span>
              <h3>The conclusion stays yours</h3>
              <p>
                No tier draws it. Socria contributes structure, questions, research and critique —
                intent, authorship and judgment remain where they belong.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="invite deep one-deep" id="join" data-screen-label="Join">
        <div className="glow" aria-hidden="true" />
        <div className="wrap">
          <div className="rv" style={{ marginBottom: '26px' }}>
            <OneMark size={74} tone="dark" />
          </div>
          <h2 data-split="">
            Become a member of <span className="em">One.</span>
          </h2>
          <div className="terms rv d2">
            <div>
              <span className="k">Membership</span>
              <span className="v">{priceWithPeriod()}</span>
            </div>
            <div>
              <span className="k">Commitment</span>
              <span className="v">Cancel any time</span>
            </div>
            <div>
              <span className="k">Your maps</span>
              <span className="v">Yours, either way</span>
            </div>
          </div>
          <div className="row rv d2">
            <Link className="cta" href="/chat?one=1">
              Continue with One <span aria-hidden="true">→</span>
            </Link>
            <Link className="quiet" href="/onboarding">
              or start free — no account
            </Link>
          </div>
          <Colophon className="colophon">
            <span>
              <PrintLink />
            </span>
          </Colophon>
        </div>
      </section>
    </div>
  );
}
