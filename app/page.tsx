// app/page.tsx
import Link from 'next/link';
import { SignedIn, SignedOut, SignInButton, UserButton } from '@clerk/nextjs';
import { LandingMotion } from '@/components/LandingMotion';

export default function LandingPage() {
  const year = new Date().getFullYear();

  return (
    <div className="landing-root">
      <div className="progress on-light" aria-hidden="true" />

      <header className="nav">
        <div className="nav-inner">
          <Link className="brand" href="#top" aria-label="Socria home">
            <img src="/socria-logo.png" alt="" />
            <span className="name">Socria</span>
          </Link>
          <div className="nav-right">
            <nav className="nav-links">
              <a href="#what">What is Socria</a>
              <a href="#how">How it works</a>
              <a href="#philosophy">Philosophy</a>
              <Link href="/blog">Blog</Link>
            </nav>
            <SignedOut>
              <SignInButton >
                <button className="nav-signin" type="button">
                  Sign in
                </button>
              </SignInButton>
            </SignedOut>
            <SignedIn>
              <UserButton afterSignOutUrl="/" userProfileMode="navigation" userProfileUrl="/account" />
            </SignedIn>
            <Link href="/chat" className="btn btn-nav">
              Start a thought session <span className="arrow">→</span>
            </Link>
          </div>
        </div>
      </header>

      <main id="top">
        {/* HERO */}
        <section className="hero bg-moss">
          <span className="eyebrow hero-eyebrow reveal">
            <span className="tick" />
            Socria Core 2.0 — Human-first AI
          </span>
          <div className="inner">
            <h1 className="hero-head reveal d1">
              AI that{' '}
              <span className="glyph">
                <svg viewBox="0 0 40 40">
                  <circle
                    cx="20"
                    cy="20"
                    r="16"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="3.5"
                  />
                </svg>
              </span>{' '}
              sharpens your{' '}
              <span className="glyph">
                <svg viewBox="0 0 44 44">
                  <rect
                    x="11"
                    y="11"
                    width="22"
                    height="22"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="3.5"
                    transform="rotate(45 22 22)"
                  />
                </svg>
              </span>{' '}
              thinking.
            </h1>
            <div className="hero-bottom">
              <div className="hero-sub reveal d2">
                <p>
                  Socria helps you reason through ideas, decisions, and
                  uncertainty without outsourcing your thinking.
                </p>
                <p className="hero-note">
                  Free to try. Create a free account to save your sessions
                  across devices.
                </p>
              </div>
              <Link
                href="/chat"
                className="ucard reveal d3"
                aria-label="Start a thought session"
              >
                <span className="thumb" aria-hidden="true">
                  <img src="/socria-logo.png" alt="" />
                </span>
                <span className="meta">
                  <span className="k">Start here · free</span>
                  <span className="v">Start a thought session</span>
                </span>
                <span className="circ" aria-hidden="true">
                  →
                </span>
              </Link>
            </div>
          </div>
        </section>

        {/* SHOWCASE */}
        <section className="showcase">
          <div className="sc-logo">
            <span className="top">The Socria mark</span>
            <img
              className="mark"
              src="/socria-logo.png"
              alt="Socria — light reaching a foundation"
            />
            <span className="cap">Think for yourself.</span>
          </div>
          <div className="sc-product">
            <div className="chat-frame reveal">
              <div className="chat-bar">
                <img src="/socria-logo.png" alt="" />
                <span className="t">Socria</span>
                <span className="status">Thinking with you</span>
              </div>
              <div className="chat-body">
                <div className="msg user">
                  <div className="bubble">
                    I got a job offer with more money. Should I take it?
                  </div>
                </div>
                <div className="msg ai">
                  <div className="av">
                    <img src="/socria-logo.png" alt="" />
                  </div>
                  <div className="bubble">
                    Before the numbers —{' '}
                    <em>what made you open to leaving in the first place?</em>
                  </div>
                </div>
                <div className="msg user">
                  <div className="bubble">
                    Honestly, I&rsquo;ve felt unchallenged lately.
                  </div>
                </div>
                <div className="msg ai">
                  <div className="av">
                    <img src="/socria-logo.png" alt="" />
                  </div>
                  <div className="bubble">
                    Then the real question isn&rsquo;t salary.{' '}
                    <em>
                      Does this role challenge you — or just pay you more to
                      stay comfortable?
                    </em>
                  </div>
                </div>
              </div>
              <div className="chat-foot">
                <div className="field">Type what&rsquo;s actually on your mind…</div>
                <div className="send">→</div>
              </div>
            </div>
          </div>
        </section>

        {/* MARQUEE */}
        <div className="marquee" aria-hidden="true">
          <div className="marquee-track">
            <span className="it">Think for yourself.</span>
            <span className="it">Questions before conclusions.</span>
            <span className="it">Human-first AI.</span>
            <span className="it">Clarity over convenience.</span>
            <span className="it">Don&rsquo;t outsource your mind.</span>
            <span className="it">Think for yourself.</span>
            <span className="it">Questions before conclusions.</span>
            <span className="it">Human-first AI.</span>
            <span className="it">Clarity over convenience.</span>
            <span className="it">Don&rsquo;t outsource your mind.</span>
          </div>
        </div>

        {/* PROBLEM */}
        <section className="block problem bg-paper" id="problem">
          <div className="inner">
            <span className="eyebrow reveal">
              <span className="tick" />
              The problem
            </span>
            <p className="lead reveal d1" style={{ marginTop: 24 }}>
              Many people are using AI to replace thinking rather than
              strengthen it.
            </p>
            <div className="gen-list">
              <div className="gen-item reveal">
                <span className="num">01</span>{' '}
                <span className="v">We generate essays</span>{' '}
                <span className="t">instead of forming arguments.</span>
              </div>
              <div className="gen-item reveal d1">
                <span className="num">02</span>{' '}
                <span className="v">We generate ideas</span>{' '}
                <span className="t">instead of understanding them.</span>
              </div>
              <div className="gen-item reveal d2">
                <span className="num">03</span>{' '}
                <span className="v">We generate decisions</span>{' '}
                <span className="t">instead of reasoning through them.</span>
              </div>
            </div>
          </div>
        </section>

        {/* RISK */}
        <section className="block risk bg-forest">
          <div className="inner">
            <p className="lead reveal">
              The biggest risk of advanced AI isn&rsquo;t artificial
              intelligence.
            </p>
            <p className="punch reveal d1">It&rsquo;s artificial thinking.</p>
          </div>
        </section>

        {/* WHAT */}
        <section className="block what bg-sage" id="what">
          <div className="inner">
            <span className="eyebrow reveal">
              <span className="tick" />
              What is Socria
            </span>
            <div className="what-grid">
              <div>
                <h2 className="section-head reveal d1">
                  Socria is a Human-First AI.
                </h2>
                <p className="lede reveal d1">
                  Instead of giving you conclusions, it helps you think through
                  them.
                </p>
                <p className="body reveal d2">
                  Built on the principles of the Socratic method and
                  metacognition, Socria asks questions, surfaces assumptions,
                  and helps you clarify your own reasoning.
                </p>
              </div>
              <div className="couplet reveal d2">
                <p>It doesn&rsquo;t think for you.</p>
                <p className="b">It helps you think more clearly.</p>
              </div>
            </div>
          </div>
        </section>

        {/* MOVEMENTS */}
        <section className="block movements bg-paper" id="how">
          <div className="inner">
            <div className="mv-head reveal">
              <span className="eyebrow">
                <span className="tick" />
                How Socria works
              </span>
              <h2 className="section-head" style={{ marginTop: 18 }}>
                Four movements of thought.
              </h2>
            </div>
            <div className="mv-layout">
              <div className="mv-sticky">
                <div className="mv-stage">
                  <span className="mv-source" aria-hidden="true" />
                  <div className="mv-track" aria-hidden="true">
                    <div className="mv-track-fill" />
                  </div>
                  <span className="mv-light" aria-hidden="true" />
                  <span className="mv-base" aria-hidden="true" />
                  <span className="mv-num">01 · Reflection</span>
                </div>
              </div>
              <div className="mv-list">
                <div className="mv-item active">
                  <div className="n">01</div>
                  <h3>Reflection</h3>
                  <p>
                    Socria helps you slow down and understand what you&rsquo;re
                    actually trying to solve.
                  </p>
                </div>
                <div className="mv-item">
                  <div className="n">02</div>
                  <h3>Clarification</h3>
                  <p>
                    It identifies vague thinking, hidden assumptions, and
                    unclear reasoning.
                  </p>
                </div>
                <div className="mv-item">
                  <div className="n">03</div>
                  <h3>Exploration</h3>
                  <p>Socria helps you examine ideas from multiple perspectives.</p>
                </div>
                <div className="mv-item">
                  <div className="n">04</div>
                  <h3>Ownership</h3>
                  <p>
                    You arrive at your own conclusions instead of inheriting
                    someone else&rsquo;s.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* USE CASES intro */}
        <section className="block tight bg-paper">
          <div className="inner">
            <span className="eyebrow reveal">
              <span className="tick" />
              What people use Socria for
            </span>
            <h2
              className="section-head reveal d1"
              style={{ marginTop: 18 }}
            >
              The moments worth thinking about.
            </h2>
          </div>
        </section>
        <section className="uc-grid">
          <div className="uc-cell bg-forest reveal">
            <span className="idx">01 / Decisions</span>
            <div>
              <h3>Important decisions</h3>
              <p className="desc">
                Think through uncertainty without outsourcing your judgment.
              </p>
            </div>
          </div>
          <div className="uc-cell bg-gold reveal d1">
            <span className="idx">02 / Creativity</span>
            <div>
              <h3>Writing &amp; creativity</h3>
              <p className="desc">Create with intention rather than generation.</p>
            </div>
          </div>
          <div className="uc-cell bg-sage reveal">
            <span className="idx">03 / Learning</span>
            <div>
              <h3>Learning</h3>
              <p className="desc">Build knowledge instead of memorizing answers.</p>
            </div>
          </div>
          <div className="uc-cell bg-moss reveal d1">
            <span className="idx">04 / Builders</span>
            <div>
              <h3>Founders &amp; builders</h3>
              <p className="desc">Because execution starts with clarity.</p>
            </div>
          </div>
        </section>

        {/* WHY */}
        <section className="block why bg-paper" id="philosophy">
          <div className="inner">
            <span className="eyebrow reveal">
              <span className="tick" />
              Why Socria exists
            </span>
            <p className="big reveal d1" style={{ marginTop: 24 }}>
              Most AI optimizes for speed.{' '}
              <span className="b">Socria optimizes for understanding.</span>
            </p>
            <p className="body reveal d2">
              AI should multiply human thinking, not automate it.
            </p>
            <div className="pair reveal">
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

        {/* FINAL CTA */}
        <section className="block final bg-moss" id="start">
          <div className="inner">
            <img className="mark reveal" src="/socria-logo.png" alt="" />
            <h2 className="reveal d1">
              Don&rsquo;t outsource
              <br />
              your thinking.
              <br />
              <span className="b">Try Socria today.</span>
            </h2>
            <div className="row reveal d2">
              <Link href="/chat" className="btn btn-solid btn-xl">
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
        <div className="foot-top">
          <div>
            <div className="foot-brand">
              <img src="/socria-logo.png" alt="" />
              <span className="name">Socria</span>
            </div>
            <p className="foot-tag">Think for yourself.</p>
          </div>
          <div className="foot-links">
            <a href="#problem">The problem</a>
            <a href="#what">What is Socria</a>
            <a href="#how">How it works</a>
            <a href="#philosophy">Philosophy</a>
            <Link href="/blog">Blog</Link>
          </div>
        </div>
        <div className="foot-bottom">
          <span>© {year} Socria</span>
          <span className="it">Human-first intelligence</span>
        </div>
      </footer>

      <Link
        href="/chat"
        className="floating-cta"
        aria-label="Start a thought session"
      >
        <span className="full">Start a thought session</span>
        <span aria-hidden="true">→</span>
      </Link>

      <LandingMotion />
    </div>
  );
}
