'use client';

// The Socria Logos page at /logos — ported from the design project's
// `Socria Logos.html` (the magazine.css system plus logos.css), markup and
// choreography intact.
//
// Logos itself is a MODEL, not a route: this page explains it, and the calls
// to action open the real thing at /chat?model=logos.
//
// The design's inline script becomes the one effect below — the same
// behaviours, with every observer, timer, listener and rAF loop torn down on
// unmount, and the html/body class toggles moved onto the root element the
// stylesheet is scoped to.

import { useEffect, useRef } from 'react';
import {
  DemoBoard,
  DemoControls,
  DemoGuard,
  DemoLenses,
  DemoMoves,
  DemoPersonality,
  DemoSplit,
} from './LogosDemo';

const OPEN = '/chat?model=logos';

export function LogosStory() {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const intervals: ReturnType<typeof setInterval>[] = [];
    const observers: IntersectionObserver[] = [];
    const bound: Array<[Element, string, EventListener]> = [];
    let raf = 0;

    // reveals on scroll
    const els = Array.from(root.querySelectorAll<HTMLElement>('.fade, .ink-mark, .io'));
    if (reduce || !('IntersectionObserver' in window)) {
      els.forEach((e) => e.classList.add('in'));
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
        { threshold: 0.15, rootMargin: '0px 0px -6% 0px' }
      );
      els.forEach((e) => io.observe(e));
      observers.push(io);
      // the design's self-heal: if something visible never revealed, stop animating
      timers.push(
        setTimeout(() => {
          const vh = innerHeight;
          const broken = els.some((el) => {
            const r = el.getBoundingClientRect();
            if (!(r.top < vh * 0.9 && r.bottom > 0)) return false;
            return !el.classList.contains('in') || getComputedStyle(el).opacity === '0';
          });
          if (broken) {
            root.classList.remove('js-anim');
            els.forEach((el) => {
              el.classList.add('in');
              el.style.transition = 'none';
              el.style.opacity = '1';
              el.style.transform = 'none';
            });
          }
        }, 1500)
      );
    }

    // cover: the brain draws stroke by stroke, then the type arrives in beats
    const coverEl = root.querySelector('.cover');
    if (coverEl) {
      if (reduce) coverEl.classList.add('intro', 'settled');
      else {
        requestAnimationFrame(() => coverEl.classList.add('intro'));
        timers.push(setTimeout(() => coverEl.classList.add('settled'), 3400));
      }
    }

    // four moves: the lit spoke cycles, and the definitions follow it
    const mvGroups = Array.from(root.querySelectorAll<SVGGElement>('.moves-viz g.mv'));
    const mvDefs = Array.from(root.querySelectorAll<HTMLElement>('#mv-defs .mv-def'));
    let mvI = 0;
    let mvHover = false;
    const lightMv = (i: number) => {
      mvGroups.forEach((g, k) => g.classList.toggle('lit', k === i));
      mvDefs.forEach((d, k) => d.classList.toggle('dim', k !== i));
    };
    if (mvGroups.length && !reduce) {
      lightMv(0);
      intervals.push(
        setInterval(() => {
          if (!mvHover) {
            mvI = (mvI + 1) % mvGroups.length;
            lightMv(mvI);
          }
        }, 1900)
      );
      // Listeners are kept in `bound` so the exact same function references
      // can be removed on unmount — re-creating them at cleanup would leak.
      [...mvGroups, ...mvDefs].forEach((el, idx) => {
        const k = idx % mvGroups.length;
        const onEnter = () => {
          mvHover = true;
          mvI = k;
          lightMv(k);
        };
        const onLeave = () => {
          mvHover = false;
        };
        el.addEventListener('pointerenter', onEnter);
        el.addEventListener('pointerleave', onLeave);
        bound.push([el, 'pointerenter', onEnter], [el, 'pointerleave', onLeave]);
      });
    }

    // spine + folio + masthead + dark contrast
    let vh = innerHeight;
    const doc = document.documentElement;
    const spineInk = root.querySelector<HTMLElement>('.spine .ink');
    const folio = root.querySelector<HTMLElement>('#folio');
    const masthead = root.querySelector<HTMLElement>('#masthead');
    const progress = root.querySelector<HTMLElement>('.progress');
    const spreads = Array.from(root.querySelectorAll<HTMLElement>('.spread'));
    const darkSec = root.querySelector<HTMLElement>('.close-sec');
    let lastY = -1;
    let lastNavY = 0;

    const update = (y: number) => {
      const docH = doc.scrollHeight - vh;
      const p = docH > 0 ? y / docH : 0;
      if (progress) progress.style.width = p * 100 + '%';
      if (spineInk) spineInk.style.height = p * 100 + '%';
      if (masthead) {
        masthead.classList.toggle('hidden', y > lastNavY && y > 260);
        lastNavY = y;
      }
      if (darkSec) {
        const r = darkSec.getBoundingClientRect();
        root.classList.toggle('on-dark', r.top <= 60 && r.bottom > 60);
      }
      let cur: HTMLElement | null = null;
      spreads.forEach((s) => {
        const sr = s.getBoundingClientRect();
        if (sr.top <= vh * 0.4 && sr.bottom > vh * 0.4) cur = s;
      });
      if (cur && folio) {
        const f = (cur as HTMLElement).getAttribute('data-folio');
        if (f && folio.textContent !== f) folio.textContent = f;
      }
    };
    const frame = () => {
      const y = scrollY || doc.scrollTop;
      if (y !== lastY) {
        lastY = y;
        update(y);
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    const onResize = () => {
      vh = innerHeight;
      lastY = -1;
    };
    addEventListener('resize', onResize, { passive: true });
    update(scrollY || 0);

    return () => {
      cancelAnimationFrame(raf);
      removeEventListener('resize', onResize);
      timers.forEach(clearTimeout);
      intervals.forEach(clearInterval);
      observers.forEach((o) => o.disconnect());
      bound.forEach(([el, type, fn]) => el.removeEventListener(type, fn));
    };
  }, []);

  return (
    <div className="lgx-root" ref={rootRef}>
      <div className="progress" aria-hidden="true"></div>

      <div className="spine" aria-hidden="true">
        <span className="ink"></span>
        <span className="folio" id="folio">Logos</span>
      </div>

      <header className="masthead" id="masthead">
        <div className="mh-left">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logos-mark.png" alt="" />
          <span className="name">Socria</span>
        </div>
        <div className="mh-center label">The reasoning environment</div>
        <div className="mh-right">
          <a href="/">The journal</a>
          <a href="/docs">Docs</a>
          <a href="/one">Socria One</a>
          <a href={OPEN} className="ask">Open Logos</a>
        </div>
      </header>

      <main id="top">

        {/* COVER */}
        <section className="spread cover" data-folio="Logos" data-screen-label="Cover">
          <div className="issue label moss seq s1">Socria · Logos · MMXXVI</div>
          <div className="brainmark" aria-hidden="true">
            <svg viewBox="0 0 120 130">
              <path style={{ '--d': '.05s' } as React.CSSProperties} d="M36,24 C42,17 50,13 57,11" />
              <path style={{ '--d': '.5s' } as React.CSSProperties} d="M63,11 C70,13 78,17 84,24" />
              <path style={{ '--d': '.15s' } as React.CSSProperties} d="M24,44 C27,36 31,30 34,27" />
              <path style={{ '--d': '.6s' } as React.CSSProperties} d="M86,27 C89,30 93,36 96,44" />
              <path style={{ '--d': '.25s' } as React.CSSProperties} d="M20,64 C20,56 21,50 23,48" />
              <path style={{ '--d': '.7s' } as React.CSSProperties} d="M97,48 C99,50 100,56 100,64" />
              <path style={{ '--d': '.35s' } as React.CSSProperties} d="M24,84 C22,78 21,73 21,69" />
              <path style={{ '--d': '.8s' } as React.CSSProperties} d="M99,69 C99,73 98,78 96,84" />
              <path style={{ '--d': '.45s' } as React.CSSProperties} d="M34,100 C30,96 27,92 26,88" />
              <path style={{ '--d': '.9s' } as React.CSSProperties} d="M94,88 C93,92 90,96 86,100" />
              <path style={{ '--d': '.55s' } as React.CSSProperties} d="M46,110 C42,108 38,105 36,103" />
              <path style={{ '--d': '1s' } as React.CSSProperties} d="M84,103 C82,105 78,108 74,110" />
              <path style={{ '--d': '.65s' } as React.CSSProperties} d="M50,113 C53,114 55,115 57,115" />
              <path style={{ '--d': '1.05s' } as React.CSSProperties} d="M63,115 C65,115 67,114 70,113" />
              <path style={{ '--d': '.2s' } as React.CSSProperties} d="M60,16 L60,44" />
              <path style={{ '--d': '.55s' } as React.CSSProperties} d="M60,52 L60,78" />
              <path style={{ '--d': '.9s' } as React.CSSProperties} d="M60,86 L60,112" />
              <path style={{ '--d': '.4s' } as React.CSSProperties} d="M44,34 L54,48" />
              <path style={{ '--d': '.75s' } as React.CSSProperties} d="M76,34 L66,48" />
              <path style={{ '--d': '.5s' } as React.CSSProperties} d="M36,52 L48,64 L48,74" />
              <path style={{ '--d': '.85s' } as React.CSSProperties} d="M84,52 L72,64 L72,74" />
              <path style={{ '--d': '.6s' } as React.CSSProperties} d="M38,86 L48,76" />
              <path style={{ '--d': '.95s' } as React.CSSProperties} d="M82,86 L72,76" />
            </svg>
          </div>
          <h1 className="lg-name seq s2">Watch yourself <span className="em">think.</span></h1>
          <p className="standfirst seq s3">Logos is Socria's reasoning environment. You talk — and beside the conversation, a map of your thinking draws itself: the claims you're making, the assumptions underneath, the tensions you haven't resolved. And it reorganizes as you think.</p>
          <div className="cover-cta seq s4">
            <a className="cta-primary" href="#demo">Watch it think <span className="ar">→</span></a>
            <a className="cta-secondary" href="#s1">or read the ten movements</a>
          </div>
        </section>

        {/* DEMONSTRATION */}
        <section className="spread demo short" id="demo" data-folio="·" data-screen-label="A Demonstration">
          <div className="wrap">
            <div className="spread-head"><span className="num">·</span><span className="label">A Demonstration</span></div>
            <p className="intro-line fade">Someone asks a real question. Watch what Logos does with it —</p>
            <DemoSplit />
          </div>
        </section>

        {/* I · THE THINKING MAP */}
        <section className="spread sec short" id="s1" data-folio="I" data-screen-label="The Thinking Map">
          <div className="wrap">
            <div className="spread-head"><span className="num">I.</span><span className="label">The Thinking Map</span></div>
            <h2 className="fade">Every message is read twice.</h2>
            <p className="body fade d1">Once to answer you — and once to map you. Each thing you say is quietly parsed for the <em>claims</em> it makes, the <em>assumptions</em> it rests on, and the <em>tensions</em> it leaves open. The map is the second reading, made visible.</p>
            <div className="exh twin fade d2">
              <div className="half">
                <span className="rd">Read once — to answer</span>
                <p className="msg">“I think I should take the job. It pays more, and honestly I've stopped growing here.”</p>
                <p className="res">Logos replies the way a thoughtful interlocutor would — <em>with the question that cuts deeper.</em></p>
              </div>
              <div className="half">
                <span className="rd">Read twice — to map</span>
                <svg viewBox="0 0 200 120" aria-hidden="true">
                  <path className="p" d="M24,60 L88,26 M24,60 L88,94 M96,26 L164,44" />
                  <circle className="c" cx="20" cy="60" r="6" /><circle className="c" cx="92" cy="26" r="5" /><circle className="c" cx="92" cy="94" r="5" /><circle className="c" cx="168" cy="45" r="5" />
                </svg>
                <p className="res">Two claims. One unexamined assumption. One live tension — <em>drawn, not buried in prose.</em></p>
              </div>
            </div>
          </div>
        </section>

        {/* II · FOUR LENSES */}
        <section className="spread sec short" data-folio="II" data-screen-label="Four Lenses">
          <div className="wrap">
            <div className="spread-head"><span className="num">II.</span><span className="label">Four Lenses</span></div>
            <h2 className="fade">One map, four ways of seeing it.</h2>
            <div className="fade d1"><DemoLenses /></div>
          </div>
        </section>

        {/* III · FOUR MOVES */}
        <section className="spread sec short" data-folio="III" data-screen-label="Four Moves">
          <div className="wrap">
            <div className="spread-head"><span className="num">III.</span><span className="label">Four Moves</span></div>
            <h2 className="fade">Any node, four moves.</h2>
            {/* The demo is a two-pane exhibit — node and result — so it takes
                the spread's full width rather than the old diagram column. */}
            <div className="fade"><DemoMoves /></div>
            <div className="exh moves-defs">
              <div className="mv-defs fade d1" id="mv-defs">
                <div className="mv-def"><span className="w">Explore</span><p>Open the thought further — what's inside it that you haven't said yet?</p></div>
                <div className="mv-def"><span className="w">Challenge</span><p>Logos argues the other side, properly — the strongest version of it.</p></div>
                <div className="mv-def"><span className="w">Research</span><p>Send the node out into the world and bring real sources back to it.</p></div>
                <div className="mv-def"><span className="w">Trace</span><p>Walk backward: what does this claim rest on, and does the chain hold?</p></div>
              </div>
            </div>
          </div>
        </section>

        {/* IV · MATHEMATICS */}
        <section className="spread sec short" data-folio="IV" data-screen-label="Mathematics">
          <div className="wrap">
            <div className="spread-head"><span className="num">IV.</span><span className="label">Mathematics</span></div>
            <h2 className="fade">It finds the first wrong step.</h2>
            <p className="body fade d1">Notation renders as you write it. And when you ask Logos to check your work, it doesn't replace your solution with a clean one — it walks your steps and points at <em>the exact place the reasoning broke.</em></p>
            <div className="exh mathx io fade d2">
              <div className="worked">
                <span className="st"><span className="no">1</span>3(x + 4) = 27</span>
                <span className="st"><span className="no">2</span>3x + 12 = 27</span>
                <span className="st wrong"><span className="no">3</span>3x = 39<svg className="ring" viewBox="0 0 100 40" preserveAspectRatio="none"><path d="M8,20 C6,8 30,3 52,4 C79,5 96,10 95,21 C94,33 69,38 45,37 C23,36 7,31 9,22" /></svg></span>
                <span className="st"><span className="no">4</span>x = 13</span>
              </div>
              <p className="math-note">“Step three — what is 27 − 12?”<span className="sm">Your working stays yours. The error is named; the repair is you.</span></p>
            </div>
          </div>
        </section>

        {/* V · THE BOARD */}
        <section className="spread sec short" data-folio="V" data-screen-label="The Board">
          <div className="wrap">
            <div className="spread-head"><span className="num">V.</span><span className="label">The Board</span></div>
            <h2 className="fade">A chalkboard, not a chatbox.</h2>
            <p className="body fade d1">The Board is scratch-space: serif equations, handwritten working, arrows where arrows help. Mistakes aren't erased — they're <em>struck through with the fix beside them</em>, the way real thinking looks.</p>
            <p className="board-cap fade">Struck, corrected, kept — the record of a mind at work</p>
            <DemoBoard />
          </div>
        </section>

        {/* VI · THE ANSWER GUARD */}
        <section className="spread sec short" data-folio="VI" data-screen-label="The Answer Guard">
          <div className="wrap">
            <div className="spread-head"><span className="num">VI.</span><span className="label">The Answer Guard</span></div>
            <h2 className="fade">While you're learning, it will not hand you the answer.</h2>
            <p className="body fade d1">Ask it to. It declines — kindly — and guides instead. And the guard holds across every surface at once: the chat, the map, the Board. <em>Nothing leaks the answer</em> from around the side.</p>
            <DemoGuard />
          </div>
        </section>

        {/* VII · DEPTH */}
        <section className="spread sec short" data-folio="VII" data-screen-label="Depth">
          <div className="wrap">
            <div className="spread-head"><span className="num">VII.</span><span className="label">Depth</span></div>
            <h2 className="fade">How far the thinking goes — never how fast the answer arrives.</h2>
            {/* Same treatment as the moves: the control and its result are a
                two-pane exhibit, so it takes the spread's full width and the
                written registers sit underneath it. */}
            <div className="fade"><DemoControls /></div>
            <div className="exh moves-defs">
              <div className="mv-defs depth-defs fade d1">
                <div className="mv-def"><span className="w">Quick</span><p>A gut-check in plain words, when that's all the moment needs.</p></div>
                <div className="mv-def"><span className="w">Balanced</span><p>The everyday register — a thoughtful mentor, keeping your pace.</p></div>
                <div className="mv-def"><span className="w">Deep</span><p>Slow, rigorous, pattern-spotting. For questions that have earned it.</p></div>
                <div className="mv-def"><span className="w">Abstract</span><p>The furthest register — principles, structures, first causes.</p></div>
              </div>
            </div>
          </div>
        </section>

        {/* VIII · PERSONALITY */}
        <section className="spread sec short" data-folio="VIII" data-screen-label="Personality">
          <div className="wrap">
            <div className="spread-head"><span className="num">VIII.</span><span className="label">Personality</span></div>
            <h2 className="fade">Nine settings for how it talks. Zero for what it decides.</h2>
            <DemoPersonality />
            <p className="own-words fade d2">…and instructions in your own words: <span className="q">“be blunt, skip the jargon, and never flatter me.”</span></p>
          </div>
        </section>

        {/* IX · DRAFT SPACE */}
        <section className="spread sec short" data-folio="IX" data-screen-label="Draft Space">
          <div className="wrap">
            <div className="spread-head"><span className="num">IX.</span><span className="label">Draft Space</span></div>
            <h2 className="fade">Write beside your map.</h2>
            <p className="body fade d1">When the thinking is ready to become an essay, a decision memo, a plan — Draft Space opens beside the map. Your argument on one side, its skeleton on the other. <em>Nothing is written for you.</em></p>
            <div className="exh draftx fade d2">
              <div className="side">
                <span className="rd">Your draft</span>
                <p className="draft-lines">The case for leaving isn't the salary — <span className="cw"></span><br /><span className="faint">it's the part of me that stopped</span><br /><span className="faint">asking questions at this desk.</span></p>
              </div>
              <div className="side">
                <span className="rd">Your map, beside it</span>
                <div className="mini-map" aria-hidden="true">
                  <svg viewBox="0 0 220 130">
                    <path className="p" d="M28,65 L96,28 M28,65 L96,100 M104,28 L178,50" />
                    <circle className="c" cx="24" cy="65" r="6" /><circle className="c" cx="100" cy="28" r="5" /><circle className="c" cx="100" cy="100" r="5" /><circle className="c" cx="182" cy="51" r="5" />
                  </svg>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* X · YOUR OWN MATERIAL */}
        <section className="spread sec short" data-folio="X" data-screen-label="Your Own Material">
          <div className="wrap">
            <div className="spread-head"><span className="num">X.</span><span className="label">Your Own Material</span></div>
            <h2 className="fade">Bring what you're actually working with.</h2>
            <div className="exh mat fade d1">
              <div className="m"><svg viewBox="0 0 40 40"><path className="p" d="M13,6 H27 M11,10 H29 V34 H11 Z M16,18 H24 M16,24 H24" /></svg><h3>Paste it</h3><p>Long-form text, a contract, your own notes — dropped straight into the thinking.</p></div>
              <div className="m"><svg viewBox="0 0 40 40"><path className="p" d="M20,26 V8 M13,15 L20,8 L27,15 M8,26 V32 H32 V26" /></svg><h3>Upload it</h3><p>Documents and images, read alongside the conversation — multimodal when available.</p></div>
              <div className="m"><svg viewBox="0 0 40 40"><path className="p" d="M20,6 A14,14 0 1,0 20,34 A14,14 0 1,0 20,6 M6,20 H34 M20,6 C14,14 14,26 20,34 C26,26 26,14 20,6" /></svg><h3>Send it out</h3><p>Research reaches the live web and brings sources back to the node that asked.</p></div>
            </div>
            <p className="aside fade d2">All of it is read as context. None of it is treated as authority.</p>
          </div>
        </section>

        {/* THE LINE */}
        <section className="spread sec vowx short" data-folio="Line" data-screen-label="The Line">
          <div className="wrap">
            <div className="spread-head"><span className="num">·</span><span className="label">The Line It Won't Cross</span></div>
            <h2 className="fade">A precise division of labor.</h2>
            <div className="v-grid fade d1">
              <p><span className="k">Logos contributes</span>Structure. Questions. Research. <span className="b">Critique.</span></p>
              <p><span className="k">You keep</span>Intent. Authorship. Judgment. <span className="b">The conclusion.</span></p>
            </div>
          </div>
        </section>

        {/* THE TERMS */}
        <section className="spread sec terms short" data-folio="Terms" data-screen-label="The Terms">
          <div className="wrap">
            <div className="spread-head"><span className="num">·</span><span className="label">The Terms</span></div>
            <h2 className="fade">Free is a beginning, not a demo.</h2>
            <div className="t-grid">
              <div className="tier fade">
                <h3>Logos, free</h3>
                <p className="tp">Every day · no card</p>
                <ul>
                  <li>Real Thinking Maps — drawn live, fully yours.</li>
                  <li>Every move on every node — and Trace is free forever.</li>
                  <li>Research — experienced properly, once per map.</li>
                  <li>The Answer Guard, whole. It is never for sale.</li>
                </ul>
                <p className="stoprow"><span className="o"></span>Free pauses at four branches<span className="sep">·</span><span className="f"></span>One branches without end</p>
                <p className="stoprow"><span className="o"></span>Free researches once<span className="sep">·</span><span className="f"></span>One researches without asking twice</p>
              </div>
              <div className="tier one fade d1">
                <h3>Socria <span className="em">One</span></h3>
                <p className="tp">$15 / month · cancel anytime</p>
                <ul>
                  <li>The full map — unbounded branching, every view.</li>
                  <li>Research across the whole map, as often as it calls.</li>
                  <li>All four depths — Quick, Balanced, Deep, Abstract.</li>
                  <li>Draft Space in full, long-form, multimodal.</li>
                  <li>Persistent reasoning, personalization, connected sources.</li>
                </ul>
                <a className="t-cta" href="/one">Continue with One <span className="ar">→</span></a>
                <br /><a className="t-more" href="/one">Read the One issue →</a>
              </div>
            </div>
            <p className="t-vow fade">And the vow holds at every tier: what you've made is yours. Nothing you build is ever taken back.</p>
          </div>
        </section>

        {/* CLOSE */}
        <section className="spread close-sec" id="begin" data-folio="Fin" data-screen-label="Close">
          <div className="wrap">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="cl-mark fade" src="/logos-mark.png" alt="" />
            <h2 className="fade d1">Think For <span className="em">Yourself.</span></h2>
            <p className="invite fade d2">Bring a question you've been carrying. Watch your own thinking take shape.</p>
            <div className="cta-row fade d3">
              <a className="cta-go" href={OPEN}>Open Logos <span className="ar">→</span></a>
              <a className="cta-quiet" href="/one">or continue with One</a>
            </div>
            <div className="colophon">
              <span>Socria · Human-first AI</span>
              <span><a href="/">The journal</a></span>
              <span><a href="/docs">The docs</a></span>
              <span><a href="/one">Socria One</a></span>
              <span className="it">Think For Yourself.</span>
              <span>© <span>2026</span></span>
            </div>
          </div>
        </section>

      </main>
    </div>
  );
}
