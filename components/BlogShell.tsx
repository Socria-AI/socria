'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  SignedIn,
  SignedOut,
  UserButton,
  ClerkLoading,
  ClerkLoaded,
} from '@clerk/nextjs';

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
            <Link href="/#logos">What&rsquo;s new</Link>
            <Link href="/blog" className={onJournal ? 'cur' : undefined}>
              Journal
            </Link>
          </nav>
          <ClerkLoading>
            <Link href="/sign-in" className="nav-signin">
              Sign in
            </Link>
          </ClerkLoading>
          <ClerkLoaded>
            <SignedOut>
              <Link href="/sign-in" className="nav-signin">
                Sign in
              </Link>
            </SignedOut>
            <SignedIn>
              <UserButton afterSignOutUrl="/" userProfileMode="navigation" userProfileUrl="/account" />
            </SignedIn>
          </ClerkLoaded>
          <Link href="/chat" className="btn btn-nav">
            Start a thought session <span className="arrow">→</span>
          </Link>
        </div>
      </div>
    </header>
  );
}

const SOCIALS = [
  {
    label: 'Socria on LinkedIn',
    href: 'https://www.linkedin.com/company/socria',
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M4.98 3.5a2.5 2.5 0 11-.02 5 2.5 2.5 0 01.02-5zM3 9h4v12H3zM9 9h3.8v1.7h.05c.53-1 1.83-2.05 3.77-2.05 4.03 0 4.78 2.65 4.78 6.1V21h-4v-5.4c0-1.29-.02-2.95-1.8-2.95-1.8 0-2.08 1.4-2.08 2.85V21H9z" />
      </svg>
    ),
  },
  {
    label: 'Socria on Instagram',
    href: 'https://instagram.com/socriaai',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <rect x="3" y="3" width="18" height="18" rx="5" />
        <circle cx="12" cy="12" r="4" />
        <circle cx="17.4" cy="6.6" r="1.1" fill="currentColor" stroke="none" />
      </svg>
    ),
  },
  {
    label: 'Socria on TikTok',
    href: 'https://tiktok.com/@socriaai',
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M16.5 3c.3 2.2 1.6 3.6 3.5 3.9v2.6c-1.3.1-2.5-.3-3.6-1v5.9c0 3.2-2.4 5.6-5.5 5.6A5.4 5.4 0 015.5 14c0-3.1 2.7-5.6 6-5.2v2.7c-.4-.1-.8-.2-1.2-.2-1.5 0-2.6 1.2-2.5 2.7 0 1.4 1.2 2.5 2.6 2.5 1.5 0 2.6-1.2 2.6-2.8V3z" />
      </svg>
    ),
  },
];

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
          <div className="foot-socials">
            {SOCIALS.map((s) => (
              <a
                key={s.href}
                href={s.href}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={s.label}
              >
                {s.icon}
              </a>
            ))}
          </div>
        </div>
        <div className="foot-links">
          <Link href="/#logos">What&rsquo;s new: Logos</Link>
          <Link href="/blog">Journal</Link>
          <Link href="/docs">Docs</Link>
          <Link href="/chat">Try Socria</Link>
          <Link href="/studio">Studio</Link>
        </div>
      </div>
      <div className="foot-bottom">
        <span>© {new Date().getFullYear()} Socria</span>
        <span className="it">Human-first intelligence</span>
      </div>
    </footer>
  );
}
