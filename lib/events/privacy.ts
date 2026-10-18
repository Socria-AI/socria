// lib/events/privacy.ts — an account's own event registrations, found by
// verified email (attendees need no account, so there is no user id to key
// them by). Used by account export and account deletion.

import 'server-only';
import { supabaseAdmin } from '@/lib/supabase';
import { registrationsForEmails } from './store';
import { syncEvent } from './sheets';

const norm = (emails: string[]) => [...new Set(emails.map((e) => e.trim().toLowerCase()).filter(Boolean))].slice(0, 20);

/** Every registration under these addresses, without the token hash. */
export async function exportRegistrationsForEmails(emails: string[]) {
  const rows = await registrationsForEmails(norm(emails));
  return rows.map(({ token_hash: _t, ...rest }) => rest);
}

/** Delete every registration under these addresses. Throws on a real failure; a missing table is nothing to delete. */
export async function purgeRegistrationsForEmails(emails: string[]): Promise<number> {
  const list = norm(emails);
  if (!list.length) return 0;
  // which events' sheets hold these people, so their rows leave the sheet too
  const events = [...new Set((await registrationsForEmails(list)).map((r) => r.event_id))];
  const { error, count } = await supabaseAdmin().from('event_registrations').delete({ count: 'exact' }).in('email_norm', list);
  if (error) {
    if (['42P01', 'PGRST205'].includes(String(error.code))) return 0;
    throw new Error(`event_registrations: ${error.code ?? 'error'}`);
  }
  for (const id of events) await syncEvent(id).catch(() => undefined);
  return count ?? 0;
}
