// lib/waitlist.ts — the relaunch's waitlist: an email, kept, and handed back as one text file.
//
// No table and no migration: one private Supabase Storage bucket, made on
// first use, with one empty object per address, named by the address itself
// (base64url), so listing the bucket is reading the list — and the same
// address twice is the same object, kept once. The team reads it as
// waitlist.txt from app/api/waitlist/export, behind the developer
// dashboard's own gate.

import 'server-only';
import { supabaseAdmin } from '@/lib/supabase';

export const WAITLIST_BUCKET = 'socria-waitlist';
const DIR = 'entries';

/** An address as kept: trimmed, lower case, and plausibly an address; else null. */
export function cleanEmail(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const e = raw.trim().toLowerCase();
  if (e.length < 6 || e.length > 254) return null;
  return /^[^\s@<>"',;]+@[^\s@<>"',;]+\.[a-z]{2,}$/.test(e) ? e : null;
}

export const nameFor = (email: string) => Buffer.from(email, 'utf8').toString('base64url');
export const emailFrom = (name: string) => {
  try {
    return cleanEmail(Buffer.from(name, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
};

let ready: Promise<void> | null = null;
function ensureBucket(): Promise<void> {
  if (!ready) {
    ready = (async () => {
      const storage = supabaseAdmin().storage;
      const got = await storage.getBucket(WAITLIST_BUCKET);
      if (got.data) return;
      const made = await storage.createBucket(WAITLIST_BUCKET, { public: false });
      if (made.error && !/already exists/i.test(made.error.message)) throw made.error;
    })().catch((e) => {
      ready = null;
      throw e;
    });
  }
  return ready;
}

/** Put an address on the list. Already there is not an error. */
export async function joinWaitlist(email: string): Promise<'added' | 'already'> {
  await ensureBucket();
  const body = new TextEncoder().encode(`${email}\t${new Date().toISOString()}\n`);
  const { error } = await supabaseAdmin()
    .storage.from(WAITLIST_BUCKET)
    .upload(`${DIR}/${nameFor(email)}`, body, { contentType: 'text/plain', upsert: false });
  if (!error) return 'added';
  if (/already exists|duplicate/i.test(error.message)) return 'already';
  throw error;
}

/** The whole list, oldest first: "email<TAB>joined at" per line. */
export async function waitlistText(): Promise<{ text: string; count: number }> {
  await ensureBucket();
  const rows: { email: string; at: string }[] = [];
  for (let offset = 0; offset < 200_000; offset += 1000) {
    const { data, error } = await supabaseAdmin()
      .storage.from(WAITLIST_BUCKET)
      .list(DIR, { limit: 1000, offset, sortBy: { column: 'created_at', order: 'asc' } });
    if (error) throw error;
    for (const f of data ?? []) {
      const email = emailFrom(f.name);
      if (email) rows.push({ email, at: f.created_at ?? '' });
    }
    if (!data || data.length < 1000) break;
  }
  return { text: rows.map((r) => `${r.email}\t${r.at}`).join('\n') + (rows.length ? '\n' : ''), count: rows.length };
}
