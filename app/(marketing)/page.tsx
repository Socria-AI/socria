// app/(marketing)/page.tsx
import { LinkButton } from '@/components/Button';

export default function LandingPage() {
  return (
    <>
      {/* HERO */}
      <section className="relative overflow-hidden">
        <div className="max-w-6xl mx-auto px-6 pt-24 md:pt-32 pb-24 md:pb-40">
          {/* Tiny eyebrow */}
          <div className="flex items-center gap-3 mb-8 animate-fade-in">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-moss-600" />
            <span className="text-xs uppercase tracking-[0.18em] text-ink/60">
              Socria Core 1.0 — Human-first AI
            </span>
          </div>

          <h1
            className="font-serif text-[44px] sm:text-[64px] md:text-[88px] leading-[1.02] tracking-tight text-ink max-w-4xl animate-fade-up"
            style={{ animationDelay: '60ms' }}
          >
            AI that{' '}
            <span className="italic text-moss-700">sharpens</span>
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
            <LinkButton href="/sign-up" size="lg">
              Try Socria
            </LinkButton>
            <LinkButton href="/how-it-works" variant="secondary" size="lg">
              Learn how it works
            </LinkButton>
          </div>

          {/* Quiet philosophical line */}
          <p
            className="mt-20 max-w-xl font-serif italic text-ink/50 text-lg animate-fade-up"
            style={{ animationDelay: '500ms' }}
          >
            “The biggest risk of advanced AI is not artificial intelligence.
            It is artificial thinking.”
          </p>
        </div>

        {/* Decorative diagonal rule */}
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
              and reason less. The risk isn&rsquo;t the machine. It&rsquo;s what
              happens to the human when the machine answers for them.
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
            <Pillar
              kicker="01"
              title="Socratic dialogue"
              body="Instead of resolving your question, Socria reflects it back — sharper, more honest, with the right questions exposed."
            />
            <Pillar
              kicker="02"
              title="Metacognition"
              body="You don&rsquo;t just think; you notice how you&rsquo;re thinking. Socria pulls assumptions and reasoning gaps into the open."
            />
            <Pillar
              kicker="03"
              title="Assumption testing"
              body="Every conclusion sits on a stack of premises. Socria helps you find the ones holding the most weight — and the most risk."
            />
          </div>
        </div>
      </section>

      {/* USE CASES */}
      <section className="py-24 md:py-32 border-t border-border/60">
        <div className="max-w-6xl mx-auto px-6">
          <p className="text-xs uppercase tracking-[0.18em] text-moss-700 mb-6">
            Use it for
          </p>
          <h2 className="font-serif text-3xl md:text-5xl leading-tight text-ink max-w-3xl mb-16">
            The moments worth thinking about.
          </h2>

          <div className="grid md:grid-cols-2 gap-px bg-border/60 rounded-2xl overflow-hidden border border-border/60">
            <UseCase
              title="Important decisions"
              body="Career moves, big purchases, breakups, bets. Socria pressure-tests your reasoning before you commit."
            />
            <UseCase
              title="Writing & idea clarity"
              body="Bring a draft. Socria helps you find what you&rsquo;re actually trying to say — and what&rsquo;s in the way."
            />
            <UseCase
              title="Creative direction"
              body="Stuck between paths? Socria asks the question that makes the right answer obvious, without choosing for you."
            />
            <UseCase
              title="Learning without dependency"
              body="Understand a concept by being asked to apply it — not by being handed a tidy summary you&rsquo;ll forget tomorrow."
            />
          </div>
        </div>
      </section>

      {/* WHY SOCRIA */}
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
            <LinkButton href="/sign-up" size="lg">
              Start a thought session
            </LinkButton>
          </div>
        </div>
      </section>
    </>
  );
}

function Pillar({
  kicker,
  title,
  body,
}: {
  kicker: string;
  title: string;
  body: string;
}) {
  return (
    <div>
      <div className="font-serif text-moss-700 text-2xl mb-3">{kicker}</div>
      <h3 className="font-serif text-2xl text-ink mb-3">{title}</h3>
      <p className="text-ink/70 leading-relaxed">{body}</p>
    </div>
  );
}

function UseCase({ title, body }: { title: string; body: string }) {
  return (
    <div className="bg-paper p-10 hover:bg-moss-50/40 transition-colors">
      <h3 className="font-serif text-2xl text-ink mb-3">{title}</h3>
      <p className="text-ink/70 leading-relaxed">{body}</p>
    </div>
  );
}
