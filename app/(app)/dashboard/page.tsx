// app/(app)/dashboard/page.tsx
import { auth } from '@clerk/nextjs/server';
import { getSupabaseAdmin } from '@/lib/supabase';
import Link from 'next/link';
import { NewSessionButton } from '@/components/NewSessionButton';

export const metadata = { title: 'Dashboard — Socria' };
export const dynamic = 'force-dynamic';

export default async function Dashboard() {
  const { userId } = await auth();
  const db = getSupabaseAdmin();

  const { data: conversations } = await db
    .from('conversations')
    .select('id, title, updated_at')
    .eq('user_id', userId!)
    .order('updated_at', { ascending: false })
    .limit(20);

  return (
    <div className="max-w-3xl mx-auto w-full px-6 py-16 md:py-24">
      <p className="text-xs uppercase tracking-[0.18em] text-moss-700 mb-4">
        Dashboard
      </p>
      <h1 className="font-serif text-4xl md:text-5xl leading-tight text-ink">
        What are you thinking through today?
      </h1>
      <p className="mt-4 text-ink/60 font-serif italic">
        Pick up a session, or start a new one.
      </p>

      <div className="mt-10">
        <NewSessionButton />
      </div>

      <div className="mt-16">
        <h2 className="text-[11px] uppercase tracking-[0.18em] text-ink/50 mb-4">
          Recent sessions
        </h2>
        {conversations && conversations.length > 0 ? (
          <ul className="divide-y divide-border border-y border-border">
            {conversations.map((c) => (
              <li key={c.id}>
                <Link
                  href={`/chat/${c.id}`}
                  className="flex items-center justify-between py-4 px-2 hover:bg-moss-50/40 transition-colors group"
                >
                  <span className="text-ink group-hover:text-moss-700 transition-colors">
                    {c.title}
                  </span>
                  <span className="text-xs text-ink/40">
                    {new Date(c.updated_at).toLocaleDateString()}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-ink/50 font-serif italic">
            You haven&rsquo;t started a thought session yet.
          </p>
        )}
      </div>
    </div>
  );
}
