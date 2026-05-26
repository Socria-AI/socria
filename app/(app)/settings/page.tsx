// app/(app)/settings/page.tsx
import { auth, currentUser } from '@clerk/nextjs/server';
import { getSupabaseAdmin } from '@/lib/supabase';
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Settings — Socria' };

export default async function Settings() {
  const { userId } = await auth();
  if (!userId) redirect('/sign-in');

  const user = await currentUser();
  const email = user?.emailAddresses?.[0]?.emailAddress || 'unknown';

  const db = getSupabaseAdmin();
  const today = new Date().toISOString().slice(0, 10);

  const { data: usage } = await db
    .from('usage')
    .select('message_count, token_estimate')
    .eq('user_id', userId)
    .eq('date', today)
    .maybeSingle();

  const dailyLimit = parseInt(process.env.DAILY_MESSAGE_LIMIT || '100', 10);
  const used = usage?.message_count || 0;

  return (
    <div className="max-w-2xl mx-auto w-full px-6 py-16 md:py-24">
      <p className="text-xs uppercase tracking-[0.18em] text-moss-700 mb-4">
        Settings
      </p>
      <h1 className="font-serif text-4xl md:text-5xl leading-tight text-ink">
        Your account
      </h1>

      <div className="mt-12 space-y-12">
        <Section title="Identity">
          <Row label="Email" value={email} />
          <Row label="User ID" value={userId} mono />
        </Section>

        <Section title="Usage today">
          <Row label="Messages sent" value={`${used} / ${dailyLimit}`} />
          <Row
            label="Tokens estimated"
            value={String(usage?.token_estimate || 0)}
          />
          <p className="mt-4 text-sm text-ink/50 font-serif italic">
            Limits reset at midnight UTC.
          </p>
        </Section>

        <Section title="Philosophy">
          <p className="text-ink/70 leading-relaxed">
            Socria is designed not to give you answers, but to help you reach
            your own. If you find yourself wishing it would just decide for you
            — that&rsquo;s the signal that you&rsquo;re close to clarity. Stay
            with the question a little longer.
          </p>
        </Section>
      </div>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h2 className="text-[11px] uppercase tracking-[0.18em] text-ink/50 mb-4">
        {title}
      </h2>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function Row({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-6 py-3 border-b border-border last:border-0">
      <span className="text-sm text-ink/60 shrink-0">{label}</span>
      <span
        className={`text-right text-ink/90 ${
          mono ? 'font-mono text-xs' : 'text-sm'
        } truncate`}
      >
        {value}
      </span>
    </div>
  );
}
