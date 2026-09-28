// The wiring, not the logic.
//
// lib/workspace is pure and tested elsewhere; the rules it enforces are only
// real if the routes and the screens actually go through it. This suite reads
// the source of the surfaces and asserts the things that would silently stop
// being true the next time somebody edits them:
//
//   · every new route refuses an unauthenticated caller and is rate limited
//   · Logos reads durable memory ONLY through the private-filtered scope
//   · the write path's refusals reach the person instead of becoming 500s
//   · a review mark is cleared by the person and by nothing else
//   · an export cannot carry private material
//   · nothing new invented a score

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');

let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? (pass++, console.log('  ok   ' + n)) : (fail++, console.log('  FAIL ' + n + '  ' + x)));

const ROUTES = [
  'app/api/mind/route.ts',
  'app/api/mind/node/route.ts',
  'app/api/mind/edge/route.ts',
  'app/api/mind/stale/route.ts',
  'app/api/workspace/route.ts',
];

console.log('=== nothing here is reachable without an account ===');
for (const r of ROUTES) {
  const src = read(r);
  ok(`${r} — checks who is asking`, /const \{ userId \} = auth\(\);/.test(src));
  ok(`${r} — refuses when nobody is`, /status: 401/.test(src));
  ok(`${r} — rate limited`, /enforceRateLimit\(/.test(src));
  ok(`${r} — runs on node, not the edge`, /runtime = 'nodejs'/.test(src));
  ok(`${r} — scoped to the caller's own rows`, !/\.eq\('user_id', '/.test(src));
}

console.log('\n=== Logos never sees private material ===');
{
  const app = read('components/LogosApp.tsx');
  const mind = read('app/api/mind/route.ts');
  const reads = [...app.matchAll(/'\/api\/mind[^']*'/g)].map((m) => m[0]);
  ok('Logos reads durable memory', reads.length > 0, JSON.stringify(reads));
  ok('  and only through the scoped feed',
    reads.every((r) => r.includes('scope=logos') || r.includes('/api/mind/node')),
    JSON.stringify(reads));
  ok('the scoped feed filters private nodes on the server',
    /scope === 'logos'/.test(mind) && /privateElsewhere\(/.test(mind));
  ok('  and drops the edges that pointed at them',
    /ids\.has\(e\.sourceId\) && ids\.has\(e\.targetId\)/.test(mind));
  ok('  the filter is not left to the browser',
    !/\.filter\(\(n\) => !n\.private\)/.test(app));
  ok('Logos projects with excludePrivate set as well, belt and braces',
    /excludePrivate: true/.test(app));
}

console.log('\n=== the write path is the only way in ===');
{
  const node = read('app/api/mind/node/route.ts');
  const edge = read('app/api/mind/edge/route.ts');
  ok('creating goes through lib/workspace/write', /createNode\(/.test(node) && /workspace\/write/.test(node));
  ok('relating goes through the same place', /relateNodes\(/.test(edge) && /workspace\/write/.test(edge));
  ok('neither writes rows by hand',
    !/from\('mind_nodes'\)\.(insert|upsert)/.test(node) && !/from\('mind_edges'\)\.(insert|upsert)/.test(edge));
  ok('both persist through the diffing store', /persistGraph\(/.test(node) && /persistGraph\(/.test(edge));

  // A refusal carries something to act on; an error code does not.
  ok('a refused create comes back as an answer, not a failure',
    /ok: false, refused: written\.reason/.test(node));
  ok('  and a refused connection too', /ok: false, refused: written\.reason/.test(edge));

  ok('re-asserting something forgotten is explicit, never a default',
    /reassert: body\?\.reassert === true/.test(node));

  const write = read('lib/workspace/write.ts');
  ok('nothing made by hand is marked private', /private: false,/.test(write));
  ok('everything made by hand is recorded as stated by them',
    /kind: 'stated', surface: 'user'/.test(write));
  ok('a tombstone is only ever cleared on the re-assertion path',
    (write.match(/graph\.tombstones\.filter/g) ?? []).length === 1);
}

console.log('\n=== an edit says what it reached, and decides nothing ===');
{
  const node = read('app/api/mind/node/route.ts');
  ok('a correction records what rests on it', /recordImpact\(/.test(node));
  ok('  after the save, so a mark cannot fail the edit',
    node.indexOf('persistGraph(userId, before, after)') < node.indexOf('recordImpact('));
  ok('  and failing to record it is logged, not thrown', /catch \(e\) \{\s*console\.error\('\[socria\/mind\] could not record/.test(node));

  const impact = read('lib/workspace/impact.ts');
  ok('a mark never changes standing', !/epistemic:/.test(impact));
  ok('  and never rewrites a label or content on a claim',
    !/patch: \{ label/.test(impact));
  ok('only the person clears a review mark', /kind === 'review' && by !== 'user'/.test(impact));
  ok('a failed recompute keeps its mark', /failed\.push\(object\.id\)/.test(impact));

  const stale = read('app/api/mind/stale/route.ts');
  ok('clearing a mark touches nothing else', !/persistGraph|challengeNode|status:/.test(stale.replace(/status: \d+/g, '')));
}

console.log('\n=== the workspace as an object ===');
{
  const ws = read('app/api/workspace/route.ts');
  ok('it assembles a projection rather than reading a fourth store',
    /projectMind\(/.test(ws) && !/from\('workspace/.test(ws));
  ok('it writes nothing', !/persistGraph|\.upsert\(|\.insert\(|\.delete\(/.test(ws));
  ok('the file is produced by exportWorkspace, which drops private material',
    /exportWorkspace\(/.test(ws));
  ok('  and can be downloaded with a name somebody can find again',
    /content-disposition/.test(ws) && /socria-workspace-/.test(ws));
  ok('a query only takes the fields it understands',
    /const pick =/.test(ws) && !/const q: Query = \{ \.\.\.body/.test(ws));

  const portable = read('lib/workspace/portable.ts');
  ok('an export refuses private objects', /if \(o\.meta\?\.private\)/.test(portable));
  ok('  and says how many it left out', /omitted: \{ private: dropped \}/.test(portable));
  ok('an import namespaces every id', /const ns = \(id: string\) =>/.test(portable));
  ok('  refuses a file from a later version whole', /if \(version > SCHEMA_VERSION\) return null;/.test(portable));
  ok('  and counts what it could not read', /refused: \{ objects: refusedObjects/.test(portable));
  // The comments say the word; what matters is that no field carries one.
  ok('a query is not ranked', !/\bscore\s*[:=]|\.score\b|relevance\s*[:=]/i.test(portable));
  ok('  and the order is time then id, which is not a ranking',
    /\(b\.modifiedAt \?\? b\.createdAt \?\? 0\) - \(a\.modifiedAt \?\? a\.createdAt \?\? 0\)/.test(portable));
}

console.log('\n=== the screens say what is true ===');
{
  const panel = read('components/ExplorePanel.tsx');
  ok('Trace shows what a node rests on from the structure, not from prose',
    /structure\.upstream/.test(panel) && /structure\.downstream/.test(panel));
  ok('  names the remembered copy separately', /structure\.elsewhere/.test(panel));
  ok('  and a waiting node is unchecked, not wrong',
    /has just not been looked at since/.test(panel) && !/is (now )?wrong/.test(panel));
  ok('keeping is offered only when it is not already remembered',
    /onKeep && !structure\.elsewhere\.length/.test(panel));

  const mem = read('components/mind/MindGraphView.tsx');
  ok('the Memory page can be written to', /MindCompose/.test(mem));
  ok('  asks its questions with the workspace\'s own query', /query\(ws, \{/.test(mem));
  ok('  lists what is waiting on a change', /mem-wait/.test(mem) && /stillHolds\(/.test(mem));
  ok('  says a mark means unchecked rather than wrong', /unchecked/.test(mem));
  ok('  and offers the whole thing as a file', /\/api\/workspace\?download=1/.test(mem));

  const compose = read('components/mind/MindCompose.tsx');
  ok('the composer offers the vocabulary the graph already uses',
    /KNOWN_NODE_TYPES/.test(compose) && /KNOWN_RELATIONSHIPS/.test(compose));
  ok('  while allowing a word of their own', /a word of your own/.test(compose));
  ok('  turns "already there" into an offer to connect', /setOpen\('link'\)/.test(compose));
  ok('  and makes re-asserting something forgotten a deliberate second act',
    /Add it again/.test(compose) && /setReassert\(true\)/.test(compose));
}

console.log('\n=== no scores were invented ===');
for (const f of [
  'lib/workspace/impact.ts',
  'lib/workspace/portable.ts',
  'lib/workspace/write.ts',
  'components/mind/MindCompose.tsx',
]) {
  const src = read(f);
  ok(`${f} — no percentage`, !/toFixed\(|\* 100|%`/.test(src));
  ok(`${f} — no grade, rating or streak`, !/\b(grade|rating|streak|points|xp)\b/i.test(src));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
