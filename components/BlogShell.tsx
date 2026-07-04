'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { SignedIn, SignedOut, SignInButton, UserButton } from '@clerk/nextjs';

export function BlogNav() {
  const pathname = usePathname();
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () =>
      setScrolled((window.scrollY || document.documentElement.scrollTop) > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const onJournal = pathname?.startsWith('/blog');

  return (
    <header className={`nav blognav${scrolled ? ' scrolled' : ''}`}>
      <div className="nav-inner">
        <Link className="brand" href="/" aria-label="Socria home">
          <img src="/socria-logo.png" alt="" />
          <span className="name">Socria</span>
        </Link>
        <div className="nav-right">
          <nav className="nav-links">
            <Link href="/#what">What is Socria</Link>
            <Link href="/#how">How it works</Link>
            <Link href="/blog" className={onJournal ? 'cur' : undefined}>
              Journal
            </Link>
          </nav>
          <SignedOut>
            <SignInButton >
              <button type="button" className="nav-signin">
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
  );
}

export function BlogFooter() {
  return (
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
          <Link href="/#what">What is Socria</Link>
          <Link href="/#how">How it works</Link>
          <Link href="/blog">Journal</Link>
          <Link href="/#philosophy">Philosophy</Link>
        </div>
      </div>
      <div className="foot-bottom">
        <span>© {new Date().getFullYear()} Socria</span>
        <span className="it">Human-first intelligence</span>
      </div>
    </footer>
  );
}
