// app/(marketing)/how-it-works/page.tsx
import { LinkButton } from '@/components/Button';

export const metadata = { title: 'How Socria works' };

export default function HowItWorks() {
  return (
    <section className="max-w-3xl mx-auto px-6 py-24 md:py-32">
      <p className="text-xs uppercase tracking-[0.18em] text-moss-700 mb-6">
        How it works
      </p>
      <h1 className="font-serif text-4xl md:text-6xl leading-tight text-ink">
        Thinking, in three movements.
      </h1>
      <p className="mt-6 text-lg text-ink/70 leading-relaxed">
        Socria isn&rsquo;t a smarter answer machine. It&rsquo;s a different
        posture entirely — a calm interlocutor that asks the questions a sharp
        friend would, without finishing your thought for you.
      </p>

      <div className="mt-20 space-y-20">
        <Step
          n="01"
          title="You bring the question."
          body="A decision, a draft, an idea you can&rsquo;t quite see clearly. Socria won&rsquo;t generate one for you from a blank prompt — it asks for your stance first."
        />
        <Step
          n="02"
          title="Socria reflects, then asks."
          body="A brief framing thought. One or two questions. Then a pause — long enough for you to actually think. Most responses are short by design."
        />
        <Step
          n="03"
          title="You stay the thinker."
          body="The conclusion is yours. Socria can clarify concepts, surface assumptions, and audit reasoning — but it won&rsquo;t hand you the ending."
        />
      </div>

      <div className="mt-24 p-10 rounded-2xl border border-border bg-paper">
        <p className="font-serif italic text-xl text-ink/80 leading-relaxed">
          Three modes shape the dialogue: <strong>Coach</strong> for reflection,{' '}
          <strong>Refine</strong> for tightening writing you bring, and{' '}
          <strong>Decision Audit</strong> for stress-testing the choices that
          matter.
        </p>
      </div>

      <div className="mt-16">
        <LinkButton href="/sign-up" size="lg">
          Try Socria
        </LinkButton>
      </div>
    </section>
  );
}

function Step({ n, title, body }: { n: string; title: string; body: string }) {
  return (
    <div className="flex gap-8 items-start">
      <div className="font-serif text-moss-700 text-3xl pt-1 w-12 shrink-0">
        {n}
      </div>
      <div>
        <h2 className="font-serif text-2xl md:text-3xl text-ink mb-3">
          {title}
        </h2>
        <p className="text-ink/70 leading-relaxed text-lg">{body}</p>
      </div>
    </div>
  );
}
