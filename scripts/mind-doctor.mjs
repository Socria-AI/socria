#!/usr/bin/env node
// scripts/mind-doctor.mjs
//
// Why is the Mind Graph not working?
//
// Every failure in this subsystem is deliberately silent. recall() swallows
// its own errors so a conversation never breaks because memory did;
// remember() is fire-and-forget for the same reason. That is the right
// posture at runtime and a terrible one when you are standing in front of an
// empty Memory page trying to work out whether the schema was applied, the
// key is wrong, or you are simply new here. All three look identical.
//
// So this asks the questions directly, against whatever environment you point
// it at, and says which of them it is.
//
//   node scripts/mind-doctor.mjs                  # uses .env.local
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/mind-doctor.mjs
//
// It writes one probe row under a reserved user id and deletes it again, so
// it proves the service role can actually WRITE rather than only read — the
// two fail differently and only one of them shows up as an empty page.

import { readFileSync, existsSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

// ── environment ─────────────────────────────────────────────────────

if (existsSync('.env.local')) {
  for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (!m) continue;
    const [, k, raw] = m;
    if (process.env[k] === undefined) {
      process.env[k] = raw.replace(/^["']|["']$/g, '');
    }
  }
}

const red = (s) => `\x1b[31m${s}\x1b[0m`;
const green = (s) => `\x1b[32m${s}\x1b[0m`;
const yellow = (s) => `\x1b[33m${s}\x1b[0m`;
const dim = (s) => `\x1b[2m${s}\x1b[0m`;
const bold = (s) => `\x1b[1m${s}\x1b[0m`;

const problems = [];
const say = (okay, name, detail = '', remedy = '') => {
  console.log(`  ${okay ? green('ok  ') : red('FAIL')}  ${name}${detail ? '  ' + dim(detail) : ''}`);
  if (!okay && remedy) problems.push(remedy);
};

console.log(bold('\nMind Graph doctor\n'));

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const openai = process.env.OPENAI_API_KEY;

console.log(bold('environment'));
say(!!url, 'SUPABASE_URL', url ? new URL(url).host : 'not set',
    'Set SUPABASE_URL. Without it nothing is stored and every page reads empty.');
say(!!key, 'SUPABASE_SERVICE_ROLE_KEY', key ? `${key.slice(0, 8)}… (${key.length} chars)` : 'not set',
    'Set SUPABASE_SERVICE_ROLE_KEY — the SERVICE ROLE key, not the anon key. RLS is on with no policies, so the anon key reads zero rows and looks exactly like an empty graph.');
say(!!openai, 'OPENAI_API_KEY', openai ? 'set' : 'not set',
    'Set OPENAI_API_KEY. Without it the extractor cannot run, so nothing is ever learned — recall still works, but there is never anything to recall.');
console.log(dim(`        extractor model: ${process.env.OPENAI_MODEL_MIND || 'gpt-4o-mini (default)'}`));

if (!url || !key) {
  console.log(red('\nCannot reach the database without both values. Stopping here.\n'));
  for (const p of problems) console.log('  → ' + p);
  console.log('');
  process.exit(1);
}

const db = createClient(url, key, { auth: { persistSession: false } });

// ── the tables ──────────────────────────────────────────────────────

const TABLES = [
  ['mind_nodes', 'the claims themselves — without it nothing is ever remembered'],
  ['mind_edges', 'how claims connect — the graph is a flat list without it'],
  ['mind_tombstones', 'what was deleted — without it deleting is theatre and claims come back'],
  ['mind_pending', 'claims seen once, not yet believed — without it NO trait can ever be learned, because the second sighting has nothing to match'],
  ['mind_sources', 'uploaded files'],
];

console.log(bold('\ntables'));
let missing = 0;
for (const [table, why] of TABLES) {
  const { error, count } = await db.from(table).select('*', { count: 'exact', head: true });
  if (error) {
    missing++;
    const code = (error.code || '').toLowerCase();
    const gone = code === '42p01' || code === 'pgrst205' || /relation .* does not exist/i.test(error.message || '');
    say(false, table, gone ? 'does not exist' : `${error.code || '?'}: ${error.message}`,
        gone
          ? `Apply supabase/schema.sql — ${table} is missing (${why}).`
          : `${table}: ${error.message}. If this says permission denied, the key is not the service role key.`);
  } else {
    say(true, table, `${count ?? 0} rows`);
  }
}

// ── can it actually write? ──────────────────────────────────────────

console.log(bold('\nround trip') + dim('  — a read that works and a write that does not both look like an empty page'));
if (missing) {
  console.log(yellow('  skipped: fix the tables first.'));
} else {
  const probe = '__mind_doctor__';
  const id = `probe_${Date.now().toString(36)}`;
  const now = Date.now();
  let okay = true;

  const ins = await db.from('mind_nodes').insert({
    user_id: probe, id, type: 'Concept', label: 'doctor probe',
    content: 'Written by scripts/mind-doctor.mjs and deleted again.',
    created_at: now, updated_at: now, last_accessed: now,
  });
  say(!ins.error, 'write a node', ins.error ? ins.error.message : 'inserted',
      ins.error ? `Writing to mind_nodes failed: ${ins.error.message}. RLS is forced on these tables; only the service role may write.` : '');
  if (ins.error) okay = false;

  if (okay) {
    const back = await db.from('mind_nodes').select('*').eq('user_id', probe).eq('id', id).maybeSingle();
    const found = !!back.data;
    say(found, 'read it back', found ? 'round trip complete' : 'wrote, but could not read it back',
        'A write that cannot be read back usually means RLS is on for the role in use.');
    if (found) {
      // The columns the graph actually depends on, checked rather than assumed.
      const r = back.data;
      const shape = ['aliases', 'provenance', 'seen', 'activation', 'private', 'status']
        .filter((c) => !(c in r));
      say(!shape.length, 'the row has the columns the code expects',
          shape.length ? `missing: ${shape.join(', ')}` : 'all present',
          'The table exists but predates the current schema. Re-run supabase/schema.sql.');
    }
  }

  await db.from('mind_nodes').delete().eq('user_id', probe);
  const { count: left } = await db.from('mind_nodes')
    .select('*', { count: 'exact', head: true }).eq('user_id', probe);
  say((left ?? 0) === 0, 'clean up after itself', `${left ?? 0} probe rows left`);
}

// ── what is actually in there ───────────────────────────────────────

if (!missing) {
  const { count: nodes } = await db.from('mind_nodes').select('*', { count: 'exact', head: true });
  const { count: pending } = await db.from('mind_pending').select('*', { count: 'exact', head: true });
  const { count: tombs } = await db.from('mind_tombstones').select('*', { count: 'exact', head: true });
  console.log(bold('\nwhat is stored'));
  console.log(`  ${nodes ?? 0} nodes, ${pending ?? 0} pending claims, ${tombs ?? 0} tombstones`);
  if (!nodes && !pending) {
    console.log(dim('  Nothing has been learned yet. If you have chatted on Core 4 since the'));
    console.log(dim('  schema was applied, check the server log for [socria/mind] lines — the'));
    console.log(dim('  extractor runs only for Core 4, only when OPENAI_API_KEY is set, and'));
    console.log(dim('  only AFTER the reply has finished streaming.'));
  } else if (!nodes && pending) {
    console.log(dim('  Claims are being noticed but none has been believed yet. That is the'));
    console.log(dim('  design: a claim about you needs a SECOND, DIFFERENT conversation before'));
    console.log(dim('  it becomes a node. Start a new chat and say it again.'));
  }
}

console.log('');
if (problems.length) {
  console.log(red(bold('what to do')));
  for (const p of problems) console.log('  → ' + p);
  console.log('');
  process.exit(1);
}
console.log(green('Storage is healthy. If memory still looks empty, it is not the database.'));
console.log('');
