// components/MarketingNav.tsx
import Link from 'next/link';
import { Logo } from './Logo';
import { LinkButton } from './Button';

export function MarketingNav() {
  return (
    <header className="sticky top-0 z-30 backdrop-blur-md bg-paper/70 border-b border-border/60">
      <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
        <Logo />
        <nav className="hidden md:flex items-center gap-8 text-[14px] text-ink/70">
          <Link href="/how-it-works" className="hover:text-ink transition-colors">
            How it works
          </Link>
          <Link href="/pricing" className="hover:text-ink transition-colors">
            Pricing
          </Link>
          <Link href="/sign-in" className="hover:text-ink transition-colors">
            Sign in
          </Link>
        </nav>
        <div className="flex items-center gap-2">
          <LinkButton href="/sign-up" size="sm">
            Try Socria
          </LinkButton>
        </div>
      </div>
    </header>
  );
}
