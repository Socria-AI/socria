// app/not-found.tsx
import Link from 'next/link';
import { SignedIn, SignedOut, SignInButton, UserButton } from '@clerk/nextjs';

export default function NotFound() {
  const year = new Date().getFullYear();

  return (
    <div className="nf-root bg-moss">
      <header className="nav">
        <div className="nav-inner">
          <Link className="brand" href="/" aria-label="Socria home">
            <img src="/socria-logo.png" alt="" />
            <span className="name">Socria</span>
          </Link>
          <div className="nav-right">
            <nav className="nav-links">
              <Link href="/#what">What is Socria</Link>
              <Link href="/#how">How it works</Link>
              <Link href="/#philosophy">Philosophy</Link>
              <Link href="/blog">Blog</Link>
            </nav>
            <SignedOut>
              <SignInButton mode="modal">
                <button type="button" className="nav-signin">
                  Sign in
                </button>
              </SignInButton>
            </SignedOut>
            <SignedIn>
              <UserButton afterSignOutUrl="/" />
            </SignedIn>
            <Link href="/chat" className="btn btn-nav">
              Start a thought session <span className="arrow">→</span>
            </Link>
          </div>
        </div>
      </header>

      <main className="nf-main">
        <section className="nf-block">
          <img className="nf-mark" src="/socria-logo.png" alt="" />

          <span className="eyebrow in">
            <span className="tick" />
            Error 404 — Page not found
          </span>

          <div className="nf-code in">
            4
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
            </span>
            4
          </div>

          <h1 className="nf-head in">
            This path leads nowhere.{' '}
            <span className="b">So where to next?</span>
          </h1>

          <p className="nf-sub in">
            The page you&rsquo;re looking for doesn&rsquo;t exist — maybe it
            moved, maybe it never did.{' '}
            <span className="serif">
              Either way, a dead end is just a chance to reconsider the
              question.
            </span>
          </p>

          <div className="nf-row in">
            <Link href="/" className="btn btn-solid btn-xl">
              Back to thinking <span className="arrow">→</span>
            </Link>
            <Link href="/chat" className="btn btn-line btn-xl">
              <span>Start a thought session</span>
            </Link>
          </div>

          <div className="nf-paths in">
            <Link className="nf-path" href="/#what">
              <span className="pn">01</span>
              <span className="pt">What is Socria</span>
              <span className="pa" aria-hidden="true">
                →
              </span>
            </Link>
            <Link className="nf-path" href="/#how">
              <span className="pn">02</span>
              <span className="pt">How it works</span>
              <span className="pa" aria-hidden="true">
                →
              </span>
            </Link>
            <Link className="nf-path" href="/#philosophy">
              <span className="pn">03</span>
              <span className="pt">Why it exists</span>
              <span className="pa" aria-hidden="true">
                →
              </span>
            </Link>
          </div>
        </section>
      </main>

      <footer>
        <div
          className="foot-bottom"
          style={{ marginTop: 0, borderTop: 'none', paddingTop: 0 }}
        >
          <span>© {year} Socria</span>
          <span className="it">Think before the machine.</span>
        </div>
      </footer>
    </div>
  );
}
