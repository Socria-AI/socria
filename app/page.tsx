// app/page.tsx
import Link from 'next/link';

export default function LandingPage() {
  return (
    <div className="min-h-dvh">
      {/* Top nav */}
      <header className="sticky top-0 z-30 backdrop-blur-md bg-paper/70 border-b border-border/60">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/" className="inline-flex items-baseline gap-2">
            <span className="inline-block w-2.5 h-2.5 rounded-full bg-moss-600 translate-y-[-1px]" />
            <span className="font-serif text-2xl tracking-tight text-ink">
              Socria
            </span>
          </Link>
          <Link
            href="/chat"
            className="inline-flex items-center justify-center font-medium tracking-tight transition-all duration-200 rounded-full bg-moss-600 text-paper hover:bg-moss-700 h-9 px-4 text-sm"
          >
            Try Socria
          </Link>
        </div>
      </header>

      {/* HERO */}
      <section className="relative overflow-hidden">
        <div className="max-w-6xl mx-auto px-6 pt-24 md:pt-32 pb-24 md:pb-40">
          <div className="flex items-center gap-3 mb-8">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-moss-600" />
            <span className="text-xs uppercase tracking-[0.18em] text-ink/60">
              Socria Core 1.0 — Human-first AI
            </span>
          </div>

          <h1
            className="font-serif text-[44px] sm:text-[64px] md:text-[88px] leading-[1.02] tracking-tight text-ink max-w-4xl animate-fade-up"
          >
            AI that <span className="italic text-moss-700">sharpens</span>
            <br />
            your thinking.
          </h1>

          <p
            className="mt-8 text-lg md:text-xl text-ink/70 max-w-2xl leading-relaxed animate-fade-up"
            style={{ animationDelay: '180ms' }}
          >
            Socria helps you reason through ideas, decisions, and uncertainty —
            without outsourcing your thinking.
          </p>

          <div
            className="mt-10 flex flex-wrap items-center gap-3 animate-fade-up"
            style={{ animationDelay: '300ms' }}
          >
            <Link
              href="/chat"
              className="inline-flex items-center justify-center font-medium tracking-tight transition-all duration-200 rounded-full bg-moss-600 text-paper hover:bg-moss-700 h-12 px-7 text-base"
            >
              Start a thought session
            </Link>
          </div>

          <p
            className="mt-20 max-w-xl font-serif italic text-ink/50 text-lg animate-fade-up"
            style={{ animationDelay: '500ms' }}
          >
            &ldquo;The biggest risk of advanced AI is not artificial intelligence.
            It is artificial thinking.&rdquo;
          </p>
        </div>
        <div className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-ink/10 to-transparent" />
      </section>

      {/* PROBLEM */}
      <section className="py-24 md:py-32">
        <div className="max-w-4xl mx-auto px-6">
          <p className="text-xs uppercase tracking-[0.18em] text-moss-700 mb-6">
            The problem
          </p>
          <h2 className="font-serif text-3xl md:text-5xl leading-tight text-ink max-w-3xl">
            Most AI tools quietly replace the part of you that thinks.
          </h2>
          <div className="mt-10 grid md:grid-cols-2 gap-12 text-ink/70 text-lg leading-relaxed">
            <p>
              They optimize for answers and convenience. You ask, they deliver.
              Over time, the muscle that does the reasoning weakens — not
              because anyone planned it, but because nothing demanded it.
            </p>
            <p>
              We&rsquo;re building a generation of people who can prompt fluently
              and reason less. The risk isn&rsquo;t the machine. It&rsquo;s
              what happens to the human when the machine answers for them.
            </p>
          </div>
        </div>
      </section>

      {/* SOLUTION */}
      <section className="py-24 md:py-32 border-t border-border/60">
        <div className="max-w-6xl mx-auto px-6">
          <p className="text-xs uppercase tracking-[0.18em] text-moss-700 mb-6">
            What Socria does differently
          </p>
          <h2 className="font-serif text-3xl md:text-5xl leading-tight text-ink max-w-3xl">
            A different posture: not an answer engine, a thinking partner.
          </h2>

          <div className="mt-16 grid md:grid-cols-3 gap-10">
            <div>
              <div className="font-serif text-moss-700 text-2xl mb-3">01</div>
              <h3 className="font-serif text-2xl text-ink mb-3">
                Socratic dialogue
              </h3>
              <p className="text-ink/70 leading-relaxed">
                Instead of resolving your question, Socria reflects it back —
                sharper, more honest, with the right questions exposed.
              </p>
            </div>
            <div>
              <div className="font-serif text-moss-700 text-2xl mb-3">02</div>
              <h3 className="font-serif text-2xl text-ink mb-3">
                Metacognition
              </h3>
              <p className="text-ink/70 leading-relaxed">
                You don&rsquo;t just think; you notice how you&rsquo;re
                thinking. Socria pulls assumptions and reasoning gaps into the
                open.
              </p>
            </div>
            <div>
              <div className="font-serif text-moss-700 text-2xl mb-3">03</div>
              <h3 className="font-serif text-2xl text-ink mb-3">
                Assumption testing
              </h3>
              <p className="text-ink/70 leading-relaxed">
                Every conclusion sits on a stack of premises. Socria helps you
                find the ones holding the most weight — and the most risk.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* WHY */}
      <section className="py-24 md:py-40 border-t border-border/60">
        <div className="max-w-3xl mx-auto px-6 text-center">
          <p className="text-xs uppercase tracking-[0.18em] text-moss-700 mb-8">
            Why Socria exists
          </p>
          <p className="font-serif text-3xl md:text-5xl leading-[1.15] text-ink">
            The biggest risk of advanced AI is{' '}
            <span className="italic">not</span> artificial intelligence.
          </p>
          <p className="mt-4 font-serif text-3xl md:text-5xl leading-[1.15] text-moss-700">
            It is artificial thinking.
          </p>

          <div className="mt-14 flex justify-center">
            <Link
              href="/chat"
              className="inline-flex items-center justify-center font-medium tracking-tight transition-all duration-200 rounded-full bg-moss-600 text-paper hover:bg-moss-700 h-12 px-7 text-base"
            >
              Start a thought session
            </Link>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="border-t border-border/60">
        <div className="max-w-6xl mx-auto px-6 py-12 flex flex-col md:flex-row md:items-end justify-between gap-8">
          <div>
            <div className="inline-flex items-baseline gap-2">
              <span className="inline-block w-2.5 h-2.5 rounded-full bg-moss-600 translate-y-[-1px]" />
              <span className="font-serif text-2xl tracking-tight text-ink">
                Socria
              </span>
            </div>
            <p className="mt-4 text-sm text-ink/60 max-w-sm font-serif italic">
              Think before the machine.
            </p>
          </div>
        </div>
        <div className="max-w-6xl mx-auto px-6 pb-10 text-xs text-ink/40 flex justify-between">
          <span>© {new Date().getFullYear()} Socria</span>
          <span className="font-serif italic">Human-first intelligence</span>
        </div>
      </footer>
    </div>
  );
}
