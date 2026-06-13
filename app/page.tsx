// app/page.tsx
import Link from 'next/link';
import { SignedIn, SignedOut, SignInButton, UserButton } from '@clerk/nextjs';
import { Logo } from '@/components/Logo';

// Reusable CTA components — keeps the page consistent and easy to update

function CtaButton({
  size = 'md',
  label = 'Start a thought session',
  href = '/chat',
}: {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  label?: string;
  href?: string;
}) {
  const dims =
    size === 'sm' ? 'h-10 px-5 text-sm' :
    size === 'lg' ? 'h-13 px-8 text-base' :
    size === 'xl' ? 'h-14 px-9 text-lg' :
    'h-12 px-7 text-base';

  return (
    <Link
      href={href}
      className={`inline-flex items-center gap-2 font-medium tracking-tight transition-all duration-200 rounded-full bg-moss-600 text-paper hover:bg-moss-700 hover:-translate-y-px shadow-sm hover:shadow-md ${dims}`}
    >
      {label}
      <span aria-hidden className="transition-transform group-hover:translate-x-0.5">→</span>
    </Link>
  );
}

export default function LandingPage() {
  return (
    <div className="min-h-dvh">
      {/* TOP NAV */}
      <header className="sticky top-0 z-30 backdrop-blur-md bg-paper/70 border-b border-border/60">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <Logo />
          <nav className="hidden md:flex items-center gap-8 text-[14px] text-ink/70">
            <a href="#problem" className="hover:text-ink transition-colors">The problem</a>
            <a href="#what" className="hover:text-ink transition-colors">What is Socria</a>
            <a href="#how" className="hover:text-ink transition-colors">How it works</a>
            <a href="#philosophy" className="hover:text-ink transition-colors">Philosophy</a>
          </nav>
          <div className="flex items-center gap-3">
            <SignedOut>
              <SignInButton mode="modal">
                <button className="text-[14px] text-ink/70 hover:text-ink transition-colors">
                  Sign in
                </button>
              </SignInButton>
            </SignedOut>
            <SignedIn>
              <UserButton afterSignOutUrl="/" />
            </SignedIn>
            <CtaButton size="sm" />
          </div>
        </div>
      </header>

      {/* HERO */}
      <section className="relative overflow-hidden">
        <div className="max-w-6xl mx-auto px-6 pt-24 md:pt-32 pb-24 md:pb-40">
          <div className="flex items-center gap-3 mb-8 animate-fade-up">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-moss-600" />
            <span className="text-xs uppercase tracking-[0.18em] text-ink/60">
              Socria Core 2.0 — Human-first AI
            </span>
          </div>

          <h1
            className="font-serif text-[44px] sm:text-[64px] md:text-[88px] leading-[1.02] tracking-tight text-ink max-w-4xl animate-fade-up"
            style={{ animationDelay: '60ms' }}
          >
            AI that <span className="italic text-moss-700">sharpens</span>
            <br />
            your thinking.
          </h1>

          <p
            className="mt-8 text-lg md:text-xl text-ink/70 max-w-2xl leading-relaxed animate-fade-up"
            style={{ animationDelay: '180ms' }}
          >
            Socria helps you reason through ideas, decisions, and uncertainty
            without outsourcing your thinking.
          </p>

          <p
            className="mt-5 font-serif italic text-lg md:text-xl text-ink/55 max-w-2xl leading-relaxed animate-fade-up"
            style={{ animationDelay: '260ms' }}
          >
            Most AI tools generate answers. Socria helps you arrive at your own.
          </p>

          <div
            className="mt-10 flex flex-wrap items-center gap-3 animate-fade-up"
            style={{ animationDelay: '340ms' }}
          >
            <CtaButton size="xl" label="Try Socria — start a thought session" />
            <a
              href="#what"
              className="inline-flex items-center justify-center font-medium tracking-tight transition-all duration-200 rounded-full bg-transparent text-ink border border-ink/15 hover:border-ink/40 hover:bg-ink/5 h-14 px-7 text-base"
            >
              Learn more
            </a>
          </div>

          <p
            className="mt-6 text-sm text-ink/50 animate-fade-up"
            style={{ animationDelay: '420ms' }}
          >
            Free to try. No sign-up required.
          </p>
        </div>
        <div className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-ink/10 to-transparent" />
      </section>

      {/* THE PROBLEM */}
      <section id="problem" className="py-24 md:py-32">
        <div className="max-w-4xl mx-auto px-6">
          <p className="text-xs uppercase tracking-[0.18em] text-moss-700 mb-6">
            The problem
          </p>
          <h2 className="font-serif text-3xl md:text-5xl leading-tight text-ink max-w-3xl">
            AI is becoming incredibly powerful. But many people are using it to
            replace thinking rather than strengthen it.
          </h2>

          <div className="mt-12 space-y-3 text-lg md:text-xl text-ink/70 leading-relaxed">
            <p>We generate essays instead of forming arguments.</p>
            <p>We generate ideas instead of understanding them.</p>
            <p>We generate decisions instead of reasoning through them.</p>
          </div>

          <p className="mt-12 text-lg text-ink/70 leading-relaxed max-w-3xl">
            The result is a growing dependence on answers without understanding.
          </p>

          <div className="mt-20 pt-16 border-t border-border">
            <p className="font-serif text-3xl md:text-4xl leading-[1.2] text-ink">
              The biggest risk of advanced AI isn&rsquo;t artificial
              intelligence.
            </p>
            <p className="mt-3 font-serif text-3xl md:text-4xl leading-[1.2] text-moss-700 italic">
              It&rsquo;s artificial thinking.
            </p>

            <div className="mt-10">
              <CtaButton label="Start a thought session" />
            </div>
          </div>
        </div>
      </section>

      {/* WHAT IS SOCRIA */}
      <section id="what" className="py-24 md:py-32 border-t border-border/60">
        <div className="max-w-4xl mx-auto px-6">
          <p className="text-xs uppercase tracking-[0.18em] text-moss-700 mb-6">
            What is Socria
          </p>
          <h2 className="font-serif text-3xl md:text-5xl leading-tight text-ink max-w-3xl">
            Socria is a Human-First AI.
          </h2>
          <p className="mt-6 text-xl md:text-2xl text-ink/70 leading-relaxed max-w-3xl font-serif italic">
            Instead of giving you conclusions, it helps you think through them.
          </p>

          <p className="mt-12 text-lg text-ink/70 leading-relaxed max-w-3xl">
            Built on the principles of the Socratic method and metacognition,
            Socria asks questions, surfaces assumptions, and helps you clarify
            your own reasoning.
          </p>

          <div className="mt-12 p-10 rounded-2xl border border-border bg-paper">
            <p className="font-serif text-2xl md:text-3xl leading-tight text-ink">
              It doesn&rsquo;t think for you.
            </p>
            <p className="mt-2 font-serif text-2xl md:text-3xl leading-tight text-moss-700 italic">
              It helps you think more clearly.
            </p>

            <div className="mt-8">
              <CtaButton size="sm" label="Try it now" />
            </div>
          </div>
        </div>
      </section>

      {/* HOW SOCRIA WORKS */}
      <section id="how" className="py-24 md:py-32 border-t border-border/60">
        <div className="max-w-6xl mx-auto px-6">
          <p className="text-xs uppercase tracking-[0.18em] text-moss-700 mb-6">
            How Socria works
          </p>
          <h2 className="font-serif text-3xl md:text-5xl leading-tight text-ink max-w-3xl mb-16">
            Four movements of thought.
          </h2>

          <div className="grid md:grid-cols-2 gap-12 md:gap-x-16 md:gap-y-20">
            <Pillar
              n="01"
              title="Reflection"
              body="Socria helps you slow down and understand what you're actually trying to solve."
            />
            <Pillar
              n="02"
              title="Clarification"
              body="It identifies vague thinking, hidden assumptions, and unclear reasoning."
            />
            <Pillar
              n="03"
              title="Exploration"
              body="Socria helps you examine ideas from multiple perspectives."
            />
            <Pillar
              n="04"
              title="Ownership"
              body="You arrive at your own conclusions instead of inheriting someone else's."
            />
          </div>

          <div className="mt-20 flex flex-wrap items-center gap-4">
            <CtaButton label="Begin your first session" />
            <span className="text-sm text-ink/50">
              Takes 30 seconds to start thinking.
            </span>
          </div>
        </div>
      </section>

      {/* USE CASES */}
      <section className="py-24 md:py-32 border-t border-border/60">
        <div className="max-w-6xl mx-auto px-6">
          <p className="text-xs uppercase tracking-[0.18em] text-moss-700 mb-6">
            What people use Socria for
          </p>
          <h2 className="font-serif text-3xl md:text-5xl leading-tight text-ink max-w-3xl mb-16">
            The moments worth thinking about.
          </h2>

          <div className="grid md:grid-cols-2 gap-px bg-border/60 rounded-2xl overflow-hidden border border-border/60">
            <UseCase
              title="Important decisions"
              sub="Career choices. Business ideas. Life direction."
              body="Think through uncertainty without outsourcing your judgment."
            />
            <UseCase
              title="Writing & creativity"
              sub="Clarify ideas. Strengthen arguments. Develop your own voice."
              body="Create with intention rather than generation."
            />
            <UseCase
              title="Learning"
              sub="Understand concepts through reasoning."
              body="Build knowledge instead of memorizing answers."
            />
            <UseCase
              title="Founders & builders"
              sub="Challenge assumptions. Refine ideas. Think through difficult problems."
              body="Because execution starts with clarity."
            />
          </div>

          <div className="mt-12 text-center">
            <CtaButton size="lg" label="Bring your moment to Socria" />
          </div>
        </div>
      </section>

      {/* WHY SOCRIA EXISTS */}
      <section className="py-24 md:py-32 border-t border-border/60">
        <div className="max-w-4xl mx-auto px-6">
          <p className="text-xs uppercase tracking-[0.18em] text-moss-700 mb-6">
            Why Socria exists
          </p>
          <h2 className="font-serif text-3xl md:text-5xl leading-tight text-ink max-w-3xl">
            Most AI systems optimize for speed.
            <br />
            <span className="text-moss-700 italic">
              Socria optimizes for understanding.
            </span>
          </h2>

          <p className="mt-12 text-lg md:text-xl text-ink/70 leading-relaxed max-w-3xl">
            We believe the future belongs to people who know how to think
            alongside AI rather than surrender their thinking to it.
          </p>

          <div className="mt-12 pt-10 border-t border-border">
            <p className="font-serif text-2xl md:text-3xl text-ink leading-tight">
              The goal isn&rsquo;t to think less.
            </p>
            <p className="mt-2 font-serif text-2xl md:text-3xl text-moss-700 italic leading-tight">
              The goal is to think better.
            </p>

            <div className="mt-10">
              <CtaButton label="Begin thinking better" />
            </div>
          </div>
        </div>
      </section>

      {/* PHILOSOPHY */}
      <section id="philosophy" className="py-24 md:py-32 border-t border-border/60">
        <div className="max-w-3xl mx-auto px-6 text-center">
          <p className="text-xs uppercase tracking-[0.18em] text-moss-700 mb-8">
            The Socria philosophy
          </p>

          <p className="font-serif text-3xl md:text-5xl leading-[1.15] text-ink">
            AI should multiply human thinking,{' '}
            <span className="italic text-moss-700">not automate it.</span>
          </p>

          <p className="mt-10 text-lg md:text-xl text-ink/70 leading-relaxed">
            Technology is most powerful when it strengthens human judgment,
            creativity, and reasoning.
          </p>

          <div className="mt-16 pt-10 border-t border-border">
            <p className="font-serif text-2xl md:text-3xl text-ink leading-tight">
              The best AI is not the one that replaces you.
            </p>
            <p className="mt-2 font-serif text-2xl md:text-3xl text-moss-700 italic leading-tight">
              It&rsquo;s the one that helps you become more capable.
            </p>
          </div>
        </div>
      </section>

      {/* FINAL CTA */}
      <section className="py-24 md:py-40 border-t border-border/60">
        <div className="max-w-3xl mx-auto px-6 text-center">
          <p className="font-serif text-4xl md:text-6xl leading-[1.05] text-ink">
            Don&rsquo;t outsource your thinking.
          </p>
          <p className="mt-4 font-serif text-4xl md:text-6xl leading-[1.05] text-moss-700 italic">
            Try Socria today.
          </p>

          <div className="mt-14 flex justify-center">
            <CtaButton size="xl" label="Start thinking with Socria" />
          </div>

          <p className="mt-6 text-sm text-ink/50">
            Free. No account required. Just bring a question.
          </p>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="border-t border-border/60">
        <div className="max-w-6xl mx-auto px-6 py-12 flex flex-col md:flex-row md:items-end justify-between gap-8">
          <div>
            <Logo />
            <p className="mt-4 text-sm text-ink/60 max-w-sm font-serif italic">
              Think before the machine.
            </p>
          </div>
          <div className="flex flex-wrap gap-x-8 gap-y-2 text-sm text-ink/60">
            <a href="#problem" className="hover:text-ink">The problem</a>
            <a href="#what" className="hover:text-ink">What is Socria</a>
            <a href="#how" className="hover:text-ink">How it works</a>
            <a href="#philosophy" className="hover:text-ink">Philosophy</a>
          </div>
        </div>
        <div className="max-w-6xl mx-auto px-6 pb-10 text-xs text-ink/40 flex justify-between">
          <span>© {new Date().getFullYear()} Socria</span>
          <span className="font-serif italic">Human-first intelligence</span>
        </div>
      </footer>

      {/* Floating persistent CTA — appears bottom-right on all scroll positions */}
      <Link
        href="/chat"
        className="fixed bottom-6 right-6 z-40 inline-flex items-center gap-2 font-medium tracking-tight rounded-full bg-moss-600 text-paper hover:bg-moss-700 hover:-translate-y-0.5 transition-all duration-200 shadow-lg hover:shadow-xl h-12 px-6 text-[15px] backdrop-blur"
        aria-label="Start a thought session"
      >
        <span className="hidden sm:inline">Start a thought session</span>
        <span className="sm:hidden">Start session</span>
        <span aria-hidden>→</span>
      </Link>
    </div>
  );
}

function Pillar({
  n,
  title,
  body,
}: {
  n: string;
  title: string;
  body: string;
}) {
  return (
    <div>
      <div className="font-serif text-moss-700 text-3xl mb-3">{n}</div>
      <h3 className="font-serif text-2xl md:text-3xl text-ink mb-3">{title}</h3>
      <p className="text-ink/70 leading-relaxed text-lg">{body}</p>
    </div>
  );
}

function UseCase({
  title,
  sub,
  body,
}: {
  title: string;
  sub: string;
  body: string;
}) {
  return (
    <div className="bg-paper p-10 hover:bg-moss-50/40 transition-colors">
      <h3 className="font-serif text-2xl text-ink mb-3">{title}</h3>
      <p className="text-ink/60 mb-4 text-[15px]">{sub}</p>
      <p className="text-ink/80 leading-relaxed">{body}</p>
    </div>
  );
}
