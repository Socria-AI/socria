#!/usr/bin/env node
// scripts/mr-research-export.mjs — a consented study's MR data, for authorised analysis.
//
//   MR_RESEARCH_SECRET=<≥32 chars> SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… \
//     node scripts/mr-research-export.mjs --study mr-pilot-2027s --out <file.jsonl> --approved
//
// WHAT IT EXPORTS, AND ONLY THAT: for every person whose own settings record
// consent to THIS study (user_profiles.mr.research.studyId — written only by
// the study's approved consent flow, never by the product), the MR ledger rows
// made at or after their consent and inside the ledger's 180-day retention
// window, through lib/mr/research.ts toResearchEvents:
// participants and conversations as HMAC pseudonyms under the study secret,
// days instead of timestamps, and an allow-list of scalar codes. The ledger
// holds no words, so none can leave; the transformation refuses anything that
// is not a code, a number or a boolean even so.
//
// IT REFUSES TO RUN without: a study id that names a study in lib/mr/experiment.ts
// EXPERIMENTS; a secret of at least 32 characters (kept by the research team,
// not in this repository); the service-role credentials (an administrator's);
// and --approved, the analyst's statement that the study's approval covers this
// export. Nothing is written to the database. Nobody is enrolled.
//
// NOT RUN AGAINST A REAL DATABASE in this repository's tests: the
// transformation is (test/mr-research.test.mjs); this file is the wiring.

import { build } from 'esbuild';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = join(here, '..');
const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith('--') ? [...acc, [a.slice(2), all[i + 1]?.startsWith('--') ? true : all[i + 1] ?? true]] : acc), [])
);
const fail = (why) => {
  console.error(`mr-research-export: ${why}`);
  process.exit(2);
};

const study = typeof args.study === 'string' ? args.study : null;
const out = typeof args.out === 'string' ? resolve(args.out) : null;
const secret = process.env.MR_RESEARCH_SECRET ?? '';
if (!study) fail('--study <id> is required');
if (!out) fail('--out <file.jsonl> is required');
if (args.approved !== true) fail('--approved is required: state that the study approval covers this export');
if (secret.length < 32) fail('MR_RESEARCH_SECRET must be at least 32 characters');
if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) fail('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');

// the repository's own transformation and experiment registry, bundled
const BUILD = join(ROOT, 'node_modules', '.cache', 'mr-research-export');
mkdirSync(BUILD, { recursive: true });
await build({
  stdin: {
    contents: `export { toResearchEvents } from './lib/mr/research';\nexport { sanitizeSettings } from './lib/mr/adaptation';\nexport { EXPERIMENTS } from './lib/mr/experiment';\nexport { LEDGER_RETENTION_MS } from './lib/mr/ledger';`,
    resolveDir: ROOT,
    sourcefile: 'export.ts',
    loader: 'ts',
  },
  bundle: true,
  format: 'esm',
  platform: 'node',
  outfile: join(BUILD, 'research.mjs'),
  tsconfig: join(ROOT, 'tsconfig.json'),
  logLevel: 'error',
});
const { toResearchEvents, sanitizeSettings, EXPERIMENTS, LEDGER_RETENTION_MS } = await import(pathToFileURL(join(BUILD, 'research.mjs')).href);
if (!EXPERIMENTS[study]) fail(`no study "${study}" in lib/mr/experiment.ts EXPERIMENTS`);

const { createClient } = await import('@supabase/supabase-js');
const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

// consented participants only: their own settings name this study
const { data: profiles, error: pe } = await db.from('user_profiles').select('user_id, mr').eq('mr->research->>studyId', study);
if (pe) fail(`could not read consent (${pe.code ?? 'error'})`);
const lines = [];
let participants = 0;
// nothing older than the ledger's retention window: such a row is due to be
// purged (lib/mr/store.ts purgeExpired) and is read nowhere else either
const now = Date.now();
for (const p of profiles ?? []) {
  const settings = sanitizeSettings(p.mr);
  if (settings.research?.studyId !== study) continue;
  const since = Math.max(settings.research.consentedAt, now - LEDGER_RETENTION_MS);
  const { data: rows, error } = await db.from('mr_ledger').select('*').eq('user_id', p.user_id).gte('created_at', since).order('created_at', { ascending: true });
  if (error) fail(`could not read the ledger (${error.code ?? 'error'})`);
  const events = toResearchEvents(rows ?? [], { studyId: study, secret, settings, now });
  if (events.length) participants++;
  for (const e of events) lines.push(JSON.stringify(e));
}
writeFileSync(out, lines.join('\n') + (lines.length ? '\n' : ''));
console.log(`mr-research-export: ${lines.length} events from ${participants} consented participant(s) → ${out}`);
