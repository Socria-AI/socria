#!/usr/bin/env node
// scripts/restore-chats.mjs — give somebody their month back.
//
//   node scripts/restore-chats.mjs whoistobias@gmail.com
//   node scripts/restore-chats.mjs whoistobias@gmail.com --dry
//
// WHY THIS EXISTS. A bug charged people for lines of thinking that never
// happened: the count was spent before the model ran, so a turn that errored
// before saying a word still cost one. Tobias Lasco reported it after two
// failed attempts left him at nothing — "despite none succeeding" — and that
// sentence is the whole bug in four words.
//
// The code is fixed. This is for the accounts the broken version already
// charged, because a fix that leaves people locked out is not a fix. It is a
// one-off operator tool run from a terminal, NOT runtime admin tooling: there
// is no route, no UI and no way to reach it from the product.
//
// WHAT IT DOES, precisely: deletes this person's `logos_usage` rows for the
// `chats` counter. That is the monthly tally plus the per-conversation
// markers. Nothing else in the table, nothing for anyone else, no other
// counter. The next chat they start counts as their first.
//
// WHAT IT NEEDS: CLERK_SECRET_KEY (to turn an email into a user id — the
// usage table keys on Clerk's id, never on an address) and
// SUPABASE_SERVICE_ROLE_KEY + NEXT_PUBLIC_SUPABASE_URL. Run it with
// production's environment, and read the --dry output before running it for
// real.

import { createClerkClient } from '@clerk/backend';
import { createClient } from '@supabase/supabase-js';

const args = process.argv.slice(2);
const dry = args.includes('--dry');
const survey = args.includes('--survey');
const email = args.find((a) => !a.startsWith('--'));

if (!survey && !email) {
  console.error('usage: node scripts/restore-chats.mjs <email> [--dry]');
  console.error('       node scripts/restore-chats.mjs --survey   (read-only: who else is stuck)');
  process.exit(1);
}

const need = (k) => {
  const v = process.env[k];
  if (!v) {
    console.error(`missing ${k} — run this with production's environment`);
    process.exit(1);
  }
  return v;
};

const clerk = createClerkClient({ secretKey: need('CLERK_SECRET_KEY') });
const db = createClient(
  need('NEXT_PUBLIC_SUPABASE_URL'),
  need('SUPABASE_SERVICE_ROLE_KEY'),
  { auth: { persistSession: false } }
);

// --survey: who else is stuck, and how many of them.
//
// Tobias is unlikely to be alone. The broken version charged a line of
// thinking before the model ran, there is no refund path anywhere, and the
// client hard-stops a spent free account before it sends anything — so every
// free user who ever saw an error is sitting behind the same gate until the
// month rolls over. This counts them. It reads and writes nothing.
if (survey) {
  const month = new Date().toISOString().slice(0, 7);
  const { data, error } = await db
    .from('logos_usage')
    .select('user_id, n, scope')
    .eq('counter', 'chats')
    .eq('scope', month);

  if (error) {
    console.error('could not read logos_usage:', error.message);
    process.exit(1);
  }

  const rows = data ?? [];
  // 2 is the free allowance. Anyone at or above it is gated; anyone ABOVE it
  // was charged more times than the limit should have allowed, which is the
  // double-charge bug leaving its fingerprint.
  const atLimit = rows.filter((r) => r.n >= 2);
  const over = rows.filter((r) => r.n > 2);

  console.log(`month           : ${month}`);
  console.log(`accounts with usage : ${rows.length}`);
  console.log(`at or over the free limit (gated) : ${atLimit.length}`);
  console.log(`ABOVE the limit (charged past it) : ${over.length}`);
  if (over.length) {
    console.log('\nthese were charged more than the limit permits — a strong sign the');
    console.log('charge happened without an answer:');
    for (const r of over.slice(0, 50)) console.log(`  ${r.user_id}  n=${r.n}`);
    if (over.length > 50) console.log(`  … and ${over.length - 50} more`);
  }
  console.log('\nNothing was changed. Clear one account with:');
  console.log('  node scripts/restore-chats.mjs <email> --dry');
  process.exit(0);
}

// 1. The address → the account. Clerk's own lookup, so a person who signed in
//    with Google and a person who typed a password resolve the same way.
const { data: users } = await clerk.users.getUserList({ emailAddress: [email] });
if (!users.length) {
  console.error(`no account holds ${email}`);
  process.exit(1);
}
if (users.length > 1) {
  // Refuse rather than guess. Two accounts on one address is rare and worth a
  // human deciding which one to touch.
  console.error(`${users.length} accounts hold ${email} — resolve by hand:`);
  for (const u of users) console.error(`  ${u.id}  created ${new Date(u.createdAt).toISOString()}`);
  process.exit(1);
}

const user = users[0];
const verified = user.emailAddresses.some(
  (e) => e.emailAddress.toLowerCase() === email.toLowerCase() && e.verification?.status === 'verified'
);
console.log(`account : ${user.id}`);
console.log(`address : ${email}${verified ? ' (verified)' : ' (UNVERIFIED — check this is the right person)'}`);

// 2. What is there now, so the operator sees it before anything is deleted.
const { data: rows, error: readErr } = await db
  .from('logos_usage')
  .select('scope, counter, n')
  .eq('user_id', user.id)
  .eq('counter', 'chats');

if (readErr) {
  console.error('could not read logos_usage:', readErr.message);
  process.exit(1);
}

if (!rows?.length) {
  console.log('nothing to restore — this account has no chats rows.');
  process.exit(0);
}

console.log(`\nrows for counter "chats" (${rows.length}):`);
for (const r of rows) console.log(`  ${String(r.scope).padEnd(28)} n=${r.n}`);

if (dry) {
  console.log('\n--dry: nothing was deleted.');
  process.exit(0);
}

// 3. Delete only the chats rows for only this account.
const { error: delErr } = await db
  .from('logos_usage')
  .delete()
  .eq('user_id', user.id)
  .eq('counter', 'chats');

if (delErr) {
  console.error('delete failed:', delErr.message);
  process.exit(1);
}

console.log(`\nrestored. ${email} starts the month again with a full allowance.`);
