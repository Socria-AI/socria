// app/page.tsx — Socria scrollytelling landing
import Link from 'next/link';
import { SignedIn, SignedOut, SignInButton, UserButton } from '@clerk/nextjs';
import { ScrollyMotion } from '@/components/ScrollyMotion';

export default function LandingPage() {
  const year = new Date().getFullYear();

  return (
    <div className="scrolly-root">
      <div className="thread" aria-hidden="true">
        <span className="rail-line" />
        <span className="fill" />
        <span className="orb" />
      </div>

      <header className="nav">
        <Link className="brand" href="#top" aria-label="Socria home">
          <img src="/socria-logo.png" alt="" />
          <span className="name">Socria</span>
        </Link>
        <div className="nav-right">
          <SignedOut>
            <SignInButton>
              <button type="button" className="nav-signin">
                Sign in
              </button>
            </SignInButton>
          </SignedOut>
          <SignedIn>
            <UserButton afterSignOutUrl="/" userProfileMode="navigation" userProfileUrl="/account" />
          </SignedIn>
          <Link href="/chat" className="btn-nav">
            Try Socria <span className="arrow">→</span>
          </Link>
        </div>
      </header>

      <main id="top">
        {/* SCENE 1 · HERO */}
        <section className="scene s-hero">
          <div className="stack">
            <Link href="/blog" className="announce fade">
              <span className="spark">✦</span> Introducing Socria Core 3
              <span className="new">NEW</span>
              <span className="go">→</span>
            </Link>
            <img
              className="mark fade d1"
              src="/socria-logo.png"
              alt="Socria mark — light reaching a foundation"
            />
            <h1 data-split>
              AI that sharpens <span className="it">your</span> thinking.
            </h1>
            <p className="sub fade d2">
              Socria helps you reason through ideas, decisions, and uncertainty
              — without outsourcing your thinking.
            </p>
          </div>
          <div className="hint">
            <span>Scroll to think</span>
            <span className="ln" />
          </div>
        </section>

        {/* SCENE 2 · PROBLEM (pinned) */}
        <section className="scene pin s-problem" id="problem">
          <div className="stage">
            <div className="inner">
              <span className="kicker">The problem</span>
              <p className="lead" data-split>
                Many people are using AI to replace thinking rather than
                strengthen it.
              </p>
              <div className="gen">
                <p className="gen-line">
                  <span className="no">01</span>{' '}
                  <span className="v">We generate essays</span>{' '}
                  <span className="t">instead of forming arguments.</span>
                </p>
                <p className="gen-line">
                  <span className="no">02</span>{' '}
                  <span className="v">We generate ideas</span>{' '}
                  <span className="t">instead of understanding them.</span>
                </p>
                <p className="gen-line">
                  <span className="no">03</span>{' '}
                  <span className="v">We generate decisions</span>{' '}
                  <span className="t">instead of reasoning through them.</span>
                </p>
              </div>
              <p className="coda">
                The result is a growing dependence on answers without
                understanding.
              </p>
            </div>
          </div>
        </section>

        {/* SCENE 3 · RISK */}
        <section className="scene pin s-risk">
          <div className="stage">
            <div className="inner">
              <p className="lead" data-split>
                The biggest risk of advanced AI isn&rsquo;t artificial
                intelligence.
              </p>
              <p className="punch">It&rsquo;s artificial thinking.</p>
            </div>
          </div>
        </section>

        {/* SCENE 4 · WHAT */}
        <section className="scene s-what" id="what">
          <div className="inner">
            <span className="kicker">What is Socria</span>
            <h2 data-split>Socria is a Human-First AI.</h2>
            <p className="lede fade">
              Instead of giving you conclusions, it helps you think through
              them.
            </p>
            <div className="cols">
              <p className="body fade d1">
                Built on the principles of the Socratic method and
                metacognition, Socria asks questions, surfaces assumptions, and
                helps you clarify your own reasoning.
              </p>
              <div className="couplet fade d2">
                <p>It doesn&rsquo;t think for you.</p>
                <p className="b">It helps you think more clearly.</p>
              </div>
            </div>
          </div>
        </section>

        {/* SCENE 5 · MOVEMENTS (pinned) */}
        <section className="scene pin s-mv" id="how">
          <div className="stage">
            <div className="inner">
              <div className="mv-visual" aria-hidden="true">
                <span className="src" />
                <span className="trk">
                  <span className="trk-fill" />
                </span>
                <span className="lit-dot" />
                <span className="base" />
                <span className="cap">01 · Reflection</span>
              </div>
              <div className="mv-right">
                <span className="kicker">How Socria works</span>
                <div className="mv-steps">
                  <div className="mv-step on">
                    <span className="n">01</span>
                    <h3>Reflection</h3>
                    <p>
                      Socria helps you slow down and understand what
                      you&rsquo;re actually trying to solve.
                    </p>
                  </div>
                  <div className="mv-step">
                    <span className="n">02</span>
                    <h3>Clarification</h3>
                    <p>
                      It identifies vague thinking, hidden assumptions, and
                      unclear reasoning.
                    </p>
                  </div>
                  <div className="mv-step">
                    <span className="n">03</span>
                    <h3>Exploration</h3>
                    <p>Socria helps you examine ideas from multiple perspectives.</p>
                  </div>
                  <div className="mv-step">
                    <span className="n">04</span>
                    <h3>Ownership</h3>
                    <p>
                      You arrive at your own conclusions instead of inheriting
                      someone else&rsquo;s.
                    </p>
                  </div>
                  <div className="mv-progress" aria-hidden="true">
                    <span><i /></span>
                    <span><i /></span>
                    <span><i /></span>
                    <span><i /></span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* SCENE · INTRODUCING CORE 3 (pinned) */}
        <section className="scene pin s-core3" id="core3">
          <div className="stage">
            <div className="c3-head">
              <span className="c3-eyebrow">Introducing · Socria Core 3</span>
              <h2 className="c3-title">
                The next generation of{' '}
                <span className="b">thinking with you.</span>
              </h2>
            </div>
            <div className="c3-scene">
              <div className="c3-features">
                <div className="c3-feat on">
                  <div className="txt">
                    <span className="fno">01 · Adjustable depth</span>
                    <h3>Choose how deep to think.</h3>
                    <p>
                      Four registers, from a quick gut-check to genuinely
                      abstract. Socria matches your pace and your level — never
                      talking down, never showing off.
                    </p>
                    <div className="modes">
                      <span>Quick</span>
                      <span className="dact">Balanced</span>
                      <span>Deep</span>
                      <span>Abstract</span>
                    </div>
                  </div>
                  <div className="c3-viz">
                    <div className="depth-viz">
                      <span className="lvl">Quick</span>
                      <span className="lvl on">Balanced</span>
                      <span className="lvl">Deep</span>
                      <span className="lvl">Abstract</span>
                    </div>
                  </div>
                </div>

                <div className="c3-feat">
                  <div className="txt">
                    <span className="fno">02 · Language noticing</span>
                    <h3>It notices how you say it.</h3>
                    <p>
                      Repeated words, quiet contradictions, the moment certainty
                      creeps in. Core 3 catches the tells in your own language
                      and reflects them back — gently.
                    </p>
                  </div>
                  <div className="c3-viz">
                    <div className="lang-viz">
                      <span className="ln">
                        You keep coming back to the word <em>should</em>.
                      </span>
                      <span className="ln2">
                        You&rsquo;ve moved from <em>I think</em> to{' '}
                        <em>I know</em>.
                      </span>
                    </div>
                  </div>
                </div>

                <div className="c3-feat">
                  <div className="txt">
                    <span className="fno">03 · Progressive synthesis</span>
                    <h3>Your thinking, reflected back.</h3>
                    <p>
                      As a conversation builds, Socria surfaces what it&rsquo;s
                      noticing — the themes, tensions, and assumptions emerging.
                      Never a conclusion. Always your clarity.
                    </p>
                  </div>
                  <div className="c3-viz">
                    <div className="rings">
                      <span className="ring" style={{ width: '74%', aspectRatio: 1 }} />
                      <span className="ring" style={{ width: '50%', aspectRatio: 1 }} />
                      <span className="ring" style={{ width: '27%', aspectRatio: 1 }} />
                    </div>
                    <span
                      className="mono"
                      style={{
                        fontSize: 'clamp(1rem,2vw,1.4rem)',
                        maxWidth: '16ch',
                        textAlign: 'center',
                        lineHeight: 1.3,
                        fontStyle: 'italic',
                      }}
                    >
                      Here&rsquo;s what I&rsquo;m noticing so far…
                    </span>
                  </div>
                </div>

                <div className="c3-feat">
                  <div className="txt">
                    <span className="fno">04 · Thread memory</span>
                    <h3>It remembers how you think.</h3>
                    <p>
                      Every thread carries what matters — your values, tensions,
                      and the way you reason — across the conversation and across
                      every device. Pick up exactly where your thinking left off.
                    </p>
                  </div>
                  <div className="c3-viz">
                    <div className="c3-dots">
                      <span className="d">
                        <img src="/socria-logo.png" alt="" />
                      </span>
                      <span className="lnk" />
                      <span className="d">
                        <img src="/socria-logo.png" alt="" />
                      </span>
                      <span className="lnk" />
                      <span className="d">
                        <img src="/socria-logo.png" alt="" />
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div className="c3-steps" aria-hidden="true">
              <span><i /></span>
              <span><i /></span>
              <span><i /></span>
              <span><i /></span>
            </div>
          </div>
        </section>

        {/* SCENE 6 · TRY IT */}
        <section className="scene s-try" id="try">
          <div className="inner">
            <span className="kicker">Try it</span>
            <h2 data-split>Ask Socria anything. Get a better question back.</h2>
            <p className="sub fade">
              This is the whole product in one exchange — type something
              you&rsquo;re actually weighing, or pick one below.
            </p>
            <div className="try-box fade d1">
              <div className="try-head">
                <img src="/socria-logo.png" alt="" />
                <span className="t">Socria</span>
                <span className="st">Thinking with you</span>
              </div>
              <div className="try-body" id="try-body">
                <p className="try-empty" id="try-empty">
                  Your conversation will appear here.
                </p>
              </div>
              <div className="try-chips">
                <button className="try-chip">
                  Should I take the higher-paying job?
                </button>
                <button className="try-chip">
                  Is my startup idea worth pursuing?
                </button>
                <button className="try-chip">Should I move to a new city?</button>
              </div>
              <div className="try-foot">
                <input
                  id="try-input"
                  type="text"
                  placeholder="Type what's actually on your mind…"
                  aria-label="Ask Socria"
                />
                <button className="try-send" id="try-send" aria-label="Send">
                  →
                </button>
              </div>
            </div>
            <div className="try-cta">
              <Link href="/chat" className="try-cta-link">
                Open the full Socria <span aria-hidden>→</span>
              </Link>
            </div>
          </div>
        </section>

        {/* SCENE · BLOG */}
        <section className="scene s-blog" id="blog">
          <div className="inner">
            <div className="head">
              <div>
                <span className="kicker">From the Socria journal</span>
                <h2 data-split>Notes on thinking.</h2>
              </div>
              <Link href="/blog" className="all fade">
                All writing <span className="go">→</span>
              </Link>
            </div>

            <Link href="/blog" className="blog-feature fade">
              <div className="art">
                <span className="halo" />
                <img className="mark" src="/socria-logo.png" alt="" />
              </div>
              <div className="body">
                <div className="tagrow">
                  Announcement <span className="dt">· July 2026</span>
                </div>
                <h3>Introducing Socria Core 3</h3>
                <p>
                  Adjustable thinking depth, language noticing, progressive
                  synthesis, and thread memory — the biggest step yet toward an
                  AI that strengthens how you think instead of thinking for you.
                </p>
                <span className="read">
                  Read the announcement <span className="go">→</span>
                </span>
              </div>
            </Link>

            <div className="blog-grid">
              <Link href="/blog" className="blog-card">
                <div className="tagrow">
                  Essay <span className="dt">· Jun 2026</span>
                </div>
                <h4>The quiet cost of the instant answer.</h4>
                <p>What we lose when we stop sitting with our own questions.</p>
              </Link>
              <Link href="/blog" className="blog-card">
                <div className="tagrow">
                  Method <span className="dt">· May 2026</span>
                </div>
                <h4>Why Socria asks before it answers.</h4>
                <p>A short primer on the Socratic method behind the product.</p>
              </Link>
              <Link href="/blog" className="blog-card">
                <div className="tagrow">
                  Perspective <span className="dt">· Apr 2026</span>
                </div>
                <h4>Thinking is a skill. Use it or lose it.</h4>
                <p>On cognitive dependency, and designing tools that push back.</p>
              </Link>
            </div>
          </div>
        </section>

        {/* SCENE 7 · WHY */}
        <section className="scene s-why" id="philosophy">
          <div className="inner">
            <span className="kicker">Why Socria exists</span>
            <p className="big" data-split>
              Most AI optimizes for speed.{' '}
              <span className="b">Socria optimizes for understanding.</span>
            </p>
            <div className="pair fade">
              <p>
                The goal isn&rsquo;t to think less.
                <br />
                <span className="b">The goal is to think better.</span>
              </p>
              <p>
                The best AI doesn&rsquo;t replace you.
                <br />
                <span className="b">It helps you become more capable.</span>
              </p>
            </div>
          </div>
        </section>

        {/* SCENE 8 · FINAL */}
        <section className="scene s-final" id="start">
          <div className="glow" aria-hidden="true" />
          <div className="inner">
            <img className="mark fade" src="/socria-logo.png" alt="" />
            <h2 data-split>
              Don&rsquo;t outsource your thinking.{' '}
              <span className="b">Try Socria today.</span>
            </h2>
            <div className="row fade d1">
              <Link href="/chat" className="btn-xl">
                Start thinking with Socria <span className="arrow">→</span>
              </Link>
              <p className="note">
                Free to start. Create an account to save your sessions.
              </p>
            </div>
          </div>
        </section>
      </main>

      <footer>
        <div className="foot">
          <div className="fb">
            <img src="/socria-logo.png" alt="" />
            <span className="name">Socria</span>
          </div>
          <nav>
            <a href="#problem">Problem</a>
            <a href="#core3">Core 3</a>
            <a href="#how">Method</a>
            <a href="#try">Try it</a>
            <Link href="/blog">Blog</Link>
          </nav>
          <span className="tag">Think For Yourself.</span>
          <span>© {year} Socria</span>
        </div>
      </footer>

      <ScrollyMotion />
    </div>
  );
}
