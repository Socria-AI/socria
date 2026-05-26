// app/(marketing)/pricing/page.tsx
import { LinkButton } from '@/components/Button';

export const metadata = { title: 'Pricing — Socria' };

export default function Pricing() {
  return (
    <section className="max-w-5xl mx-auto px-6 py-24 md:py-32">
      <p className="text-xs uppercase tracking-[0.18em] text-moss-700 mb-6">
        Pricing
      </p>
      <h1 className="font-serif text-4xl md:text-6xl leading-tight text-ink max-w-2xl">
        Simple plans. No noise.
      </h1>
      <p className="mt-6 text-lg text-ink/70 max-w-2xl">
        Start free. Upgrade if Socria becomes part of how you think.
      </p>

      <div className="mt-16 grid md:grid-cols-3 gap-6">
        <Plan
          name="Free"
          price="$0"
          tag="Try the practice"
          features={[
            'Daily message limit',
            'Conversation history',
            'Coach + Refine modes',
          ]}
          cta="Start free"
          highlight={false}
        />
        <Plan
          name="Pro"
          price="$12"
          tag="For regular thinkers"
          features={[
            'Generous usage',
            'All modes including Decision Audit',
            'Priority model access',
            'Export conversations',
          ]}
          cta="Join Pro"
          highlight
        />
        <Plan
          name="Studio"
          price="Contact"
          tag="Teams & workshops"
          features={[
            'Shared workspaces',
            'Custom modes',
            'SSO',
            'Usage analytics',
          ]}
          cta="Contact us"
          highlight={false}
        />
      </div>

      <p className="mt-12 text-sm text-ink/50 font-serif italic">
        Pricing is illustrative during the MVP — billing not yet active.
      </p>
    </section>
  );
}

function Plan({
  name,
  price,
  tag,
  features,
  cta,
  highlight,
}: {
  name: string;
  price: string;
  tag: string;
  features: string[];
  cta: string;
  highlight: boolean;
}) {
  return (
    <div
      className={`p-8 rounded-2xl border ${
        highlight
          ? 'border-moss-600 bg-moss-50/40 shadow-[0_1px_0_rgba(0,0,0,0.04)]'
          : 'border-border bg-paper'
      }`}
    >
      <div className="flex items-baseline justify-between">
        <h3 className="font-serif text-2xl text-ink">{name}</h3>
        {highlight && (
          <span className="text-[10px] uppercase tracking-wider text-moss-700">
            Recommended
          </span>
        )}
      </div>
      <p className="mt-2 text-sm text-ink/60">{tag}</p>
      <div className="mt-6">
        <span className="font-serif text-4xl text-ink">{price}</span>
        {price.startsWith('$') && (
          <span className="text-ink/50 ml-1">/mo</span>
        )}
      </div>
      <ul className="mt-6 space-y-2 text-ink/70 text-sm">
        {features.map((f) => (
          <li key={f} className="flex items-start gap-2">
            <span className="text-moss-600 mt-1">—</span>
            <span>{f}</span>
          </li>
        ))}
      </ul>
      <div className="mt-8">
        <LinkButton
          href="/sign-up"
          variant={highlight ? 'primary' : 'secondary'}
          size="sm"
          className="w-full"
        >
          {cta}
        </LinkButton>
      </div>
    </div>
  );
}
