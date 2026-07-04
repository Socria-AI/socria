// components/AuthShell.tsx
// Wraps sign-in / sign-up / account screens with the Socria visual shell:
// paper background, brand mark, optional side copy, and a centered stage
// for the Clerk component.

import Link from 'next/link';
import Image from 'next/image';

export function AuthShell({
  eyebrow,
  title,
  subtitle,
  quote,
  children,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  quote?: { text: string; source?: string };
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-dvh flex flex-col bg-paper text-ink">
      <header className="px-6 md:px-10 py-6 flex items-center justify-between">
        <Link
          href="/"
          className="inline-flex items-center gap-2 group"
          aria-label="Socria home"
        >
          <Image
            src="/socria-logo.png"
            alt=""
            width={28}
            height={28}
            className="transition-transform group-hover:scale-105"
          />
          <span className="font-serif text-2xl tracking-tight text-ink">
            Socria
          </span>
        </Link>
        <Link
          href="/"
          className="text-[13px] text-ink/60 hover:text-ink transition-colors"
        >
          ← Back to home
        </Link>
      </header>

      <main className="flex-1 flex items-stretch justify-center px-6 md:px-10 pb-12 md:pb-16">
        <div className="w-full max-w-6xl grid md:grid-cols-[minmax(0,1fr)_minmax(0,420px)] gap-10 md:gap-16 items-center">
          <div className="hidden md:block">
            {eyebrow && (
              <p className="text-[11px] uppercase tracking-[0.22em] text-moss-700 mb-4 font-medium">
                {eyebrow}
              </p>
            )}
            <h1 className="font-serif text-4xl md:text-5xl lg:text-6xl text-ink leading-[1.05] tracking-tight">
              {title}
            </h1>
            {subtitle && (
              <p className="mt-6 text-lg text-ink/60 leading-relaxed max-w-md">
                {subtitle}
              </p>
            )}
            {quote && (
              <blockquote className="mt-14 border-l-2 border-moss-600/60 pl-5">
                <p className="font-serif italic text-xl md:text-2xl text-moss-700 leading-snug">
                  &ldquo;{quote.text}&rdquo;
                </p>
                {quote.source && (
                  <cite className="mt-3 block text-[13px] text-ink/50 not-italic">
                    {quote.source}
                  </cite>
                )}
              </blockquote>
            )}
          </div>

          <div className="w-full">
            <div className="md:hidden mb-8 text-center">
              {eyebrow && (
                <p className="text-[10px] uppercase tracking-[0.22em] text-moss-700 mb-3 font-medium">
                  {eyebrow}
                </p>
              )}
              <h1 className="font-serif text-3xl text-ink leading-tight">
                {title}
              </h1>
              {subtitle && (
                <p className="mt-3 text-[15px] text-ink/60">{subtitle}</p>
              )}
            </div>
            <div className="socria-clerk-card">{children}</div>
          </div>
        </div>
      </main>

      <footer className="px-6 md:px-10 py-6 text-[12px] text-ink/40 font-serif italic text-center border-t border-border/60">
        Think before the machine.
      </footer>
    </div>
  );
}
