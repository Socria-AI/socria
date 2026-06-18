import Link from 'next/link';
import { SignedIn, SignedOut, SignInButton, UserButton } from '@clerk/nextjs';

export function BlogNav() {
  return (
    <header className="blog-nav">
      <div className="blog-nav-inner">
        <Link className="blog-brand" href="/" aria-label="Socria home">
          <img src="/socria-logo.png" alt="" />
          <span className="name">Socria</span>
        </Link>
        <div className="blog-nav-right">
          <nav className="blog-nav-links">
            <Link href="/">Home</Link>
            <Link href="/blog">Blog</Link>
            <Link href="/chat">Chat</Link>
          </nav>
          <SignedOut>
            <SignInButton mode="modal">
              <button type="button" className="blog-nav-signin">
                Sign in
              </button>
            </SignInButton>
          </SignedOut>
          <SignedIn>
            <UserButton afterSignOutUrl="/" />
          </SignedIn>
          <Link href="/chat" className="blog-nav-cta">
            Start a thought session <span aria-hidden>→</span>
          </Link>
        </div>
      </div>
    </header>
  );
}

export function BlogFoot() {
  return (
    <footer className="blog-foot">
      <span>© {new Date().getFullYear()} Socria</span>
      <span className="it">Think before the machine.</span>
    </footer>
  );
}
