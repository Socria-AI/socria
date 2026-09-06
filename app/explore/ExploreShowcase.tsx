'use client';

// app/explore/ExploreShowcase.tsx — the use cases, running.
//
// Every exhibit here mounts the real <ThinkingMap> on a real map, inside the
// same frame the /logos and /docs pages use. Nothing is a screenshot and
// nothing is a drawing: the panel's own lens tabs switch lenses, the graph
// settles, the plot's parameter drags. A visitor who scrolls this page has
// used the product before deciding whether to open it.
//
// The Core 3.1 scenario deliberately has no map and no panel. Its whole point
// is the absence — that the same posture exists without the apparatus — and
// giving it a map to look busy would misrepresent the thing it is selling.

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ThinkingMap } from '@/components/ThinkingMap';
import { LENSES, availableLenses, leadLens } from '@/lib/logos-layout';
import { LogosMark } from '@/components/LogosMark';
import { KINDS, SCENARIOS, type Kind, type Scenario } from './scenarios';

const OPEN_LOGOS = '/chat?model=logos';
const OPEN_CORE = '/chat';


/** A framed slice of the product — the same chrome the other pages use. */
function Frame({
  label,
  height = 430,
  children,
}: {
  label: string;
  height?: number;
  children: React.ReactNode;
}) {
  return (
    <figure className="ui-frame">
      <div className="ui-chrome" aria-hidden="true">
        <span className="ui-addr">Socria · live</span>
      </div>
      <div className="ui-body" style={{ height }}>
        <div className="logos-root lg-demo">{children}</div>
      </div>
      <figcaption className="ui-cap">{label}</figcaption>
    </figure>
  );
}

/** The conversation column, as the app renders it. */
function Thread({ scenario }: { scenario: Scenario }) {
  return (
    <section className="lg-convo">
      <header className="lg-head">
        <span className="lg-word">
          {scenario.model === 'logos' ? <LogosMark size={22} /> : <span className="exp-corename">Socria</span>}
        </span>
        <span className="lg-head-note">
          {scenario.model === 'logos' ? 'A reasoning environment' : 'Core 3.1'}
        </span>
        <span className="lg-depth-btn" style={{ marginLeft: 'auto' }}>
          Balanced
        </span>
      </header>
      {/* The app's thread scrolls; a fixed-height exhibit that hides the
          assistant's reply shows the half nobody came for. `column-reverse`
          holds it at the newest message, which is where a real thread sits. */}
      <div className="lg-thread exp-thread">
        {scenario.turns.map((m, i) => (
          <div key={i} className={`lg-msg lg-msg-${m.role}`}>
            {m.role === 'assistant' && <span className="lg-msg-who">Socria</span>}
            <div className="lg-msg-stack">
              <div className="lg-msg-body">{m.content}</div>
            </div>
          </div>
        ))}
      </div>
      <div className="lg-composer">
        <div className="lg-composer-box">
          <div className="lg-composer-row">
            <span className="ui-placeholder">What are you thinking through?</span>
          </div>
        </div>
      </div>
    </section>
  );
}

function Exhibit({ scenario }: { scenario: Scenario }) {
  // Which lens this opens on is DERIVED, never asserted.
  //
  // <ThinkingMap> chooses its own opening lens — leadLens() picks the one
  // that IS the answer for a given map, and overrides whatever initialLens
  // asked for. So a hand-written caption saying "Evidence lens" was a caption
  // that could be, and was, simply false: the panel opened on Graph while the
  // line above it claimed otherwise. Asking the same function the map asks
  // means the label is right by construction, including for maps added later.
  //
  // There is also deliberately no lens switcher out here. The panel renders
  // its own and that one is the product's; a second row above the frame
  // duplicated it, and on a page whose whole claim is "this is the running
  // thing, not a picture of it", the control you reach for should be real.
  const lens = useMemo(() => {
    if (!scenario.map) return null;
    return leadLens(availableLenses(scenario.map), !!scenario.map.viz);
  }, [scenario.map]);
  const lensMeta = lens ? LENSES.find((l) => l.id === lens) : null;

  return (
    <article className="exp-case" id={scenario.id}>
      <div className="exp-case-head">
        <span className={`exp-kind is-${scenario.model}`}>
          {scenario.model === 'logos' ? 'Socria Logos' : 'Socria Core 3.1'}
          <span className="exp-kind-sep">·</span>
          {scenario.kind}
        </span>
        <h2 className="exp-case-title">{scenario.title}</h2>
        <p className="exp-case-who">{scenario.who}</p>
      </div>

      {scenario.map ? (
        <>
          {lensMeta && (
            <p className="ui-lensblurb">
              opens on {lensMeta.label} — {lensMeta.caption.replace(/\.$/, '')}
            </p>
          )}
          <Frame label={scenario.caption} height={500}>
            <div className="lg-split lg-demo-split" style={{ height: '100%' }}>
              <Thread scenario={scenario} />
              <section className="lg-panel">
                <header className="lg-panel-head">
                  <span className="lg-panel-title">
                    Thinking Map
                    {scenario.contextLabel && (
                      <em className="lg-panel-context">{scenario.contextLabel}</em>
                    )}
                  </span>
                  <span className="lg-panel-state">{scenario.map.nodes.length} nodes</span>
                </header>
                <ThinkingMap map={scenario.map} initialLens={lens ?? 'graph'} />
              </section>
            </div>
          </Frame>
        </>
      ) : (
        // One column, set inline: the app's own .lg-split rule sets two and
        // wins from logos.css, and this is the one exhibit with nothing to
        // put in the second — an empty right half beside a conversation reads
        // as a panel that failed to load rather than one deliberately absent.
        <Frame label={scenario.caption} height={620}>
          <div
            className="lg-split lg-demo-split exp-nopanel"
            style={{ height: '100%', gridTemplateColumns: '1fr' }}
          >
            <Thread scenario={scenario} />
          </div>
        </Frame>
      )}

      <p className="exp-case-point">{scenario.point}</p>
      <Link
        className="exp-case-go"
        href={scenario.model === 'logos' ? OPEN_LOGOS : OPEN_CORE}
      >
        Try this one <span aria-hidden="true">→</span>
      </Link>
    </article>
  );
}

export function ExploreShowcase() {
  const [kind, setKind] = useState<Kind>('All');
  const shown = useMemo(
    () => (kind === 'All' ? SCENARIOS : SCENARIOS.filter((s) => s.kind === kind)),
    [kind],
  );

  return (
    <>
      <nav className="exp-filter" aria-label="Filter use cases">
        {KINDS.map((k) => (
          <button
            key={k}
            type="button"
            className={`exp-chip${kind === k ? ' is-on' : ''}`}
            aria-pressed={kind === k}
            onClick={() => setKind(k)}
          >
            {k}
          </button>
        ))}
      </nav>

      <div className="exp-cases">
        {shown.map((s) => (
          <Exhibit key={s.id} scenario={s} />
        ))}
      </div>
    </>
  );
}
