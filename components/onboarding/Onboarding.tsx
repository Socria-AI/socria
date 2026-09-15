'use client';
// components/onboarding/Onboarding.tsx
//
// Four beats, and the last one is the product working.
//
// Pick what you came for, give it one real thing, get a question back that
// lands, then see it drawn. The philosophy arrives once at the end, when
// there is finally evidence for it.
//
// THE EXCHANGE IS REHEARSED, NOT CALLED. Beat iii answers from a table (see
// lib/onboarding-script.ts) rather than the model. That is not a shortcut:
// the whole effect depends on the reply arriving while the person is still
// looking at their own sentence, and it must not be able to rate-limit, cost
// anything, or fail in front of somebody who has known the product for nine
// seconds. What they wrote is then handed to the chat, so the conversation
// they start is the one they just had rather than an empty box.
//
// Skippable at every beat, and skipping still carries the exchange.

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, InsightCard, Label, Logo, LogosNode } from '@/components/journal/ds';
import {
  CARRY_KEY,
  INTENTS,
  resolveScript,
  type Intent,
  type Script,
} from '@/lib/onboarding-script';

/* ── words, rising on mount. Nothing here depends on scroll. ── */
function Rise({ text }: { text: string }) {
  const parts = text.split(/(\s+)/);
  let i = 0;
  return (
    <span>
      {parts.map((p, k) =>
        /^\s+$/.test(p) ? (
          p
        ) : (
          <span className="ob-w" key={k}>
            <i style={{ '--i': i++ } as React.CSSProperties}>{p}</i>
          </span>
        )
      )}
    </span>
  );
}

/**
 * Beat iii: the reply types itself, then stops.
 *
 * It ALWAYS lands on the full sentence. Two separate guards say so — the
 * step function finishes when it passes the end, and a timer finishes it
 * regardless after four seconds. A half-typed question left on screen
 * because a tab was backgrounded would be the worst single frame in the
 * product, so it is made unreachable twice.
 */
function Reply({ html, onDone }: { html: string; onDone: () => void }) {
  const [n, setN] = useState(0);
  const doneRef = useRef(onDone);
  doneRef.current = onDone;

  // The plain text, for the typing pass. Derived from the markup rather than
  // kept beside it so the two can never disagree about length.
  const plain = useRef<string | null>(null);
  if (plain.current === null) plain.current = html.replace(/<[^>]*>/g, '');
  const full = plain.current.length;

  useEffect(() => {
    const reduce =
      typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) {
      setN(full);
      doneRef.current();
      return;
    }
    let live = true;
    let at = 0;
    let timer: ReturnType<typeof setTimeout>;
    const step = () => {
      if (!live) return;
      at += 2;
      if (at >= full) {
        setN(full);
        doneRef.current();
        return;
      }
      setN(at);
      timer = setTimeout(step, 17);
    };
    timer = setTimeout(step, 420);
    const guard = setTimeout(() => {
      if (live) {
        setN(full);
        doneRef.current();
      }
    }, 4200);
    return () => {
      live = false;
      clearTimeout(timer);
      clearTimeout(guard);
    };
  }, [full]);

  const done = n >= full;
  return (
    <p className="v">
      {done ? (
        // Ours, from a fixed table — never anything the person typed.
        <span dangerouslySetInnerHTML={{ __html: html }} />
      ) : (
        <>
          {plain.current.slice(0, n)}
          <span className="ob-caret" />
        </>
      )}
    </p>
  );
}

/** Beat iv: three nodes, and the tension between two of them. */
function DrawnMap({ labels }: { labels: Script['map'] }) {
  const [q, claim, assume] = labels;
  return (
    <div className="ob-map" role="img" aria-label="A Thinking Map drawn from what you wrote.">
      <span className="ph">Thinking Map · your words, verbatim</span>
      <svg className="edges" viewBox="0 0 100 100" preserveAspectRatio="none">
        <path style={{ '--i': 0 } as React.CSSProperties} vectorEffect="non-scaling-stroke" d="M16,50 L56,20" />
        <path className="dash" style={{ '--i': 1 } as React.CSSProperties} vectorEffect="non-scaling-stroke" d="M56,20 L80,66" />
      </svg>
      <div className="nd" style={{ left: '6%', top: '50%', transform: 'translateY(-50%)', '--i': 0 } as React.CSSProperties}>
        <LogosNode type="question" label={q} />
      </div>
      <div className="nd" style={{ left: '40%', top: '8%', '--i': 1 } as React.CSSProperties}>
        <LogosNode type="claim" label={claim} />
      </div>
      <div className="nd" style={{ right: '5%', top: '56%', '--i': 2 } as React.CSSProperties}>
        <LogosNode type="assumption" label={assume} state="focused" />
      </div>
    </div>
  );
}

export function Onboarding() {
  const router = useRouter();
  const [beat, setBeat] = useState(0);
  const [intent, setIntent] = useState<Intent | null>(null);
  const [text, setText] = useState('');
  const [typed, setTyped] = useState(false);
  const [kept, setKept] = useState(false);
  const area = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (beat === 1) area.current?.focus();
  }, [beat]);

  const script = resolveScript(text, intent?.id);

  const begin = (v: string) => {
    const s = (v || '').trim();
    if (!s) return;
    setText(s);
    setBeat(2);
  };

  /**
   * Hand the exchange to the chat, so they land in their own session rather
   * than an empty one. Session storage, not local: this is for exactly one
   * landing, and the chat clears it as it reads.
   */
  const carry = useCallback(() => {
    try {
      sessionStorage.setItem(
        CARRY_KEY,
        JSON.stringify({ text, intent: intent?.title ?? null, q: script.q, n: script.n })
      );
    } catch {
      // A blocked store costs them the prefill, never the page.
    }
  }, [text, intent, script]);

  const leave = useCallback(() => {
    carry();
    // INTO LOGOS, not Core. The last beat of this sequence is a map, and
    // landing somebody in a surface that cannot draw one would take the
    // promise back in the first second. `?model=` is the switch the chat
    // already honours.
    router.push('/chat?model=logos');
  }, [carry, router]);

  return (
    <div className="ob">
      <span className="ob-grain" aria-hidden="true" />

      <div className="ob-top">
        <span style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
          <Logo size="sm" markSrc="/socria-mark.png" />
          <span className="ob-beats" aria-hidden="true">
            {[0, 1, 2, 3].map((i) => (
              <i key={i} className={i <= beat ? 'on' : ''}>
                <b />
              </i>
            ))}
          </span>
        </span>
        <button type="button" className="ob-skip" onClick={leave}>
          {beat < 3 ? 'Skip — take me to Socria' : 'Skip'}
        </button>
      </div>

      <div className="ob-stage">
        {/* ── i · what are you here to do ── */}
        {beat === 0 && (
          <div className="ob-wrap" key="b0">
            <Label tone="moss">Beginning · one question at a time</Label>
            <h1 className="ob-q">
              <Rise text="What are you here to do?" />
            </h1>
            <p className="ob-sf ob-fade" style={{ '--d': '.5s' } as React.CSSProperties}>
              Pick one. It changes the first question Socria asks you — not what you are allowed to
              bring.
            </p>
            <div className="ob-cards ob-fade" style={{ '--d': '.72s' } as React.CSSProperties}>
              {INTENTS.map((o) => (
                <button
                  type="button"
                  className={'ob-card' + (o.wide ? ' wide' : '')}
                  key={o.id}
                  onClick={() => {
                    setIntent(o);
                    setBeat(1);
                  }}
                >
                  <span className="rn">{o.rn}.</span>
                  <span className="t">{o.title}</span>
                  <span className="d">{o.detail}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ── ii · one real thing ── */}
        {beat === 1 && intent && (
          <div className="ob-wrap" key="b1">
            <Label tone="moss">{intent.title}</Label>
            <h1 className="ob-q">
              <Rise text="What are you working through right now?" />
            </h1>
            <p className="ob-sf ob-fade" style={{ '--d': '.5s' } as React.CSSProperties}>
              Something real — the actual decision, proof or argument. Not a demo. This is the
              conversation.
            </p>
            <div className="ob-field ob-fade" style={{ '--d': '.7s' } as React.CSSProperties}>
              <textarea
                ref={area}
                rows={2}
                value={text}
                placeholder="In your own words…"
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    begin(text);
                  }
                }}
                aria-label="What you are working through"
              />
              <button
                type="button"
                className="ob-go"
                onClick={() => begin(text)}
                disabled={!text.trim()}
                aria-label="Begin"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M5 12h14M13 6l6 6-6 6" />
                </svg>
              </button>
            </div>
            <p className="ob-hint ob-fade" style={{ '--d': '.82s' } as React.CSSProperties}>
              Enter to begin · nothing here is sent anywhere
            </p>
            <div className="ob-eg ob-fade" style={{ '--d': '.94s' } as React.CSSProperties}>
              {intent.eg.map((e) => (
                <button type="button" key={e} onClick={() => begin(e)}>
                  {e}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ── iii · the first exchange ── */}
        {beat === 2 && (
          <div className="ob-wrap" key="b2">
            <div className="ob-said">
              <span className="lbl">You said</span>
              <p className="v">{text}</p>
            </div>
            <div className="ob-reply">
              <span className="lbl">Socria asks</span>
              <Reply html={script.q} onDone={() => setTyped(true)} />
            </div>
            {typed && (
              <>
                <div className="ob-noticed ob-fade" style={{ '--d': '.2s' } as React.CSSProperties}>
                  <InsightCard
                    label="Noticed"
                    eyebrow="An assumption"
                    text={script.n}
                    onContinue={leave}
                    onShare={() => {
                      // Either way they are told it worked; a clipboard that
                      // refuses is not worth an error message here.
                      const line = script.n;
                      if (navigator.clipboard) {
                        navigator.clipboard.writeText(line).then(
                          () => setKept(true),
                          () => setKept(true)
                        );
                      } else setKept(true);
                    }}
                  />
                  {kept && (
                    <p className="ob-kept">
                      Copied. <em>It was yours already.</em>
                    </p>
                  )}
                </div>
                <div className="ob-next ob-fade" style={{ '--d': '.45s' } as React.CSSProperties}>
                  <span className="q2">Want to see this drawn?</span>
                  <Button variant="primary" arrow onClick={() => setBeat(3)}>
                    Show me the map
                  </Button>
                </div>
              </>
            )}
          </div>
        )}

        {/* ── iv · the map, then the sentence ── */}
        {beat === 3 && (
          <div className="ob-wrap wide" key="b3">
            <Label tone="moss">Logos · the same thinking, drawn</Label>
            <h1 className="ob-q" style={{ fontSize: 'clamp(1.7rem,3.8vw,2.6rem)' }}>
              <Rise text="Three sentences. One unexamined assumption." />
            </h1>
            <DrawnMap labels={script.map} />
            <div className="ob-creed ob-fade" style={{ '--d': '.9s' } as React.CSSProperties}>
              <p className="one">
                Socria is <em>Human-First AI</em> — built to make you more capable, not more
                dependent.
              </p>
              <div className="row">
                <Button variant="primary" arrow onClick={leave}>
                  Continue into Socria
                </Button>
                <span className="aside">It has not answered you yet. That was the point.</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
