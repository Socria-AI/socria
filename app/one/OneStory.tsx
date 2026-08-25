'use client';

// Socria One — the editorial page, ported from the design project's
// `Socria One.html` (magazine.css system + the page's own spreads).
//
// The design's structure and choreography are kept verbatim: the cover opens
// Socria green, a ring draws around the monogram, blue ink blooms from it,
// type arrives in beats, dust settles; the ledger cascades chapter by chapter;
// the boundary spread deepens from paper into Prussian blue as you scroll.
//
// What changed in the port is only what a live page needs: html/body class
// toggles become classes on the root element, and every "become a member"
// CTA actually opens Stripe Checkout ("continue with the free tier" goes to
// Logos). If checkout says sign in first, we go to sign-in and come back.

import { useCallback, useEffect, useRef, useState } from 'react';

// Dust motes on the cover — positions and drift straight from the design.
const DUST: Array<[string, string, string, string, string, string]> = [
  ['8%', '18%', '24s', '4.2s', '22px', '-30px'],
  ['22%', '64%', '30s', '5.6s', '-18px', '-22px'],
  ['34%', '30%', '27s', '4.8s', '14px', '26px'],
  ['47%', '76%', '33s', '6.4s', '-24px', '-18px'],
  ['58%', '14%', '26s', '5.1s', '18px', '24px'],
  ['66%', '52%', '29s', '4.4s', '-16px', '-28px'],
  ['76%', '28%', '31s', '5.9s', '20px', '20px'],
  ['84%', '68%', '25s', '4.6s', '-22px', '-24px'],
  ['14%', '44%', '28s', '6.1s', '16px', '-20px'],
  ['91%', '40%', '32s', '5.3s', '-14px', '26px'],
];

// The ledger's inline glyphs, one per family of lines.
function GlBranch() {
  return (
    <span className="gl">
      <svg viewBox="0 0 18 18">
        <path d="M3,15 L9,9 M9,9 L5,3 M9,9 L15,4" />
        <circle cx="3" cy="15" r="1.4" />
        <circle cx="5" cy="3" r="1.4" />
        <circle cx="15" cy="4" r="1.4" />
      </svg>
    </span>
  );
}
function GlCircle() {
  return (
    <span className="gl">
      <svg viewBox="0 0 18 18">
        <circle cx="9" cy="9" r="6.5" />
      </svg>
    </span>
  );
}
function GlQuill() {
  return (
    <span className="gl">
      <svg viewBox="0 0 18 18">
        <path d="M14,3 C10,5 6,9 4,14 M4,14 L3,15 M4,14 L8,13" />
      </svg>
    </span>
  );
}
function GlThread() {
  return (
    <span className="gl">
      <svg viewBox="0 0 18 18">
        <path d="M2,12 C5,8 8,14 11,10 C13,7 15,8 16,6" />
        <circle cx="2" cy="12" r="1.4" />
        <circle cx="16" cy="6" r="1.4" />
      </svg>
    </span>
  );
}
function GlSearch() {
  return (
    <span className="gl">
      <svg viewBox="0 0 18 18">
        <circle cx="8" cy="8" r="5" />
        <path d="M12,12 L16,16" />
      </svg>
    </span>
  );
}
function GlLink() {
  return (
    <span className="gl">
      <svg viewBox="0 0 18 18">
        <circle cx="6" cy="9" r="4" />
        <circle cx="12" cy="9" r="4" />
      </svg>
    </span>
  );
}

export function OneStory() {
  const rootRef = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  // Already a member: the invitations become doors back into Logos.
  const [member, setMember] = useState(false);

  useEffect(() => {
    fetch('/api/logos/plan')
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (j?.plan === 'one') setMember(true);
      })
      .catch(() => {});
  }, []);

  /** Every "become a member" CTA lands here. */
  const subscribe = useCallback(async () => {
    if (member) {
      window.location.href = '/chat?model=logos';
      return;
    }
    if (busy) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch('/api/stripe/checkout', { method: 'POST' });
      if (res.status === 401) {
        // Sign in, then come straight back to this page.
        window.location.href = '/sign-in?redirect_url=' + encodeURIComponent('/one');
        return;
      }
      const json = await res.json().catch(() => null);
      if (res.ok && json?.url) {
        window.location.href = json.url;
        return;
      }
      setErr(json?.error ?? 'Checkout could not be reached just now.');
    } catch {
      setErr('Checkout could not be reached just now.');
    }
    setBusy(false);
  }, [busy, member]);

  // ── the design's choreography, verbatim but on the root element ────
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const observers: IntersectionObserver[] = [];
    let raf = 0;

    // fades
    const els = Array.from(root.querySelectorAll<HTMLElement>('.fade'));
    if (reduce || !('IntersectionObserver' in window)) {
      els.forEach((e) => e.classList.add('in'));
    } else {
      root.classList.add('js-anim');
      const io = new IntersectionObserver(
        (en) => {
          en.forEach((e) => {
            if (e.isIntersecting) {
              e.target.classList.add('in');
              io.unobserve(e.target);
            }
          });
        },
        { threshold: 0.15, rootMargin: '0px 0px -6% 0px' }
      );
      els.forEach((e) => io.observe(e));
      observers.push(io);
      // the design's self-heal: if something visible never faded in, stop animating
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

    // opening: ring draws over green → ink blooms → type beats → dust settles
    const coverEl = root.querySelector('.cover');
    if (coverEl) {
      if (reduce) coverEl.classList.add('intro', 'bloomed', 'settled');
      else {
        requestAnimationFrame(() => coverEl.classList.add('intro'));
        timers.push(setTimeout(() => coverEl.classList.add('bloomed'), 1150));
        timers.push(setTimeout(() => coverEl.classList.add('settled'), 4600));
      }
    }

    // animated map
    const mapviz = root.querySelector('#mapviz');
    if (mapviz) {
      if (reduce) mapviz.classList.add('map-on');
      else {
        const mio = new IntersectionObserver(
          (en) => {
            en.forEach((e) => {
              if (e.isIntersecting) {
                mapviz.classList.add('map-on');
                mio.disconnect();
              }
            });
          },
          { threshold: 0.4 }
        );
        mio.observe(mapviz);
        observers.push(mio);
        timers.push(
          setTimeout(() => {
            const r = mapviz.getBoundingClientRect();
            if (r.top < innerHeight && r.bottom > 0) mapviz.classList.add('map-on');
          }, 2500)
        );
      }
    }

    // spine + folio + masthead + scroll-scrubbed deepening + dark contrast
    let vh = innerHeight;
    const doc = document.documentElement;
    const spineInk = root.querySelector<HTMLElement>('.spine .ink');
    const folio = root.querySelector<HTMLElement>('#folio');
    const masthead = root.querySelector<HTMLElement>('#masthead');
    const progress = root.querySelector<HTMLElement>('.progress');
    const spreads = Array.from(root.querySelectorAll<HTMLElement>('.spread'));
    const dark = root.querySelector<HTMLElement>('.invite-sec');
    const cover = root.querySelector<HTMLElement>('.cover');
    const boundary = root.querySelector<HTMLElement>('.boundary');
    const bgDeep = root.querySelector<HTMLElement>('#bg-deep');
    let lastY = -1;
    let lastNavY = 0;

    function update(y: number) {
      const docH = doc.scrollHeight - vh;
      const p = docH > 0 ? y / docH : 0;
      if (progress) progress.style.width = p * 100 + '%';
      if (spineInk) spineInk.style.height = p * 100 + '%';
      if (masthead) {
        masthead.classList.toggle('hidden', y > lastNavY && y > 260);
        lastNavY = y;
      }
      // paper → blue across the boundary spread
      let op = 0;
      if (boundary) {
        const br = boundary.getBoundingClientRect();
        op = Math.max(0, Math.min(1, (vh * 0.6 - br.top) / (br.height * 0.75)));
      }
      if (dark) {
        const ir = dark.getBoundingClientRect();
        if (ir.top < vh) op = 1;
      }
      if (bgDeep) bgDeep.style.opacity = String(op);
      root!.classList.toggle('deepened', op > 0.45);
      if (dark && cover && boundary) {
        const r = dark.getBoundingClientRect();
        const cr = cover.getBoundingClientRect();
        const br = boundary.getBoundingClientRect();
        root!.classList.toggle(
          'on-dark',
          (r.top <= 60 && r.bottom > 60) ||
            (cr.top <= 60 && cr.bottom > 60) ||
            (op > 0.45 && br.top <= 60 && br.bottom > 60)
        );
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
    }

    function frame() {
      const y = scrollY || doc.scrollTop;
      if (y !== lastY) {
        lastY = y;
        update(y);
      }
      raf = requestAnimationFrame(frame);
    }
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
      observers.forEach((o) => o.disconnect());
    };
  }, []);

  const memberCta = (fallback: string) => (member ? 'Open Logos' : fallback);

  return (
    <div className="one-root" ref={rootRef}>
      <div className="bg-deep" id="bg-deep" aria-hidden="true" />
      <div className="progress" aria-hidden="true" />

      <div className="spine" aria-hidden="true">
        <span className="ink" />
        <span className="folio" id="folio">One</span>
      </div>

      <header className="masthead" id="masthead">
        <div className="mh-left">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/socria-logo.png" alt="" />
          <span className="name">Socria</span>
        </div>
        <div className="mh-center label">The complete reasoning environment</div>
        <div className="mh-right">
          <a href="/chat?model=logos">Logos</a>
          <a href="#invitation" className="ask">Begin with One</a>
        </div>
      </header>

      <main id="top">
        {/* COVER */}
        <section className="spread cover" data-folio="One">
          <div className="flood" aria-hidden="true" />
          <div className="flood-mist" aria-hidden="true" />
          <div className="dust" aria-hidden="true">
            {DUST.map(([left, top, dd, dt, dx, dy], i) => (
              <span
                key={i}
                style={{ left, top, '--dd': dd, '--dt': dt, '--dx': dx, '--dy': dy } as React.CSSProperties}
              />
            ))}
          </div>
          <div className="issue label moss seq s-issue">Socria · An Invitation · MMXXVI</div>
          <div className="monogram">
            <svg className="ring" viewBox="0 0 100 100" aria-hidden="true">
              <circle cx="50" cy="50" r="48" />
            </svg>
            <span className="i">I</span>
          </div>
          <h1>
            <span className="seq s-name">Socria</span>{' '}
            <span className="one seq s-one">One</span>
          </h1>
          <div className="price seq s-price">
            <span className="amt">$15</span>
            <span className="per">/ month</span>
          </div>
          <p className="standfirst seq s-stand">Everything Socria does, without the ceiling.</p>
          <div className="cover-cta seq s-cta">
            <button type="button" className="cta-primary" onClick={subscribe} disabled={busy}>
              {busy ? 'Opening checkout…' : memberCta('Continue with One')} <span className="ar">→</span>
            </button>
            <a className="cta-secondary" href="#opens">or see what opens</a>
          </div>
        </section>

        {/* THE IDEA */}
        <section className="spread pos" data-folio="·">
          <div className="wrap narrow">
            <div className="spread-head"><span className="num">·</span><span className="label">The Idea</span></div>
            <p className="big fade">
              One isn&rsquo;t more AI. It&rsquo;s the <em>complete reasoning environment</em> — the
              full map, the full depth, the full continuity of your own thinking.
            </p>
            <p className="body fade d1">
              The free tier is a genuine beginning: real Thinking Maps, real Research, nothing
              crippled. One removes the ceiling — so a line of thought can branch as far, run as
              deep, and return as often as it deserves.
            </p>
          </div>
        </section>

        {/* I · WHAT OPENS */}
        <section className="spread ledger" id="opens" data-folio="I">
          <div className="wrap">
            <div className="spread-head"><span className="num">I.</span><span className="label">What Opens</span></div>
            <h2 className="fade">The whole instrument, in your hands.</h2>
            <div style={{ marginTop: 'clamp(30px,5vh,50px)' }}>
              <div className="chapter fade">
                <div className="ch-side">
                  <div className="ch-t"><span className="rn">i</span><span className="tt">The Map</span></div>
                  <span className="seal"><span className="sr">I</span>Included with One</span>
                </div>
                <div className="ch-list">
                  <ul>
                    <li><GlBranch />Members think on full, <em>extended Thinking Maps</em> — no boundary on how far a thought can grow.</li>
                    <li><GlBranch />Branch every line of inquiry as far as it deserves to go.</li>
                    <li><GlBranch />See it every way it can be seen: <em>Structure, Graph, and Board.</em></li>
                  </ul>
                  <p className="payoff">— so a thought can grow to its real size.</p>
                  <p className="stoprow"><span className="o" />Free pauses at four branches<span className="sep">·</span><span className="f" />One branches without end</p>
                </div>
                <div className="mini" aria-hidden="true">
                  <svg viewBox="0 0 120 120">
                    <path className="mp" d="M60,64 L30,36 M60,64 L92,40 M60,64 L36,96 M60,64 L88,92" />
                    <circle className="mc" cx="60" cy="64" r="5" /><circle className="mc" cx="30" cy="36" r="3" />
                    <circle className="mc" cx="92" cy="40" r="3" /><circle className="mc" cx="36" cy="96" r="3" />
                    <circle className="mc" cx="88" cy="92" r="3" /><circle className="mg" cx="60" cy="18" r="6" />
                  </svg>
                </div>
              </div>
              <div className="chapter fade">
                <div className="ch-side">
                  <div className="ch-t"><span className="rn">ii</span><span className="tt">The Depth</span></div>
                  <span className="seal"><span className="sr">I</span>Included with One</span>
                </div>
                <div className="ch-list">
                  <ul>
                    <li><GlCircle />All four depth modes, at will: <em>Quick, Balanced, Deep, Abstract.</em></li>
                    <li><GlCircle />Run full <em>Research across the map</em> — whenever the question calls, as often as it calls.</li>
                    <li><GlCircle />More Logos conversations, at the pace your thinking sets.</li>
                  </ul>
                  <p className="payoff">— so no question has to stay shallow.</p>
                  <p className="stoprow"><span className="o" />Free tastes Research once<span className="sep">·</span><span className="f" />One researches without asking twice</p>
                </div>
                <div className="mini" aria-hidden="true">
                  <svg viewBox="0 0 120 120">
                    <circle className="mp" cx="60" cy="60" r="46" /><circle className="mp" cx="60" cy="60" r="32" />
                    <circle className="mp" cx="60" cy="60" r="19" /><circle className="mc" cx="60" cy="60" r="6" />
                  </svg>
                </div>
              </div>
              <div className="chapter fade">
                <div className="ch-side">
                  <div className="ch-t"><span className="rn">iii</span><span className="tt">The Craft</span></div>
                  <span className="seal"><span className="sr">I</span>Included with One</span>
                </div>
                <div className="ch-list">
                  <ul>
                    <li><GlQuill /><em>Draft Space</em> — a studio for advanced writing and creative work.</li>
                    <li><GlQuill />Bring real material: long-form and pasted-content workflows.</li>
                    <li><GlQuill />Images and multimodal reasoning <span className="when">— when available.</span></li>
                  </ul>
                  <p className="payoff">— so the thinking becomes the work.</p>
                  <p className="stoprow"><span className="o" />Free drafts in fragments<span className="sep">·</span><span className="f" />One opens the full Draft Space</p>
                </div>
                <div className="mini" aria-hidden="true">
                  <svg viewBox="0 0 120 120">
                    <rect className="mp" x="28" y="20" width="64" height="80" />
                    <path className="mp" d="M38,38 H82 M38,50 H82 M38,62 H70 M38,74 H78" />
                    <path className="mp mq" d="M86,84 C74,88 62,96 56,106" />
                  </svg>
                </div>
              </div>
              <div className="chapter fade">
                <div className="ch-side">
                  <div className="ch-t"><span className="rn">iv</span><span className="tt">The Continuity</span></div>
                  <span className="seal"><span className="sr">I</span>Included with One</span>
                </div>
                <div className="ch-list">
                  <ul>
                    <li><GlThread /><em>Persistent reasoning</em> and history — every map, every thread, kept.</li>
                    <li><GlThread />Personalization that learns <em>how you reason</em>, not just what you ask.</li>
                    <li><GlThread />Connected sources — Google Drive, Docs, Notion <span className="when">— when available.</span></li>
                  </ul>
                  <p className="payoff">— so nothing you build is ever lost.</p>
                  <p className="stoprow"><span className="o" />Free forgets between visits<span className="sep">·</span><span className="f" />One keeps every thread</p>
                </div>
                <div className="mini" aria-hidden="true">
                  <svg viewBox="0 0 120 120">
                    <path className="mp" d="M14,84 C34,60 50,96 66,66 C78,44 96,52 108,34" />
                    <circle className="mc" cx="14" cy="84" r="4" /><circle className="mc" cx="64" cy="68" r="4" />
                    <circle className="mc" cx="108" cy="34" r="4" />
                  </svg>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* JOIN BAND */}
        <section className="join">
          <div className="wrap">
            <p className="j-line fade">The whole instrument — <span className="j-price">$15 a month.</span></p>
            <div className="j-row fade d1">
              <button type="button" className="j-cta" onClick={subscribe} disabled={busy}>
                {busy ? 'Opening checkout…' : memberCta('Become a member of One')} <span className="ar">→</span>
              </button>
              <span className="j-note">Cancel anytime. Your maps remain yours, at every tier.</span>
            </div>
          </div>
        </section>

        {/* II · THE BOUNDARY */}
        <section className="spread boundary" data-folio="II">
          <div className="wrap">
            <div className="spread-head"><span className="num">II.</span><span className="label">The Boundary, Kept Gracefully</span></div>
            <h2 className="fade">A limit should end the asking — never the thinking.</h2>
            <p className="intro fade d1">
              When a free map reaches its natural edge, nothing is taken away. The map stays whole,
              visible, and yours to work with. One simply lets it keep growing.
            </p>
            <div className="artifacts">
              <div className="fade d1">
                <div className="mapviz" id="mapviz" role="img" aria-label="A Thinking Map growing to its free edge">
                  <svg viewBox="0 0 440 300">
                    <path className="ln l1" d="M220,150 C180,130 130,110 96,84" />
                    <path className="ln l2" d="M220,150 C265,128 310,112 348,92" />
                    <path className="ln l3" d="M220,150 C180,178 140,204 104,232" />
                    <path className="ln l4" d="M220,150 C262,176 300,198 338,224" />
                    <g className="nd root"><circle cx="220" cy="150" r="7" /><text x="220" y="178" textAnchor="middle">the question</text></g>
                    <g className="nd n1"><circle cx="96" cy="84" r="5" /><text x="96" y="66" textAnchor="middle">what I assume</text></g>
                    <g className="nd n2"><circle cx="348" cy="92" r="5" /><text x="348" y="74" textAnchor="middle">what it costs</text></g>
                    <g className="nd n3"><circle cx="104" cy="232" r="5" /><text x="104" y="260" textAnchor="middle">what I want</text></g>
                    <g className="nd n4"><circle cx="338" cy="224" r="5" /><text x="338" y="252" textAnchor="middle">what I fear</text></g>
                    <g className="nd ghost"><circle cx="220" cy="44" r="11" /><text x="220" y="49" textAnchor="middle">I</text></g>
                  </svg>
                </div>
                <div className="limit-card">
                  <div className="lc-mono"><span>I</span></div>
                  <h3>Your free Thinking Map has reached its limit.</h3>
                  <p className="lc-body">
                    Everything you&rsquo;ve built here remains yours — fully visible, fully
                    interactive. <em>Socria One</em> lets this map keep developing: new branches,
                    deeper research, further questions.
                  </p>
                  <div className="lc-row">
                    <button type="button" className="lc-cta" onClick={subscribe} disabled={busy}>
                      {memberCta('Continue with One')} →
                    </button>
                    <a className="lc-dismiss" href="/chat?model=logos">keep working with what I have</a>
                  </div>
                  <p className="lc-note">Your map is never deleted, hidden, or held back.</p>
                </div>
                <p className="art-cap">The moment a map reaches its free edge</p>
              </div>
              <div className="chips fade d2">
                <div className="chip-demo">
                  <div className="feat"><div className="f-t">Deep research</div><div className="f-s">Run research across the whole map</div></div>
                  <span className="one-chip"><span className="ring">I</span>One</span>
                </div>
                <div className="chip-demo">
                  <div className="feat"><div className="f-t">Abstract depth</div><div className="f-s">The furthest register of thought</div></div>
                  <span className="one-chip"><span className="ring">I</span>One</span>
                </div>
                <div className="chip-demo">
                  <div className="feat"><div className="f-t">Draft Space</div><div className="f-s">Advanced writing &amp; creative support</div></div>
                  <span className="one-chip"><span className="ring">I</span>One</span>
                </div>
                <p className="art-cap">A quiet mark where One begins — never an interruption</p>
              </div>
            </div>
            <p className="vow fade">
              We will never hold your thinking hostage. What you&rsquo;ve made is yours, at every
              tier, always.
            </p>
          </div>
        </section>

        {/* III · THE INVITATION */}
        <section className="spread invite-sec" id="invitation" data-folio="III">
          <div className="wrap">
            <div className="spread-head"><span className="num">III.</span><span className="label">The Invitation</span></div>
            <div className="modal fade">
              <div className="m-mono"><span>I</span></div>
              <h3>Socria <span className="one">One</span></h3>
              <div className="m-price"><span className="amt">$15</span><span className="per">/ month</span></div>
              <p className="m-line">Membership in the complete reasoning environment.</p>
              <ul>
                <li><GlCircle /><em>Deeper thinking</em> — all four depth modes, at your pace.</li>
                <li><GlBranch /><em>Full Thinking Maps</em> — unbounded branching and every view.</li>
                <li><GlSearch /><em>Research</em> — across the whole map, as often as it&rsquo;s needed.</li>
                <li><GlQuill /><em>Advanced Logos tools</em> — Draft Space, long-form, multimodal.</li>
                <li><GlThread /><em>Persistent reasoning</em> — your history and personalization, kept.</li>
                <li><GlLink /><em>Connected context</em> — Drive, Docs, and Notion, when available.</li>
              </ul>
              <button type="button" className="m-cta" onClick={subscribe} disabled={busy}>
                {busy
                  ? 'Opening checkout…'
                  : member
                    ? 'You are a member — open Logos'
                    : 'Become a member — $15/month'}{' '}
                <span className="ar">→</span>
              </button>
              <a className="m-keep" href="/chat?model=logos">continue with the free tier</a>
            </div>
            <p className="m-note">Cancel anytime. Your maps and history remain yours at every tier.</p>
            <div className="colophon">
              <span>Socria · Human-first AI</span>
              <span><a href="/chat?model=logos">Logos</a></span>
              <span className="it">Think For Yourself.</span>
              <span>© {new Date().getFullYear()}</span>
            </div>
          </div>
        </section>
      </main>

      {err && (
        <p className="one-err" role="alert">
          {err} <button type="button" onClick={() => setErr(null)} aria-label="Dismiss" style={{ marginLeft: 8, opacity: 0.7 }}>×</button>
        </p>
      )}
    </div>
  );
}
