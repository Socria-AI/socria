'use client';

// The Logos explainer at /logos — what Logos is, for someone who has not used
// it yet. The app itself lives at /chat (Logos is a model, not a destination),
// so every call to action here opens /chat?model=logos.
//
// Written to be read, not scanned for keywords: each feature says what it does
// and why it exists, in the order someone actually meets them.

import { useEffect, useRef } from 'react';
import { LogosMark } from '@/components/LogosMark';

const OPEN = '/chat?model=logos';

export function LogosStory() {
  const rootRef = useRef<HTMLDivElement>(null);

  // Reveals on scroll, and the demo map drawing itself once it comes into view.
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const els = Array.from(root.querySelectorAll<HTMLElement>('.fade'));
    const demo = root.querySelector('.demo');
    const obs: IntersectionObserver[] = [];

    if (reduce || !('IntersectionObserver' in window)) {
      els.forEach((e) => e.classList.add('in'));
      demo?.classList.add('on');
    } else {
      root.classList.add('js-anim');
      const io = new IntersectionObserver(
        (en) =>
          en.forEach((e) => {
            if (e.isIntersecting) {
              e.target.classList.add('in');
              io.unobserve(e.target);
            }
          }),
        { threshold: 0.14, rootMargin: '0px 0px -6% 0px' }
      );
      els.forEach((e) => io.observe(e));
      obs.push(io);

      if (demo) {
        const dio = new IntersectionObserver(
          (en) =>
            en.forEach((e) => {
              if (e.isIntersecting) {
                demo.classList.add('on');
                dio.disconnect();
              }
            }),
          { threshold: 0.35 }
        );
        dio.observe(demo);
        obs.push(dio);
      }
    }
    return () => obs.forEach((o) => o.disconnect());
  }, []);

  return (
    <div className="lgx-root" ref={rootRef}>
      <header className="masthead">
        <div className="mh-left">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/socria-logo.png" alt="" />
          <span className="name">Socria</span>
        </div>
        <div className="mh-center label">A reasoning environment</div>
        <div className="mh-right">
          <a href="/one">Socria One</a>
          <a href={OPEN} className="ask">Open Logos</a>
        </div>
      </header>

      <main>
        {/* COVER */}
        <section className="spread cover">
          <span className="mark" aria-hidden="true">
            <LogosMark size={54} />
          </span>
          <h1>
            Think out loud. <span className="em">Watch it take shape.</span>
          </h1>
          <p className="standfirst">
            Logos listens to how you reason and draws it — live, beside the
            conversation — so you can see the thing you are actually thinking.
          </p>
          <div className="cover-cta">
            <a className="cta-primary" href={OPEN}>
              Open Logos <span className="ar">→</span>
            </a>
            <a className="cta-secondary" href="#how">or read what it does</a>
          </div>

          {/* the map, drawing itself */}
          <div className="demo" role="img" aria-label="A Thinking Map forming from a conversation">
            <svg viewBox="0 0 700 260">
              <path className="dl" d="M350,130 C286,112 232,96 178,74" />
              <path className="dl" d="M350,130 C418,112 476,98 528,76" />
              <path className="dl" d="M350,130 C292,158 240,182 190,204" />
              <path className="dl" d="M350,130 C412,160 468,184 516,206" />
              <g className="dn claim d1">
                <circle cx="350" cy="130" r="9" />
                <text x="350" y="156" textAnchor="middle">should I take the job</text>
              </g>
              <g className="dn d2">
                <circle cx="178" cy="74" r="6" />
                <text x="178" y="56" textAnchor="middle">I&rsquo;d be starting over</text>
              </g>
              <g className="dn d3">
                <circle cx="528" cy="76" r="6" />
                <text x="528" y="58" textAnchor="middle">the money is better</text>
              </g>
              <g className="dn d4">
                <circle cx="190" cy="204" r="6" />
                <text x="190" y="226" textAnchor="middle">assumes I&rsquo;d be bored</text>
              </g>
              <g className="dn d5">
                <circle cx="516" cy="206" r="6" />
                <text x="516" y="228" textAnchor="middle">tension: safety vs. pull</text>
              </g>
            </svg>
          </div>
          <p className="demo-cap">Your thinking, as Logos reads it — not a summary of it.</p>
        </section>

        {/* WHAT IT IS */}
        <section className="spread" id="how">
          <div className="wrap narrow">
            <div className="spread-head"><span className="num">·</span><span className="label">What it is</span></div>
            <p className="feat-b fade" style={{ fontSize: 'clamp(1.3rem,2.6vw,1.9rem)', lineHeight: 1.4, color: 'var(--ink)', fontFamily: 'var(--serif)' }}>
              Most AI hands you an answer. Logos hands you your own reasoning,
              made visible — so the thinking stays yours and gets sharper.
            </p>
            <div className="feat-b fade d1" style={{ marginTop: '1.4em' }}>
              <p>
                You talk. Two things happen at once: Socria answers, and a
                <em> Thinking Map</em> builds itself alongside — the claims you
                are making, the assumptions underneath them, the tensions you
                have not resolved, the questions still open.
              </p>
              <p>
                The map is not a transcript. It <strong>reorganizes</strong> as
                you think: pieces merge when you realise they were the same
                thing, split when they were not, and move as your reasoning
                moves. Watching it settle is often when you see the actual
                shape of what you believe.
              </p>
            </div>
          </div>
        </section>

        {/* THE FEATURES */}
        <section className="spread">
          <div className="wrap">
            <div className="spread-head"><span className="num">I.</span><span className="label">Everything it does</span></div>

            <div className="feat fade">
              <div className="feat-t"><span className="rn">i</span>The Thinking Map</div>
              <div className="feat-b">
                <p>
                  Every message is read twice — once to answer you, once to map
                  you — so the map keeps growing while the reply is still
                  arriving. Nodes carry their own type: a claim, a goal, an
                  assumption, a tension, a question, a piece of evidence.
                </p>
                <p>
                  Click any node and you can act on that one piece of thinking
                  alone, in its own small thread, without dragging the whole
                  conversation along.
                </p>
              </div>
            </div>

            <div className="feat fade">
              <div className="feat-t"><span className="rn">ii</span>Four ways to read it</div>
              <div className="feat-b">
                <p>
                  The same reasoning, seen differently. Switch lens and the map
                  rearranges to answer a different question about your thinking.
                </p>
                <div className="chips">
                  <span className="chip"><b>Graph</b> everything at once, alive and settling</span>
                  <span className="chip"><b>Structure</b> what rests on what</span>
                  <span className="chip"><b>Tensions</b> what pulls against what</span>
                  <span className="chip"><b>Evidence</b> which claims are actually held up</span>
                </div>
              </div>
            </div>

            <div className="feat fade">
              <div className="feat-t"><span className="rn">iii</span>Four things to do to a thought</div>
              <div className="feat-b">
                <p>Pick a node, then choose what you want done with it.</p>
                <div className="chips">
                  <span className="chip"><b>Explore</b> what this idea is, and what it isn&rsquo;t</span>
                  <span className="chip"><b>Challenge</b> where this would break</span>
                  <span className="chip"><b>Research</b> what the evidence actually says</span>
                  <span className="chip"><b>Trace</b> where this came from</span>
                </div>
                <p>
                  <em>Trace</em> is the one people are surprised by: it finds the
                  moment in your own conversation where an idea entered, quoting
                  you rather than paraphrasing. It is never locked behind
                  anything — seeing where your own thought came from is not a
                  feature to sell.
                </p>
              </div>
            </div>

            <div className="feat fade">
              <div className="feat-t"><span className="rn">iv</span>Mathematics</div>
              <div className="feat-b">
                <p>
                  Logos notices when the thinking turns mathematical and changes
                  what it is for. Notation renders properly. The map becomes a
                  chain of steps rather than a web of claims.
                </p>
                <p>
                  It reads <em>why</em> you brought the problem. Learning
                  something? It guides. Checking work you already did? It finds
                  the <strong>first</strong> step that went wrong and helps you
                  repair that one — rather than quietly replacing your work with
                  a clean solution. Just need a number? It gives you the number.
                </p>
              </div>
            </div>

            <div className="feat fade">
              <div className="feat-t"><span className="rn">v</span>The Board</div>
              <div className="feat-b">
                <p>
                  A third surface for maths: a scratch-space that looks like a
                  professor&rsquo;s chalkboard. Equations set in a serif maths
                  face, the working written by hand beside them, arrows down the
                  derivation, mistakes struck through with the correction next
                  to them.
                </p>
                <p>
                  It only ever shows work that has actually been done. It will
                  not fill in the ending for you.
                </p>
              </div>
            </div>

            <div className="feat fade">
              <div className="feat-t"><span className="rn">vi</span>The Answer Guard</div>
              <div className="feat-b">
                <p>
                  When you are learning something, Logos behaves like a good lab
                  instructor rather than a solution engine. It climbs one rung
                  at a time — notice what you tried, point somewhere useful,
                  recall the idea, narrow the next move, show one step — and it
                  stops before the ending.
                </p>
                <p>
                  It holds across <em>every</em> surface at once, so the chat
                  cannot withhold an answer while the map quietly reveals it.
                  And it never traps you: one button shows the whole solution
                  whenever you decide you want it.
                </p>
              </div>
            </div>

            <div className="feat fade">
              <div className="feat-t"><span className="rn">vii</span>Depth</div>
              <div className="feat-b">
                <p>How far the thinking goes, set globally and honoured everywhere.</p>
                <div className="chips">
                  <span className="chip"><b>Quick</b> the single most useful thing</span>
                  <span className="chip"><b>Balanced</b> the natural default</span>
                  <span className="chip"><b>Deep</b> dependencies and assumptions, thoroughly</span>
                  <span className="chip"><b>Abstract</b> the principle underneath</span>
                </div>
                <p>
                  Depth changes how deeply Logos helps you <em>think</em> — never
                  how quickly it gives an answer away. Quick does not mean
                  &ldquo;just tell me&rdquo;.
                </p>
              </div>
            </div>

            <div className="feat fade">
              <div className="feat-t"><span className="rn">viii</span>Personality</div>
              <div className="feat-b">
                <p>
                  Nine settings for how Socria talks while it thinks with you —
                  base style, warmth, directness, challenge, questioning,
                  length, humour, formatting, and how readily it notices your
                  wording. Underneath every combination it is still recognisably
                  Socria.
                </p>
                <p>
                  Below them, write instructions in your own words:
                  <em> &ldquo;let me ramble before you interrupt&rdquo;</em>,
                  <em> &ldquo;call me out when I&rsquo;m rationalising&rdquo;</em>.
                  Or just say it mid-conversation — &ldquo;fewer questions&rdquo;,
                  &ldquo;be blunt&rdquo; — and it adapts on the spot. Say
                  &ldquo;remember this&rdquo; and it keeps it.
                </p>
              </div>
            </div>

            <div className="feat fade">
              <div className="feat-t"><span className="rn">ix</span>Draft Space</div>
              <div className="feat-b">
                <p>
                  When thinking turns into writing, a page opens beside the map.
                  Select a passage and ask for what you need — clarify it,
                  challenge it, check a claim, tighten it. Nothing is ever
                  written into your draft behind your back: a suggestion only
                  lands if you put it there.
                </p>
              </div>
            </div>

            <div className="feat fade">
              <div className="feat-t"><span className="rn">x</span>Your own material</div>
              <div className="feat-b">
                <p>
                  Attach real material to a specific node — paste a page of
                  notes, upload a file or a photo of a whiteboard, pull in
                  something from the web. Logos reads it as <em>context</em>,
                  never as authority: it can supply facts and dates, but it does
                  not get to settle your question, and whoever wrote it does not
                  become you.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* THE PHILOSOPHY */}
        <section className="spread">
          <div className="wrap narrow">
            <div className="spread-head"><span className="num">II.</span><span className="label">The line it will not cross</span></div>
            <p className="feat-b fade" style={{ fontFamily: 'var(--serif)', fontSize: 'clamp(1.3rem,2.6vw,1.9rem)', lineHeight: 1.4, color: 'var(--ink)' }}>
              Logos contributes structure, questions, research, critique and
              refinement. You keep intent, authorship, judgment and the
              conclusion.
            </p>
            <div className="feat-b fade d1" style={{ marginTop: '1.4em' }}>
              <p>
                So &ldquo;write my essay&rdquo; gets you a conversation about
                what you are actually arguing. &ldquo;Here is my paragraph, make
                it clearer&rdquo; gets you help — your ideas, your voice,
                sharper. It is a narrow line, and it is the whole point: the
                thinking has to stay yours or none of this is worth anything.
              </p>
              <p>
                Two things are never paid features and never withheld:
                <strong> seeing where your own reasoning came from</strong>, and
                <strong> telling Logos it read you wrong</strong>. Correct it and
                the map re-forms around what you actually meant.
              </p>
            </div>
          </div>
        </section>

        {/* TIERS */}
        <section className="spread">
          <div className="wrap">
            <div className="spread-head"><span className="num">III.</span><span className="label">What it costs</span></div>
            <h2 className="fade" style={{ fontFamily: 'var(--serif)', fontSize: 'clamp(1.9rem,4vw,3rem)', maxWidth: '20ch' }}>
              Free is a real beginning, not a demo.
            </h2>
            <div className="tiers fade d1">
              <div className="tier">
                <h3>Free</h3>
                <p className="price">no account cost</p>
                <ul>
                  <li>The whole loop: chat, live map, explore</li>
                  <li>Two lines of thinking at a time</li>
                  <li>A map that grows to four nodes</li>
                  <li>Research, once per conversation</li>
                  <li>Trace and correction, always</li>
                </ul>
              </div>
              <div className="tier one">
                <h3>Socria One</h3>
                <p className="price">$15 / month</p>
                <ul>
                  <li>Maps with no ceiling</li>
                  <li>Every lens, and the Board</li>
                  <li>All four depths</li>
                  <li>Research across the whole map</li>
                  <li>Draft Space and your own material</li>
                  <li>As many lines of thinking as you keep</li>
                </ul>
              </div>
            </div>
            <p className="feat-b fade d2" style={{ marginTop: '22px' }}>
              When a free map reaches its edge it stops taking on new thinking —
              it does not disappear. Everything you built stays visible and
              editable. <a href="/one" style={{ color: '#4A6FA5', borderBottom: '1px solid rgba(74,111,165,.4)' }}>See everything One opens →</a>
            </p>
          </div>
        </section>

        {/* CLOSE */}
        <section className="spread close-l">
          <div className="wrap">
            <h2 className="fade">
              Think <span className="em">for yourself.</span>
            </h2>
            <p className="sub fade d1">
              Bring something you are actually stuck on. That is when it is
              worth anything.
            </p>
            <a className="cta-primary fade d2" href={OPEN}>
              Open Logos <span className="ar">→</span>
            </a>
            <div className="colophon">
              <span>Socria · Human-first AI</span>
              <span><a href="/chat">Socria chat</a></span>
              <span><a href="/one">Socria One</a></span>
              <span>© {new Date().getFullYear()}</span>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
