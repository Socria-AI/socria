// components/MarketingFooter.tsx
import Link from 'next/link';
import { Logo } from './Logo';

export function MarketingFooter() {
  return (
    <footer className="border-t border-border/60 mt-32">
      <div className="max-w-6xl mx-auto px-6 py-12 flex flex-col md:flex-row md:items-end justify-between gap-8">
        <div>
          <Logo />
          <p className="mt-4 text-sm text-ink/60 max-w-sm font-serif italic">
            Think before the machine.
          </p>
        </div>
        <div className="flex flex-wrap gap-x-8 gap-y-2 text-sm text-ink/60">
          <Link href="/how-it-works" className="hover:text-ink">
            How it works
          </Link>
          <Link href="/pricing" className="hover:text-ink">
            Pricing
          </Link>
          <Link href="/sign-in" className="hover:text-ink">
            Sign in
          </Link>
          <Link href="/sign-up" className="hover:text-ink">
            Sign up
          </Link>
        </div>
      </div>
      <div className="max-w-6xl mx-auto px-6 pb-10 text-xs text-ink/40 flex justify-between">
        <span>© {new Date().getFullYear()} Socria</span>
        <span className="font-serif italic">Human-first intelligence</span>
      </div>
    </footer>
  );
}
